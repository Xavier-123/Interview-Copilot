"""Evolution Lab and experiment governance REST API endpoints."""

import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.models.db import get_db
from app.models.architecture import (
    EvolutionCandidateModel,
    ReplayRunModel,
    ExperimentModel,
    InterviewerSpecModel,
    InterviewerVersionModel,
)
from app.services.evolution import (
    replay_runner,
    safety_reviewer,
    optimizer_agent,
    critic_agent,
    version_comparator,
)
from app.services.interviewer_registry import interviewer_registry
from app.services.audit import log_audit_event

router = APIRouter(prefix="/evolution", tags=["evolution"])


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────────────────────────────────────

class ReviewActionRequest(BaseModel):
    review_notes: Optional[str] = Field(default="", description="审核附言或驳回原因")
    display_name: Optional[str] = Field(default=None, description="发布时的面试官展示名称")


class RunReplayRequest(BaseModel):
    personas: Optional[List[str]] = Field(default=None, description="要回放的候选人人设清单")
    turns_per_persona: int = Field(default=2, ge=1, le=5, description="每个人设模拟问答轮数")
    dataset_name: str = Field(default="synthetic-persona-suite")


class CreateExperimentRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    interviewer_id: str = Field(min_length=1, max_length=64)
    champion_version_id: str
    challenger_version_id: str
    traffic_split: float = Field(default=0.1, ge=0.0, le=1.0, description="分配给 Challenger 的流量比例 (0.0-1.0)")


class ProposeCandidateRequest(BaseModel):
    interviewer_id: str = Field(min_length=1, max_length=64)
    base_version_id: Optional[str] = None
    candidate_version: Optional[str] = None
    notes: Optional[str] = None


class CompareRequest(BaseModel):
    champion_metrics: Dict[str, Any]
    challenger_metrics: Dict[str, Any]


# ─────────────────────────────────────────────────────────────────────────────
# Candidate Lifecycle Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/candidates")
async def list_candidates(
    interviewer_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List evolution candidates with optional filtering."""
    query = select(EvolutionCandidateModel).order_by(desc(EvolutionCandidateModel.created_at)).limit(limit)
    if interviewer_id:
        query = query.where(EvolutionCandidateModel.interviewer_id == interviewer_id)
    if status:
        query = query.where(EvolutionCandidateModel.status == status)

    result = await db.execute(query)
    candidates = result.scalars().all()
    return {
        "candidates": [
            {
                "id": c.id,
                "interviewer_id": c.interviewer_id,
                "candidate_version": c.candidate_version,
                "base_version_id": c.base_version_id,
                "status": c.status,
                "safety_check_passed": c.safety_check_passed,
                "replay_metrics": c.replay_metrics,
                "review_notes": c.review_notes,
                "created_by": c.created_by,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in candidates
        ]
    }


@router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve full details of an evolution candidate, including its candidate spec and replay runs."""
    res = await db.execute(
        select(EvolutionCandidateModel).where(EvolutionCandidateModel.id == candidate_id)
    )
    candidate = res.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="进化候选版本不存在")

    runs_res = await db.execute(
        select(ReplayRunModel)
        .where(ReplayRunModel.candidate_id == candidate_id)
        .order_by(desc(ReplayRunModel.created_at))
    )
    replay_runs = runs_res.scalars().all()

    return {
        "candidate": {
            "id": candidate.id,
            "interviewer_id": candidate.interviewer_id,
            "candidate_version": candidate.candidate_version,
            "base_version_id": candidate.base_version_id,
            "status": candidate.status,
            "candidate_spec": candidate.candidate_spec,
            "replay_metrics": candidate.replay_metrics,
            "safety_check_passed": candidate.safety_check_passed,
            "review_notes": candidate.review_notes,
            "created_by": candidate.created_by,
            "created_at": candidate.created_at.isoformat() if candidate.created_at else None,
            "updated_at": candidate.updated_at.isoformat() if candidate.updated_at else None,
        },
        "replay_runs": [
            {
                "id": r.id,
                "dataset_name": r.dataset_name,
                "status": r.status,
                "metrics": r.metrics,
                "turns_count": len(r.transcript) if isinstance(r.transcript, list) else 0,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in replay_runs
        ],
    }


@router.post("/candidates/{candidate_id}/replay")
async def trigger_replay(
    candidate_id: str,
    req: RunReplayRequest = RunReplayRequest(),
    db: AsyncSession = Depends(get_db),
):
    """Triggers offline simulation replay against synthetic candidates and evaluates metrics."""
    res = await db.execute(
        select(EvolutionCandidateModel).where(EvolutionCandidateModel.id == candidate_id)
    )
    candidate = res.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="进化候选版本不存在")

    replay_run = await replay_runner.run_replay(
        session=db,
        candidate_id=candidate_id,
        interviewer_spec=candidate.candidate_spec,
        test_personas=req.personas,
        turns_per_persona=req.turns_per_persona,
        dataset_name=req.dataset_name,
    )

    await log_audit_event(
        event_type="candidate_replay_completed",
        actor="replay_runner",
        target_id=candidate_id,
        payload={"replay_run_id": replay_run.id, "metrics": replay_run.metrics},
        db=db,
    )

    return {
        "message": "离线仿真回放评测完成",
        "replay_run_id": replay_run.id,
        "metrics": replay_run.metrics,
        "candidate_status": "offline_tested",
    }


@router.post("/candidates/{candidate_id}/approve")
async def approve_candidate(
    candidate_id: str,
    req: ReviewActionRequest = ReviewActionRequest(),
    db: AsyncSession = Depends(get_db),
):
    """Human approval gate: promotes an evolution candidate to an approved InterviewerVersion."""
    res = await db.execute(
        select(EvolutionCandidateModel).where(EvolutionCandidateModel.id == candidate_id)
    )
    candidate = res.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="进化候选版本不存在")

    # Safety gate verification
    spec_review = safety_reviewer.review_spec(candidate.candidate_spec)
    if not spec_review.get("passed", False):
        raise HTTPException(
            status_code=400,
            detail=f"安全合规门禁未通过，禁止发布：{spec_review.get('violations')}",
        )

    # Replay metrics check
    if candidate.status == "draft" and not candidate.replay_metrics:
        # Require replay run before approval
        raise HTTPException(
            status_code=400,
            detail="候选版本尚未经过离线仿真回放测试，请先执行 /replay 评测后再审批",
        )

    # Promote to InterviewerVersion via registry
    display_name = req.display_name or f"面试官-{candidate.interviewer_id}"
    version_info = await interviewer_registry.create_version(
        interviewer_id=candidate.interviewer_id or "interviewer-default",
        display_name=display_name,
        spec=candidate.candidate_spec,
        created_by="human_reviewer",
    )
    version_id = version_info.get("id") or version_info.get("version_id")

    # Mark version as approved in registry
    await interviewer_registry.approve(version_id)

    # Update candidate record
    candidate.status = "approved"
    candidate.safety_check_passed = True
    if req.review_notes:
        candidate.review_notes = req.review_notes
    session_commit = await db.commit()

    await log_audit_event(
        event_type="candidate_promoted_to_production",
        actor="human_reviewer",
        target_id=candidate_id,
        payload={"promoted_version_id": version_id, "interviewer_id": candidate.interviewer_id},
        db=db,
    )

    return {
        "message": "候选版本审核通过并已发布为生产版本",
        "candidate_id": candidate_id,
        "promoted_version_id": version_id,
        "version": version_info.get("version"),
    }


@router.post("/candidates/{candidate_id}/reject")
async def reject_candidate(
    candidate_id: str,
    req: ReviewActionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Rejects an evolution candidate."""
    res = await db.execute(
        select(EvolutionCandidateModel).where(EvolutionCandidateModel.id == candidate_id)
    )
    candidate = res.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="进化候选版本不存在")

    candidate.status = "rejected"
    candidate.review_notes = req.review_notes or "人工审核驳回"
    await db.commit()

    await log_audit_event(
        event_type="candidate_rejected",
        actor="human_reviewer",
        target_id=candidate_id,
        payload={"reason": candidate.review_notes},
        db=db,
    )

    return {
        "message": "候选版本已驳回",
        "candidate_id": candidate_id,
        "status": "rejected",
    }


@router.post("/propose")
async def propose_candidate(
    req: ProposeCandidateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Synthesizes Critic diagnosis and proposes a new candidate spec via OptimizerAgent."""
    # Fetch base spec
    spec_res = await db.execute(
        select(InterviewerSpecModel).where(InterviewerSpecModel.interviewer_id == req.interviewer_id)
    )
    parent_spec = spec_res.scalar_one_or_none()
    current_spec = parent_spec.spec if parent_spec else {"interviewer_id": req.interviewer_id}

    # Run mock/sample diagnosis for optimization guidance
    sample_transcript = [
        {"speaker": "interviewer", "content": "好的，非常棒，接下来让我们深入聊聊分布式锁。"},
        {"speaker": "candidate", "content": "好的，我们用 Redisson 加看门狗机制保证锁续期。"},
        {"speaker": "interviewer", "content": "好的，那针对分布式锁，你认为它在跨机房情况下怎么做容灾？"},
    ]
    diagnosis = await critic_agent.diagnose(sample_transcript)

    candidate = await optimizer_agent.propose_candidate(
        session=db,
        interviewer_id=req.interviewer_id,
        base_version_id=req.base_version_id,
        critic_diagnosis=diagnosis,
        current_spec=current_spec,
        candidate_version=req.candidate_version,
        notes=req.notes or "由 OptimizerAgent 依据 Critic 缺陷诊断自动生成",
    )

    return {
        "message": "已生成进化候选版本",
        "candidate_id": candidate.id,
        "candidate_version": candidate.candidate_version,
        "status": candidate.status,
        "defects_addressed": diagnosis.get("defects_count", 0),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Experimentation & Canary Management Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/experiments")
async def create_experiment(
    req: CreateExperimentRequest,
    db: AsyncSession = Depends(get_db),
):
    """Creates a Champion vs. Challenger A/B canary experiment."""
    # Validate versions exist
    champ_res = await db.execute(
        select(InterviewerVersionModel).where(InterviewerVersionModel.id == req.champion_version_id)
    )
    chall_res = await db.execute(
        select(InterviewerVersionModel).where(InterviewerVersionModel.id == req.challenger_version_id)
    )
    if not champ_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"Champion 版本 {req.champion_version_id} 不存在")
    if not chall_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"Challenger 版本 {req.challenger_version_id} 不存在")

    experiment = ExperimentModel(
        name=req.name,
        interviewer_id=req.interviewer_id,
        champion_version_id=req.champion_version_id,
        challenger_version_id=req.challenger_version_id,
        traffic_split=req.traffic_split,
        status="canary",
        metrics={"canary_started_at": datetime.utcnow().isoformat()},
    )
    db.add(experiment)
    await db.commit()
    await db.refresh(experiment)

    await log_audit_event(
        event_type="canary_experiment_created",
        actor="admin",
        target_id=experiment.id,
        payload={
            "champion_version_id": req.champion_version_id,
            "challenger_version_id": req.challenger_version_id,
            "traffic_split": req.traffic_split,
        },
        db=db,
    )

    return {
        "message": "A/B 灰度实验创建成功",
        "experiment_id": experiment.id,
        "status": experiment.status,
        "traffic_split": experiment.traffic_split,
    }


@router.get("/experiments")
async def list_experiments(
    interviewer_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List running or historical canary experiments."""
    query = select(ExperimentModel).order_by(desc(ExperimentModel.created_at))
    if interviewer_id:
        query = query.where(ExperimentModel.interviewer_id == interviewer_id)
    if status:
        query = query.where(ExperimentModel.status == status)

    result = await db.execute(query)
    experiments = result.scalars().all()
    return {
        "experiments": [
            {
                "id": exp.id,
                "name": exp.name,
                "interviewer_id": exp.interviewer_id,
                "champion_version_id": exp.champion_version_id,
                "challenger_version_id": exp.challenger_version_id,
                "traffic_split": exp.traffic_split,
                "status": exp.status,
                "metrics": exp.metrics,
                "created_at": exp.created_at.isoformat() if exp.created_at else None,
                "updated_at": exp.updated_at.isoformat() if exp.updated_at else None,
            }
            for exp in experiments
        ]
    }


@router.post("/experiments/{experiment_id}/rollback")
async def rollback_experiment(
    experiment_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Immediately rolls back an A/B experiment and resets Challenger traffic to zero."""
    res = await db.execute(
        select(ExperimentModel).where(ExperimentModel.id == experiment_id)
    )
    exp = res.scalar_one_or_none()
    if not exp:
        raise HTTPException(status_code=404, detail="实验不存在")

    exp.status = "rolled_back"
    exp.traffic_split = 0.0
    await db.commit()

    await log_audit_event(
        event_type="canary_experiment_rolled_back",
        actor="admin",
        target_id=experiment_id,
        payload={"champion_restored": exp.champion_version_id},
        db=db,
    )

    return {
        "message": "实验已成功回滚，流量已全部切回 Champion",
        "experiment_id": experiment_id,
        "status": "rolled_back",
    }


@router.post("/compare")
async def compare_metrics(req: CompareRequest):
    """Compares benchmark metrics between Champion and Challenger versions against release gates."""
    comparison = version_comparator.compare(
        champion_metrics=req.champion_metrics,
        challenger_metrics=req.challenger_metrics,
    )
    return comparison
