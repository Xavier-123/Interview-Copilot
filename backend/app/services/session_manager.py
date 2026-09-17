import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from app.agents.state import InterviewState
from app.agents.graph import interview_app
from app.agents.evaluator import generate_evaluation_report
from app.services.parser import parser_service

class SessionManager:
    def __init__(self):
        # In-memory session store (can be backed by Redis or PostgreSQL)
        self._sessions: Dict[str, InterviewState] = {}
        self._reports: Dict[str, Dict[str, Any]] = {}

    async def create_session(
        self,
        resume_text: str = "",
        jd_text: str = "",
        user_id: str = "guest_user",
        difficulty: str = "senior",
        style: str = "rigorous",
        language: str = "zh"
    ) -> InterviewState:
        session_id = str(uuid.uuid4())
        
        # 1. Parse Resume and JD
        candidate_profile = await parser_service.parse_resume(resume_text)
        jd_requirements = await parser_service.parse_jd(jd_text)
        
        # 2. Build initial State
        initial_state: InterviewState = {
            "session_id": session_id,
            "user_id": user_id,
            "stage": "icebreak",
            "current_interviewer": "orchestrator",
            "next_interviewer": "candidate",
            "round_count": 0,
            "max_rounds": 6,
            "tech_rounds_target": 2,
            "hr_rounds_target": 1,
            "stress_triggered": False,
            "candidate_profile": candidate_profile,
            "jd_requirements": jd_requirements,
            "interview_mode": {
                "difficulty": difficulty,
                "style": style,
                "language": language
            },
            "messages": [],
            "condensed_memory": "",
            "current_code": None,
            "code_language": "python",
            "lifelines_used": 0,
            "latest_user_input": None,
            "evaluation_logs": [],
            "status": "ready"
        }
        
        self._sessions[session_id] = initial_state
        return initial_state

    async def start_session(self, session_id: str) -> Dict[str, Any]:
        state = self._sessions.get(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")
            
        # Run graph for icebreak turn
        new_state = await interview_app.ainvoke(state)
        self._sessions[session_id] = new_state
        return new_state

    async def submit_candidate_answer(self, session_id: str, user_message: str) -> Dict[str, Any]:
        state = self._sessions.get(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        # Record user message
        user_msg = {
            "role": "user",
            "name": "candidate",
            "content": user_message,
            "stage": state.get("stage"),
            "timestamp": datetime.now().isoformat()
        }
        
        # Update state with latest input
        state["latest_user_input"] = user_message
        state["messages"] = state.get("messages", []) + [user_msg]
        
        # Invoke LangGraph
        new_state = await interview_app.ainvoke(state)
        self._sessions[session_id] = new_state
        return new_state

    async def request_lifeline(self, session_id: str) -> Dict[str, Any]:
        """Candidate asks for a hint during a difficult question."""
        state = self._sessions.get(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")
        
        state["lifelines_used"] = state.get("lifelines_used", 0) + 1
        
        # Find current question
        last_question = "当前考点"
        for m in reversed(state.get("messages", [])):
            if m.get("role") == "assistant":
                last_question = m.get("content", "")
                break
                
        hint_content = f"💡【求助提示 Lifeline】：针对'{last_question[:60]}...'，你可以尝试从系统瓶颈定位、数据结构选择与极端容灾策略三个维度切入回答。"
        
        hint_msg = {
            "role": "assistant",
            "name": "orchestrator",
            "content": hint_content,
            "stage": state.get("stage"),
            "timestamp": datetime.now().isoformat()
        }
        state["messages"] = state.get("messages", []) + [hint_msg]
        self._sessions[session_id] = state
        return {
            "hint": hint_content,
            "lifelines_used": state["lifelines_used"],
            "state": state
        }

    async def finish_and_evaluate(self, session_id: str) -> Dict[str, Any]:
        state = self._sessions.get(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        state["status"] = "finished"
        report = await generate_evaluation_report(state)
        self._reports[session_id] = report
        return report

    def get_session(self, session_id: str) -> Optional[InterviewState]:
        return self._sessions.get(session_id)

    def get_report(self, session_id: str) -> Optional[Dict[str, Any]]:
        return self._reports.get(session_id)

session_manager = SessionManager()
