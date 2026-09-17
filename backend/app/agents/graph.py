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
from app.agents.hr import hr_node
from app.agents.challenger import challenger_node
from app.agents.observer import shadow_observer_node

def after_observer_route(state: InterviewState) -> str:
    stage = state.get("stage", "technical")
    round_count = state.get("round_count", 0)
    tech_target = state.get("tech_rounds_target", 2)
    hr_target = state.get("hr_rounds_target", 1)
    mode = state.get("interview_mode", {})
    style = mode.get("style", "rigorous")
    stress_triggered = state.get("stress_triggered", False)

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
    
    return "orchestrator_to_qa"

def entry_router(state: InterviewState) -> str:
    stage = state.get("stage", "icebreak")
    latest_input = state.get("latest_user_input")

    if stage == "icebreak":
        return "orchestrator_welcome"
    elif stage == "self_intro":
        return "orchestrator_to_technical"
    elif stage == "candidate_qa":
        return "orchestrator_conclusion"
    elif stage in ("technical", "hr", "challenger"):
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
    graph.add_node("hr", hr_node)
    graph.add_node("challenger", challenger_node)
    graph.add_node("shadow_observer", shadow_observer_node)

    # Transitions after transitions
    graph.add_edge("orchestrator_to_technical", "technical")
    graph.add_edge("orchestrator_to_hr", "hr")

    # Interviewer nodes wait for candidate
    graph.add_edge("orchestrator_welcome", END)
    graph.add_edge("orchestrator_to_qa", END)
    graph.add_edge("orchestrator_conclusion", END)
    graph.add_edge("technical", END)
    graph.add_edge("hr", END)
    graph.add_edge("challenger", END)

    # Observer routes dynamically based on progress
    graph.add_conditional_edges("shadow_observer", after_observer_route, {
        "technical": "technical",
        "orchestrator_to_hr": "orchestrator_to_hr",
        "hr": "hr",
        "orchestrator_to_qa": "orchestrator_to_qa",
        "challenger": "challenger"
    })

    # Entry point
    graph.set_conditional_entry_point(entry_router, {
        "orchestrator_welcome": "orchestrator_welcome",
        "orchestrator_to_technical": "orchestrator_to_technical",
        "orchestrator_conclusion": "orchestrator_conclusion",
        "shadow_observer": "shadow_observer",
        "technical": "technical",
        "hr": "hr",
        "challenger": "challenger"
    })

    return graph.compile()

interview_app = build_interview_graph()
