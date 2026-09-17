from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from app.services.session_manager import session_manager

router = APIRouter(prefix="/interviews", tags=["interviews"])

class CreateSessionRequest(BaseModel):
    resume_text: Optional[str] = ""
    jd_text: Optional[str] = ""
    difficulty: Optional[str] = "senior"   # junior | senior | expert
    style: Optional[str] = "rigorous"       # gentle | rigorous | stress
    language: Optional[str] = "zh"          # zh | en
    user_id: Optional[str] = "candidate_001"

class AnswerRequest(BaseModel):
    message: str

@router.post("/session")
async def create_interview_session(req: CreateSessionRequest):
    """Create a new mock interview session and parse initial Resume / JD profiles."""
    try:
        state = await session_manager.create_session(
            resume_text=req.resume_text or "",
            jd_text=req.jd_text or "",
            user_id=req.user_id or "candidate_001",
            difficulty=req.difficulty or "senior",
            style=req.style or "rigorous",
            language=req.language or "zh"
        )
        return {
            "session_id": state["session_id"],
            "candidate_profile": state["candidate_profile"],
            "jd_requirements": state["jd_requirements"],
            "interview_mode": state["interview_mode"],
            "status": state["status"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/start")
async def start_interview(session_id: str):
    """Start the interview; Orchestrator triggers welcome and self-intro request."""
    try:
        new_state = await session_manager.start_session(session_id)
        return {
            "session_id": session_id,
            "stage": new_state.get("stage"),
            "current_interviewer": new_state.get("current_interviewer"),
            "messages": new_state.get("messages", []),
            "status": new_state.get("status")
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/answer")
async def submit_answer(session_id: str, req: AnswerRequest):
    """Submit candidate answer. Drives the LangGraph forward."""
    try:
        new_state = await session_manager.submit_candidate_answer(session_id, req.message)
        return {
            "session_id": session_id,
            "stage": new_state.get("stage"),
            "current_interviewer": new_state.get("current_interviewer"),
            "round_count": new_state.get("round_count"),
            "messages": new_state.get("messages", []),
            "status": new_state.get("status")
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/lifeline")
async def request_lifeline(session_id: str):
    """Request a hint/lifeline for the current challenging question."""
    try:
        result = await session_manager.request_lifeline(session_id)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/finish")
async def finish_and_evaluate(session_id: str):
    """Finish the interview and generate the multi-dimensional diagnosis report."""
    try:
        report = await session_manager.finish_and_evaluate(session_id)
        return {
            "session_id": session_id,
            "status": "finished",
            "report": report
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{session_id}")
async def get_session_state(session_id: str):
    """Get the latest session snapshot and conversation history."""
    state = session_manager.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    return state

@router.get("/{session_id}/report")
async def get_report(session_id: str):
    """Get the cached evaluation report for this session."""
    report = session_manager.get_report(session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not generated or session not found")
    return report
