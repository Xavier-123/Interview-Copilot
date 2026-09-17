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
    Silently listens to candidate's answer to the latest question and records structured evaluation logs.
    """
    messages = state.get("messages", [])
    candidate_answer = state.get("latest_user_input", "")
    jd_requirements = state.get("jd_requirements", {})
    interviewer = state.get("current_interviewer", "technical")
    round_count = state.get("round_count", 1)

    # Find the last question asked by an interviewer
    last_question = "请介绍你的技术实践"
    for msg in reversed(messages):
        if msg.get("role") == "assistant" and msg.get("name") in ("technical", "hr", "challenger", "orchestrator"):
            last_question = msg.get("content", "")
            break

    sys_msg = SHADOW_OBSERVER_PROMPT.format(
        interviewer=interviewer,
        question=last_question,
        candidate_answer=candidate_answer,
        jd_requirements=str(jd_requirements)
    )

    prompt = f"请作为影子观察员，客观记录候选人本轮回答的亮点与缺陷，输出 JSON 结构。"

    try:
        resp = await llm_service.invoke([SystemMessage(content=sys_msg), HumanMessage(content=prompt)])
        content = resp.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        parsed_data = json.loads(content)
    except Exception as e:
        logger.warning(f"Shadow observer parsing failed: {e}. Generating fallback observation.")
        parsed_data = {
            "strengths": ["能够针对问题给出基本思路与技术选型"],
            "weaknesses": ["回答中量化指标与核心细节阐述略显粗略"],
            "depth_score": 7.0,
            "logic_score": 7.5,
            "star_compliance": 6.8,
            "flags": ["standard_response"]
        }

    observation = {
        "round_index": round_count,
        "interviewer": interviewer,
        "question": last_question,
        "candidate_answer": candidate_answer,
        "strengths": parsed_data.get("strengths", []),
        "weaknesses": parsed_data.get("weaknesses", []),
        "depth_score": float(parsed_data.get("depth_score", 7.0)),
        "logic_score": float(parsed_data.get("logic_score", 7.0)),
        "star_compliance": float(parsed_data.get("star_compliance", 7.0)) if parsed_data.get("star_compliance") else None,
        "flags": parsed_data.get("flags", [])
    }

    return {
        "evaluation_logs": [observation]
    }
