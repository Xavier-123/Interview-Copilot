"""Single output boundary for interviewer messages.

During migration the existing role nodes remain responsible for their mature
Prompt/RAG behavior.  The Speaker is the only graph node reached after
planning, so future role implementations can be moved behind this boundary
without changing the session API or frontend identity model.
"""

from typing import Awaitable, Callable, Dict

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


SpeakerHandler = Callable[[InterviewState], Awaitable[dict]]


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

    # Preserve the selected identity for the UI and tracing even when a legacy
    # role node only returns its historical fields.
    result.setdefault("current_interviewer", state.get("current_interviewer", target))
    result["next_node"] = target
    result["interviewer_id"] = target
    result["interviewer_version"] = state.get("interviewer_version", "legacy-v1")
    return result
