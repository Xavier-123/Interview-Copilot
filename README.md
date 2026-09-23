# Interview-Copilot

Interview-Copilot 是一个面向本地开发和个人训练的多 Agent 模拟面试系统。它把简历、目标岗位 JD、面试配置和多轮回答串成一条可复盘的训练流程：先生成针对性问题，再在面试过程中动态追问，最后输出评分、逐题复盘和训练计划。

> 当前项目定位为本地单用户应用。默认使用 SQLite 和本地文件目录，不包含登录、租户隔离或生产级部署配置。`SYSTEM_ARCHITECTURE.md` 中的部分内容属于后续架构设计，不代表全部已经落地。

## 当前能力

- **多 Agent 面试流程**：主持/编排、技术、程序员综合、HR/STAR、管理、压力挑战和静默观察员。
- **多种面试类型**：结构化全流程、技术深度面、程序员综合面、STAR 行为面、HR 综合面、管理岗面、英语面试和自选定制面。
- **动态追问**：支持固定轮次和自适应轮次；观察员根据回答质量、证据缺口和话题深度决定继续深挖、切换主题或结束面试。
- **简历与 JD 解析**：支持粘贴文本，或上传 PDF、DOCX、TXT、MD 文件，自动提取候选人画像和岗位要求。
- **面试配置**：行业、岗位、职级、难度、面试官风格、语言、出场阵容和题目轮次均可配置，也可以创建自定义面试官人设。
- **面试后复盘**：六维评分、优势与短板、逐题分析、优化示范回答、学习计划、7 天冲刺路线和专项训练卡片。
- **记录与对比**：保存历史场次、完整转录、Prompt 日志，支持 Markdown/JSON 导出和两场面试对比。
- **记忆与进化**：支持记忆授权、记忆查看/删除、面试官版本管理，以及候选版本回放、审批、实验和回滚接口。
- **联网搜索**：可选接入 Tavily；服务端使用 `TAVILY_API_KEY`，也可以在浏览器中配置仅用于当前浏览器的密钥。
- **面试日程**：登记真实面试、关联 JD 和简历、记录备忘，支持浏览器提醒和可选 SMTP 邮件提醒。
- **无 Key 体验**：未配置有效模型密钥时会回退到内置动态 Mock，便于先验证界面和流程。

## 工作流

~~~mermaid
flowchart LR
    A[简历 + JD + 面试配置] --> B[创建会话]
    B --> C[LangGraph 状态机]
    C --> D[面试官节点]
    D --> E[WebSocket 实时问答]
    E --> F[Observer 提取证据]
    F --> C
    C --> G[报告 / 转录 / Prompt 日志]
    G --> H[历史对比与训练计划]
~~~

面试中的自然语言输出经过 `speaker` 节点统一发送；观察、规划和评分不会直接抢占对话。后端启动时会自动初始化 SQLite 表，并启动提醒和低轮次废弃会话清理 Worker。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS 4、Recharts、Lucide React |
| 后端 | Python 3.11+、FastAPI、Pydantic 2、SQLAlchemy 2、LangGraph、LangChain |
| 模型 | `langchain-openai`，兼容 OpenAI 风格 API 的模型服务 |
| 通信 | REST API + WebSocket |
| 默认存储 | SQLite（`aiosqlite`）+ `backend/uploads/` |
| 部署 | Dockerfile 和 Docker Compose（开发用途） |

## 快速开始

### 环境要求

- Python 3.11 或更高版本
- Node.js 20 或更高版本
- npm
- 可选：Docker Desktop

### 1. 启动后端

Windows PowerShell：

~~~powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
~~~

Linux/macOS：

~~~bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
~~~

不复制 `.env` 也可以启动；默认配置会使用 Mock 模式。配置真实模型时，编辑 `backend/.env` 后重启后端。

### 2. 启动前端

另开一个终端：

~~~bash
cd frontend
npm install
npm run dev
~~~

打开 <http://localhost:5173>。

开发服务器会把 `/api` 和 `/api/ws` 代理到 `http://localhost:8000` / `ws://localhost:8000`。后端健康检查和 OpenAPI 文档分别位于：

- <http://localhost:8000/health>
- <http://localhost:8000/docs>

### 3. Docker Compose（可选）

~~~bash
docker compose up --build
~~~

当前 Compose 配置启动的是两个开发服务器。前端 Vite 代理默认指向容器内的 `localhost:8000`，因此在容器间访问时可能需要把 `frontend/vite.config.ts` 的代理目标改为 `http://backend:8000` / `ws://backend:8000`，或在前面增加反向代理。生产部署前请补充鉴权、HTTPS、持久化存储和密钥管理。

## 配置

后端配置文件：`backend/.env`（可从 `backend/.env.example` 复制）。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LLM_API_KEY` | `mock-key` | 服务端默认模型密钥；为空或 `mock-key` 时使用动态 Mock |
| `LLM_BASE_URL` | 空 | OpenAI 兼容服务地址，例如 DeepSeek、Qwen、Moonshot 或 Ollama |
| `LLM_MODEL` | `gpt-4o` | 服务端默认模型名 |
| `LLM_TEMPERATURE` | `0.7` | 生成温度 |
| `LLM_BASE_URL_ALLOWLIST` | 空 | 放行内网/本地模型域名的白名单，供 Ollama 等场景使用 |
| `TAVILY_API_KEY` | 空 | 服务端默认联网搜索密钥，可被浏览器请求级配置覆盖 |
| `DATABASE_URL` | `sqlite+aiosqlite:///./interview_copilot.db` | 数据库连接串；默认数据文件位于 `backend/` |
| `UPLOAD_DIR` | `./uploads` | 上传简历和转录文件目录 |
| `ENABLE_MOCK_MODE` | `false` | 显式开启 Mock；即使为 `false`，无有效 `LLM_API_KEY` 时仍会自动回退 Mock |

前端右上角的「模型配置」会把自定义 `base_url`、API Key、模型和 temperature 保存在当前浏览器的 `localStorage` 中，并在请求时优先于后端默认配置。请不要在共享电脑或公开环境保存个人密钥。

## 使用路径

1. 在首页创建模拟面试，选择面试类型、行业、岗位、职级、难度和语言。
2. 粘贴或上传简历，填写目标岗位 JD；也可以直接使用内置示例。
3. 选择固定/自适应轮次、面试官风格和出场角色，开始面试。
4. 在面试房间中回答问题，可暂停、继续、重做、重启或使用求助提示；需要时开启 Tavily 搜索。
5. 结束面试后查看报告、转录、Prompt 日志和训练计划，并在历史记录中比较不同场次。
6. 在「面试官库」管理自定义人设；在「面试日程」登记真实面试和提醒。

## 目录结构

~~~text
Interview-Copilot/
├── backend/
│   ├── app/
│   │   ├── agents/                 # LangGraph 状态、编排、面试官、观察与评分
│   │   ├── api/v1/                 # REST API：面试、简历、角色、记忆、进化等
│   │   ├── api/ws/                 # WebSocket 面试流
│   │   ├── models/                 # SQLAlchemy 数据模型与数据库初始化
│   │   ├── services/               # 解析、搜索、记忆、面试官工厂、进化等服务
│   │   └── core/                   # 配置和安全校验
│   ├── tests/                      # 后端测试
│   ├── scripts/                    # 模拟面试与面试官分析脚本
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/components/             # 首页、设置、面试房间、报告、历史等视图
│   ├── src/utils/                  # API、模型配置、搜索配置、通知工具
│   ├── src/types.ts                # 前后端数据契约
│   ├── vite.config.ts              # 开发服务器和 API/WebSocket 代理
│   └── package.json
├── docker-compose.yml
├── SYSTEM_ARCHITECTURE.md          # 更完整的架构与演进设计
└── README.md
~~~

## API 入口

完整参数和请求示例以 <http://localhost:8000/docs> 为准。主要路由如下：

| 能力 | 路径 |
| --- | --- |
| 健康检查 | `GET /health` |
| 面试会话、回答、暂停/恢复、报告、转录、导出 | `/api/v1/interviews/*` |
| 简历/JD 解析与简历管理 | `/api/v1/profiles/*` |
| 自定义面试官人设 | `/api/v1/personas/*` |
| 面试官版本 | `/api/v1/interviewer-versions/*` |
| 长期记忆与授权 | `/api/v1/memory/*` |
| 进化候选、回放、实验、回滚 | `/api/v1/evolution/*` |
| 面试日程与提醒 | `/api/v1/schedules/*`、`/api/v1/notifications/*` |
| Tavily 搜索测试 | `/api/v1/search/*` |
| 实时面试流 | `WS /api/ws/interview/{session_id}` |

## 测试与构建

后端：

~~~bash
cd backend
pytest -v
~~~

前端：

~~~bash
cd frontend
npm run build
npm run lint
~~~

## 数据与安全边界

- 项目默认是本地单用户模式，当前没有登录、权限、租户隔离或审计级访问控制。
- `backend/interview_copilot.db`、`backend/uploads/` 和根目录下的运行产物可能包含简历、转录和模型输出，提交代码前请确认没有把个人数据加入版本库。
- 前端自定义模型密钥和 Tavily 密钥保存在浏览器 `localStorage`；后端 `.env` 也不应提交到公开仓库。
- 自定义 `LLM_BASE_URL` 默认进行公网地址校验；确需连接内网模型时，使用 `LLM_BASE_URL_ALLOWLIST` 显式放行。
- Mock 回退有利于本地演示，但可能掩盖模型配置错误；接入真实模型后建议检查 `/health`、日志和实际报告内容。

## 当前未实现

以下内容仍属于规划或实验方向，不能按现成功能使用：语音 STT/TTS/VAD、在线代码沙箱、企业级题库 RAG、多租户鉴权、生产级向量数据库和完整的灰度发布平台。

更完整的目标架构、记忆治理和进化实验设计见 [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)。
