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

PERSONA_KEY_PREFIX = "persona_"   # 人设稳定 key 前缀（persona_xxxx），用作消息 name 与路由标识
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
    return bool(role) and role.startswith(PERSONA_KEY_PREFIX)


def _build_persona_system_prompt(state: InterviewState, persona: dict) -> str:
    mode = state.get("interview_mode", {})
    focus_topics = persona.get("focus_topics") or []
    focus_line = f"\n【重点考察方向】：{'、'.join(focus_topics)}\n" if focus_topics else ""

    return (
        f"你是本次面试的【自定义面试官（{persona.get('name') or '特邀面试官'}）】，"
        f"由面试组委会特邀入场，拥有独立的考察分工。\n"
        f"【角色简介】：{persona.get('description') or '资深行业面试官'}\n"
        f"【角色人设（必须始终以此身份与口吻发言）】：\n"
        f"{persona.get('system_prompt') or _FALLBACK_SYSTEM_PROMPT}\n"
        f"{focus_line}"
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
    for p in cfg.get("personas") or []:
        if isinstance(p, dict) and p.get("key") == role:
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
    }


async def persona_node(state: InterviewState) -> dict:
    """通用自定义面试官节点：按当前轮次加载对应人设快照并发起提问。"""
    role = resolve_custom_role(state) or PERSONA_KEY_PREFIX + "unknown"
    persona = _get_persona_snapshot(state, role)
    round_count = state.get("round_count", 0)

    sys_msg = _build_persona_system_prompt(state, persona)

    dig_action = state.get("dig_action", "INIT")
    switch_hint = persona.get("switch_hint") or "请切换到你的考察重点中的下一个方向提出新问题。"

    if round_count == 0 or dig_action == "INIT":
        prompt = (
            persona.get("opening_hint")
            or "这是你负责考察环节的第一道题。请结合候选人画像与岗位要求，"
               "从你的考察重点中选定一个方向，提出一个有深度的开场问题。"
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

    prompt += interviewer_utils.QUESTION_LIMIT

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
