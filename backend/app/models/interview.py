import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, JSON, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.models.db import Base

class InterviewSessionModel(Base):
    __tablename__ = "interview_sessions"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(128), default="模拟面试会话")
    interview_type = Column(String(64), default="structured")  # technical | programmer | behavioral | hr | management | english | structured | custom
    industry = Column(String(64), default="互联网/电商")
    job_role = Column(String(64), default="后端开发")
    seniority = Column(String(32), default="senior")
    difficulty = Column(String(32), default="standard")
    style = Column(String(32), default="rigorous")
    language = Column(String(16), default="zh")
    status = Column(String(32), default="ready")  # ready | in_progress | waiting_user | paused | finished
    round_count = Column(Integer, default=0)
    max_rounds = Column(Integer, default=6)
    elapsed_seconds = Column(Integer, default=0)
    web_search_enabled = Column(Boolean, default=False)
    candidate_profile = Column(JSON, default=dict)
    jd_requirements = Column(JSON, default=dict)
    company_scenario = Column(JSON, default=dict)  # 目标企业/业务线场景卡片
    interview_state = Column(JSON, default=dict)  # Full LangGraph state snapshot
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="sessions")
    messages = relationship("InterviewMessageModel", back_populates="session", cascade="all, delete-orphan", order_by="InterviewMessageModel.seq")
    report = relationship("InterviewReportModel", back_populates="session", uselist=False, cascade="all, delete-orphan")

class InterviewMessageModel(Base):
    __tablename__ = "interview_messages"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(64), ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    seq = Column(Integer, nullable=True, index=True)  # 消息在会话中的顺序号，用于增量同步与回滚
    role = Column(String(32), nullable=False)  # user | assistant | system
    name = Column(String(32), nullable=True)   # candidate | orchestrator | technical | programmer | hr | challenger | management
    content = Column(Text, nullable=False)
    stage = Column(String(64), nullable=True)
    search_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("InterviewSessionModel", back_populates="messages")

class InterviewReportModel(Base):
    __tablename__ = "interview_reports"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(64), ForeignKey("interview_sessions.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    match_verdict = Column(String(64), default="待定待评估")
    overall_summary = Column(Text, default="")
    radar_scores = Column(JSON, default=dict)
    strengths = Column(JSON, default=list)
    weaknesses = Column(JSON, default=list)
    detailed_reviews = Column(JSON, default=list)
    learning_plan = Column(JSON, default=list)
    seven_day_roadmap = Column(JSON, default=list)
    drill_cards = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("InterviewSessionModel", back_populates="report")
