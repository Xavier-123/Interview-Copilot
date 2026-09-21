import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db import get_db
from app.models.schedule import InterviewSchedule

router = APIRouter(prefix="/schedules", tags=["schedules"])


def _to_utc(dt: datetime) -> datetime:
    """统一按 UTC 落库：带时区的时间转 UTC，naive 时间视为已是 UTC 墙上时间。"""
    return dt.astimezone(timezone.utc) if dt.tzinfo else dt


def _utc_iso(dt: Optional[datetime]) -> Optional[str]:
    """序列化时补回 UTC 时区标记，否则前端 new Date() 会把 UTC 时间当本地时间渲染（差时区小时数）。"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _schedule_response(s: InterviewSchedule) -> dict:
    return {
        "id": s.id,
        "company": s.company,
        "job_role": s.job_role,
        "interview_round": s.interview_round,
        "scheduled_at": _utc_iso(s.scheduled_at),
        "location_type": s.location_type,
        "meeting_link_or_address": s.meeting_link_or_address or "",
        "salary": s.salary or "",
        "status": s.status,
        "jd_text": s.jd_text or "",
        "resume_id": s.resume_id,
        "notes": s.notes or "",
        "created_at": _utc_iso(s.created_at),
        "updated_at": _utc_iso(s.updated_at),
    }


class CreateSchedulePayload(BaseModel):
    company: str = Field(min_length=1, max_length=128)
    job_role: str = Field(min_length=1, max_length=128)
    interview_round: str = Field(default="一面", max_length=64)
    scheduled_at: datetime
    location_type: str = Field(default="online", max_length=32)
    meeting_link_or_address: Optional[str] = Field(default=None, max_length=512)
    salary: Optional[str] = Field(default=None, max_length=128)
    status: Optional[str] = Field(default="upcoming", max_length=32)
    jd_text: Optional[str] = None
    resume_id: Optional[str] = None
    notes: Optional[str] = None


class UpdateSchedulePayload(BaseModel):
    company: Optional[str] = Field(default=None, min_length=1, max_length=128)
    job_role: Optional[str] = Field(default=None, min_length=1, max_length=128)
    interview_round: Optional[str] = Field(default=None, max_length=64)
    scheduled_at: Optional[datetime] = None
    location_type: Optional[str] = Field(default=None, max_length=32)
    meeting_link_or_address: Optional[str] = Field(default=None, max_length=512)
    salary: Optional[str] = Field(default=None, max_length=128)
    status: Optional[str] = Field(default=None, max_length=32)
    jd_text: Optional[str] = None
    resume_id: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
async def list_schedules(
    status: Optional[str] = Query(None, description="过滤状态: upcoming, completed, passed, declined, failed, cancelled"),
    db: AsyncSession = Depends(get_db)
):
    """获取所有面试日程列表，支持状态过滤。"""
    query = select(InterviewSchedule)
    if status:
        query = query.where(InterviewSchedule.status == status)
    # 按日程时间升序排序（最近即将到来的排在最前）
    query = query.order_by(InterviewSchedule.scheduled_at.asc())
    result = await db.execute(query)
    schedules = result.scalars().all()
    return {
        "schedules": [_schedule_response(s) for s in schedules]
    }


@router.get("/{schedule_id}")
async def get_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取指定面试日程详情。"""
    result = await db.execute(
        select(InterviewSchedule).where(InterviewSchedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="未找到该面试日程")
    return {"schedule": _schedule_response(schedule)}


@router.post("")
async def create_schedule(
    payload: CreateSchedulePayload,
    db: AsyncSession = Depends(get_db)
):
    """创建新的面试日程。"""
    new_schedule = InterviewSchedule(
        id=str(uuid.uuid4()),
        company=payload.company.strip(),
        job_role=payload.job_role.strip(),
        interview_round=payload.interview_round.strip() or "一面",
        scheduled_at=_to_utc(payload.scheduled_at),
        location_type=payload.location_type or "online",
        meeting_link_or_address=payload.meeting_link_or_address,
        salary=payload.salary,
        status=payload.status or "upcoming",
        jd_text=payload.jd_text,
        resume_id=payload.resume_id,
        notes=payload.notes,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(new_schedule)
    await db.commit()
    await db.refresh(new_schedule)
    return {"status": "success", "schedule": _schedule_response(new_schedule)}


@router.put("/{schedule_id}")
async def update_schedule(
    schedule_id: str,
    payload: UpdateSchedulePayload,
    db: AsyncSession = Depends(get_db)
):
    """更新面试日程信息或流转状态。"""
    result = await db.execute(
        select(InterviewSchedule).where(InterviewSchedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="未找到该面试日程")

    update_data = payload.model_dump(exclude_unset=True)
    if update_data.get("scheduled_at") is not None:
        update_data["scheduled_at"] = _to_utc(update_data["scheduled_at"])
    for field, value in update_data.items():
        setattr(schedule, field, value)

    schedule.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(schedule)
    return {"status": "success", "schedule": _schedule_response(schedule)}


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db)
):
    """删除指定面试日程。"""
    result = await db.execute(
        select(InterviewSchedule).where(InterviewSchedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="未找到该面试日程")

    await db.delete(schedule)
    await db.commit()
    return {"status": "success", "message": "面试日程已删除", "schedule_id": schedule_id}
