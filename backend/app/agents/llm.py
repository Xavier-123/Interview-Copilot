import ipaddress
import json
import logging
import re
import socket
from typing import Optional, Dict, Any, List
from urllib.parse import urlparse
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)


def _is_base_url_allowed(base_url: str) -> bool:
    """客户端自定义 base_url 的 SSRF 防护校验。

    规则：
    - 仅接受 http/https 且带主机名；
    - 命中服务端 allowlist（LLM_BASE_URL_ALLOWLIST，域名或域名后缀）直接放行，
      供本地 Ollama / 内网自建网关等场景由运维显式开启；
    - 其余主机解析出的所有 IP 必须都是公网地址：私有网段、回环、链路本地
      （含云平台 metadata 169.254.169.254）、保留、组播地址一律拒绝；
      198.18/15（RFC 2544 基准网段，Clash 等 fake-ip 代理 DNS 的惯用假 IP 池，
      不承载任何真实服务或 metadata）视为无法判断而放行，避免误杀代理环境；
    - 主机名解析失败时放行：请求本身也会失败，且避免代理/受限 DNS 环境误杀
      公网端点；字面量内网 IP 不经过解析，仍会被上面一条拦住。
    """
    try:
        parsed = urlparse(base_url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    host = parsed.hostname.lower()

    allowlist = [h.strip().lower() for h in settings.LLM_BASE_URL_ALLOWLIST.split(",") if h.strip()]
    if any(host == entry or host.endswith("." + entry) for entry in allowlist):
        return True

    if (
        host == "localhost"
        or "." not in host  # 无点单标签主机名只能经内网 DNS/搜索域解析
        or host.endswith((".localhost", ".local", ".internal", ".corp", ".home", ".lan", ".arpa"))
    ):
        return False

    try:
        addr_infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, OSError):
        # 解析不出任何地址：后续请求自然失败，按放行处理（不误杀代理/受限 DNS 环境下的公网端点）
        return True

    # 100.64/10（运营商级 NAT，含阿里云 metadata 100.100.100.200）在部分
    # Python 版本里不算 is_private；198.18/15 是 fake-ip 代理 DNS 的假 IP 池，
    # 不承载真实服务，视为无法判断而非内网
    SHARED_SPACE_V4 = ipaddress.ip_network("100.64.0.0/10")
    FAKE_IP_V4 = ipaddress.ip_network("198.18.0.0/15")
    for info in addr_infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if ip.version == 4 and ip in FAKE_IP_V4:
            continue
        in_shared_space = ip.version == 4 and ip in SHARED_SPACE_V4
        if (
            in_shared_space
            or ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return False
    return True


def _clean_llm_text(text: Any) -> Any:
    """清洗模型文本输出：去掉首尾空白行，并把 3 个以上连续换行压缩成一个空行。

    前端气泡按 whitespace-pre-wrap 原样渲染，模型输出的开头空行/大片空行会
    直接显示为面试官对话框里的一段长换行，故在统一出口处归一。
    """
    if not isinstance(text, str):
        return text
    normalized = re.sub(r"[ \t]+\n", "\n", text.strip())
    return re.sub(r"\n{3,}", "\n\n", normalized)

class LLMError(RuntimeError):
    """模型调用链路的统一异常基类。

    public_message 是可直接回显给用户的说明（已脱敏），
    上层 API 据此返回明确错误，而不是降级成示例数据。
    """

    def __init__(self, public_message: str, cause: Optional[BaseException] = None):
        super().__init__(public_message)
        self.public_message = public_message
        self.cause = cause


class LLMUnavailableError(LLMError):
    """模型服务不可用：未配置，或已配置但调用失败。"""


class LLMResponseError(LLMError):
    """模型有响应但内容不可用（例如返回的不是合法 JSON）。"""


_SECRET_RE = re.compile(r"(sk-[A-Za-z0-9._\-]{4,}|Bearer\s+[A-Za-z0-9._\-]{4,})", re.IGNORECASE)

_PLACEHOLDER_KEYS = ("", "mock-key", "your_api_key_here")


def _redact(value: object) -> str:
    """抹掉异常文本里的密钥痕迹，避免回显到页面或日志。"""
    return _SECRET_RE.sub("***", str(value or ""))


def _is_placeholder_key(api_key: object) -> bool:
    return str(api_key or "").strip() in _PLACEHOLDER_KEYS


class LLMService:
    def __init__(self):
        self._client: Optional[ChatOpenAI] = None
        self._config_error: Optional[str] = None

        if _is_placeholder_key(settings.LLM_API_KEY):
            self._config_error = (
                "后端未配置模型服务：请在页面「模型配置」中填写 API Key，"
                "或在 backend/.env 中设置 LLM_API_KEY 后重启后端"
            )
        else:
            try:
                self._client = ChatOpenAI(
                    model=settings.LLM_MODEL,
                    api_key=settings.LLM_API_KEY,
                    base_url=settings.LLM_BASE_URL,
                    temperature=settings.LLM_TEMPERATURE,
                )
            except Exception as e:
                logger.error(f"Failed to initialize ChatOpenAI: {_redact(e)}")
                self._config_error = f"后端模型服务初始化失败（{_redact(e)}）"

        # Client cache for per-request (frontend-provided) LLM configs
        self._custom_clients: Dict[tuple, ChatOpenAI] = {}

    @staticmethod
    def _valid_custom_config(llm_config: Optional[Dict[str, Any]]) -> bool:
        if not isinstance(llm_config, dict):
            return False
        api_key = str(llm_config.get("api_key") or "").strip()
        return bool(api_key) and api_key not in ("mock-key", "your_api_key_here")

    def _get_custom_client(self, llm_config: Dict[str, Any]) -> Optional[ChatOpenAI]:
        model = str(llm_config.get("model") or settings.LLM_MODEL)
        api_key = str(llm_config.get("api_key")).strip()
        base_url = str(llm_config.get("base_url") or "").strip() or None
        if base_url and not _is_base_url_allowed(base_url):
            logger.warning(f"Rejected custom LLM base_url by SSRF protection: {base_url}")
            return None
        try:
            temperature = float(llm_config.get("temperature", settings.LLM_TEMPERATURE))
        except (TypeError, ValueError):
            temperature = settings.LLM_TEMPERATURE

        cache_key = (api_key, base_url, model, temperature)
        if cache_key not in self._custom_clients:
            try:
                self._custom_clients[cache_key] = ChatOpenAI(
                    model=model,
                    api_key=api_key,
                    base_url=base_url,
                    temperature=temperature,
                )
            except Exception as e:
                logger.warning(f"Failed to initialize custom ChatOpenAI: {_redact(e)}. Falling back to server config.")
                return None
        return self._custom_clients[cache_key]

    @staticmethod
    def _normalize(resp: AIMessage) -> AIMessage:
        resp.content = _clean_llm_text(resp.content)
        return resp

    async def invoke(self, messages: List[BaseMessage], llm_config: Optional[Dict[str, Any]] = None) -> AIMessage:
        """调用模型，失败即抛错——不再返回任何占位或示例数据。

        顺序：请求级（浏览器）配置优先 → 调用失败则回退服务端配置重试
        → 仍失败（或服务端未配置）则抛 LLMUnavailableError，
        由 API 层转成明确的用户反馈。
        """
        custom_failure: Optional[str] = None

        if self._valid_custom_config(llm_config):
            client = self._get_custom_client(llm_config)
            if client is not None:
                try:
                    return self._normalize(await client.ainvoke(messages))
                except Exception as e:
                    logger.error(f"Custom-config LLM call failed, falling back to server config: {_redact(e)}")
                    custom_failure = f"页面配置的模型调用失败（{_redact(e)[:160]}）"
            else:
                custom_failure = "页面配置的模型服务不可用（Base URL 被拒绝或客户端初始化失败）"

        if self._client is not None:
            try:
                return self._normalize(await self._client.ainvoke(messages))
            except Exception as e:
                logger.error(f"Server-config LLM call failed: {_redact(e)}")
                raise LLMUnavailableError(
                    self._failure_message(
                        custom_failure,
                        f"服务端配置的模型调用失败（{_redact(e)[:160]}）",
                    ),
                    cause=e,
                ) from e

        raise LLMUnavailableError(
            self._failure_message(custom_failure, self._config_error or "没有可用的模型服务配置")
        )

    @staticmethod
    def _failure_message(*parts: Optional[str]) -> str:
        details = [p for p in parts if p]
        joined = "；".join(details) if details else "模型服务不可用"
        return f"{joined}。请检查 API Key、Base URL 与网络连接后重试。"


llm_service = LLMService()
