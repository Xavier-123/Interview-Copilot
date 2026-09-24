import os
from pathlib import Path
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ 目录的绝对路径（Docker 容器内解析为 /app）。
# 所有相对的数据路径（sqlite 数据库、上传目录、人设目录）一律锚定到这里，
# 与启动服务时的工作目录无关，避免在错误目录启动时分裂出第二份数据。
BASE_DIR = Path(__file__).resolve().parents[2]


def _anchor_sqlite_url(url: str) -> str:
    """把相对路径的 sqlite URL 改写为锚定 BASE_DIR 的绝对路径；绝对路径原样返回。"""
    for scheme in ("sqlite+aiosqlite:///", "sqlite:///"):
        if not url.startswith(scheme):
            continue
        raw_path = url[len(scheme):]
        # "/..." 是 POSIX 绝对路径，"X:..." 是 Windows 盘符绝对路径，":memory:" 是内存库
        if not raw_path or raw_path.startswith("/") or raw_path[1:2] == ":" or raw_path == ":memory:":
            return url
        resolved = (BASE_DIR / raw_path).resolve()
        return f"{scheme}{resolved.as_posix()}"
    return url


def _anchor_dir(value: str) -> str:
    """把相对目录锚定到 BASE_DIR；绝对目录原样返回。"""
    path = Path(value)
    if path.is_absolute():
        return value
    return str((BASE_DIR / path).resolve())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    PROJECT_NAME: str = "Interview-Copilot"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"

    # LLM Settings (OpenAI / DeepSeek / Qwen / Moonshot compatible)
    # 必须配置真实密钥；留空时模型调用会直接报错，不再降级为示例数据。
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", os.getenv("OPENAI_API_KEY", ""))
    LLM_BASE_URL: Optional[str] = os.getenv("LLM_BASE_URL", os.getenv("OPENAI_BASE_URL", None))
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o")
    LLM_TEMPERATURE: float = 0.7
    # 客户端自定义 LLM base_url 的 SSRF 防护：默认只允许公网地址。
    # 逗号分隔的域名/域名后缀白名单，用于显式放行内网自建网关（如本地 Ollama）：
    # 例：LLM_BASE_URL_ALLOWLIST="localhost,my-llm.internal.corp,volces.com"
    LLM_BASE_URL_ALLOWLIST: str = os.getenv("LLM_BASE_URL_ALLOWLIST", "")

    # Optional server-side default for real web search. Per-request credentials
    # take precedence and are never persisted.
    TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./interview_copilot.db")

    # Uploads
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")

    # Personas（自建面试官）：每个角色一个独立 JSON 文件
    PERSONA_DATA_DIR: str = os.getenv("PERSONA_DATA_DIR", "./data/personas")
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024
    MAX_TEXT_BYTES: int = 100 * 1024
    MAX_ANSWER_BYTES: int = 20 * 1024

    # Security & CORS
    CORS_ORIGINS: list[str] = ["*"]

    # 相对路径统一锚定到 backend/ 目录：从任何工作目录启动，数据库与数据文件
    # 的落点都相同；脚本注入的绝对路径（如隔离的 simulation.db）不受影响。
    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def _anchor_db_url(cls, v: str) -> str:
        return _anchor_sqlite_url(v)

    @field_validator("UPLOAD_DIR", "PERSONA_DATA_DIR", mode="after")
    @classmethod
    def _anchor_data_dirs(cls, v: str) -> str:
        return _anchor_dir(v)

    @property
    def llm_configured(self) -> bool:
        """服务端是否配置了可用的模型密钥（占位值视为未配置）。"""
        return str(self.LLM_API_KEY or "").strip() not in ("", "mock-key", "your_api_key_here")

settings = Settings()
