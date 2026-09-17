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
    condensed_memory = state.get("condensed_memory", "")
    follow_up_hint = state.get("follow_up_hint", "")
    industry = state.get("industry", mode.get("industry", "互联网/电商"))
    job_role = state.get("job_role", mode.get("job_role", "后端开发"))

    sys_msg = TECHNICAL_SPECIALIST_PROMPT.format(
        industry=industry,
        job_role=job_role,
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        difficulty=mode.get("difficulty", "standard"),
        seniority=mode.get("seniority", "senior"),
        condensed_memory=condensed_memory or "无",
        latest_user_input=latest_input or "准备开始第一道技术题考察"
    )

    dig_action = state.get("dig_action", "INIT")
    current_topic = state.get("current_topic", "核心技术实践")
    topic_depth = state.get("topic_depth", 1)
    last_score = state.get("last_satisfaction_score", 0.0)

    if round_count == 0 or dig_action == "INIT":
        prompt = (
            f"这是技术考核的第一道题。请结合候选人的核心技能栈与【{industry} - {job_role}】的要求，"
            f"选定一个核心技术方向，提出一个具备工程落地深度与原理探究的问题。"
        )
    elif dig_action == "DEEP_DIVE":
        hint_str = f"（影子观察员提示深度追问点：{follow_up_hint}）" if follow_up_hint else ""
        prompt = (
            f"【系统决策：深入挖掘】候选人刚才的回答表现良好（满足度 {last_score:.2f} > 0.8）。\n"
            f"当前考查主题：【{current_topic}】，当前挖掘深度：第 {topic_depth}/5 层。\n"
            f"{hint_str}\n"
            f"候选人刚才回答是：'{latest_input}'。\n"
            f"提问要求：紧扣当前主题【{current_topic}】，进行更深层次的探究（如底层源码、锁竞争机制、极端故障容灾或边界异常），不要更换主题！"
        )
    else:  # SWITCH_TOPIC
        prompt = (
            f"【系统决策：切换考点】上一主题已达到探究上限或候选人已充分阐述。\n"
            f"候选人刚才回答是：'{latest_input}'。\n"
            f"提问要求：请用1句干练过渡语肯定并收束上一话题，然后【主动切换考查方向】，从候选人简历声明的另一项关键技术栈或架构模块提出新问题。"
        )

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
