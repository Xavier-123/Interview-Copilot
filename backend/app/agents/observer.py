import json
import logging
from typing import Optional

from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import SHADOW_OBSERVER_PROMPT
from app.agents.llm import llm_service
from app.services.prompt_recorder import prompt_recorder

logger = logging.getLogger(__name__)

VALID_ANSWER_STATUS = ("unknown", "poor", "surface", "solid", "excellent")

# 明确“答不上来”的短回答特征：整段回答很短且包含放弃类表述时，直接判定为 unknown
_REFUSAL_PATTERNS = (
    "不知道", "不会", "不了解", "没接触过", "没研究过", "不清楚", "没用过", "没听说过",
    "i don't know", "no idea", "not sure", "pass", "skip",
)
_REFUSAL_MAX_LEN = 30


def _detect_refusal(candidate_answer: str) -> bool:
    normalized = (candidate_answer or "").strip().lower()
    if not normalized or len(normalized) <= 1:
        return True
    if len(normalized) <= _REFUSAL_MAX_LEN and any(p in normalized for p in _REFUSAL_PATTERNS):
        return True
    return False


def _derive_status_from_score(score: float) -> str:
    if score >= 0.85:
        return "excellent"
    if score > 0.8:
        return "solid"
    if score >= 0.5:
        return "surface"
    return "poor"


async def shadow_observer_node(state: InterviewState) -> dict:
    """
    Shadow Evaluator Node:
    Silently evaluates candidate's latest answer, determines satisfaction score (0.0-1.0)
    and answer status, then decides the next dig_action:
    - unknown / poor answer  -> SWITCH_TOPIC (failed): 直接切换下一个知识点，清空追问线索
    - surface answer         -> PROBE_WEAKNESS: 给一次引导式追问机会（仅一次）
    - solid / excellent      -> DEEP_DIVE: 就当前主题继续深挖（最多 5 层）
    """
    messages = state.get("messages", [])
    candidate_answer = state.get("latest_user_input", "")
    jd_requirements = state.get("jd_requirements", {})
    interviewer = state.get("current_interviewer", "technical")
    round_count = state.get("round_count", 1)
    condensed_memory = state.get("condensed_memory", "")

    current_topic = state.get("current_topic")
    prior_action = state.get("dig_action", "INIT")
    prior_depth = state.get("topic_depth", 0)

    # 定向考察清单：注入观察员提示词，并在换题缺提示时按清单轮转兜底
    focus_list = [
        t.strip()
        for t in ((state.get("custom_config") or {}).get("focus_topics") or [])
        if isinstance(t, str) and t.strip()
    ]
    focus_section = "、".join(focus_list) if focus_list else "未指定"

    if prior_action == "SWITCH_TOPIC":
        prior_depth = 0

    # Find the last question asked by an interviewer。
    # 优先取最近一位真实面试官（含自定义人设/预设 key，如 persona_xxxx、preset_xxxx）的提问，
    # orchestrator 的欢迎/串场仅作兜底——否则自定义面试的观察记录会错位到欢迎词上。
    last_question = "请介绍你的技术或业务实践"
    orchestrator_fallback: Optional[str] = None
    for msg in reversed(messages):
        name = (msg.get("name") or "").strip()
        if msg.get("role") != "assistant" or not name:
            continue
        if name == "orchestrator":
            if orchestrator_fallback is None:
                orchestrator_fallback = msg.get("content", "")
            continue
        last_question = msg.get("content", "") or last_question
        break
    else:
        if orchestrator_fallback:
            last_question = orchestrator_fallback
    if last_question == "请介绍你的技术或业务实践" and orchestrator_fallback:
        last_question = orchestrator_fallback

    sys_msg = SHADOW_OBSERVER_PROMPT.format(
        interviewer=interviewer,
        question=last_question,
        current_topic=current_topic or "首题或新主题",
        current_depth=prior_depth,
        focus_section=focus_section,
        candidate_answer=candidate_answer,
        jd_requirements=str(jd_requirements)
    )

    prompt = "请作为影子观察员，客观记录候选人本轮回答的满足度评分(0.0~1.0)、回答状态、亮点、缺陷、追问线索及核心主张，严格输出合法 JSON 结构。"

    resp_raw = ""
    parsed_data = None
    # 解析失败时带纠正提示重试一次，避免模板兜底数据静默流入评分链路
    for attempt, extra in enumerate(("", "\n【重要】你上一次的输出无法解析为合法 JSON。请重新输出，必须是单一 ```json 代码块，块外无任何文字，块内无注释与省略号，所有字段完整。")):
        try:
            resp = await llm_service.invoke(
                [SystemMessage(content=sys_msg + extra), HumanMessage(content=prompt)],
                llm_config=state.get("llm_config")
            )
            resp_raw = resp.content
            content = resp.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            parsed_data = json.loads(content)
            break
        except Exception as e:
            if attempt == 0:
                logger.warning(f"Shadow observer parsing failed, retrying once: {e}")
                continue
            logger.warning(f"Shadow observer parsing failed after retry: {e}. Generating fallback observation.")
            parsed_data = {
                "topic": current_topic or "核心系统实践与架构方案",
                "satisfaction_score": 0.78,
                "strengths": ["思路清晰，对业务场景有明确认识"],
                "weaknesses": ["回答中量化数据和极端边界兜底阐述偏少"],
                "follow_up_hint": "针对方案在极端并发或网络抖动下的容灾边界进行深挖",
                "key_claim": f"候选人陈述了关于'{current_topic or '系统方案'}'的实现思路",
                "depth_score": 7.5,
                "logic_score": 7.5,
                "star_compliance": 7.0,
                "flags": ["standard_response"]
            }

    # Extract score
    raw_score = parsed_data.get("satisfaction_score")
    if raw_score is not None:
        try:
            score = float(raw_score)
        except (ValueError, TypeError):
            score = 0.75
    else:
        score = float(parsed_data.get("depth_score", 7.0)) / 10.0
    satisfaction_score = max(0.0, min(1.0, round(score, 2)))

    # Answer status: LLM 判定优先，缺失时按分数推导；明确放弃类短回答强制判为 unknown
    answer_status = parsed_data.get("answer_status")
    if answer_status not in VALID_ANSWER_STATUS:
        answer_status = _derive_status_from_score(satisfaction_score)
    if _detect_refusal(candidate_answer):
        answer_status = "unknown"

    # Topic extraction
    extracted_topic = parsed_data.get("topic")
    if prior_action == "SWITCH_TOPIC" or not current_topic:
        active_topic = extracted_topic or current_topic or "核心技术架构"
    else:
        active_topic = current_topic or extracted_topic or "核心技术架构"

    next_topic_hint = parsed_data.get("next_topic_hint")
    follow_up_hint = parsed_data.get("follow_up_hint")
    key_claim = parsed_data.get("key_claim")

    # 背诵套路识别
    is_memorized = bool(parsed_data.get("is_memorized_recitation", False))
    memorization_signals = parsed_data.get("memorization_signals") or []
    break_routine_hint = parsed_data.get("break_routine_hint")

    # ── 深挖 / 换题 / 破局决策策略 ───────────────────────────────────────
    # 定向考察模式下换题兜底：观察员未给出下一考点提示时，轮转选取清单中尚未覆盖的第一项
    covered_topics = {
        log.get("topic")
        for log in state.get("evaluation_logs") or []
        if isinstance(log, dict)
    }

    def _next_focus_topic() -> Optional[str]:
        for t in focus_list:
            if t not in covered_topics:
                return t
        return None

    def _consecutive_weak_probes(state: InterviewState, topic: str) -> bool:
        """同一主题最近两轮均为引导补充（PROBE_WEAKNESS）且满足度都偏低（<0.65）时返回 True。"""
        logs = [log for log in state.get("evaluation_logs") or [] if isinstance(log, dict)]
        if len(logs) < 2:
            return False
        last_two = logs[-2:]
        for log in last_two:
            if log.get("dig_action") != "PROBE_WEAKNESS":
                return False
            try:
                if float(log.get("satisfaction_score", 1.0)) >= 0.65:
                    return False
            except (TypeError, ValueError):
                return False
        return True

    switch_reason = None
    if answer_status == "unknown" or satisfaction_score < 0.5:
        # 答不上来 / 答得很差：直接切换下一个知识点，并清空追问线索防止面试官继续纠缠
        new_depth = 1
        dig_action = "SWITCH_TOPIC"
        switch_reason = "failed"
        follow_up_hint = None
        target_topic = next_topic_hint or _next_focus_topic() or extracted_topic or active_topic
    elif _consecutive_weak_probes(state, active_topic):
        # 同一考点连续两轮引导补充仍未见起色：强制换题，避免对弱候选人原地反复施压
        new_depth = 1
        dig_action = "SWITCH_TOPIC"
        switch_reason = "failed"
        follow_up_hint = None
        target_topic = next_topic_hint or _next_focus_topic() or extracted_topic or active_topic
    elif is_memorized and prior_action != "BREAK_ROUTINE":
        # 识别到教科书背诵套路：触发破局指令，推翻假设或突击线上故障，逼出真实水平
        new_depth = min(prior_depth + 1, 5)
        dig_action = "BREAK_ROUTINE"
        target_topic = active_topic
        follow_up_hint = break_routine_hint or "识别到背诵模板套路，请推翻原有方案假设或提出极端线上故障场景打破其准备好的八股说辞"
    elif satisfaction_score > 0.8:
        if prior_depth < 4:
            new_depth = prior_depth + 1
            dig_action = "DEEP_DIVE"
            target_topic = active_topic
        else:
            # 同一主题已深挖满 3 层：无论回答多好都强制换题，保证考点广度
            new_depth = 1
            dig_action = "SWITCH_TOPIC"
            switch_reason = "exhausted"
            target_topic = next_topic_hint or _next_focus_topic() or extracted_topic or active_topic
    else:
        # 0.5 ~ 0.8 浮于表面：给一次引导式追问机会；若上一轮已追问过仍无起色则换题
        if prior_action in ("PROBE_WEAKNESS", "BREAK_ROUTINE"):
            new_depth = 1
            dig_action = "SWITCH_TOPIC"
            switch_reason = "surface_repeated"
            follow_up_hint = None
            target_topic = next_topic_hint or _next_focus_topic() or extracted_topic or active_topic
        else:
            new_depth = min(prior_depth + 1, 5)
            dig_action = "PROBE_WEAKNESS"
            if not follow_up_hint:
                weaknesses = parsed_data.get("weaknesses") or []
                follow_up_hint = weaknesses[0] if weaknesses else "针对回答中最含糊的关键细节进行引导式追问"
            target_topic = active_topic

    # Update condensed rolling memory
    new_memory_item = f"轮次{round_count} [{active_topic}]: {key_claim or candidate_answer[:50]}"
    updated_memory = f"{condensed_memory}\n• {new_memory_item}".strip()

    observation = {
        "round_index": round_count,
        "interviewer": interviewer,
        "question": last_question,
        "candidate_answer": candidate_answer,
        "topic": target_topic,
        "satisfaction_score": satisfaction_score,
        "answer_status": answer_status,
        "depth_level": new_depth,
        "strengths": parsed_data.get("strengths", []),
        "weaknesses": parsed_data.get("weaknesses", []),
        "follow_up_hint": follow_up_hint,
        "depth_score": float(parsed_data.get("depth_score", 7.0)),
        "logic_score": float(parsed_data.get("logic_score", 7.0)),
        "star_compliance": float(parsed_data.get("star_compliance", 7.0)) if parsed_data.get("star_compliance") else None,
        "flags": parsed_data.get("flags", []),
        "is_memorized": is_memorized,
        "memorization_signals": memorization_signals,
        "break_routine_hint": break_routine_hint,
        "is_ready_to_conclude": bool(parsed_data.get("is_ready_to_conclude", False)),
        "conclude_reason": parsed_data.get("conclude_reason") if parsed_data.get("is_ready_to_conclude") else None,
    }

    # 大模型自适应结课判断
    raw_conclude = parsed_data.get("is_ready_to_conclude")
    is_ready_to_conclude = bool(raw_conclude) if raw_conclude is not None else False
    conclude_reason = parsed_data.get("conclude_reason") if is_ready_to_conclude else None

    prompt_log = prompt_recorder.build_prompt_log(
        session_id=state.get("session_id"),
        node="shadow_observer",
        call_type="shadow_observation",
        system_prompt=sys_msg,
        user_prompt=prompt,
        response=resp_raw or json.dumps(parsed_data, ensure_ascii=False),
        round_index=round_count,
        stage=state.get("stage"),
        turn_id=state.get("turn_id"),
        metadata={
            "interviewer": interviewer,
            "topic": target_topic,
            "satisfaction_score": satisfaction_score,
            "answer_status": answer_status,
            "dig_action": dig_action,
            "is_ready_to_conclude": is_ready_to_conclude,
            "conclude_reason": conclude_reason,
        }
    )

    return {
        "evaluation_logs": [observation],
        "prompt_logs": [prompt_log],
        "current_topic": target_topic,
        "topic_depth": new_depth,
        "last_satisfaction_score": satisfaction_score,
        "last_answer_status": answer_status,
        "dig_action": dig_action,
        "switch_reason": switch_reason,
        "follow_up_hint": follow_up_hint,
        "next_topic_hint": next_topic_hint,
        "break_routine_hint": break_routine_hint,
        "condensed_memory": updated_memory,
        "is_ready_to_conclude": is_ready_to_conclude,
        "conclude_reason": conclude_reason,
    }
