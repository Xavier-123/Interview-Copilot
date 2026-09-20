"""Memory service package for Interview-Copilot.

Provides MemoryGateway, MemoryGate, MemoryRepository, and MemoryRetriever
with 4-scope isolation and consent-based privacy protection.
"""

from app.services.memory.gate import MemoryConsentRequired, MemoryGate
from app.services.memory.policy import ALLOWED_SCOPES, get_policy_summary
from app.services.memory.repository import MemoryRepository
from app.services.memory.retriever import MemoryRetriever
from app.services.memory.gateway import MemoryGateway, memory_gateway

__all__ = [
    "MemoryConsentRequired",
    "MemoryGate",
    "ALLOWED_SCOPES",
    "get_policy_summary",
    "MemoryRepository",
    "MemoryRetriever",
    "MemoryGateway",
    "memory_gateway",
]
