"""
Shared instruction builders for interviewer agent nodes.

影子观察员（observer.py）在每轮回答后产出 dig_action 决策，本模块将该决策统一翻译为
下一轮提问的 HumanMessage 指令，保证“答不上来 / 答得很差 → 直接下一个知识点”的策略
在 technical / hr / management / programmer 全部面试官节点中一致生效。
"""

from typing import List

from app.agents.state import InterviewState

QUESTION_LIMIT = ("\n【提问限制】：本轮只围绕一个核心问题提问，最多追加一个简短的补充问（合计不超过 2 个问题点），"
                  "严禁一次抛出三连问或问题清单；一个问题内部也不要再塞 2-3 个并列子问（如'X 是多少？Y 怎么做？Z 为什么？'）。")


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
            "严禁用'第一/第二'或①②③编号组织发言，严禁把整段发言用引号包裹，严禁输出空白内容。"
            "输出前自检：正文中'？'不得超过 2 个，超了就合并或删掉；除技术专有名词外不得夹杂英文单词。")


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


def get_focus_topics(state: InterviewState) -> List[str]:
    """读取会话级定向考察知识点清单（custom_config.focus_topics，过滤空白与非字符串项）。"""
    raw = (state.get("custom_config") or {}).get("focus_topics") or []
    return [t.strip() for t in raw if isinstance(t, str) and t.strip()]


def focus_topics_line(state: InterviewState) -> str:
    """定制面试的定向考察清单注入块；未指定清单时返回空串，其他面试类型行为不变。"""
    focus = get_focus_topics(state)
    if not focus:
        return ""
    items = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(focus))
    return (
        f"\n【定向考察知识点（用户为本场面试指定的强制考察范围，优先级最高）】：\n{items}\n"
        f"【定向纪律】：出题与切换考点必须从上述清单中选取与你考察职责相符的知识点（可对清单项做合理细分）；"
        f"除清单内考点的自然深挖外，严禁引入清单外的新考点；本清单优先级高于任何默认模块或知识清单。\n"
    )


def company_scenario_prompt_section(state: InterviewState) -> str:
    """根据会话注入的目标企业与业务线场景卡，生成上下文提示。"""
    scenario = state.get("company_scenario")
    if not scenario or not isinstance(scenario, dict):
        return ""
    company = scenario.get("company", "")
    domain = scenario.get("business_domain", "")
    challenges = scenario.get("core_challenges", [])
    sla = scenario.get("sla_constraints", "")
    ch_text = "\n".join([f"  * {c}" for c in challenges[:3]]) if challenges else ""
    return (
        f"\n【目标企业真实业务场景与架构约束】：\n"
        f"- 目标企业与业务线：{company} - {domain}\n"
        f"- 真实核心架构挑战：\n{ch_text}\n"
        f"- SLA与性能指标约束：{sla}\n"
        f"提问时尽量将考点融合进上述真实业务挑战中，塑造大厂真实的业务泥土味。\n"
    )



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
    # 轮转逃生口：同一主题被连续深挖时，允许面试官换切入层面或收束换题，避免考点被困
    if topic_depth >= 3:
        rotation_line = (
            f"\n注意：主题【{current_topic}】已被连续考察 {topic_depth} 层，本轮必须做出改变："
            f"要么换一个明显不同的切入层面（从实现细节换到权衡取舍/工程落地/个人决策），"
            f"要么用一句收束语结束该主题、转向清单中的下一个知识点。"
            f"严禁再以同样的问法继续追问同一信息点。"
        )
    elif topic_depth >= 2:
        rotation_line = (
            f"\n注意：主题【{current_topic}】已深挖到第 {topic_depth} 层。本轮继续时必须换一个切入层面，"
            f"并检查你的问题是否与已问过的内容重复；若已无新信息增量，直接收束换题。"
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
        f"不要连续多轮只重复索要量化数据；追问必须带来新的信息增量，严禁换说法重复已问过的信息点；"
        f"追问深度须匹配难度与职级（{difficulty} / {seniority}）。"
        f"候选人明确表示不了解、没接触过时，简短确认后立即降维（'如果让你来设计，会考虑哪些因素？'）或换考点，"
        f"严禁当场讲解正确答案——你是评估者不是老师。"
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
        f"追问深度须匹配难度与职级设定，候选人明显接不住时主动降一档或给提示；"
        f"候选人承认不了解时简短确认后降维或换考点，严禁当场讲解标准答案。\n"
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
    focus = get_focus_topics(state)
    if focus:
        covered_set = {
            log.get("topic")
            for log in state.get("evaluation_logs") or []
            if isinstance(log, dict)
        }
        remaining = [t for t in focus if t not in covered_set]
        remaining_text = "、".join(remaining) if remaining else "清单已全部覆盖，可围绕已考察项的相邻子方向做收束提问"
        focus_rule = (
            f"\n【定向考察约束】本场面试为定向考察：下一个考点必须从【定向考察知识点】清单中选取"
            f"（尚未覆盖：{remaining_text}）；本指令或角色提示与清单冲突时，一律以清单为准。\n"
        )
    else:
        focus_rule = ""

    if switch_reason == "failed" or status in ("unknown", "poor") or last_score < 0.5:
        hint_line = f"优先切换到知识点：【{next_hint}】。" if next_hint else "自主选择一个与上一考点不同领域的新知识点。"
        return (
            f"【系统决策：立即切换考点】候选人对上一考点未能有效作答（回答状态：{status or 'unknown'}，满足度 {last_score:.2f}）。\n"
            f"候选人刚才的回答：'{latest_input}'。\n"
            f"提问要求：不要讲解正确答案、不要过度安慰、不要在该考点上继续纠缠；"
            f"用一句简短自然的话收束（收束语必须呼应他刚才这段回答的实际内容，且每次换一种说法，"
            f"严禁反复使用同一句收束套话如'好，这块我们先过'），然后立即{hint_line}\n"
            f"{covered}"
            f"{focus_rule}"
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
        f"{focus_rule}"
        f"{role_line}"
        f"{_language_line(state)}{_format_line()}"
    )


def build_break_routine_instruction(state: InterviewState, role_line: str) -> str:
    """BREAK_ROUTINE：检测到背诵八股或套路答题，立即推翻预设假设或抛出非标突发故障破局。"""
    latest_input = state.get("latest_user_input", "")
    current_topic = state.get("current_topic", "当前核心技术")
    break_hint = state.get("break_routine_hint") or state.get("follow_up_hint") or "推翻常规假设，考察非标场景下的现场推演"
    return (
        f"【系统决策：反套路突击 (Break Routine)】观察员判定候选人刚才的回答高度符合教科书背诵套路，缺乏实战泥土味与权衡思考。\n"
        f"当前考查主题：【{current_topic}】。\n"
        f"候选人刚才回答是：'{latest_input}'。\n"
        f"提问要求：不要顺着他背诵的标准说辞继续问！先用一两句话肯定其背诵的结论正确，"
        f"随后立即以真实业务大厂考官口吻，提出一个【非标突发故障】或【推翻常规方案假设】的突击挑战：{break_hint}。\n"
        f"逼问候选人在没有现成八股答案时的现场推理与第一性原理思维。\n"
        f"{role_line}"
        f"{_language_line(state)}{_format_line()}"
    )

