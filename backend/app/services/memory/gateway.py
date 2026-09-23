"""Unified Memory Gateway with multi-scope enforcement, PII protection, and audit logging."""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.services.memory.gate import MemoryGate, MemoryConsentRequired
from app.services.memory.policy import ALLOWED_SCOPES, get_policy_summary
from app.services.memory.repository import MemoryRepository
from app.services.memory.retriever import MemoryRetriever
from app.services.audit import log_audit_event

logger = logging.getLogger(__name__)


class MemoryGateway:
    """Enterprise-grade Memory Gateway fulfilling Phase 2 requirements."""

    def __init__(self):
        self.repo = MemoryRepository()
        self.gate = MemoryGate()
        self.retriever = MemoryRetriever(self.repo)

    async def write_evidence(
        self,
        session_id: str,
        turn_id: Optional[str],
        observation: Dict[str, Any],
    ) -> str:
        """Persists turn-by-turn observation evidence."""
        return await self.repo.add_evidence(session_id, turn_id, observation)

    async def list_evidence(self, session_id: str) -> List[Dict[str, Any]]:
        """Lists structured observations recorded for a session."""
        items = await self.repo.list_evidence_by_session(session_id)
        return [
            {
                "id": item.id,
                "session_id": item.session_id,
                "turn_id": item.turn_id,
                "topic": item.topic,
                "payload": item.payload,
                "confidence": item.confidence,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in items
        ]

    async def write_candidate_memory(
        self,
        *,
        owner_id: str,
        subject_id: Optional[str],
        content: str,
        source: str,
        consent: bool,
        confidence: float = 0.0,
        expires_at: Optional[datetime] = None,
    ) -> str:
        """Writes candidate long-term memory with strict consent check and PII masking."""
        return await self.write_memory(
            scope="candidate",
            owner_id=owner_id,
            subject_id=subject_id,
            content=content,
            source=source,
            consent=consent,
            confidence=confidence,
            expires_at=expires_at,
        )

    async def write_memory(
        self,
        *,
        scope: str,
        owner_id: str,
        content: str,
        source: Optional[str] = None,
        subject_id: Optional[str] = None,
        consent: bool = False,
        confidence: float = 0.0,
        expires_at: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Generic memory writer enforcing scope checks, consent, PII masking, and audit."""
        # 1. Validate scope & consent
        self.gate.validate_scope(scope)
        self.gate.verify_consent(scope, consent)
        if scope == "candidate" and not await self.repo.get_consent(owner_id):
            raise MemoryConsentRequired("Candidate memory consent is not enabled for this owner.")

        # 2. PII Sanitization
        sanitized_content, detected_pii = self.gate.sanitize_pii(content)
        meta = dict(metadata or {})
        if detected_pii:
            meta["masked_pii"] = detected_pii

        # 3. Save to repository
        memory_id = await self.repo.add_memory(
            scope=scope,
            owner_id=owner_id,
            subject_id=subject_id,
            content=sanitized_content,
            source=source,
            confidence=confidence,
            consent=consent,
            expires_at=expires_at,
            metadata_json=meta,
        )

        # 4. Audit Log
        await log_audit_event(
            event_type="memory_item_created",
            actor=owner_id,
            target_id=memory_id,
            payload={
                "scope": scope,
                "source": source,
                "confidence": confidence,
                "pii_detected": bool(detected_pii),
            },
        )

        return memory_id

    async def set_consent(self, owner_id: str, enabled: bool) -> bool:
        """Persist the local user's candidate-memory authorization."""
        return await self.repo.set_consent(owner_id, enabled)

    async def has_consent(self, owner_id: str) -> bool:
        return await self.repo.get_consent(owner_id)

    async def list_candidate_memories(self, owner_id: str) -> List[Dict[str, Any]]:
        """Backward-compatible helper to list consented memories for a candidate."""
        if not await self.has_consent(owner_id):
            return []
        return await self.retriever.retrieve(owner_id=owner_id, scope="candidate", limit=100)

    async def list_memories(
        self,
        owner_id: str,
        scope: Optional[str] = None,
        query: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Lists or searches memories for an owner."""
        memories = await self.retriever.retrieve(
            owner_id=owner_id,
            scope=scope,
            query=query,
            limit=limit,
        )
        if not await self.has_consent(owner_id):
            memories = [item for item in memories if item.get("scope") != "candidate"]
        return memories

    async def delete_memory(self, memory_id: str, owner_id: Optional[str] = None) -> bool:
        """Deletes a memory item and logs an audit record."""
        success = await self.repo.delete_memory(memory_id, owner_id=owner_id)
        if success:
            await log_audit_event(
                event_type="memory_item_deleted",
                actor=owner_id or "user",
                target_id=memory_id,
                payload={"status": "deleted"},
            )
        return success

    def get_policy(self) -> Dict[str, Any]:
        """Returns metadata about the active memory governance policy."""
        return get_policy_summary()


memory_gateway = MemoryGateway()
