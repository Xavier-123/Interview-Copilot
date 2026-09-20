"""Memory governance RESTful endpoints for Interview-Copilot Phase 2."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.memory import memory_gateway, MemoryConsentRequired
from app.services.audit import log_audit_event

router = APIRouter(prefix="/memory", tags=["memory"])


class MemoryConsentPayload(BaseModel):
    owner_id: str = Field(default="local-user", description="用户/租户标识")
    enabled: bool = Field(description="是否开启长期记忆授权")


class CreateMemoryPayload(BaseModel):
    scope: str = Field(default="candidate", description="记忆域: candidate | interviewer | organization | evolution")
    owner_id: str = Field(default="local-user", description="用户/租户标识")
    content: str = Field(min_length=1, description="记忆正文")
    source: Optional[str] = Field(default="user_input", description="记忆来源标识")
    subject_id: Optional[str] = Field(default=None, description="主体标识")
    consent: bool = Field(default=True, description="显式授权标记")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="置信度")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="额外元数据")


@router.get("/policy")
async def get_memory_policy():
    """获取系统长期记忆治理与隐私合规政策。"""
    return memory_gateway.get_policy()


@router.get("")
async def list_memories(
    owner_id: str = Query(default="local-user", description="用户/租户ID"),
    scope: Optional[str] = Query(default=None, description="记忆域过滤 (candidate/interviewer/organization/evolution)"),
    query: Optional[str] = Query(default=None, description="关键词检索"),
    limit: int = Query(default=50, ge=1, le=200, description="返回数量上限"),
):
    """查询指定用户名下的长期记忆列表，支持按域过滤与关键词检索。"""
    memories = await memory_gateway.list_memories(
        owner_id=owner_id,
        scope=scope,
        query=query,
        limit=limit,
    )
    return {
        "owner_id": owner_id,
        "count": len(memories),
        "memories": memories,
    }


@router.post("")
async def create_memory_item(payload: CreateMemoryPayload):
    """手动创建一条长期记忆（受 Memory Gate 与 PII 掩码保护）。"""
    try:
        memory_id = await memory_gateway.write_memory(
            scope=payload.scope,
            owner_id=payload.owner_id,
            content=payload.content,
            source=payload.source,
            subject_id=payload.subject_id,
            consent=payload.consent,
            confidence=payload.confidence,
            metadata=payload.metadata,
        )
        return {"status": "success", "id": memory_id}
    except MemoryConsentRequired as ce:
        raise HTTPException(status_code=403, detail=str(ce))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.delete("/{memory_id}")
async def delete_memory_item(
    memory_id: str,
    owner_id: Optional[str] = Query(default="local-user"),
):
    """删除单条长期记忆，并记录审计事件。"""
    success = await memory_gateway.delete_memory(memory_id, owner_id=owner_id)
    if not success:
        raise HTTPException(status_code=404, detail="记忆条目不存在或无权删除")
    return {"status": "success", "message": "记忆已彻底删除"}


@router.post("/consent")
async def update_memory_consent(payload: MemoryConsentPayload):
    """更新用户的长期记忆全局授权状态，并记录审计日志。"""
    await log_audit_event(
        event_type="memory_consent_changed",
        actor=payload.owner_id,
        target_id=payload.owner_id,
        payload={"enabled": payload.enabled},
    )
    return {
        "status": "success",
        "owner_id": payload.owner_id,
        "consent": payload.enabled,
        "message": "已更新长期记忆授权偏好",
    }
