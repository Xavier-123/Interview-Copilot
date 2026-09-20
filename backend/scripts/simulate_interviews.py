"""
批量模拟面试驱动脚本：直接驱动 session_manager 跑 N 场不同场景的面试，
候选人由 LLM 按场景人设扮演（独立 ChatOpenAI 客户端 + 自建重试，不经过
llm_service 的静默 mock 兜底，避免污染分析数据）。

用法（必须在 backend 目录下运行）：
    .venv/Scripts/python scripts/simulate_interviews.py                  # 全部 10 场
    .venv/Scripts/python scripts/simulate_interviews.py --only S2,S4     # 指定场景
    .venv/Scripts/python scripts/simulate_interviews.py --suffix rerun   # 输出到 simulation_output/rerun/

产物：simulation_output/<suffix>/<场景ID>_<slug>/transcript.json | transcript.md | meta.json
数据库：隔离的 simulation_output/simulation.db（不污染真实 interview_copilot.db）
"""
import argparse
import asyncio
import json
import os
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

OUTPUT_DIR = BACKEND_DIR / "simulation_output"


def _setup_env() -> None:
    # 必须在 import app.* 之前执行：config.py 在类定义时通过 os.getenv 读取环境变量，
    # 进程环境变量优先于 .env，从而把本次模拟的读写隔离到独立的 SQLite 文件。
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    db_path = OUTPUT_DIR / "simulation.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    # 本机配置了系统代理（127.0.0.1:7897）但代理客户端可能未运行，Python 客户端
    # （httpx/openai）会因连接代理被拒而全部失败并静默降级 mock，这里强制直连。
    os.environ["NO_PROXY"] = "*"
    os.environ["no_proxy"] = "*"


_setup_env()

from langchain_core.messages import HumanMessage, SystemMessage  # noqa: E402
from langchain_openai import ChatOpenAI  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.models.db import engine, init_db  # noqa: E402
from app.services.session_manager import session_manager  # noqa: E402
from app.agents.llm import llm_service  # noqa: E402


async def strict_invoke(self, messages, llm_config=None):
    """
    替换 LLMService.invoke 的严格版本：失败重试而不是静默降级 mock。
    llm.py 原版在 live 调用失败时会返回动态 mock 文案，会污染模拟数据；
    模拟场景不使用前端自定义 llm_config，直接走后端默认客户端。
    """
    client = llm_service._client
    if client is None:
        raise RuntimeError("LLM client is not initialized (check LLM_API_KEY)")
    delay = 5.0
    last_err: Exception | None = None
    for _ in range(4):
        try:
            return await client.ainvoke(messages)
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            # 429 限流需要更长退避
            wait = 30.0 if "429" in str(exc) or "rate limit" in str(exc).lower() else delay
            print(f"  [llm retry] {type(exc).__name__}: {str(exc)[:120]} -> {wait}s", flush=True)
            await asyncio.sleep(wait)
            delay = min(delay * 2, 30.0)
    raise RuntimeError(f"live LLM call failed after retries: {last_err}")


def patch_llm_service() -> None:
    """把 llm_service.invoke 换成严格版本，杜绝静默 mock 污染模拟数据。"""
    llm_service.invoke = strict_invoke.__get__(llm_service)  # type: ignore[method-assign]

INTERVIEWER_CN = {
    "orchestrator": "主考官",
    "technical": "技术面试官",
    "programmer": "程序员面试官",
    "hr": "HR面试官",
    "challenger": "压力挑战官",
    "management": "管理面试官",
    "custom_persona": "自定义面试官",
}

# llm.py 静默 mock 兜底的代表性文案特征，用于事后扫描 transcript 是否被污染
MOCK_SIGNATURES = [
    "支持万级QPS",
    "Canal 监听 MySQL Binlog",
    "Redisson 看门狗",
    "Fencing Token（递增防护令牌）",
    "跨可用区光缆抖动",
    "接口吞吐量提升了 150%",
    "秒杀风控漏斗模型",
]

CANDIDATE_PROMPT = """你正在扮演一场模拟面试中的候选人。这是用于测试面试系统的内部演练，请始终保持在角色内。

【候选人人设】
{persona}

【候选人简历】
{resume}

【行为规则】
1. 只输出候选人的回答正文，不要输出任何旁白、舞台指示、括号动作，也不要用引号包裹。
2. 严格贴合人设的水平与表达风格：擅长的给细节，不擅长的含糊、简短或坦承不会。
3. 与自己之前说过的内容保持一致，可以自然引用之前的回答，不要前后矛盾。
4. 直接回答面试官最新的问题，不要反问面试官、不要索要提示、不要要求重复问题。
5. 像真人一样口语化，可以有少量语气词，但不要过度；句数控制在人设给定的范围内。
6. {language_rule}
"""

SCENARIOS = [
    {
        "id": "S1",
        "slug": "tech_backend_vague",
        "interview_type": "technical",
        "industry": "互联网/电商",
        "job_role": "资深后端开发",
        "seniority": "senior",
        "difficulty": "standard",
        "style": "rigorous",
        "language": "zh",
        "language_rule": "全程使用中文回答。",
        "persona": (
            "李明，32岁，4年Python后端。性格踏实但数据敏感度一般：项目流程讲得清楚，"
            "但从不主动给出量化指标，被追问具体数据时会说『具体数字记不太清了，大概提升了两三成吧』"
            "这类模糊说法。技术中等偏上。回答一般3-5句。"
        ),
        "resume_text": (
            "李明，本科毕业于杭州电子科技大学计算机系，4年Python后端开发经验，现就职于一家中型电商公司。\n"
            "核心技能：Python、FastAPI、MySQL、Redis、RabbitMQ、Docker。\n"
            "项目经历：\n"
            "1. 电商订单履约系统重构：负责订单拆单与状态机模块的改造，支撑日均百万级订单。\n"
            "2. 营销活动系统：设计优惠券发放与核销链路，大促期间运行稳定。\n"
            "3. 内部报表平台：将核心报表查询接入只读从库并增加缓存，查询速度提升了很多。\n"
            "自我评价：踏实肯干，乐于分享，对高并发场景有一定实战经验。"
        ),
        "jd_text": (
            "资深后端开发工程师（电商方向）\n"
            "职责：负责交易核心链路的设计与迭代，参与大促稳定性保障。\n"
            "要求：\n"
            "1. 3年以上Python/Java后端经验，熟悉MySQL、Redis、消息队列；\n"
            "2. 有高并发、高可用系统设计经验，能独立负责核心模块；\n"
            "3. 具备良好的沟通能力与问题排查能力。"
        ),
    },
    {
        "id": "S2",
        "slug": "tech_llm_rag",
        "interview_type": "technical",
        "industry": "人工智能/大模型",
        "job_role": "大模型应用Agent开发专家",
        "seniority": "expert",
        "difficulty": "hard",
        "style": "rigorous",
        "language": "zh",
        "language_rule": "全程使用中文回答。",
        "persona": (
            "王强，29岁，5年NLP/大模型应用研发。概念和术语非常熟练（RAG、LoRA、Agent、幻觉抑制等张口就来），"
            "但对底层原理理解不深：被追问数学原理、检索细节、分布式训练等底层问题时会开始用更多术语绕圈子掩饰，"
            "偶尔答非所问。回答偏长，爱堆术语。"
        ),
        "resume_text": (
            "王强，硕士毕业于华中科技大学，5年NLP相关研发经验，近两年专注大模型应用落地。\n"
            "核心技能：Python、PyTorch、LangChain、向量数据库（Milvus）、Prompt工程、模型微调（LoRA）。\n"
            "项目经历：\n"
            "1. 企业知识库问答系统：基于RAG架构搭建，覆盖公司10w+文档，支持多轮对话。\n"
            "2. 智能客服工单摘要：微调开源7B模型用于工单自动摘要与分类。\n"
            "3. Agent工作流平台：编排多个工具调用节点，支持插件扩展。\n"
            "自我评价：对大模型技术生态有全景式了解，学习能力强。"
        ),
        "jd_text": (
            "大模型应用算法专家（Agent方向）\n"
            "职责：负责RAG与Agent系统的架构设计与效果优化，推进大模型能力在业务场景落地。\n"
            "要求：\n"
            "1. 精通RAG关键链路：切片、嵌入、检索、重排、生成评估；\n"
            "2. 深入理解Transformer原理与主流开源模型，有微调与部署实战；\n"
            "3. 有复杂Agent系统设计经验，能主导技术方案评审。"
        ),
    },
    {
        "id": "S3",
        "slug": "prog_crud",
        "interview_type": "programmer",
        "industry": "互联网/电商",
        "job_role": "资深后端开发",
        "seniority": "senior",
        "difficulty": "standard",
        "style": "rigorous",
        "language": "zh",
        "language_rule": "全程使用中文回答。",
        "persona": (
            "赵磊，30岁，6年Java后端，企业信息系统背景。计算机基础扎实（MySQL、Redis、网络都知道），"
            "但项目多为常规CRUD业务系统，没有真正的高并发经验：被问大流量场景时会诚实地讲自己的理解"
            "或理论方案，并承认『我们那个量级没遇到过』。回答平实，4-6句。"
        ),
        "resume_text": (
            "赵磊，本科，6年Java后端开发经验，曾在两家软件公司从事企业信息系统研发。\n"
            "核心技能：Java、Spring Boot、MySQL、MyBatis、Redis、Vue基础。\n"
            "项目经历：\n"
            "1. ERP进销存系统：负责采购、库存模块的接口开发与维护。\n"
            "2. 物业管理SaaS：实现缴费、报修工单流程，参与数据库表结构设计。\n"
            "3. 公司内部OA系统：开发审批流引擎的表单配置功能。\n"
            "自我评价：编码习惯良好，熟悉业务系统开发全流程。"
        ),
        "jd_text": (
            "资深后端开发工程师\n"
            "职责：负责企业级业务系统的服务端开发与性能优化。\n"
            "要求：\n"
            "1. 扎实的Java基础与常用框架使用经验；\n"
            "2. 熟悉MySQL索引与事务、Redis常见使用场景；\n"
            "3. 了解高并发系统的基本设计思路，有排查线上问题的经验。"
        ),
    },
    {
        "id": "S4",
        "slug": "prog_junior",
        "interview_type": "programmer",
        "industry": "游戏开发",
        "job_role": "游戏客户端开发",
        "seniority": "junior",
        "difficulty": "easy",
        "style": "gentle",
        "language": "zh",
        "language_rule": "全程使用中文回答。",
        "persona": (
            "陈晓，22岁，应届本科生，求职游戏客户端岗。面试会紧张：回答简短（1-3句），经常答不完整；"
            "基础题一半会一半不会，不会的会紧张地直说『这个……我还没学过，不太清楚』，"
            "但态度诚恳，会努力往自己会的东西上靠。说话偶尔有『嗯』『那个』等语气词。"
        ),
        "resume_text": (
            "陈晓，2026届本科应届毕业生，就读于重庆邮电大学数字媒体技术专业，求职游戏客户端开发岗位。\n"
            "技能：Unity引擎（做过两个课程项目）、C#、C++基础、常见数据结构。\n"
            "项目经历：\n"
            "1. Unity 2D横版闯关小游戏：实现角色移动、战斗与存档系统，获课程设计二等奖。\n"
            "2. 毕业设计：基于Unity的射击游戏Demo，实现简单AI敌人行为。\n"
            "其他：参加过学校游戏社团，掌握基础的版本管理（Git）。"
        ),
        "jd_text": (
            "游戏客户端开发工程师（校招）\n"
            "职责：参与手游客户端功能开发与玩法实现。\n"
            "要求：\n"
            "1. 熟悉Unity/C#或Unreal/C++，具备良好的数据结构基础；\n"
            "2. 对游戏玩法与技术实现有热情，学习能力强的应届生亦可；\n"
            "3. 良好的团队协作意识。"
        ),
    },
    {
        "id": "S5",
        "slug": "hr_jumpy",
        "interview_type": "behavioral",
        "industry": "金融科技/量化",
        "job_role": "量化系统研发工程师",
        "seniority": "senior",
        "difficulty": "standard",
        "style": "gentle",
        "language": "zh",
        "language_rule": "全程使用中文回答。",
        "persona": (
            "孙悦，27岁，3年金融科技后端，两年内换过两份工作。回答行为类问题偏模板化"
            "（『和团队沟通』『换位思考』），离职原因只会说『寻求更好的发展空间』，"
            "被追问时会继续用笼统说法回避；讲项目时倾向用『我们』代替『我』，"
            "追问个人具体贡献时才挤出一些细节。"
        ),
        "resume_text": (
            "孙悦，本科毕业于武汉大学软件工程，3年后端开发经验，主要在金融科技领域。\n"
            "技能：Java、Spring Cloud、MySQL、Kafka、Redis。\n"
            "经历：\n"
            "1. 某消费金融公司（1年半）：参与信贷审批系统的规则引擎模块开发。\n"
            "2. 某证券信息技术部（1年半）：负责行情数据推送服务的优化迭代。\n"
            "自我评价：适应能力强，希望寻找更有发展空间的平台。"
        ),
        "jd_text": (
            "量化系统研发工程师\n"
            "职责：参与交易与风控系统的服务端研发，保障低延迟与稳定运行。\n"
            "要求：\n"
            "1. 3年以上Java/C++后端经验，熟悉多线程与网络编程；\n"
            "2. 对数据敏感，具备良好的稳定性与抗压能力；\n"
            "3. 认同长期主义，希望在金融科技领域持续深耕。"
        ),
    },
    {
        "id": "S6",
        "slug": "hr_lead",
        "interview_type": "hr",
        "industry": "通用行业",
        "job_role": "技术负责人Tech Lead",
        "seniority": "expert",
        "difficulty": "standard",
        "style": "rigorous",
        "language": "zh",
        "language_rule": "全程使用中文回答。",
        "persona": (
            "周凯，35岁，8年研发、带过15人团队。经验真实丰富、案例多，但表达啰嗦爱绕圈子："
            "一个故事从背景讲起很细（5-8句），重点出现得慢，被追问时能给出扎实细节。"
            "管理动作描述真实（一对一沟通、绩效面谈、招人翻车经历等）。"
        ),
        "resume_text": (
            "周凯，硕士，8年研发经验，目前在一家互联网医疗公司担任技术负责人，"
            "带15人团队（含5名前端、8名后端、2名测试）。\n"
            "技能：Java技术栈、微服务架构、团队管理。\n"
            "经历：\n"
            "1. 互联网医院平台：从0到1组建研发团队，负责预约挂号、在线问诊两条业务线。\n"
            "2. 医药B2B供应链系统：主导微服务拆分与研发流程规范化建设，建立了双周迭代与代码评审机制。\n"
            "自我评价：注重团队梯队培养，擅长跨部门协调与向上管理。"
        ),
        "jd_text": (
            "技术负责人 Tech Lead\n"
            "职责：带领10-15人研发团队，负责产品技术架构与交付质量，参与技术规划。\n"
            "要求：\n"
            "1. 5年以上研发经验、2年以上团队管理经验；\n"
            "2. 具备梯队建设、绩效管理与跨部门协同的实战经验；\n"
            "3. 能在业务压力与工程质量之间做出合理权衡。"
        ),
    },
    {
        "id": "S7",
        "slug": "mgmt_bookish",
        "interview_type": "management",
        "industry": "企业服务/SaaS",
        "job_role": "技术总监VP",
        "seniority": "director",
        "difficulty": "hard",
        "style": "rigorous",
        "language": "zh",
        "language_rule": "全程使用中文回答。",
        "persona": (
            "吴迪，38岁，架构师转管理2年，现在管30人。管理方法论偏书本：爱说OKR、金字塔原理、"
            "赋能、抓手这类词，但被追问『具体怎么做的』时给出的动作偏理论、案例较单薄"
            "（只有一两个模糊的小例子）。技术背景扎实。"
        ),
        "resume_text": (
            "吴迪，硕士，12年技术经验，前6年专注分布式架构，近2年担任技术总监，管理30人左右的技术团队。\n"
            "技能：技术战略规划、OKR管理、架构治理、云原生。\n"
            "经历：\n"
            "1. SaaS CRM产品线：制定平台多租户架构演进路线，推动核心模块服务化改造。\n"
            "2. 研发效能建设：引入OKR与研发度量体系，规划CI/CD流水线标准化。\n"
            "自我评价：擅长将管理方法论落地为工程实践。"
        ),
        "jd_text": (
            "技术总监 VP（企业服务方向）\n"
            "职责：统筹30+人研发团队，制定年度技术规划，对产品交付质量与团队效能负责。\n"
            "要求：\n"
            "1. 10年以上技术经验、3年以上大型团队管理经验；\n"
            "2. 具备技术战略规划、跨部门资源协调与技术债务治理经验；\n"
            "3. 有SaaS行业背景者优先。"
        ),
    },
    {
        "id": "S8",
        "slug": "stress_arch",
        "interview_type": "technical",
        "industry": "互联网/电商",
        "job_role": "高并发架构师",
        "seniority": "expert",
        "difficulty": "hard",
        "style": "stress",
        "language": "zh",
        "language_rule": "全程使用中文回答。",
        "max_answers": 12,
        "persona": (
            "郑浩，33岁，8年高并发架构经验，自信甚至有点自负：坚信自己的方案是对的，"
            "被挑战时会据理力争、语气偶尔变冲（『这个场景我在线上真实跑过』），承认错误慢，"
            "但如果对方给出确实站得住的理由会不情不愿地松口。回答有干货但带优越感。"
        ),
        "resume_text": (
            "郑浩，本科，8年后端架构经验，现任某互联网公司架构组负责人。\n"
            "技能：Java、Kubernetes、Kafka、Redis、分布式事务、压测调优。\n"
            "经历：\n"
            "1. 秒级毫推送货的实时数据管道：主导Kafka集群扩容与分区调优。\n"
            "2. 统一支付网关：设计多渠道异步对账架构，主导双十一全链路压测。\n"
            "3. 服务网格落地：推动Istio灰度发布方案在核心业务上线。\n"
            "自我评价：对技术方案有强烈的判断力与执行魄力。"
        ),
        "jd_text": (
            "高并发架构师\n"
            "职责：负责核心交易链路架构设计与大促稳定性建设。\n"
            "要求：\n"
            "1. 精通分布式系统设计，有十万级QPS场景实战经验；\n"
            "2. 对方案取舍有清晰的方法论，能承受技术决策压力；\n"
            "3. 具备跨团队技术推动能力。"
        ),
    },
    {
        "id": "S9",
        "slug": "english_mixed",
        "interview_type": "english",
        "industry": "互联网/电商",
        "job_role": "资深后端开发",
        "seniority": "senior",
        "difficulty": "standard",
        "style": "rigorous",
        "language": "en",
        "language_rule": "以英文为主回答，可以按人设夹杂少量中文词汇。",
        "tech_rounds_target": 5,
        "persona": (
            "Amy Zhang，30岁，5年后端，外企背景。英语水平一般：用简单英文句式回答，"
            "偶尔卡壳时用中文词代替（如 'the... p99 latency, 就是那个长尾延迟'），"
            "语法简单但技术内容表达得还算清楚。整体沟通努力且礼貌。"
        ),
        "resume_text": (
            "Amy Zhang, 5 years backend experience, currently working at a multinational "
            "e-commerce company in Shanghai.\n"
            "Skills: Python, Go, MySQL, Redis, Kafka, AWS.\n"
            "Experience:\n"
            "1. Order service re-architecture: migrated monolithic order module to microservices.\n"
            "2. Cross-border logistics tracking system: integrated with 3PL APIs, improved tracking latency.\n"
            "3. Internal API gateway: rate limiting and authentication middleware.\n"
            "Self-evaluation: solid engineering skills, good cross-timezone collaboration experience."
        ),
        "jd_text": (
            "Senior Backend Engineer (Global Team)\n"
            "Responsibilities: Design and evolve core commerce services for global markets.\n"
            "Requirements:\n"
            "1. 3+ years backend experience with Python/Go;\n"
            "2. Solid understanding of distributed systems, databases and caching;\n"
            "3. Fluent English communication for cross-region collaboration."
        ),
    },
    {
        "id": "S10",
        "slug": "struct_flat",
        "interview_type": "structured",
        "industry": "智能制造/自动驾驶",
        "job_role": "系统架构师",
        "seniority": "expert",
        "difficulty": "hard",
        "style": "rigorous",
        "language": "zh",
        "language_rule": "全程使用中文回答。",
        "tech_rounds_target": 5,
        "persona": (
            "钱进，35岁，9年架构经验。回答四平八稳、全面但平淡：每个问题都能答到几个点，"
            "但几乎不给出具体数字和案例细节，不主动深挖，也不会说错什么。2-5句，条理清楚但缺少亮点。"
        ),
        "resume_text": (
            "钱进，本科，9年后端与架构经验，现于一家工业软件公司担任系统架构师。\n"
            "技能：Java、Go、MySQL、Redis、MQTT、Kubernetes、时序数据库。\n"
            "经历：\n"
            "1. 工业设备数据采集平台：设计设备接入与数据入库链路，日均处理亿级点位数据。\n"
            "2. MES制造执行系统：负责架构评审与核心排产模块设计。\n"
            "3. 边缘计算网关：制定边缘节点与云端的数据同步方案。\n"
            "自我评价：技术栈全面，做事稳健，注重方案可落地性。"
        ),
        "jd_text": (
            "系统架构师（智能制造方向）\n"
            "职责：负责工业互联网平台整体架构设计与技术选型。\n"
            "要求：\n"
            "1. 8年以上后端经验，精通分布式架构与高吞吐数据链路设计；\n"
            "2. 熟悉时序数据库、消息队列与边缘计算场景；\n"
            "3. 能主导跨团队技术方案评审。"
        ),
    },
]

LOG_FILE = OUTPUT_DIR / "run_log.txt"


def log(message: str) -> None:
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {message}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def scenario_out_dir(sc: dict, suffix: str) -> Path:
    base = OUTPUT_DIR / suffix if suffix else OUTPUT_DIR
    out_dir = base / f"{sc['id']}_{sc['slug']}"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


def extract_text(resp_content) -> str:
    if isinstance(resp_content, str):
        return resp_content.strip()
    if isinstance(resp_content, list):
        parts = []
        for part in resp_content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text", ""))
            elif isinstance(part, str):
                parts.append(part)
        return "\n".join(parts).strip()
    return str(resp_content).strip()


async def chat_with_retry(llm: ChatOpenAI, messages: list, attempts: int = 4) -> str:
    delay = 8.0
    last_err: Exception | None = None
    for _ in range(attempts):
        try:
            resp = await llm.ainvoke(messages)
            content = extract_text(resp.content)
            if content:
                return content
            last_err = RuntimeError("empty reply")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            wait = 30.0 if "429" in str(exc) or "rate limit" in str(exc).lower() else delay
            await asyncio.sleep(wait)
            delay = min(delay * 2, 30.0)
            continue
        await asyncio.sleep(1.0)
    raise RuntimeError(f"candidate LLM failed after {attempts} attempts: {last_err}")


def format_history(messages: list, keep: int = 8, char_cap: int = 600) -> str:
    lines = []
    for m in messages[-keep:]:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if len(content) > char_cap:
            content = content[:char_cap] + "…"
        if role == "user":
            lines.append(f"我（候选人）：{content}")
        else:
            label = INTERVIEWER_CN.get(m.get("name") or "", m.get("name") or "面试官")
            lines.append(f"面试官（{label}）：{content}")
    return "\n".join(lines) if lines else "（还没有对话）"


async def candidate_reply(llm: ChatOpenAI, sc: dict, messages: list, latest_question: str) -> str:
    sys_text = CANDIDATE_PROMPT.format(
        persona=sc["persona"],
        resume=sc["resume_text"],
        language_rule=sc["language_rule"],
    )
    user_text = (
        f"【最近对话】\n{format_history(messages)}\n\n"
        f"【面试官最新发言】\n{latest_question}\n\n"
        f"请以候选人身份输出你的回答。"
    )
    return await chat_with_retry(
        llm, [SystemMessage(content=sys_text), HumanMessage(content=user_text)]
    )


def last_assistant_content(state: dict) -> str:
    for m in reversed(state.get("messages") or []):
        if m.get("role") == "assistant" and (m.get("content") or "").strip():
            return m["content"].strip()
    return "请先做一个简单的自我介绍，重点聊聊你的技术栈和项目经历。"


def save_meta(out_dir: Path, meta: dict) -> None:
    with open(out_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2, default=str)


def save_transcript(out_dir: Path, transcript: dict) -> None:
    with open(out_dir / "transcript.json", "w", encoding="utf-8") as f:
        json.dump(transcript, f, ensure_ascii=False, indent=2, default=str)
    md = session_manager.render_transcript_markdown(transcript)
    with open(out_dir / "transcript.md", "w", encoding="utf-8") as f:
        f.write(md)


async def run_scenario(sc: dict, llm: ChatOpenAI, suffix: str, max_answers: int, attempt: int) -> bool:
    started = time.time()
    out_dir = scenario_out_dir(sc, suffix)
    meta = {
        "scenario_id": sc["id"],
        "slug": sc["slug"],
        "interview_type": sc["interview_type"],
        "industry": sc["industry"],
        "job_role": sc["job_role"],
        "seniority": sc["seniority"],
        "difficulty": sc["difficulty"],
        "style": sc["style"],
        "language": sc["language"],
        "max_answers": max_answers,
        "persona": sc["persona"],
        "session_id": None,
        "answers": 0,
        "status": "running",
        "attempt": attempt,
        "elapsed_seconds": None,
        "suspected_mock": [],
        "error": None,
    }
    save_meta(out_dir, meta)
    sid: str | None = None
    try:
        state = await session_manager.create_session(
            resume_text=sc["resume_text"],
            jd_text=sc["jd_text"],
            interview_type=sc["interview_type"],
            industry=sc["industry"],
            job_role=sc["job_role"],
            seniority=sc["seniority"],
            difficulty=sc["difficulty"],
            style=sc["style"],
            language=sc["language"],
            tech_rounds_target=sc.get("tech_rounds_target", 2),
            max_rounds=sc.get("max_rounds", 10),
        )
        sid = state["session_id"]
        meta["session_id"] = sid

        await session_manager.start_session(sid)
        log(f"[{sc['id']}] 会话已启动 ({sid[:8]})")

        answers = 0
        while answers < max_answers:
            st = session_manager.get_session(sid)
            if not st:
                raise RuntimeError(f"session {sid} lost from cache")
            if st.get("status") in ("finished", "paused"):
                break
            question = last_assistant_content(st)
            reply = await candidate_reply(llm, sc, st.get("messages") or [], question)
            await asyncio.sleep(2.5)  # 轮间限速，降低 429 概率
            st = await session_manager.submit_candidate_answer(sid, reply)
            answers += 1
            meta["answers"] = answers
            log(
                f"[{sc['id']}] 第{answers}轮回答完成 stage={st.get('stage')} "
                f"interviewer={st.get('current_interviewer')}"
            )

        st = session_manager.get_session(sid) or {}
        report = session_manager.get_report(sid)
        if not report:
            report = await session_manager.finish_and_evaluate(sid)

        transcript = await session_manager.get_transcript(sid)
        full_text = json.dumps(transcript, ensure_ascii=False, default=str)
        meta.update({
            "status": "ok",
            "elapsed_seconds": round(time.time() - started, 1),
            "suspected_mock": [s for s in MOCK_SIGNATURES if s in full_text],
        })
        save_meta(out_dir, meta)
        save_transcript(out_dir, transcript)
        log(
            f"[{sc['id']}] 完成：{meta['answers']}轮回答，用时{meta['elapsed_seconds']}s"
            + (f"，疑似mock污染: {meta['suspected_mock']}" if meta["suspected_mock"] else "")
        )
        return True
    except Exception as exc:  # noqa: BLE001
        meta.update({
            "status": "failed",
            "elapsed_seconds": round(time.time() - started, 1),
            "error": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc(),
        })
        save_meta(out_dir, meta)
        log(f"[{sc['id']}] 失败: {meta['error']}")
        # 尽力保存已有对话片段，便于排查
        if sid:
            try:
                st = session_manager.get_session(sid) or {}
                with open(out_dir / "partial.json", "w", encoding="utf-8") as f:
                    json.dump({"messages": st.get("messages"), "logs": st.get("evaluation_logs")},
                              f, ensure_ascii=False, indent=2, default=str)
            except Exception:  # noqa: BLE001
                pass
        return False


async def main() -> None:
    parser = argparse.ArgumentParser(description="批量模拟面试")
    parser.add_argument("--only", default="", help="逗号分隔的场景ID，如 S1,S2")
    parser.add_argument("--jobs", type=int, default=1, help="并发数（默认1，串行更稳）")
    parser.add_argument("--max-answers", type=int, default=11,
                        help="每场候选人回答上限（10轮正式问答+自我介绍+反问收尾）")
    parser.add_argument("--suffix", default="", help="输出子目录名（如 rerun）")
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001
        pass

    await init_db()
    patch_llm_service()
    # 降低并发写 SQLite 的锁冲突概率
    try:
        async with engine.begin() as conn:
            await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
            await conn.exec_driver_sql("PRAGMA busy_timeout=5000")
    except Exception as exc:  # noqa: BLE001
        log(f"WAL 设置失败（不影响运行）: {exc}")

    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
        temperature=0.8,
        timeout=120,
        max_retries=0,
    )
    log(f"候选人 LLM: model={settings.LLM_MODEL} base_url={settings.LLM_BASE_URL}")

    only = {x.strip().upper() for x in args.only.split(",") if x.strip()}
    scenarios = [s for s in SCENARIOS if not only or s["id"] in only]
    if not scenarios:
        log("没有匹配的场景")
        return

    sem = asyncio.Semaphore(max(1, args.jobs))

    async def worker(sc: dict) -> bool:
        async with sem:
            ok = await run_scenario(sc, llm, args.suffix, args.max_answers, attempt=1)
            if not ok:
                log(f"[{sc['id']}] 5秒后重试一次…")
                await asyncio.sleep(5)
                ok = await run_scenario(sc, llm, args.suffix, args.max_answers, attempt=2)
            return ok

    log(f"开始模拟 {len(scenarios)} 场面试（并发 {args.jobs}）: {[s['id'] for s in scenarios]}")
    results = await asyncio.gather(*[worker(s) for s in scenarios])
    log(f"全部结束：成功 {sum(results)}/{len(results)}")


if __name__ == "__main__":
    asyncio.run(main())
