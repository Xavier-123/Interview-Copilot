"""Memory retriever providing keyword matching, scoring, and vector search adapter."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from app.models.architecture import MemoryItemModel
from app.services.memory.repository import MemoryRepository


class VectorSearchAdapter(ABC):
    """Abstract adapter interface for future vector embedding search (Phase 3/4)."""

    @abstractmethod
    async def search_similar(
        self,
        query: str,
        scope: str,
        owner_id: Optional[str] = None,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        pass


class MemoryRetriever:
    """Retrieves and ranks relevant memories using structured filtering and keyword relevance."""

    def __init__(self, repo: MemoryRepository, vector_adapter: Optional[VectorSearchAdapter] = None):
        self.repo = repo
        self.vector_adapter = vector_adapter

    async def retrieve(
        self,
        owner_id: str,
        query: Optional[str] = None,
        scope: Optional[str] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Retrieves memories matching the owner, scope, and optional query string."""
        if not query or not query.strip():
            items = await self.repo.list_memories(owner_id=owner_id, scope=scope, limit=limit)
        else:
            items = await self.repo.search_text(
                query_text=query.strip(),
                owner_id=owner_id,
                scope=scope,
                limit=limit,
            )

        return [
            {
                "id": item.id,
                "scope": item.scope,
                "owner_id": item.owner_id,
                "subject_id": item.subject_id,
                "content": item.content,
                "source": item.source,
                "confidence": item.confidence,
                "consent": item.consent,
                "expires_at": item.expires_at.isoformat() if item.expires_at else None,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "version": item.version,
                "metadata": item.metadata_json or {},
            }
            for item in items
        ]
