import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text
from app.models.db import Base


class InterviewSchedule(Base):
    """真实求职面试日程（待面试/已面试/状态追踪）。"""
    __tablename__ = "interview_schedules"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    company = Column(String(128), nullable=False)
    job_role = Column(String(128), nullable=False)
    interview_round = Column(String(64), nullable=False, default="一面")
    scheduled_at = Column(DateTime, nullable=False)
    location_type = Column(String(32), nullable=False, default="online")
    meeting_link_or_address = Column(String(512), nullable=True)
    status = Column(String(32), nullable=False, default="upcoming")
    jd_text = Column(Text, nullable=True)
    resume_id = Column(String(64), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
