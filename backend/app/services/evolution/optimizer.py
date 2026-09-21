"""Optimizer Agent for synthesizing Critic diagnoses into structured candidate Spec revisions.

Enforces strict priority order of optimization:
1. Prompt and conversational constraints (avoid_phrases, formatting, length rules)
2. Follow-up strategy (probing depth, rotation thresholds, anti-repetition guards)
3. Example library & retrieval policy
4. Persona parameters (rigor_level, patience, tone)
5. Model routing and inference parameters

Safety Rules:
- Never modifies production Prompt in real-time.
- Creates immutable draft EvolutionCandidateModel for offline validation.
- An agent is strictly prohibited from approving its own generated candidate.
"""

import copy
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.architecture import EvolutionCandidateModel

logger = logging.getLogger(__name__)


class OptimizerAgent:
    """Agent that translates Critic defect reports into improved candidate specifications."""

    def optimize_spec(
        self,
        base_spec: Dict[str, Any],
        critic_diagnosis: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Creates an improved candidate specification following the 5-tier priority hierarchy."""
        candidate_spec = copy.deepcopy(base_spec)
        defects = critic_diagnosis.get("defects", [])

        # Priority 1: Prompt & Conversational Constraints (avoid_phrases, spoken constraints)
        guardrails = candidate_spec.setdefault("guardrails", {})
        avoid_phrases = set(guardrails.get("avoid_phrases", []))
        prompt_rules = set(guardrails.get("prompt_rules", []))

        for d in defects:
            dtype = d.get("type")
            target = d.get("target_area")

            if dtype == "robotic_cliche_opener" or target == "avoid_phrases":
                # Extract specific phrases to avoid
                desc = d.get("description", "")
                for phrase in ["好的", "非常棒", "感谢您的回答", "接下来让我们", "太棒了", "很好"]:
                    if phrase in desc:
                        avoid_phrases.add(phrase)
                avoid_phrases.add("好的")
                avoid_phrases.add("非常棒")
            elif dtype == "rating_leakage":
                prompt_rules.add("严禁在问答中向候选人直接或间接透露评分、内部评价或及格判定。")
            elif dtype == "spoken_format_violation":
                prompt_rules.add("全程严格使用自然口语交流，禁止任何 Markdown 格式、代码反引号或项目编号。")
            elif dtype == "verbosity_violation":
                prompt_rules.add("单轮发言严格控制在 2 至 4 句话内，保持精炼干脆。")

        guardrails["avoid_phrases"] = sorted(list(avoid_phrases))
        guardrails["prompt_rules"] = sorted(list(prompt_rules))

        # Priority 2: Follow-up Strategy
        strategy = candidate_spec.setdefault("strategy", {})
        has_repetition_defect = any(d.get("type") == "repetitive_followup_loop" for d in defects)
        if has_repetition_defect:
            strategy["max_follow_ups_per_topic"] = min(strategy.get("max_follow_ups_per_topic", 3), 2)
            strategy["enforce_topic_rotation"] = True

        # Priority 3: Example Library & Retrieval (if specified in defects)
        examples = candidate_spec.setdefault("example_library", {})
        if not examples.get("few_shot_turns"):
            examples["few_shot_turns"] = [
                {
                    "input": "我之前做过一些接口优化工作。",
                    "response": "针对接口性能优化，当时遇到的核心瓶颈是由于慢查询还是线程池争抢导致的？"
                }
            ]

        # Priority 4: Persona Parameters
        persona = candidate_spec.setdefault("persona", {})
        if any(d.get("severity") == "high" for d in defects):
            # Calibrate rigor and patience
            persona["rigor_level"] = round(max(0.5, min(1.0, persona.get("rigor_level", 0.8) + 0.05)), 2)
            persona["patience_score"] = round(max(0.5, min(1.0, persona.get("patience_score", 0.8) + 0.05)), 2)

        # Priority 5: Model Routing & Inference Parameters
        runtime = candidate_spec.setdefault("runtime", {})
        if "temperature" not in runtime:
            runtime["temperature"] = 0.5  # lower temperature for more consistent, less robotic adherence

        # Bump version or mark candidate metadata
        meta = candidate_spec.setdefault("metadata", {})
        meta["optimized_by"] = "OptimizerAgent"
        meta["applied_defects_count"] = len(defects)

        return candidate_spec

    async def propose_candidate(
        self,
        session: AsyncSession,
        interviewer_id: str,
        base_version_id: Optional[str],
        critic_diagnosis: Dict[str, Any],
        current_spec: Dict[str, Any],
        candidate_version: Optional[str] = None,
        notes: str = "",
    ) -> EvolutionCandidateModel:
        """Generates a candidate spec from Critic diagnoses and persists as a draft EvolutionCandidateModel."""
        optimized_spec = self.optimize_spec(current_spec, critic_diagnosis)

        candidate = EvolutionCandidateModel(
            interviewer_id=interviewer_id,
            candidate_version=candidate_version or "v-candidate",
            base_version_id=base_version_id,
            status="draft",  # strictly starts in draft state
            candidate_spec=optimized_spec,
            replay_metrics={},
            safety_check_passed=False,
            created_by="optimizer",
            review_notes=notes or f"Generated based on {critic_diagnosis.get('defects_count', 0)} Critic defects.",
        )
        session.add(candidate)
        await session.commit()
        await session.refresh(candidate)

        logger.info(f"OptimizerAgent created draft evolution candidate {candidate.id} for interviewer {interviewer_id}")
        return candidate


optimizer_agent = OptimizerAgent()
