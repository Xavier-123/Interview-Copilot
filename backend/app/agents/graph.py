from typing import Literal
from langgraph.graph import StateGraph, END
from app.agents.state import InterviewState
from app.agents.orchestrator import (
    orchestrator_welcome,
    orchestrator_to_technical,
    orchestrator_to_hr,
    orchestrator_to_qa,
    orchestrator_conclusion
)
from app.agents.technical import technical_node
from app.agents.programmer import programmer_node
from app.agents.hr import hr_node
from app.agents.challenger import challenger_node
from app.agents.management import management_node
from app.agents.persona_node import persona_node, resolve_custom_role, is_persona_key
from app.agents.observer import shadow_observer_node

CUSTOM_INTERVIEWER_NODES = ("technical", "programmer", "hr", "challenger", "management")

def after_observer_route(state: InterviewState) -> str:
    interview_type = state.get("interview_type", "structured")
    stage = state.get("stage", "technical")
    round_count = state.get("round_count", 0)
    max_rounds = state.get("max_rounds", 6)
    tech_target = state.get("tech_rounds_target", 2)
    hr_target = state.get("hr_rounds_target", 1)
    mgmt_target = state.get("mgmt_rounds_target", 3)
    mode = state.get("interview_mode", {})
    style = mode.get("style", "rigorous")
    stress_triggered = state.get("stress_triggered", False)

    # 1. Technical-only interview
    if interview_type == "technical":
        if round_count >= (max_rounds - 1):
            return "orchestrator_to_qa"
        if style == "stress" and not stress_triggered and round_count == 2:
            return "challenger"
        return "technical"

    # 1.5 Programmer comprehensive interview (项目经历 -> 计算机基础 -> 编码题)
    if interview_type == "programmer":
        if round_count >= (max_rounds - 1):
            return "orchestrator_to_qa"
        if style == "stress" and not stress_triggered and round_count == 2:
            return "challenger"
        return "programmer"

    # 2. Behavioral / HR-only interview
    if interview_type in ("behavioral", "hr"):
        if round_count >= (max_rounds - 1):
            return "orchestrator_to_qa"
        return "hr"

    # 3. Management-only interview
    if interview_type == "management":
        if round_count >= (max_rounds - 1):
            return "orchestrator_to_qa"
        if style == "stress" and not stress_triggered and round_count == 2:
            return "challenger"
        return "management"

    # 4. Custom interview（阵容 = 内置角色 key 或自定义人设 key，按轮次轮转）
    if interview_type == "custom":
        if round_count >= (max_rounds - 1):
            return "orchestrator_to_qa"
        next_role = resolve_custom_role(state) or "technical"
        if is_persona_key(next_role):
            return "custom_persona"
        if next_role in CUSTOM_INTERVIEWER_NODES:
            return next_role
        return "technical"

    # 5. Default: Structured / English full-lifecycle interview
    if stage in ("technical", "challenger"):
        if style == "stress" and not stress_triggered and round_count == 1:
            return "challenger"
        if round_count >= tech_target:
            return "orchestrator_to_hr"
        return "technical"
    elif stage == "hr":
        if round_count >= (tech_target + hr_target):
            return "orchestrator_to_qa"
        return "hr"
    elif stage == "management":
        if round_count >= mgmt_target:
            return "orchestrator_to_qa"
        return "management"

    return "orchestrator_to_qa"

def entry_router(state: InterviewState) -> str:
    stage = state.get("stage", "icebreak")
    interview_type = state.get("interview_type", "structured")
    latest_input = state.get("latest_user_input")

    if stage == "icebreak":
        return "orchestrator_welcome"
    elif stage == "self_intro":
        if interview_type == "custom":
            # 自定义面试：首个问题交给出场阵容的第一位（内置角色或自定义人设）
            first_role = resolve_custom_role(state) or "technical"
            if is_persona_key(first_role):
                return "custom_persona"
            if first_role in CUSTOM_INTERVIEWER_NODES:
                return first_role
            return "orchestrator_to_technical"
        if interview_type == "management":
            return "management"
        elif interview_type in ("behavioral", "hr"):
            return "hr"
        elif interview_type == "programmer":
            return "programmer"
        return "orchestrator_to_technical"
    elif stage == "candidate_qa":
        return "orchestrator_conclusion"
    elif stage in ("technical", "programmer", "hr", "challenger", "management", "custom_persona"):
        if latest_input:
            return "shadow_observer"
        return stage

    return "orchestrator_welcome"

def build_interview_graph():
    graph = StateGraph(InterviewState)

    # Register all nodes
    graph.add_node("orchestrator_welcome", orchestrator_welcome)
    graph.add_node("orchestrator_to_technical", orchestrator_to_technical)
    graph.add_node("orchestrator_to_hr", orchestrator_to_hr)
    graph.add_node("orchestrator_to_qa", orchestrator_to_qa)
    graph.add_node("orchestrator_conclusion", orchestrator_conclusion)

    graph.add_node("technical", technical_node)
    graph.add_node("programmer", programmer_node)
    graph.add_node("hr", hr_node)
    graph.add_node("challenger", challenger_node)
    graph.add_node("management", management_node)
    graph.add_node("custom_persona", persona_node)
    graph.add_node("shadow_observer", shadow_observer_node)

    # Transitions
    graph.add_edge("orchestrator_to_technical", "technical")
    graph.add_edge("orchestrator_to_hr", "hr")

    # Interviewer nodes wait for candidate input
    graph.add_edge("orchestrator_welcome", END)
    graph.add_edge("orchestrator_to_qa", END)
    graph.add_edge("orchestrator_conclusion", END)
    graph.add_edge("technical", END)
    graph.add_edge("programmer", END)
    graph.add_edge("hr", END)
    graph.add_edge("challenger", END)
    graph.add_edge("management", END)
    graph.add_edge("custom_persona", END)

    # Observer routes dynamically
    graph.add_conditional_edges("shadow_observer", after_observer_route, {
        "technical": "technical",
        "programmer": "programmer",
        "orchestrator_to_hr": "orchestrator_to_hr",
        "hr": "hr",
        "orchestrator_to_qa": "orchestrator_to_qa",
        "challenger": "challenger",
        "management": "management",
        "custom_persona": "custom_persona"
    })

    # Entry point
    graph.set_conditional_entry_point(entry_router, {
        "orchestrator_welcome": "orchestrator_welcome",
        "orchestrator_to_technical": "orchestrator_to_technical",
        "orchestrator_conclusion": "orchestrator_conclusion",
        "shadow_observer": "shadow_observer",
        "technical": "technical",
        "programmer": "programmer",
        "hr": "hr",
        "challenger": "challenger",
        "management": "management",
        "custom_persona": "custom_persona"
    })

    return graph.compile()

interview_app = build_interview_graph()
