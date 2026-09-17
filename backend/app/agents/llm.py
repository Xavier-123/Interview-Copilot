import json
import logging
from typing import Optional, Dict, Any, List
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self._client: Optional[ChatOpenAI] = None
        self._is_mock = settings.ENABLE_MOCK_MODE or settings.LLM_API_KEY in ("mock-key", "", "your_api_key_here")
        
        if not self._is_mock:
            try:
                self._client = ChatOpenAI(
                    model=settings.LLM_MODEL,
                    api_key=settings.LLM_API_KEY,
                    base_url=settings.LLM_BASE_URL,
                    temperature=settings.LLM_TEMPERATURE,
                )
            except Exception as e:
                logger.warning(f"Failed to initialize ChatOpenAI: {e}. Falling back to mock mode.")
                self._is_mock = True

    async def invoke(self, messages: List[BaseMessage]) -> AIMessage:
        if not self._is_mock and self._client:
            try:
                return await self._client.ainvoke(messages)
            except Exception as e:
                logger.error(f"Live LLM call failed: {e}. Falling back to dynamic mock response.")
        
        # Intelligent dynamic mock response
        return AIMessage(content=self._generate_mock_reply(messages))

    def _generate_mock_reply(self, messages: List[BaseMessage]) -> str:
        system_prompt = ""
        user_prompt = ""
        for m in messages:
            if isinstance(m, SystemMessage):
                system_prompt += m.content + "\n"
            elif isinstance(m, HumanMessage):
                user_prompt += m.content + "\n"

        # 1. Check if it's Resume Parser
        if "简历信息抽取专家" in user_prompt or "Resume Parser" in user_prompt:
            return json.dumps({
                "name": "张三",
                "experience_years": 4,
                "skills": ["Python", "FastAPI", "Redis", "高并发架构", "微服务", "Kafka"],
                "projects": [
                    {
                        "name": "高并发电商订单履约中台",
                        "role": "核心后端开发",
                        "tech_stack": ["Python", "Go", "Kafka", "Redis"],
                        "highlights": "优化核心链路，将超时率从3%降低到0.1%，支持万级QPS"
                    }
                ],
                "education": "计算机科学学士",
                "summary_profile": "具备4年后端高并发研发经验，精通Python微服务与分布式缓存"
            }, ensure_ascii=False)

        # 2. Check if it's JD Parser
        if "岗位需求 (JD) 分析专家" in user_prompt or "JD Parser" in user_prompt:
            return json.dumps({
                "title": "资深后端开发专家",
                "level": "senior",
                "required_skills": ["Python", "分布式系统", "高可用设计", "消息队列", "性能调优"],
                "preferred_skills": ["Go", "Kubernetes", "大模型落地实战"],
                "responsibilities": [
                    "负责核心微服务架构设计与性能攻坚",
                    "保障亿级流量下的系统稳定与高可用"
                ],
                "interview_focus": [
                    "分布式一致性与缓存设计",
                    "高并发容灾与压测复盘",
                    "团队协作与技术难点攻关自驱力"
                ]
            }, ensure_ascii=False)

        # 3. Check if it's Report Generator (Check before Shadow Observer)
        if "首席诊断专家" in system_prompt or "Evaluation Architect" in system_prompt or "多维评估与复盘" in user_prompt:
            return json.dumps({
                "overall_summary": "候选人在本次模拟面试中展现了扎实的技术底座与良好的沟通逻辑。在分布式系统选型与核心业务实现上有较好的实操积累，但在高并发极限压测指标量化及STAR情境复盘的深挖上仍有可提升空间，整体展现出资深研发工程师的良好潜质。",
                "match_verdict": "建议通过",
                "radar_scores": {
                    "technical_depth": 7.8,
                    "technical_breadth": 8.0,
                    "communication_logic": 8.2,
                    "star_completeness": 7.0,
                    "stress_resilience": 7.5,
                    "job_matching": 8.1
                },
                "strengths": [
                    "对技术选型的底层推演有一定深度，非机械背诵概念",
                    "沟通表达清晰谦逊，面对追问能够快速理清核心逻辑",
                    "对团队协作与跨部门对齐具有较成熟的工程经验"
                ],
                "weaknesses": [
                    "回答中项目成果量化数据不足，过多使用'大幅提升'等模糊词汇",
                    "在极端边界条件（如双写一致性失效）下的应急容灾设计稍显单一"
                ],
                "detailed_reviews": [
                    {
                        "round": 1,
                        "interviewer": "技术面试官",
                        "question": "请介绍一下你主导的高并发分布式缓存项目中，如何解决缓存击穿和数据一致性问题？",
                        "candidate_answer": "我们采用了分布式锁加主动预热机制，配合MQ做异步双删...",
                        "analysis": "回答点出了互斥锁和延迟双删的核心要点，但在极端并发下网络延迟导致的脏读场景考虑不够全面。",
                        "better_answer_sample": "【优化示范回答】：如果我是你，我会分三层回答：首先指出业务背景与QPS峰值，明确'读多写少'的强一致容忍度；其次说明采用基于Redisson看门狗续期的分布式锁防击穿；针对一致性，采用 Canal 监听 MySQL Binlog 异步投递 MQ 并结合对账补偿，保证最终一致性的同时将接口响应耗时降低至5ms内。",
                        "key_takeaway": "回答架构题时牢记：背景指标 -> 方案权衡(Trade-off) -> 异常兜底 -> 量化收益。"
                    },
                    {
                        "round": 2,
                        "interviewer": "HR面试官",
                        "question": "在项目上线前如果产品经理临时提出推翻原有核心逻辑的需求，你如何处理？",
                        "candidate_answer": "我会和产品经理沟通，看能不能放到二期做。",
                        "analysis": "回答较为直接，但缺少STAR法则中'行动细节'和'同理心协作'的展现。",
                        "better_answer_sample": "【优化示范回答】：首先我会使用STAR法则梳理业务紧急度与上线目标；随后拉齐技术负责人与业务Owner快速评估变更带来的ROI和线上稳定性风险；最后给出梯度交付建议：如核心主路径按原节奏保质量发布，增量需求作为灰度Feature逐步放开，实现双方共赢。",
                        "key_takeaway": "软素质考察的核心不是对抗与拒绝，而是基于大局观的方案共创与推进能力。"
                    }
                ],
                "learning_plan": [
                    {
                        "topic": "分布式系统一致性与 Canal Binlog 实战",
                        "reason": "在技术追问中对异步双删的极端边界缺陷阐述不够清晰",
                        "recommended_actions": [
                            "精读分布式事务最终一致性白皮书",
                            "搭建 Canal + Redis 增量同步实验环境并进行并发破坏性测试"
                        ]
                    },
                    {
                        "topic": "STAR原则高阶沟通与量化复盘法",
                        "reason": "行为面试部分缺乏具体的行动与量化指标",
                        "recommended_actions": [
                            "梳理过往3个核心项目的 S-T-A-R 结构卡片",
                            "训练每个成果带出具体百分比或业务指标（如延迟、成本、人效）"
                        ]
                    }
                ]
            }, ensure_ascii=False)

        # 4. Check if it's Shadow Observer
        if "影子观察员" in system_prompt or "Shadow Evaluator" in system_prompt or "影子观察员" in user_prompt:
            return json.dumps({
                "strengths": [
                    "表述条理较清晰，准确切中了核心概念",
                    "展现了一定的项目实战经验与架构选型意识"
                ],
                "weaknesses": [
                    "缺乏足够的业务量化数据支撑（如QPS/延迟降幅）",
                    "对极端异常场景与边界容灾考虑略显不足"
                ],
                "depth_score": 7.8,
                "logic_score": 8.0,
                "star_compliance": 7.2,
                "flags": ["solid_basis", "needs_more_metrics"]
            }, ensure_ascii=False)

        # 5. Check if it's Technical Specialist
        if "专业技术面试官" in system_prompt or "Technical Specialist" in system_prompt:
            return "很好，了解了你的背景。你在简历中提到了核心系统高可用架构的实践，请具体聊聊在流量洪峰来临时，你们是如何设计多级缓存架构与防雪崩机制的？在一致性要求极高的场景下，你如何权衡性能与数据准确性？"

        # 6. Check if it's HR Specialist
        if "行为与文化面试官" in system_prompt or "Behavioral" in system_prompt:
            return "谢谢你的技术分享。在过往的项目经历中，肯定会遇到跨团队协同或需求交付时间非常紧迫的挑战。能否请你分享一个最让你印象深刻的、在巨大压力或资源匮乏下推动项目拿到超预期结果的真实案例？请按照当时的情境、你承担的关键行动和最终成效展开聊聊。"

        # 7. Check if it's Challenger
        if "压力/挑战面试官" in system_prompt or "Challenger" in system_prompt:
            return "你刚才给出的方案在理想网络环境下确实可行。但是，假设当前机房发生跨可用区光缆抖动，网络分区导致分布式锁心跳超时，而此时又有大量并发写入请求涌入，你这个方案还能保证不出现脏数据覆盖吗？如果必须牺牲一项指标，你先牺牲什么？"

        # 8. Default to Orchestrator
        if "self_intro" in user_prompt or "自我介绍" in user_prompt:
            return "非常感谢你的详细介绍！我们对你过往的技术经历已经有了初步了解。接下来，请我们的【技术面试官】针对核心系统设计和专业领域与你展开深入探讨。"
        
        return "你好！欢迎参加今天的模拟面试。我是本次面试的主考官。今天我们安排了技术专家和HR面试官共同参与，整个过程包含背景介绍、技术深挖、行为考察以及最后的答疑环节。请先做一个1-2分钟的简要自我介绍，重点聊聊你的核心技能与最有挑战的项目经历。"

llm_service = LLMService()
