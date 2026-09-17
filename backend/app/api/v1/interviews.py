from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from app.services.session_manager import session_manager
from app.core.security import get_current_user_optional
from app.models.user import User

router = APIRouter(prefix="/interviews", tags=["interviews"])

class CreateSessionRequest(BaseModel):
    resume_text: Optional[str] = ""
    jd_text: Optional[str] = ""
    interview_type: Optional[str] = "structured"  # technical | behavioral | hr | management | english | structured | custom
    industry: Optional[str] = "互联网/电商"
    job_role: Optional[str] = "后端开发"
    seniority: Optional[str] = "senior"           # junior | senior | expert | director
    difficulty: Optional[str] = "standard"        # easy | standard | hard
    style: Optional[str] = "rigorous"             # gentle | rigorous | stress
    language: Optional[str] = "zh"                # zh | en
    custom_config: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None
    llm_config: Optional[Dict[str, Any]] = None

class AnswerRequest(BaseModel):
    message: str

class PauseRequest(BaseModel):
    elapsed_seconds: Optional[int] = 0

class CompareRequest(BaseModel):
    session_id_1: str
    session_id_2: str

@router.post("/session")
async def create_interview_session(
    req: CreateSessionRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Create a new mock interview session with rich parameters."""
    try:
        user_id = current_user.id if current_user else (req.user_id or "guest_user")
        state = await session_manager.create_session(
            resume_text=req.resume_text or "",
            jd_text=req.jd_text or "",
            user_id=user_id,
            interview_type=req.interview_type or "structured",
            industry=req.industry or "互联网/电商",
            job_role=req.job_role or "后端开发",
            seniority=req.seniority or "senior",
            difficulty=req.difficulty or "standard",
            style=req.style or "rigorous",
            language=req.language or "zh",
            custom_config=req.custom_config,
            llm_config=req.llm_config
        )
        return {
            "session_id": state["session_id"],
            "title": state["title"],
            "candidate_profile": state["candidate_profile"],
            "jd_requirements": state["jd_requirements"],
            "interview_mode": state["interview_mode"],
            "status": state["status"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/start")
async def start_interview(session_id: str):
    """Start the interview."""
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

@router.post("/{session_id}/pause")
async def pause_interview(session_id: str, req: Optional[PauseRequest] = None):
    """Pause the ongoing interview and freeze elapsed time."""
    try:
        elapsed = req.elapsed_seconds if req else 0
        result = await session_manager.pause_session(session_id, elapsed_seconds=elapsed)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/resume")
async def resume_interview(session_id: str):
    """Resume a paused interview session."""
    try:
        result = await session_manager.resume_session(session_id)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/redo")
async def redo_turn(session_id: str):
    """Redo current turn: rolls back the last answer so candidate can retry."""
    try:
        result = await session_manager.redo_turn(session_id)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/restart")
async def restart_interview(session_id: str):
    """Restart entire interview with the same profile & job configuration."""
    try:
        new_state = await session_manager.restart_session(session_id)
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

@router.get("/history")
async def get_interview_history(
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """List interview history for current user (or guest)."""
    user_id = current_user.id if current_user else "guest_user"
    history = await session_manager.get_user_history(user_id)
    return {"history": history}

@router.post("/history/compare")
async def compare_interview_sessions(req: CompareRequest):
    """Compare two interview reports to analyze growth radar deltas and progress."""
    try:
        result = await session_manager.compare_sessions(req.session_id_1, req.session_id_2)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history/{session_id}")
async def delete_interview_record(session_id: str):
    """Delete an interview session and its report."""
    success = await session_manager.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="记录未找到或删除失败")
    return {"status": "success", "message": "已删除面试记录"}

@router.get("/{session_id}")
async def get_session_state(session_id: str):
    """Get the latest session snapshot and conversation history."""
    detail = await session_manager.get_session_detail(session_id)
    if not detail or not detail.get("state"):
        raise HTTPException(status_code=404, detail="Session not found")
    return detail["state"]

@router.get("/{session_id}/report")
async def get_report(session_id: str):
    """Get the cached evaluation report for this session."""
    report = session_manager.get_report(session_id)
    if not report:
        detail = await session_manager.get_session_detail(session_id)
        if detail and detail.get("report"):
            report = detail["report"]
    if not report:
        raise HTTPException(status_code=404, detail="Report not generated or session not found")
    return report
