"""Persistent contracts for versioned interview orchestration.

The first release keeps SQLite as the default backend.  JSON payload columns
make the models compatible with PostgreSQL JSONB later without coupling Agent
code to a particular storage engine.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, JSON, String, Text

from app.models.db import Base


def _id() -> str:
    return str(uuid.uuid4())


class InterviewerSpecModel(Base):
    __tablename__ = "interviewer_specs"

    id = Column(String(64), primary_key=True, default=_id)
    interviewer_id = Column(String(64), unique=True, index=True, nullable=False)
    display_name = Column(String(128), nullable=False)
    active_version_id = Column(String(64), nullable=True)
    spec = Column(JSON, default=dict, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InterviewerVersionModel(Base):
    __tablename__ = "interviewer_versions"

    id = Column(String(64), primary_key=True, default=_id)
    interviewer_id = Column(String(64), index=True, nullable=False)
    version = Column(String(32), nullable=False)
    status = Column(String(32), default="draft", index=True, nullable=False)
    spec = Column(JSON, default=dict, nullable=False)
    prompt_template_version = Column(String(64), default="legacy-v1")
    rubric_id = Column(String(64), nullable=True)
    metrics = Column(JSON, default=dict)
    created_by = Column(String(64), default="system")
    created_at = Column(DateTime, default=datetime.utcnow)


class EvidenceItemModel(Base):
    __tablename__ = "evidence_items"

    id = Column(String(64), primary_key=True, default=_id)
    session_id = Column(String(64), index=True, nullable=False)
    turn_id = Column(String(64), index=True, nullable=True)
    topic = Column(String(128), index=True, nullable=True)
    payload = Column(JSON, default=dict, nullable=False)
    source = Column(String(128), nullable=True)
    confidence = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class MemoryItemModel(Base):
    __tablename__ = "memory_items"

    id = Column(String(64), primary_key=True, default=_id)
    scope = Column(String(32), index=True, nullable=False)
    owner_id = Column(String(64), index=True, nullable=True)
    subject_id = Column(String(64), index=True, nullable=True)
    content = Column(Text, nullable=False)
    source = Column(String(128), nullable=True)
    confidence = Column(Float, default=0.0)
    consent = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    version = Column(String(32), default="1")
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditEventModel(Base):
    __tablename__ = "audit_events"

    id = Column(String(64), primary_key=True, default=_id)
    event_type = Column(String(64), index=True, nullable=False)
    actor = Column(String(64), nullable=False)
    target_id = Column(String(64), index=True, nullable=True)
    trace_id = Column(String(64), index=True, nullable=True)
    payload = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class EvolutionCandidateModel(Base):
    __tablename__ = "evolution_candidates"

    id = Column(String(64), primary_key=True, default=_id)
    base_version_id = Column(String(64), nullable=True)
    status = Column(String(32), default="draft", index=True, nullable=False)
    candidate_spec = Column(JSON, default=dict, nullable=False)
    replay_metrics = Column(JSON, default=dict)
    review_notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
