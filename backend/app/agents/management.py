from datetime import datetime
from typing import Optional
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from app.agents.state import InterviewState
from app.agents.prompts import MANAGEMENT_SPECIALIST_PROMPT
from app.agents.llm import llm_service
from app.agents import interviewer_utils
from app.services.search import runtime_search_config, search_service
from app.services.prompt_recorder import prompt_recorder

async def management_node(state: InterviewState, config: Optional[RunnableConfig] = None) -> dict:
    """
    Management & Leadership Specialist Node:
    Assesses engineering management, team leadership, architectural governance,
    cross-functional negotiation, and incident resolution.
    Consumes the unified dig_action decision from the shadow observer.
    """
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    round_count = state.get("round_count", 0)
    industry = state.get("industry", "互联网/电商")
    job_role = state.get("job_role", "技术管理者/总监")

    sys_msg = MANAGEMENT_SPECIALIST_PROMPT.format(
        industry=industry,
        job_role=job_role,
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        condensed_memory=state.get("condensed_memory", "") or "无前序陈述",
        latest_user_input=state.get("latest_user_input", "") or "准备开始管理岗与技术战略考核"
    ) + interviewer_utils.focus_topics_line(state)

    # Web search integration if enabled
    search_context = ""
    search_outcome = None
    if state.get("web_search_enabled"):
        search_query = f"{industry} {job_role} 管理考点 团队效能 OKR"
        search_outcome = await search_service.search(
            search_query,
            max_results=3,
            config=runtime_search_config(config),
        )
        search_context = search_outcome.to_prompt_context()

    dig_action = state.get("dig_action", "INIT")
    role_line = "请转向另一个管理考察维度（梯队建设与激励、技术战略与债务治理、跨部门协同、事故复盘与危机处理等）。"

    if round_count == 0 or dig_action == "INIT":
        prompt = (
            f"这是管理岗面试的第一个问题。请结合候选人过往经历与【{industry}】行业特点，"
            f"提出一个考察团队梯队建设、研发效能度量或技术债务治理的实战决策问题。"
        )
    elif dig_action == "DEEP_DIVE":
        prompt = interviewer_utils.build_deep_dive_instruction(
            state,
            "请就当前管理话题追问更具体的管理动作、权衡依据与推动结果。"
        )
    elif dig_action == "PROBE_WEAKNESS":
        prompt = interviewer_utils.build_probe_instruction(
            state,
            "请引导候选人补充真实案例细节（当时的阻力、具体采取的管理抓手与最终结果）。"
        )
    else:  # SWITCH_TOPIC
        prompt = interviewer_utils.build_switch_instruction(state, role_line)

    prompt += f"{search_context}{interviewer_utils.QUESTION_LIMIT}"

    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )

    new_round = round_count + 1
    prompt_log = prompt_recorder.build_prompt_log(
        session_id=state.get("session_id"),
        node="management",
        call_type="interviewer_question",
        system_prompt=sys_msg,
        user_prompt=prompt,
        response=resp.content,
        round_index=new_round,
        stage="management",
        turn_id=state.get("turn_id"),
        metadata={
            "dig_action": dig_action,
            "has_search": bool(search_outcome),
        }
    )

    out_msg = {
        "role": "assistant",
        "name": "management",
        "content": resp.content,
        "stage": "management",
        "prompt_log_id": prompt_log["id"],
        "timestamp": datetime.now().isoformat()
    }
    if search_outcome:
        out_msg["search_metadata"] = search_outcome.to_metadata()

    return {
        "messages": [out_msg],
        "prompt_logs": [prompt_log],
        "round_count": new_round,
        "stage": "management",
        "current_interviewer": "management",
        "status": "waiting_user"
    }
