from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Depends, Body, Response
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from app.services.session_manager import session_manager
from app.core.security import get_current_user_optional
from app.models.user import User

router = APIRouter(prefix="/interviews", tags=["interviews"])

class CreateSessionRequest(BaseModel):
    resume_text: Optional[str] = ""
    jd_text: Optional[str] = ""
    interview_type: Optional[str] = "structured"  # technical | programmer | behavioral | hr | management | english | structured | custom
    industry: Optional[str] = "互联网/电商"
    job_role: Optional[str] = "后端开发"
    seniority: Optional[str] = "senior"           # junior | senior | expert | director
    difficulty: Optional[str] = "standard"        # easy | standard | hard
    style: Optional[str] = "rigorous"             # gentle | rigorous | stress
    language: Optional[str] = "zh"                # zh | en
    custom_config: Optional[Dict[str, Any]] = None
    company_scenario: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None
    llm_config: Optional[Dict[str, Any]] = None
    web_search_enabled: Optional[bool] = False
    max_rounds: Optional[int] = None              # 轮次上限（None -> 后端默认 6；programmer 前端传 8）

class SearchRuntimeConfig(BaseModel):
    provider: str = "tavily"
    api_key: Optional[str] = None

class AnswerRequest(BaseModel):
    message: str
    search_config: Optional[SearchRuntimeConfig] = None

class SimulateAnswerRequest(BaseModel):
    search_config: Optional[SearchRuntimeConfig] = None

class PauseRequest(BaseModel):
    elapsed_seconds: Optional[int] = 0

class ToggleWebSearchRequest(BaseModel):
    enabled: Optional[bool] = None

class CompareRequest(BaseModel):
    session_id_1: str
    session_id_2: str

@router.get("/scenarios")
async def list_company_scenarios():
    """获取内置的大厂与垂直业务线场景卡片（美团外卖、字节推荐、拼多多跨境、阿里多活、腾讯IM等）。"""
    from app.services.scenario_service import scenario_service
    return {"scenarios": scenario_service.list_scenarios()}

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
            company_scenario=req.company_scenario,
            llm_config=req.llm_config,
            web_search_enabled=bool(req.web_search_enabled),
            max_rounds=int(req.max_rounds) if req.max_rounds else 6
        )
        return {
            "session_id": state["session_id"],
            "title": state["title"],
            "candidate_profile": state["candidate_profile"],
            "jd_requirements": state["jd_requirements"],
            "interview_mode": state["interview_mode"],
            "company_scenario": state.get("company_scenario"),
            "web_search_enabled": state.get("web_search_enabled", False),
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
        new_state = await session_manager.submit_candidate_answer(
            session_id,
            req.message,
            search_config=req.search_config.model_dump() if req.search_config else None,
        )
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
@router.post("/{session_id}/simulate-answer")
async def simulate_standard_answer(session_id: str, req: Optional[SimulateAnswerRequest] = None):
    """Generate AI golden standard answer for candidate based on context, question, and optional web search."""
    try:
        result = await session_manager.simulate_standard_answer(
            session_id,
            search_config=(
                req.search_config.model_dump()
                if req and req.search_config
                else None
            ),
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/toggle-web-search")
async def toggle_web_search(session_id: str, req: Optional[ToggleWebSearchRequest] = None):
    """Toggle or set web search status for the current session."""
    try:
        enabled = req.enabled if req else None
        result = await session_manager.toggle_web_search(session_id, enabled=enabled)
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

@router.get("/{session_id}/transcript")
async def get_interview_transcript(session_id: str):
    """获取完整面试对话记录（在线回看）。"""
    transcript = await session_manager.get_transcript(session_id)
    if not transcript or not transcript.get("messages"):
        raise HTTPException(status_code=404, detail="对话记录不存在")
    return transcript

@router.get("/{session_id}/export")
async def export_interview_transcript(session_id: str, format: str = "markdown"):
    """将面试对话记录导出为文件下载（markdown / json）。"""
    transcript = await session_manager.get_transcript(session_id)
    if not transcript or not transcript.get("messages"):
        raise HTTPException(status_code=404, detail="对话记录不存在")

    fmt = (format or "markdown").lower()
    if fmt == "json":
        content = session_manager.render_transcript_json(transcript)
        media_type = "application/json; charset=utf-8"
        filename = session_manager.export_filename(transcript, "json")
    else:
        content = session_manager.render_transcript_markdown(transcript)
        media_type = "text/markdown; charset=utf-8"
        filename = session_manager.export_filename(transcript, "markdown")

    quoted = quote(filename)
    headers = {"Content-Disposition": f"attachment; filename=\"{quoted}\"; filename*=UTF-8''{quoted}"}
    return Response(content=content, media_type=media_type, headers=headers)

@router.get("/{session_id}/audit")
async def get_session_audit(session_id: str):
    """获取本场模拟面试中面试官表现质检与自我进化沉淀结果。"""
    state = await session_manager._ensure_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    report = session_manager.get_report(session_id) or {}
    audit = report.get("interviewer_audit")
    if not audit:
        from app.services.audit import audit_service
        audit = await audit_service.audit_session(state)
    return {"session_id": session_id, "interviewer_audit": audit}
