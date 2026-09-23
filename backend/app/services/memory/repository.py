"""Storage repository for MemoryItemModel and EvidenceItemModel."""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import select, and_, or_, desc, delete
from app.models.architecture import EvidenceItemModel, MemoryConsentModel, MemoryItemModel
from app.models.db import AsyncSessionLocal


class MemoryRepository:
    """Encapsulates database operations for memories and evidence."""

    async def add_memory(
        self,
        *,
        scope: str,
        owner_id: str,
        content: str,
        source: Optional[str] = None,
        subject_id: Optional[str] = None,
        confidence: float = 0.0,
        consent: bool = True,
        expires_at: Optional[datetime] = None,
        version: str = "1",
        metadata_json: Optional[Dict[str, Any]] = None,
    ) -> str:
        memory_id = str(uuid.uuid4())
        async with AsyncSessionLocal() as db:
            db.add(MemoryItemModel(
                id=memory_id,
                scope=scope,
                owner_id=owner_id,
                subject_id=subject_id,
                content=content,
                source=source,
                confidence=max(0.0, min(1.0, float(confidence))),
                consent=consent,
                expires_at=expires_at,
                version=version,
                metadata_json=metadata_json or {},
                created_at=datetime.utcnow(),
            ))
            await db.commit()
        return memory_id

    async def get_consent(self, owner_id: str) -> bool:
        async with AsyncSessionLocal() as db:
            item = await db.get(MemoryConsentModel, owner_id)
            return bool(item and item.enabled)

    async def set_consent(self, owner_id: str, enabled: bool) -> bool:
        async with AsyncSessionLocal() as db:
            item = await db.get(MemoryConsentModel, owner_id)
            if item is None:
                item = MemoryConsentModel(owner_id=owner_id, enabled=bool(enabled))
                db.add(item)
            else:
                item.enabled = bool(enabled)
                item.updated_at = datetime.utcnow()
            await db.commit()
        return bool(enabled)

    async def get_memory(self, memory_id: str) -> Optional[MemoryItemModel]:
        async with AsyncSessionLocal() as db:
            return await db.get(MemoryItemModel, memory_id)

    async def delete_memory(self, memory_id: str, owner_id: Optional[str] = None) -> bool:
        async with AsyncSessionLocal() as db:
            query = select(MemoryItemModel).where(MemoryItemModel.id == memory_id)
            if owner_id:
                query = query.where(MemoryItemModel.owner_id == owner_id)
            result = await db.execute(query)
            item = result.scalars().first()
            if not item:
                return False
            await db.delete(item)
            await db.commit()
            return True

    async def list_memories(
        self,
        owner_id: Optional[str] = None,
        scope: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[MemoryItemModel]:
        async with AsyncSessionLocal() as db:
            query = select(MemoryItemModel)
            conditions = []
            if owner_id:
                conditions.append(MemoryItemModel.owner_id == owner_id)
            if scope:
                conditions.append(MemoryItemModel.scope == scope)
            conditions.extend([
                MemoryItemModel.consent.is_(True),
                or_(MemoryItemModel.expires_at.is_(None), MemoryItemModel.expires_at > datetime.utcnow()),
            ])
            query = query.where(and_(*conditions))
            query = query.order_by(desc(MemoryItemModel.created_at)).limit(limit).offset(offset)
            result = await db.execute(query)
            return list(result.scalars().all())

    async def search_text(
        self,
        query_text: str,
        owner_id: Optional[str] = None,
        scope: Optional[str] = None,
        limit: int = 20,
    ) -> List[MemoryItemModel]:
        async with AsyncSessionLocal() as db:
            query = select(MemoryItemModel)
            conditions = []
            if owner_id:
                conditions.append(MemoryItemModel.owner_id == owner_id)
            if scope:
                conditions.append(MemoryItemModel.scope == scope)
            if query_text:
                # Substring match on content
                conditions.append(MemoryItemModel.content.ilike(f"%{query_text}%"))
            conditions.extend([
                MemoryItemModel.consent.is_(True),
                or_(MemoryItemModel.expires_at.is_(None), MemoryItemModel.expires_at > datetime.utcnow()),
            ])
            query = query.where(and_(*conditions))
            query = query.order_by(desc(MemoryItemModel.confidence), desc(MemoryItemModel.created_at)).limit(limit)
            result = await db.execute(query)
            return list(result.scalars().all())

    async def add_evidence(
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
                created_at=datetime.utcnow(),
            ))
            await db.commit()
        return evidence_id

    async def list_evidence_by_session(self, session_id: str) -> List[EvidenceItemModel]:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(EvidenceItemModel)
                .where(EvidenceItemModel.session_id == session_id)
                .order_by(EvidenceItemModel.created_at.asc())
            )
            return list(result.scalars().all())
