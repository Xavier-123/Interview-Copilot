import logging
import uuid
import secrets
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db import get_db
from app.models.persona import InterviewerPersona, PersonaMemoryModel
from app.services.evolution.persona_evolver import persona_evolver

logger = logging.getLogger(__name__)

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

    # 同步为不可变 InterviewerVersion 并记录审计
    try:
        from app.services.interviewer_factory import interviewer_factory
        await interviewer_factory.sync_persona_version(persona, created_by="user")
    except Exception as e:
        logger.warning(f"Failed to sync persona version: {e}")

    return {"status": "success", "persona": _persona_response(persona)}


@router.put("/{persona_id}")
async def update_persona(
    persona_id: str,
    payload: PersonaPayload,
    db: AsyncSession = Depends(get_db),
):
    """更新自定义面试官角色（自动生成新版本，不影响已快照进历史会话的人设）。"""
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

    # 产生新版本并记录审计
    try:
        from app.services.interviewer_factory import interviewer_factory
        await interviewer_factory.sync_persona_version(persona, created_by="user")
    except Exception as e:
        logger.warning(f"Failed to sync persona version: {e}")

    return {"status": "success", "persona": _persona_response(persona)}


@router.delete("/{persona_id}")
async def delete_persona(
    persona_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除自定义面试官角色（已创建的会话使用快照，不受影响）。"""
    persona = await _get_persona(persona_id, db)
    persona_key = persona.key
    persona_name = persona.name
    await db.delete(persona)
    await db.commit()

    try:
        from app.services.audit import log_audit_event
        await log_audit_event(
            event_type="persona_deleted",
            actor="user",
            target_id=persona_id,
            payload={"key": persona_key, "name": persona_name}
        )
    except Exception as e:
        logger.warning(f"Failed to log persona deletion audit: {e}")

    return {"status": "success", "message": "已删除面试官角色"}


class AutoEvolveRequest(BaseModel):
    target_topic: Optional[str] = Field(default=None, description="指定本次对抗模拟的考察主题")
    candidate_behavior: Optional[str] = Field(default="vague", description="合成候选人特征: vague | memorized | standard | adversarial | weak")


class ApplyEvolutionRequest(BaseModel):
    apply_mode: str = Field(default="overwrite", description="应用模式: overwrite (覆盖当前) | save_as_new (另存为新版本)")
    optimized_system_prompt: Optional[str] = None
    skepticism_level: Optional[float] = None
    probe_hint: Optional[str] = None
    deep_dive_hint: Optional[str] = None
    negative_rules: Optional[List[str]] = Field(default_factory=list)
    golden_few_shots: Optional[List[str]] = Field(default_factory=list)
    new_name: Optional[str] = None


@router.post("/{persona_id}/auto-evolve")
async def auto_evolve_persona(
    persona_id: str,
    req: AutoEvolveRequest = AutoEvolveRequest(),
    db: AsyncSession = Depends(get_db),
):
    """一键触发该角色的仿真推演对战、Critic 诊断与 Optimizer 优化提案生成。"""
    persona = await _get_persona(persona_id, db)
    try:
        result = await persona_evolver.run_persona_evolution(
            persona=persona,
            target_topic=req.target_topic,
            candidate_behavior=req.candidate_behavior or "vague",
        )
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"Auto-evolution failed for persona {persona_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="仿真进化演练执行失败，请稍后重试")


@router.post("/{persona_id}/apply-evolution")
async def apply_persona_evolution(
    persona_id: str,
    req: ApplyEvolutionRequest,
    db: AsyncSession = Depends(get_db),
):
    """采纳并固化进化成果：更新人设或另存为新版本，并将避坑铁律与黄金范例写入记忆库。"""
    source_persona = await _get_persona(persona_id, db)
    target_persona: InterviewerPersona

    if req.apply_mode == "save_as_new":
        # 另存为衍生新版本
        target_name = (req.new_name or f"{source_persona.name} (V2)").strip()
        target_persona = InterviewerPersona(
            id=str(uuid.uuid4()),
            key=_generate_persona_key(),
            name=target_name,
            avatar=source_persona.avatar or "🎭",
            description=f"{source_persona.description}（由AI演进优化升级）",
            system_prompt=(req.optimized_system_prompt or source_persona.system_prompt).strip(),
            focus_topics=source_persona.focus_topics or [],
            opening_hint=source_persona.opening_hint or "",
            deep_dive_hint=(req.deep_dive_hint or source_persona.deep_dive_hint or "").strip(),
            probe_hint=(req.probe_hint or source_persona.probe_hint or "").strip(),
            switch_hint=source_persona.switch_hint or "",
            school_of_thought=source_persona.school_of_thought or "standard",
            dislikes=source_persona.dislikes or [],
            preferences=source_persona.preferences or [],
            skepticism_level=float(req.skepticism_level if req.skepticism_level is not None else (source_persona.skepticism_level or 0.5)),
            interaction_traits=source_persona.interaction_traits or {},
            enabled=True,
        )
        db.add(target_persona)
    else:
        # 直接覆盖升级当前角色
        target_persona = source_persona
        if req.optimized_system_prompt:
            target_persona.system_prompt = req.optimized_system_prompt.strip()
        if req.skepticism_level is not None:
            target_persona.skepticism_level = float(req.skepticism_level)
        if req.deep_dive_hint:
            target_persona.deep_dive_hint = req.deep_dive_hint.strip()
        if req.probe_hint:
            target_persona.probe_hint = req.probe_hint.strip()

    await db.flush()

    # 将新沉淀的避坑铁律与黄金提问范例固化到 PersonaMemoryModel
    target_key = target_persona.key
    topic_label = (target_persona.focus_topics or ["综合考核"])[0]

    for rule in (req.negative_rules or []):
        rule_str = rule.strip()
        if rule_str:
            db.add(PersonaMemoryModel(
                persona_key=target_key,
                memory_type="negative_rule",
                topic=topic_label,
                content=rule_str,
                score=1.0,
            ))

    for golden in (req.golden_few_shots or []):
        golden_str = golden.strip()
        if golden_str:
            db.add(PersonaMemoryModel(
                persona_key=target_key,
                memory_type="golden_few_shot",
                topic=topic_label,
                content=golden_str,
                score=1.0,
            ))

    await db.commit()
    await db.refresh(target_persona)

    # 记录审计事件
    try:
        from app.services.audit import log_audit_event
        await log_audit_event(
            event_type="persona_evolution_applied",
            actor="user",
            target_id=target_persona.id,
            payload={
                "apply_mode": req.apply_mode,
                "persona_key": target_key,
                "negative_rules_count": len(req.negative_rules or []),
                "golden_few_shots_count": len(req.golden_few_shots or []),
            },
            db=db,
        )
    except Exception as e:
        logger.warning(f"Failed to log evolution audit: {e}")

    return {
        "status": "success",
        "message": "已成功采纳进化成果并沉淀经验记忆",
        "persona": _persona_response(target_persona),
    }
