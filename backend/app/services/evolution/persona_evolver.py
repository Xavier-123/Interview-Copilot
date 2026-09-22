"""Persona Evolver: Single-persona automated simulation, Critic diagnosis, and targeted optimization pipeline.

Bridges the offline Evolution Lab capabilities into an interactive one-click experience:
1. Runs 2-turn simulation between the interviewer persona and a synthetic candidate archetype.
2. Runs CriticAgent diagnosis on the simulation transcript to identify defects.
3. Synthesizes an optimized persona specification, mining negative rules and golden few-shots.
"""

import json
import logging
import re
from typing import Dict, Any, List, Optional
from langchain_core.messages import SystemMessage, HumanMessage

from app.models.persona import InterviewerPersona
from app.services.evolution.synthetic_candidate import synthetic_candidate_agent
from app.services.evolution.critic import critic_agent
from app.agents.llm import llm_service

logger = logging.getLogger(__name__)


class PersonaEvolver:
    """Orchestrates end-to-end simulation, diagnosis, and evolution for an InterviewerPersona."""

    async def run_persona_evolution(
        self,
        persona: InterviewerPersona,
        target_topic: Optional[str] = None,
        candidate_behavior: str = "vague",
    ) -> Dict[str, Any]:
        """Runs a 2-turn simulation, diagnoses flaws, and generates an optimized proposal."""
        # 1. 确定本次模拟的考察方向
        topics = persona.focus_topics or []
        topic = target_topic or (topics[0] if topics else "核心技术架构与设计模式")

        # 2. 阶段一：仿真对战 (2 轮问答)
        sys_interviewer_prompt = (
            f"你是本次面试的面试官【{persona.name}】。\n"
            f"【角色人设】：\n{persona.system_prompt}\n"
            f"【考察重点】：{'、'.join(topics) if topics else topic}\n"
            f"【开场出题提示】：{persona.opening_hint or '从你的考察重点中选定一个方向提出深度开场问题'}\n"
            f"【追问提示】：{persona.deep_dive_hint or '针对候选人陈述中的薄弱点或底层原理深入深挖'}\n"
            f"【语言纪律】：使用自然口语交流，纯口语输出（严禁 markdown 加粗、代码块或项目编号）。"
        )

        candidate_profile = {
            "name": "合成候选人",
            "experience_years": 4,
            "target_topic": topic,
            "claim": f"声称精通并主导过{topic}相关的核心业务落地",
        }

        # ── 轮次 1：面试官首题 ──
        prompt_q1 = (
            f"这是模拟面试第 1 题。请针对主题【{topic}】，结合你的角色人设与提问偏好，"
            f"直接向候选人抛出一个有深度的考察问题（严禁使用'好的'、'欢迎'等冗长客套开场）。"
        )
        resp_q1 = await llm_service.invoke([
            SystemMessage(content=sys_interviewer_prompt),
            HumanMessage(content=prompt_q1),
        ])
        question_1 = resp_q1.content.strip()

        # ── 轮次 1：合成候选人作答 ──
        ans_1 = await synthetic_candidate_agent.generate_answer(
            question=question_1,
            persona_type=candidate_behavior,
            candidate_profile=candidate_profile,
            topic=topic,
        )

        # ── 轮次 2：面试官追问 ──
        ans1_snippet = ans_1[:200]
        prompt_q2 = (
            f"候选人刚才回答：'{ans1_snippet}'。\n"
            f"请先针对他刚才的陈述给出真切的专业反馈（点出其可疑点或含糊之处），"
            f"然后针对其底层原理、极限边界或真实数据来源深入追问（严禁以'好的'、'感谢您的回答'开场，控制在 3 句话内）。"
        )

        resp_q2 = await llm_service.invoke([
            SystemMessage(content=sys_interviewer_prompt),
            HumanMessage(content=prompt_q2),
        ])
        question_2 = resp_q2.content.strip()

        # ── 轮次 2：合成候选人二次作答 ──
        ans_2 = await synthetic_candidate_agent.generate_answer(
            question=question_2,
            persona_type="memorized",
            candidate_profile=candidate_profile,
            topic=topic,
        )

        # 拼装模拟实录
        transcript = [
            {
                "round": 1,
                "speaker": "interviewer",
                "role": "assistant",
                "name": persona.name,
                "content": question_1,
                "topic": topic,
            },
            {
                "round": 1,
                "speaker": "candidate",
                "role": "user",
                "name": "合成候选人",
                "content": ans_1,
            },
            {
                "round": 2,
                "speaker": "interviewer",
                "role": "assistant",
                "name": persona.name,
                "content": question_2,
                "topic": topic,
            },
            {
                "round": 2,
                "speaker": "candidate",
                "role": "user",
                "name": "合成候选人",
                "content": ans_2,
            },
        ]

        # 3. 阶段二：Critic 诊断分析
        critic_res = await critic_agent.diagnose(
            transcript=transcript,
            jd_requirements={"interview_focus": topics or [topic]},
        )

        # 4. 阶段三：针对性优化综合生成 (Optimizer Synthesis)
        proposal = await self._synthesize_optimization(
            persona=persona,
            transcript=transcript,
            critic_res=critic_res,
            topic=topic,
        )

        return {
            "persona_id": persona.id,
            "persona_name": persona.name,
            "topic": topic,
            "simulation_transcript": transcript,
            "critic_report": critic_res,
            "original_spec": {
                "name": persona.name,
                "avatar": persona.avatar or "🎭",
                "description": persona.description or "",
                "system_prompt": persona.system_prompt,
                "skepticism_level": float(persona.skepticism_level or 0.5),
                "focus_topics": persona.focus_topics or [],
                "opening_hint": persona.opening_hint or "",
                "deep_dive_hint": persona.deep_dive_hint or "",
                "probe_hint": persona.probe_hint or "",
            },
            "optimized_spec": proposal,
        }

    async def _synthesize_optimization(
        self,
        persona: InterviewerPersona,
        transcript: List[Dict[str, Any]],
        critic_res: Dict[str, Any],
        topic: str,
    ) -> Dict[str, Any]:
        """Calls LLM to generate refined persona prompts, negative rules, and golden few-shots."""
        defects = critic_res.get("defects", [])
        defects_desc = "\n".join([f"- [第{d.get('round', 1)}轮] {d.get('description', '')} (建议: {d.get('suggestion', '')})" for d in defects]) or "未发现明显机械套话，但仍可进一步强化追问穿透力与场景真实度。"

        sys_prompt = (
            "你是一位顶尖的 AI 面试官架构专家与 Prompt 优化大师。\n"
            "你的任务是根据面试官在仿真面试实录中的真实表现和 Critic 诊断出的缺陷，"
            "对其人设、系统提示词和追问策略进行针对性迭代升级。"
        )

        user_prompt = f"""【当前面试官角色】：
- 名称：{persona.name}
- 简介：{persona.description}
- 核心考察方向：{'、'.join(persona.focus_topics or [topic])}
- 原始系统人设 (System Prompt)：
{persona.system_prompt}
- 当前怀疑度 (Skepticism Level)：{persona.skepticism_level}

【仿真对战实录】：
1. 面试官提问1: {transcript[0]['content']}
2. 候选人作答1: {transcript[1]['content']}
3. 面试官追问2: {transcript[2]['content']}
4. 候选人作答2: {transcript[3]['content']}

【Critic 诊断报告】：
得分: {critic_res.get('critique_score', 8.0)}/10.0
检测到的缺陷:
{defects_desc}

请对该面试官进行针对性进化优化，必须严格输出如下合法 JSON 格式，不要包含多余标记或解释：
```json
{{
  "optimized_system_prompt": "优化后的面试官完整人设Prompt（保留其核心风格，但强化口语纪律、抹平缺陷、强化对真实细节与底层架构的穿透力，篇幅约200-400字）",
  "negative_rules": [
    "针对本次暴露问题提炼的第1条复盘避坑铁律（必须具体且可操作，如：严禁以'好的'或客套词开场，直接指出候选人回答中的可疑点）",
    "第2条复盘避坑铁律（如：遇到候选人陈述量化指标提升时，强制追问基线对比与测量方法）"
  ],
  "golden_few_shots": [
    "基于当前角色人设沉淀的1条黄金追问范例（示范如何优雅、犀利地提出既有深度又口语化的问题）"
  ],
  "suggested_skepticism_level": 0.65,
  "optimized_deep_dive_hint": "优化后的深度追问提示（1-2句话）",
  "optimized_probe_hint": "优化后的弱项引导追问提示（1-2句话）",
  "optimization_rationale": "优化核心说明（2-3句话总结本次升级重点，如消除客套开场、增加反思追问维度等）"
}}
```
"""

        try:
            resp = await llm_service.invoke([
                SystemMessage(content=sys_prompt),
                HumanMessage(content=user_prompt),
            ])
            text = resp.content.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            result = json.loads(text)
            return {
                "system_prompt": result.get("optimized_system_prompt") or persona.system_prompt,
                "negative_rules": result.get("negative_rules") or [
                    "严禁使用机械套话或夸赞性开场，始终以候选人具体方案陈述为锚点直接切入。",
                    "针对候选人使用的抽象技术术语（如'自适应'、'高可用'），必须追问具体容灾边界与失败案例。"
                ],
                "golden_few_shots": result.get("golden_few_shots") or [
                    f"针对你刚才提到的{topic}，当发生极端节点宕机或网络分区时，系统是怎么感知并做流量旁路降级的？当时留存的指标日志是什么？"
                ],
                "skepticism_level": float(result.get("suggested_skepticism_level") or max(0.55, float(persona.skepticism_level or 0.5) + 0.1)),
                "deep_dive_hint": result.get("optimized_deep_dive_hint") or (persona.deep_dive_hint or "针对其回答中的底层机制、权衡取舍与边界约束进一步深入追问。"),
                "probe_hint": result.get("optimized_probe_hint") or (persona.probe_hint or "针对最含糊的概念给出引导，测试其能否讲清核心原理。"),
                "optimization_rationale": result.get("optimization_rationale") or "优化了口语开场约束，增加了针对候选人回答中可疑细节的极限追问维度。",
            }
        except Exception as e:
            logger.warning(f"Optimization synthesis LLM call failed: {e}. Using deterministic fallback.")
            return {
                "system_prompt": f"{persona.system_prompt}\n【演进约束】：严禁使用'好的'、'非常棒'等任何口头禅客套；对候选人陈述的指标与框架必须追问具体实现与量化证据。",
                "negative_rules": [
                    "严禁使用机械套话或夸赞性开场，始终以候选人具体方案陈述为锚点直接切入。",
                    "遇到候选人仅讲框架概念时，强制追问真实生产故障场景与边界数据。"
                ],
                "golden_few_shots": [
                    f"关于你刚才提到的{topic}，如果生产环境出现秒级流量突刺，你设计的缓存与DB保护机制会先触发哪一道防线？具体量化数据是多少？"
                ],
                "skepticism_level": round(min(1.0, float(persona.skepticism_level or 0.5) + 0.1), 2),
                "deep_dive_hint": persona.deep_dive_hint or "针对其回答中的底层机制、权衡取舍与边界约束进一步深入追问。",
                "probe_hint": persona.probe_hint or "针对最含糊的概念给出引导，测试其能否讲清核心原理。",
                "optimization_rationale": "基于仿真复盘，消除了模板化开场白，提高了对架构边界与量化指标的审查严苛度。",
            }


persona_evolver = PersonaEvolver()
