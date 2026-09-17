from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import HR_INTERVIEWER_PROMPT
from app.agents.llm import llm_service

async def hr_node(state: InterviewState) -> dict:
    """
    HR / Culture & Behavioral Specialist Node:
    Conducts STAR behavioral questions, situational teamwork and value-alignment questions.
    """
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    latest_input = state.get("latest_user_input", "")
    round_count = state.get("round_count", 0)
    
    sys_msg = HR_INTERVIEWER_PROMPT.format(
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        latest_user_input=latest_input or "准备开始行为与团队协作面试"
    )
    
    prompt = f"针对候选人的过往经历或最新回答 '{latest_input}'，运用 STAR 法则提出一个考察团队沟通、冲突化解、高压交付或职业自驱力的行为面试问题。"
    resp = await llm_service.invoke([SystemMessage(content=sys_msg), HumanMessage(content=prompt)])
    
    new_round = round_count + 1
    out_msg = {
        "role": "assistant",
        "name": "hr",
        "content": resp.content,
        "stage": "hr",
        "timestamp": datetime.now().isoformat()
    }
    
    return {
        "messages": [out_msg],
        "round_count": new_round,
        "stage": "hr",
        "current_interviewer": "hr",
        "status": "waiting_user"
    }
