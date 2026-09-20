"""Storage gateway for evidence and consent-protected long-term memory."""

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import select

from app.models.architecture import EvidenceItemModel, MemoryItemModel
from app.models.db import AsyncSessionLocal


class MemoryConsentRequired(PermissionError):
    """Raised when a caller tries to write candidate memory without consent."""


class MemoryGateway:
    async def write_evidence(
        self,
        session_id: str,
        turn_id: Optional[str],
        observation: Dict[str, Any],
    ) -> str:
        evidence_id = str(uuid.uuid4())
        async with AsyncSessionLocal() as db:
            db.add(EvidenceItemModel(
                id=evidence_id,
                session_id=session_id,
                turn_id=turn_id,
                topic=observation.get("topic"),
                payload=observation,
                source=f"session:{session_id}",
                confidence=float(observation.get("satisfaction_score") or 0.0),
            ))
            await db.commit()
        return evidence_id

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
        if not consent:
            raise MemoryConsentRequired("candidate long-term memory requires explicit consent")
        memory_id = str(uuid.uuid4())
        async with AsyncSessionLocal() as db:
            db.add(MemoryItemModel(
                id=memory_id,
                scope="candidate",
                owner_id=owner_id,
                subject_id=subject_id,
                content=content,
                source=source,
                confidence=max(0.0, min(1.0, float(confidence))),
                consent=True,
                expires_at=expires_at,
            ))
            await db.commit()
        return memory_id

    async def list_candidate_memories(self, owner_id: str) -> list[Dict[str, Any]]:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MemoryItemModel)
                .where(
                    MemoryItemModel.owner_id == owner_id,
                    MemoryItemModel.scope == "candidate",
                    MemoryItemModel.consent.is_(True),
                )
                .order_by(MemoryItemModel.created_at.desc())
            )
            return [
                {
                    "id": item.id,
                    "content": item.content,
                    "source": item.source,
                    "confidence": item.confidence,
                    "expires_at": item.expires_at.isoformat() if item.expires_at else None,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                }
                for item in result.scalars().all()
            ]


memory_gateway = MemoryGateway()
