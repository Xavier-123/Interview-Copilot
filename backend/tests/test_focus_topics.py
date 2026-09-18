"""定向考察知识点（custom_config.focus_topics）贯通性测试。

覆盖四条链路：
1. interviewer_utils 的清单注入块与切题定向约束；
2. 面试官节点 SystemMessage 注入（technical）；
3. 自定义人设 prompt 的清单合并（顶层清单 + 人设 focus_topics）；
4. 影子观察员换题兜底轮转与 RAG 相关性阈值。
"""
import json

import pytest
from langchain_core.messages import AIMessage

from app.agents import interviewer_utils
from app.agents.persona_node import _build_persona_system_prompt
from app.agents.state import InterviewState

FOCUS_TOPICS = ["Kubernetes HPA 弹性伸缩", "etcd raft 选举机制"]


def _state(**overrides) -> InterviewState:
    base: dict = {
        "session_id": "s1",
        "user_id": "u1",
        "title": "定向考察模拟面试",
        "stage": "technical",
        "current_interviewer": "technical",
        "interview_type": "custom",
        "industry": "互联网/电商",
        "job_role": "后端开发",
        "seniority": "senior",
        "difficulty": "standard",
        "style": "rigorous",
        "language": "zh",
        "custom_config": {
            "selected_interviewers": ["technical"],
            "focus_topics": list(FOCUS_TOPICS),
        },
        "web_search_enabled": False,
        "round_count": 3,
        "max_rounds": 8,
        "topic_depth": 1,
        "last_satisfaction_score": 0.4,
        "last_answer_status": "surface",
        "dig_action": "SWITCH_TOPIC",
        "candidate_profile": {},
        "jd_requirements": {},
        "interview_mode": {},
        "messages": [],
        "condensed_memory": "",
        "latest_user_input": "我用的是 Redis 缓存加消息队列",
        "evaluation_logs": [{"topic": "Redis分布式锁与长业务超时"}],
        "status": "waiting_user",
    }
    base.update(overrides)
    return base


# ── interviewer_utils ────────────────────────────────────────────────

def test_focus_topics_line_empty_without_config():
    assert interviewer_utils.focus_topics_line({}) == ""
    assert interviewer_utils.focus_topics_line({"custom_config": None}) == ""
    assert interviewer_utils.focus_topics_line(
        {"custom_config": {"focus_topics": ["", "   "]}}
    ) == ""


def test_focus_topics_line_lists_all_items():
    line = interviewer_utils.focus_topics_line(_state())
    assert "定向考察知识点" in line
    assert "Kubernetes HPA 弹性伸缩" in line
    assert "etcd raft 选举机制" in line
    assert "定向纪律" in line


def test_switch_instruction_contains_focus_rule_and_remaining():
    prompt = interviewer_utils.build_switch_instruction(_state(), "请切换考点。")
    assert "定向考察约束" in prompt
    # 已考察的 Redis 主题不在清单中，两个清单项都应作为"尚未覆盖"出现
    assert "Kubernetes HPA 弹性伸缩" in prompt
    assert "etcd raft 选举机制" in prompt


def test_switch_instruction_without_focus_unchanged():
    state = _state(custom_config={"selected_interviewers": ["technical"]})
    prompt = interviewer_utils.build_switch_instruction(state, "请切换考点。")
    assert "定向考察约束" not in prompt


# ── technical 节点 SystemMessage 注入 ────────────────────────────────

@pytest.mark.asyncio
async def test_technical_node_injects_focus_topics(monkeypatch):
    from app.agents import technical as technical_module

    captured = {}

    async def fake_invoke(messages, llm_config=None):
        captured["messages"] = messages
        return AIMessage(content="好，我们聊聊 Kubernetes HPA 的弹性伸缩策略？")

    monkeypatch.setattr(technical_module.llm_service, "invoke", fake_invoke)

    await technical_module.technical_node(_state(round_count=0, dig_action="INIT"))

    sys_content = captured["messages"][0].content
    assert "定向考察知识点" in sys_content
    assert "Kubernetes HPA 弹性伸缩" in sys_content


# ── 自定义人设 prompt 合并 ────────────────────────────────────────────

def test_persona_prompt_merges_session_and_persona_focus():
    state = _state(custom_config={
        "selected_interviewers": ["persona_x"],
        "focus_topics": ["Kubernetes HPA 弹性伸缩"],
    })
    persona = {
        "key": "persona_x",
        "name": "老王",
        "description": "infra 专家",
        "system_prompt": "你是资深基础设施面试官",
        "focus_topics": ["etcd raft 选举机制", "Kubernetes HPA 弹性伸缩"],
    }
    prompt = _build_persona_system_prompt(state, persona)
    assert "Kubernetes HPA 弹性伸缩" in prompt
    assert "etcd raft 选举机制" in prompt
    # 顶层清单与人设重复项应去重，只出现一次
    assert prompt.count("Kubernetes HPA 弹性伸缩") == 1


# ── 影子观察员换题兜底 ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_observer_switch_falls_back_to_focus_rotation(monkeypatch):
    from app.agents import observer as observer_module

    async def fake_invoke(messages, llm_config=None):
        payload = {
            "topic": "Redis分布式锁",
            "satisfaction_score": 0.3,
            "answer_status": "poor",
        }
        return AIMessage(content="```json\n" + json.dumps(payload, ensure_ascii=False) + "\n```")

    monkeypatch.setattr(observer_module.llm_service, "invoke", fake_invoke)

    result = await observer_module.shadow_observer_node(_state(
        current_interviewer="technical",
        current_topic="Redis分布式锁",
        dig_action="DEEP_DIVE",
        topic_depth=2,
        round_count=4,
    ))

    assert result["dig_action"] == "SWITCH_TOPIC"
    # next_topic_hint 缺失时应轮转到定向清单中第一个未覆盖的知识点
    assert result["current_topic"] == "Kubernetes HPA 弹性伸缩"


@pytest.mark.asyncio
async def test_observer_without_focus_keeps_legacy_fallback(monkeypatch):
    from app.agents import observer as observer_module

    async def fake_invoke(messages, llm_config=None):
        payload = {
            "topic": "Redis分布式锁",
            "satisfaction_score": 0.3,
            "answer_status": "poor",
        }
        return AIMessage(content="```json\n" + json.dumps(payload, ensure_ascii=False) + "\n```")

    monkeypatch.setattr(observer_module.llm_service, "invoke", fake_invoke)

    state = _state(
        custom_config={"selected_interviewers": ["technical"]},
        current_interviewer="technical",
        current_topic="Redis分布式锁",
        dig_action="DEEP_DIVE",
        topic_depth=2,
        round_count=4,
    )
    result = await observer_module.shadow_observer_node(state)

    assert result["dig_action"] == "SWITCH_TOPIC"
    # 无定向清单时保持旧行为：沿用提取主题
    assert result["current_topic"] == "Redis分布式锁"


# ── RAG 相关性阈值 ───────────────────────────────────────────────────

def test_rag_min_score_filters_irrelevant():
    from app.services.rag import rag_service

    # 语料之外的话题：不再硬塞无关面经
    assert rag_service.retrieve_question_angles(query="前端CSS动画渲染性能优化") == []
    assert rag_service.retrieve_question_angles(query="") == []
    # 相关话题：正常命中
    hits = rag_service.retrieve_question_angles(query="Redis分布式锁超时与看门狗")
    assert len(hits) >= 1
    assert "Redis" in hits[0]["topic"] or "redis" in hits[0]["topic"].lower()
