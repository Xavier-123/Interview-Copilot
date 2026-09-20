"""Memory Gate enforcing privacy, consent, boundaries, and deduplication."""

import re
from typing import List, Optional, Tuple
from app.services.memory.policy import ALLOWED_SCOPES


class MemoryConsentRequired(PermissionError):
    """Raised when writing to candidate scope without explicit user consent."""


class InvalidMemoryScopeError(ValueError):
    """Raised when an unrecognized memory scope is supplied."""


class MemoryGate:
    """Gatekeeper for long-term memory operations."""

    @staticmethod
    def validate_scope(scope: str) -> None:
        if scope not in ALLOWED_SCOPES:
            raise InvalidMemoryScopeError(f"Scope '{scope}' is not valid. Allowed scopes: {ALLOWED_SCOPES}")

    @staticmethod
    def verify_consent(scope: str, consent: bool) -> None:
        if scope == "candidate" and not consent:
            raise MemoryConsentRequired("Writing candidate long-term memory requires explicit user consent.")

    @staticmethod
    def sanitize_pii(text: str) -> Tuple[str, List[str]]:
        """Identifies and masks common PII (phone numbers, emails, ID numbers).
        
        Returns (sanitized_text, list_of_detected_pii_types).
        """
        detected: List[str] = []
        sanitized = text

        # 1. Chinese Mobile Phone (11 digits, 1[3-9]...)
        phone_pattern = re.compile(r"(?<!\d)(?:(?:\+|00)86)?(1[3-9]\d{9})(?!\d)")
        if phone_pattern.search(sanitized):
            detected.append("phone_number")
            sanitized = phone_pattern.sub(lambda m: m.group(0)[:3] + "****" + m.group(0)[-4:], sanitized)

        # 2. Email Address
        email_pattern = re.compile(r"([a-zA-Z0-9_.+-]+)@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)")
        if email_pattern.search(sanitized):
            detected.append("email")
            def _mask_email(match):
                user = match.group(1)
                domain = match.group(2)
                prefix = user[:2] if len(user) >= 2 else user[:1]
                return f"{prefix}***@{domain}"
            sanitized = email_pattern.sub(_mask_email, sanitized)

        # 3. Chinese National ID Card (18 digits)
        id_pattern = re.compile(r"(?<!\d)(\d{6})(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(\d{3}[\dXx])(?!\d)")
        if id_pattern.search(sanitized):
            detected.append("national_id")
            sanitized = id_pattern.sub(r"\1********\2", sanitized)

        return sanitized, detected

    @staticmethod
    def check_duplicate(new_content: str, existing_contents: List[str], threshold: float = 0.85) -> bool:
        """Simple token overlap check to avoid duplicate memory items."""
        if not existing_contents:
            return False
        clean_new = set(new_content.strip().lower())
        for existing in existing_contents:
            clean_exist = set(existing.strip().lower())
            if not clean_new or not clean_exist:
                continue
            overlap = len(clean_new & clean_exist) / max(len(clean_new), len(clean_exist))
            if overlap >= threshold:
                return True
        return False
