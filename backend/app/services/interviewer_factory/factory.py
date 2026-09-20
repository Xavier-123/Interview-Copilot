"""Interviewer Factory service.

Orchestrates validation, compilation, immutability, and version registration
for interviewer specifications.
"""

import logging
from typing import Any, Dict, Optional, Union
from app.services.interviewer_factory.schema import (
    BehaviorConfig,
    InterviewConfig,
    InterviewerSpec,
    PersonaConfig,
)
from app.services.interviewer_factory.validator import ensure_valid_spec
from app.services.interviewer_factory.compiler import compile_system_prompt
from app.services.interviewer_registry import interviewer_registry

logger = logging.getLogger(__name__)


class InterviewerFactory:
    """Factory service for creating, validating, compiling, and publishing InterviewerSpecs."""

    def parse_and_validate(self, data: Union[Dict[str, Any], InterviewerSpec]) -> InterviewerSpec:
        """Parses a raw dict or spec, populates defaults, and performs security checks."""
        if isinstance(data, dict):
            spec = InterviewerSpec(**data)
        else:
            spec = data
        return ensure_valid_spec(spec)

    def compile(self, spec: InterviewerSpec) -> str:
        """Compiles an InterviewerSpec into executable prompt instructions."""
        return compile_system_prompt(spec)

    async def create_and_register_version(
        self,
        spec_data: Union[Dict[str, Any], InterviewerSpec],
        *,
        created_by: str = "admin",
        rubric_id: Optional[str] = None,
        auto_champion: bool = False,
    ) -> Dict[str, Any]:
        """Validates, compiles, and registers a new immutable interviewer version."""
        spec = self.parse_and_validate(spec_data)
        compiled_prompt = self.compile(spec)

        spec_dict = spec.model_dump()
        spec_dict["compiled_system_prompt"] = compiled_prompt

        version_info = await interviewer_registry.create_version(
            interviewer_id=spec.interviewer_id,
            display_name=spec.display_name,
            spec=spec_dict,
            prompt_template_version=spec.prompt_template_version,
            rubric_id=rubric_id or spec.rubric_id,
            created_by=created_by,
        )

        version_id = version_info["id"]
        if auto_champion:
            try:
                await interviewer_registry.approve(version_id)
                version_info["status"] = "champion"
            except Exception as e:
                logger.warning(f"Failed to auto-approve version {version_id}: {e}")

        version_info["compiled_system_prompt"] = compiled_prompt
        return version_info

    def from_persona_data(self, persona: Any) -> InterviewerSpec:
        """Converts an InterviewerPersona model or payload into a standard InterviewerSpec."""
        # Handle dict or ORM model
        def _get(attr, default=None):
            if isinstance(persona, dict):
                return persona.get(attr, default)
            return getattr(persona, attr, default)

        key = _get("key") or f"persona_{_get('name', 'custom')}"
        name = _get("name", "特邀面试官")
        system_prompt = _get("system_prompt", "")
        focus_topics = _get("focus_topics") or []
        school = _get("school_of_thought") or "standard"
        dislikes = _get("dislikes") or []
        preferences = _get("preferences") or []
        skepticism = float(_get("skepticism_level", 0.5) or 0.5)
        traits = _get("interaction_traits") or {}

        # Derive tone & challenge from traits if available
        tone = traits.get("tone") or ("stress" if skepticism > 0.7 else "rigorous")
        challenge = min(1.0, max(0.0, skepticism * 1.2))

        return InterviewerSpec(
            interviewer_id=key,
            display_name=name,
            avatar=_get("avatar") or "🎭",
            description=_get("description") or "",
            seniority="senior",
            persona=PersonaConfig(
                tone=tone,
                warmth=0.4 if skepticism > 0.6 else 0.6,
                challenge=round(challenge, 2),
                interruption=0.2 if skepticism < 0.6 else 0.4,
            ),
            interview=InterviewConfig(
                duration_minutes=45,
                competencies=focus_topics[:4],
            ),
            behavior=BehaviorConfig(
                ask_one_question_at_a_time=True,
                follow_up_before_switching=True,
                avoid_phrases=["非常棒", "感谢你的精彩回答", "很好，接下来让我们"],
            ),
            prompt_template_version="spec-persona-v1",
            system_prompt=system_prompt,
            school_of_thought=school,
            focus_topics=focus_topics,
            dislikes=dislikes,
            preferences=preferences,
            skepticism_level=skepticism,
            interaction_traits=traits,
            opening_hint=_get("opening_hint") or "",
            deep_dive_hint=_get("deep_dive_hint") or "",
            probe_hint=_get("probe_hint") or "",
            switch_hint=_get("switch_hint") or "",
        )

    async def sync_persona_version(self, persona: Any, created_by: str = "user") -> Dict[str, Any]:
        """Convenience method to convert and register a persona as a version."""
        spec = self.from_persona_data(persona)
        return await self.create_and_register_version(
            spec,
            created_by=created_by,
            auto_champion=True,
        )


interviewer_factory = InterviewerFactory()
