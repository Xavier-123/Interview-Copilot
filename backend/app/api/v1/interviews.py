from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from app.services.session_manager import session_manager
from app.services.memory import memory_gateway
from app.core.config import settings

router = APIRouter(prefix="/interviews", tags=["interviews"])

class CreateSessionRequest(BaseModel):
    resume_text: Optional[str] = Field(default="", max_length=100 * 1024)
    jd_text: Optional[str] = Field(default="", max_length=100 * 1024)
    interview_type: Optional[str] = "structured"  # technical | programmer | behavioral | hr | management | english | structured | custom
    industry: Optional[str] = "互联网/电商"
    job_role: Optional[str] = "后端开发"
    seniority: Optional[str] = "senior"           # junior | senior | expert | director
    difficulty: Optional[str] = "standard"        # easy | standard | hard
    style: Optional[str] = "rigorous"             # gentle | rigorous | stress
    language: Optional[str] = "zh"                # zh | en
    custom_config: Optional[Dict[str, Any]] = None
    company_scenario: Optional[Dict[str, Any]] = None
    llm_config: Optional[Dict[str, Any]] = None
    web_search_enabled: Optional[bool] = False
    max_rounds: Optional[int] = Field(default=None, ge=1, le=30)  # 轮次上限
    rounds_mode: Optional[str] = "fixed"          # 轮次决策模式: fixed (显式指定) | adaptive (大模型自决)

class SearchRuntimeConfig(BaseModel):
    provider: str = "tavily"
    api_key: Optional[str] = None

class AnswerRequest(BaseModel):
    message: str = Field(min_length=1, max_length=settings.MAX_ANSWER_BYTES)
    search_config: Optional[SearchRuntimeConfig] = None

class SimulateAnswerRequest(BaseModel):
    search_config: Optional[SearchRuntimeConfig] = None

class PauseRequest(BaseModel):
    elapsed_seconds: Optional[int] = 0

class ToggleWebSearchRequest(BaseModel):
    enabled: Optional[bool] = None

class MemoryConsentRequest(BaseModel):
    enabled: bool = False

class CompareRequest(BaseModel):
    session_id_1: str
    session_id_2: str

class BatchDeleteRequest(BaseModel):
    session_ids: List[str]

@router.get("/scenarios")
async def list_company_scenarios():
    """获取内置的大厂与垂直业务线场景卡片（美团外卖、字节推荐、拼多多跨境、阿里多活、腾讯IM等）。"""
    from app.services.scenario_service import scenario_service
    return {"scenarios": scenario_service.list_scenarios()}

@router.post("/session")
async def create_interview_session(req: CreateSessionRequest):
    """Create a new mock interview session with rich parameters."""
    try:
        state = await session_manager.create_session(
            resume_text=req.resume_text or "",
            jd_text=req.jd_text or "",
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
            max_rounds=int(req.max_rounds) if req.max_rounds else 6,
            rounds_mode=req.rounds_mode or "fixed"
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
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

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
            "turn_id": new_state.get("turn_id"),
            "trace_id": new_state.get("trace_id"),
            "question_intent": new_state.get("question_intent"),
            "director_decision": new_state.get("director_decision"),
            "status": new_state.get("status")
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

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
            "turn_id": new_state.get("turn_id"),
            "trace_id": new_state.get("trace_id"),
            "question_intent": new_state.get("question_intent"),
            "director_decision": new_state.get("director_decision"),
            "status": new_state.get("status")
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

@router.post("/{session_id}/pause")
async def pause_interview(session_id: str, req: Optional[PauseRequest] = None):
    """Pause the ongoing interview and freeze elapsed time."""
    try:
        elapsed = req.elapsed_seconds if req else 0
        result = await session_manager.pause_session(session_id, elapsed_seconds=elapsed)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

@router.post("/{session_id}/resume")
async def resume_interview(session_id: str):
    """Resume a paused interview session."""
    try:
        result = await session_manager.resume_session(session_id)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

@router.post("/{session_id}/redo")
async def redo_turn(session_id: str):
    """Redo current turn: rolls back the last answer so candidate can retry."""
    try:
        result = await session_manager.redo_turn(session_id)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

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
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

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
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

@router.post("/{session_id}/toggle-web-search")
async def toggle_web_search(session_id: str, req: Optional[ToggleWebSearchRequest] = None):
    """Toggle or set web search status for the current session."""
    try:
        enabled = req.enabled if req else None
        result = await session_manager.toggle_web_search(session_id, enabled=enabled)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

@router.post("/{session_id}/memory-consent")
async def set_memory_consent(session_id: str, req: MemoryConsentRequest):
    """Explicitly enable or disable candidate long-term memory writes."""
    try:
        return await session_manager.set_memory_consent(session_id, req.enabled)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

@router.get("/{session_id}/memory")
async def list_session_memory(session_id: str):
    """List explicitly consented candidate memories for the local user."""
    state = await session_manager._ensure_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session_id,
        "memory_consent": bool(state.get("memory_consent", False)),
        "memories": await memory_gateway.list_candidate_memories("local-user"),
    }

@router.post("/evolution/candidates/{candidate_id}/approve")
async def approve_evolution_candidate(candidate_id: str):
    """Approve a reviewable interviewer evolution candidate."""
    try:
        return await session_manager.approve_evolution_candidate(candidate_id)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

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
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

@router.get("/history")
async def get_interview_history(min_rounds: int = 3, auto_cleanup: bool = False):
    """List all interview history (local single-user mode, default min_rounds >= 3)."""
    history = await session_manager.get_history(min_rounds=min_rounds, auto_cleanup=auto_cleanup)
    return {"history": history}

@router.post("/history/cleanup-incomplete")
async def cleanup_incomplete_records(min_rounds: int = 3, older_than_minutes: Optional[int] = None):
    """Clean up mock interview records with fewer than min_rounds turns (optionally older than N minutes)."""
    deleted = await session_manager.cleanup_incomplete_sessions(
        min_rounds=min_rounds,
        older_than_minutes=older_than_minutes
    )
    return {
        "status": "success",
        "deleted": deleted,
        "min_rounds": min_rounds,
        "older_than_minutes": older_than_minutes
    }

@router.post("/history/compare")
async def compare_interview_sessions(req: CompareRequest):
    """Compare two interview reports to analyze growth radar deltas and progress."""
    try:
        result = await session_manager.compare_sessions(req.session_id_1, req.session_id_2)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

@router.delete("/history/{session_id}")
async def delete_interview_record(session_id: str):
    """Delete an interview session and its report."""
    success = await session_manager.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="记录未找到或删除失败")
    return {"status": "success", "message": "已删除面试记录"}

@router.post("/history/batch-delete")
async def batch_delete_interview_records(req: BatchDeleteRequest):
    """Batch delete interview sessions and their reports."""
    if not req.session_ids:
        raise HTTPException(status_code=400, detail="session_ids 不能为空")
    deleted = await session_manager.delete_sessions(req.session_ids)
    return {"status": "success", "deleted": deleted}

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

@router.get("/{session_id}/prompts")
async def get_interview_prompts(session_id: str):
    """获取本场模拟面试全链路大模型 Prompt 完整调用记录。"""
    transcript = await session_manager.get_transcript(session_id)
    if not transcript:
        raise HTTPException(status_code=404, detail="会话不存在")
    prompt_logs = transcript.get("prompt_logs", [])
    return {
        "session_id": session_id,
        "total_calls": len(prompt_logs),
        "prompt_logs": prompt_logs,
    }

@router.get("/{session_id}/export")
async def export_interview_transcript(session_id: str, format: str = "markdown"):
    """将面试对话记录导出为文件下载（markdown / json / prompts_markdown / prompts_json）。"""
    transcript = await session_manager.get_transcript(session_id)
    if not transcript or not transcript.get("messages"):
        raise HTTPException(status_code=404, detail="对话记录不存在")

    fmt = (format or "markdown").lower()
    if fmt in ("prompts_markdown", "prompts_md"):
        from app.services.prompt_recorder import prompt_recorder
        content = prompt_recorder.render_full_prompts_markdown(
            transcript.get("session", {}),
            transcript.get("prompt_logs", []),
            transcript.get("messages", [])
        )
        media_type = "text/markdown; charset=utf-8"
        filename = session_manager.export_filename(transcript, "prompts_markdown")
    elif fmt == "prompts_json":
        from app.services.prompt_recorder import prompt_recorder
        content = prompt_recorder.render_full_prompts_json(
            transcript.get("session", {}),
            transcript.get("prompt_logs", []),
            transcript.get("messages", [])
        )
        media_type = "application/json; charset=utf-8"
        filename = session_manager.export_filename(transcript, "prompts_json")
    elif fmt == "json":
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
        # Read-only audit endpoint must not activate interviewer memories.
        audit = await audit_service.audit_session(state, persist=False)
    return {"session_id": session_id, "interviewer_audit": audit}
