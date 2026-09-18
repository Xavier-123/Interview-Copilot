from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import TECHNICAL_SPECIALIST_PROMPT
from app.agents.llm import llm_service
from app.agents import interviewer_utils
from app.services.search import search_service

async def technical_node(state: InterviewState) -> dict:
    """
    Technical Specialist Node:
    Conducts technical deep-dives, architectural questions, and scenario follow-ups.
    Consumes the unified dig_action decision from the shadow observer.
    """
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    mode = state.get("interview_mode", {})
    round_count = state.get("round_count", 0)
    industry = state.get("industry", mode.get("industry", "互联网/电商"))
    job_role = state.get("job_role", mode.get("job_role", "后端开发"))

    sys_msg = TECHNICAL_SPECIALIST_PROMPT.format(
        industry=industry,
        job_role=job_role,
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        difficulty=mode.get("difficulty", "standard"),
        seniority=mode.get("seniority", "senior"),
        condensed_memory=state.get("condensed_memory", "") or "无",
        latest_user_input=state.get("latest_user_input", "") or "准备开始第一道技术题考察"
    )

    # Web search integration if enabled
    search_context = ""
    if state.get("web_search_enabled"):
        current_topic = state.get("current_topic", "核心技术实践")
        search_query = f"{industry} {job_role} {current_topic} 深度考点"
        snippets = await search_service.search(search_query, max_results=2)
        if snippets:
            search_context = "\n【实时联网参考资料】:\n" + "\n".join([f"- {s['title']}: {s['snippet']}" for s in snippets])

    dig_action = state.get("dig_action", "INIT")
    role_line = (
        f"请从候选人简历声明的另一项关键技术栈或架构模块"
        f"（结合【{industry} - {job_role}】岗位要求）中提出新问题。"
    )

    if round_count == 0 or dig_action == "INIT":
        prompt = (
            f"这是技术考核的第一道题。请结合候选人的核心技能栈与【{industry} - {job_role}】的要求，"
            f"选定一个核心技术方向，提出一个具备工程落地深度与原理探究的问题。"
        )
    elif dig_action == "DEEP_DIVE":
        prompt = interviewer_utils.build_deep_dive_instruction(
            state,
            "请从当前主题的更深层次（底层源码、锁竞争机制、极端故障容灾或边界异常）设计追问。"
        )
    elif dig_action == "PROBE_WEAKNESS":
        prompt = interviewer_utils.build_probe_instruction(
            state,
            "请引导候选人补充关键实现细节、参数依据或量化数据。"
        )
    else:  # SWITCH_TOPIC
        prompt = interviewer_utils.build_switch_instruction(state, role_line)

    prompt += f"{search_context}{interviewer_utils.QUESTION_LIMIT}"

    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )

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
