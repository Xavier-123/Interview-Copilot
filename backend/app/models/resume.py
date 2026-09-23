import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, JSON
from app.models.db import Base


class SavedResume(Base):
    """上传并保存过的简历（本地单用户简历库）。"""
    __tablename__ = "user_resumes"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String(256), nullable=False)
    file_path = Column(String(512), nullable=True)
    raw_text = Column(Text, nullable=False)
    parsed_profile = Column(JSON, default=dict)
    # 若该简历由"AI 体检采纳建议"生成，则指向其来源简历 id（原件永远不被覆盖）
    source_resume_id = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
