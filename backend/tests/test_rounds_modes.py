import pytest
from app.agents.graph import should_conclude_interview, after_observer_route
from app.agents.state import InterviewState
from app.services.session_manager import session_manager
from app.api.v1.interviews import CreateSessionRequest


def _make_state(**overrides) -> InterviewState:
    base: dict = {
        "session_id": "test_session",
        "title": "测试轮次决策会话",
        "stage": "technical",
        "current_interviewer": "technical",
        "interview_type": "custom",
        "industry": "人工智能/大模型",
        "job_role": "大模型算法工程师",
        "seniority": "senior",
        "difficulty": "standard",
        "style": "rigorous",
        "language": "zh",
        "custom_config": {
            "selected_interviewers": ["technical"],
            "focus_topics": [],
        },
        "web_search_enabled": False,
        "round_count": 0,
        "max_rounds": 6,
        "rounds_mode": "fixed",
        "is_ready_to_conclude": False,
        "conclude_reason": None,
        "tech_rounds_target": 2,
        "hr_rounds_target": 1,
        "mgmt_rounds_target": 3,
        "stress_triggered": False,
        "current_topic": "Agent架构设计",
        "topic_depth": 1,
        "last_satisfaction_score": 0.85,
        "last_answer_status": "solid",
        "dig_action": "DEEP_DIVE",
        "candidate_profile": {},
        "jd_requirements": {},
        "interview_mode": {},
        "messages": [],
        "condensed_memory": "",
        "latest_user_input": "测试回答",
        "status": "waiting_user",
    }
    base.update(overrides)
    return base


# ── 1. should_conclude_interview 单元测试 ───────────────────────────────

def test_fixed_mode_does_not_conclude_early():
    # max_rounds=6 -> 核心考核题数为 5 题 (max_rounds - 1)
    state = _make_state(rounds_mode="fixed", max_rounds=6, is_ready_to_conclude=True)
    assert not should_conclude_interview(state, round_count=2, max_rounds=6)
    assert not should_conclude_interview(state, round_count=4, max_rounds=6)


def test_fixed_mode_concludes_at_target_round():
    state = _make_state(rounds_mode="fixed", max_rounds=6, is_ready_to_conclude=False)
    assert should_conclude_interview(state, round_count=5, max_rounds=6)
    assert should_conclude_interview(state, round_count=6, max_rounds=6)


def test_adaptive_mode_respects_minimum_threshold():
    # 即使第 1 或第 2 轮大模型认为可以结课，也必须保证至少完成 3 轮
    state = _make_state(rounds_mode="adaptive", max_rounds=8, is_ready_to_conclude=True)
    assert not should_conclude_interview(state, round_count=1, max_rounds=8)
    assert not should_conclude_interview(state, round_count=2, max_rounds=8)


def test_adaptive_mode_concludes_when_ready_after_minimum():
    # 第 3 轮及以上，且 is_ready_to_conclude 为 True 时结课
    state = _make_state(rounds_mode="adaptive", max_rounds=8, is_ready_to_conclude=True)
    assert should_conclude_interview(state, round_count=3, max_rounds=8)
    assert should_conclude_interview(state, round_count=4, max_rounds=8)


def test_adaptive_mode_continues_if_not_ready():
    # 第 3 轮但大模型认为尚未充分评估，继续出题
    state = _make_state(rounds_mode="adaptive", max_rounds=8, is_ready_to_conclude=False)
    assert not should_conclude_interview(state, round_count=3, max_rounds=8)
    assert not should_conclude_interview(state, round_count=5, max_rounds=8)


def test_adaptive_mode_enforces_safety_ceiling():
    # 即使大模型一直为 False，达到上限 (max_rounds - 1) 时强制结课防止死循环
    state = _make_state(rounds_mode="adaptive", max_rounds=8, is_ready_to_conclude=False)
    assert should_conclude_interview(state, round_count=7, max_rounds=8)


def test_adaptive_mode_large_safety_ceiling():
    # 支持 20~30 题超长安全上限
    state = _make_state(rounds_mode="adaptive", max_rounds=31, is_ready_to_conclude=False)
    assert not should_conclude_interview(state, round_count=20, max_rounds=31)
    assert should_conclude_interview(state, round_count=30, max_rounds=31)


# ── 2. after_observer_route 路由验证 ────────────────────────────────────

def test_route_custom_interview_fixed_mode():
    # 5 题设置 (max_rounds=6)，在第 4 题回答后继续出题，第 5 题后切入反问
    state_r4 = _make_state(rounds_mode="fixed", max_rounds=6, round_count=4)
    assert after_observer_route(state_r4) == "technical"

    state_r5 = _make_state(rounds_mode="fixed", max_rounds=6, round_count=5)
    assert after_observer_route(state_r5) == "orchestrator_to_qa"


def test_route_custom_interview_adaptive_mode_early_exit():
    # 自适应模式：第 3 轮已达成判定，提前优雅收尾转入反问
    state = _make_state(
        rounds_mode="adaptive",
        max_rounds=10,
        round_count=3,
        is_ready_to_conclude=True,
        conclude_reason="核心能力画像已充分验证饱和"
    )
    assert after_observer_route(state) == "orchestrator_to_qa"


def test_route_custom_interview_adaptive_mode_continues():
    # 自适应模式：第 3 轮未达标，继续出题
    state = _make_state(
        rounds_mode="adaptive",
        max_rounds=10,
        round_count=3,
        is_ready_to_conclude=False
    )
    assert after_observer_route(state) == "technical"


# ── 3. API 请求解析与 Session 初始化 ────────────────────────────────────

def test_create_session_request_rounds_mode_defaults_and_parsing():
    req1 = CreateSessionRequest(job_role="后端开发")
    assert req1.rounds_mode == "fixed"

    req2 = CreateSessionRequest(job_role="后端开发", rounds_mode="adaptive")
    assert req2.rounds_mode == "adaptive"


@pytest.mark.asyncio
async def test_session_manager_initializes_rounds_mode():
    state = await session_manager.create_session(
        resume_text="测试简历",
        jd_text="测试JD",
        rounds_mode="adaptive",
        max_rounds=7
    )
    assert state.get("rounds_mode") == "adaptive"
    assert state.get("max_rounds") == 7
    assert state.get("is_ready_to_conclude") is False
