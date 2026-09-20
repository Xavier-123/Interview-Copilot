import uuid
import secrets
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db import get_db
from app.models.persona import InterviewerPersona

router = APIRouter(prefix="/personas", tags=["personas"])

MAX_SYSTEM_PROMPT_LENGTH = 2000
PERSONA_KEY_PREFIX = "persona_"


def _generate_persona_key() -> str:
    """生成消息 name / 路由标识用的短 key（interview_messages.name 限 32 字符）。"""
    return f"{PERSONA_KEY_PREFIX}{secrets.token_hex(4)}"


def _persona_snapshot(p: InterviewerPersona) -> dict:
    """返回写入会话 custom_config 的完整人设快照。"""
    return {
        "id": p.id,
        "key": p.key,
        "name": p.name,
        "avatar": p.avatar or "🎭",
        "description": p.description or "",
        "system_prompt": p.system_prompt,
        "focus_topics": p.focus_topics or [],
        "opening_hint": p.opening_hint or "",
        "deep_dive_hint": p.deep_dive_hint or "",
        "probe_hint": p.probe_hint or "",
        "switch_hint": p.switch_hint or "",
        "school_of_thought": getattr(p, "school_of_thought", "standard") or "standard",
        "dislikes": getattr(p, "dislikes", []) or [],
        "preferences": getattr(p, "preferences", []) or [],
        "skepticism_level": float(getattr(p, "skepticism_level", 0.5) or 0.5),
        "interaction_traits": getattr(p, "interaction_traits", {}) or {},
    }


def _persona_response(p: InterviewerPersona) -> dict:
    data = _persona_snapshot(p)
    data["enabled"] = bool(p.enabled)
    data["created_at"] = p.created_at.isoformat() if p.created_at else None
    data["updated_at"] = p.updated_at.isoformat() if p.updated_at else None
    return data


class PersonaPayload(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    avatar: Optional[str] = Field(default="🎭", max_length=8)
    description: str = Field(default="", max_length=128)
    system_prompt: str = Field(min_length=5, max_length=MAX_SYSTEM_PROMPT_LENGTH)
    focus_topics: List[str] = Field(default_factory=list)
    opening_hint: str = Field(default="", max_length=400)
    deep_dive_hint: str = Field(default="", max_length=400)
    probe_hint: str = Field(default="", max_length=400)
    switch_hint: str = Field(default="", max_length=400)
    school_of_thought: Optional[str] = Field(default="standard", max_length=32)
    dislikes: List[str] = Field(default_factory=list)
    preferences: List[str] = Field(default_factory=list)
    skepticism_level: float = Field(default=0.5, ge=0.0, le=1.0)
    interaction_traits: Optional[dict] = Field(default_factory=dict)
    enabled: bool = True

    @field_validator("focus_topics")
    @classmethod
    def normalize_focus_topics(cls, v: List[str]) -> List[str]:
        cleaned = [t.strip() for t in (v or []) if t and t.strip()]
        return cleaned[:8]


async def _get_persona(persona_id: str, db: AsyncSession) -> InterviewerPersona:
    result = await db.execute(
        select(InterviewerPersona).where(InterviewerPersona.id == persona_id)
    )
    persona = result.scalars().first()
    if not persona:
        raise HTTPException(status_code=404, detail="面试官角色不存在")
    return persona


@router.get("/presets")
async def get_persona_presets():
    """获取系统内置的高拟真流派面试官预设列表（排障老炮、源码极客、业务ROI、防套路打假官）。"""
    from app.agents.persona_presets import PERSONA_PRESETS
    return {"presets": PERSONA_PRESETS}


@router.get("")
async def list_personas(
    db: AsyncSession = Depends(get_db),
):
    """列出全部自定义面试官角色（本地单用户）。"""
    result = await db.execute(
        select(InterviewerPersona)
        .order_by(InterviewerPersona.created_at.desc())
    )
    return {"personas": [_persona_response(p) for p in result.scalars().all()]}


@router.post("")
async def create_persona(
    payload: PersonaPayload,
    db: AsyncSession = Depends(get_db),
):
    """创建自定义面试官角色。"""
    persona = InterviewerPersona(
        id=str(uuid.uuid4()),
        key=_generate_persona_key(),
        name=payload.name.strip(),
        avatar=payload.avatar or "🎭",
        description=payload.description.strip(),
        system_prompt=payload.system_prompt.strip(),
        focus_topics=payload.focus_topics,
        opening_hint=payload.opening_hint.strip(),
        deep_dive_hint=payload.deep_dive_hint.strip(),
        probe_hint=payload.probe_hint.strip(),
        switch_hint=payload.switch_hint.strip(),
        school_of_thought=payload.school_of_thought or "standard",
        dislikes=payload.dislikes or [],
        preferences=payload.preferences or [],
        skepticism_level=payload.skepticism_level,
        interaction_traits=payload.interaction_traits or {},
        enabled=payload.enabled,
    )
    db.add(persona)
    await db.commit()
    await db.refresh(persona)
    return {"status": "success", "persona": _persona_response(persona)}


@router.put("/{persona_id}")
async def update_persona(
    persona_id: str,
    payload: PersonaPayload,
    db: AsyncSession = Depends(get_db),
):
    """更新自定义面试官角色（不影响已快照进历史会话的人设）。"""
    persona = await _get_persona(persona_id, db)
    persona.name = payload.name.strip()
    persona.avatar = payload.avatar or "🎭"
    persona.description = payload.description.strip()
    persona.system_prompt = payload.system_prompt.strip()
    persona.focus_topics = payload.focus_topics
    persona.opening_hint = payload.opening_hint.strip()
    persona.deep_dive_hint = payload.deep_dive_hint.strip()
    persona.probe_hint = payload.probe_hint.strip()
    persona.switch_hint = payload.switch_hint.strip()
    persona.school_of_thought = payload.school_of_thought or "standard"
    persona.dislikes = payload.dislikes or []
    persona.preferences = payload.preferences or []
    persona.skepticism_level = payload.skepticism_level
    persona.interaction_traits = payload.interaction_traits or {}
    persona.enabled = payload.enabled
    await db.commit()
    await db.refresh(persona)
    return {"status": "success", "persona": _persona_response(persona)}


@router.delete("/{persona_id}")
async def delete_persona(
    persona_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除自定义面试官角色（已创建的会话使用快照，不受影响）。"""
    persona = await _get_persona(persona_id, db)
    await db.delete(persona)
    await db.commit()
    return {"status": "success", "message": "已删除面试官角色"}
