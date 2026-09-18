"""
Shared instruction builders for interviewer agent nodes.

影子观察员（observer.py）在每轮回答后产出 dig_action 决策，本模块将该决策统一翻译为
下一轮提问的 HumanMessage 指令，保证“答不上来 / 答得很差 → 直接下一个知识点”的策略
在 technical / hr / management / programmer 全部面试官节点中一致生效。
"""

from app.agents.state import InterviewState

QUESTION_LIMIT = "\n【提问限制】：本轮只围绕一个核心问题提问，最多追加一个简短的补充问（合计不超过 2 个问题点），严禁一次抛出三连问或问题清单。"


def _language_line(state: InterviewState) -> str:
    """每轮强制语言纪律：英文面试防止模型跟随中文指令而改说中文。"""
    language = (state.get("interview_mode") or {}).get("language") or state.get("language")
    if language == "en":
        return ("\n【语言纪律】：The interview language is English. Your ENTIRE reply must be in English — "
                "feedback and questions included. Do not write any Chinese sentences.")
    return "\n【语言纪律】：全程使用中文发言（技术专有名词可用英文原词，但不夹无必要的英文词）。"


def _format_line() -> str:
    """每轮强制口语化输出：抑制 markdown 加粗、编号列表、引号包裹等书面残留。"""
    return ("\n【输出格式】：你的发言是面试现场说出来的话，纯口语输出——严禁 markdown 加粗/标题/列表/代码反引号，"
            "严禁用'第一/第二'或①②③编号组织发言，严禁把整段发言用引号包裹，严禁输出空白内容。")


def covered_topics_line(state: InterviewState) -> str:
    """聚合已考察知识点清单，提示面试官避免重复出题。"""
    topics = []
    for log in state.get("evaluation_logs") or []:
        if not isinstance(log, dict):
            continue
        topic = log.get("topic")
        if topic and topic not in topics:
            topics.append(topic)
    if not topics:
        return ""
    shown = "、".join(topics[-8:])
    return f"\n【已考察知识点（新问题严禁与之重复）】：{shown}\n"


def build_deep_dive_instruction(state: InterviewState, role_line: str) -> str:
    """DEEP_DIVE：候选人回答出色，就同一主题向下深挖一层。"""
    latest_input = state.get("latest_user_input", "")
    current_topic = state.get("current_topic", "当前主题")
    topic_depth = state.get("topic_depth", 1)
    last_score = state.get("last_satisfaction_score", 0.0)
    follow_up_hint = state.get("follow_up_hint", "")
    hint_line = f"\n影子观察员提示的深挖切入点：{follow_up_hint}" if follow_up_hint else ""
    mode = state.get("interview_mode") or {}
    difficulty = mode.get("difficulty") or state.get("difficulty", "standard")
    seniority = mode.get("seniority") or state.get("seniority", "senior")
    # 轮转逃生口：同一主题已被连续深挖多轮时，允许面试官收束换题，避免考点被困
    if topic_depth >= 3:
        rotation_line = (
            f"\n注意：主题【{current_topic}】已被连续考察多轮（第 {topic_depth} 层）。"
            f"若你觉得再挖下去边际价值不高，可以用一句收束语结束该主题，"
            f"转向紧密相关的新子方向或清单中的下一个知识点。"
        )
    else:
        rotation_line = ""
    return (
        f"【系统决策：深入挖掘】候选人刚才的回答表现良好（满足度 {last_score:.2f} > 0.8）。\n"
        f"当前考查主题：【{current_topic}】，当前挖掘深度：第 {topic_depth}/5 层。"
        f"{hint_line}\n"
        f"候选人刚才回答是：'{latest_input}'。\n"
        f"提问要求：紧扣当前主题【{current_topic}】向下深挖一层，不要整体更换主题；"
        f"深挖时换一个切入层面（底层原理 / 边界与故障场景 / 方案权衡），"
        f"不要连续多轮只重复索要量化数据；追问深度须匹配难度与职级（{difficulty} / {seniority}）。"
        f"{rotation_line}\n"
        f"{role_line}"
        f"{_language_line(state)}{_format_line()}"
    )


def build_probe_instruction(state: InterviewState, role_line: str) -> str:
    """PROBE_WEAKNESS：回答浮于表面，给一次针对性引导追问的机会。"""
    latest_input = state.get("latest_user_input", "")
    current_topic = state.get("current_topic", "当前主题")
    last_score = state.get("last_satisfaction_score", 0.0)
    follow_up_hint = state.get("follow_up_hint", "")
    hint_line = f"追问切入点：{follow_up_hint}。" if follow_up_hint else "请围绕候选人回答中最含糊的关键部分追问。"
    return (
        f"【系统决策：引导补充】候选人的回答方向大致正确但偏浅（满足度 {last_score:.2f}），给一次补充细节的机会。\n"
        f"当前考查主题：【{current_topic}】。候选人刚才回答是：'{latest_input}'。\n"
        f"提问要求：只做一次针对性引导追问，帮候选人把关键细节讲透（不要连珠炮式提问、不要更换主题）；"
        f"追问深度须匹配难度与职级设定，候选人明显接不住时主动降一档或给提示。\n"
        f"{hint_line}\n"
        f"{role_line}"
        f"{_language_line(state)}{_format_line()}"
    )


def build_switch_instruction(state: InterviewState, role_line: str) -> str:
    """SWITCH_TOPIC：区分“候选人答不上/答得很差”与“话题已挖满”两种切换语气。"""
    latest_input = state.get("latest_user_input", "")
    last_score = state.get("last_satisfaction_score", 0.0)
    switch_reason = state.get("switch_reason") or ""
    status = (state.get("last_answer_status") or "").lower()
    next_hint = state.get("next_topic_hint") or ""
    covered = covered_topics_line(state)

    if switch_reason == "failed" or status in ("unknown", "poor") or last_score < 0.5:
        hint_line = f"优先切换到知识点：【{next_hint}】。" if next_hint else "自主选择一个与上一考点不同领域的新知识点。"
        return (
            f"【系统决策：立即切换考点】候选人对上一考点未能有效作答（回答状态：{status or 'unknown'}，满足度 {last_score:.2f}）。\n"
            f"候选人刚才的回答：'{latest_input}'。\n"
            f"提问要求：不要讲解正确答案、不要过度安慰、不要在该考点上继续纠缠；"
            f"用一句简短自然的话收束（收束语要呼应他刚才这段回答的实际内容，如“好，这块我们先过”），然后立即{hint_line}\n"
            f"{covered}"
            f"{role_line}"
            f"{_language_line(state)}{_format_line()}"
        )

    reason_line = "上一考点已充分挖掘" if switch_reason == "exhausted" else "该考点已充分阐述"
    return (
        f"【系统决策：切换考点】{reason_line}，候选人表现正常。\n"
        f"候选人刚才回答是：'{latest_input}'。\n"
        f"提问要求：先用一句干练的过渡语肯定并收束上一话题——过渡语必须点出候选人【刚才这段回答】里的具体内容，"
        f"严禁把更早轮次说过的话当作'你刚才提到的'，也严禁引用他没说过的内容——然后主动切换考查方向。\n"
        f"{covered}"
        f"{role_line}"
        f"{_language_line(state)}{_format_line()}"
    )
