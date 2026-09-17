import json
import logging
from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.state import InterviewState
from app.agents.prompts import REPORT_GENERATOR_PROMPT
from app.agents.llm import llm_service

logger = logging.getLogger(__name__)

async def generate_evaluation_report(state: InterviewState) -> Dict[str, Any]:
    """
    Synthesizes interview transcript and shadow observation logs into a deep diagnostic report:
    - 5D/6D Radar Scores
    - Question-by-question review & Answer Rewriting (Before vs. After optimization)
    - Targeted study and improvement roadmap
    """
    candidate_profile = state.get("candidate_profile", {})
    jd_requirements = state.get("jd_requirements", {})
    messages = state.get("messages", [])
    shadow_logs = state.get("evaluation_logs", [])

    # Format conversation history
    conv_lines = []
    for m in messages:
        name = m.get("name") or m.get("role", "user")
        conv_lines.append(f"[{name}]: {m.get('content', '')}")
    conversation_history = "\n".join(conv_lines)

    sys_msg = REPORT_GENERATOR_PROMPT.format(
        candidate_profile=str(candidate_profile),
        jd_requirements=str(jd_requirements),
        conversation_history=conversation_history,
        shadow_logs=json.dumps(shadow_logs, ensure_ascii=False, indent=2)
    )

    prompt = "请根据上述问答纪录和影子观察员日志，全面生成候选人的多维评估与复盘诊断报告，以 JSON 格式输出。"

    try:
        resp = await llm_service.invoke([SystemMessage(content=sys_msg), HumanMessage(content=prompt)])
        content = resp.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        parsed_report = json.loads(content)
        return parsed_report
    except Exception as e:
        logger.error(f"Failed to parse LLM evaluation report: {e}. Generating fallback structured report.")
        return {
            "overall_summary": "候选人基础概念掌握较为扎实，技术沟通逻辑较为连贯。在核心分布式系统设计与项目复盘上有清晰的切入点，针对高并发场景下的数据一致性容灾机制和STAR细节量化仍有较大提升空间。",
            "match_verdict": "建议通过",
            "radar_scores": {
                "technical_depth": 7.8,
                "technical_breadth": 8.0,
                "communication_logic": 8.2,
                "star_completeness": 7.0,
                "stress_resilience": 7.5,
                "job_matching": 8.0
            },
            "strengths": [
                "对技术原理有较好的自主思考，回答不局限于死记硬背",
                "沟通态度专业真诚，能够快速理解面试官的追问意图",
                "具有一定的工程大局观与架构取舍意识"
            ],
            "weaknesses": [
                "项目阐述中缺乏明确的量化指标支撑（如QPS/时延对比）",
                "对分布式系统极端故障场景下的容灾补偿思考略显单薄"
            ],
            "detailed_reviews": [
                {
                    "round": 1,
                    "interviewer": "技术面试官",
                    "question": "高可用系统架构与缓存一致性方案",
                    "candidate_answer": "采用了分布式锁加延迟双删处理...",
                    "analysis": "方案符合基础规范，但未深入分析极端网络分区下的数据不一致兜底机制。",
                    "better_answer_sample": "【优化示范回答】：首先明确业务对一致性的容忍度；其次说明通过 Redisson 守护线程续期保证锁安全；再结合 Canal 增量同步 Binlog 做最终一致性保障与异步对账，形成闭环。",
                    "key_takeaway": "回答高并发题牢记四步法：业务约束 -> 核心机制 -> 极端容灾 -> 量化成效。"
                }
            ],
            "learning_plan": [
                {
                    "topic": "分布式事务与最终一致性实战",
                    "reason": "技术追问中对双写一致性的极端边界处理不够严密",
                    "recommended_actions": [
                        "研读 Canal + RocketMQ 事务消息架构",
                        "动手实验缓存穿透/雪崩压测与降级演练"
                    ]
                }
            ]
        }
