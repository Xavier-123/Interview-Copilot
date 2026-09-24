import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, JSON, Float
from app.models.db import Base

# 说明：用户自定义面试官角色（人设）已迁移为 JSON 文件存储
# （app/services/persona_store.py，目录见 settings.PERSONA_DATA_DIR），
# 不再使用数据库表；本模块仅保留面试官自我演进记忆库。


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

