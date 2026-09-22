"""
按面试官逐一模拟：对每一位面试官（自建人设 + 系统内置预设 + 系统默认基础面试官）
单独跑 N 场面试，每场为「一位面试官 + orchestrator 主持 + LLM 候选人」，≥10 轮正式问答。

用法（必须在 backend 目录下运行）：
    .venv/Scripts/python scripts/simulate_per_interviewer.py --iteration v1            # 全部 15 面试官 × 3 场
    .venv/Scripts/python scripts/simulate_per_interviewer.py --iteration v1 --only persona_posttrain
    .venv/Scripts/python scripts/simulate_per_interviewer.py --iteration v2 --jobs 3

产物：simulation_output/<iteration>/<interviewer_id>/run<k>/transcript.{json,md} + meta.json
数据库：simulation_output/<iteration>/simulation.db（隔离；自建人设每轮启动时从真实库同步快照）
"""
import argparse
import asyncio
import json
import os
import sqlite3
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REAL_DB = BACKEND_DIR / "interview_copilot.db"
OUTPUT_DIR = BACKEND_DIR / "simulation_output"
sys.path.insert(0, str(BACKEND_DIR))


def _setup_env(iteration: str) -> None:
    # 必须在 import app.* 之前执行（config 在类定义时读取环境变量）
    (OUTPUT_DIR / iteration).mkdir(parents=True, exist_ok=True)
    db_path = OUTPUT_DIR / iteration / "simulation.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    # 本机代理可能未运行，强制直连避免静默 mock 降级
    os.environ["NO_PROXY"] = "*"
    os.environ["no_proxy"] = "*"


# --iteration 必须在 import app 之前生效（决定隔离数据库路径），故从 argv 预读
_iter = "v1"
if "--iteration" in sys.argv:
    _iter = sys.argv[sys.argv.index("--iteration") + 1]
ITERATION = _iter
_setup_env(ITERATION)

from langchain_core.messages import HumanMessage, SystemMessage  # noqa: E402
from langchain_openai import ChatOpenAI  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.models.db import engine, init_db  # noqa: E402
from app.services.session_manager import session_manager  # noqa: E402
from app.agents.llm import llm_service  # noqa: E402


async def strict_invoke(self, messages, llm_config=None):
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
            wait = 30.0 if "429" in str(exc) or "rate limit" in str(exc).lower() else delay
            print(f"  [llm retry] {type(exc).__name__}: {str(exc)[:120]} -> {wait}s", flush=True)
            await asyncio.sleep(wait)
            delay = min(delay * 2, 30.0)
    raise RuntimeError(f"live LLM call failed after retries: {last_err}")


def patch_llm_service() -> None:
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
6. 全程使用中文回答。
"""


# ---------------------------------------------------------------------------
# 候选人画像库：L* = 大模型/算法域，B* = 后端/管理域（B 系多数沿用历史场景 S1-S10）
# ---------------------------------------------------------------------------
CANDIDATES: dict[str, dict] = {
    # ---- LLM 域 ----
    "L1": {
        "persona": "陈默，30岁，硕士，4年NLP研发、近2年大模型后训练。真实跑通过7B客服模型的SFT+DPO全流程：能给出具体数字（SFT数据8万条、标注Kappa 0.83、RM准确率、KL系数调节经历），踩过reward hacking和数据泄漏的坑。表达实在但组织略跳跃，回答4-6句。",
        "resume_text": "陈默，硕士，4年NLP研发经验，近两年在一家大模型公司负责后训练。\n核心技能：PyTorch、DeepSpeed、TRL、vLLM、LoRA全参微调、SFT/RM/DPO/PPO。\n项目经历：\n1. 客服领域7B模型后训练：构造8万条SFT数据（标注一致性Kappa 0.83），DPO对齐后人工好评率从61%提升到78%。\n2. Reward模型训练与迭代：负责偏好数据标准制定，RM在测试集准确率71%，发现并修复过评测集混入训练集的问题。\n3. 训练稳定性：处理过KL爆炸导致的reward hacking，通过参考模型权重与KL系数调整恢复。\n自我评价：动手多、踩坑多，习惯用数据说话。",
        "jd_text": "大模型后训练算法工程师\n职责：负责对话模型的SFT/RM/RLHF全链路训练与效果迭代。\n要求：1. 有完整的后训练项目实战经验；2. 对数据构造、评测与训练稳定性有深入理解；3. 良好的归因与复盘习惯。",
    },
    "L2": {
        "persona": "高远，28岁，3年后端转LLM应用。术语非常熟练（ReAct、Multi-Agent、MCP、RAG、CoT张口就来），爱说『我们采用了业界领先的方案』，但项目多为demo级：被追问具体实现、失败率、成本数字时会用更多术语绕圈子掩饰，偶尔答非所问。回答偏长，爱堆术语。",
        "resume_text": "高远，本科，3年后端开发经验，近一年半专注大模型应用。\n核心技能：LangChain、LangGraph、RAG、Function Calling、Multi-Agent、MCP、向量数据库。\n项目经历：\n1. 企业智能问答Agent：基于ReAct架构，接入10+工具，效果领先。\n2. 多智能体协作平台：采用业界领先的多Agent编排范式，支持复杂任务自动拆解。\n3. 知识库RAG系统：自研混合检索与重排方案，显著提升准确率。\n自我评价：对Agent技术生态有全景式了解，技术视野前沿。",
        "jd_text": "Agent应用开发专家\n职责：负责企业级Agent系统的架构设计与生产落地，对任务完成率与成本负责。\n要求：1. 有生产级Agent系统落地经验；2. 对工具调用、失败恢复、评测有系统性方法论；3. 能独立主导方案评审。",
    },
    "L3": {
        "persona": "苏晴，24岁，应届硕士，求职大模型应用岗。面试会紧张：回答简短（1-3句），经常答不完整；只做过一个RAG课程项目和LangChain小demo，原理层基本没接触，不会的会紧张地直说『这个我确实没学过』，但态度诚恳，会努力往自己会的东西上靠。偶尔有『嗯』『那个』等语气词。",
        "resume_text": "苏晴，2026届硕士应届毕业生，计算机技术专业，求职大模型应用开发岗。\n技能：Python、LangChain、向量检索基础、Prompt工程入门。\n项目经历：\n1. 毕业课题：基于RAG的校园政策问答助手，实现基础检索问答流程。\n2. 课程项目：用LangChain做过一个调用天气与日历API的小助手。\n其他：熟悉Git，了解Docker基本使用。\n自我评价：学习热情高，希望从应用开发做起。",
        "jd_text": "大模型应用开发工程师（校招/初级）\n职责：参与LLM应用的功能开发与效果调优，在导师指导下成长。\n要求：1. 扎实的Python基础；2. 了解LLM API与RAG基本概念，有课程项目或实习经历；3. 学习能力强，沟通顺畅。",
    },
    "L4": {
        "persona": "韩磊，33岁，8年基础架构研发，近3年专注大模型推理平台。真实数据信手拈来：vLLM吞吐、P99延迟、GPU利用率、量化前后精度损失都有具体数字，对KV Cache、continuous batching、张量并行的取舍有实战判断。回答干脆，先给结论再给依据，4-6句。",
        "resume_text": "韩磊，本科，8年基础架构经验，近3年在一家AI公司负责大模型推理平台。\n核心技能：vLLM、SGLang、TensorRT-LLM、Kubernetes、GPU调度、模型量化（GPTQ/AWQ）、Prometheus。\n项目经历：\n1. 推理服务平台建设：基于vLLM支撑30+业务模型，P99首token延迟<800ms，GPU利用率从35%提到68%。\n2. 降本专项：AWQ量化+动态batching，单卡吞吐提升2.3倍，年省GPU成本数百万。\n3. 弹性调度：基于K8s+自研调度器实现训推混部，整体利用率提升15个百分点。\n自我评价：性能敏感，习惯用监控数据驱动优化。",
        "jd_text": "大模型平台开发专家\n职责：负责LLM推理/训练平台的架构设计与性能优化，对稳定性与成本负责。\n要求：1. 精通vLLM等推理框架与GPU调度；2. 有大规模推理服务优化实战；3. 对系统可观测性与自动化运维有实践。",
    },
    "L5": {
        "persona": "钱多多，26岁，2年Web前端转AI应用开发。只会调用OpenAI兼容API加调prompt，用的是封装好的SDK：不了解模型原理、部署和微调，被问到底层就说『这块是模型侧/平台侧负责的，我不太清楚』，但会把prompt调优的经验讲得很细。回答3-5句。",
        "resume_text": "钱多多，本科，2年前端开发经验，近一年转做AI应用开发。\n技能：JavaScript/TypeScript、React、OpenAI API、Prompt调试、Dify低代码平台。\n项目经历：\n1. 智能客服前端+Prompt优化：负责对话界面与系统提示词迭代，用户满意度有提升。\n2. 内部AI周报助手：基于Dify搭建，调用GPT接口生成周报摘要。\n自我评价：上手快，对AI产品有热情。",
        "jd_text": "大模型应用开发工程师\n职责：负责LLM应用的功能开发、效果调优与工程化落地。\n要求：1. 熟悉主流LLM API与应用框架；2. 理解RAG、Function Calling等核心机制的原理；3. 有一定的工程化与成本意识。",
    },
    "L6": {
        "persona": "林一舟，29岁，硕士，3年推荐算法转LLM算法。跑通过完整的SFT和DPO流程，框架层面的知识比较扎实，但训练规模不大（最大13B），对训练稳定性、reward hacking、大规模分布式实战经验有限，被问到时会诚实说『这块我们踩的坑不多，我的理解是……』并给出理论推断。回答4-6句，条理清楚。",
        "resume_text": "林一舟，硕士，3年推荐算法经验，近一年转做LLM算法。\n核心技能：PyTorch、HuggingFace TRL、LoRA、DPO、DeepSpeed基础、评测集构建。\n项目经历：\n1. 领域小模型对齐：7B领域模型SFT+DPO，离线胜率提升12%。\n2. 评测集建设：从0搭建300条人工标注的领域评测集，制定打分标准。\n3. 数据清洗流水线：去重与质量过滤，把SFT数据从20万条精简到6万条。\n自我评价：基础扎实，转型坚决，补课速度快。",
        "jd_text": "大模型算法工程师（对齐方向）\n职责：参与对话模型的后训练与对齐算法迭代。\n要求：1. 有SFT/DPO等对齐算法实践经验；2. 对训练稳定性问题有排查思路；3. 重视评测与数据分析。",
    },
    "L7": {
        "persona": "方振，34岁，自称『从0到1主导』企业级Agent平台，实际只是核心团队一员：习惯把团队成果说成个人主导（『这个架构是我设计的』『这个指标是我带人做到的』），讲战略头头是道，但被追问具体技术决策细节、协作分工、失败教训时会含糊其辞或把功劳往前揽、责任往外推。回答5-7句，气场足。",
        "resume_text": "方振，硕士，9年研发经验，现任某互联网公司Agent平台负责人。\n核心技能：Agent架构设计、LLM编排、团队管理、技术规划。\n项目经历：\n1. 企业级Agent平台（从0到1主导）：覆盖20+业务线，任务完成率行业领先。\n2. 多智能体框架设计：主导自研编排框架，支撑日均千万次调用。\n3. 大模型中台建设：统一模型接入与评测体系。\n自我评价：战略清晰，执行力强，擅长跨部门推动。",
        "jd_text": "Agent平台技术负责人\n职责：负责Agent平台的架构演进与团队管理，对平台业务价值负责。\n要求：1. 有生产级Agent平台从0到1经验且能说清个人贡献；2. 技术判断力与落地能力兼备；3. 良好的协作与复盘文化。",
    },
    "L8": {
        "persona": "郑安，31岁，5年SRE，近1年参与LLM推理服务维护。K8s、监控告警、故障排查很扎实，但对模型推理优化（量化、KV Cache、batching策略）理解偏表面：能背出概念但说不清参数取舍，被深挖时会承认『这块我还在学』。回答4-5句，偏稳。",
        "resume_text": "郑安，本科，5年SRE经验，近一年在AI公司负责推理服务运维。\n核心技能：Kubernetes、Prometheus、Grafana、GPU监控、vLLM部署运维、CI/CD。\n项目经历：\n1. 推理服务稳定性保障：搭建GPU维度监控大盘，故障平均定位时间从40分钟降到12分钟。\n2. 推理集群运维：负责30卡GPU集群的部署与扩缩容，可用性99.9%。\n3. 成本看板：统计各业务GPU用量，推动两个低效服务下线。\n自我评价：稳定性意识强，正在向推理优化方向深入。",
        "jd_text": "LLM推理平台工程师\n职责：负责推理服务的部署、优化与稳定性建设。\n要求：1. 熟悉vLLM等推理框架的原理与调优；2. 扎实的K8s与监控体系经验；3. 对GPU资源利用率优化有实战。",
    },
    "L9": {
        "persona": "柳絮，30岁，2年NLP算法，做过SFT训练但从不做系统评测：被问效果就说『看了badcase，感觉还行』『领导说效果不错』，说不出任何量化指标；对数据质量的重要性认识不足（『数据差不多干净就行』），被质疑时会先辩解再勉强承认评测确实该做。回答3-5句。",
        "resume_text": "柳絮，硕士，2年NLP算法经验。\n核心技能：PyTorch、LoRA微调、SFT训练、HuggingFace生态。\n项目经历：\n1. 垂直领域对话模型：7B模型LoRA微调，上线后业务方反馈良好。\n2. 数据构造：从业务日志清洗出训练数据数万条。\n3. 模型迭代：按需求做过几轮增量训练。\n自我评价：训练流程熟练，交付速度快。",
        "jd_text": "大模型算法工程师\n职责：负责对话模型的后训练与效果迭代，对线上效果指标负责。\n要求：1. 扎实的SFT/RM实战经验；2. 重视评测体系建设，习惯用数据驱动迭代；3. 对数据质量有敬畏心。",
    },
    "L10": {
        "persona": "沈博，31岁，4年Agent系统研发，做过生产级代码Agent。工具调用成功率、失败恢复率、单次成本、P95延迟都有真实数字，能讲清架构取舍与踩坑（沙箱逃逸、幂等设计、降级链路），表达简洁直接，先给结论。回答4-6句。",
        "resume_text": "沈博，本科，4年Agent系统研发经验，负责过生产级代码Agent。\n核心技能：LangGraph、Function Calling/MCP、沙箱隔离、评测体系、Trace与可观测。\n项目经历：\n1. 生产级代码Agent：工具调用成功率92%，失败自动恢复率78%，单任务平均成本$0.11。\n2. 工具层治理：统一幂等与超时设计，工具类错误率下降60%。\n3. 评测流水线：300+真实任务回归集，每次发版自动跑分。\n自我评价：只关心任务完成率与成本，不信Demo。",
        "jd_text": "Agent算法专家\n职责：负责Agent系统的算法与架构设计，对任务完成率与鲁棒性负责。\n要求：1. 有生产级Agent系统经验；2. 对Planning、工具调用、失败恢复有深入理解；3. 重视评测与实验设计。",
    },
    # ---- 后端/管理域（B 系沿用历史场景人设） ----
    "B1": {
        "persona": "李明，32岁，4年Python后端。性格踏实但数据敏感度一般：项目流程讲得清楚，但从不主动给出量化指标，被追问具体数据时会说『具体数字记不太清了，大概提升了两三成吧』这类模糊说法。技术中等偏上。回答一般3-5句。",
        "resume_text": "李明，本科毕业于杭州电子科技大学计算机系，4年Python后端开发经验，现就职于一家中型电商公司。\n核心技能：Python、FastAPI、MySQL、Redis、RabbitMQ、Docker。\n项目经历：\n1. 电商订单履约系统重构：负责订单拆单与状态机模块的改造，支撑日均百万级订单。\n2. 营销活动系统：设计优惠券发放与核销链路，大促期间运行稳定。\n3. 内部报表平台：将核心报表查询接入只读从库并增加缓存，查询速度提升了很多。\n自我评价：踏实肯干，乐于分享，对高并发场景有一定实战经验。",
        "jd_text": "资深后端开发工程师（电商方向）\n职责：负责交易核心链路的设计与迭代，参与大促稳定性保障。\n要求：\n1. 3年以上Python/Java后端经验，熟悉MySQL、Redis、消息队列；\n2. 有高并发、高可用系统设计经验，能独立负责核心模块；\n3. 具备良好的沟通能力与问题排查能力。",
    },
    "B2": {
        "persona": "王强，29岁，5年NLP/大模型应用研发。概念和术语非常熟练（RAG、LoRA、Agent、幻觉抑制等张口就来），但对底层原理理解不深：被追问数学原理、检索细节、分布式训练等底层问题时会开始用更多术语绕圈子掩饰，偶尔答非所问。回答偏长，爱堆术语。",
        "resume_text": "王强，硕士毕业于华中科技大学，5年NLP相关研发经验，近两年专注大模型应用落地。\n核心技能：Python、PyTorch、LangChain、向量数据库（Milvus）、Prompt工程、模型微调（LoRA）。\n项目经历：\n1. 企业知识库问答系统：基于RAG架构搭建，覆盖公司10w+文档，支持多轮对话。\n2. 智能客服工单摘要：微调开源7B模型用于工单自动摘要与分类。\n3. Agent工作流平台：编排多个工具调用节点，支持插件扩展。\n自我评价：对大模型技术生态有全景式了解，学习能力强。",
        "jd_text": "大模型应用算法专家（Agent方向）\n职责：负责RAG与Agent系统的架构设计与效果优化，推进大模型能力在业务场景落地。\n要求：\n1. 精通RAG关键链路：切片、嵌入、检索、重排、生成评估；\n2. 深入理解Transformer原理与主流开源模型，有微调与部署实战；\n3. 有复杂Agent系统设计经验，能主导技术方案评审。",
    },
    "B3": {
        "persona": "赵磊，30岁，6年Java后端，企业信息系统背景。计算机基础扎实（MySQL、Redis、网络都知道），但项目多为常规CRUD业务系统，没有真正的高并发经验：被问大流量场景时会诚实地讲自己的理解或理论方案，并承认『我们那个量级没遇到过』。回答平实，4-6句。",
        "resume_text": "赵磊，本科，6年Java后端开发经验，曾在两家软件公司从事企业信息系统研发。\n核心技能：Java、Spring Boot、MySQL、MyBatis、Redis、Vue基础。\n项目经历：\n1. ERP进销存系统：负责采购、库存模块的接口开发与维护。\n2. 物业管理SaaS：实现缴费、报修工单流程，参与数据库表结构设计。\n3. 公司内部OA系统：开发审批流引擎的表单配置功能。\n自我评价：编码习惯良好，熟悉业务系统开发全流程。",
        "jd_text": "资深后端开发工程师\n职责：负责企业级业务系统的服务端开发与性能优化。\n要求：\n1. 扎实的Java基础与常用框架使用经验；\n2. 熟悉MySQL索引与事务、Redis常见使用场景；\n3. 了解高并发系统的基本设计思路，有排查线上问题的经验。",
    },
    "B4": {
        "persona": "陈晓，22岁，应届本科生，求职游戏客户端岗。面试会紧张：回答简短（1-3句），经常答不完整；基础题一半会一半不会，不会的会紧张地直说『这个……我还没学过，不太清楚』，但态度诚恳，会努力往自己会的东西上靠。说话偶尔有『嗯』『那个』等语气词。",
        "resume_text": "陈晓，2026届本科应届毕业生，就读于重庆邮电大学数字媒体技术专业，求职游戏客户端开发岗位。\n技能：Unity引擎（做过两个课程项目）、C#、C++基础、常见数据结构。\n项目经历：\n1. Unity 2D横版闯关小游戏：实现角色移动、战斗与存档系统，获课程设计二等奖。\n2. 毕业设计：基于Unity的射击游戏Demo，实现简单AI敌人行为。\n其他：参加过学校游戏社团，掌握基础的版本管理（Git）。\n自我评价：对游戏研发有热情，愿意从头学起。",
        "jd_text": "游戏客户端开发工程师（校招）\n职责：参与手游客户端功能开发与玩法实现。\n要求：\n1. 熟悉Unity/C#或Unreal/C++，具备良好的数据结构基础；\n2. 对游戏玩法与技术实现有热情，学习能力强的应届生亦可；\n3. 良好的团队协作意识。",
    },
    "B5": {
        "persona": "郑浩，33岁，8年高并发架构经验，自信甚至有点自负：坚信自己的方案是对的，被挑战时会据理力争、语气偶尔变冲（『这个场景我在线上真实跑过』），承认错误慢，但如果对方给出确实站得住的理由会不情不愿地松口。回答有干货但带优越感。",
        "resume_text": "郑浩，本科，8年后端架构经验，现任某互联网公司架构组负责人。\n技能：Java、Kubernetes、Kafka、Redis、分布式事务、压测调优。\n经历：\n1. 秒级毫推送货的实时数据管道：主导Kafka集群扩容与分区调优。\n2. 统一支付网关：设计多渠道异步对账架构，主导双十一全链路压测。\n3. 服务网格落地：推动Istio灰度发布方案在核心业务上线。\n自我评价：对技术方案有强烈的判断力与执行魄力。",
        "jd_text": "高并发架构师\n职责：负责核心交易链路架构设计与大促稳定性建设。\n要求：\n1. 精通分布式系统设计，有十万级QPS场景实战经验；\n2. 对方案取舍有清晰的方法论，能承受技术决策压力；\n3. 具备跨团队技术推动能力。",
    },
    "B6": {
        "persona": "孙悦，27岁，3年金融科技后端，两年内换过两份工作。回答行为类问题偏模板化（『和团队沟通』『换位思考』），离职原因只会说『寻求更好的发展空间』，被追问时会继续用笼统说法回避；讲项目时倾向用『我们』代替『我』，追问个人具体贡献时才挤出一些细节。",
        "resume_text": "孙悦，本科毕业于武汉大学软件工程，3年后端开发经验，主要在金融科技领域。\n技能：Java、Spring Cloud、MySQL、Kafka、Redis。\n经历：\n1. 某消费金融公司（1年半）：参与信贷审批系统的规则引擎模块开发。\n2. 某证券信息技术部（1年半）：负责行情数据推送服务的优化迭代。\n自我评价：适应能力强，希望寻找更有发展空间的平台。",
        "jd_text": "量化系统研发工程师\n职责：参与交易与风控系统的服务端研发，保障低延迟与稳定运行。\n要求：\n1. 3年以上Java/C++后端经验，熟悉多线程与网络编程；\n2. 对数据敏感，具备良好的稳定性与抗压能力；\n3. 认同长期主义，希望在金融科技领域持续深耕。",
    },
    "B7": {
        "persona": "周凯，35岁，8年研发、带过15人团队。经验真实丰富、案例多，但表达啰嗦爱绕圈子：一个故事从背景讲起很细（5-8句），重点出现得慢，被追问时能给出扎实细节。管理动作描述真实（一对一沟通、绩效面谈、招人翻车经历等）。",
        "resume_text": "周凯，硕士，8年研发经验，目前在一家互联网医疗公司担任技术负责人，带15人团队（含5名前端、8名后端、2名测试）。\n技能：Java技术栈、微服务架构、团队管理。\n经历：\n1. 互联网医院平台：从0到1组建研发团队，负责预约挂号、在线问诊两条业务线。\n2. 医药B2B供应链系统：主导微服务拆分与研发流程规范化建设，建立了双周迭代与代码评审机制。\n自我评价：注重团队梯队培养，擅长跨部门协调与向上管理。",
        "jd_text": "技术负责人 Tech Lead\n职责：带领10-15人研发团队，负责产品技术架构与交付质量，参与技术规划。\n要求：\n1. 5年以上研发经验、2年以上团队管理经验；\n2. 具备梯队建设、绩效管理与跨部门协同的实战经验；\n3. 能在业务压力与工程质量之间做出合理权衡。",
    },
    "B8": {
        "persona": "吴迪，38岁，架构师转管理2年，现在管30人。管理方法论偏书本：爱说OKR、金字塔原理、赋能、抓手这类词，但被追问『具体怎么做的』时给出的动作偏理论、案例较单薄（只有一两个模糊的小例子）。技术背景扎实。",
        "resume_text": "吴迪，硕士，12年技术经验，前6年专注分布式架构，近2年担任技术总监，管理30人左右的技术团队。\n技能：技术战略规划、OKR管理、架构治理、云原生。\n经历：\n1. SaaS CRM产品线：制定平台多租户架构演进路线，推动核心模块服务化改造。\n2. 研发效能建设：引入OKR与研发度量体系，规划CI/CD流水线标准化。\n自我评价：擅长将管理方法论落地为工程实践。",
        "jd_text": "技术总监 VP（企业服务方向）\n职责：统筹30+人研发团队，制定年度技术规划，对产品交付质量与团队效能负责。\n要求：\n1. 10年以上技术经验、3年以上大型团队管理经验；\n2. 具备技术战略规划、跨部门资源协调与技术债务治理经验；\n3. 有SaaS行业背景者优先。",
    },
    "B9": {
        "persona": "钱进，35岁，9年架构经验。回答四平八稳、全面但平淡：每个问题都能答到几个点，但几乎不给出具体数字和案例细节，不主动深挖，也不会说错什么。2-5句，条理清楚但缺少亮点。",
        "resume_text": "钱进，本科，9年后端与架构经验，现于一家工业软件公司担任系统架构师。\n技能：Java、Go、MySQL、Redis、MQTT、Kubernetes、时序数据库。\n经历：\n1. 工业设备数据采集平台：设计设备接入与数据入库链路，日均处理亿级点位数据。\n2. MES制造执行系统：负责架构评审与核心排产模块设计。\n3. 边缘计算网关：制定边缘节点与云端的数据同步方案。\n自我评价：技术栈全面，做事稳健，注重方案可落地性。",
        "jd_text": "系统架构师（智能制造方向）\n职责：负责工业互联网平台整体架构设计与技术选型。\n要求：\n1. 8年以上后端经验，精通分布式架构与高吞吐数据链路设计；\n2. 熟悉时序数据库、消息队列与边缘计算场景；\n3. 能主导跨团队技术方案评审。",
    },
}

LLM_JD_POSTTRAIN = CANDIDATES["L1"]["jd_text"]
LLM_JD_AGENT_ALGO = CANDIDATES["L10"]["jd_text"]
LLM_JD_PLATFORM = CANDIDATES["L4"]["jd_text"]
LLM_JD_AGENT_APP = CANDIDATES["L2"]["jd_text"]
LLM_JD_INFER = CANDIDATES["L8"]["jd_text"]
LLM_JD_ALGO = CANDIDATES["L6"]["jd_text"]
LLM_JD_JUNIOR = CANDIDATES["L3"]["jd_text"]
LLM_JD_LEAD = CANDIDATES["L7"]["jd_text"]

# ---------------------------------------------------------------------------
# 面试官注册表：kind = persona（自建，DB）| preset（内置预设）| base（系统默认基础面试官）
# 每个 interviewer 固定 3 场：run1/run2/run3 各用一个候选人画像与差异化难度/风格
# ---------------------------------------------------------------------------
def _c(cid: str, jd: str | None = None, seniority: str | None = None,
       difficulty: str | None = None, style: str | None = None) -> dict:
    base = CANDIDATES[cid]
    return {
        "candidate_id": cid,
        "persona": base["persona"],
        "resume_text": base["resume_text"],
        "jd_text": jd or base["jd_text"],
        "seniority": seniority or "senior",
        "difficulty": difficulty or "standard",
        "style": style or "rigorous",
    }


POSTTRAIN_ID = "24bd2d9b-065c-4b30-8d83-bf56105ccac2"
AGENT_APP_ID = "73fbf0ac-63ce-40f7-9f0e-3c07c4695ac1"
AGENT_ALGO_ID = "17e943c1-8b2a-4172-9c52-1276cc657bbd"
RLHF_ID = "2d7e770f-915c-4bce-bbd8-ef3b1c8f8907"
PLATFORM_ID = "6b7843f2-5466-4e1b-a264-16835a18b7ab"
DIRECTOR_ID = "c89d4f54-d88e-4082-8bcb-bf9dd24d37a9"

INTERVIEWERS: list[dict] = [
    # ===== 自建人设 =====
    {
        "id": "persona_posttrain", "kind": "persona", "ref": POSTTRAIN_ID, "name": "大模型后训练专家",
        "domain": "大模型后训练（SFT/RLHF/DPO）", "industry": "人工智能/大模型", "job_role": "大模型后训练算法工程师",
        "runs": [
            _c("L1", LLM_JD_POSTTRAIN, "senior", "standard", "rigorous"),
            _c("L9", LLM_JD_POSTTRAIN, "senior", "standard", "rigorous"),
            _c("L6", LLM_JD_POSTTRAIN, "senior", "hard", "gentle"),
        ],
    },
    {
        "id": "persona_agent_app", "kind": "persona", "ref": AGENT_APP_ID, "name": "Agent应用专家",
        "domain": "Agent 应用工程化", "industry": "人工智能/大模型", "job_role": "Agent应用开发专家",
        "runs": [
            _c("L2", LLM_JD_AGENT_APP, "senior", "standard", "rigorous"),
            _c("L7", LLM_JD_LEAD, "senior", "standard", "rigorous"),
            _c("L3", LLM_JD_JUNIOR, "junior", "easy", "gentle"),
        ],
    },
    {
        "id": "persona_agent_algo", "kind": "persona", "ref": AGENT_ALGO_ID, "name": "大模型Agent算法专家",
        "domain": "Agent 算法（Planning/RL/评测）", "industry": "人工智能/大模型", "job_role": "Agent算法专家",
        "runs": [
            _c("L10", LLM_JD_AGENT_ALGO, "senior", "standard", "rigorous"),
            _c("L2", LLM_JD_AGENT_ALGO, "senior", "standard", "rigorous"),
            _c("L6", LLM_JD_AGENT_ALGO, "senior", "hard", "rigorous"),
        ],
    },
    {
        "id": "persona_rlhf", "kind": "persona", "ref": RLHF_ID, "name": "RLHF/对齐算法专家",
        "domain": "对齐算法（RM/DPO/PPO/GRPO）", "industry": "人工智能/大模型", "job_role": "对齐算法工程师",
        "runs": [
            _c("L1", LLM_JD_POSTTRAIN, "senior", "standard", "rigorous"),
            _c("L9", LLM_JD_POSTTRAIN, "senior", "standard", "stress"),
            _c("L6", LLM_JD_POSTTRAIN, "senior", "standard", "rigorous"),
        ],
    },
    {
        "id": "persona_platform", "kind": "persona", "ref": PLATFORM_ID, "name": "大模型平台开发专家",
        "domain": "LLM Infra 与平台工程", "industry": "人工智能/大模型", "job_role": "大模型平台开发专家",
        "runs": [
            _c("L4", LLM_JD_PLATFORM, "senior", "standard", "rigorous"),
            _c("L8", LLM_JD_INFER, "senior", "standard", "rigorous"),
            _c("L5", LLM_JD_PLATFORM, "junior", "easy", "gentle"),
        ],
    },
    {
        "id": "persona_director", "kind": "persona", "ref": DIRECTOR_ID, "name": "研发总监",
        "domain": "AI 项目规划/管理/ROI", "industry": "人工智能/大模型", "job_role": "AI研发负责人",
        "runs": [
            _c("L7", LLM_JD_LEAD, "expert", "standard", "rigorous"),
            _c("B7", "AI研发团队技术负责人：带领15人团队，负责大模型应用产品线的技术架构与交付。", "expert", "standard", "rigorous"),
            _c("L4", LLM_JD_PLATFORM, "senior", "hard", "rigorous"),
        ],
    },
    # ===== 系统内置流派预设 =====
    {
        "id": "preset_troubleshooter", "kind": "preset", "ref": "preset_troubleshooter", "name": "线上排障老炮·老赵",
        "domain": "线上故障排查/SRE", "industry": "互联网/电商", "job_role": "资深后端开发",
        "runs": [_c("B5"), _c("B3"), _c("B1")],
    },
    {
        "id": "preset_deep_source", "kind": "preset", "ref": "preset_deep_source", "name": "底层源码极客·张工",
        "domain": "底层原理/源码", "industry": "互联网/电商", "job_role": "资深后端开发",
        "runs": [_c("B2"), _c("B3"), _c("B9")],
    },
    {
        "id": "preset_business_roi", "kind": "preset", "ref": "preset_business_roi", "name": "业务ROI架构师·林总",
        "domain": "业务价值/架构权衡", "industry": "互联网/电商", "job_role": "资深后端开发",
        "runs": [_c("B7"), _c("B8"), _c("B1")],
    },
    {
        "id": "preset_anti_cheat", "kind": "preset", "ref": "preset_anti_cheat", "name": "防套路打假官·严老师",
        "domain": "反模板/真实性核验", "industry": "互联网/电商", "job_role": "资深后端开发",
        "runs": [_c("B2"), _c("B6"), _c("L7")],
    },
    # ===== 系统默认基础面试官 =====
    {
        "id": "base_technical", "kind": "base", "ref": "technical", "name": "技术面试官",
        "domain": "技术原理/系统设计", "industry": "互联网/电商", "job_role": "资深后端开发",
        "runs": [_c("B1"), _c("B2", difficulty="hard"), _c("B5", style="stress")],
    },
    {
        "id": "base_programmer", "kind": "base", "ref": "programmer", "name": "程序员面试官",
        "domain": "项目深挖/计算机基础/编码", "industry": "互联网/电商", "job_role": "资深后端开发",
        "runs": [_c("B3"), _c("B4", seniority="junior", difficulty="easy", style="gentle"), _c("B1")],
    },
    {
        "id": "base_hr", "kind": "base", "ref": "hr", "name": "HR面试官",
        "domain": "行为面/稳定性/动机", "industry": "通用行业", "job_role": "资深后端开发",
        "runs": [_c("B6", style="gentle"), _c("B7"), _c("B9")],
    },
    {
        "id": "base_management", "kind": "base", "ref": "management", "name": "管理面试官",
        "domain": "团队管理/技术领导力", "industry": "企业服务/SaaS", "job_role": "技术总监VP",
        "runs": [_c("B8", difficulty="hard"), _c("B7"), _c("B9", style="gentle")],
    },
    {
        "id": "base_challenger", "kind": "base", "ref": "challenger", "name": "压力挑战官",
        "domain": "压力质疑/方案挑刺", "industry": "互联网/电商", "job_role": "高并发架构师",
        "runs": [_c("B5", difficulty="hard", style="stress"), _c("B2", style="stress"), _c("B9")],
    },
]


def log(message: str, logfile: Path) -> None:
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {message}"
    print(line, flush=True)
    try:
        with open(logfile, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


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


async def candidate_reply(llm: ChatOpenAI, run_cfg: dict, messages: list, latest_question: str) -> str:
    sys_text = CANDIDATE_PROMPT.format(persona=run_cfg["persona"], resume=run_cfg["resume_text"])
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


def save_json(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


def seed_personas(iteration: str) -> int:
    """把真实库中的自建人设快照进本次迭代的隔离库（persona:<id> 解析依赖它）。"""
    real = sqlite3.connect(REAL_DB)
    real.row_factory = sqlite3.Row
    rows = [dict(r) for r in real.execute("SELECT * FROM interviewer_personas").fetchall()]
    real.close()
    sim_db_path = OUTPUT_DIR / iteration / "simulation.db"
    conn = sqlite3.connect(sim_db_path)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(interviewer_personas)").fetchall()]
    placeholders = ",".join("?" for _ in cols)
    conn.execute("DELETE FROM interviewer_personas")
    for r in rows:
        conn.execute(
            f"INSERT OR REPLACE INTO interviewer_personas ({','.join(cols)}) VALUES ({placeholders})",
            [r.get(c) for c in cols],
        )
    conn.commit()
    n_in_db = conn.execute("SELECT COUNT(*) FROM interviewer_personas").fetchone()[0]
    conn.close()
    if n_in_db != len(rows):
        raise RuntimeError(f"人设同步不完整：预期 {len(rows)}，库中 {n_in_db}")
    return len(rows)


async def run_session(iv: dict, run_idx: int, run_cfg: dict, llm: ChatOpenAI,
                      iteration: str, max_answers: int, logfile: Path) -> bool:
    started = time.time()
    out_dir = OUTPUT_DIR / iteration / iv["id"] / f"run{run_idx + 1}"
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "interviewer_id": iv["id"],
        "interviewer_name": iv["name"],
        "interviewer_kind": iv["kind"],
        "interviewer_ref": iv["ref"],
        "interviewer_domain": iv["domain"],
        "candidate_id": run_cfg["candidate_id"],
        "industry": iv["industry"],
        "job_role": iv["job_role"],
        "seniority": run_cfg["seniority"],
        "difficulty": run_cfg["difficulty"],
        "style": run_cfg["style"],
        "language": "zh",
        "max_answers": max_answers,
        "session_id": None,
        "answers": 0,
        "status": "running",
        "elapsed_seconds": None,
        "suspected_mock": [],
        "error": None,
    }
    save_json(out_dir / "meta.json", meta)
    sid: str | None = None
    try:
        state = await session_manager.create_session(
            resume_text=run_cfg["resume_text"],
            jd_text=run_cfg["jd_text"],
            interview_type="custom",
            industry=iv["industry"],
            job_role=iv["job_role"],
            seniority=run_cfg["seniority"],
            difficulty=run_cfg["difficulty"],
            style=run_cfg["style"],
            language="zh",
            custom_config={"selected_interviewers": [f"persona:{iv['ref']}"] if iv["kind"] == "persona" else [iv["ref"]]},
            max_rounds=12,
        )
        sid = state["session_id"]
        meta["session_id"] = sid
        save_json(out_dir / "meta.json", meta)

        await session_manager.start_session(sid)
        log(f"[{iv['id']}#run{run_idx + 1}] 会话已启动 ({sid[:8]})", logfile)

        answers = 0
        while answers < max_answers:
            st = session_manager.get_session(sid)
            if not st:
                raise RuntimeError(f"session {sid} lost from cache")
            if st.get("status") in ("finished", "paused"):
                break
            question = last_assistant_content(st)
            reply = await candidate_reply(llm, run_cfg, st.get("messages") or [], question)
            await asyncio.sleep(2.5)
            st = await session_manager.submit_candidate_answer(sid, reply)
            answers += 1
            meta["answers"] = answers
            log(
                f"[{iv['id']}#run{run_idx + 1}] 第{answers}轮回答 stage={st.get('stage')} "
                f"interviewer={st.get('current_interviewer')}", logfile
            )

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
        save_json(out_dir / "meta.json", meta)
        save_json(out_dir / "transcript.json", transcript)
        with open(out_dir / "transcript.md", "w", encoding="utf-8") as f:
            f.write(session_manager.render_transcript_markdown(transcript))
        log(
            f"[{iv['id']}#run{run_idx + 1}] 完成：{meta['answers']}轮，{meta['elapsed_seconds']}s"
            + (f"，疑似mock: {meta['suspected_mock']}" if meta["suspected_mock"] else ""), logfile
        )
        return True
    except Exception as exc:  # noqa: BLE001
        meta.update({
            "status": "failed",
            "elapsed_seconds": round(time.time() - started, 1),
            "error": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc(),
        })
        save_json(out_dir / "meta.json", meta)
        log(f"[{iv['id']}#run{run_idx + 1}] 失败: {meta['error']}", logfile)
        if sid:
            try:
                st = session_manager.get_session(sid) or {}
                save_json(out_dir / "partial.json",
                          {"messages": st.get("messages"), "logs": st.get("evaluation_logs")})
            except Exception:  # noqa: BLE001
                pass
        return False


async def main() -> None:
    global ITERATION
    parser = argparse.ArgumentParser(description="按面试官批量模拟")
    parser.add_argument("--iteration", default="v1", help="迭代轮次标识（输出子目录）")
    parser.add_argument("--only", default="", help="逗号分隔的 interviewer id")
    parser.add_argument("--jobs", type=int, default=2, help="并发数")
    parser.add_argument("--max-answers", type=int, default=13,
                        help="每场候选人回答上限（≥10轮正式问答+开场+反问收尾）")
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001
        pass

    logfile = OUTPUT_DIR / args.iteration / "run_log.txt"
    logfile.parent.mkdir(parents=True, exist_ok=True)

    await init_db()
    patch_llm_service()
    try:
        async with engine.begin() as conn:
            await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
            await conn.exec_driver_sql("PRAGMA busy_timeout=5000")
    except Exception as exc:  # noqa: BLE001
        log(f"WAL 设置失败（不影响运行）: {exc}", logfile)

    n = seed_personas(args.iteration)
    log(f"已同步 {n} 个自建人设快照到 {args.iteration}/simulation.db", logfile)

    # 启动前逐个验证 persona 引用可被会话解析，fail fast（避免整场静默回落成 technical）
    from app.agents.persona_node import is_persona_key
    for iv in INTERVIEWERS:
        if iv["kind"] != "persona":
            continue
        resolved = await session_manager._resolve_custom_config(
            {"selected_interviewers": [f"persona:{iv['ref']}"]}
        )
        lineup = resolved.get("selected_interviewers") or []
        if not lineup or not is_persona_key(lineup[0]):
            raise RuntimeError(
                f"persona 解析失败：{iv['id']} -> {lineup}（检查 simulation.db 人设快照）"
            )
    log("persona 引用解析校验通过", logfile)

    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
        temperature=0.8,
        timeout=120,
        max_retries=0,
    )
    log(f"候选人 LLM: model={settings.LLM_MODEL} base_url={settings.LLM_BASE_URL}", logfile)

    only = {x.strip() for x in args.only.split(",") if x.strip()}
    interviewers = [iv for iv in INTERVIEWERS if not only or iv["id"] in only]
    if not interviewers:
        log("没有匹配的面试官", logfile)
        return

    tasks: list[tuple[dict, int, dict]] = []
    for iv in interviewers:
        for run_idx, run_cfg in enumerate(iv["runs"]):
            tasks.append((iv, run_idx, run_cfg))

    sem = asyncio.Semaphore(max(1, args.jobs))

    async def worker(iv: dict, run_idx: int, run_cfg: dict) -> bool:
        async with sem:
            ok = await run_session(iv, run_idx, run_cfg, llm, args.iteration, args.max_answers, logfile)
            if not ok:
                log(f"[{iv['id']}#run{run_idx + 1}] 5秒后重试一次…", logfile)
                await asyncio.sleep(5)
                ok = await run_session(iv, run_idx, run_cfg, llm, args.iteration, args.max_answers, logfile)
            return ok

    total = len(tasks)
    log(f"开始模拟：{len(interviewers)} 位面试官 × 各 3 场 = {total} 场（并发 {args.jobs}）", logfile)
    results = await asyncio.gather(*[worker(*t) for t in tasks])
    log(f"全部结束：成功 {sum(results)}/{total}", logfile)


if __name__ == "__main__":
    asyncio.run(main())
