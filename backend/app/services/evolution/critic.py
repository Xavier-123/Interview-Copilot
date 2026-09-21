"""Critic Agent for diagnostic evaluation of interviewer turns and behaviors.

Specializes in identifying:
1. Cliche openers & robotic phrasing ("好的", "感谢您的回答", "非常棒", "接下来让我们")
2. Repetitive follow-up loops without changing perspective
3. JD / Role drift
4. Rating / internal score leakage
5. Speaking length violations (> 4 sentences) or markdown code-block leaking in conversational turns
"""

import re
import logging
from typing import Dict, Any, List, Optional
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.llm import llm_service

logger = logging.getLogger(__name__)

ROBOTIC_OPENERS = [
    "好的", "非常棒", "感谢您的回答", "接下来让我们", "很好", "太棒了",
    "感谢你的分享", "听起来不错", "我明白了", "收到你的回答", "下面我们来看看"
]

RATING_LEAK_KEYWORDS = [
    "给你打", "你的分数", "评估报告", "不合格", "评分系统", "及格", "得分为"
]


class CriticAgent:
    """Diagnoses interviewer dialogue turns and surfaces targeted structural defects."""

    async def diagnose(
        self,
        transcript: List[Dict[str, Any]],
        jd_requirements: Optional[Dict[str, Any]] = None,
        interviewer_spec: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        defects: List[Dict[str, Any]] = []

        # 1. Rule-based static diagnostics
        topic_history = []
        for idx, turn in enumerate(transcript):
            speaker = turn.get("speaker") or turn.get("role", "")
            content = turn.get("content", "").strip()

            if speaker in ("interviewer", "assistant", "technical", "hr", "programmer", "orchestrator"):
                round_num = idx + 1

                # Check robotic openers
                for opener in ROBOTIC_OPENERS:
                    if content.startswith(opener) or content.startswith(f"【{opener}】"):
                        defects.append({
                            "round": round_num,
                            "type": "robotic_cliche_opener",
                            "severity": "medium",
                            "description": f"面试官发言以机械客套词'{opener}'开头，缺乏真人感。",
                            "target_area": "avoid_phrases",
                            "suggestion": f"在 avoid_phrases 中添加 '{opener}'，要求以具体业务回应直接开门见山。",
                        })
                        break

                # Check score / rating leakage
                for leak_kw in RATING_LEAK_KEYWORDS:
                    if leak_kw in content:
                        defects.append({
                            "round": round_num,
                            "type": "rating_leakage",
                            "severity": "high",
                            "description": f"面试官发言包含内部评分或审核泄露词汇'{leak_kw}'。",
                            "target_area": "guardrails",
                            "suggestion": "增强禁止向候选人透露内部打分及结果判定的系统指令约束。",
                        })
                        break

                # Check markdown / bullet formatting in spoken dialogue
                if "```" in content or re.search(r"^\s*(\*|-|\d+\.)\s+", content, re.M):
                    defects.append({
                        "round": round_num,
                        "type": "spoken_format_violation",
                        "severity": "medium",
                        "description": "面试官在口语对话中使用了 Markdown 代码块或列表排版。",
                        "target_area": "prompt_format_rule",
                        "suggestion": "严格执行禁止 markdown、列表符号的口语输出规范。",
                    })

                # Check utterance length (typically > 4 sentences is too verbose)
                sentence_count = len([s for s in re.split(r"[。！？!?]", content) if s.strip()])
                if sentence_count > 5:
                    defects.append({
                        "round": round_num,
                        "type": "verbosity_violation",
                        "severity": "low",
                        "description": f"面试官发言包含 {sentence_count} 句话，超过真实面试单轮精炼上限（<=4句）。",
                        "target_area": "verbosity_constraint",
                        "suggestion": "限制单轮发言不超过 4 句话，留出更多表达空间给候选人。",
                    })

                # Topic tracking for repetition
                current_topic = turn.get("topic")
                if current_topic:
                    topic_history.append((round_num, current_topic))

        # Check repetitive follow-ups (> 2 consecutive rounds on the same topic)
        consecutive_topic = ""
        consecutive_count = 0
        for r_num, topic in topic_history:
            if topic == consecutive_topic:
                consecutive_count += 1
                if consecutive_count >= 3:
                    defects.append({
                        "round": r_num,
                        "type": "repetitive_followup_loop",
                        "severity": "high",
                        "description": f"面试官连续在同一考点'{topic}'上停留追问了 {consecutive_count} 轮，没有切换切入点或考点。",
                        "target_area": "follow_up_strategy",
                        "suggestion": "配置同一主题最多追问 2 轮即强制轮转或切换维度的策略约束。",
                    })
            else:
                consecutive_topic = topic
                consecutive_count = 1

        # Calculate critique score (10.0 max, deducted by defect severity)
        deduction = 0.0
        for d in defects:
            if d["severity"] == "high":
                deduction += 1.5
            elif d["severity"] == "medium":
                deduction += 0.8
            else:
                deduction += 0.4
        critique_score = max(3.0, round(10.0 - deduction, 1))

        summary = (
            f"共检测出 {len(defects)} 处面试官行为缺陷。"
            if defects
            else "面试官对话表现优秀，未发现明显机械套话或越权行为。"
        )

        return {
            "critique_score": critique_score,
            "defects_count": len(defects),
            "defects": defects,
            "summary": summary,
        }


critic_agent = CriticAgent()
