from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import CHALLENGER_PROMPT
from app.agents.llm import llm_service
from app.services.prompt_recorder import prompt_recorder

async def challenger_node(state: InterviewState) -> dict:
    """
    Challenger / Stress Interviewer Node:
    Simulates high pressure, corner-case failures, or budget/resource constraints.
    """
    latest_input = state.get("latest_user_input", "")
    condensed_memory = state.get("condensed_memory", "")
    sys_msg = CHALLENGER_PROMPT.format(
        latest_user_input=latest_input,
        condensed_memory=condensed_memory or "无"
    )
    prompt = (
        "对候选人刚才提出的方案或思路进行有理有据的尖锐挑战或提出极限资源约束，考察应变能力与情绪稳定性。\n"
        "【提问限制】：本轮提问严禁超过 2 个问题（最多不超过2个问题）！"
    )

    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )

    prompt_log = prompt_recorder.build_prompt_log(
        session_id=state.get("session_id"),
        node="challenger",
        call_type="interviewer_question",
        system_prompt=sys_msg,
        user_prompt=prompt,
        response=resp.content,
        round_index=state.get("round_count", 0),
        stage=state.get("stage", "technical"),
        turn_id=state.get("turn_id"),
    )

    out_msg = {
        "role": "assistant",
        "name": "challenger",
        "content": resp.content,
        "stage": state.get("stage", "technical"),
        "prompt_log_id": prompt_log["id"],
        "timestamp": datetime.now().isoformat()
    }

    return {
        "messages": [out_msg],
        "prompt_logs": [prompt_log],
        "stage": "challenger",
        "stress_triggered": True,
        "current_interviewer": "challenger",
        "status": "waiting_user"
    }
