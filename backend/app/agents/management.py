from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import MANAGEMENT_SPECIALIST_PROMPT
from app.agents.llm import llm_service

async def management_node(state: InterviewState) -> dict:
    """
    Management & Leadership Specialist Node:
    Assesses engineering management, team leadership, architectural governance,
    cross-functional negotiation, and incident resolution.
    """
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    latest_input = state.get("latest_user_input", "")
    round_count = state.get("round_count", 0)
    condensed_memory = state.get("condensed_memory", "")
    follow_up_hint = state.get("follow_up_hint", "")
    industry = state.get("industry", "互联网/电商")
    job_role = state.get("job_role", "技术管理者/总监")

    sys_msg = MANAGEMENT_SPECIALIST_PROMPT.format(
        industry=industry,
        job_role=job_role,
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        condensed_memory=condensed_memory or "无前序陈述",
        latest_user_input=latest_input or "准备开始管理岗与技术战略考核"
    )

    if round_count == 0:
        prompt = (
            f"这是管理岗面试的第一个问题。请结合候选人过往经历与【{industry}】行业特点，"
            f"提出一个考察团队梯队建设、研发效能度量或技术债务治理的实战决策问题。"
        )
    elif follow_up_hint:
        prompt = (
            f"候选人刚才回答：'{latest_input}'。\n"
            f"影子观察员建议追问点：【{follow_up_hint}】。\n"
            f"提问要求：请结合此追问点，从管理抓手、跨团队博弈或重大风险推演的视角进行针对性深度追问。"
        )
    else:
        prompt = (
            f"候选人刚才回答：'{latest_input}'。\n"
            f"请简要得体点评，并针对重大线上事故责任复盘或跨部门资源协调提出下一个管理维度问题。"
        )

    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )

    new_round = round_count + 1
    out_msg = {
        "role": "assistant",
        "name": "management",
        "content": resp.content,
        "stage": "management",
        "timestamp": datetime.now().isoformat()
    }

    return {
        "messages": [out_msg],
        "round_count": new_round,
        "stage": "management",
        "current_interviewer": "management",
        "status": "waiting_user"
    }
