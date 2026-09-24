"""简历打磨（AI 体检）服务。

定位是"体检式打磨"而不是整篇重写：
- 输出结构化诊断报告（JD 匹配缺口、逐条改写建议、追问风险），不直接修改简历。
- 改写建议必须基于原文事实（quote 为原文精确子串），由用户逐条采纳后
  通过 apply_suggestions 生成新版本副本，原件永远不动。
"""

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from langchain_core.messages import HumanMessage

from app.agents.llm import llm_service, LLMResponseError

logger = logging.getLogger(__name__)

RESUME_POLISH_PROMPT = """你是一位资深的【简历打磨教练】，兼具技术面试官视角与简历辅导经验。
请对候选人简历做一次"体检式"打磨分析，严格返回纯 JSON 格式（无 markdown 包裹）：
```json
{{
  "match_score": 72,
  "overall_comment": "总体诊断结论，2~3 句话",
  "gaps": [
    {{
      "requirement": "JD 中的一条关键要求",
      "status": "missing 或 weak 或 covered",
      "evidence": "简历中支撑或缺失的依据",
      "advice": "如何补强的建议（提示补充真实经历，不要编造）"
    }}
  ],
  "issues": [
    {{
      "quote": "原样摘自简历原文的一句完整句子（必须是原文的精确连续片段）",
      "type": "vague|no_metrics|overstated|structure|risky_claim|typo",
      "severity": "high|medium|low",
      "problem": "这句存在什么问题",
      "rewritten": "改写后的句子。必须严格基于原文已有事实重组表达，禁止新增项目/数字/职级；缺少数据时用（补充你的真实数据）占位",
      "reason": "为什么这样改"
    }}
  ],
  "challenge_risks": [
    {{
      "quote": "存在追问风险的原文片段",
      "likely_question": "面试官最可能追问的问题",
      "advice": "如何应对：补充真实细节或降低措辞"
    }}
  ],
  "general_tips": ["不针对单句的整体建议"]
}}
```

硬性规则：
1. quote 字段必须逐字复制简历原文（保留原标点），否则该条建议无法被定位采纳。
2. rewritten 只能重组与精炼原文已有信息，绝不允许虚构新的项目、数据、职级或技能；缺失的数据用（补充你的真实数据）占位，让候选人自己填。
3. 未提供岗位描述时：match_score 为 null，gaps 为空数组，聚焦表达质量与追问风险。
4. issues 按严重程度从高到低排序，最多 8 条，只挑最有价值的改动。
5. 所有分析文字用中文。

目标岗位：{target_role}
岗位描述（JD）：
{jd_text}

简历原文：
{resume_text}
"""

_SEVERITIES = ("high", "medium", "low")
_ISSUE_TYPES = ("vague", "no_metrics", "overstated", "structure", "risky_claim", "typo")
_GAP_STATUSES = ("missing", "weak", "covered")


def _extract_json(content: str) -> Optional[Dict[str, Any]]:
    """从模型输出中提取 JSON（容忍 ```json 围栏）。"""
    text = content.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    try:
        data = json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _clean_str(value: Any) -> str:
    return str(value).strip() if value is not None else ""


class ResumePolishService:
    async def diagnose(
        self,
        raw_text: str,
        jd_text: Optional[str] = None,
        target_role: Optional[str] = None,
        llm_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """生成结构化诊断报告（不修改简历）。模型不可用或输出异常时直接抛错，不返回空兜底报告。"""
        prompt = RESUME_POLISH_PROMPT.format(
            target_role=(target_role or "").strip() or "未提供",
            jd_text=(jd_text or "").strip() or "（未提供岗位描述）",
            resume_text=raw_text,
        )
        resp = await llm_service.invoke([HumanMessage(content=prompt)], llm_config=llm_config)
        report = _extract_json(resp.content)
        if report is None:
            logger.error("Resume polish LLM returned invalid JSON")
            raise LLMResponseError("模型返回的简历诊断报告不是合法 JSON，请重试。")
        return self._normalize_report(report, raw_text)

    def _normalize_report(self, report: Dict[str, Any], raw_text: str) -> Dict[str, Any]:
        """归一化报告结构，并为每条 issue 标记能否在原文中精确定位。"""
        normalized: Dict[str, Any] = {
            "match_score": None,
            "overall_comment": _clean_str(report.get("overall_comment")),
            "gaps": [],
            "issues": [],
            "challenge_risks": [],
            "general_tips": [],
        }
        score = report.get("match_score")
        if isinstance(score, (int, float)):
            normalized["match_score"] = max(0, min(100, round(score)))

        for gap in report.get("gaps") or []:
            if not isinstance(gap, dict):
                continue
            requirement = _clean_str(gap.get("requirement"))
            if not requirement:
                continue
            status = _clean_str(gap.get("status")).lower()
            normalized["gaps"].append(
                {
                    "requirement": requirement,
                    "status": status if status in _GAP_STATUSES else "weak",
                    "evidence": _clean_str(gap.get("evidence")),
                    "advice": _clean_str(gap.get("advice")),
                }
            )

        for issue in report.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            quote = _clean_str(issue.get("quote"))
            if not quote:
                continue
            severity = _clean_str(issue.get("severity")).lower()
            issue_type = _clean_str(issue.get("type")).lower()
            normalized["issues"].append(
                {
                    "quote": quote,
                    "type": issue_type if issue_type in _ISSUE_TYPES else "vague",
                    "severity": severity if severity in _SEVERITIES else "medium",
                    "problem": _clean_str(issue.get("problem")),
                    "rewritten": _clean_str(issue.get("rewritten")),
                    "reason": _clean_str(issue.get("reason")),
                    # 能否精确定位原文：不可定位的建议前端禁用采纳，apply 时也会跳过
                    "applicable": quote in raw_text and bool(_clean_str(issue.get("rewritten"))),
                }
            )
        normalized["issues"].sort(
            key=lambda x: _SEVERITIES.index(x["severity"]) if x["severity"] in _SEVERITIES else 1
        )

        for risk in report.get("challenge_risks") or []:
            if not isinstance(risk, dict):
                continue
            if not (_clean_str(risk.get("likely_question")) or _clean_str(risk.get("advice"))):
                continue
            normalized["challenge_risks"].append(
                {
                    "quote": _clean_str(risk.get("quote")),
                    "likely_question": _clean_str(risk.get("likely_question")),
                    "advice": _clean_str(risk.get("advice")),
                }
            )

        for tip in report.get("general_tips") or []:
            tip = _clean_str(tip)
            if tip:
                normalized["general_tips"].append(tip)
        return normalized

    @staticmethod
    def apply_suggestions(
        raw_text: str, items: List[Dict[str, str]]
    ) -> Tuple[str, List[Dict[str, str]], List[Dict[str, str]]]:
        """把采纳的改写建议逐条应用到原文。

        quote 必须是原文精确子串才可替换；返回 (新文本, 已应用列表, 跳过列表)。
        """
        new_text = raw_text
        applied: List[Dict[str, str]] = []
        skipped: List[Dict[str, str]] = []
        for item in items:
            quote = _clean_str(item.get("quote"))
            rewritten = _clean_str(item.get("rewritten"))
            if not quote or not rewritten or rewritten == quote or quote not in new_text:
                skipped.append({"quote": quote, "rewritten": rewritten})
                continue
            new_text = new_text.replace(quote, rewritten, 1)
            applied.append({"quote": quote, "rewritten": rewritten})
        return new_text, applied, skipped


resume_polish_service = ResumePolishService()
