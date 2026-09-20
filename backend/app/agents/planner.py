"""Structured question planning for the online interview loop.

The planner deliberately returns data, not user-facing prose.  Existing
specialist prompts remain the rendering layer during the migration, while the
Director owns routing and this module owns the per-turn intent contract.
"""

from typing import Any, Dict

from app.agents.state import InterviewState, QuestionIntent


def build_question_intent(state: InterviewState, next_node: str) -> QuestionIntent:
    action = state.get("dig_action", "INIT")
    topic = state.get("current_topic")
    answer_status = state.get("last_answer_status", "unknown")
    difficulty = state.get("difficulty", "standard")

    goal_by_action = {
        "INIT": "建立候选人的基础能力画像并选择首个考察方向",
        "DEEP_DIVE": "验证候选人对当前主题的底层机制、边界和取舍理解",
        "PROBE_WEAKNESS": "补齐当前回答缺失的事实、动作、依据或量化结果",
        "BREAK_ROUTINE": "通过非标准场景验证候选人是否真正理解而非背诵",
        "SWITCH_TOPIC": "切换到新的岗位相关考察方向，避免无效纠缠",
    }
    required_evidence = ["具体事实或动作"]
    if action in {"DEEP_DIVE", "BREAK_ROUTINE"}:
        required_evidence += ["边界条件", "技术或业务权衡"]
    elif action == "PROBE_WEAKNESS":
        required_evidence += ["判断依据", "量化结果"]

    interviewer = {
        "orchestrator_to_hr": "hr",
        "orchestrator_to_qa": "orchestrator",
    }.get(next_node, next_node)
    intent: QuestionIntent = {
        "goal": goal_by_action.get(action, goal_by_action["SWITCH_TOPIC"]),
        "topic": topic,
        "action": action,
        "difficulty": difficulty,
        "required_evidence": required_evidence,
        "question_count": 1,
        "interviewer": interviewer,
    }
    return intent


def build_director_decision(state: InterviewState, next_node: str) -> Dict[str, Any]:
    return {
        "next_node": next_node,
        "stage": state.get("stage", "technical"),
        "reason": state.get("switch_reason") or state.get("dig_action", "INIT"),
        "remaining_rounds": max(
            0,
            int(state.get("max_rounds", 0)) - int(state.get("round_count", 0)),
        ),
    }
