"""Memory governance policy for Interview-Copilot.

Defines four-domain scope isolation, consent enforcement, and retention policies.
"""

from typing import Any, Dict, List

ALLOWED_SCOPES: List[str] = ["candidate", "interviewer", "organization", "evolution"]

SCOPE_DESCRIPTIONS: Dict[str, str] = {
    "candidate": "候选人跨场次画像、能力成长轨迹、练习偏好与长期目标（严格要求显式授权）",
    "interviewer": "面试官不可变人设版本、黄金出题少样本案例、负向避坑规则与流派偏好",
    "organization": "企业岗位标准、核心题库、Rubric 评分量表与面试准则（全局共享只读）",
    "evolution": "面试质检诊断、候选优化版本指标对比、A/B实验与回放记录",
}

DEFAULT_RETENTION_DAYS: int = 365


def get_policy_summary() -> Dict[str, Any]:
    """Returns metadata describing the active memory governance policy."""
    return {
        "allowed_scopes": ALLOWED_SCOPES,
        "scope_descriptions": SCOPE_DESCRIPTIONS,
        "default_consent_required": True,
        "candidate_scope_rule": "必须获得候选人显式授权 (consent=True) 才能写入长期记忆；未授权时不跨场次持久化",
        "user_rights": [
            "随时查看个人名下的全部长期记忆 (GET /api/v1/memory)",
            "随时单条或批量删除个人记忆 (DELETE /api/v1/memory/{id})",
            "随时开启或撤回授权 (POST /api/v1/memory/consent)",
            "所有记忆写入与删除均记录审计日志 (audit_events)"
        ],
        "privacy_protection": "写入前自动执行 PII 敏感信息脱敏与掩码过滤 (电话、邮箱、身份证件等)",
        "default_retention_days": DEFAULT_RETENTION_DAYS,
    }
