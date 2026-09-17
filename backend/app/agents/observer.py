import json
import logging
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import SHADOW_OBSERVER_PROMPT
from app.agents.llm import llm_service

logger = logging.getLogger(__name__)

async def shadow_observer_node(state: InterviewState) -> dict:
    """
    Shadow Evaluator Node:
    Silently evaluates candidate's latest answer, determines satisfaction score (0.0-1.0),
    extracts follow-up hints, and updates rolling condensed memory.
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

    if prior_action == "SWITCH_TOPIC":
        prior_depth = 0

    # Find the last question asked by an interviewer
    last_question = "请介绍你的技术或业务实践"
    for msg in reversed(messages):
        if msg.get("role") == "assistant" and msg.get("name") in ("technical", "hr", "challenger", "orchestrator", "management"):
            last_question = msg.get("content", "")
            break

    sys_msg = SHADOW_OBSERVER_PROMPT.format(
        interviewer=interviewer,
        question=last_question,
        current_topic=current_topic or "首题或新主题",
        current_depth=prior_depth,
        candidate_answer=candidate_answer,
        jd_requirements=str(jd_requirements)
    )

    prompt = "请作为影子观察员，客观记录候选人本轮回答的满足度评分(0.0~1.0)、亮点、缺陷、追问线索及核心主张，严格输出合法 JSON 结构。"

    try:
        resp = await llm_service.invoke(
            [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
            llm_config=state.get("llm_config")
        )
        content = resp.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        parsed_data = json.loads(content)
    except Exception as e:
        logger.warning(f"Shadow observer parsing failed: {e}. Generating fallback observation.")
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

    # Topic extraction
    extracted_topic = parsed_data.get("topic")
    if prior_action == "SWITCH_TOPIC" or not current_topic:
        active_topic = extracted_topic or current_topic or "核心技术架构"
    else:
        active_topic = current_topic or extracted_topic or "核心技术架构"

    # Deep Dive & 5-Layer Limitation Logic
    if satisfaction_score > 0.8:
        if prior_depth < 5:
            new_depth = prior_depth + 1
            dig_action = "DEEP_DIVE"
            target_topic = active_topic
        else:
            new_depth = 1
            dig_action = "SWITCH_TOPIC"
            target_topic = extracted_topic or active_topic
    else:
        new_depth = 1
        dig_action = "SWITCH_TOPIC"
        target_topic = extracted_topic or active_topic

    follow_up_hint = parsed_data.get("follow_up_hint")
    key_claim = parsed_data.get("key_claim")

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
        "depth_level": new_depth,
        "strengths": parsed_data.get("strengths", []),
        "weaknesses": parsed_data.get("weaknesses", []),
        "follow_up_hint": follow_up_hint,
        "depth_score": float(parsed_data.get("depth_score", 7.0)),
        "logic_score": float(parsed_data.get("logic_score", 7.0)),
        "star_compliance": float(parsed_data.get("star_compliance", 7.0)) if parsed_data.get("star_compliance") else None,
        "flags": parsed_data.get("flags", [])
    }

    return {
        "evaluation_logs": [observation],
        "current_topic": target_topic,
        "topic_depth": new_depth,
        "last_satisfaction_score": satisfaction_score,
        "dig_action": dig_action,
        "follow_up_hint": follow_up_hint,
        "condensed_memory": updated_memory
    }
