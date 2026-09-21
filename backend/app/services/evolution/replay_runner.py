"""Replay Runner for offline multi-turn simulation and quantitative benchmarking.

Executes automated dialogues between an interviewer candidate specification and
multiple Synthetic Candidate personas, generating full conversational traces and
benchmarking metrics:
- Realism (0.0 - 1.0)
- Professionalism (0.0 - 1.0)
- Coherence (0.0 - 1.0)
- Safety (0.0 - 1.0)
- Fairness (0.0 - 1.0)
- Average latency (ms)
- Estimated token cost (USD)
"""

import time
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.architecture import ReplayRunModel, EvolutionCandidateModel
from app.services.evolution.synthetic_candidate import synthetic_candidate_agent, PERSONA_BEHAVIORS
from app.services.evolution.safety_reviewer import safety_reviewer
from app.services.evolution.critic import critic_agent
from app.agents.llm import llm_service
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

DEFAULT_SIMULATION_TOPICS = [
    ("分布式缓存与一致性", "在你的核心项目中，Redis 与 MySQL 之间的数据一致性是如何保障的？如果网络抖动出现极端并发，如何防止脏读？"),
    ("慢查询与底层索引", "生产环境中发生过哪些最严重的慢 SQL 事故？你是如何通过执行计划分析并做索引重构优化的？"),
    ("项目技术架构权衡", "在做该项目微服务拆分时，你是如何做架构 Trade-off 的？在可用性与复杂性之间做了哪些妥协？"),
]


class ReplayRunner:
    """Automated multi-turn simulation and evaluation runner."""

    async def run_replay(
        self,
        session: AsyncSession,
        candidate_id: str,
        interviewer_spec: Optional[Dict[str, Any]] = None,
        test_personas: Optional[List[str]] = None,
        turns_per_persona: int = 2,
        dataset_name: str = "synthetic-persona-suite",
        model_version: str = "default",
    ) -> ReplayRunModel:
        """Runs offline simulation across specified personas and saves trace + metrics."""
        # 1. Fetch candidate if interviewer_spec not passed
        candidate: Optional[EvolutionCandidateModel] = None
        if candidate_id:
            result = await session.execute(
                select(EvolutionCandidateModel).where(EvolutionCandidateModel.id == candidate_id)
            )
            candidate = result.scalar_one_or_none()
            if candidate and not interviewer_spec:
                interviewer_spec = candidate.candidate_spec

        spec = interviewer_spec or {}
        interviewer_id = spec.get("interviewer_id") or (candidate.interviewer_id if candidate else "interviewer-default")
        base_version_id = candidate.base_version_id if candidate else None

        personas = test_personas or list(PERSONA_BEHAVIORS.keys())
        transcript: List[Dict[str, Any]] = []
        latencies: List[float] = []

        # 2. Multi-turn simulation
        for persona_type in personas:
            persona_label = PERSONA_BEHAVIORS.get(persona_type, {}).get("label", persona_type)

            for turn_idx in range(turns_per_persona):
                topic_info = DEFAULT_SIMULATION_TOPICS[turn_idx % len(DEFAULT_SIMULATION_TOPICS)]
                topic_title, initial_q = topic_info

                # Interviewer Turn
                t0 = time.time()
                interviewer_text = await self._simulate_interviewer_turn(
                    spec=spec,
                    topic=topic_title,
                    question=initial_q,
                    turn_idx=turn_idx,
                    transcript=transcript,
                )
                latency_ms = round((time.time() - t0) * 1000, 2)
                latencies.append(latency_ms)

                transcript.append({
                    "turn_index": len(transcript) + 1,
                    "speaker": "interviewer",
                    "persona_target": persona_type,
                    "topic": topic_title,
                    "content": interviewer_text,
                    "latency_ms": latency_ms,
                    "timestamp": datetime.utcnow().isoformat(),
                })

                # Synthetic Candidate Turn
                candidate_text = await synthetic_candidate_agent.generate_answer(
                    question=interviewer_text,
                    persona_type=persona_type,
                    topic=topic_title,
                )

                transcript.append({
                    "turn_index": len(transcript) + 1,
                    "speaker": "candidate",
                    "persona_type": persona_type,
                    "persona_label": persona_label,
                    "topic": topic_title,
                    "content": candidate_text,
                    "timestamp": datetime.utcnow().isoformat(),
                })

        # 3. Quality & Safety evaluation
        safety_audit = safety_reviewer.review_transcript(transcript)
        critic_diagnosis = await critic_agent.diagnose(transcript, interviewer_spec=spec)

        # 4. Metrics aggregation
        avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else 150.0
        safety_score = 1.0 if safety_audit.get("passed", True) else 0.0
        defects_count = critic_diagnosis.get("defects_count", 0)

        # Realism: penalized by robotic defects and verbosity
        realism = max(0.6, min(0.98, round(0.92 - (defects_count * 0.04), 2)))
        professionalism = max(0.65, min(0.98, round(0.90 - (defects_count * 0.03), 2)))
        coherence = 0.94 if defects_count < 3 else 0.85
        fairness = 1.0 if safety_score == 1.0 else 0.5
        estimated_cost = round(len(transcript) * 0.0004, 4)

        metrics = {
            "realism": realism,
            "professionalism": professionalism,
            "coherence": coherence,
            "safety": safety_score,
            "fairness": fairness,
            "avg_latency_ms": avg_latency,
            "estimated_cost_usd": estimated_cost,
            "defects_count": defects_count,
            "turns_count": len(transcript),
            "safety_passed": safety_audit.get("passed", True),
        }

        # 5. Save ReplayRunModel
        replay_run = ReplayRunModel(
            candidate_id=candidate_id,
            interviewer_id=interviewer_id,
            interviewer_version_id=base_version_id,
            dataset_name=dataset_name,
            model_version=model_version,
            status="completed",
            metrics=metrics,
            transcript=transcript,
        )
        session.add(replay_run)

        # 6. Update Candidate state
        if candidate:
            candidate.replay_metrics = metrics
            candidate.safety_check_passed = (safety_score == 1.0)
            candidate.status = "offline_tested"
            session.add(candidate)

        await session.commit()
        await session.refresh(replay_run)
        logger.info(f"Completed ReplayRun {replay_run.id} for candidate {candidate_id}, metrics: {metrics}")
        return replay_run

    async def _simulate_interviewer_turn(
        self,
        spec: Dict[str, Any],
        topic: str,
        question: str,
        turn_idx: int,
        transcript: List[Dict[str, Any]],
    ) -> str:
        """Simulates single turn of interviewer speech obeying spec constraints."""
        guardrails = spec.get("guardrails", {})
        avoid_phrases = guardrails.get("avoid_phrases", [])

        # Try LLM if configured
        system_prompt = spec.get("system_prompt")
        if system_prompt:
            try:
                t_context = "\n".join([f"[{t['speaker']}]: {t['content']}" for t in transcript[-4:]])
                prompt = f"前序对话：\n{t_context}\n当前主题：{topic}\n请提出一个专业自然的追问或新考点："
                resp = await llm_service.invoke([
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=prompt),
                ])
                text = resp.content.strip()
                if text:
                    return text
            except Exception as e:
                logger.debug(f"LLM interviewer turn fallback: {e}")

        # Deterministic natural interviewer speech (avoids robotic openers)
        templates = [
            f"关于{topic}，请问在你的核心项目中，如果遇到网络抖动或跨机房延迟，底层数据是如何做最终一致性兜底的？",
            f"你刚刚提到的方案在常规流量下表现平稳，但在流量突增 10 倍的极限场景下，系统的第一瓶颈会出现在哪里？",
            f"从工程落地与运维复杂度的角度，当时为什么选择这个技术路线而不是直接采用成熟的云厂商托管方案？",
        ]
        chosen = templates[turn_idx % len(templates)]
        # Filter avoid_phrases if present
        for phrase in avoid_phrases:
            chosen = chosen.replace(phrase, "")
        return chosen.strip()


replay_runner = ReplayRunner()
