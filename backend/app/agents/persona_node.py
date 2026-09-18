"""
通用自定义面试官节点（Persona Node）。

把“面试官角色”从写死的节点抽象成人设配置数据：内置四角色之外，用户可自建人设，
运行时按会话 custom_config 中快照的人设配置动态扮演，追问深挖决策（dig_action）
与影子观察员完全复用现有机制。

路由约定：
- custom_config.selected_interviewers 为出场阵容（有序），内置角色为
  "technical" / "programmer" / "hr" / "challenger" / "management"，
  自定义人设为其稳定 key（形如 "persona_xxxx"）。
- 图中只注册一个 "custom_persona" 通用节点；路由器与本模块共用
  resolve_custom_role() 按同一公式（round_count 对阵容取模）确定当前人设，
  避免两处逻辑漂移。
"""

from datetime import datetime
from typing import Optional
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import _REALISTIC_CONDUCT
from app.agents.llm import llm_service
from app.agents import interviewer_utils

from app.agents.persona_presets import PERSONA_PRESETS
from app.services.rag import rag_service
from app.services.audit import audit_service

PERSONA_KEY_PREFIX = "persona_"   # 人设稳定 key 前缀（persona_xxxx），用作消息 name 与路由标识
PRESET_KEY_PREFIX = "preset_"     # 内置预设 key 前缀（preset_xxxx）
PERSONA_REF_PREFIX = "persona:"   # 会话创建时阵容中的引用前缀（persona:<人设ID>，创建后解析为稳定 key）
STAGE_CUSTOM_PERSONA = "custom_persona"

# 快照缺失时的兜底人设，保证会话不因人设数据异常而中断
_FALLBACK_SYSTEM_PROMPT = (
    "你是一位经验丰富的资深面试官，负责对候选人进行专业考察。"
    "请围绕你的考察重点，结合候选人的简历与岗位要求提出有深度的问题。"
)


def resolve_custom_role(state: InterviewState) -> Optional[str]:
    """按出场阵容与当前轮次计算本轮应当发言的角色（内置 key 或人设 key）。

    供 graph.py 路由器与本节点共用；非 custom 面试或阵容为空时返回 None。
    """
    cfg = state.get("custom_config") or {}
    selected = cfg.get("selected_interviewers") or []
    if not selected:
        return None
    round_count = state.get("round_count", 0)
    return selected[round_count % len(selected)]


def is_persona_key(role: Optional[str]) -> bool:
    return bool(role) and (role.startswith(PERSONA_KEY_PREFIX) or role.startswith(PRESET_KEY_PREFIX))


def _build_persona_system_prompt(state: InterviewState, persona: dict, memory_section: str = "") -> str:
    mode = state.get("interview_mode", {})
    # 定向考察清单（Setup 面板填写）优先，合并人设自身考察重点并去重
    session_focus = interviewer_utils.get_focus_topics(state)
    persona_focus = [
        t.strip() for t in (persona.get("focus_topics") or [])
        if isinstance(t, str) and t.strip()
    ]
    focus_topics = list(dict.fromkeys(session_focus + persona_focus))
    focus_line = (
        f"\n【重点考察方向（定向清单优先，必须优先覆盖）】：{'、'.join(focus_topics)}\n"
        if focus_topics else ""
    )

    school = persona.get("school_of_thought") or "standard"
    school_line = f"\n【考核流派】：{school}\n" if school != "standard" else ""

    dislikes = persona.get("dislikes") or []
    dislikes_line = f"\n【面试官反感点（遇则追问质疑）】：{'；'.join(dislikes)}\n" if dislikes else ""

    preferences = persona.get("preferences") or []
    prefs_line = f"\n【面试官偏好与看重点】：{'；'.join(preferences)}\n" if preferences else ""

    traits = persona.get("interaction_traits") or {}
    style_prompt = traits.get("style_prompt") or ""
    traits_line = f"\n【互动个性要求】：{style_prompt}\n" if style_prompt else ""

    skepticism = float(persona.get("skepticism_level") or 0.5)
    skepticism_line = f"\n【怀疑度阈值】：{skepticism} (越高越倾向于对候选人陈述做合理质疑与推演挑刺)\n"

    return (
        f"你是本次面试的【自定义/特邀面试官（{persona.get('name') or '特邀面试官'}）】，"
        f"由面试组委会特邀入场，拥有独立的考察分工。\n"
        f"【角色简介】：{persona.get('description') or '资深行业面试官'}\n"
        f"【角色人设（必须始终以此身份与口吻发言）】：\n"
        f"{persona.get('system_prompt') or _FALLBACK_SYSTEM_PROMPT}\n"
        f"{focus_line}"
        f"{school_line}"
        f"{dislikes_line}"
        f"{prefs_line}"
        f"{traits_line}"
        f"{skepticism_line}"
        f"{memory_section}"
        + _REALISTIC_CONDUCT
        + f"""
【候选人画像】：{state.get("candidate_profile", {})}
【目标岗位要求】：{state.get("jd_requirements", {})}
【难度设定】：{mode.get("difficulty", "standard")} (职级: {mode.get("seniority", "senior")})
【行业与岗位】：{state.get("industry", mode.get("industry", "互联网/电商"))} - {state.get("job_role", mode.get("job_role", "后端开发"))}
【前序记忆】：{state.get("condensed_memory", "") or "无"}
【最新候选人回答】：{state.get("latest_user_input", "") or "候选人刚完成自我介绍"}
"""
    )


def _get_persona_snapshot(state: InterviewState, role: str) -> dict:
    cfg = state.get("custom_config") or {}
    labels = cfg.get("persona_labels") or {}
    # 1. Check custom_config personas snapshot
    for p in cfg.get("personas") or []:
        if isinstance(p, dict) and p.get("key") == role:
            return p

    # 2. Check built-in preset personas
    for p in PERSONA_PRESETS:
        if p["key"] == role:
            return p

    return {
        "key": role,
        "name": labels.get(role, "特邀面试官"),
        "avatar": "🎭",
        "description": "",
        "system_prompt": _FALLBACK_SYSTEM_PROMPT,
        "focus_topics": [],
        "opening_hint": "",
        "deep_dive_hint": "",
        "probe_hint": "",
        "switch_hint": "",
        "school_of_thought": "standard",
        "dislikes": [],
        "preferences": [],
        "skepticism_level": 0.5,
        "interaction_traits": {},
    }


async def persona_node(state: InterviewState) -> dict:
    """通用特邀/流派面试官节点：按当前轮次加载人设快照、业务场景与历史演进记忆并发起提问。"""
    role = resolve_custom_role(state) or PERSONA_KEY_PREFIX + "unknown"
    persona = _get_persona_snapshot(state, role)
    round_count = state.get("round_count", 0)

    # 1. 加载持续进化沉淀的黄金少样本与避坑经验
    memory_section = ""
    try:
        evo_mem = await audit_service.get_persona_evolution_memories(role)
        golden = evo_mem.get("golden_few_shots", [])
        rules = evo_mem.get("negative_rules", [])
        if golden or rules:
            parts = []
            if golden:
                parts.append("【历史黄金出题优质范例（仅供参考风格）】:\n" + "\n---\n".join(golden))
            if rules:
                parts.append("【历史复盘避坑铁律】:\n" + "\n".join([f"- {r}" for r in rules]))
            memory_section = "\n" + "\n".join(parts) + "\n"
    except Exception:
        pass

    sys_msg = _build_persona_system_prompt(state, persona, memory_section=memory_section)

    # 2. 注入目标企业/业务线真实场景
    scenario_section = interviewer_utils.company_scenario_prompt_section(state)

    # 3. 注入真实面经考点与追问陷阱 RAG
    scenario = state.get("company_scenario") or {}
    company_name = scenario.get("company", "") if isinstance(scenario, dict) else ""
    current_topic = state.get("current_topic") or (persona.get("focus_topics") or ["核心技术"])[0]
    rag_items = rag_service.retrieve_question_angles(
        query=f"{current_topic} {state.get('latest_user_input', '')}",
        company=company_name,
        top_k=1
    )
    rag_context = ""
    if rag_items:
        item = rag_items[0]
        rag_context = (
            f"\n【真实面经高频考点脉络】：\n"
            f"- 真实大厂考点：{item['topic']}\n"
            f"- 追问考察要点：{'；'.join(item.get('probing_traps', []))}\n"
        )

    dig_action = state.get("dig_action", "INIT")
    switch_hint = persona.get("switch_hint") or "请切换到你的考察重点中的下一个方向提出新问题。"

    if round_count == 0 or dig_action == "INIT":
        prompt = (
            persona.get("opening_hint")
            or "这是你负责考察环节的第一道题。请结合候选人画像与岗位要求，"
               "从你的考察重点中选定一个方向，提出一个有深度的开场问题。"
        )
    elif dig_action == "BREAK_ROUTINE":
        prompt = interviewer_utils.build_break_routine_instruction(
            state,
            "请针对候选人背诵的知识点，给出一段包含突发线上故障、架构重构或推翻其依赖前提的变种题，考验脱稿应变能力。"
        )
    elif dig_action == "DEEP_DIVE":
        prompt = interviewer_utils.build_deep_dive_instruction(
            state,
            persona.get("deep_dive_hint") or "请就当前主题向下深挖一层（底层机制、极端场景或边界条件）。"
        )
    elif dig_action == "PROBE_WEAKNESS":
        prompt = interviewer_utils.build_probe_instruction(
            state,
            persona.get("probe_hint") or "请引导候选人补充关键细节、判断依据或量化数据。"
        )
    else:  # SWITCH_TOPIC
        prompt = interviewer_utils.build_switch_instruction(state, switch_hint)

    prompt += f"{scenario_section}{rag_context}{interviewer_utils.QUESTION_LIMIT}"

    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )

    out_msg = {
        "role": "assistant",
        "name": role,
        "content": resp.content,
        "stage": STAGE_CUSTOM_PERSONA,
        "timestamp": datetime.now().isoformat()
    }

    return {
        "messages": [out_msg],
        "round_count": round_count + 1,
        "stage": STAGE_CUSTOM_PERSONA,
        "current_interviewer": role,
        "status": "waiting_user"
    }

