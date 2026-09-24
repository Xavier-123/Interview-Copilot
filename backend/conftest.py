import json
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# 测试套件屏蔽真实 LLM 网络调用（确定性 + 快速）。
# 生产代码已不再有"失败就降级为示例数据"的 Mock 分支，因此这里统一把
# LLMService 的服务端 client 换成确定性替身。需要特定返回值的用例依旧
# 自行 patch `llm_service.invoke`（多数用例已经是这么做的）。
from langchain_core.messages import AIMessage, SystemMessage  # noqa: E402

from app.agents import llm as llm_module  # noqa: E402

_RESUME_JSON = {
    "name": "测试候选人",
    "experience_years": 4,
    "skills": ["Python", "FastAPI", "Redis", "Kafka"],
    "projects": [
        {
            "name": "订单履约中台",
            "role": "核心后端开发",
            "tech_stack": ["Python", "Redis", "Kafka"],
            "highlights": "优化核心链路，超时率从 3% 降至 0.1%",
        }
    ],
    "education": "工学学士",
    "summary_profile": "具备多年后端研发经验，熟悉分布式缓存与消息队列",
}

_JD_JSON = {
    "title": "高级研发工程师",
    "level": "senior",
    "required_skills": ["Python", "分布式架构", "缓存与消息队列"],
    "preferred_skills": ["Kubernetes"],
    "responsibilities": ["负责核心系统的架构设计与业务交付"],
    "interview_focus": ["架构设计深度", "高可用与容灾"],
}

_OBSERVER_JSON = {
    "topic": "高并发缓存与数据一致性",
    "satisfaction_score": 0.82,
    "answer_status": "solid",
    "strengths": ["表达条理清晰，切中核心概念"],
    "weaknesses": ["缺少压测口径与量化数据"],
    "follow_up_hint": "追问极端超时下的数据补偿机制",
    "next_topic_hint": "MySQL 索引与事务隔离级别",
    "key_claim": "候选人说明了分布式锁与异步补偿方案",
    "depth_score": 8.0,
    "logic_score": 8.1,
    "star_compliance": 7.6,
    "flags": ["solid_basis"],
}

_EVAL_JSON = {
    "overall_summary": "候选人整体作答连贯，技术选型有实操依据，但量化证据偏少。",
    "match_verdict": "建议通过",
    "radar_scores": {
        "technical_depth": 7.9,
        "technical_breadth": 7.8,
        "communication_logic": 8.1,
        "star_completeness": 7.2,
        "stress_resilience": 7.5,
        "job_matching": 8.0,
    },
    "strengths": ["对底层机制有一定推演能力"],
    "weaknesses": ["量化指标与边界场景阐述不足"],
    "confidence_score": 0.8,
    "rubric_id": "standard-6d-v1",
    "detailed_reviews": [
        {
            "round": 1,
            "interviewer": "技术面试官",
            "question": "请介绍你负责的缓存一致性方案。",
            "candidate_answer": "采用分布式锁配合异步补偿保证最终一致。",
            "analysis": "要点完整，但缺少压测数据支撑。",
            "evidence_quote": "采用分布式锁配合异步补偿",
            "score": 7.8,
        }
    ],
}

_COACH_JSON = {
    "enriched_reviews": [
        {
            "round": 1,
            "better_answer_sample": "先讲业务约束，再讲选型理由与量化结果。",
            "key_takeaway": "回答架构题先给结论，再补边界与数据。",
        }
    ],
    "learning_plan": [
        {
            "topic": "缓存一致性实战",
            "reason": "边界场景阐述不足",
            "recommended_actions": ["搭建双写一致性实验环境"],
        }
    ],
    "seven_day_roadmap": [
        {
            "day": "Day 1-2",
            "phase": "原理补齐",
            "focus_topics": ["缓存一致性"],
            "action_items": ["复现延迟双删问题"],
            "expected_outcome": "能完整推演一致性方案",
        }
    ],
    "drill_cards": [
        {
            "id": "drill_1",
            "weakness_title": "专项打靶：量化表达",
            "concept_summary": "用可验证的指标说明成果。",
            "interview_tips": "情境 -> 行动 -> 量化结果。",
            "sample_drill_question": "同一个方案，你会如何补充量化证据？",
        }
    ],
}

_POLISH_JSON = {
    "match_score": 72,
    "overall_comment": "经历真实完整，但项目描述偏职责罗列，缺少量化结果。",
    "gaps": [
        {
            "requirement": "高并发系统设计经验",
            "status": "weak",
            "evidence": "简历只提到优化核心链路，没有流量规模",
            "advice": "补充 QPS 与延迟数据",
        }
    ],
    "issues": [
        {
            "quote": "负责多个业务模块的开发与维护",
            "type": "no_metrics",
            "severity": "medium",
            "problem": "纯职责描述，缺少成果",
            "rewritten": "独立负责 3 个核心业务模块的迭代与稳定性",
            "reason": "把职责改成可验证的范围与结果",
        }
    ],
    "challenge_risks": [],
    "general_tips": ["按背景-行动-量化结果重写项目经历"],
}

_AUDIT_JSON = {
    "overall_score": 8.2,
    "business_realism_score": 8.0,
    "anti_memorization_score": 7.9,
    "audit_verdict": "面试官控场平稳，问题能结合候选人背景展开。",
    "strengths": ["追问逻辑连贯"],
    "weaknesses": ["可增加真实线上故障场景"],
    "golden_trajectories": [],
    "negative_rules": [],
}

_SIMULATE_ANSWER_TEXT = (
    "在过往的项目里，我负责过核心链路的稳定性建设：先明确业务约束与目标指标，"
    "再说明方案选型与取舍依据，最后针对网络抖动等异常场景补充兜底与补偿策略，"
    "并给出可验证的量化结果。"
)


def _stub_reply(messages) -> str:
    system_text = "\n".join(str(m.content) for m in messages if isinstance(m, SystemMessage))
    user_text = "\n".join(str(m.content) for m in messages if not isinstance(m, SystemMessage))

    if "简历打磨教练" in user_text:
        # 未提供 JD 时按契约返回空分与空缺口
        payload = dict(_POLISH_JSON)
        if "（未提供岗位描述）" in user_text:
            payload["match_score"] = None
            payload["gaps"] = []
        return json.dumps(payload, ensure_ascii=False)
    if "简历信息抽取专家" in user_text:
        return json.dumps(_RESUME_JSON, ensure_ascii=False)
    if "岗位需求 (JD) 分析专家" in user_text:
        return json.dumps(_JD_JSON, ensure_ascii=False)
    if "AI面试官督导与质检评估专家" in system_text:
        return json.dumps(_AUDIT_JSON, ensure_ascii=False)
    if "影子观察员 Agent" in system_text:
        return json.dumps(_OBSERVER_JSON, ensure_ascii=False)
    if "评估专家 (Evaluator Agent)" in system_text:
        return json.dumps(_EVAL_JSON, ensure_ascii=False)
    if "求职辅导导师 (Coach Agent)" in system_text:
        return json.dumps(_COACH_JSON, ensure_ascii=False)
    if "求职面试导师" in system_text or "示范回答" in system_text:
        return _SIMULATE_ANSWER_TEXT
    return "请先做一个简短的自我介绍，重点讲讲你最有挑战的一段项目经历。"


class _StubLLMClient:
    """测试替身：按提示词类型返回确定性内容，绝不发起真实网络请求。"""

    async def ainvoke(self, messages):
        return AIMessage(content=_stub_reply(messages))


llm_module.llm_service._client = _StubLLMClient()
llm_module.llm_service._config_error = None
