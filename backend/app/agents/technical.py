from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import TECHNICAL_SPECIALIST_PROMPT
from app.agents.llm import llm_service

async def technical_node(state: InterviewState) -> dict:
    """
    Technical Specialist Node:
    Conducts technical deep-dives, architectural questions, and scenario follow-ups.
    """
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    mode = state.get("interview_mode", {})
    latest_input = state.get("latest_user_input", "")
    round_count = state.get("round_count", 0)
    
    sys_msg = TECHNICAL_SPECIALIST_PROMPT.format(
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        difficulty_level=mode.get("difficulty", "senior"),
        latest_user_input=latest_input or "准备开始第一道技术题考察"
    )
    
    if round_count == 0:
        prompt = "这是第一道技术题。请结合候选人的核心技能和岗位硬性要求，提出一个具备一定深度的架构或底层实现问题。"
    else:
        prompt = f"候选人刚才的回答是：'{latest_input}'。请针对其中的关键技术点、方案合理性或边界情况进行深入追问或开启下一道技术考题。"
        
    resp = await llm_service.invoke([SystemMessage(content=sys_msg), HumanMessage(content=prompt)])
    
    new_round = round_count + 1
    out_msg = {
        "role": "assistant",
        "name": "technical",
        "content": resp.content,
        "stage": "technical",
        "timestamp": datetime.now().isoformat()
    }
    
    return {
        "messages": [out_msg],
        "round_count": new_round,
        "stage": "technical",
        "current_interviewer": "technical",
        "status": "waiting_user"
    }
