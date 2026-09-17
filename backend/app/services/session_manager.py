import uuid
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from app.models.db import AsyncSessionLocal
from app.models.interview import InterviewSessionModel, InterviewMessageModel, InterviewReportModel
from app.agents.state import InterviewState
from app.agents.graph import interview_app
from app.agents.evaluator import generate_evaluation_report
from app.services.parser import parser_service

logger = logging.getLogger(__name__)

class SessionManager:
    def __init__(self):
        # In-memory cache for ultra-fast access, backed by SQLite DB
        self._sessions: Dict[str, InterviewState] = {}
        self._reports: Dict[str, Dict[str, Any]] = {}

    async def create_session(
        self,
        resume_text: str = "",
        jd_text: str = "",
        user_id: str = "guest_user",
        interview_type: str = "structured",
        industry: str = "互联网/电商",
        job_role: str = "后端开发",
        seniority: str = "senior",
        difficulty: str = "standard",
        style: str = "rigorous",
        language: str = "zh",
        custom_config: Optional[Dict[str, Any]] = None,
        llm_config: Optional[Dict[str, Any]] = None,
        tech_rounds_target: int = 2,
        max_rounds: int = 6
    ) -> InterviewState:
        session_id = str(uuid.uuid4())

        # 1. Parse Resume and JD
        candidate_profile = await parser_service.parse_resume(resume_text, llm_config=llm_config)
        jd_requirements = await parser_service.parse_jd(jd_text, llm_config=llm_config)

        # 2. Build initial state
        initial_state: InterviewState = {
            "session_id": session_id,
            "user_id": user_id,
            "title": f"{job_role} - {interview_type.capitalize()} 模拟面试",
            "stage": "icebreak",
            "current_interviewer": "orchestrator",
            "next_interviewer": "candidate",
            "interview_type": interview_type,
            "industry": industry,
            "job_role": job_role,
            "seniority": seniority,
            "difficulty": difficulty,
            "style": style,
            "language": language,
            "custom_config": custom_config,
            "round_count": 0,
            "max_rounds": max_rounds,
            "tech_rounds_target": tech_rounds_target,
            "hr_rounds_target": 1,
            "mgmt_rounds_target": 3,
            "stress_triggered": False,
            "current_topic": None,
            "topic_depth": 0,
            "last_satisfaction_score": 0.0,
            "dig_action": "INIT",
            "follow_up_hint": None,
            "candidate_profile": candidate_profile,
            "jd_requirements": jd_requirements,
            "interview_mode": {
                "interview_type": interview_type,
                "industry": industry,
                "job_role": job_role,
                "seniority": seniority,
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
        if llm_config:
            initial_state["llm_config"] = llm_config

        self._sessions[session_id] = initial_state

        # 3. Persist session to SQLite DB
        try:
            async with AsyncSessionLocal() as db:
                session_record = InterviewSessionModel(
                    id=session_id,
                    user_id=user_id,
                    title=initial_state["title"],
                    interview_type=interview_type,
                    industry=industry,
                    job_role=job_role,
                    seniority=seniority,
                    difficulty=difficulty,
                    style=style,
                    language=language,
                    status="ready",
                    round_count=0,
                    max_rounds=max_rounds,
                    elapsed_seconds=0,
                    candidate_profile=candidate_profile,
                    jd_requirements=jd_requirements,
                    interview_state=dict(initial_state)
                )
                db.add(session_record)
                await db.commit()
        except Exception as e:
            logger.error(f"Failed to persist new session to DB: {e}")

        return initial_state

    async def start_session(self, session_id: str) -> Dict[str, Any]:
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        state["status"] = "in_progress"
        new_state = await interview_app.ainvoke(state)
        self._sessions[session_id] = new_state

        await self._sync_state_to_db(session_id, new_state)
        return new_state

    async def submit_candidate_answer(self, session_id: str, user_message: str) -> Dict[str, Any]:
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        # Record candidate answer
        user_msg = {
            "role": "user",
            "name": "candidate",
            "content": user_message,
            "stage": state.get("stage"),
            "timestamp": datetime.now().isoformat()
        }

        state["latest_user_input"] = user_message
        state["messages"] = state.get("messages", []) + [user_msg]
        state["status"] = "in_progress"

        new_state = await interview_app.ainvoke(state)
        self._sessions[session_id] = new_state

        await self._sync_state_to_db(session_id, new_state)
        return new_state

    async def pause_session(self, session_id: str, elapsed_seconds: int = 0) -> Dict[str, Any]:
        """Pause interview session and freeze state."""
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        state["status"] = "paused"
        self._sessions[session_id] = state

        try:
            async with AsyncSessionLocal() as db:
                record = await db.get(InterviewSessionModel, session_id)
                if record:
                    record.status = "paused"
                    record.elapsed_seconds = elapsed_seconds
                    record.interview_state = dict(state)
                    await db.commit()
        except Exception as e:
            logger.error(f"Failed to pause session in DB: {e}")

        return {"status": "paused", "session_id": session_id, "state": state}

    async def resume_session(self, session_id: str) -> Dict[str, Any]:
        """Resume paused interview session."""
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        state["status"] = "waiting_user"
        self._sessions[session_id] = state

        try:
            async with AsyncSessionLocal() as db:
                record = await db.get(InterviewSessionModel, session_id)
                if record:
                    record.status = "waiting_user"
                    record.interview_state = dict(state)
                    await db.commit()
        except Exception as e:
            logger.error(f"Failed to resume session in DB: {e}")

        return {"status": "resumed", "session_id": session_id, "state": state}

    async def redo_turn(self, session_id: str) -> Dict[str, Any]:
        """
        Redo current turn: rolls back the last candidate answer and last interviewer follow-up,
        so candidate can answer the current question again.
        """
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        msgs = list(state.get("messages", []))
        if len(msgs) >= 2 and msgs[-1].get("role") == "assistant" and msgs[-2].get("role") == "user":
            # Pop interviewer response and candidate answer
            msgs.pop()
            msgs.pop()
            state["messages"] = msgs
            state["round_count"] = max(0, state.get("round_count", 1) - 1)

            logs = list(state.get("evaluation_logs", []))
            if logs:
                logs.pop()
                state["evaluation_logs"] = logs

            state["status"] = "waiting_user"
            self._sessions[session_id] = state
            await self._sync_state_to_db(session_id, state)
            return {"status": "success", "message": "已重置本题，请重新作答", "state": state}

        return {"status": "warning", "message": "当前暂无可重答的对话记录", "state": state}

    async def restart_session(self, session_id: str) -> Dict[str, Any]:
        """Restart entire session with same settings."""
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        state["round_count"] = 0
        state["stage"] = "icebreak"
        state["current_interviewer"] = "orchestrator"
        state["messages"] = []
        state["evaluation_logs"] = []
        state["condensed_memory"] = ""
        state["lifelines_used"] = 0
        state["status"] = "ready"
        state["stress_triggered"] = False

        self._sessions[session_id] = state
        return await self.start_session(session_id)

    async def request_lifeline(self, session_id: str) -> Dict[str, Any]:
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        state["lifelines_used"] = state.get("lifelines_used", 0) + 1

        last_question = "当前考点"
        for m in reversed(state.get("messages", [])):
            if m.get("role") == "assistant":
                last_question = m.get("content", "")
                break

        hint_content = f"💡【求助提示 Lifeline】：针对'{last_question[:60]}...'，建议从系统瓶颈定位、技术选型权衡(Trade-off)与极端容灾补偿三个层面展开回答。"

        hint_msg = {
            "role": "assistant",
            "name": "orchestrator",
            "content": hint_content,
            "stage": state.get("stage"),
            "timestamp": datetime.now().isoformat()
        }
        state["messages"] = state.get("messages", []) + [hint_msg]
        self._sessions[session_id] = state
        await self._sync_state_to_db(session_id, state)

        return {
            "hint": hint_content,
            "lifelines_used": state["lifelines_used"],
            "state": state
        }

    async def finish_and_evaluate(self, session_id: str) -> Dict[str, Any]:
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        state["status"] = "finished"
        report = await generate_evaluation_report(state)
        self._reports[session_id] = report

        # Persist report and update session in DB
        try:
            async with AsyncSessionLocal() as db:
                record = await db.get(InterviewSessionModel, session_id)
                if record:
                    record.status = "finished"
                    record.round_count = state.get("round_count", 0)
                    record.interview_state = dict(state)

                report_record = InterviewReportModel(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    match_verdict=report.get("match_verdict", "建议通过"),
                    overall_summary=report.get("overall_summary", ""),
                    radar_scores=report.get("radar_scores", {}),
                    strengths=report.get("strengths", []),
                    weaknesses=report.get("weaknesses", []),
                    detailed_reviews=report.get("detailed_reviews", []),
                    learning_plan=report.get("learning_plan", []),
                    seven_day_roadmap=report.get("seven_day_roadmap", []),
                    drill_cards=report.get("drill_cards", [])
                )
                db.add(report_record)
                await db.commit()
        except Exception as e:
            logger.error(f"Failed to persist report to DB: {e}")

        return report

    async def get_user_history(self, user_id: str) -> List[Dict[str, Any]]:
        """Get history list of interview sessions for user."""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(InterviewSessionModel)
                    .options(selectinload(InterviewSessionModel.report))
                    .where(InterviewSessionModel.user_id == user_id)
                    .order_by(desc(InterviewSessionModel.created_at))
                )
                sessions = result.scalars().all()
                history_list = []
                for s in sessions:
                    rep = s.report
                    history_list.append({
                        "session_id": s.id,
                        "title": s.title,
                        "interview_type": s.interview_type,
                        "industry": s.industry,
                        "job_role": s.job_role,
                        "seniority": s.seniority,
                        "difficulty": s.difficulty,
                        "status": s.status,
                        "round_count": s.round_count,
                        "elapsed_seconds": s.elapsed_seconds,
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                        "has_report": rep is not None,
                        "match_verdict": rep.match_verdict if rep else None,
                        "overall_summary": rep.overall_summary if rep else None,
                        "radar_scores": rep.radar_scores if rep else None
                    })
                return history_list
        except Exception as e:
            logger.error(f"Failed to query history from DB: {e}")
            return []

    async def get_session_detail(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve full details of a session including report and messages from DB."""
        state = self._sessions.get(session_id)
        report = self._reports.get(session_id)

        if not state or not report:
            try:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(InterviewSessionModel)
                        .options(
                            selectinload(InterviewSessionModel.messages),
                            selectinload(InterviewSessionModel.report)
                        )
                        .where(InterviewSessionModel.id == session_id)
                    )
                    s = result.scalars().first()
                    if s:
                        if not state and s.interview_state:
                            state = s.interview_state
                            self._sessions[session_id] = state
                        if s.report:
                            report = {
                                "match_verdict": s.report.match_verdict,
                                "overall_summary": s.report.overall_summary,
                                "radar_scores": s.report.radar_scores,
                                "strengths": s.report.strengths,
                                "weaknesses": s.report.weaknesses,
                                "detailed_reviews": s.report.detailed_reviews,
                                "learning_plan": s.report.learning_plan,
                                "seven_day_roadmap": s.report.seven_day_roadmap,
                                "drill_cards": s.report.drill_cards
                            }
                            self._reports[session_id] = report
            except Exception as e:
                logger.error(f"Failed to load session detail from DB: {e}")

        return {
            "session_id": session_id,
            "state": state,
            "report": report
        }

    async def compare_sessions(self, session_id_1: str, session_id_2: str) -> Dict[str, Any]:
        """Compare two interview sessions and generate growth radar and delta."""
        detail1 = await self.get_session_detail(session_id_1)
        detail2 = await self.get_session_detail(session_id_2)

        rep1 = detail1.get("report") if detail1 else None
        rep2 = detail2.get("report") if detail2 else None

        if not rep1 or not rep2:
            raise ValueError("两场面试中至少有一场尚未生成评估报告，无法进行对比。")

        radar1 = rep1.get("radar_scores", {})
        radar2 = rep2.get("radar_scores", {})

        dimensions = [
            ("technical_depth", "技术深度"),
            ("technical_breadth", "技术广度"),
            ("communication_logic", "表达逻辑"),
            ("star_completeness", "STAR规范"),
            ("stress_resilience", "抗压韧性"),
            ("job_matching", "岗位契合")
        ]

        radar_comparison = []
        deltas = {}
        for key, name in dimensions:
            s1 = float(radar1.get(key, 7.0))
            s2 = float(radar2.get(key, 7.0))
            delta = round(s2 - s1, 2)
            radar_comparison.append({
                "dimension": name,
                "dimension_key": key,
                "session_1_score": s1,
                "session_2_score": s2,
                "delta": delta
            })
            deltas[key] = delta

        # Analyze resolved weaknesses
        w1 = set(rep1.get("weaknesses", []))
        w2 = set(rep2.get("weaknesses", []))

        return {
            "session_1": {
                "session_id": session_id_1,
                "title": detail1["state"].get("title") if detail1.get("state") else "首次面试",
                "match_verdict": rep1.get("match_verdict"),
                "radar_scores": radar1,
                "weaknesses": rep1.get("weaknesses", [])
            },
            "session_2": {
                "session_id": session_id_2,
                "title": detail2["state"].get("title") if detail2.get("state") else "本次面试",
                "match_verdict": rep2.get("match_verdict"),
                "radar_scores": radar2,
                "weaknesses": rep2.get("weaknesses", [])
            },
            "radar_comparison": radar_comparison,
            "deltas": deltas,
            "overall_improvement": round(
                sum(deltas.values()) / max(1, len(deltas)), 2
            ),
            "summary": (
                f"相较于前次模拟面试，综合能力维度整体变动 {round(sum(deltas.values()) / max(1, len(deltas)), 2):+0.2f} 分。"
                f"在【{max(radar_comparison, key=lambda x: x['delta'])['dimension']}】上进步最为显著。"
            )
        }

    async def delete_session(self, session_id: str) -> bool:
        """Delete session from DB and cache."""
        self._sessions.pop(session_id, None)
        self._reports.pop(session_id, None)
        try:
            async with AsyncSessionLocal() as db:
                record = await db.get(InterviewSessionModel, session_id)
                if record:
                    await db.delete(record)
                    await db.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
        return False

    def get_session(self, session_id: str) -> Optional[InterviewState]:
        return self._sessions.get(session_id)

    def get_report(self, session_id: str) -> Optional[Dict[str, Any]]:
        return self._reports.get(session_id)

    async def _ensure_state(self, session_id: str) -> Optional[InterviewState]:
        if session_id in self._sessions:
            return self._sessions[session_id]
        # Try loading from DB
        try:
            async with AsyncSessionLocal() as db:
                record = await db.get(InterviewSessionModel, session_id)
                if record and record.interview_state:
                    self._sessions[session_id] = record.interview_state
                    return self._sessions[session_id]
        except Exception as e:
            logger.error(f"Failed to restore session from DB: {e}")
        return None

    async def _sync_state_to_db(self, session_id: str, state: InterviewState):
        try:
            async with AsyncSessionLocal() as db:
                record = await db.get(InterviewSessionModel, session_id)
                if record:
                    record.status = state.get("status", "in_progress")
                    record.round_count = state.get("round_count", 0)
                    record.interview_state = dict(state)

                    # Save latest message if any
                    msgs = state.get("messages", [])
                    if msgs:
                        last_m = msgs[-1]
                        msg_record = InterviewMessageModel(
                            id=str(uuid.uuid4()),
                            session_id=session_id,
                            role=last_m.get("role", "assistant"),
                            name=last_m.get("name"),
                            content=last_m.get("content", ""),
                            stage=last_m.get("stage")
                        )
                        db.add(msg_record)

                    await db.commit()
        except Exception as e:
            logger.error(f"Failed to sync state to DB: {e}")

session_manager = SessionManager()
