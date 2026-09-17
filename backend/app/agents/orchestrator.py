from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import ORCHESTRATOR_SYSTEM_PROMPT
from app.agents.llm import llm_service

async def orchestrator_welcome(state: InterviewState) -> dict:
    """Stage 1: Welcome and self-intro request."""
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    mode = state.get("interview_mode", {})
    
    sys_msg = ORCHESTRATOR_SYSTEM_PROMPT.format(
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        difficulty_level=mode.get("difficulty", "senior"),
        style=mode.get("style", "rigorous"),
        language=mode.get("language", "zh"),
        current_stage="icebreak"
    )
    prompt = "请开启面试，向候选人做专业且具有亲和力的破冰开场，并邀请候选人开始自我介绍。"
    resp = await llm_service.invoke([SystemMessage(content=sys_msg), HumanMessage(content=prompt)])
    
    out_msg = {
        "role": "assistant",
        "name": "orchestrator",
        "content": resp.content,
        "stage": "icebreak",
        "timestamp": datetime.now().isoformat()
    }
    return {
        "messages": [out_msg],
        "stage": "self_intro",
        "current_interviewer": "orchestrator",
        "status": "waiting_user"
    }

async def orchestrator_to_technical(state: InterviewState) -> dict:
    """Transition from self-intro to technical specialist."""
    last_answer = state.get("latest_user_input", "")
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    mode = state.get("interview_mode", {})

    sys_msg = ORCHESTRATOR_SYSTEM_PROMPT.format(
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        difficulty_level=mode.get("difficulty", "senior"),
        style=mode.get("style", "rigorous"),
        language=mode.get("language", "zh"),
        current_stage="transition_to_technical"
    )
    prompt = f"候选人已完成自我介绍：'{last_answer}'。请用1-2句话自然肯定并串场，宣布由技术面试官开始专业考核。"
    resp = await llm_service.invoke([SystemMessage(content=sys_msg), HumanMessage(content=prompt)])
    
    out_msg = {
        "role": "assistant",
        "name": "orchestrator",
        "content": resp.content,
        "stage": "technical",
        "timestamp": datetime.now().isoformat()
    }
    return {
        "messages": [out_msg],
        "stage": "technical",
        "current_interviewer": "technical",
        "status": "in_progress"
    }

async def orchestrator_to_hr(state: InterviewState) -> dict:
    """Transition from technical phase to HR phase."""
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    mode = state.get("interview_mode", {})

    sys_msg = ORCHESTRATOR_SYSTEM_PROMPT.format(
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        difficulty_level=mode.get("difficulty", "senior"),
        style=mode.get("style", "rigorous"),
        language=mode.get("language", "zh"),
        current_stage="transition_to_hr"
    )
    prompt = "技术考察环节已告一段落。请简短串场，感谢技术面试官并邀请HR面试官对候选人的综合素质与团队协作进行沟通。"
    resp = await llm_service.invoke([SystemMessage(content=sys_msg), HumanMessage(content=prompt)])
    
    out_msg = {
        "role": "assistant",
        "name": "orchestrator",
        "content": resp.content,
        "stage": "hr",
        "timestamp": datetime.now().isoformat()
    }
    return {
        "messages": [out_msg],
        "stage": "hr",
        "current_interviewer": "hr",
        "status": "in_progress"
    }

async def orchestrator_to_qa(state: InterviewState) -> dict:
    """Invite candidate to ask questions."""
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    mode = state.get("interview_mode", {})

    sys_msg = ORCHESTRATOR_SYSTEM_PROMPT.format(
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        difficulty_level=mode.get("difficulty", "senior"),
        style=mode.get("style", "rigorous"),
        language=mode.get("language", "zh"),
        current_stage="candidate_qa"
    )
    prompt = "所有面试官的考察已结束。请代表面试团队表示感谢，并邀请候选人提问（反问环节）。"
    resp = await llm_service.invoke([SystemMessage(content=sys_msg), HumanMessage(content=prompt)])
    
    out_msg = {
        "role": "assistant",
        "name": "orchestrator",
        "content": resp.content,
        "stage": "candidate_qa",
        "timestamp": datetime.now().isoformat()
    }
    return {
        "messages": [out_msg],
        "stage": "candidate_qa",
        "current_interviewer": "orchestrator",
        "status": "waiting_user"
    }

async def orchestrator_conclusion(state: InterviewState) -> dict:
    """Final wrap-up."""
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    mode = state.get("interview_mode", {})
    user_q = state.get("latest_user_input", "")

    sys_msg = ORCHESTRATOR_SYSTEM_PROMPT.format(
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        difficulty_level=mode.get("difficulty", "senior"),
        style=mode.get("style", "rigorous"),
        language=mode.get("language", "zh"),
        current_stage="conclusion"
    )
    prompt = f"候选人提问或反馈：'{user_q}'。请专业解答并正式为本次面试画上圆满句号，告知稍后将生成复盘报告。"
    resp = await llm_service.invoke([SystemMessage(content=sys_msg), HumanMessage(content=prompt)])
    
    out_msg = {
        "role": "assistant",
        "name": "orchestrator",
        "content": resp.content,
        "stage": "conclusion",
        "timestamp": datetime.now().isoformat()
    }
    return {
        "messages": [out_msg],
        "stage": "conclusion",
        "current_interviewer": "orchestrator",
        "status": "finished"
    }
