import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Boolean, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.models.db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(64), unique=True, index=True, nullable=False)
    email = Column(String(128), unique=True, index=True, nullable=True)
    hashed_password = Column(String(256), nullable=False)
    is_guest = Column(Boolean, default=False)
    avatar_url = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    resumes = relationship("UserResume", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("InterviewSessionModel", back_populates="user", cascade="all, delete-orphan")
    personas = relationship("InterviewerPersona", back_populates="user", cascade="all, delete-orphan")

class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    real_name = Column(String(64), default="候选人")
    target_role = Column(String(64), default="资深后端架构师")
    target_industry = Column(String(64), default="互联网/电商")
    target_level = Column(String(32), default="senior")
    experience_years = Column(Integer, default=3)
    skills = Column(JSON, default=list)
    bio = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="profile")

class UserResume(Base):
    __tablename__ = "user_resumes"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(256), nullable=False)
    file_path = Column(String(512), nullable=True)
    raw_text = Column(Text, nullable=False)
    parsed_profile = Column(JSON, default=dict)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="resumes")
