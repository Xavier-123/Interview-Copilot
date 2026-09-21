import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime
from app.models.db import Base


class NotificationSetting(Base):
    """系统通知与邮件提醒配置（单例存储，id='default'）。"""
    __tablename__ = "notification_settings"

    id = Column(String(64), primary_key=True, default="default")
    email_enabled = Column(Boolean, default=False, nullable=False)
    receiver_email = Column(String(256), nullable=True)

    # SMTP 配置
    smtp_host = Column(String(256), nullable=True)
    smtp_port = Column(Integer, default=465, nullable=False)
    smtp_user = Column(String(256), nullable=True)
    smtp_password = Column(String(256), nullable=True)
    smtp_use_ssl = Column(Boolean, default=True, nullable=False)
    smtp_from_name = Column(String(128), default="Interview-Copilot", nullable=False)

    # 提前多长时间发送邮件提醒（小时）
    remind_advance_hours = Column(Integer, default=2, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
