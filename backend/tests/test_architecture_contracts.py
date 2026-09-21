from app.agents.graph import after_observer_route
from app.agents.planner import build_question_intent


def _state(**overrides):
    state = {
        "interview_type": "custom",
        "stage": "custom_persona",
        "round_count": 0,
        "max_rounds": 6,
        "current_interviewer": "challenger",
        "custom_config": {"selected_interviewers": ["challenger", "hr"]},
        "interview_mode": {"style": "stress"},
        "stress_triggered": True,
        "dig_action": "BREAK_ROUTINE",
        "current_topic": "缓存一致性",
        "difficulty": "hard",
    }
    state.update(overrides)
    return state


def test_custom_challenger_advances_to_next_role():
    # Challenger is an injected turn and does not increment round_count. The
    # custom lineup must still advance instead of selecting Challenger forever.
    assert after_observer_route(_state()) == "hr"


def test_question_intent_is_structured_and_non_prose():
    intent = build_question_intent(_state(interview_type="technical"), "technical")
    assert intent["action"] == "BREAK_ROUTINE"
    assert intent["question_count"] == 1
    assert "goal" in intent
    assert isinstance(intent["required_evidence"], list)
