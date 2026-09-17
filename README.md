# Interview-Copilot 智能多 Agent 模拟面试系统

> 让面试准备从“被动刷题”转变为“全真模拟训练与数据反馈闭环”。基于 **LangGraph** 有向无环图状态机打造的多面试官协同系统，涵盖主考官、专业技术专家、HR/STAR行为面试官、压力挑战官与静默影子观察员，全生命周期提供深度复盘与黄金优化示范。

---

## 🌟 核心特色 (Core Features)

1. **多 Agent 协同面试团 (Multi-Agent Committee)**:
   - **主考官 / 协调主持 (Orchestrator)**: 把控破冰、自我介绍、技术考察、HR沟通、反问与收尾的全场节奏。
   - **专业技术面试官 (Technical Specialist)**: 紧扣候选人简历核心项目，围绕高并发、架构设计、底层原理层层深挖。
   - **HR / 行为面试官 (Behavioral & STAR)**: 依据情境 (Situation)、任务 (Task)、行动 (Action)、结果 (Result) 考察软实力与团队协作。
   - **压力/挑战面试官 (Challenger)**: 模拟极端故障、预算砍半、容灾失效等高压场景，测试应变力。
   - **影子观察员 (Shadow Evaluator)**: 后台全程静默监听，实时提取亮点、失分点与量化得分，不干扰对话。

2. **面试生命周期全流程覆盖**:
   - **面试前**: 简历智能解析 + 目标岗位 JD 意图对齐 + 职级与风格定制（校招/社招/专家；温和/严谨/高压）。
   - **面试中**: 多 Agent 动态交替发问、💡 求助提示 (Lifeline)、阶段流转指示与计时。
   - **面试后**: 六维能力雷达图（深度/广度/表达/STAR/抗压/匹配度）+ 逐题复盘 + **“优化示范回答 (Before vs After)”** + 针对性技能提升计划。

3. **双模式自适应与高扩展性**:
   - **Zero-Config 本地测试模式**: 无需配置 API Key 即可一键体验完整的智能多 Agent 模拟面试。
   - **主流模型无缝接入**: 兼容 OpenAI (GPT-4o)、DeepSeek (V3/R1)、Qwen (通义千问)、Moonshot、Ollama 等任意 OpenAI-compatible 模型。

---

## 🛠️ 技术架构 (Architecture Blueprint)

- **前端**: React 19 + TypeScript + Tailwind CSS v4 + Recharts + Lucide Icons + Vite
- **后端**: FastAPI (Python 3.11+) + LangGraph + LangChain + Pydantic v2
- **通信协议**: REST API + WebSocket 低延迟双工流
- **状态管理**: 基于 LangGraph 的有向状态图与状态不可变累计契约 (`InterviewState`)

---

## 🚀 快速启动 (Quick Start)

### 1. 启动后端 (Backend)

```bash
cd backend

# 创建并激活虚拟环境 (可选)
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# (可选) 配置你的大模型 API 密钥，复制 .env.example
copy .env.example .env
# 编辑 .env 文件填入 LLM_API_KEY，如不填将自动启动内置智能 Mock 演示

# 启动后端服务 (端口 8000)
uvicorn app.main:app --reload --port 8000
```

运行后端自动化测试套件：
```bash
pytest -v
```

### 2. 启动前端 (Frontend)

在另一个终端中：
```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器 (端口 5173)
npm run dev
```

打开浏览器访问 [http://localhost:5173](http://localhost:5173) 即可开启模拟面试。

### 3. Docker Compose 一键启动

```bash
docker-compose up --build
```

---

## 📁 目录结构 (Repository Structure)

```text
Interview-Copilot/
├── backend/
│   ├── app/
│   │   ├── agents/             # LangGraph 状态机与 Agent 核心实现
│   │   │   ├── state.py        # InterviewState 契约定义
│   │   │   ├── prompts.py      # 各面试官角色 Prompt 与评估模板
│   │   │   ├── orchestrator.py # 主持/协调 Agent
│   │   │   ├── technical.py    # 技术专家 Agent
│   │   │   ├── hr.py           # 行为/STAR Agent
│   │   │   ├── challenger.py   # 压力/挑战 Agent
│   │   │   ├── observer.py     # 影子观察员 Agent
│   │   │   ├── evaluator.py    # 复盘报告生成与润色引擎
│   │   │   ├── llm.py          # 兼容任意 OpenAI-compatible 模型的调用器
│   │   │   └── graph.py        # LangGraph 状态图与条件流转逻辑
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── interviews.py # 面试会话管理与问答接口
│   │   │   │   └── profiles.py   # 简历与 JD 智能解析接口
│   │   │   └── ws/
│   │   │       └── interview_stream.py # 实时 WebSocket 交互网关
│   │   ├── core/
│   │   │   └── config.py       # Pydantic Settings 配置管理
│   │   ├── services/
│   │   │   ├── parser.py       # 简历与 JD 解析服务
│   │   │   └── session_manager.py # 会话与 LangGraph 运行时生命周期
│   │   └── main.py             # FastAPI 入口
│   ├── tests/                  # 自动化测试用例
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx      # 顶部进度导航与计时器
│   │   │   ├── InterviewerPanel.tsx # AI 面试官席位卡片组件
│   │   │   ├── SetupView.tsx   # 场景准备与个性化配置页
│   │   │   ├── InterviewRoom.tsx # 实时问答房间与求助提示
│   │   │   └── ReportView.tsx  # 六维雷达图与逐题优化复盘报告
│   │   ├── types.ts            # 前端数据契约与接口定义
│   │   ├── App.tsx             # 视图路由调度
│   │   └── index.css           # Tailwind 主题样式
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml          # 一键容器化编排
└── README.md
```

---

## 🎯 后续演进计划 (Roadmap)

- [x] **Phase 1: 核心多 Agent 协同与文本闭环 MVP** (已完成)
- [ ] **Phase 2: 低延迟语音双工流与 Monaco 在线协同代码沙箱 (STT/TTS/VAD)**
- [ ] **Phase 3: 企业级专有真题库 RAG、长上下文滑动记忆压缩与防作弊护栏**
- [ ] **Phase 4: 多场次能力演化看板 (Growth Dashboard) 与一键 PDF 导出**
