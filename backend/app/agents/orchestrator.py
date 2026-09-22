from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import ORCHESTRATOR_SYSTEM_PROMPT
from app.agents.llm import llm_service
from app.services.prompt_recorder import prompt_recorder

_BUILTIN_ROLE_LABELS = {
    "technical": "技术面试官",
    "programmer": "程序员面试官",
    "hr": "HR面试官",
    "challenger": "压力挑战官",
    "management": "管理面试官",
}


def _actual_panel(state: InterviewState) -> str:
    """计算本场真实出场阵容与开场口径，供主考官如实介绍、杜绝虚构评委与结构播报腔。"""
    interview_type = state.get("interview_type", "structured")
    cfg = state.get("custom_config") or {}
    selected = cfg.get("selected_interviewers") or []
    labels = cfg.get("persona_labels") or {}
    single_guidance = (
        "本场为单面试官面试。开场欢迎语控制在两句话内（欢迎 + 邀请自我介绍），"
        "以本场面试官团队的口吻自然说话；严禁出现'主考官''统筹/流程把控''由另一位XX面试官与你交流'"
        "等多角色结构话术，严禁预告环节与时长；结语与反问环节也只以本场真实面试官的名义收尾。"
    )
    if selected:
        names = [labels.get(role) or _BUILTIN_ROLE_LABELS.get(role) or role for role in selected]
        if len(names) == 1:
            return f"{single_guidance}\n【本场实际出场阵容】：主考官（你）+ 唯一专业面试官：{names[0]}"
        return f"主考官（你，负责主持）+ 专业面试官：{'、'.join(names)}"
    if interview_type == "management":
        return f"{single_guidance}\n【本场实际出场阵容】：主考官（你）+ 唯一专业面试官：管理面试官"
    if interview_type in ("behavioral", "hr"):
        return f"{single_guidance}\n【本场实际出场阵容】：主考官（你）+ 唯一专业面试官：HR面试官"
    if interview_type == "programmer":
        return f"{single_guidance}\n【本场实际出场阵容】：主考官（你）+ 唯一专业面试官：程序员面试官"
    if interview_type == "technical":
        return f"{single_guidance}\n【本场实际出场阵容】：主考官（你）+ 唯一专业面试官：技术面试官"
    return "主考官（你，负责主持）+ 技术面试官、HR面试官先后出场"


def _format_orchestrator_prompt(state: InterviewState, current_stage: str) -> str:
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    mode = state.get("interview_mode", {})
    return ORCHESTRATOR_SYSTEM_PROMPT.format(
        industry=state.get("industry", mode.get("industry", "互联网/电商")),
        job_role=state.get("job_role", mode.get("job_role", "后端开发")),
        seniority=state.get("seniority", mode.get("seniority", "senior")),
        difficulty=state.get("difficulty", mode.get("difficulty", "standard")),
        style=state.get("style", mode.get("style", "rigorous")),
        language=state.get("language", mode.get("language", "zh")),
        interview_type=state.get("interview_type", "structured"),
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        condensed_memory=state.get("condensed_memory", "无"),
        current_stage=current_stage
    ) + f"\n【本场实际出场阵容（向候选人介绍时必须与此完全一致，严禁增加或虚构任何评委）】：{_actual_panel(state)}\n"

async def orchestrator_welcome(state: InterviewState) -> dict:
    """Stage 1: Welcome and self-intro request."""
    sys_msg = _format_orchestrator_prompt(state, "icebreak")
    prompt = "请开启面试，向候选人做专业且具有亲和力的破冰开场，并邀请候选人开始自我介绍。"
    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )
    
    prompt_log = prompt_recorder.build_prompt_log(
        session_id=state.get("session_id"),
        node="orchestrator_welcome",
        call_type="interviewer_question",
        system_prompt=sys_msg,
        user_prompt=prompt,
        response=resp.content,
        round_index=state.get("round_count", 0),
        stage="icebreak",
        turn_id=state.get("turn_id"),
    )
    
    out_msg = {
        "role": "assistant",
        "name": "orchestrator",
        "content": resp.content,
        "stage": "icebreak",
        "prompt_log_id": prompt_log["id"],
        "timestamp": datetime.now().isoformat()
    }
    return {
        "messages": [out_msg],
        "prompt_logs": [prompt_log],
        "stage": "self_intro",
        "current_interviewer": "orchestrator",
        "status": "waiting_user"
    }

async def orchestrator_to_technical(state: InterviewState) -> dict:
    """Transition from self-intro to technical specialist."""
    last_answer = state.get("latest_user_input", "")
    sys_msg = _format_orchestrator_prompt(state, "transition_to_technical")
    prompt = f"候选人已完成自我介绍：'{last_answer}'。请用1-2句话自然肯定并串场，宣布由技术面试官开始专业考核。"
    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )
    
    prompt_log = prompt_recorder.build_prompt_log(
        session_id=state.get("session_id"),
        node="orchestrator_to_technical",
        call_type="transition",
        system_prompt=sys_msg,
        user_prompt=prompt,
        response=resp.content,
        round_index=state.get("round_count", 0),
        stage="technical",
        turn_id=state.get("turn_id"),
    )
    
    out_msg = {
        "role": "assistant",
        "name": "orchestrator",
        "content": resp.content,
        "stage": "technical",
        "prompt_log_id": prompt_log["id"],
        "timestamp": datetime.now().isoformat()
    }
    return {
        "messages": [out_msg],
        "prompt_logs": [prompt_log],
        "stage": "technical",
        "current_interviewer": "technical",
        "status": "in_progress"
    }

async def orchestrator_to_hr(state: InterviewState) -> dict:
    """Transition from technical phase to HR phase."""
    sys_msg = _format_orchestrator_prompt(state, "transition_to_hr")
    prompt = "技术考察环节已告一段落。请简短串场，感谢技术面试官并邀请HR面试官对候选人的综合素质与团队协作进行沟通。"
    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )
    
    prompt_log = prompt_recorder.build_prompt_log(
        session_id=state.get("session_id"),
        node="orchestrator_to_hr",
        call_type="transition",
        system_prompt=sys_msg,
        user_prompt=prompt,
        response=resp.content,
        round_index=state.get("round_count", 0),
        stage="hr",
        turn_id=state.get("turn_id"),
    )
    
    out_msg = {
        "role": "assistant",
        "name": "orchestrator",
        "content": resp.content,
        "stage": "hr",
        "prompt_log_id": prompt_log["id"],
        "timestamp": datetime.now().isoformat()
    }
    return {
        "messages": [out_msg],
        "prompt_logs": [prompt_log],
        "stage": "hr",
        "current_interviewer": "hr",
        "status": "in_progress"
    }

async def orchestrator_to_qa(state: InterviewState) -> dict:
    sys_msg = _format_orchestrator_prompt(state, "candidate_qa")
    conclude_reason = state.get("conclude_reason")
    if conclude_reason:
        prompt = f"面试团队的核心考察已告一段落（评估研判：{conclude_reason}）。请用真诚自然的口吻肯定刚才的深入交流并表示感谢，邀请候选人进入反问环节（向面试团队提问）。"
    else:
        prompt = "所有面试官的考察已结束。请代表面试团队表示感谢，并邀请候选人提问（反问环节）。"
    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )
    
    prompt_log = prompt_recorder.build_prompt_log(
        session_id=state.get("session_id"),
        node="orchestrator_to_qa",
        call_type="transition",
        system_prompt=sys_msg,
        user_prompt=prompt,
        response=resp.content,
        round_index=state.get("round_count", 0),
        stage="candidate_qa",
        turn_id=state.get("turn_id"),
    )
    
    out_msg = {
        "role": "assistant",
        "name": "orchestrator",
        "content": resp.content,
        "stage": "candidate_qa",
        "prompt_log_id": prompt_log["id"],
        "timestamp": datetime.now().isoformat()
    }
    return {
        "messages": [out_msg],
        "prompt_logs": [prompt_log],
        "stage": "candidate_qa",
        "current_interviewer": "orchestrator",
        "status": "waiting_user"
    }

async def orchestrator_conclusion(state: InterviewState) -> dict:
    """Final wrap-up."""
    user_q = state.get("latest_user_input", "")
    sys_msg = _format_orchestrator_prompt(state, "conclusion")
    prompt = f"候选人提问或反馈：'{user_q}'。请专业解答并正式为本次面试画上圆满句号，告知稍后将生成复盘报告。"
    resp = await llm_service.invoke(
        [SystemMessage(content=sys_msg), HumanMessage(content=prompt)],
        llm_config=state.get("llm_config")
    )
    
    prompt_log = prompt_recorder.build_prompt_log(
        session_id=state.get("session_id"),
        node="orchestrator_conclusion",
        call_type="transition",
        system_prompt=sys_msg,
        user_prompt=prompt,
        response=resp.content,
        round_index=state.get("round_count", 0),
        stage="conclusion",
        turn_id=state.get("turn_id"),
    )
    
    out_msg = {
        "role": "assistant",
        "name": "orchestrator",
        "content": resp.content,
        "stage": "conclusion",
        "prompt_log_id": prompt_log["id"],
        "timestamp": datetime.now().isoformat()
    }
    return {
        "messages": [out_msg],
        "prompt_logs": [prompt_log],
        "stage": "conclusion",
        "current_interviewer": "orchestrator",
        "status": "finished"
    }
