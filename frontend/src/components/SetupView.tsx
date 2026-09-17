import React, { useState } from 'react';
import { FileText, Briefcase, Settings2, Sparkles, ArrowRight } from 'lucide-react';

interface SetupViewProps {
  onStartInterview: (config: {
    resumeText: string;
    jdText: string;
    difficulty: string;
    style: string;
    language: string;
  }) => void;
  isLoading: boolean;
}

const SAMPLE_RESUMES = {
  backend: `张三 | 4年研发经验 | 硕士 | 期望岗位：资深后端架构师
【核心技术栈】：
Python, FastAPI, Go, Redis, MySQL, Kafka, Docker, Kubernetes, 微服务架构, 分布式锁, Canal

【核心项目实战】：
1. 亿级高并发电商履约中台 (核心后端开发)
- 负责订单支付后履约分发核心链路，应对双十一万级QPS洪峰；
- 采用 Redis 分布式锁 + 逻辑过期解决热点秒杀击穿，通过 Canal 异步订阅 MySQL Binlog 结合延迟双删，确保缓存与DB最终一致性；
- 针对下游网络抖动引入 Sentinel 自适应熔断与优雅降级，接口可用率达 99.99%。

2. 统一分布式对账结算系统 (架构负责人)
- 重构旧版单体对账模块，通过 Kafka 分区并行处理千万级流水账单，将日切对账耗时从4小时压缩至18分钟。`,

  ai_engineer: `李四 | 3年经验 | 本科 | 期望岗位：大模型应用与 Agent 开发专家
【核心技术栈】：
Python, LangChain, LangGraph, vLLM, pgvector, FastAPI, Prompt Engineering, RAG 架构

【核心项目实战】：
1. 企业级多 Agent 智能知识库平台
- 基于 LangGraph 编排多 Agent 协作工作流，实现意图识别、深度检索与事实对齐；
- 针对万级长文本构建混合检索(Hybrid Search: BM25 + Vector)与重排序(Reranker)，问答准确率由 68% 提升至 89%；
- 引入流式 SSE 协议将首字响应时间压降至 450ms 内。`,
};

const SAMPLE_JDS = {
  backend: `【岗位职责】：
1. 负责核心基础架构与高并发业务系统的演进与服务治理；
2. 解决分布式系统在大流量、极端网络分区与高并发下的高可用、数据一致性及性能瓶颈；
3. 主导技术难点攻关与工程质量建设，指导初中级工程师成长。

【任职要求】：
1. 计算机相关专业本科以上，3年以上后端开发经验，熟练掌握 Python 或 Go；
2. 深入理解 Redis、Kafka、MySQL 原理，具备千万级高并发与大规模分布式系统实战经验；
3. 具备极强的逻辑思维、自驱力与跨团队协同推进能力。`,

  ai_engineer: `【岗位职责】：
1. 负责大模型落地产品的 Agent 编排架构设计与算法链路优化；
2. 搭建高精度 RAG 体系与动态上下文记忆压缩方案；
3. 探索多模态与端到端实时交互前沿。

【任职要求】：
1. 熟练掌握 LangGraph / LangChain 架构与主流开源大模型应用开发；
2. 深入理解向量检索原理与提示词工程最佳实践；
3. 具备强烈的探索精神与快速攻坚未知技术问题的能力。`,
};

export const SetupView: React.FC<SetupViewProps> = ({ onStartInterview, isLoading }) => {
  const [resumeText, setResumeText] = useState(SAMPLE_RESUMES.backend);
  const [jdText, setJdText] = useState(SAMPLE_JDS.backend);
  const [difficulty, setDifficulty] = useState('senior');
  const [style, setStyle] = useState('rigorous');
  const [language, setLanguage] = useState('zh');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartInterview({
      resumeText,
      jdText,
      difficulty,
      style,
      language,
    });
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-8">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-900/30 border border-blue-700/40 text-blue-400 text-xs font-medium mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>场景准备与个性化定制</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
          配置你的全真多 Agent 模拟面试
        </h1>
        <p className="mt-3 text-sm text-gray-400 leading-relaxed">
          输入你的简历与求职目标岗位，面试团将自适应生成量身定制的深度考察方案，
          模拟主考官、技术专家、HR和压力挑战官的协同问答。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Resume Box */}
          <div className="bg-gray-900/70 border border-gray-800 rounded-2xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <label className="text-sm font-semibold text-gray-200">
                  候选人简历 (Resume)
                </label>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setResumeText(SAMPLE_RESUMES.backend)}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                >
                  后端示例
                </button>
                <button
                  type="button"
                  onClick={() => setResumeText(SAMPLE_RESUMES.ai_engineer)}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                >
                  AI工程示例
                </button>
                <button
                  type="button"
                  onClick={() => setResumeText('')}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800/60 hover:bg-red-900/40 text-gray-400 hover:text-red-300 transition"
                >
                  清空
                </button>
              </div>
            </div>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="在此粘贴个人简历文本（包含教育背景、核心技能栈、关键项目经历与成就量化指标）..."
              rows={12}
              className="w-full bg-gray-950/80 border border-gray-800 rounded-xl p-3 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono resize-none leading-relaxed flex-1"
              required
            />
            <p className="text-[11px] text-gray-500 mt-2">
              💡 提示：技术面试官将针对简历中所列项目与技术选型进行层层深挖追问。
            </p>
          </div>

          {/* JD Box */}
          <div className="bg-gray-900/70 border border-gray-800 rounded-2xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-indigo-400" />
                <label className="text-sm font-semibold text-gray-200">
                  目标岗位描述 (Job Description)
                </label>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setJdText(SAMPLE_JDS.backend)}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                >
                  架构师JD
                </button>
                <button
                  type="button"
                  onClick={() => setJdText(SAMPLE_JDS.ai_engineer)}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                >
                  Agent专家JD
                </button>
                <button
                  type="button"
                  onClick={() => setJdText('')}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800/60 hover:bg-red-900/40 text-gray-400 hover:text-red-300 transition"
                >
                  清空
                </button>
              </div>
            </div>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="在此粘贴企业招聘 JD（包含职责描述、硬性技能要求、软性要求）..."
              rows={12}
              className="w-full bg-gray-950/80 border border-gray-800 rounded-xl p-3 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono resize-none leading-relaxed flex-1"
              required
            />
            <p className="text-[11px] text-gray-500 mt-2">
              💡 提示：系统将自动提炼岗位的核心能力要求，对齐面试提问与雷达评估维度。
            </p>
          </div>
        </div>

        {/* Mode and Style Settings */}
        <div className="bg-gray-900/70 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center space-x-2 mb-4">
            <Settings2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-gray-200">
              面试模式与风格定制 (Interview Preferences)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Seniority */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">
                考核职级 (Level)
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="junior">校招 / 初级研发 (夯实基础与语法)</option>
                <option value="senior">社招 / 资深研发 (高可用与深度原理)</option>
                <option value="expert">专家 / 架构管理层 (技术战略与业务大局)</option>
              </select>
            </div>

            {/* Style */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">
                面试官风格 (Style)
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="gentle">温和鼓励型 (耐心引导，注重发挥)</option>
                <option value="rigorous">严谨批判型 (关注逻辑漏洞与边界)</option>
                <option value="stress">快节奏高压型 (激活压力挑战官，极限考察)</option>
              </select>
            </div>

            {/* Language */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">
                语言模式 (Language)
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="zh">全中文面试 (标准普通话)</option>
                <option value="en">全英文面试 (English Global Mock)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Start Button */}
        <div className="flex justify-center pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="group relative inline-flex items-center space-x-3 px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>正在解析简历并召集 AI 面试官...</span>
              </>
            ) : (
              <>
                <span>进入全真多 Agent 模拟面试房间</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
