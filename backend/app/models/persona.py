import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, JSON, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.models.db import Base


class InterviewerPersona(Base):
    """用户自定义面试官角色（人设）。

    运行时以快照形式写入会话 custom_config.personas，编辑/删除人设
    不影响已创建会话的回放与继续作答。
    """
    __tablename__ = "interviewer_personas"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String(32), unique=True, index=True, nullable=False)  # 形如 persona_xxxx，用作消息 name 与路由标识
    name = Column(String(64), nullable=False)                          # 显示名，如“毒舌架构师”
    avatar = Column(String(8), default="🎭")                            # 头像 emoji
    description = Column(String(128), default="")                       # 一句话简介
    system_prompt = Column(Text, nullable=False)                        # 人设正文（背景/专业领域/提问策略）
    focus_topics = Column(JSON, default=list)                           # 考察重点标签
    opening_hint = Column(Text, default="")                             # 首题引导语
    deep_dive_hint = Column(Text, default="")                           # DEEP_DIVE 追问引导语
    probe_hint = Column(Text, default="")                               # PROBE_WEAKNESS 补漏引导语
    switch_hint = Column(Text, default="")                              # SWITCH_TOPIC 换题引导语
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="personas")
