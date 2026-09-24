<div align="center">

# 🎨 Interview-Copilot · Frontend

**React 19 + TypeScript + Vite 8 + Tailwind CSS 4**

无 UI 组件库，基于 CSS 变量的**自建设计令牌（Token）体系**，深 / 浅双主题。

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Oxlint](https://img.shields.io/badge/Oxlint-lint-86EFAC)](https://oxc.rs/)

[← 返回项目主文档](../README.md)

</div>

---

## 📑 目录

| 章节 | 章节 |
| :--- | :--- |
| [✨ 技术栈](#-技术栈) | [📁 目录结构](#-目录结构) |
| [🚀 脚本命令](#-脚本命令) | [🧩 组件清单](#-组件清单) |
| [🔌 开发服务器与代理](#-开发服务器与代理) | [🧭 开发约定](#-开发约定) |
| [🎨 设计令牌体系](#-设计令牌体系) | [🖼️ 系统架构](#️-系统架构) |

---

## ✨ 技术栈

| 层 | 技术 | 说明 |
| :--- | :--- | :--- |
| 框架 | React 19 | 函数组件 + Hooks，单页面多视图切换（无路由库，`App.tsx` 内 `view` state 切换） |
| 语言 | TypeScript ~6.0 | 严格模式；前后端数据契约集中在 `src/types.ts` |
| 构建 | Vite 8 | HMR 开发服务器，`tsc -b && vite build` 产出 `dist/` |
| 样式 | Tailwind CSS 4 | PostCSS 插件方式接入；**JS 配置未生效**，token 全部走 `index.css`（见下文） |
| 图表 | Recharts 3 | 报告页六维雷达图等 |
| 图标 | Lucide React | 全站图标来源 |
| Lint | Oxlint | 规则见 `.oxlintrc.json` |
| 状态 | clsx + tailwind-merge | 类名拼接工具（无全局状态库） |

---

## 🚀 脚本命令

| 命令 | 作用 |
| :--- | :--- |
| `npm run dev` | 启动开发服务器（<http://localhost:5173>） |
| `npm run build` | 类型检查（`tsc -b`）+ 生产构建 |
| `npm run lint` | Oxlint 检查 |
| `npm run preview` | 本地预览构建产物 |

---

## 🔌 开发服务器与代理

`vite.config.ts` 将后端请求代理到本地 FastAPI（默认 `localhost:8000`，可用环境变量 `VITE_API_URL` 覆盖）：

| 前缀 | 目标 | 用途 |
| :--- | :--- | :--- |
| `/api/ws` | `ws://localhost:8000` | WebSocket 面试实时流 |
| `/api` | `http://localhost:8000` | REST API |

后端未启动时页面可打开，但模型相关功能会直接报错——这是设计如此，**不做假数据兜底**。

---

## 🎨 设计令牌体系

**权威定义只有一个文件：`src/index.css`。** Tailwind v4 默认不加载 `tailwind.config.js`（本仓库也没有 `@config` 指令），所以那份 JS 配置是**死配置，改了没用**。调整颜色 / 阴影 / 圆角一律改 `index.css`。

### 🌗 主题

两套主题通过 `<html data-theme="...">` 切换（由 `src/context/ThemeContext.tsx` 管理）：

| 主题 | 值 | 风格 |
| :--- | :--- | :--- |
| Classic Dark（默认） | `data-theme="classic-dark"` | 深蓝黑画布 `#0b0f19`，品牌蓝 `#3b82f6` |
| Linear Light | `data-theme="linear-light"` | 冷调米白 `#f8fafc`，品牌蓝 `#2563eb` |

`@custom-variant dark` 绑定到 `classic-dark`——`dark:` 前缀跟随**应用内主题开关**，不是系统 `prefers-color-scheme`。

### 🗂️ 分层结构

~~~text
:root / [data-theme]        ← 原始 CSS 变量（颜色、阴影、圆角的真实值）
        ↓
@theme { ... }              ← 映射为 Tailwind 语义工具类
        ↓
组件里直接用 token 类名       ← bg-surface / text-content-primary / ...
~~~

### 🏷️ 工具类速查表

| 语义 | 工具类 |
| :--- | :--- |
| 画布 / 表面 | `bg-app` `bg-surface` `bg-surface-elevated` `bg-surface-hover` `bg-surface-active` `bg-surface-subtle` `bg-surface-header` |
| 品牌色 | `bg-brand-primary` `bg-brand-hover` `bg-brand-active` `bg-brand-subtle`（`text-` `border-` 同名可用） |
| 状态色 | `bg-status-success` / `-warning` / `-danger` / `-info`，各带 `-bg`（浅底）与 `-border` 变体 |
| 文字层级 | `text-content-primary` `text-content-secondary` `text-content-muted` `text-content-placeholder` `text-content-disabled` `text-content-inverse` |
| 边框 | `border-line-subtle`（分隔线）`border-line-default`（描边）`border-line-focus`（聚焦环） |
| 阴影 | `shadow-card` `shadow-card-hover` `shadow-popover` `shadow-modal` |
| 圆角 | `rounded-sm`(6px) `rounded-md`(10px) `rounded-lg`(16px) |

> [!TIP]
> 反色文字不要写 `text-white`——用 `text-content-inverse`，深色主题下它会正确变成深色字。

---

## 📁 目录结构

~~~text
frontend/
├── index.html                  # 入口（title：多 Agent 模拟面试与持续训练闭环）
├── vite.config.ts              # 插件 + 端口 5173 + /api、/api/ws 代理
├── .oxlintrc.json              # Oxlint 规则
├── tailwind.config.js          # ⚠️ 未生效的死配置，勿在此改样式
└── src/
    ├── main.tsx                # React 挂载入口
    ├── App.tsx                 # 视图切换中枢：home / setup / interview / report / interviews / resumes / personas
    ├── types.ts                # 前后端数据契约（Interview、Report、Persona 等）
    ├── index.css               # 设计令牌权威定义 + 动效 + 滚动条
    ├── assets/                 # 静态资源
    ├── context/
    │   ├── ThemeContext.tsx    # 深浅主题切换（data-theme）
    │   └── PrivacyModeContext.tsx  # 隐私模式（打码敏感信息）
    ├── utils/
    │   ├── api.ts              # REST 封装 + describeApiError 错误透传
    │   ├── llmConfig.ts        # 浏览器侧模型配置（localStorage）
    │   ├── searchConfig.ts     # Tavily 浏览器侧密钥
    │   ├── browserNotification.ts  # 面试日程浏览器提醒
    │   ├── privacyMode.ts      # 隐私模式工具
    │   ├── resumeUtils.ts      # 简历文件解析辅助
    │   └── interviewers.ts     # 内置面试官角色定义
    └── components/             # 23 个视图 / 弹窗组件（见下表）
~~~

---

## 🧩 组件清单

### 🎬 主流程

| 组件 | 职责 |
| :--- | :--- |
| `HomeView` | 首页，选择面试类型入口 |
| `SetupView` | 面试配置：简历 / JD 输入、难度、轮次、面试官阵容 |
| `InterviewRoom` | 面试房间（最大组件）：WebSocket 实时问答、暂停 / 重做 / 求助、AI 思考动效 |
| `ReportView` | 面试报告：六维评分、逐题复盘、训练计划、与上一场对比入口 |

### 🗓️ 面试管理

| 组件 | 职责 |
| :--- | :--- |
| `InterviewManagementView` | 面试日程管理主页（主题自适应基准） |
| `InterviewCalendarView` | 月历排期视图 |
| `InterviewTimelineView` | 时间线视图（与月历同源数据，状态色必须一致） |
| `DateTimePicker` | 日期时间选择器（登记 / 提醒共用） |
| `ReminderSettingsModal` | 提醒方式设置 |

### 📄 简历

| 组件 | 职责 |
| :--- | :--- |
| `ResumeManagementView` | 简历库管理 |
| `ResumeEditorModal` | 简历编辑 |

### 🎭 面试官

| 组件 | 职责 |
| :--- | :--- |
| `PersonaLibraryView` | 自定义面试官人设库 |
| `PersonaEvolutionModal` | 面试官版本进化：候选回放、审批、回滚 |
| `InterviewerPanel` | 面试中面试官席位面板 |
| `InterviewGuideModal` | 面试指引 |

### 📊 结果与记录

| 组件 | 职责 |
| :--- | :--- |
| `HistoryView` | 历史场次列表 |
| `ComparisonModal` | 两场面试对比（报告页「与上一场对比」/ 复盘列表勾选 2 场） |
| `TranscriptModal` | 完整转录查看 |
| `ScorecardShareModal` | 评分卡分享 |

### ⚙️ 设置与其他

| 组件 | 职责 |
| :--- | :--- |
| `Navbar` | 顶部导航、主题切换入口 |
| `SettingsModal` | 全局设置 |
| `SearchConfigModal` | Tavily 联网搜索配置 |
| `SearchSources` | 搜索来源展示 |

---

## 🧭 开发约定

1. **颜色、阴影一律用 token 工具类**，禁止硬编码 `bg-gray-900` / `text-white` / `text-gray-400` 之类——它们不会随主题切换，浅色主题下会直接「格格不入」。语义对照见上方速查表。
2. **深浅两套主题都要过一遍**：新组件完成后切到 Linear Light 检查可读性，不能只调深色。
3. **状态色全局统一**：待面试 → `status-warning`，已完成 → `status-info`，已通过 → `status-success`，未通过 → `status-danger`，婉拒 / 取消 → 中性灰。同一业务状态在不同视图必须同色。
4. **强调色只有品牌蓝**（`brand-primary`）：不要为单个模块引入 emerald / violet 等新强调色或彩色渐变。
5. **失败要可见**：接口报错用 `describeApiError()` 透传后端 `detail` 展示给用户，禁止静默降级或 mock 兜底（全项目已废除该模式）。
6. **数据契约只写在 `src/types.ts`**，与后端模型对齐；不要在组件里重复定义接口形状。
7. **密钥安全**：浏览器侧模型密钥 / Tavily 密钥只存 `localStorage`，绝不写进代码或提交仓库。
8. **Lint**：`react/rules-of-hooks` 为 error，`react/only-export-components` 为 warn；提交前跑 `npm run lint`。

---

## 🖼️ 系统架构

前端在前端 / 后端 / 多 Agent 协同中的位置（交互版见 [diagrams/interview-copilot-architecture.html](../diagrams/interview-copilot-architecture.html)）：

<div align="center">

![Interview-Copilot 系统架构](../diagrams/interview-copilot-architecture.visual-check.1440x900.light.png)

<sub>左侧「界面层」即本目录：React SPA 经 WebSocket 与 REST 与 FastAPI 通信</sub>

</div>
