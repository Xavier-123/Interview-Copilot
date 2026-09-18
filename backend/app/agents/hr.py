from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import HR_INTERVIEWER_PROMPT
from app.agents.llm import llm_service
from app.agents import interviewer_utils

async def hr_node(state: InterviewState) -> dict:
    """
    HR / Culture & Behavioral Specialist Node:
    Conducts STAR behavioral questions, situational teamwork, and culture-fit questions.
    Consumes the unified dig_action decision from the shadow observer.
    """
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    round_count = state.get("round_count", 0)

    sys_msg = HR_INTERVIEWER_PROMPT.format(
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        condensed_memory=state.get("condensed_memory", "") or "无",
        latest_user_input=state.get("latest_user_input", "") or "准备开始行为与团队协作面试"
    )

    dig_action = state.get("dig_action", "INIT")
    role_line = "请转向另一个行为考察维度（团队协作、跨部门冲突化解、抗压与自驱、职业规划、自我认知等）。"

    if round_count == 0 or dig_action == "INIT":
        prompt = (
            "这是行为与文化考察的第一道题。请依据候选人过往简历经历，"
            "运用 STAR 法则提出一个考察团队协作、跨部门冲突化解或重大交付压力下的行为面试问题。"
        )
    elif dig_action == "DEEP_DIVE":
        prompt = interviewer_utils.build_deep_dive_instruction(
            state,
            "请就当前行为话题追问更具体的个人动作、判断依据与量化结果。"
        )
    elif dig_action == "PROBE_WEAKNESS":
        prompt = interviewer_utils.build_probe_instruction(
            state,
            "请引导候选人补充真实细节（个人具体承担角色、行动依据或实际量化结果），注意先共情再追问。"
        )
    else:  # SWITCH_TOPIC
        prompt = interviewer_utils.build_switch_instruction(state, role_line)

    prompt += interviewer_utils.QUESTION_LIMIT

    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )

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
