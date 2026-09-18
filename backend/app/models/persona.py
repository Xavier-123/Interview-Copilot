import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, JSON, ForeignKey, Boolean, Float
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
    # ── 流派画像矩阵与考核特征 ─────────────────────────────────────────
    school_of_thought = Column(String(32), default="standard")         # incident_first | deep_source | business_roi | anti_cheat | standard
    dislikes = Column(JSON, default=list)                               # 反感项清单（如：背诵八股、假大空架构、只给结论不给推演）
    preferences = Column(JSON, default=list)                            # 偏好清单（如：踩坑复盘、单机极限性能、真实ROI）
    skepticism_level = Column(Float, default=0.5)                       # 怀疑度阈值 (0.0 - 1.0)，越高越倾向挑刺与质疑
    interaction_traits = Column(JSON, default=dict)                     # 互动风格（如 tone, interrupt_frequency 等）
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="personas")


class PersonaMemoryModel(Base):
    """面试官自我演进记忆库（经验库）。

    存储面试复盘中提炼出的黄金追问案例（Few-Shot）与负向避坑规则，
    在面试官运行时作为上下文动态注入，实现无需微调的自我进化闭环。
    """
    __tablename__ = "persona_memories"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    persona_key = Column(String(32), index=True, nullable=False)        # 对应人设 key 或内置角色 key
    memory_type = Column(String(32), index=True, nullable=False)        # golden_few_shot | negative_rule | incident_case
    topic = Column(String(64), default="")                              # 关联考点/技术栈
    content = Column(Text, nullable=False)                              # 黄金问答片段或避坑规则正文
    score = Column(Float, default=1.0)                                  # 质量权重
    created_at = Column(DateTime, default=datetime.utcnow)

