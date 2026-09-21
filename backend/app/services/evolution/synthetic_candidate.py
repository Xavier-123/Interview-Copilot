"""Synthetic Candidate Agent for offline replay and stress-testing.

Provides 5 distinct candidate persona profiles and response behaviors:
1. standard: Well-structured, STAR compliant, balanced depth and example backing.
2. memorized: Textbook recitation, empty buzzwords, lacks project detail and quantification.
3. vague: Hand-waving, lacks concrete numbers, easily drifts or glosses over internals.
4. adversarial: Challenges the interviewer's premise, contradicts earlier statements, slightly argumentative.
5. weak: Has prominent knowledge blind spots, admits defeat quickly or asks for hints.
"""

import logging
from typing import Dict, Any, List, Optional
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.llm import llm_service

logger = logging.getLogger(__name__)

PERSONA_BEHAVIORS = {
    "standard": {
        "label": "标准成熟候选人",
        "system_instruction": (
            "你正在扮演一位面试经验丰富、表达清晰的候选人。\n"
            "作答遵循 STAR 法则：阐述具体情境、目标任务、核心行动和量化成果。\n"
            "技术题先说明业务约束，再讲核心选型，并结合底层原理与容灾兜底。\n"
            "口吻诚恳、自信，篇幅控制在 2-4 句话以内。"
        ),
        "fallback_templates": [
            "我们在订单中心使用了基于 Redis 的 Redisson 分布式锁来防范秒杀超卖，关键在于利用看门狗守护线程自动续期，避免长时间 GC 导致的误释放；结合本地缓存与 Canal 监听 Binlog 投递 RocketMQ 异步落库，峰值 TPS 支撑到 1.2 万且零漏单。",
            "在上一家公司排查慢查询时，我首先通过 Explain 分析发现 filesort 和全表扫描，定位到联合索引最左匹配失效。通过重构索引并采用覆盖索引查询，将 P99 查询延迟从 850ms 压降到了 28ms。",
            "面对业务方紧急插入的插队需求，我首先组织产研同步会对齐当前迭代的交付目标与关键业务影响，运用 MoSCoW 优先级模型梳理核心路径，将非阻断性需求顺延至下个敏捷冲刺，最终主线需求保质准时上线。"
        ]
    },
    "memorized": {
        "label": "死记硬背套路型候选人",
        "system_instruction": (
            "你正在扮演一位机械背诵八股文的候选人。\n"
            "回答大量使用教科书条目式语言（如'第一、第二、第三'），充满通用理论和空泛术语。\n"
            "完全不提及任何具体项目细节、量化数据或业务权衡。\n"
            "篇幅控制在 2-3 句话以内。"
        ),
        "fallback_templates": [
            "分布式锁通常有三种实现方式：基于数据库悲观锁、基于 Redis 的 setnx、基于 Zookeeper 的临时顺序节点。它们各自保证了互斥性、安全性、避免死锁等标准特性。",
            "MySQL 事务四大特性是 ACID：原子性靠 Undo Log 保证，一致性是最终目的，隔离性靠 MVCC 和锁机制保证，持久性靠 Redo Log 保证。",
            "遇到沟通矛盾时要以大局为重，多沟通多交流，加强团队凝聚力，确保大家思想一致奔向同一个目标。"
        ]
    },
    "vague": {
        "label": "含糊浮夸型候选人",
        "system_instruction": (
            "你正在扮演一位回答浮于表面、缺乏量化指标和细节的候选人。\n"
            "习惯使用'大幅提升'、'效果非常好'、'技术很先进'等模糊形容词，遇到底层机制时含糊带过。\n"
            "篇幅控制在 2-3 句话以内。"
        ),
        "fallback_templates": [
            "我们项目中用了非常先进的微服务架构和多级缓存，性能提升了非常多，基本没有出现过卡顿现象，用户反馈非常好。",
            "数据库这块我们做了很多优化，加了一些索引也调了参数，具体什么参数是运维同学配的，反正是业界推荐的标准配置。",
            "我负责整个系统核心模块的研发，遇到过很多高并发挑战，不过后来我们团队一起攻关，都顺利解决了。"
        ]
    },
    "adversarial": {
        "label": "对抗质疑型候选人",
        "system_instruction": (
            "你正在扮演一位略带对抗情绪、喜欢质疑面试官问题前提的候选人。\n"
            "你可能会反问面试官，或者指出题目在实际生产中不成立，并前后陈述存在微妙矛盾。\n"
            "篇幅控制在 2-3 句话以内。"
        ),
        "fallback_templates": [
            "我觉得您这个提问的前提在实际业务中根本不会出现，现代云原生架构都有自动伸缩，为什么要花大精力在单机做极端极端优化呢？",
            "刚才您说一致性，但 CAP 定理告诉我们不可能同时满足，所以追求强一致性本身就是伪命题，我们直接接受最终一致就行了，何必纠结锁续期？",
            "我不觉得这个场景需要重构，我们之前的系统跑得好好的，过度设计只会带来维护灾难。"
        ]
    },
    "weak": {
        "label": "知识盲区弱项候选人",
        "system_instruction": (
            "你正在扮演一位基础相对薄弱或遇到盲区的候选人。\n"
            "在回答中表达不确定、主动承认对底层原理不熟悉，或者请求面试官给点提示。\n"
            "篇幅控制在 1-2 句话以内。"
        ),
        "fallback_templates": [
            "这块底层源码我之前确实没有深入看过，只知道日常直接调用注解就可以生效，面试官老师能给点提示吗？",
            "分布式事务在项目中主要用了第三方组件，具体它是二阶段还是三阶段提交，我记得不太清楚了。",
            "我对网络底层的握手和滑动窗口细节平时关注较少，可能回答不太准确。"
        ]
    }
}


class SyntheticCandidateAgent:
    """Agent that produces candidate answers across different persona archetypes."""

    def __init__(self):
        self._fallback_indexes: Dict[str, int] = {p: 0 for p in PERSONA_BEHAVIORS}

    async def generate_answer(
        self,
        question: str,
        persona_type: str = "standard",
        candidate_profile: Optional[Dict[str, Any]] = None,
        topic: Optional[str] = None,
        context: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        persona = PERSONA_BEHAVIORS.get(persona_type, PERSONA_BEHAVIORS["standard"])
        instruction = persona["system_instruction"]

        prompt = (
            f"面试官提问：{question}\n"
            f"考察主题：{topic or '综合能力'}\n"
            f"候选人画像背景：{candidate_profile or {}}\n"
            "请严格以该人设的第一人称身份作答："
        )

        try:
            resp = await llm_service.invoke([
                SystemMessage(content=instruction),
                HumanMessage(content=prompt),
            ])
            answer = resp.content.strip()
            if answer:
                return answer
        except Exception as e:
            logger.debug(f"SyntheticCandidateAgent LLM invoke failed: {e}. Using deterministic fallback.")

        # Deterministic fallback
        templates = persona["fallback_templates"]
        idx = self._fallback_indexes.get(persona_type, 0)
        selected = templates[idx % len(templates)]
        self._fallback_indexes[persona_type] = idx + 1
        return selected


synthetic_candidate_agent = SyntheticCandidateAgent()
