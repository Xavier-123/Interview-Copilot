"""Compiler that transforms an InterviewerSpec into executable System Prompts and policies."""

from app.services.interviewer_factory.schema import InterviewerSpec
from app.agents.prompts import _REALISTIC_CONDUCT


def compile_system_prompt(spec: InterviewerSpec) -> str:
    """Compiles an InterviewerSpec into a cohesive, high-realism System Prompt.
    
    Includes role persona, target domains, school of thought, behavioral boundaries,
    dislikes/preferences, and avoidance phrases.
    """
    sections = []

    # 1. Identity & Persona Heading
    role_desc = spec.description or f"资深{spec.display_name}"
    sections.append(
        f"你是本次模拟面试的【{spec.display_name}】（角色ID: {spec.interviewer_id}）。\n"
        f"【角色定位】：{role_desc}\n"
        f"【考核职级与基调】：职级 {spec.seniority}，沟通基调 {spec.persona.tone} "
        f"(挑战度: {spec.persona.challenge}, 亲和力: {spec.persona.warmth}, 怀疑度: {spec.skepticism_level})"
    )

    # 2. Target Roles & Competencies
    if spec.target_roles:
        sections.append(f"【目标岗位】：{'、'.join(spec.target_roles)}")
    if spec.interview.competencies:
        sections.append(f"【考察能力维度】：{'、'.join(spec.interview.competencies)}")
    if spec.focus_topics:
        sections.append(f"【重点考察考点】：{'、'.join(spec.focus_topics)}")

    # 3. School of Thought & Behavioral Traits
    if spec.school_of_thought and spec.school_of_thought != "standard":
        sections.append(f"【考核流派】：{spec.school_of_thought}")
    if spec.dislikes:
        sections.append(f"【面试官反感点（遇则质疑或追问）】：{'；'.join(spec.dislikes)}")
    if spec.preferences:
        sections.append(f"【面试官偏好与加分项】：{'；'.join(spec.preferences)}")

    # 4. Behavioral Restrictions & Avoid Phrases
    behavior_lines = []
    if spec.behavior.ask_one_question_at_a_time:
        behavior_lines.append("- 每次发言必须聚焦，严格一次只问一个核心问题，把思考与作答空间留给候选人。")
    if spec.behavior.follow_up_before_switching:
        behavior_lines.append("- 针对含糊回答优先进行深挖追问或澄清，在确认候选人知识边界后再平滑切换考点。")
    if spec.behavior.avoid_phrases:
        avoid_str = "、".join(f"\"{p}\"" for p in spec.behavior.avoid_phrases)
        behavior_lines.append(f"- 严格禁止在发言中出现以下空话套话或机械式口头禅：{avoid_str}。")
    if behavior_lines:
        sections.append("【具体提问行为铁律】：\n" + "\n".join(behavior_lines))

    # 5. User-supplied custom prompt body or hints
    if spec.system_prompt and spec.system_prompt.strip():
        sections.append(f"【专属人设补充指引】：\n{spec.system_prompt.strip()}")

    # 6. Global realistic conduct rules
    sections.append(_REALISTIC_CONDUCT.strip())

    return "\n\n".join(sections).strip() + "\n"
