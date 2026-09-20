"""Validator and security checker for InterviewerSpec."""

import re
from typing import List, Tuple
from app.services.interviewer_factory.schema import InterviewerSpec

_DANGEROUS_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.IGNORECASE),
    re.compile(r"reveal\s+(the\s+)?system\s+prompt", re.IGNORECASE),
    re.compile(r"<\|im_start\|>|<\|im_end\|>|<\|system\|>", re.IGNORECASE),
    re.compile(r"__import__|subprocess|os\.system|eval\(|exec\(", re.IGNORECASE),
]


class SpecValidationError(ValueError):
    """Raised when an InterviewerSpec fails schema or security validation."""


def validate_interviewer_spec(spec: InterviewerSpec) -> Tuple[bool, List[str]]:
    """Validates an InterviewerSpec for business constraints and prompt safety.
    
    Returns (is_valid, error_messages).
    """
    errors: List[str] = []

    # 1. Identifier checks
    if not re.match(r"^[a-zA-Z0-9_\-]+$", spec.interviewer_id):
        errors.append(f"interviewer_id '{spec.interviewer_id}' contains invalid characters (only alphanumeric, _, - allowed).")

    if len(spec.display_name.strip()) == 0:
        errors.append("display_name cannot be empty.")

    # 2. Security / Prompt Injection Checks
    content_to_check = [
        spec.display_name,
        spec.description,
        spec.system_prompt or "",
        spec.opening_hint,
        spec.deep_dive_hint,
        spec.probe_hint,
        spec.switch_hint,
    ] + spec.dislikes + spec.preferences + spec.focus_topics

    combined_text = "\n".join(content_to_check)
    for pattern in _DANGEROUS_PATTERNS:
        if pattern.search(combined_text):
            errors.append(f"Spec contains potentially dangerous instruction or prompt injection attempt: '{pattern.pattern}'.")

    # 3. Numeric range checks (pydantic already handles basic bounds, enforce business logic)
    if spec.persona.challenge > 1.0 or spec.persona.challenge < 0.0:
        errors.append("persona.challenge must be between 0.0 and 1.0.")
    if spec.persona.warmth > 1.0 or spec.persona.warmth < 0.0:
        errors.append("persona.warmth must be between 0.0 and 1.0.")

    return len(errors) == 0, errors


def ensure_valid_spec(spec: InterviewerSpec) -> InterviewerSpec:
    """Raises SpecValidationError if invalid, otherwise returns the spec."""
    is_valid, errors = validate_interviewer_spec(spec)
    if not is_valid:
        raise SpecValidationError("; ".join(errors))
    return spec
