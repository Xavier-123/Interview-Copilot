"""Single output boundary for interviewer messages.

During migration the existing role nodes remain responsible for their mature
Prompt/RAG behavior.  The Speaker is the only graph node reached after
planning, so future role implementations can be moved behind this boundary
without changing the session API or frontend identity model.
"""

from typing import Awaitable, Callable, Dict

from langchain_core.messages import SystemMessage, HumanMessage

from app.agents.state import InterviewState
from app.agents.orchestrator import (
    orchestrator_to_hr,
    orchestrator_to_qa,
)
from app.agents.technical import technical_node
from app.agents.programmer import programmer_node
from app.agents.hr import hr_node
from app.agents.challenger import challenger_node
from app.agents.management import management_node
from app.agents.persona_node import persona_node
from app.agents.llm import llm_service


SpeakerHandler = Callable[[InterviewState], Awaitable[dict]]


def _count_questions(text: str) -> int:
    return (text or "").count("？") + (text or "").count("?")


_COMPRESS_SYSTEM_PROMPT = (
    "你是面试现场的面试官。下面这段你正准备说出口的话包含了超过 2 个问号（问题堆叠），"
    "会压得候选人喘不过气。请把它压缩为最多 2 个问题点的口语版本：保留开头对候选人刚才回答的反馈（1 句），"
    "保留最核心的那个追问方向，删除其余子问。直接输出压缩后的发言正文，不要任何解释、引号或 markdown。"
)


async def _compress_overlong_question(state: InterviewState, content: str) -> str:
    """问题堆叠（>2 问）时压缩重写一次；失败则原样返回，不阻塞面试流程。"""
    try:
        resp = await llm_service.invoke(
            [SystemMessage(content=_COMPRESS_SYSTEM_PROMPT), HumanMessage(content=content)],
            llm_config=state.get("llm_config"),
        )
        text = (resp.content or "").strip()
        if text and _count_questions(text) <= 2:
            return text
    except Exception:  # noqa: BLE001
        pass
    return content


HANDLERS: Dict[str, SpeakerHandler] = {
    "orchestrator_to_hr": orchestrator_to_hr,
    "orchestrator_to_qa": orchestrator_to_qa,
    "technical": technical_node,
    "programmer": programmer_node,
    "hr": hr_node,
    "challenger": challenger_node,
    "management": management_node,
    "custom_persona": persona_node,
}


async def speaker_node(state: InterviewState) -> dict:
    target = state.get("next_interviewer") or state.get("next_node") or "technical"
    handler = HANDLERS.get(target, technical_node)
    result = await handler(state)

    # Backwards-compatible phase handoff: the legacy graph emitted the
    # transition message and immediately asked the first HR question in the
    # same invocation. Keep that user-visible behavior while routing both
    # operations through this single output boundary.
    if target == "orchestrator_to_hr":
        handoff_state = dict(state)
        handoff_state.update(result)
        hr_result = await hr_node(handoff_state)
        result = dict(hr_result)
        result["messages"] = list(result.get("messages", []))
        transition_messages = (handoff_state.get("messages") or [])[-1:]
        if transition_messages:
            result["messages"] = transition_messages + result["messages"]

    # 问题堆叠守门：单轮发言超过 2 个问号时压缩重写一次（prompt 约束模型执行不稳定）
    last_msg = None
    for m in reversed(result.get("messages") or []):
        if m.get("role") == "assistant" and (m.get("content") or "").strip():
            last_msg = m
            break
    if last_msg is not None and _count_questions(last_msg["content"]) > 2:
        last_msg["content"] = await _compress_overlong_question(state, last_msg["content"])

    # Preserve the selected identity for the UI and tracing even when a legacy
    # role node only returns its historical fields.
    result.setdefault("current_interviewer", state.get("current_interviewer", target))
    result["next_node"] = target
    result["interviewer_id"] = target
    result["interviewer_version"] = state.get("interviewer_version", "legacy-v1")
    return result
