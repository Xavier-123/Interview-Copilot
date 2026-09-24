import json
import logging
from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import (
    EVALUATOR_AGENT_PROMPT,
    COACH_AGENT_PROMPT,
)
from app.agents.llm import llm_service, LLMResponseError
from app.services.prompt_recorder import prompt_recorder

logger = logging.getLogger(__name__)

# JSON 输出解析失败时的纠正提示（重试时追加到 system prompt 末尾）
_JSON_RETRY_NOTE = (
    "\n【重要】你上一次的输出无法解析为合法 JSON。请重新输出：必须是单一 JSON 对象"
    "（可用 ```json 代码块包裹），块外无任何文字，块内无注释、无省略号、无尾随逗号，所有字段完整。"
)

INTERVIEWER_NAME_LABELS = {
    "orchestrator": "主考官",
    "technical": "技术面试官",
    "programmer": "程序员面试官",
    "hr": "HR面试官",
    "management": "管理面试官",
    "challenger": "压力挑战官",
}


def _strip_code_fence(content: str) -> str:
    text = (content or "").strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
    return text


def _format_conversation_history(state: InterviewState) -> str:
    messages = state.get("messages", [])
    persona_labels = (state.get("custom_config") or {}).get("persona_labels") or {}

    def _display_name(name: str) -> str:
        if name in persona_labels:
            return persona_labels[name]
        return INTERVIEWER_NAME_LABELS.get(name, name)

    conv_lines = []
    for m in messages:
        name = m.get("name") or m.get("role", "user")
        conv_lines.append(f"[{_display_name(name)}]: {m.get('content', '')}")
    return "\n".join(conv_lines)


async def _invoke_json(
    system_prompt: str,
    user_prompt: str,
    llm_config: Any,
    node: str,
    what: str,
) -> tuple[Dict[str, Any], str]:
    """调用模型并要求返回 JSON 对象。

    模型不可用或输出无法解析时直接抛错——不再生成模板兜底报告，
    避免用户拿到一份看起来完整、实际由硬编码文案拼出来的结论。
    """
    last_err: Exception | None = None
    for attempt in range(2):
        resp = await llm_service.invoke(
            [
                SystemMessage(content=system_prompt + ("" if attempt == 0 else _JSON_RETRY_NOTE)),
                HumanMessage(content=user_prompt),
            ],
            llm_config=llm_config,
        )
        raw_response = resp.content
        try:
            parsed = json.loads(_strip_code_fence(raw_response))
        except json.JSONDecodeError as e:
            last_err = e
            if attempt == 0:
                logger.warning(f"{node} output unparseable, retrying once: {e}")
            continue
        if not isinstance(parsed, dict):
            raise LLMResponseError(f"模型返回的{what}格式不正确，请重新生成。")
        return parsed, raw_response

    logger.error(f"{node} output still unparseable after retry: {last_err}")
    raise LLMResponseError(f"模型返回的{what}不是合法 JSON，请重新生成。") from last_err


class EvaluatorAgent:
    """
    Independent Evaluator Agent:
    Strictly responsible for objective grading against fixed Rubrics:
    - 6D Radar Scores
    - Evidence extraction & citation
    - Confidence scoring
    - Strengths & weaknesses verdict
    - Pure question-by-question scoring and critique (NO coaching/rewriting)
    Does NOT modify Interviewer Prompt and does NOT write to interviewer memory.
    """

    RUBRIC_ID = "standard-6d-v1"

    async def evaluate(self, state: InterviewState) -> Dict[str, Any]:
        candidate_profile = state.get("candidate_profile", {})
        jd_requirements = state.get("jd_requirements", {})
        shadow_logs = state.get("evaluation_logs", [])
        conversation_history = _format_conversation_history(state)

        sys_msg = EVALUATOR_AGENT_PROMPT.format(
            candidate_profile=str(candidate_profile),
            jd_requirements=str(jd_requirements),
            conversation_history=conversation_history,
            shadow_logs=json.dumps(shadow_logs, ensure_ascii=False, indent=2),
        )

        prompt = "请根据上述问答纪录和影子观察员日志，严格依据标准Rubric进行客观评分与证据提取，输出纯JSON格式。"

        parsed, raw_response = await _invoke_json(
            sys_msg, prompt, state.get("llm_config"), "EvaluatorAgent", "评估报告"
        )

        # 关键字段缺失说明这次输出不可用，宁可让用户重试也不写入编造的分数
        missing = [
            key
            for key, ok in (
                ("overall_summary", bool(parsed.get("overall_summary"))),
                ("radar_scores", bool(parsed.get("radar_scores"))),
                ("detailed_reviews", "detailed_reviews" in parsed),
            )
            if not ok
        ]
        if missing:
            logger.error(f"EvaluatorAgent output missing required fields: {missing}")
            raise LLMResponseError(f"模型返回的评估报告缺少关键字段（{'、'.join(missing)}），请重新生成。")

        parsed.setdefault("confidence_score", None)
        parsed.setdefault("rubric_id", self.RUBRIC_ID)

        prompt_log = prompt_recorder.build_prompt_log(
            session_id=state.get("session_id"),
            node="evaluator",
            call_type="evaluation_report",
            system_prompt=sys_msg,
            user_prompt=prompt,
            response=raw_response,
            round_index=state.get("round_count", 0),
            stage="conclusion",
            turn_id=state.get("turn_id"),
        )
        parsed["_prompt_log"] = prompt_log
        return parsed


class CoachAgent:
    """
    Independent Coach Agent:
    Responsible for professional career & interview skill improvement:
    - Explains weaknesses and root causes
    - Generates Before vs After optimized answer samples for each review round
    - Generates 7-Day Targeted Training Roadmap
    - Generates actionable drill flashcards for deliberate practice
    """

    async def coach(self, state: InterviewState, evaluation_result: Dict[str, Any]) -> Dict[str, Any]:
        candidate_profile = state.get("candidate_profile", {})
        jd_requirements = state.get("jd_requirements", {})
        weaknesses = evaluation_result.get("weaknesses", [])
        verdict = evaluation_result.get("match_verdict", "")
        reviews = evaluation_result.get("detailed_reviews", [])

        reviews_summary = "\n".join(
            [f"Round {r.get('round')}: [{r.get('interviewer')}] {r.get('question')} -> {r.get('analysis')}" for r in reviews]
        )

        sys_msg = COACH_AGENT_PROMPT.format(
            candidate_profile=str(candidate_profile),
            jd_requirements=str(jd_requirements),
            match_verdict=verdict,
            weaknesses=", ".join(weaknesses),
            reviews_summary=reviews_summary or "候选人问答表现整体正常",
        )

        prompt = "请基于上述评估结论，为候选人生成专业的逐题优化示范、能力攻坚学习计划、7天训练日历和专项打靶卡片，输出纯JSON格式。"

        parsed, raw_response = await _invoke_json(
            sys_msg, prompt, state.get("llm_config"), "CoachAgent", "辅导方案"
        )

        missing = [
            key
            for key in ("enriched_reviews", "learning_plan", "seven_day_roadmap", "drill_cards")
            if key not in parsed
        ]
        if missing:
            logger.error(f"CoachAgent output missing required fields: {missing}")
            raise LLMResponseError(f"模型返回的辅导方案缺少关键字段（{'、'.join(missing)}），请重新生成。")

        prompt_log = prompt_recorder.build_prompt_log(
            session_id=state.get("session_id"),
            node="coach",
            call_type="coach_advice",
            system_prompt=sys_msg,
            user_prompt=prompt,
            response=raw_response,
            round_index=state.get("round_count", 0),
            stage="conclusion",
            turn_id=state.get("turn_id"),
        )
        parsed["_prompt_log"] = prompt_log
        return parsed


# Singletons
evaluator_agent = EvaluatorAgent()
coach_agent = CoachAgent()


async def generate_evaluation_report(state: InterviewState) -> Dict[str, Any]:
    """
    Synthesizes interview transcript and shadow observation logs into a deep diagnostic report.
    Pipeline:
    1. EvaluatorAgent calculates objective Rubric scores, evidence citations, and verdicts.
    2. CoachAgent generates tailored Before vs After rewrites, 7-Day roadmap, and drill cards.
    3. Merges seamlessly into the comprehensive report structure, preserving 100% backward compatibility.

    任一环节模型不可用时直接抛错，不落盘模板兜底报告。
    """
    # 1. Objective evaluation
    evaluation = await evaluator_agent.evaluate(state)
    eval_prompt_log = evaluation.pop("_prompt_log", None)

    # 2. Tailored coaching
    coaching = await coach_agent.coach(state, evaluation)
    coach_prompt_log = coaching.pop("_prompt_log", None)

    # 3. Merge detailed reviews with coaching enhancements
    detailed_reviews = evaluation.get("detailed_reviews", [])
    enriched_map = {
        item.get("round"): item
        for item in coaching.get("enriched_reviews", [])
        if isinstance(item, dict)
    }

    final_reviews = []
    for rev in detailed_reviews:
        rev_copy = dict(rev)
        enriched = enriched_map.get(rev_copy.get("round")) or {}
        # 模型没给示范回答就留空，不再填充模板文案冒充教练产出
        rev_copy["better_answer_sample"] = (
            enriched.get("better_answer_sample") or rev_copy.get("better_answer_sample") or ""
        )
        rev_copy["key_takeaway"] = enriched.get("key_takeaway") or rev_copy.get("key_takeaway") or ""
        final_reviews.append(rev_copy)

    prompt_logs = [p for p in (eval_prompt_log, coach_prompt_log) if p]

    # 4. Final aggregate report
    report: Dict[str, Any] = {
        "overall_summary": evaluation.get("overall_summary", ""),
        "match_verdict": evaluation.get("match_verdict", ""),
        "radar_scores": evaluation.get("radar_scores", {}),
        "strengths": evaluation.get("strengths", []),
        "weaknesses": evaluation.get("weaknesses", []),
        "confidence_score": evaluation.get("confidence_score"),
        "rubric_id": evaluation.get("rubric_id", EvaluatorAgent.RUBRIC_ID),
        "detailed_reviews": final_reviews,
        "learning_plan": coaching.get("learning_plan", []),
        "seven_day_roadmap": coaching.get("seven_day_roadmap", []),
        "drill_cards": coaching.get("drill_cards", []),
        "prompt_logs": prompt_logs,
    }

    return report
