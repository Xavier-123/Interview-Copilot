from typing import Annotated, List, Dict, Any, Optional
from typing_extensions import TypedDict
import operator

class MessageItem(TypedDict):
    role: str               # "user" | "assistant" | "system"
    name: Optional[str]     # "orchestrator" | "technical" | "hr" | "challenger" | "candidate"
    content: str
    stage: Optional[str]
    timestamp: Optional[str]

class ShadowObservation(TypedDict):
    round_index: int
    interviewer: str
    question: str
    candidate_answer: str
    strengths: List[str]
    weaknesses: List[str]
    depth_score: float      # 1-10
    logic_score: float      # 1-10
    star_compliance: Optional[float] # 1-10 (for behavioral questions)
    flags: List[str]        # e.g., ["vague_answer", "good_quantification", "nervous"]

class InterviewState(TypedDict):
    # Session metadata
    session_id: str
    user_id: str
    stage: str              # icebreak | self_intro | technical | coding | hr | candidate_qa | conclusion
    current_interviewer: str # orchestrator | technical | hr | challenger
    next_interviewer: Optional[str]
    
    # Round & Control
    round_count: int
    max_rounds: int
    tech_rounds_target: int
    hr_rounds_target: int
    stress_triggered: bool
    
    # Candidate & Job Context
    candidate_profile: Dict[str, Any] # name, skills, projects, experience_years, highlights
    jd_requirements: Dict[str, Any]   # title, required_skills, responsibilities, level
    interview_mode: Dict[str, Any]    # difficulty: junior/senior/expert, style: gentle/strict/stress, language: zh/en
    
    # Conversation Flow & Long-term summary
    messages: Annotated[List[Dict[str, Any]], operator.add]
    condensed_memory: str             # Rolling facts summary to keep context window compact
    
    # Interactive Live Coding & Lifelines
    current_code: Optional[str]
    code_language: Optional[str]
    lifelines_used: int
    latest_user_input: Optional[str]
    
    # Shadow Observer Stream (Internal only, not sent directly to candidate during interview)
    evaluation_logs: Annotated[List[Dict[str, Any]], operator.add]
    
    # Lifecycle status
    status: str                       # ready | in_progress | waiting_user | finished
