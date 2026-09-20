"""
Interviewer Audit & Continuous Self-Evolution Service.
Analyzes mock interview dialogues, evaluates interviewer questioning quality,
extracts Golden Few-Shot trajectories and Negative Guidelines,
and stores them in PersonaMemoryModel to drive continuous agent evolution.
"""

import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_core.messages import SystemMessage, HumanMessage

from app.models.persona import PersonaMemoryModel
from app.agents.state import InterviewState
from app.agents.llm import llm_service
from app.models.db import AsyncSessionLocal
from app.agents.persona_presets import PERSONA_PRESETS

logger = logging.getLogger(__name__)

AUDIT_PROMPT = """你是一位顶尖的【AI面试官督导与质检评估专家 (Interviewer Quality Auditor)】。
你的任务是深度复盘刚才这场模拟面试中各位【面试官】的表现，评估提问是否具备真实大厂业务感、是否有效识破并打破了候选人的八股背诵套路，并提炼黄金少样本 (Golden Few-Shot) 与负向避坑规则。

【候选人与岗位背景】：
- 岗位：{industry} - {job_role} (职级: {seniority}, 难度: {difficulty})
- 目标企业场景：{company_scenario}

【本场出场面试官阵容】：
{interviewer_roster}

【面试完整问答记录】：
{conversation_history}

【影子观察员评估日志摘要】：
{evaluation_summary}

请客观评估各位面试官的表现，严格输出以下 JSON 结构（严禁在 JSON 外输出任何其他解释文字）：
```json
{{
  "overall_score": 8.5,
  "business_realism_score": 8.0,
  "anti_memorization_score": 9.0,
  "audit_verdict": "面试官提问具备较强的线上实战感，成功推翻候选人预设假设",
  "strengths": ["针对Redis锁超时的追问直击要害", "有效打断了背诵腔"],
  "weaknesses": ["第一题稍微偏向概念简介，可更快切入故障场景"],
  "golden_trajectories": [
    {{
      "interviewer_role": "出题面试官的标识key（必须从本场出场面试官阵容中选择，如：preset_troubleshooter 或 hr）",
      "topic": "核心考点名称 (如：Redis分布式锁超时与Fencing Token)",
      "good_question": "该面试官提出的高质量、极具临场感的问题原文或提炼",
      "why_effective": "为什么这一问非常专业、有效测出了知识边界"
    }}
  ],
  "negative_rules": [
    {{
      "interviewer_role": "出现不当提问的面试官标识key（如：hr 或 preset_troubleshooter，通用提问纪律填 all）",
      "rule": "面试官应遵守的避坑铁律（10-30字）"
    }}
  ]
}}
```
"""


def _build_interviewer_roster(state: InterviewState) -> Tuple[Dict[str, str], List[Dict[str, Any]], List[str]]:
    """构建本场出场的面试官名册字典 (key -> name)、所有 assistant 提问消息与有效 keys。"""
    roster: Dict[str, str] = {
        "technical": "技术面试官",
        "programmer": "代码极客面试官",
        "hr": "HR面试官",
        "challenger": "压力/挑战官",
        "management": "管理与业务主管",
        "orchestrator": "主持人"
    }

    # 载入预设人设
    for p in PERSONA_PRESETS:
        if isinstance(p, dict) and "key" in p:
            roster[p["key"]] = p.get("name", p["key"])

    # 载入当前自定义人设快照与标签
    cfg = state.get("custom_config") or {}
    for p in cfg.get("personas") or []:
        if isinstance(p, dict) and "key" in p:
            roster[p["key"]] = p.get("name", p["key"])
    for k, v in (cfg.get("persona_labels") or {}).items():
        if k and v:
            roster[k] = str(v)

    # 提取实际在对话中提问过的 assistant 消息
    messages = state.get("messages") or []
    assistant_messages = [
        msg for msg in messages
        if msg.get("role") == "assistant" and msg.get("name") and msg.get("name") != "orchestrator"
    ]

    participating_keys = list(dict.fromkeys(msg.get("name") for msg in assistant_messages if msg.get("name")))
    if not participating_keys:
        curr = state.get("current_interviewer") or "technical"
        participating_keys = [curr]

    return roster, assistant_messages, participating_keys


def _resolve_interviewer_role(
    raw_role: Optional[str],
    text_content: str,
    assistant_messages: List[Dict[str, Any]],
    valid_keys: List[str],
    key_to_name: Dict[str, str],
    default_role: str
) -> str:
    """确定性解析提问角色的 key，防范大模型键名幻觉、别名或错位。"""
    cleaned_role = (raw_role or "").strip()

    # 1. 直接命中合法 key
    if cleaned_role in valid_keys:
        return cleaned_role

    # 2. 检查是否命中了显示名或别名 (如 '老赵' -> 'preset_troubleshooter')
    if cleaned_role:
        for k, name in key_to_name.items():
            if cleaned_role == name or cleaned_role in name or (len(cleaned_role) >= 2 and name in cleaned_role):
                if k in valid_keys or not valid_keys:
                    return k

    # 3. 基于提问文本在真实对话消息中做确定性反查 (匹配原发言人)
    if text_content and assistant_messages:
        clean_text = text_content.strip()
        # 3.1 尝试首尾子串匹配
        for msg in assistant_messages:
            content = (msg.get("content") or "").strip()
            speaker = msg.get("name")
            if not speaker or not content:
                continue
            if clean_text in content or content in clean_text:
                return speaker
            if len(clean_text) >= 8 and clean_text[:12] in content:
                return speaker
            if len(content) >= 8 and content[:12] in clean_text:
                return speaker

        # 3.2 字符集合重合度匹配
        best_speaker = None
        best_score = 0.0
        text_set = set(clean_text)
        for msg in assistant_messages:
            content = (msg.get("content") or "").strip()
            speaker = msg.get("name")
            if not speaker or not content:
                continue
            content_set = set(content)
            overlap = len(text_set & content_set) / max(len(text_set), 1)
            if overlap > best_score and overlap >= 0.35:
                best_score = overlap
                best_speaker = speaker

        if best_speaker:
            return best_speaker

    # 4. 若无法匹配，优雅回退到默认出场角色
    return default_role if default_role in valid_keys else (valid_keys[0] if valid_keys else "technical")


class InterviewerAuditService:
    async def audit_session(
        self,
        state: InterviewState,
        db: Optional[AsyncSession] = None,
        persist: bool = True,
    ) -> Dict[str, Any]:
        """对一场已结束的面试进行面试官表现质检与自省复盘。"""
        messages = state.get("messages", [])
        eval_logs = state.get("evaluation_logs", [])
        interviewer_role = state.get("current_interviewer") or "technical"

        # Format conversation history
        history_lines = []
        for msg in messages:
            sender = msg.get("name") or msg.get("role")
            content = msg.get("content", "").strip()
            history_lines.append(f"[{sender}]: {content}")
        history_text = "\n".join(history_lines[-16:]) if history_lines else "暂无对话记录"

        # Format evaluation summary
        eval_lines = []
        for log in eval_logs[-6:]:
            if isinstance(log, dict):
                eval_lines.append(
                    f"轮次{log.get('round_index')}: 考点={log.get('topic')}, "
                    f"满足度={log.get('satisfaction_score')}, 背诵={log.get('is_memorized')}"
                )
        eval_summary = "\n".join(eval_lines) if eval_lines else "无观察日志"

        # 构建出场名册
        roster_map, assistant_msgs, participating_keys = _build_interviewer_roster(state)
        roster_lines = [f"- key: '{k}', 角色名: '{roster_map.get(k, k)}'" for k in participating_keys]
        roster_text = "\n".join(roster_lines) if roster_lines else "- key: 'technical', 角色名: '技术面试官'"

        mode = state.get("interview_mode") or {}
        scenario = state.get("company_scenario") or {}
        scenario_desc = f"{scenario.get('company', '')} - {scenario.get('business_domain', '')}" if scenario else "未注入特定企业"

        sys_prompt = AUDIT_PROMPT.format(
            industry=state.get("industry", mode.get("industry", "互联网")),
            job_role=state.get("job_role", mode.get("job_role", "后端开发")),
            seniority=mode.get("seniority", "senior"),
            difficulty=mode.get("difficulty", "standard"),
            company_scenario=scenario_desc,
            interviewer_roster=roster_text,
            conversation_history=history_text,
            evaluation_summary=eval_summary
        )

        is_fallback = False
        try:
            resp = await llm_service.invoke(
                [SystemMessage(content=sys_prompt), HumanMessage(content="请严格按照 JSON 格式输出面试官质检评估报告。")],
                llm_config=state.get("llm_config")
            )
            raw = resp.content.strip()
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()
            audit_result = json.loads(raw)
        except Exception as e:
            logger.warning(f"Audit generation failed: {e}. Falling back to default audit result.")
            is_fallback = True
            audit_result = {
                "overall_score": 8.0,
                "business_realism_score": 8.0,
                "anti_memorization_score": 8.0,
                "audit_verdict": "面试官整体控场平稳，问题能够结合候选人技术背景展开。",
                "strengths": ["问题逻辑连贯", "反馈自然"],
                "weaknesses": ["可进一步增加真实突发线上故障场景的出题比重"],
                "golden_trajectories": [
                    {
                        "interviewer_role": interviewer_role,
                        "topic": state.get("current_topic") or "分布式系统实践",
                        "good_question": "结合实际业务场景追问了系统极限并发与极端异常兜底方案",
                        "why_effective": "有效激发了候选人的深度技术推演与架构权衡思考"
                    }
                ],
                "negative_rules": [
                    {
                        "interviewer_role": interviewer_role,
                        "rule": "严禁连续多轮停留在框架基础配置与纯概念释义上"
                    }
                ]
            }

        if is_fallback:
            # Keep fallback reports usable for the user, but never promote
            # hard-coded content into an evolution review queue.
            audit_result["promotion_eligible"] = False

        # Production sessions use persist=False and create a reviewable
        # EvolutionCandidate instead. Direct callers and offline tooling keep
        # the historical persist=True behavior for compatibility.
        if persist:
            await self._persist_audit_evolution(
                audit_result=audit_result,
                assistant_messages=assistant_msgs,
                valid_keys=participating_keys,
                key_to_name=roster_map,
                default_role=interviewer_role,
                is_fallback=is_fallback,
                db=db
            )
        return audit_result

    async def _persist_audit_evolution(
        self,
        audit_result: Any,
        assistant_messages: Optional[List[Dict[str, Any]]] = None,
        valid_keys: Optional[List[str]] = None,
        key_to_name: Optional[Dict[str, str]] = None,
        default_role: str = "technical",
        is_fallback: bool = False,
        db: Optional[AsyncSession] = None
    ):
        """将提炼出的黄金少样本和负向避坑规则按出题角色精准持久化至 PersonaMemoryModel。"""
        # 兼容旧版调用签名: _persist_audit_evolution(persona_key, audit_result, db)
        if isinstance(audit_result, str):
            persona_key = audit_result
            audit_dict = assistant_messages if isinstance(assistant_messages, dict) else {}
            real_db = valid_keys if isinstance(valid_keys, AsyncSession) else db
            return await self._persist_audit_evolution(
                audit_result=audit_dict,
                assistant_messages=[],
                valid_keys=[persona_key],
                key_to_name={},
                default_role=persona_key,
                is_fallback=is_fallback,
                db=real_db
            )

        # 异常兜底结果严禁写入数据库，彻底避免硬编码占位符污染记忆库
        if is_fallback:
            logger.info("Skip persisting fallback audit to prevent dummy memory pollution.")
            return

        assistant_messages = assistant_messages or []
        valid_keys = valid_keys or [default_role]
        key_to_name = key_to_name or {}

        should_close = False
        if db is None:
            session_gen = AsyncSessionLocal()
            db = session_gen
            should_close = True

        try:
            # 1. 沉淀黄金案例 (Golden Trajectories)，精准归因
            for traj in audit_result.get("golden_trajectories") or []:
                if not isinstance(traj, dict):
                    continue
                q = traj.get("good_question", "")
                if len(q) > 5:
                    target_role = _resolve_interviewer_role(
                        raw_role=traj.get("interviewer_role"),
                        text_content=q,
                        assistant_messages=assistant_messages,
                        valid_keys=valid_keys,
                        key_to_name=key_to_name,
                        default_role=default_role
                    )
                    mem = PersonaMemoryModel(
                        persona_key=target_role,
                        memory_type="golden_few_shot",
                        topic=str(traj.get("topic", ""))[:64],
                        content=f"【优质出题范例】考点: {traj.get('topic')}\n提问: {q}\n价值: {traj.get('why_effective')}",
                        score=float(audit_result.get("overall_score", 8.0))
                    )
                    db.add(mem)

            # 2. 沉淀负向避坑规则 (Negative Rules)，精准归因
            for item in audit_result.get("negative_rules") or []:
                rule_text = ""
                raw_role = None
                if isinstance(item, dict):
                    rule_text = (item.get("rule") or "").strip()
                    raw_role = item.get("interviewer_role")
                elif isinstance(item, str):
                    rule_text = item.strip()

                if rule_text and len(rule_text) > 4:
                    if raw_role == "all":
                        # 通用提问纪律：分发给本场出场的各面试官
                        target_roles = valid_keys
                    else:
                        target_role = _resolve_interviewer_role(
                            raw_role=raw_role,
                            text_content=rule_text,
                            assistant_messages=assistant_messages,
                            valid_keys=valid_keys,
                            key_to_name=key_to_name,
                            default_role=default_role
                        )
                        target_roles = [target_role]

                    for r in target_roles:
                        mem = PersonaMemoryModel(
                            persona_key=r,
                            memory_type="negative_rule",
                            topic="提问纪律",
                            content=rule_text,
                            score=1.0
                        )
                        db.add(mem)

            await db.commit()
        except Exception as e:
            logger.warning(f"Failed to persist persona memories: {e}")
            await db.rollback()
        finally:
            if should_close:
                await db.close()

    async def get_persona_evolution_memories(
        self,
        persona_key: str,
        db: Optional[AsyncSession] = None
    ) -> Dict[str, List[str]]:
        """读取指定面试官角色沉淀的黄金少样本与负向避坑规则。"""
        should_close = False
        if db is None:
            session_gen = AsyncSessionLocal()
            db = session_gen
            should_close = True

        try:
            # 黄金案例 Top 2
            res_golden = await db.execute(
                select(PersonaMemoryModel)
                .where(
                    PersonaMemoryModel.persona_key == persona_key,
                    PersonaMemoryModel.memory_type == "golden_few_shot"
                )
                .order_by(desc(PersonaMemoryModel.score), desc(PersonaMemoryModel.created_at))
                .limit(2)
            )
            golden = [m.content for m in res_golden.scalars().all()]

            # 避坑规则 Top 3
            res_rules = await db.execute(
                select(PersonaMemoryModel)
                .where(
                    PersonaMemoryModel.persona_key == persona_key,
                    PersonaMemoryModel.memory_type == "negative_rule"
                )
                .order_by(desc(PersonaMemoryModel.created_at))
                .limit(3)
            )
            rules = [m.content for m in res_rules.scalars().all()]

            return {
                "golden_few_shots": golden,
                "negative_rules": rules
            }
        except Exception as e:
            logger.warning(f"Failed to read persona memories: {e}")
            return {"golden_few_shots": [], "negative_rules": []}
        finally:
            if should_close:
                await db.close()


audit_service = InterviewerAuditService()
