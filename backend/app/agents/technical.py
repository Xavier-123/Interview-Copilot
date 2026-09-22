from datetime import datetime
from typing import Optional
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from app.agents.state import InterviewState
from app.agents.prompts import TECHNICAL_SPECIALIST_PROMPT
from app.agents.llm import llm_service
from app.agents import interviewer_utils
from app.services.search import runtime_search_config, search_service
from app.services.rag import rag_service
from app.services.prompt_recorder import prompt_recorder

async def technical_node(state: InterviewState, config: Optional[RunnableConfig] = None) -> dict:
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
    ) + interviewer_utils.focus_topics_line(state)

    # Company business scenario injection
    scenario_section = interviewer_utils.company_scenario_prompt_section(state)

    # RAG interview experience question angles
    scenario = state.get("company_scenario") or {}
    company_name = scenario.get("company", "") if isinstance(scenario, dict) else ""
    current_topic = state.get("current_topic") or "核心技术架构"
    rag_items = rag_service.retrieve_question_angles(
        query=f"{current_topic} {job_role} {state.get('latest_user_input', '')}",
        company=company_name,
        top_k=1
    )
    rag_context = ""
    if rag_items:
        item = rag_items[0]
        rag_context = (
            f"\n【大厂真实面经考点参考（出题与追问灵感）】：\n"
            f"- 真实大厂考点：{item['topic']} ({item.get('company', '')})\n"
            f"- 经典问法参考：{item.get('authentic_question', '')}\n"
            f"- 追问考察要点：{'；'.join(item.get('probing_traps', []))}\n"
            f"（请将该考点自然融合到候选人的技术背景中提出问题，严禁机械念出原题）\n"
        )

    # Web search integration if enabled
    search_context = ""
    search_outcome = None
    if state.get("web_search_enabled"):
        search_query = f"{industry} {job_role} {current_topic} 深度考点"
        search_outcome = await search_service.search(
            search_query,
            max_results=3,
            config=runtime_search_config(config),
        )
        search_context = search_outcome.to_prompt_context()

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
    elif dig_action == "BREAK_ROUTINE":
        prompt = interviewer_utils.build_break_routine_instruction(
            state,
            "请针对候选人刚才背诵套路中的核心组件提出一个突发生产故障场景，或禁止使用该组件看其现场推演能力。"
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

    prompt += f"{scenario_section}{rag_context}{search_context}{interviewer_utils.QUESTION_LIMIT}"

    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )

    new_round = round_count + 1
    prompt_log = prompt_recorder.build_prompt_log(
        session_id=state.get("session_id"),
        node="technical",
        call_type="interviewer_question",
        system_prompt=sys_msg,
        user_prompt=prompt,
        response=resp.content,
        round_index=new_round,
        stage="technical",
        turn_id=state.get("turn_id"),
        metadata={
            "topic": current_topic,
            "dig_action": dig_action,
            "has_rag": bool(rag_items),
            "has_search": bool(search_outcome),
        }
    )

    out_msg = {
        "role": "assistant",
        "name": "technical",
        "content": resp.content,
        "stage": "technical",
        "prompt_log_id": prompt_log["id"],
        "timestamp": datetime.now().isoformat()
    }
    if search_outcome:
        out_msg["search_metadata"] = search_outcome.to_metadata()

    return {
        "messages": [out_msg],
        "prompt_logs": [prompt_log],
        "round_count": new_round,
        "stage": "technical",
        "current_interviewer": "technical",
        "status": "waiting_user"
    }
