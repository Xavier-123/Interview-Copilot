import asyncio
import copy
import uuid
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from sqlalchemy import select, desc, delete, func
from sqlalchemy.orm import selectinload
from langchain_core.messages import SystemMessage, HumanMessage
from app.models.db import AsyncSessionLocal
from app.models.interview import InterviewSessionModel, InterviewMessageModel, InterviewReportModel
from app.models.architecture import EvolutionCandidateModel
from app.models.persona import InterviewerPersona
from app.agents.state import InterviewState
from app.agents.graph import interview_app
from app.agents.evaluator import generate_evaluation_report
from app.agents.persona_node import PERSONA_KEY_PREFIX, PERSONA_REF_PREFIX
from app.agents.prompts import SIMULATE_ANSWER_PROMPT
from app.agents.llm import llm_service
from app.services.parser import parser_service
from app.services.search import search_service
from app.services.scenario_service import scenario_service
from app.services.audit import audit_service
from app.services.memory import memory_gateway
from app.agents.persona_presets import PERSONA_PRESETS

logger = logging.getLogger(__name__)

# 面试类型的中文标签（用于会话标题、对话记录导出等展示场景）
INTERVIEW_TYPE_LABELS = {
    "technical": "技术深度面",
    "programmer": "程序员综合面",
    "behavioral": "STAR行为面",
    "hr": "HR综合面",
    "management": "管理岗面",
    "english": "英语全真面",
    "structured": "结构化全流程",
    "custom": "自选定制面",
}

# 面试官角色的中文称谓（用于对话记录渲染）
INTERVIEWER_LABELS = {
    "orchestrator": "主考官",
    "technical": "技术面试官",
    "programmer": "程序员面试官",
    "hr": "HR面试官",
    "challenger": "压力挑战官",
    "management": "管理面试官",
    "candidate": "候选人",
}

# 每轮作答会被图节点改写的"考官决策"字段：提交前快照，redo 回滚时恢复，
# 否则重答同一题时影子观察员/面试官会沿用上一轮回答留下的判断。
_TURN_TRACKED_FIELDS = (
    "stage",                    # 过渡节点（如 orchestrator_to_hr）与提问在同一次调用里推进
    "current_interviewer",
    "next_interviewer",
    "round_count",
    "stress_triggered",         # challenger 节点置 True
    "current_topic",
    "topic_depth",
    "last_satisfaction_score",
    "last_answer_status",
    "dig_action",
    "switch_reason",
    "next_topic_hint",
    "follow_up_hint",
    "break_routine_hint",
    "condensed_memory",         # 观察员每轮滚动追加
    "evaluation_logs",
    "question_intent",
    "director_decision",
    "evidence_refs",
    "evidence_turn_ids",
    "next_node",
)

# 保留的快照数量（支持连续多次 redo），随 interview_state 一起持久化
MAX_TURN_SNAPSHOTS = 3

class SessionManager:
    def __init__(self):
        # In-memory cache for ultra-fast access, backed by SQLite DB
        self._sessions: Dict[str, InterviewState] = {}
        self._reports: Dict[str, Dict[str, Any]] = {}
        # User-supplied model credentials are runtime-only.  They must never be
        # embedded in InterviewState because that state is persisted and exposed
        # by the session/transcript APIs.
        self._llm_configs: Dict[str, Dict[str, Any]] = {}
        self._finish_locks: Dict[str, asyncio.Lock] = {}
        self._turn_locks: Dict[str, asyncio.Lock] = {}

    def _finish_lock(self, session_id: str) -> asyncio.Lock:
        lock = self._finish_locks.get(session_id)
        if lock is None:
            lock = asyncio.Lock()
            self._finish_locks[session_id] = lock
        return lock

    def _turn_lock(self, session_id: str) -> asyncio.Lock:
        lock = self._turn_locks.get(session_id)
        if lock is None:
            lock = asyncio.Lock()
            self._turn_locks[session_id] = lock
        return lock

    def _runtime_state(self, session_id: str, state: InterviewState) -> InterviewState:
        """Return a transient graph input containing the session's private LLM config."""
        runtime_state = dict(state)
        # turn_snapshots 是 redo 用的快照，不是图 schema 通道，不传入图
        runtime_state.pop("turn_snapshots", None)
        llm_config = self._llm_configs.get(session_id)
        if llm_config:
            runtime_state["llm_config"] = llm_config
        return runtime_state

    @staticmethod
    def _strip_private_state(state: Optional[InterviewState]) -> Optional[InterviewState]:
        """Remove credentials from a state loaded from cache or legacy storage."""
        if state is None:
            return None
        state = dict(state)
        state.pop("llm_config", None)
        return state

    async def create_session(
        self,
        resume_text: str = "",
        jd_text: str = "",
        interview_type: str = "structured",
        industry: str = "互联网/电商",
        job_role: str = "后端开发",
        seniority: str = "senior",
        difficulty: str = "standard",
        style: str = "rigorous",
        language: str = "zh",
        custom_config: Optional[Dict[str, Any]] = None,
        llm_config: Optional[Dict[str, Any]] = None,
        web_search_enabled: bool = False,
        tech_rounds_target: int = 2,
        max_rounds: int = 6,
        company_scenario: Optional[Dict[str, Any]] = None
    ) -> InterviewState:
        session_id = str(uuid.uuid4())
        type_label = INTERVIEW_TYPE_LABELS.get(interview_type, interview_type)

        # 0. 解析自定义面试官阵容：将 persona:<id> 引用替换为稳定 key，并把人设快照进会话
        custom_config = await self._resolve_custom_config(custom_config)

        # 0.5 目标企业与业务线真实场景匹配
        if not company_scenario:
            target_co = (custom_config or {}).get("target_company") or (custom_config or {}).get("company") or ""
            company_scenario = scenario_service.match_scenario(
                company=target_co,
                industry=industry,
                job_role=job_role
            )

        # 1. Parse Resume and JD
        candidate_profile = await parser_service.parse_resume(resume_text, llm_config=llm_config)
        jd_requirements = await parser_service.parse_jd(jd_text, llm_config=llm_config)

        # 2. Build initial state
        initial_state: InterviewState = {
            "session_id": session_id,
            "title": f"{job_role} - {type_label}模拟面试",
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
            "company_scenario": company_scenario,
            "web_search_enabled": web_search_enabled,
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
            "break_routine_hint": None,
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
        # Trace metadata is persisted with the session so a resumed interview
        # remains diagnosable across process restarts.
        initial_state.update({
            "turn_id": str(uuid.uuid4()),
            "trace_id": str(uuid.uuid4()),
            "interviewer_id": "orchestrator",
            "interviewer_version": "legacy-v1",
            "question_intent": {},
            "director_decision": {},
            "evidence_refs": [],
            "evidence_turn_ids": [],
            "authorized_memory_refs": [],
            "memory_consent": False,
            "turn_deadline": None,
            "next_node": "orchestrator_welcome",
        })
        self._sessions[session_id] = initial_state
        if llm_config:
            # Keep the config available to the graph for this process only.
            self._llm_configs[session_id] = dict(llm_config)

        # 3. Persist session to SQLite DB
        try:
            async with AsyncSessionLocal() as db:
                session_record = InterviewSessionModel(
                    id=session_id,
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
                    web_search_enabled=web_search_enabled,
                    company_scenario=company_scenario,
                    interviewer_id=initial_state["interviewer_id"],
                    interviewer_version=initial_state["interviewer_version"],
                    trace_id=initial_state["trace_id"],
                    candidate_profile=candidate_profile,
                    jd_requirements=jd_requirements,
                    interview_state=self._strip_private_state(initial_state)
                )
                db.add(session_record)
                await db.commit()
        except Exception as e:
            logger.error(f"Failed to persist new session to DB: {e}")

        return initial_state

    async def _resolve_custom_config(
        self, custom_config: Optional[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        解析自定义面试配置中的自定义面试官引用与内置流派预设：
        - selected_interviewers 中的 "persona:<人设ID>" 替换为该人设的稳定 key（persona_xxxx）
        - selected_interviewers 中的 "preset_xxxx" 注入内置预设快照
        - 将引用到的完整人设快照进 custom_config.personas，并生成 persona_labels 便于展示
        之后编辑/删除人设不影响本场会话。
        """
        if not custom_config:
            return custom_config
        selected = custom_config.get("selected_interviewers")
        if not selected:
            return custom_config

        persona_id_set = {
            entry.split(":", 1)[1]
            for entry in selected
            if isinstance(entry, str) and entry.startswith(PERSONA_REF_PREFIX)
        }

        snapshots: Dict[str, Dict[str, Any]] = {}

        # 1. 注入内置流派预设快照
        for entry in selected:
            if isinstance(entry, str) and entry.startswith("preset_"):
                for p in PERSONA_PRESETS:
                    if p["key"] == entry:
                        snapshots[entry] = p

        if persona_id_set:
            try:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(InterviewerPersona).where(
                            InterviewerPersona.id.in_(persona_id_set),
                            InterviewerPersona.enabled == True,  # noqa: E712
                        )
                    )
                    for p in result.scalars().all():
                        snapshots[p.id] = {
                            "id": p.id,
                            "key": p.key,
                            "name": p.name,
                            "avatar": p.avatar or "🎭",
                            "description": p.description or "",
                            "system_prompt": p.system_prompt,
                            "focus_topics": p.focus_topics or [],
                            "opening_hint": p.opening_hint or "",
                            "deep_dive_hint": p.deep_dive_hint or "",
                            "probe_hint": p.probe_hint or "",
                            "switch_hint": p.switch_hint or "",
                            "school_of_thought": getattr(p, "school_of_thought", "standard") or "standard",
                            "dislikes": getattr(p, "dislikes", []) or [],
                            "preferences": getattr(p, "preferences", []) or [],
                            "skepticism_level": float(getattr(p, "skepticism_level", 0.5) or 0.5),
                            "interaction_traits": getattr(p, "interaction_traits", {}) or {},
                        }
            except Exception as e:
                logger.error(f"Failed to load persona snapshots for session: {e}")

        resolved_lineup: List[str] = []
        for entry in selected:
            if isinstance(entry, str) and entry.startswith(PERSONA_REF_PREFIX):
                snapshot = snapshots.get(entry.split(":", 1)[1])
                if snapshot:
                    resolved_lineup.append(snapshot["key"])
            else:
                resolved_lineup.append(entry)

        if not resolved_lineup:
            resolved_lineup = ["technical", "hr"]

        persona_snapshots = list({s["key"]: s for s in snapshots.values()}.values())
        custom_config = dict(custom_config)
        custom_config["selected_interviewers"] = resolved_lineup
        if persona_snapshots:
            custom_config["personas"] = persona_snapshots
            custom_config["persona_labels"] = {s["key"]: s["name"] for s in persona_snapshots}
        return custom_config

    async def start_session(self, session_id: str) -> Dict[str, Any]:
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        state["status"] = "in_progress"
        runtime_state = self._runtime_state(session_id, state)
        new_state = await interview_app.ainvoke(runtime_state)
        new_state = self._strip_private_state(new_state) or state
        # 图输出不含 turn_snapshots（非 schema 通道），重新挂回以供 redo 使用
        new_state["turn_snapshots"] = state.get("turn_snapshots", [])
        self._annotate_turn_messages(new_state)
        self._sessions[session_id] = new_state

        await self._sync_state_to_db(session_id, new_state)
        return new_state

    async def submit_candidate_answer(
        self,
        session_id: str,
        user_message: str,
        search_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        # REST and WebSocket can target the same session concurrently. Serialize
        # the full read -> graph invoke -> persist sequence per session.
        async with self._turn_lock(session_id):
            return await self._submit_candidate_answer_unlocked(
                session_id, user_message, search_config
            )

    async def _submit_candidate_answer_unlocked(
        self,
        session_id: str,
        user_message: str,
        search_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        # 在本轮改写状态前，快照"考官决策"字段，供 redo_turn 回滚恢复
        snapshot = {field: copy.deepcopy(state.get(field)) for field in _TURN_TRACKED_FIELDS}
        snapshots = list(state.get("turn_snapshots") or [])
        snapshots.append(snapshot)
        snapshots = snapshots[-MAX_TURN_SNAPSHOTS:]

        # Record candidate answer
        user_msg = {
            "role": "user",
            "name": "candidate",
            "content": user_message,
            "stage": state.get("stage"),
            "timestamp": datetime.now().isoformat()
        }

        state["latest_user_input"] = user_message
        state["turn_id"] = str(uuid.uuid4())
        state["trace_id"] = str(uuid.uuid4())
        state["messages"] = state.get("messages", []) + [user_msg]
        state["status"] = "in_progress"

        run_config = (
            {"configurable": {"search_config": search_config}}
            if search_config
            else None
        )
        runtime_state = self._runtime_state(session_id, state)
        new_state = await interview_app.ainvoke(runtime_state, config=run_config)
        new_state = self._strip_private_state(new_state) or state
        # 图输出不含 turn_snapshots（非 schema 通道），挂回本轮快照以供 redo 使用
        new_state["turn_snapshots"] = snapshots
        self._annotate_turn_messages(new_state)
        await self._persist_latest_evidence(new_state)
        self._sessions[session_id] = new_state

        await self._sync_state_to_db(session_id, new_state)
        return new_state

    @staticmethod
    def _annotate_turn_messages(state: InterviewState) -> None:
        """Attach trace metadata to newly generated messages without changing
        the legacy message shape consumed by the frontend."""
        turn_id = state.get("turn_id")
        trace_id = state.get("trace_id")
        for message in state.get("messages", [])[-3:]:
            if isinstance(message, dict):
                message.setdefault("turn_id", turn_id)
                message.setdefault("trace_id", trace_id)

    async def _persist_latest_evidence(self, state: InterviewState) -> None:
        logs = state.get("evaluation_logs") or []
        if not logs:
            return
        latest = logs[-1]
        if not isinstance(latest, dict):
            return
        existing = list(state.get("evidence_refs") or [])
        existing_turns = list(state.get("evidence_turn_ids") or [])
        # The graph is invoked once per candidate answer, so the latest log is
        # the only new evidence item in this call. Avoid duplicate inserts on
        # retries by using the current turn id as the dedupe marker in state.
        turn_id = state.get("turn_id")
        if turn_id and turn_id in existing_turns:
            return
        try:
            evidence_id = await memory_gateway.write_evidence(
                session_id=state.get("session_id", ""),
                turn_id=state.get("turn_id"),
                observation=latest,
            )
            existing.append(evidence_id)
            state["evidence_refs"] = existing
            if turn_id:
                existing_turns.append(turn_id)
                state["evidence_turn_ids"] = existing_turns
        except Exception as exc:
            logger.warning("Failed to persist evidence: %s", exc)

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

        除了回滚消息/轮次/评估日志，还会恢复本轮作答前快照的考官决策状态
        （current_topic / topic_depth / dig_action / condensed_memory / follow_up_hint /
        stress_triggered / stage 等），保证重答与首次作答处于同一决策起点，
        影子观察员不会沿用上一轮回答留下的判断。
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

            logs = list(state.get("evaluation_logs", []))
            if logs:
                logs.pop()
                state["evaluation_logs"] = logs

            # 恢复本轮作答前的决策快照；旧会话无快照时仅回退轮次（保持向后兼容）
            snapshots = list(state.get("turn_snapshots") or [])
            if snapshots:
                state["turn_snapshots"] = snapshots[:-1]
                state.update(snapshots[-1])
            else:
                state["round_count"] = max(0, state.get("round_count", 1) - 1)

            # 清空残留回答，避免图再次被调用时影子观察员误判旧答案
            state["latest_user_input"] = None
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
        # 重置考点追踪决策字段，否则新一轮会沿用上一场的追问判断
        state["current_topic"] = None
        state["topic_depth"] = 0
        state["last_satisfaction_score"] = 0.0
        state["last_answer_status"] = "unknown"
        state["dig_action"] = "INIT"
        state["switch_reason"] = None
        state["next_topic_hint"] = None
        state["follow_up_hint"] = None
        state["break_routine_hint"] = None
        state["latest_user_input"] = None
        state["turn_id"] = str(uuid.uuid4())
        state["trace_id"] = str(uuid.uuid4())
        state["question_intent"] = {}
        state["director_decision"] = {}
        state["evidence_refs"] = []
        state["evidence_turn_ids"] = []
        state["memory_consent"] = False
        state["turn_snapshots"] = []

        self._sessions[session_id] = state

        # 重开一场：清空该会话历史消息行，避免与新一轮对话混淆
        self._reports.pop(session_id, None)

        try:
            async with AsyncSessionLocal() as db:
                await db.execute(
                    delete(InterviewMessageModel)
                    .where(InterviewMessageModel.session_id == session_id)
                )
                await db.execute(
                    delete(InterviewReportModel)
                    .where(InterviewReportModel.session_id == session_id)
                )
                record = await db.get(InterviewSessionModel, session_id)
                if record:
                    record.elapsed_seconds = 0
                await db.commit()
        except Exception as e:
            logger.error(f"Failed to clear messages for restart: {e}")

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

        async with self._finish_lock(session_id):
            # A user can click finish while the automatic finish path is still
            # running. Reuse the already generated report instead of inserting a
            # second row with the unique session_id constraint.
            if session_id in self._reports:
                return self._reports[session_id]

            detail = await self.get_session_detail(session_id)
            if detail and detail.get("report"):
                self._reports[session_id] = detail["report"]
                return detail["report"]

            state = await self._ensure_state(session_id)
            if not state:
                raise ValueError(f"Session {session_id} not found")
            state["status"] = "finished"
            runtime_state = self._runtime_state(session_id, state)
            report = await generate_evaluation_report(runtime_state)

            # 触发面试官表现质检与自我进化闭环（沉淀黄金案例与避坑经验）
            try:
                audit_result = await audit_service.audit_session(runtime_state, persist=False)
                report["interviewer_audit"] = audit_result
                candidate_id = await self._create_evolution_candidate(runtime_state, audit_result)
                if candidate_id:
                    report["evolution_candidate_id"] = candidate_id
            except Exception as e:
                logger.warning(f"Self-evolution audit failed: {e}")

            self._reports[session_id] = report

            # Persist report and update session in DB
            try:
                async with AsyncSessionLocal() as db:
                    record = await db.get(InterviewSessionModel, session_id)
                    if record:
                        record.status = "finished"
                        record.round_count = state.get("round_count", 0)
                        record.interview_state = self._strip_private_state(state)

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

    async def _create_evolution_candidate(
        self,
        state: InterviewState,
        audit_result: Dict[str, Any],
    ) -> Optional[str]:
        """Store an auditable evolution proposal without activating it."""
        if not isinstance(audit_result, dict):
            return None
        if audit_result.get("promotion_eligible") is False:
            return None
        participating_keys = list(dict.fromkeys(
            m.get("name")
            for m in state.get("messages", [])
            if isinstance(m, dict)
            and m.get("role") == "assistant"
            and m.get("name")
            and m.get("name") != "orchestrator"
        ))
        candidate_id = str(uuid.uuid4())
        payload = {
            "audit": audit_result,
            "interviewer_keys": participating_keys,
            "source_session_id": state.get("session_id"),
            "source_trace_id": state.get("trace_id"),
        }
        try:
            async with AsyncSessionLocal() as db:
                db.add(EvolutionCandidateModel(
                    id=candidate_id,
                    base_version_id=state.get("interviewer_version", "legacy-v1"),
                    status="review_required",
                    candidate_spec=payload,
                    replay_metrics={},
                    review_notes="等待离线回放与人工审批",
                ))
                await db.commit()
            return candidate_id
        except Exception as e:
            logger.warning(f"Failed to persist evolution candidate: {e}")
            return None

    async def approve_evolution_candidate(self, candidate_id: str) -> Dict[str, Any]:
        """Approve a reviewable candidate and activate its learned memories."""
        async with AsyncSessionLocal() as db:
            candidate = await db.get(EvolutionCandidateModel, candidate_id)
            if not candidate:
                raise ValueError("Evolution candidate not found")
            if candidate.status != "review_required":
                raise ValueError(f"Candidate status is {candidate.status}")

            payload = candidate.candidate_spec or {}
            audit_result = payload.get("audit") or {}
            valid_keys = payload.get("interviewer_keys") or ["technical"]
            await audit_service._persist_audit_evolution(
                audit_result=audit_result,
                assistant_messages=[],
                valid_keys=valid_keys,
                key_to_name={},
                default_role=valid_keys[0],
                is_fallback=False,
                db=db,
            )
            candidate.status = "approved"
            candidate.review_notes = "人工审批通过，经验已激活"
            await db.commit()
            return {"candidate_id": candidate_id, "status": candidate.status}

    async def get_history(self) -> List[Dict[str, Any]]:
        """Get history list of all interview sessions (local single-user mode)."""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(InterviewSessionModel)
                    .options(selectinload(InterviewSessionModel.report))
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
                        "web_search_enabled": bool(s.web_search_enabled),
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
                            state = self._strip_private_state(s.interview_state)
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

    async def get_transcript(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        获取完整面试对话记录（供在线回看与文件导出）。
        state 快照优先（始终最新）；state 缺失时回退到 interview_messages 表。
        """
        state = await self._ensure_state(session_id) or {}
        report = self._reports.get(session_id)
        session_meta: Dict[str, Any] = {}
        db_messages: List[Dict[str, Any]] = []

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
                    session_meta = {
                        "session_id": s.id,
                        "title": s.title,
                        "interview_type": s.interview_type,
                        "industry": s.industry,
                        "job_role": s.job_role,
                        "seniority": s.seniority,
                        "difficulty": s.difficulty,
                        "style": s.style,
                        "language": s.language,
                        "status": s.status,
                        "round_count": s.round_count,
                        "elapsed_seconds": s.elapsed_seconds,
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                    }
                    db_messages = [
                        {
                            "role": m.role,
                            "name": m.name,
                            "content": m.content,
                            "stage": m.stage,
                            "search_metadata": m.search_metadata,
                            "timestamp": m.created_at.isoformat() if m.created_at else None,
                        }
                        for m in s.messages
                    ]
                    if s.report and not report:
                        report = {
                            "match_verdict": s.report.match_verdict,
                            "overall_summary": s.report.overall_summary,
                            "radar_scores": s.report.radar_scores,
                            "strengths": s.report.strengths,
                            "weaknesses": s.report.weaknesses,
                        }
        except Exception as e:
            logger.error(f"Failed to load transcript meta from DB: {e}")

        if session_meta:
            session_meta["status"] = state.get("status", session_meta.get("status"))
            session_meta["round_count"] = state.get("round_count", session_meta.get("round_count"))
            if not session_meta.get("interview_type") and state.get("interview_type"):
                session_meta["interview_type"] = state["interview_type"]

        messages = state.get("messages") or db_messages

        persona_labels = ((state.get("custom_config") or {}).get("persona_labels")) or {}

        return {
            "session": session_meta,
            "messages": messages,
            "observations": state.get("evaluation_logs") or [],
            "persona_labels": persona_labels,
            "report": report
        }

    @staticmethod
    def _interviewer_label(name: Optional[str], persona_labels: Optional[Dict[str, str]] = None) -> str:
        key = name or ""
        if persona_labels and key in persona_labels:
            return persona_labels[key]
        return INTERVIEWER_LABELS.get(key, key or "面试官")

    @staticmethod
    def _type_label(interview_type: Optional[str]) -> str:
        return INTERVIEW_TYPE_LABELS.get(interview_type or "", interview_type or "-")

    def render_transcript_markdown(self, transcript: Dict[str, Any]) -> str:
        """将对话记录渲染为 Markdown 文本（含会话信息、对话、逐轮评估与报告附录）。"""
        s = transcript.get("session", {}) or {}
        lines: List[str] = [
            f"# {s.get('title') or '模拟面试记录'}",
            "",
            "| 项目 | 内容 |",
            "| --- | --- |",
            f"| 面试类型 | {self._type_label(s.get('interview_type'))} |",
            f"| 行业 / 岗位 | {s.get('industry') or '-'} · {s.get('job_role') or '-'} |",
            f"| 职级 / 难度 | {s.get('seniority') or '-'} · {s.get('difficulty') or '-'} |",
            f"| 风格 / 语言 | {s.get('style') or '-'} · {s.get('language') or '-'} |",
            f"| 状态 / 轮次 | {s.get('status') or '-'} · 共 {s.get('round_count', 0)} 轮 |",
            f"| 面试用时 | {s.get('elapsed_seconds', 0)} 秒 |",
            f"| 创建时间 | {s.get('created_at') or '-'} |",
            "",
            "## 对话记录",
        ]

        for m in transcript.get("messages", []) or []:
            if m.get("role") == "user":
                speaker = "🧑 候选人"
            else:
                speaker = f"🎙️ {self._interviewer_label(m.get('name'), transcript.get('persona_labels'))}"
            ts = (m.get("timestamp") or "")[:19].replace("T", " ")
            lines.append("")
            lines.append(f"**{speaker}** `{ts}`")
            lines.append("")
            lines.append((m.get("content") or "").strip())
            search_meta = m.get("search_metadata") or {}
            if search_meta.get("status") == "success":
                lines.append("")
                lines.append(f"_联网来源：{search_meta.get('provider', 'search')}_")
                for source in search_meta.get("results") or []:
                    title = source.get("title") or source.get("url") or "来源"
                    url = source.get("url") or ""
                    lines.append(f"- [{title}]({url})" if url else f"- {title}")
            elif search_meta.get("status") == "failed":
                message = search_meta.get("error_message") or "联网搜索失败"
                lines.extend(["", f"_联网搜索未使用：{message}_"])

        observations = transcript.get("observations") or []
        if observations:
            lines += ["", "## 逐轮评估（影子观察员）", ""]
            lines += ["| 轮次 | 面试官 | 考点 | 满足度 | 亮点 | 不足 |", "| --- | --- | --- | --- | --- | --- |"]
            for o in observations:
                if not isinstance(o, dict):
                    continue
                strengths = "；".join(o.get("strengths") or [])[:80]
                weaknesses = "；".join(o.get("weaknesses") or [])[:80]
                lines.append(
                    f"| {o.get('round_index', '-')} | {self._interviewer_label(o.get('interviewer'), transcript.get('persona_labels'))} "
                    f"| {o.get('topic') or '-'} | {o.get('satisfaction_score', '-')} "
                    f"| {strengths or '-'} | {weaknesses or '-'} |"
                )

        rep = transcript.get("report")
        if rep:
            lines += ["", "## 评估报告", ""]
            lines.append(f"- **综合结论**：{rep.get('match_verdict') or '-'}")
            radar = rep.get("radar_scores") or {}
            if radar:
                lines.append("- **六维雷达**：" + "；".join(f"{k} {v}" for k, v in radar.items()))
            strengths = rep.get("strengths") or []
            weaknesses = rep.get("weaknesses") or []
            if strengths:
                lines.append("- **核心亮点**：" + "；".join(strengths))
            if weaknesses:
                lines.append("- **主要短板**：" + "；".join(weaknesses))
            if rep.get("overall_summary"):
                lines += ["", rep["overall_summary"]]

        return "\n".join(lines).strip() + "\n"

    def render_transcript_json(self, transcript: Dict[str, Any]) -> str:
        """将对话记录渲染为格式化 JSON 文本。"""
        return json.dumps(transcript, ensure_ascii=False, indent=2, default=str)

    @staticmethod
    def export_filename(transcript: Dict[str, Any], fmt: str) -> str:
        s = transcript.get("session", {}) or {}
        role = (s.get("job_role") or "模拟面试").strip().replace("/", "_")[:30]
        stamp = datetime.now().strftime("%Y%m%d_%H%M")
        ext = "json" if fmt == "json" else "md"
        return f"面试记录_{role}_{stamp}.{ext}"

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

        def _radar_value(radar: Dict[str, Any], key: str) -> float:
            # live LLM 生成的报告在数据不足时可能把维度分返回为 null，缺省回退到中性分
            try:
                return float(radar.get(key, 7.0))
            except (TypeError, ValueError):
                return 7.0

        for key, name in dimensions:
            s1 = _radar_value(radar1, key)
            s2 = _radar_value(radar2, key)
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
        self._llm_configs.pop(session_id, None)
        self._finish_locks.pop(session_id, None)
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

    async def delete_sessions(self, session_ids: List[str]) -> int:
        """Delete multiple sessions from DB and cache; return the number of deleted rows."""
        for sid in session_ids:
            self._sessions.pop(sid, None)
            self._reports.pop(sid, None)
            self._llm_configs.pop(sid, None)
            self._finish_locks.pop(sid, None)
        async with AsyncSessionLocal() as db:
            # bulk delete() 绕过 ORM 级联且 SQLite 默认不启用外键，需显式先删子表
            await db.execute(
                delete(InterviewMessageModel).where(
                    InterviewMessageModel.session_id.in_(session_ids)
                )
            )
            await db.execute(
                delete(InterviewReportModel).where(
                    InterviewReportModel.session_id.in_(session_ids)
                )
            )
            result = await db.execute(
                delete(InterviewSessionModel).where(
                    InterviewSessionModel.id.in_(session_ids)
                )
            )
            await db.commit()
            return result.rowcount

    def get_session(self, session_id: str) -> Optional[InterviewState]:
        return self._strip_private_state(self._sessions.get(session_id))

    def get_report(self, session_id: str) -> Optional[Dict[str, Any]]:
        return self._reports.get(session_id)

    async def _ensure_state(self, session_id: str) -> Optional[InterviewState]:
        if session_id in self._sessions:
            state = self._strip_private_state(self._sessions[session_id])
            self._sessions[session_id] = state or {}
            return state
        # Try loading from DB
        try:
            async with AsyncSessionLocal() as db:
                record = await db.get(InterviewSessionModel, session_id)
                if record and record.interview_state:
                    state = self._strip_private_state(record.interview_state)
                    self._sessions[session_id] = state or {}
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
                    record.interviewer_id = state.get("interviewer_id", "orchestrator")
                    record.interviewer_version = state.get("interviewer_version", "legacy-v1")
                    record.trace_id = state.get("trace_id")
                    record.interview_state = self._strip_private_state(state)

                    # 全量增量同步消息（user + assistant 都落库，支持 redo/restart 回滚）
                    await self._sync_messages(db, session_id, state.get("messages", []))

                    await db.commit()
        except Exception as e:
            logger.error(f"Failed to sync state to DB: {e}")

    async def _sync_messages(self, db, session_id: str, messages: List[Dict[str, Any]]):
        """
        将 state.messages 增量同步到 interview_messages 表：
        - 按 seq 顺序号对齐，只插入新增尾部消息（候选人回答也会入库）
        - 消息变短（redo 回滚 / restart 清空）时删除多余行
        """
        result = await db.execute(
            select(func.max(InterviewMessageModel.seq))
            .where(InterviewMessageModel.session_id == session_id)
        )
        max_seq = result.scalar()
        max_seq = max_seq if max_seq is not None else -1

        if len(messages) <= max_seq + 1:
            await db.execute(
                delete(InterviewMessageModel)
                .where(InterviewMessageModel.session_id == session_id)
                .where(InterviewMessageModel.seq >= len(messages))
            )
            max_seq = len(messages) - 1

        for idx in range(max_seq + 1, len(messages)):
            m = messages[idx] or {}
            created = None
            ts = m.get("timestamp")
            if ts:
                try:
                    created = datetime.fromisoformat(ts)
                except (TypeError, ValueError):
                    created = None
            db.add(InterviewMessageModel(
                id=str(uuid.uuid4()),
                session_id=session_id,
                seq=idx,
                role=m.get("role", "assistant"),
                name=m.get("name"),
                content=m.get("content", ""),
                stage=m.get("stage"),
                search_metadata=m.get("search_metadata"),
                created_at=created or datetime.utcnow(),
            ))

    async def simulate_standard_answer(
        self,
        session_id: str,
        search_config: Optional[Dict[str, Any]] = None,
    ) -> dict:
        """
        Generates a first-person standard golden answer for the candidate
        based on the latest interviewer question, candidate profile, context, and optional web search.
        """
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        # Extract the latest assistant question
        messages = state.get("messages", [])
        last_assistant_msg = None
        for m in reversed(messages):
            if m.get("role") == "assistant":
                last_assistant_msg = m
                break

        if not last_assistant_msg:
            question = "请做一下自我介绍，并重点阐述你的核心技术亮点与最有挑战的项目经历。"
            interviewer = "主考官"
        else:
            question = last_assistant_msg.get("content", "")
            name = last_assistant_msg.get("name", "interviewer")
            interviewer_map = {
                "orchestrator": "主考官",
                "technical": "技术面试官",
                "programmer": "程序员面试官",
                "hr": "HR与文化面试官",
                "management": "管理与战略面试官",
                "challenger": "压力挑战官"
            }
            persona_labels = (state.get("custom_config") or {}).get("persona_labels") or {}
            interviewer = persona_labels.get(name) or interviewer_map.get(name, "面试官")

        industry = state.get("industry", "互联网/电商")
        job_role = state.get("job_role", "技术研发")
        seniority = state.get("seniority", "senior")
        candidate_profile = state.get("candidate_profile", {})
        condensed_memory = state.get("condensed_memory", "无")
        web_search_enabled = state.get("web_search_enabled", False)

        web_search_context = ""
        search_outcome = None
        if web_search_enabled:
            search_query = f"{job_role} {question[:50]} 标准答案 最佳实践"
            search_outcome = await search_service.search(
                search_query,
                max_results=3,
                config=search_config,
            )
            web_search_context = search_outcome.to_prompt_context()

        sys_msg = SIMULATE_ANSWER_PROMPT.format(
            interviewer=interviewer,
            question=question,
            industry=industry,
            job_role=job_role,
            seniority=seniority,
            candidate_profile=str(candidate_profile),
            condensed_memory=condensed_memory or "无",
            web_search_context=web_search_context
        )

        user_prompt = "请根据上述信息，以第一人称（“我”）直接给出高水准的标准示范回答，切中要害、逻辑严密，可直接作答。"

        resp = await llm_service.invoke(
            [SystemMessage(content=sys_msg), HumanMessage(content=user_prompt)],
            llm_config=self._llm_configs.get(session_id)
        )

        return {
            "session_id": session_id,
            "standard_answer": resp.content,
            "question": question,
            "interviewer": interviewer,
            "web_search_used": bool(search_outcome and search_outcome.succeeded),
            "search_metadata": search_outcome.to_metadata() if search_outcome else None,
        }

    async def toggle_web_search(self, session_id: str, enabled: Optional[bool] = None) -> dict:
        """
        Dynamically toggles or sets web search mode for the current session.
        """
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")

        current_val = state.get("web_search_enabled", False)
        new_val = not current_val if enabled is None else bool(enabled)
        state["web_search_enabled"] = new_val
        self._sessions[session_id] = state

        try:
            async with AsyncSessionLocal() as db:
                record = await db.get(InterviewSessionModel, session_id)
                if record:
                    record.web_search_enabled = new_val
                    record.interview_state = dict(state)
                    await db.commit()
        except Exception as e:
            logger.error(f"Failed to update web_search_enabled in DB: {e}")

        return {
            "session_id": session_id,
            "web_search_enabled": new_val
        }

    async def set_memory_consent(self, session_id: str, enabled: bool) -> dict:
        """Set explicit consent for candidate long-term memory writes."""
        state = await self._ensure_state(session_id)
        if not state:
            raise ValueError(f"Session {session_id} not found")
        state["memory_consent"] = bool(enabled)
        self._sessions[session_id] = state
        await self._sync_state_to_db(session_id, state)
        return {"session_id": session_id, "memory_consent": bool(enabled)}

session_manager = SessionManager()
