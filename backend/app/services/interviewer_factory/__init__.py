"""Interviewer factory package for Interview-Copilot.

Provides schema validation, prompt compilation, and version registration
for InterviewerSpecs.
"""

from app.services.interviewer_factory.schema import (
    BehaviorConfig,
    InterviewConfig,
    InterviewerSpec,
    PersonaConfig,
)
from app.services.interviewer_factory.factory import InterviewerFactory, interviewer_factory
from app.services.interviewer_factory.validator import (
    SpecValidationError,
    validate_interviewer_spec,
    ensure_valid_spec,
)
from app.services.interviewer_factory.compiler import compile_system_prompt

__all__ = [
    "BehaviorConfig",
    "InterviewConfig",
    "InterviewerSpec",
    "PersonaConfig",
    "InterviewerFactory",
    "interviewer_factory",
    "SpecValidationError",
    "validate_interviewer_spec",
    "ensure_valid_spec",
    "compile_system_prompt",
]
