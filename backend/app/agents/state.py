from typing import Annotated, List, Dict, Any, Optional
from typing_extensions import TypedDict
import operator

class MessageItem(TypedDict):
    role: str               # "user" | "assistant" | "system"
    name: Optional[str]     # "orchestrator" | "technical" | "programmer" | "hr" | "challenger" | "management" | "candidate"
    content: str
    stage: Optional[str]
    timestamp: Optional[str]
    search_metadata: Optional[Dict[str, Any]]

class ShadowObservation(TypedDict):
    round_index: int
    interviewer: str
    question: str
    candidate_answer: str
    topic: Optional[str]            # Core topic of this question
    satisfaction_score: float       # Normalized 0.0 - 1.0 score
    depth_level: int                # Depth level (1 - 5) for current topic
    strengths: List[str]
    weaknesses: List[str]
    follow_up_hint: Optional[str]   # Specific angle or vulnerability to follow up on
    depth_score: float              # 1-10
    logic_score: float              # 1-10
    star_compliance: Optional[float] # 1-10 (for behavioral questions)
    flags: List[str]                # e.g., ["vague_answer", "good_quantification", "nervous"]
    is_memorized: Optional[bool]    # 是否判定为背诵/套路化模板回答
    memorization_signals: Optional[List[str]] # 背诵特征（如：教科书编号、缺少项目细节、无权衡说明）
    break_routine_hint: Optional[str] # 针对背诵特征的破局追问提示

class InterviewStateBase(TypedDict):
    # Session metadata
    session_id: str
    title: str
    stage: str                      # icebreak | self_intro | technical | behavioral | hr | management | english | candidate_qa | conclusion
    current_interviewer: str        # orchestrator | technical | hr | challenger | management
    next_interviewer: Optional[str]
    
    # Interview Configuration
    interview_type: str             # technical | programmer | behavioral | hr | management | english | structured | custom
    industry: str                   # 互联网/电商 | 人工智能/大模型 | 金融科技/量化 | ...
    job_role: str                   # 后端开发 | 前端开发 | AI算法 | ...
    seniority: str                  # junior | senior | expert | director
    difficulty: str                 # easy | standard | hard
    style: str                      # gentle | rigorous | stress
    language: str                   # zh | en
    custom_config: Optional[Dict[str, Any]] # custom interviewers and topic tags
    company_scenario: Optional[Dict[str, Any]] # 注入的具体大厂/业务线真实场景卡片
    web_search_enabled: bool        # Whether web search is enabled
    
    # Round & Control
    round_count: int
    max_rounds: int
    tech_rounds_target: int
    hr_rounds_target: int
    mgmt_rounds_target: int
    stress_triggered: bool
    
    # Topic & Deep Dive Tracking (0.0 - 1.0 scoring, <= 5 depth)
    current_topic: Optional[str]       # Current topic being explored (e.g., "Redis缓存一致性")
    topic_depth: int                   # Current digging depth for this topic (0 - 5)
    last_satisfaction_score: float     # Last answer satisfaction score (0.0 - 1.0)
    last_answer_status: str            # unknown | poor | surface | solid | excellent (由影子观察员判定)
    dig_action: str                    # "INIT" | "DEEP_DIVE" | "SWITCH_TOPIC" | "PROBE_WEAKNESS" | "BREAK_ROUTINE"
    switch_reason: Optional[str]       # SWITCH_TOPIC 细分原因: failed | exhausted | surface_repeated
    next_topic_hint: Optional[str]     # 影子观察员建议的下一个知识点（换题时优先采用）
    follow_up_hint: Optional[str]      # Specific clue for next prompt
    break_routine_hint: Optional[str]  # 针对背诵或泛泛而谈的破局非标场景追问指令
    
    # Candidate & Job Context
    candidate_profile: Dict[str, Any]  # name, skills, projects, experience_years, highlights
    jd_requirements: Dict[str, Any]    # title, required_skills, responsibilities, level
    interview_mode: Dict[str, Any]     # combined mode dictionary
    
    # Conversation Flow & Long-term rolling memory
    messages: Annotated[List[Dict[str, Any]], operator.add]
    condensed_memory: str              # Rolling facts summary referencing earlier statements
    
    # Interactive Live Coding & Lifelines
    current_code: Optional[str]
    code_language: Optional[str]
    lifelines_used: int
    latest_user_input: Optional[str]
    
    # Shadow Observer Stream
    evaluation_logs: Annotated[List[Dict[str, Any]], operator.add]
    
    # Lifecycle status: ready | in_progress | waiting_user | paused | finished
    status: str


class InterviewStateOptional(TypedDict, total=False):
    # Optional overrides
    llm_config: Optional[Dict[str, Any]]  # frontend-provided LLM config


class InterviewState(InterviewStateBase, InterviewStateOptional):
    pass
