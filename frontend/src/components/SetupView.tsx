import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Briefcase,
  Settings2,
  Sparkles,
  ArrowRight,
  Upload,
  Layers,
  Cpu,
  CheckCircle,
  FileCheck,
  Globe,
  Users,
  Code2,
  Terminal,
  Sliders
} from 'lucide-react';
import { loadLLMConfig } from '../utils/llmConfig';
import { loadSearchConfig } from '../utils/searchConfig';
import { SearchConfigModal } from './SearchConfigModal';
import type { PersonaDisplayInfo } from '../utils/interviewers';
import type { InterviewType, IndustryType, SeniorityLevel, DifficultyLevel, Persona } from '../types';
import { INDUSTRY_OPTIONS } from '../types';

interface SetupViewProps {
  onStartInterview: (config: {
    resumeText: string;
    jdText: string;
    interviewType: InterviewType;
    industry: IndustryType;
    jobRole: string;
    seniority: SeniorityLevel;
    difficulty: DifficultyLevel;
    style: string;
    language: string;
    webSearchEnabled: boolean;
    maxRounds?: number;
    customConfig?: any;
    /** 本场出场自定义人设的展示信息（含 persona:<id> 引用），供面试官席位与气泡命名 */
    customPersonas?: PersonaDisplayInfo[];
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

  management: `王总监 | 9年经验 | 本科 | 期望岗位：研发总监 / 架构管理部负责人
【核心专长】：
技术战略规划、团队梯队搭建(管理25+研发)、敏捷研发效能体系(CI/CD/自动化测试)、研发成本与云资源优化

【核心管理成效】：
1. 核心技术团队重塑与梯队组建
- 设立资深Tech Lead双通道晋升机制，建立代码审查(CR)红线制度，团队核心骨干流失率降低至5%以下；
2. 中台微服务化拆分与降本增效
- 推动老旧遗留单体解耦，主导服务网格改造，年节省计算与网络云资源开销约180万元。`,
};

const SAMPLE_JDS: Record<string, string> = {
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

  management: `【岗位职责】：
1. 全面负责核心产品线研发团队的管理与战略规划，直接管理架构师、后端、前端团队；
2. 负责技术战略路线图制定，平衡短期业务交付与长期技术架构演进，化解技术债务；
3. 建立并持续优化研发效能、工程质量度量指标体系与人才培养机制。

【任职要求】：
1. 7年以上大型互联网或科技企业研发经验，3年以上20人以上技术团队管理经验；
2. 具备优秀的大局观、跨部门协同推进能力与技术战略眼光。`,
};

const PRESET_ROLES: Record<IndustryType, string[]> = {
  '互联网/电商': ['资深后端开发', '高并发架构师', '前端架构师', '大数据平台开发', '研发效能/DevOps专家'],
  '人工智能/大模型': ['大模型算法工程师', '大模型应用/Agent开发专家', '算法工程/RAG专家', 'AI基础设施/算力调度', '推荐算法工程师'],
  '云计算/大数据': ['云原生/基础设施研发', 'SRE/稳定性保障', '大数据平台开发', '数据仓库/BI工程师', '数据库内核研发'],
  '金融科技/量化': ['量化系统研发', '核心清结算开发', '风控引擎架构师', '金融交易后端'],
  '银行/证券/保险': ['银行核心系统研发', '交易/清算系统开发', '量化风控策略', '精算与产品设计', '合规与反洗钱专员'],
  '企业服务/SaaS': ['SaaS多租户后端', '企业中台架构师', '分布式工作流系统', '前端全栈开发'],
  '游戏开发': ['游戏服务端主程', 'Unity/UE引擎开发', '游戏网络同步专家', '高性能游戏后端'],
  '文化传媒/直播社交': ['推荐系统工程师', '直播/RTC研发', '短视频客户端研发', '内容安全策略', '内容运营专家'],
  '教育/在线教育': ['教育产品研发', '直播课堂系统研发', '题库/自适应学习算法', '教研内容专家', '课程运营'],
  '智能制造/自动驾驶': ['自动驾驶系统研发', '嵌入式/C++中间件', '车联网后端架构', '仿真平台开发'],
  '汽车/新能源车': ['智能座舱软件研发', '自动驾驶感知算法', '整车电子电气架构', '三电系统工程师', '车联网平台研发'],
  '通信/芯片/半导体': ['数字IC设计', '芯片验证工程师', '嵌入式固件研发', '通信协议栈研发', '射频/模拟IC工程师'],
  '安防/物联网': ['视频图像算法', 'IoT平台研发', '嵌入式安防研发', '边缘计算工程师', '硬件测试工程师'],
  '区块链/Web3': ['区块链底层研发', '智能合约工程师', 'DApp全栈开发', '密码学工程师', '链上数据分析'],
  '新能源/电力/储能': ['BMS电池管理研发', '电力系统工程师', '储能系统集成', '逆变器/功率电子研发', '能源数字化开发'],
  '能源/化工/环保': ['工艺工程师', 'DCS/过程控制研发', '化工安全工程师', '环保数据分析', '碳资产管理'],
  '医疗健康/生物医药': ['医疗大数据架构师', '医学影像AI算法', '健康中台研发', '信息系统工程师'],
  '物流/供应链': ['供应链算法工程师', '仓储系统(WMS)研发', '路径规划/调度算法', '运输管理系统研发', '物流运营专家'],
  '消费品/零售': ['零售数字化研发', '供应链计划专家', '会员/营销系统研发', '商品数据分析', '电商运营专家'],
  '生活服务/文旅酒店': ['外卖调度系统研发', 'LBS/地图算法', '酒店/门票业务研发', '增长运营专家', '履约体验产品经理'],
  '地产/建筑/智慧城市': ['智慧城市解决方案', 'BIM工程师', '地产数字化研发', '建筑结构设计师'],
  '航空航天/国防': ['飞控算法工程师', '航空电子研发', '卫星测控/遥测', '仿真建模工程师', '信创系统研发'],
  '政府/公共事业': ['政务系统研发', '信创适配工程师', '公共数据治理', '网络安全等保测评', '信息化专员'],
  '法律/咨询/人力资源': ['法务合规顾问', '战略咨询顾问', 'HRBP', '法律科技产品研发', '薪酬绩效专家'],
  '农业/食品科技': ['农业物联网研发', '食品研发工程师', '农产品供应链', '智慧养殖系统研发', '食品安全检测'],
  '通用行业': ['高级软件工程师', '技术负责人/Tech Lead', '系统架构师', '技术总监/VP']
};

const INTERVIEW_TYPE_OPTIONS: Array<{
  type: InterviewType;
  title: string;
  subtitle: string;
  icon: any;
  color: string;
}> = [
  {
    type: 'structured',
    title: '结构化全流程面试',
    subtitle: '破冰 -> 深度技术 -> STAR行为 -> 极端挑战 -> 反问',
    icon: Layers,
    color: 'border-blue-500/50 bg-blue-950/20 text-blue-300',
  },
  {
    type: 'technical',
    title: '专业技术深度面',
    subtitle: '技术栈与高并发架构、底层源码、一致性权衡',
    icon: Code2,
    color: 'border-cyan-500/50 bg-cyan-950/20 text-cyan-300',
  },
  {
    type: 'programmer',
    title: '程序员综合面',
    subtitle: '项目经历 + 计算机基础轮转 + 代码题，经典大厂一二面完整流程',
    icon: Terminal,
    color: 'border-orange-500/50 bg-orange-950/20 text-orange-300',
  },
  {
    type: 'behavioral',
    title: 'STAR 行为面试',
    subtitle: '情境/任务/行动/结果，团队沟通与复杂冲突',
    icon: Users,
    color: 'border-purple-500/50 bg-purple-950/20 text-purple-300',
  },
  {
    type: 'hr',
    title: 'HR 综合素养面',
    subtitle: '职业规划、稳定性、离职原因与企业文化契合',
    icon: Users,
    color: 'border-pink-500/50 bg-pink-950/20 text-pink-300',
  },
  {
    type: 'management',
    title: '管理岗 / 技术总监面',
    subtitle: '团队梯队建设、技术战略、技术债务、研发效能',
    icon: Briefcase,
    color: 'border-amber-500/50 bg-amber-950/20 text-amber-300',
  },
  {
    type: 'english',
    title: '全球英语面试',
    subtitle: '100% English Global Mock, FAANG style',
    icon: Globe,
    color: 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300',
  },
  {
    type: 'custom',
    title: '自选定制面试',
    subtitle: '自由勾选面试官阵容，指定考查方向',
    icon: Sliders,
    color: 'border-indigo-500/50 bg-indigo-950/20 text-indigo-300',
  },
];

export const SetupView: React.FC<SetupViewProps> = ({ onStartInterview, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [resumeText, setResumeText] = useState(SAMPLE_RESUMES.backend);
  const [jdText, setJdText] = useState(SAMPLE_JDS.backend);
  const [industry, setIndustry] = useState<IndustryType>('人工智能/大模型');
  const [jobRole, setJobRole] = useState('大模型算法工程师');
  const [seniority, setSeniority] = useState<SeniorityLevel>('senior');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('standard');
  const [interviewType, setInterviewType] = useState<InterviewType>('structured');
  const [style, setStyle] = useState('rigorous');
  const [language, setLanguage] = useState('zh');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [searchConfigOpen, setSearchConfigOpen] = useState(false);
  const [hasLocalSearchKey, setHasLocalSearchKey] = useState(() => Boolean(loadSearchConfig()));

  useEffect(() => {
    const refreshSearchConfig = () => setHasLocalSearchKey(Boolean(loadSearchConfig()));
    window.addEventListener('ic-search-config-changed', refreshSearchConfig);
    return () => window.removeEventListener('ic-search-config-changed', refreshSearchConfig);
  }, []);

  // Custom interview config
  const [customSelectedInterviewers, setCustomSelectedInterviewers] = useState<string[]>([
    'technical',
    'hr',
  ]);
  const [customFocusTopics, setCustomFocusTopics] = useState('分布式锁, MySQL MVCC, Kafka异步解耦');
  const [myPersonas, setMyPersonas] = useState<Persona[]>([]);

  // Uploading status
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessName, setUploadSuccessName] = useState<string | null>(null);

  // Saved user resumes
  const [userResumes, setUserResumes] = useState<Array<{ id: string; filename: string; raw_text_preview: string }>>([]);
  const [isLoadingResume, setIsLoadingResume] = useState(false);

  const customModel = loadLLMConfig()?.model;

  // Fetch custom personas for the custom-interview lineup
  useEffect(() => {
    fetch('/api/v1/personas')
      .then((res) => (res.ok ? res.json() : { personas: [] }))
      .then((data) => setMyPersonas(data.personas || []))
      .catch(() => setMyPersonas([]));
  }, []);

  // Load saved resumes
  useEffect(() => {
    const fetchResumes = async () => {
      try {
        const res = await fetch('/api/v1/profiles/resumes');
        if (res.ok) {
          const data = await res.json();
          setUserResumes(data.resumes || []);
        }
      } catch (err) {
        console.error('Failed to load saved resumes:', err);
      }
    };
    fetchResumes();
  }, []);

  // Handle English mode auto-switch
  useEffect(() => {
    if (interviewType === 'english') {
      setLanguage('en');
    } else if (language === 'en') {
      setLanguage('zh');
    }
  }, [interviewType]);

  // File Upload Handler
  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadSuccessName(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/v1/profiles/upload-resume', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '简历解析失败');
      }

      const data = await res.json();
      setResumeText(data.raw_text);
      setUploadSuccessName(file.name);
    } catch (err: any) {
      alert(err.message || '上传并解析简历失败，请检查文件格式。');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartInterview({
      resumeText,
      jdText,
      interviewType,
      industry,
      jobRole,
      seniority,
      difficulty,
      style,
      language,
      webSearchEnabled,
      maxRounds: interviewType === 'programmer' ? 8 : 6,
      customConfig:
        interviewType === 'custom'
          ? {
              selected_interviewers: customSelectedInterviewers,
              focus_topics: customFocusTopics.split(/[,，、;；]/).map((t) => t.trim()).filter(Boolean),
            }
          : undefined,
      customPersonas:
        interviewType === 'custom'
          ? myPersonas
              .filter((p) => customSelectedInterviewers.includes(`persona:${p.id}`))
              .map((p) => ({
                key: p.key,
                ref: `persona:${p.id}`,
                name: p.name,
                avatar: p.avatar,
                description: p.description,
              }))
          : [],
    });
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-8">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-900/30 border border-blue-700/40 text-blue-400 text-xs font-medium mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>智能模拟面试系统</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
          配置你的多 Agent 模拟面试
        </h1>
        <p className="mt-3 text-sm text-gray-400 leading-relaxed">
          支持上传真实简历文件、挑选行业与细分岗位、任选 7 大面试类型与多模态交互，全周期生成诊断报告与 7 天冲刺计划。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Choose Interview Type */}
        <div className="bg-gray-900/70 border border-gray-800 rounded-3xl p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Layers className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">
              步骤 1：选择面试类型 (Interview Type)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {INTERVIEW_TYPE_OPTIONS.map((item) => {
              const Icon = item.icon;
              const isSelected = interviewType === item.type;
              return (
                <div
                  key={item.type}
                  onClick={() => setInterviewType(item.type)}
                  className={`cursor-pointer rounded-2xl p-4 border transition-all relative overflow-hidden flex flex-col justify-between ${
                    isSelected
                      ? `bg-gray-800/90 border-blue-500 ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/10`
                      : 'bg-gray-950/60 border-gray-800/80 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-start space-x-3 mb-2">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${item.color}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-100">{item.title}</div>
                      <div className="text-[11px] text-gray-400 mt-1 leading-snug">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="self-end mt-1 text-[10px] font-semibold text-blue-400 flex items-center space-x-1">
                      <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
                      <span>已选定</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Custom Interview Configuration Panel */}
          {interviewType === 'custom' && (
            <div className="mt-4 p-4 rounded-2xl bg-gray-950/80 border border-indigo-500/40 space-y-3 animate-fadeIn">
              <div className="text-xs font-semibold text-indigo-300 flex items-center space-x-2">
                <Sliders className="w-3.5 h-3.5" />
                <span>自定义面试阵容与考察重心</span>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    指定出场面试官 (可多选，按选择顺序出场)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'technical', label: '技术专家' },
                      { key: 'hr', label: 'HR/行为官' },
                      { key: 'management', label: '管理岗专家' },
                      { key: 'challenger', label: '压力挑战官' },
                      { key: 'programmer', label: '程序员综合官' },
                    ].map((role) => {
                      const active = customSelectedInterviewers.includes(role.key);
                      return (
                        <button
                          key={role.key}
                          type="button"
                          onClick={() => {
                            if (active) {
                              if (customSelectedInterviewers.length > 1) {
                                setCustomSelectedInterviewers(
                                  customSelectedInterviewers.filter((k) => k !== role.key)
                                );
                              }
                            } else {
                              setCustomSelectedInterviewers([
                                ...customSelectedInterviewers,
                                role.key,
                              ]);
                            }
                          }}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                            active
                              ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                              : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          {role.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {myPersonas.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">
                      <span className="text-violet-300 font-medium">我的角色</span>
                      （来自角色库）
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {myPersonas.map((p) => {
                        const entry = `persona:${p.id}`;
                        const active = customSelectedInterviewers.includes(entry);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            title={p.description || p.system_prompt.slice(0, 60)}
                            onClick={() => {
                              if (active) {
                                if (customSelectedInterviewers.length > 1) {
                                  setCustomSelectedInterviewers(
                                    customSelectedInterviewers.filter((k) => k !== entry)
                                  );
                                }
                              } else {
                                setCustomSelectedInterviewers([
                                  ...customSelectedInterviewers,
                                  entry,
                                ]);
                              }
                            }}
                            className={`flex items-center space-x-1 text-xs px-3 py-1.5 rounded-lg border transition ${
                              active
                                ? 'bg-violet-600/30 border-violet-500 text-violet-200'
                                : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            <span>{p.avatar || '🎭'}</span>
                            <span>{p.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(() => {
                  const resolveLabel = (entry: string) => {
                    if (entry.startsWith('persona:')) {
                      const p = myPersonas.find((x) => `persona:${x.id}` === entry);
                      return `${p?.avatar || '🎭'} ${p?.name || '自定义角色'}`;
                    }
                    return (
                      {
                        technical: '技术专家',
                        hr: 'HR/行为官',
                        management: '管理岗专家',
                        challenger: '压力挑战官',
                        programmer: '程序员综合官',
                      } as Record<string, string>
                    )[entry] || entry;
                  };
                  return (
                    <div className="text-[11px] text-gray-500 bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2">
                      <span className="text-gray-400">出场顺序：</span>
                      {customSelectedInterviewers.map((entry, i) => (
                        <span key={entry}>
                          {i > 0 && <span className="text-gray-600"> → </span>}
                          <span className="text-gray-300">{i + 1}. {resolveLabel(entry)}</span>
                        </span>
                      ))}
                    </div>
                  );
                })()}

                {myPersonas.length === 0 && (
                  <div className="text-[11px] text-gray-500">
                    💡 想加入自设计的面试官？点击顶部
                    <span className="text-violet-300">「角色库」</span>
                    创建你的专属角色。
                  </div>
                )}

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    定向考察知识点 (逗号分隔)
                  </label>
                  <input
                    type="text"
                    value={customFocusTopics}
                    onChange={(e) => setCustomFocusTopics(e.target.value)}
                    placeholder="如：Redis分布式锁, Kafka事务, 双写一致性"
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Industry, Role, Seniority, Difficulty */}
        <div className="bg-gray-900/70 border border-gray-800 rounded-3xl p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Briefcase className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">
              步骤 2：选择行业、岗位、职级与难度
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Industry */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">目标行业</label>
              <select
                value={industry}
                onChange={(e) => {
                  const newInd = e.target.value as IndustryType;
                  setIndustry(newInd);
                  if (PRESET_ROLES[newInd] && PRESET_ROLES[newInd].length > 0) {
                    setJobRole(PRESET_ROLES[newInd][0]);
                  }
                }}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                {INDUSTRY_OPTIONS.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">
                求职岗位 (支持自定义)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={jobRole}
                  onChange={(e) => setJobRole(e.target.value)}
                  placeholder="例如：后端开发架构师"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {PRESET_ROLES[industry]?.slice(0, 3).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setJobRole(r)}
                    className="text-[10px] text-gray-400 hover:text-blue-300 underline"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Seniority */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">考核职级</label>
              <select
                value={seniority}
                onChange={(e) => setSeniority(e.target.value as SeniorityLevel)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="intern">校招新人 / 实习生 (夯实基础与语法规范)</option>
                <option value="junior">初级工程师 (1-3年，注重项目实操与排错)</option>
                <option value="senior">社招资深研发 (3-5年，高可用与架构设计)</option>
                <option value="expert">架构师 / 技术专家 (5-10年，高并发与技术选型)</option>
                <option value="director">技术总监 / 管理岗 (10年+，团队战略与研发效能)</option>
              </select>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">面试难度</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="easy">基础巩固 (侧重基础语法与常规场景)</option>
                <option value="standard">标准大厂 (真实业务复杂系统设计与场景追问)</option>
                <option value="hard">专家地狱 (底层源码、极端崩溃故障与边界取舍)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Step 3: Resume Upload & JD Input */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Resume Box */}
          <div className="bg-gray-900/70 border border-gray-800 rounded-3xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <label className="text-sm font-semibold text-gray-200">
                  候选人简历 (支持 PDF/Word/TXT 上传)
                </label>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setResumeText(SAMPLE_RESUMES.backend)}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                >
                  后端
                </button>
                <button
                  type="button"
                  onClick={() => setResumeText(SAMPLE_RESUMES.ai_engineer)}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                >
                  AI工程
                </button>
                <button
                  type="button"
                  onClick={() => setResumeText(SAMPLE_RESUMES.management)}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                >
                  管理岗
                </button>
              </div>
            </div>

            {/* Saved Resumes Selector */}
            {userResumes.length > 0 && (
              <div className="mb-3">
                <select
                  onChange={async (e) => {
                    const resumeId = e.target.value;
                    if (!resumeId || isLoadingResume) return;
                    setIsLoadingResume(true);
                    try {
                      // 历史列表只带 200 字预览，完整简历内容需按 id 拉取
                      const res = await fetch(`/api/v1/profiles/resumes/${resumeId}`);
                      if (res.ok) {
                        const data = await res.json();
                        setResumeText(data.raw_text || '');
                      } else {
                        alert('加载历史简历失败，请稍后重试');
                      }
                    } catch (err) {
                      console.error('Failed to load saved resume detail:', err);
                      alert('加载历史简历失败，请检查网络连接');
                    } finally {
                      setIsLoadingResume(false);
                    }
                  }}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  disabled={isLoadingResume}
                >
                  <option value="">
                    {isLoadingResume ? '-- 正在加载完整简历... --' : '-- 选择已保存的历史简历 --'}
                  </option>
                  {userResumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.filename}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Drag & Drop File Upload Area */}
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="mb-3 border-2 border-dashed border-gray-800 hover:border-blue-500/60 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer bg-gray-950/40 hover:bg-blue-950/10 transition group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              {isUploading ? (
                <div className="flex items-center space-x-2 text-xs text-blue-400 py-1">
                  <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                  <span>正在解析简历并提取候选人画像...</span>
                </div>
              ) : uploadSuccessName ? (
                <div className="flex items-center space-x-2 text-xs text-emerald-400">
                  <FileCheck className="w-4 h-4" />
                  <span>已成功提取：{uploadSuccessName}</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-xs text-gray-400 group-hover:text-blue-400 transition">
                  <Upload className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
                  <span>拖拽或点击上传本地简历 (支持 PDF, Word, TXT)</span>
                </div>
              )}
            </div>

            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="在此粘贴或上传个人简历文本..."
              rows={10}
              className="w-full bg-gray-950/80 border border-gray-800 rounded-xl p-3 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono resize-none leading-relaxed flex-1"
              required
            />
          </div>

          {/* JD Box */}
          <div className="bg-gray-900/70 border border-gray-800 rounded-3xl p-5 flex flex-col">
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
                  后端JD
                </button>
                <button
                  type="button"
                  onClick={() => setJdText(SAMPLE_JDS.ai_engineer)}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                >
                  AgentJD
                </button>
                <button
                  type="button"
                  onClick={() => setJdText(SAMPLE_JDS.management)}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                >
                  管理JD
                </button>
              </div>
            </div>

            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="在此粘贴企业招聘 JD（包含职责描述、硬性技能要求、软性要求）..."
              rows={14}
              className="w-full bg-gray-950/80 border border-gray-800 rounded-xl p-3 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-mono resize-none leading-relaxed flex-1"
              required
            />
            <p className="text-[11px] text-gray-500 mt-2">
              💡 提示：AI 影子观察员将根据目标岗位职责实时核对候选人回答的契合度。
            </p>
          </div>
        </div>

        {/* Mode and Style Settings */}
        <div className="bg-gray-900/70 border border-gray-800 rounded-3xl p-5">
          <div className="flex items-center space-x-2 mb-4">
            <Settings2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-gray-200">
              面试官风格与偏好 (Preferences)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">面试官风格</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="gentle">温和鼓励型 (循循善诱，注重思路引导)</option>
                <option value="rigorous">严谨批判型 (探究逻辑自洽与系统边界)</option>
                <option value="stress">快节奏高压型 (激活挑战官，极限故障施压)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">语言模式</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="zh">全中文普通话交流</option>
                <option value="en">全英文交流 (English Mock Interview)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Web Search Feature Switch */}
        <div className="bg-gray-900/70 border border-gray-800 rounded-3xl p-5 transition-colors hover:border-blue-500/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mt-0.5 shadow-inner">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-gray-200">
                    联网搜索功能 (Web Search)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white tracking-wide">
                    NEW
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                  开启后，面试官提问与 AI 模拟回答助手将实时联网检索最新技术规范、大厂高频面试真题与最佳实践方案（面试中亦可在顶部随时切换）。
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 sm:ml-4 sm:justify-end">
              <button
                type="button"
                onClick={() => setSearchConfigOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-300 transition hover:border-emerald-700 hover:text-emerald-300"
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span>{hasLocalSearchKey ? 'Tavily 已配置' : '配置搜索引擎'}</span>
              </button>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={webSearchEnabled}
                  onChange={(e) => setWebSearchEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        <SearchConfigModal open={searchConfigOpen} onClose={() => setSearchConfigOpen(false)} />

        {/* Start Button */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isLoading || isUploading}
            className="group relative inline-flex items-center space-x-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-blue-500/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>正在根据岗位定制考题并召集面试团...</span>
              </>
            ) : (
              <>
                <span>开启多 Agent 模拟面试</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
          <p className="flex items-center space-x-1.5 text-[11px] text-gray-500">
            <Cpu className="w-3 h-3" />
            {customModel ? (
              <span>
                本次面试将使用前端自定义模型 <span className="text-blue-400 font-medium">{customModel}</span>
              </span>
            ) : (
              <span>使用后端默认大模型配置（可在右上角「模型配置」随时切换）</span>
            )}
          </p>
        </div>
      </form>
    </div>
  );
};
