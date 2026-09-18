import json
import logging
import re
from typing import Optional, Dict, Any, List
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)


def _clean_llm_text(text: Any) -> Any:
    """清洗模型文本输出：去掉首尾空白行，并把 3 个以上连续换行压缩成一个空行。

    前端气泡按 whitespace-pre-wrap 原样渲染，模型输出的开头空行/大片空行会
    直接显示为面试官对话框里的一段长换行，故在统一出口处归一。
    """
    if not isinstance(text, str):
        return text
    normalized = re.sub(r"[ \t]+\n", "\n", text.strip())
    return re.sub(r"\n{3,}", "\n\n", normalized)

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

        # Client cache for per-request (frontend-provided) LLM configs
        self._custom_clients: Dict[tuple, ChatOpenAI] = {}

    @staticmethod
    def _valid_custom_config(llm_config: Optional[Dict[str, Any]]) -> bool:
        if not isinstance(llm_config, dict):
            return False
        api_key = str(llm_config.get("api_key") or "").strip()
        return bool(api_key) and api_key not in ("mock-key", "your_api_key_here")

    def _get_custom_client(self, llm_config: Dict[str, Any]) -> Optional[ChatOpenAI]:
        model = str(llm_config.get("model") or settings.LLM_MODEL)
        api_key = str(llm_config.get("api_key")).strip()
        base_url = str(llm_config.get("base_url") or "").strip() or None
        try:
            temperature = float(llm_config.get("temperature", settings.LLM_TEMPERATURE))
        except (TypeError, ValueError):
            temperature = settings.LLM_TEMPERATURE

        cache_key = (api_key, base_url, model, temperature)
        if cache_key not in self._custom_clients:
            try:
                self._custom_clients[cache_key] = ChatOpenAI(
                    model=model,
                    api_key=api_key,
                    base_url=base_url,
                    temperature=temperature,
                )
            except Exception as e:
                logger.warning(f"Failed to initialize custom ChatOpenAI: {e}. Falling back to default config.")
                return None
        return self._custom_clients[cache_key]

    async def invoke(self, messages: List[BaseMessage], llm_config: Optional[Dict[str, Any]] = None) -> AIMessage:
        # Frontend-provided config takes precedence over backend settings
        if self._valid_custom_config(llm_config):
            client = self._get_custom_client(llm_config)
            if client:
                try:
                    resp = await client.ainvoke(messages)
                    resp.content = _clean_llm_text(resp.content)
                    return resp
                except Exception as e:
                    logger.error(f"Custom-config LLM call failed: {e}. Falling back to dynamic mock response.")
                    return AIMessage(content=self._generate_mock_reply(messages))

        if not self._is_mock and self._client:
            try:
                resp = await self._client.ainvoke(messages)
                resp.content = _clean_llm_text(resp.content)
                return resp
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
                    }
                ],
                "seven_day_roadmap": [
                    {
                        "day": "Day 1-2",
                        "phase": "核心理论与底层原理漏洞补齐",
                        "focus_topics": ["分布式事务与最终一致性", "MySQL MVCC 与锁竞争机制"],
                        "action_items": [
                            "研读 Canal + RocketMQ 增量事务消息机制并画出时序图",
                            "复习 ReadView 与 UndoLog 链条生成逻辑"
                        ],
                        "expected_outcome": "能够完整推演网络分区下的一致性兜底方案"
                    },
                    {
                        "day": "Day 3-4",
                        "phase": "高并发系统设计与极限边界攻坚",
                        "focus_topics": ["极端限流与熔断降级", "多级缓存一致性对账"],
                        "action_items": [
                            "设计万级 QPS 秒杀风控漏斗模型，标注各级过滤比例",
                            "产出系统架构权衡 Trade-off 决策清单"
                        ],
                        "expected_outcome": "回答架构设计题具备全局指标量化与容灾意识"
                    },
                    {
                        "day": "Day 5-6",
                        "phase": "STAR 法则情境表达与量化复盘刻意练习",
                        "focus_topics": ["STAR 四步表达法", "冲突化解与向上管理"],
                        "action_items": [
                            "将主导的2个核心项目重构为标准的 S-T-A-R 结构卡片",
                            "提炼出明确的量化成果指标"
                        ],
                        "expected_outcome": "行为面试回答紧凑有力、数据详实"
                    },
                    {
                        "day": "Day 7",
                        "phase": "全真模拟与冲刺复测",
                        "focus_topics": ["同类型同岗位二次模拟测试"],
                        "action_items": ["在本平台重新发起一场全真模拟面试并对比雷达变化"],
                        "expected_outcome": "六维雷达综合评分达到8.5分以上"
                    }
                ],
                "drill_cards": [
                    {
                        "id": "drill_1",
                        "weakness_title": "专项打靶：分布式锁续期与并发安全",
                        "concept_summary": "Redisson 看门狗租期续期机制，结合 Fencing Token 解决长 GC 踩踏问题。",
                        "interview_tips": "回答主动说明死锁防范与业务超时自动释放的权衡。",
                        "sample_drill_question": "如果客户端获取分布式锁后发生长达40秒的 Full GC，锁已被服务端超时释放并被新请求获取，如何避免并发脏写？"
                    },
                    {
                        "id": "drill_2",
                        "weakness_title": "专项打靶：STAR成果量化表达",
                        "concept_summary": "行为面试强调个人具体担当与可衡量的业务增量（QPS/时延/成本）。",
                        "interview_tips": "使用固定句式：情境约束 -> 关键行动 -> 最终量化指标。",
                        "sample_drill_question": "请分享一次在需求排期严重不足的情况下，你如何与业务方对齐优先级并保质上线的经历？"
                    }
                ]
            }, ensure_ascii=False)

        # 4. Check if it's Shadow Observer
        # 注意：必须匹配 system prompt 中的完整角色名——面试官的 system prompt（行为准则禁令）
        # 和 DEEP_DIVE 指令中也会出现“影子观察员”字样，宽泛匹配会误伤面试官节点。
        if "影子观察员 Agent" in system_prompt or "Shadow Evaluator" in system_prompt:
            return json.dumps({
                "topic": "高并发缓存与数据一致性",
                "satisfaction_score": 0.85,
                "answer_status": "solid",
                "strengths": [
                    "表述条理较清晰，准确切中了核心概念",
                    "展现了一定的项目实战经验与架构选型意识"
                ],
                "weaknesses": [
                    "缺乏足够的业务量化数据支撑（如QPS/延迟降幅）",
                    "对极端异常场景与边界容灾考虑略显不足"
                ],
                "follow_up_hint": "针对方案在极端网络超时下的数据补偿机制进行深挖",
                "next_topic_hint": "MySQL索引原理与事务隔离级别",
                "key_claim": "候选人陈述了使用分布式锁防击穿和Canal保证一致性的方案",
                "depth_score": 8.0,
                "logic_score": 8.2,
                "star_compliance": 7.5,
                "flags": ["solid_basis", "needs_more_metrics"]
            }, ensure_ascii=False)

        # 4. Check if it's Simulate Standard Answer (Candidate Golden Answer)
        if "求职面试导师" in system_prompt or "示范回答" in system_prompt or "候选人第一人称" in system_prompt:
            if "管理" in user_prompt or "战略" in user_prompt or "梯队" in user_prompt:
                return (
                    "在面对紧急重大业务交付与历史技术债务的冲突时，我的核心策略是‘业务优先保交付、架构演进建机制’：\n"
                    "第一，量化技术债务对业务交付和稳定性的实际损耗。我通常会用故障复盘数据与研发排期阻塞率向业务方和高层说明治理收益，争取在迭代中固定预留15%~20%的研发带宽用于重构治理。\n"
                    "第二，制定架构演进路线图，采用‘绞杀者模式’分阶段解耦老旧单体模块，通过防腐层隔离系统风险，确保在不中断业务的前提下实现平滑过渡。\n"
                    "第三，建立明确的梯队分工与规范，通过标杆项目树立研发质量典范，兼顾业务成果与团队长期工程素养提升。"
                )
            elif "行为" in user_prompt or "HR" in user_prompt or "团队" in user_prompt or "冲突" in user_prompt:
                return (
                    "在过往的重点项目交付中，我曾负责核心业务链路重构。当时面临需求排期仅剩两周、旧系统技术债严重且跨部门协议未定型的紧迫局面。\n"
                    "我的核心行动包括：第一，采用关键路径法，迅速与产品及上游团队召开对齐会，锁定核心主流程 MVP 范围；第二，针对技术债抽离防腐层（ACL），隔离旧系统风险并制定回滚预案；第三，每日站会同步卡点并推进自动化接口回归。\n"
                    "最终项目如期保质上线，接口吞吐量提升了 150%，且上线首月未发生任何线上 P2 及以上故障。"
                )
            elif "机房" in user_prompt or "网络分区" in user_prompt or "质疑" in user_prompt or "压力" in user_prompt:
                return (
                    "在面对跨可用区网络分区导致分布式锁心跳超时的极端场景下，如果必须在一致性与可用性之间做权衡，在核心资金与订单核心链路上，我坚持‘优先保证数据强一致，宁可短时降级或快速失败，绝不产生并发脏写’。\n"
                    "具体落地方案包括：第一，引入基于版本号的 Fencing Token（递增防护令牌），存储层执行写入操作时校验 Token 是否单调递增，直接拒绝旧锁持有者的过期请求；第二，结合 Redlock 多节点多数派投票机制，在网络分区时单边无法凑齐法定节点（Quorum），主动阻塞加锁并向客户端返回限流重试；第三，配置快速熔断与对账补偿机制，保障系统在极端故障下的自愈与数据准确。"
                )
            else:
                return (
                    "面对高并发流量洪峰与数据一致性要求，在我的实际工程落地中，主要从以下三层架构来系统性解决：\n"
                    "第一，在接入层与防击穿方面，我们采用基于 Redisson 的分布式锁并结合主动缓存预热。针对热点 Key 设置随机过期时间打散，避免大规模 Key 同时失效引发雪崩。\n"
                    "第二，在数据一致性保障上，针对‘读多写少’业务，我们采用‘Cache-Aside + Canal 监听 MySQL Binlog’的异步补偿机制，避免同步双删中因网络抖动产生的并发脏读，将接口响应延迟稳定控制在 5ms 内。\n"
                    "第三，在容灾兜底方面，配置 Sentinel 进行集群限流与核心接口降级熔断，配合降级静态兜底数据，确保全链路服务高可用。"
                )

        # 5. Check if it's Management Specialist
        if "管理岗与技术战略面试官" in system_prompt or "Management" in system_prompt or "管理岗" in system_prompt:
            return "了解了你的技术背景。作为技术团队核心或架构管理岗，不仅要关注工程实现，还需要平衡团队效能与研发交付价值。请聊聊在团队面对紧急重大业务交付与历史技术债务（如老旧单体服务架构臃肿）的冲突时，你通常如何制定演进路线图并向上汇报争取资源？"

        # 6. Check if it's Programmer Interviewer (check before Technical Specialist)
        if "程序员综合面试官" in system_prompt or "Programmer Interviewer" in system_prompt:
            return "听你讲完项目经历，我们对一下基础。你在简历里提到用 Redis 做缓存，先说说缓存穿透、击穿、雪崩分别是怎么回事，你们项目里是怎么防的？"

        # 7. Check if it's Technical Specialist
        if "专业技术面试官" in system_prompt or "Technical Specialist" in system_prompt:
            return "很好，了解了你的背景。你在简历中提到了核心系统高可用架构的实践，请具体聊聊在流量洪峰来临时，你们是如何设计多级缓存架构与防雪崩机制的？在一致性要求极高的场景下，你如何权衡性能与数据准确性？"

        # 7. Check if it's HR Specialist
        if "行为与文化面试官" in system_prompt or "Behavioral" in system_prompt:
            return "谢谢你的技术分享。在过往的项目经历中，肯定会遇到跨团队协同或需求交付时间非常紧迫的挑战。能否请你分享一个最让你印象深刻的、在巨大压力或资源匮乏下推动项目拿到超预期结果的真实案例？请按照当时的情境、你承担的关键行动和最终成效展开聊聊。"

        # 8. Check if it's Challenger
        if "压力/挑战面试官" in system_prompt or "Challenger" in system_prompt:
            return "你刚才给出的方案在理想网络环境下确实可行。但是，假设当前机房发生跨可用区光缆抖动，网络分区导致分布式锁心跳超时，而此时又有大量并发写入请求涌入，你这个方案还能保证不出现脏数据覆盖吗？如果必须牺牲一项指标，你先牺牲什么？"

        # 9. Default to Orchestrator
        if "self_intro" in user_prompt or "自我介绍" in user_prompt:
            return "非常感谢你的详细介绍！我们对你过往的技术经历已经有了初步了解。接下来，请我们的面试官团队针对核心专业领域与你展开深入探讨。"

        if "language: en" in system_prompt or "语言: en" in system_prompt or "en" in user_prompt:
            return "Hello and welcome to this simulated interview session! I am your lead interviewer. We have gathered a committee to evaluate your technical, architectural, and behavioral competencies. To begin, please introduce yourself concisely."

        return "你好！欢迎参加今天的模拟面试。我是本次面试的主考官。今天我们安排了专业面试官共同参与，整个过程包含背景介绍、深度考核、行为考察以及最后的答疑环节。请先做一个1-2分钟的简要自我介绍，重点聊聊你的核心技能与最有挑战的项目经历。"

llm_service = LLMService()
