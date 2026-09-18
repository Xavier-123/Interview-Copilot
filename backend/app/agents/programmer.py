from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import PROGRAMMER_SPECIALIST_PROMPT
from app.agents.llm import llm_service
from app.agents import interviewer_utils
from app.services.search import search_service

# 综合程序员面试的模块推进计划：
# 前 2 轮 -> 项目经历；最后 1 轮 -> 编码题；中间 -> 计算机基础知识点轮转
MODULE_PROJECT = "项目经历"
MODULE_FUNDAMENTALS = "计算机基础"
MODULE_CODING = "编码题"

MODULE_GUIDANCE = {
    MODULE_PROJECT: (
        "紧扣候选人简历中的核心项目，考察真实个人贡献、技术难点、方案取舍与量化成果。"
    ),
    MODULE_FUNDAMENTALS: (
        "从计算机基础知识点清单（主力语言特性、数据结构与算法、数据库、缓存、计算机网络、"
        "操作系统、并发编程、设计模式）中选择一个与已考察点不重复的知识点提问，"
        "并根据岗位动态调整侧重；每个知识点通常只问 1 个问题。"
    ),
    MODULE_CODING: (
        "出一道与岗位相关的轻量编码题，要求候选人以文字作答：先讲思路，再给核心代码，"
        "最后分析时间/空间复杂度；难度与职级匹配。"
    ),
}


def current_module(state: InterviewState) -> str:
    round_count = state.get("round_count", 0)
    max_rounds = state.get("max_rounds", 8)
    if round_count < 2:
        return MODULE_PROJECT
    if round_count >= max_rounds - 1:
        return MODULE_CODING
    return MODULE_FUNDAMENTALS


async def programmer_node(state: InterviewState) -> dict:
    """
    Programmer Interviewer Node:
    经典综合程序员面：项目经历 -> 计算机基础知识点轮转 -> 轻量编码题，
    并统一消费影子观察员的 dig_action 决策（答不上/答差 -> 立即换下一个知识点）。
    """
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    mode = state.get("interview_mode", {})
    round_count = state.get("round_count", 0)
    industry = state.get("industry", mode.get("industry", "互联网/电商"))
    job_role = state.get("job_role", mode.get("job_role", "后端开发"))

    sys_msg = PROGRAMMER_SPECIALIST_PROMPT.format(
        industry=industry,
        job_role=job_role,
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        difficulty=mode.get("difficulty", "standard"),
        seniority=mode.get("seniority", "senior"),
        condensed_memory=state.get("condensed_memory", "") or "无",
        latest_user_input=state.get("latest_user_input", "") or "候选人已完成自我介绍，准备开始第一题"
    )

    # Web search integration if enabled
    search_context = ""
    if state.get("web_search_enabled"):
        search_query = f"{industry} {job_role} 程序员面试 高频考点"
        snippets = await search_service.search(search_query, max_results=2)
        if snippets:
            search_context = "\n【实时联网参考资料】:\n" + "\n".join([f"- {s['title']}: {s['snippet']}" for s in snippets])

    module = current_module(state)
    role_line = f"当前考察模块：【{module}】。{MODULE_GUIDANCE[module]}"

    dig_action = state.get("dig_action", "INIT")
    if round_count == 0 or dig_action == "INIT":
        prompt = (
            f"你刚接过话筒，这是你的第一个问题。请先用一句话自然承接候选人的自我介绍"
            f"（点出其中一个亮点或与你关注点的关联），然后进入当前考察模块提问。\n{role_line}"
        )
    elif dig_action == "DEEP_DIVE":
        prompt = interviewer_utils.build_deep_dive_instruction(
            state,
            "请就当前主题向下深挖一层（底层机制、极端边界或复杂度优化）。"
        )
    elif dig_action == "PROBE_WEAKNESS":
        prompt = interviewer_utils.build_probe_instruction(
            state,
            "请引导候选人补充关键实现细节、复杂度分析或量化依据。"
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
        "name": "programmer",
        "content": resp.content,
        "stage": "programmer",
        "timestamp": datetime.now().isoformat()
    }

    return {
        "messages": [out_msg],
        "round_count": new_round,
        "stage": "programmer",
        "current_interviewer": "programmer",
        "status": "waiting_user"
    }
