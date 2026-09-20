"""Interviewer specification data contracts (InterviewerSpec).

Defines structured, versionable, and immutable configurations for AI interviewers,
replacing hard-coded prompt blocks with typed behavior models.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PersonaConfig(BaseModel):
    tone: str = Field(default="rigorous", description="面试官语气基调，如 rigorous, gentle, stress, conversational")
    warmth: float = Field(default=0.5, ge=0.0, le=1.0, description="亲和力/温度 (0.0~1.0)")
    challenge: float = Field(default=0.7, ge=0.0, le=1.0, description="施压/挑战度 (0.0~1.0)")
    interruption: float = Field(default=0.2, ge=0.0, le=1.0, description="打断倾向度 (0.0~1.0)")


class InterviewConfig(BaseModel):
    duration_minutes: int = Field(default=45, ge=5, le=180, description="面试预设总时长(分钟)")
    stages: List[str] = Field(
        default_factory=lambda: ["icebreak", "self_intro", "technical", "candidate_qa", "conclusion"],
        description="面试推进阶段列表"
    )
    competencies: List[str] = Field(default_factory=list, description="本场考察的能力维度列表")


class BehaviorConfig(BaseModel):
    ask_one_question_at_a_time: bool = Field(default=True, description="一次只问一个核心问题")
    follow_up_before_switching: bool = Field(default=True, description="换题前优先深挖追问")
    tolerate_silence_seconds: int = Field(default=5, ge=1, le=60, description="容忍沉默时间(秒)")
    avoid_phrases: List[str] = Field(
        default_factory=lambda: ["非常棒", "感谢你的精彩回答", "很好，接下来让我们"],
        description="面试官禁止使用的机械或客套口头禅"
    )


class InterviewerSpec(BaseModel):
    interviewer_id: str = Field(min_length=1, max_length=64, description="面试官唯一标识符")
    version: Optional[str] = Field(default=None, description="版本号，如 v1, v2")
    display_name: str = Field(min_length=1, max_length=128, description="对外展示姓名")
    avatar: str = Field(default="🎭", max_length=8, description="头像 Emoji")
    description: str = Field(default="", max_length=256, description="一句话简介")
    target_roles: List[str] = Field(default_factory=list, description="适用目标岗位，如 ['Backend Engineer']")
    seniority: str = Field(default="senior", description="考核职级，如 junior, senior, expert")
    
    persona: PersonaConfig = Field(default_factory=PersonaConfig)
    interview: InterviewConfig = Field(default_factory=InterviewConfig)
    behavior: BehaviorConfig = Field(default_factory=BehaviorConfig)
    
    rubric_id: Optional[str] = Field(default=None, description="绑定的评分标准 Rubric ID")
    prompt_template_version: str = Field(default="spec-v1", description="底层 Prompt 模板编译器版本")
    system_prompt: Optional[str] = Field(default=None, description="自定义系统提示词正文（可选，优先使用或编译融合）")
    
    # 流派与画像矩阵
    school_of_thought: str = Field(default="standard", description="考核流派，如 incident_first, deep_source, business_roi, anti_cheat, standard")
    focus_topics: List[str] = Field(default_factory=list, description="重点考察考点清单")
    dislikes: List[str] = Field(default_factory=list, description="面试官反感点（遇则追问或挑刺）")
    preferences: List[str] = Field(default_factory=list, description="面试官偏好与看重点")
    skepticism_level: float = Field(default=0.5, ge=0.0, le=1.0, description="怀疑度阈值")
    interaction_traits: Dict[str, Any] = Field(default_factory=dict, description="额外交互个性参数")
    knowledge_base_ids: List[str] = Field(default_factory=list, description="挂载的专属知识库/题库 ID")
    
    opening_hint: str = Field(default="", max_length=400)
    deep_dive_hint: str = Field(default="", max_length=400)
    probe_hint: str = Field(default="", max_length=400)
    switch_hint: str = Field(default="", max_length=400)
