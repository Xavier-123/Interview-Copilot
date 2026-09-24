import React, { useState, useMemo } from 'react';
import {
  FileText,
  X,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Briefcase,
  GraduationCap,
  Award,
  Layers,
  HelpCircle,
  Lightbulb,
  Loader2,
} from 'lucide-react';
import type { SavedResumeDetail, ResumeProfile } from '../types';
import { calculateResumeCompleteness } from '../utils/resumeUtils';
import { useTheme } from '../context/ThemeContext';

export interface EditProjectItem {
  name: string;
  role: string;
  tech_stack: string;
  highlights: string;
}

export interface ResumeEditorFormState {
  id: string;
  filename: string;
  name: string;
  job_role: string;
  experience_years: string;
  education: string;
  skills: string[];
  summary_profile: string;
  projects: EditProjectItem[];
  raw_text: string;
  reparse: boolean;
}

interface ResumeEditorModalProps {
  initialData: SavedResumeDetail;
  open: boolean;
  onClose: () => void;
  onSave: (form: ResumeEditorFormState) => Promise<void>;
  saving: boolean;
  error?: string | null;
}

const POPULAR_SKILLS = [
  'React',
  'TypeScript',
  'Vue.js',
  'Node.js',
  'Next.js',
  'Python',
  'Go',
  'Java',
  'Spring Boot',
  'Docker',
  'Kubernetes',
  'Redis',
  'PostgreSQL',
  '微服务架构',
  '高并发设计',
  '性能调优',
];

export const ResumeEditorModal: React.FC<ResumeEditorModalProps> = ({
  initialData,
  open,
  onClose,
  onSave,
  saving,
  error,
}) => {
  const { isDark } = useTheme();

  // 初始化表单状态
  const [form, setForm] = useState<ResumeEditorFormState>(() => {
    const profile = initialData.parsed_profile || {};
    return {
      id: initialData.id,
      filename: initialData.filename,
      name: profile.name || '',
      job_role: profile.job_role || profile.title || '',
      experience_years:
        profile.experience_years != null ? String(profile.experience_years) : '',
      education: profile.education || '',
      skills: Array.isArray(profile.skills) ? [...profile.skills] : [],
      summary_profile: profile.summary_profile || profile.summary || '',
      projects: (profile.projects || []).map((p) => ({
        name: p.name || '',
        role: p.role || '',
        tech_stack: (p.tech_stack || []).join(', '),
        highlights: p.highlights || '',
      })),
      raw_text: initialData.raw_text || '',
      reparse: false,
    };
  });

  const [activeStep, setActiveStep] = useState<number>(1);
  const [skillInput, setSkillInput] = useState<string>('');

  // 动态构建用于评分的 profile 副本
  const currentProfile: ResumeProfile = useMemo(() => {
    return {
      name: form.name,
      job_role: form.job_role,
      experience_years: form.experience_years ? Number(form.experience_years) : undefined,
      education: form.education,
      skills: form.skills,
      summary_profile: form.summary_profile,
      projects: form.projects.map((p) => ({
        name: p.name,
        role: p.role,
        tech_stack: p.tech_stack.split(/[,，、\s]/).filter(Boolean),
        highlights: p.highlights,
      })),
    };
  }, [form]);

  // 实时完整度指标
  const completeness = useMemo(() => {
    return calculateResumeCompleteness(currentProfile, form.raw_text);
  }, [currentProfile, form.raw_text]);

  if (!open) return null;

  // 技能标签添加
  const handleAddSkill = (skillToAdd?: string) => {
    const target = (skillToAdd || skillInput).trim();
    if (!target) return;
    if (!form.skills.includes(target)) {
      setForm((prev) => ({
        ...prev,
        skills: [...prev.skills, target],
      }));
    }
    if (!skillToAdd) {
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skillToRemove),
    }));
  };

  // 项目增删改
  const handleAddProject = () => {
    setForm((prev) => ({
      ...prev,
      projects: [
        ...prev.projects,
        {
          name: '',
          role: '',
          tech_stack: '',
          highlights: '',
        },
      ],
    }));
  };

  const handleUpdateProject = (index: number, key: keyof EditProjectItem, val: string) => {
    setForm((prev) => {
      const nextProjects = [...prev.projects];
      nextProjects[index] = { ...nextProjects[index], [key]: val };
      return { ...prev, projects: nextProjects };
    });
  };

  const handleRemoveProject = (index: number) => {
    setForm((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index),
    }));
  };

  const handleFinalSubmit = () => {
    onSave(form);
  };

  // 步骤完成情况
  const stepStatus = [
    {
      num: 1,
      title: '基础画像',
      desc: '目标岗位与经历',
      isComplete: Boolean(form.name.trim() && (form.job_role.trim() || form.experience_years.trim())),
    },
    {
      num: 2,
      title: '核心技能',
      desc: '专业技术栈标签',
      isComplete: form.skills.length >= 3,
    },
    {
      num: 3,
      title: '竞争优势',
      desc: '自述与价值主张',
      isComplete: form.summary_profile.trim().length >= 25,
    },
    {
      num: 4,
      title: '重点项目',
      desc: 'STAR 原则量化成果',
      isComplete:
        form.projects.length > 0 &&
        form.projects.some((p) => p.name.trim() && p.highlights.trim().length >= 20),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-6xl max-h-[94vh] rounded-2xl border flex flex-col shadow-2xl overflow-hidden transition-all ${
          isDark
            ? 'bg-gray-950 border-gray-800 text-gray-100'
            : 'bg-slate-50 border-slate-200/90 text-slate-900 shadow-2xl'
        }`}
      >
        {/* ==================== 1. Header & Completeness Progress ==================== */}
        <div
          className={`px-5 py-4 border-b flex flex-col gap-3 shrink-0 ${
            isDark ? 'border-gray-800/80 bg-gray-900/60' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-500">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-bold tracking-tight">完善简历档案</h2>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      isDark
                        ? 'bg-gray-800 border-gray-700 text-gray-300'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    {form.filename}
                  </span>
                </div>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                  左侧结构化补充信息，右侧即时呈现 A4 纸张排版效果
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isDark
                  ? 'border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white'
                  : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-900'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress Bar & Emotion Tip */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-semibold">简历完整度</span>
                <span className="font-mono font-bold text-blue-500 text-sm">
                  {completeness.score}%
                </span>
              </div>
              <div className="flex items-center space-x-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span className="font-medium text-amber-500">{completeness.label}</span>
              </div>
            </div>

            <div
              className={`h-2.5 w-full rounded-full overflow-hidden p-0.5 border ${
                isDark ? 'bg-gray-900 border-gray-800' : 'bg-slate-200/70 border-slate-200'
              }`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 transition-all duration-500 ease-out shadow-xs"
                style={{ width: `${Math.max(5, completeness.score)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ==================== 2. Stepper Nav ==================== */}
        <div
          className={`px-5 py-2.5 border-b flex items-center justify-between gap-2 overflow-x-auto shrink-0 ${
            isDark ? 'border-gray-800/80 bg-gray-900/40' : 'border-slate-200/80 bg-slate-100/70'
          }`}
        >
          <div className="flex items-center space-x-1 sm:space-x-3 min-w-max">
            {stepStatus.map((step) => {
              const isActive = activeStep === step.num;
              return (
                <button
                  key={step.num}
                  type="button"
                  onClick={() => setActiveStep(step.num)}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer border ${
                    isActive
                      ? isDark
                        ? 'bg-blue-600/25 border-blue-500/50 text-blue-400 shadow-sm'
                        : 'bg-white border-blue-300 text-blue-700 shadow-xs'
                      : step.isComplete
                      ? isDark
                        ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-400'
                        : 'bg-emerald-50/70 border-emerald-200 text-emerald-700'
                      : isDark
                      ? 'border-transparent text-gray-400 hover:text-gray-200'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {step.isComplete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : isDark
                          ? 'bg-gray-800 text-gray-400'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {step.num}
                    </span>
                  )}
                  <span>{step.title}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden lg:flex items-center space-x-1 text-[11px] text-gray-400">
            <span>第 {activeStep} / 4 步</span>
          </div>
        </div>

        {/* ==================== 3. Dual-Column Content ==================== */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left: Form Editor (7 cols ~ 58%) */}
          <div className="lg:col-span-7 overflow-y-auto p-5 sm:p-6 space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/50 text-red-300 text-xs flex items-center space-x-2">
                <HelpCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Step 1: 基础画像 */}
            {activeStep === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center space-x-2 pb-1 border-b border-line-subtle">
                  <Briefcase className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold">基本档案与求职定位</h3>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">
                    简历标题 / 文件名
                  </label>
                  <input
                    type="text"
                    value={form.filename}
                    onChange={(e) => setForm({ ...form, filename: e.target.value })}
                    placeholder="例如：张晨_全栈开发_字节跳动专属版"
                    className={`w-full text-xs px-3.5 py-2.5 rounded-lg border transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 ${
                      isDark
                        ? 'bg-gray-900 border-gray-800 text-white'
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">候选人姓名</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="例如：张晨 (Chen)"
                      className={`w-full text-xs px-3.5 py-2.5 rounded-lg border transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 ${
                        isDark
                          ? 'bg-gray-900 border-gray-800 text-white'
                          : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">目标职位 / 头衔</label>
                    <input
                      type="text"
                      value={form.job_role}
                      onChange={(e) => setForm({ ...form, job_role: e.target.value })}
                      placeholder="例如：资深全栈工程师 / 前端架构师"
                      className={`w-full text-xs px-3.5 py-2.5 rounded-lg border transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 ${
                        isDark
                          ? 'bg-gray-900 border-gray-800 text-white'
                          : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">工作年限（年）</label>
                    <input
                      type="number"
                      min={0}
                      value={form.experience_years}
                      onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
                      placeholder="例如：5"
                      className={`w-full text-xs px-3.5 py-2.5 rounded-lg border transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 ${
                        isDark
                          ? 'bg-gray-900 border-gray-800 text-white'
                          : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">学历与院校</label>
                    <input
                      type="text"
                      value={form.education}
                      onChange={(e) => setForm({ ...form, education: e.target.value })}
                      placeholder="例如：北京邮电大学 · 计算机科学与技术 · 本科"
                      className={`w-full text-xs px-3.5 py-2.5 rounded-lg border transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 ${
                        isDark
                          ? 'bg-gray-900 border-gray-800 text-white'
                          : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: 核心技能 */}
            {activeStep === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center space-x-2 pb-1 border-b border-line-subtle">
                  <Layers className="w-4 h-4 text-purple-500" />
                  <h3 className="text-sm font-bold">专业技能矩阵</h3>
                </div>

                <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                  技术栈不仅是关键词，更是面试官出题的题眼。建议列举 5~8 项熟练度最高的核心技术。
                </p>

                {/* Input with Add Button */}
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSkill();
                      }
                    }}
                    placeholder="输入技术栈按回车添加，如：React 19、高并发、Kafka..."
                    className={`flex-1 text-xs px-3.5 py-2.5 rounded-lg border transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/15 ${
                      isDark
                        ? 'bg-gray-900 border-gray-800 text-white'
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddSkill()}
                    className="inline-flex items-center space-x-1 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加</span>
                  </button>
                </div>

                {/* Current Skills Tags */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold flex items-center justify-between">
                    <span>已包含的技术栈 ({form.skills.length})</span>
                    {form.skills.length < 3 && (
                      <span className="text-[11px] text-amber-500">建议至少录入 3 项</span>
                    )}
                  </div>
                  <div
                    className={`p-3.5 rounded-xl border min-h-[72px] flex flex-wrap gap-2 ${
                      isDark ? 'bg-gray-900/50 border-gray-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    {form.skills.length === 0 ? (
                      <span className="text-xs text-gray-400 italic py-2">
                        暂未录入任何技能，可直接从下方热门标签点击添加
                      </span>
                    ) : (
                      form.skills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-300 text-xs font-medium animate-fade-in"
                        >
                          <span>{skill}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSkill(skill)}
                            className="text-purple-400 hover:text-purple-600 dark:hover:text-purple-200"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Suggested Quick Add Chips */}
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold flex items-center space-x-1.5 text-gray-400">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    <span>热门技术栈快速点击添加：</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_SKILLS.map((item) => {
                      const alreadyHas = form.skills.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          disabled={alreadyHas}
                          onClick={() => handleAddSkill(item)}
                          className={`text-[11px] px-2.5 py-1 rounded-md border transition cursor-pointer ${
                            alreadyHas
                              ? 'opacity-40 border-transparent bg-gray-500/10 line-through cursor-not-allowed'
                              : isDark
                              ? 'bg-gray-900 border-gray-800 hover:border-purple-500/60 text-gray-300 hover:text-white'
                              : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                          }`}
                        >
                          + {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: 个人竞争优势 */}
            {activeStep === 3 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center space-x-2 pb-1 border-b border-line-subtle">
                  <Award className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-bold">个人竞争优势与核心自述</h3>
                </div>

                <div
                  className={`p-3.5 rounded-xl border space-y-1.5 ${
                    isDark
                      ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                      : 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center space-x-1.5">
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>撰写小贴士 (Elevator Pitch)</span>
                  </div>
                  <p className="text-xs leading-relaxed opacity-90">
                    HR 扫读一份简历只有 6 秒。好的自述应包含：<strong>“从业年限 + 核心专精领域 + 曾解决的最亮眼技术/业务问题”</strong>。
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold">个人总结与亮点阐述</label>
                    <span
                      className={`text-[11px] ${
                        form.summary_profile.length >= 30 ? 'text-emerald-500' : 'text-gray-400'
                      }`}
                    >
                      {form.summary_profile.length} 字 (建议 40~150 字)
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={form.summary_profile}
                    onChange={(e) => setForm({ ...form, summary_profile: e.target.value })}
                    placeholder="写下你最自豪的技术沉淀与业务贡献...&#10;例如：8 年一线大型互联网研发架构经验，深度精通高并发分布式系统与微服务治理。曾主导千万级核心电商交易链路重构，将端到端延迟降低 45%，保障多次大促零故障稳定运行..."
                    className={`w-full text-xs p-3.5 rounded-lg border transition-all duration-200 leading-relaxed placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 ${
                      isDark
                        ? 'bg-gray-900 border-gray-800 text-white'
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Step 4: 重点项目经历 */}
            {activeStep === 4 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between pb-1 border-b border-line-subtle">
                  <div className="flex items-center space-x-2">
                    <GraduationCap className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-bold">重点项目经历 (STAR 深度复盘)</h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddProject}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加项目</span>
                  </button>
                </div>

                <div
                  className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
                    isDark
                      ? 'bg-indigo-950/20 border-indigo-800/40 text-indigo-300'
                      : 'bg-indigo-50/70 border-indigo-200 text-indigo-800'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>
                    <strong>STAR 黄金法则</strong>：情境 (Situation) ➔ 任务 (Task) ➔ 行动 (Action) ➔ 成果量化 (Result，如性能提速 60%、错误率降至 0.1%)。
                  </span>
                </div>

                {form.projects.length === 0 ? (
                  <div className="py-8 text-center border border-dashed rounded-xl p-6 space-y-3">
                    <p className="text-xs text-gray-400">
                      暂无项目经历，项目是面试官最深入考察的模块，建议至少录入 1~2 个深度项目！
                    </p>
                    <button
                      type="button"
                      onClick={handleAddProject}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      立即添加第一个项目
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {form.projects.map((proj, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border space-y-3 relative group transition-all ${
                          isDark ? 'bg-gray-900/60 border-gray-800' : 'bg-white border-slate-200 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center space-x-1.5 text-blue-500">
                            <span>项目 #{idx + 1}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveProject(idx)}
                            className="text-gray-400 hover:text-red-500 p-1 rounded transition"
                            title="删除此项目"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-gray-400">项目名称</label>
                            <input
                              type="text"
                              value={proj.name}
                              onChange={(e) => handleUpdateProject(idx, 'name', e.target.value)}
                              placeholder="例如：高并发实时交易路由引擎"
                              className={`w-full text-xs px-3 py-2 rounded-lg border transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 ${
                                isDark
                                  ? 'bg-gray-950 border-gray-800 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-900'
                              }`}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-gray-400">担任角色</label>
                            <input
                              type="text"
                              value={proj.role}
                              onChange={(e) => handleUpdateProject(idx, 'role', e.target.value)}
                              placeholder="例如：核心架构设计 / Tech Lead"
                              className={`w-full text-xs px-3 py-2 rounded-lg border transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 ${
                                isDark
                                  ? 'bg-gray-950 border-gray-800 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-900'
                              }`}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-gray-400">
                            使用技术栈（逗号分隔）
                          </label>
                          <input
                            type="text"
                            value={proj.tech_stack}
                            onChange={(e) => handleUpdateProject(idx, 'tech_stack', e.target.value)}
                            placeholder="例如：Go, gRPC, Redis, Kafka, Kubernetes"
                            className={`w-full text-xs px-3 py-2 rounded-lg border transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 ${
                              isDark
                                ? 'bg-gray-950 border-gray-800 text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-900'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-gray-400">
                            核心贡献与量化成果 (STAR 原则)
                          </label>
                          <textarea
                            rows={4}
                            value={proj.highlights}
                            onChange={(e) => handleUpdateProject(idx, 'highlights', e.target.value)}
                            placeholder="写下具体的难点与收益...&#10;例如：针对高峰期消息堆积瓶颈，设计多级局部缓存与批量异步落盘机制，使得整体吞吐能力提升 3.8 倍，P99 响应耗时从 450ms 下降至 38ms，全年保持 99.99% 高可用。"
                            className={`w-full text-xs p-3 rounded-lg border transition-all duration-200 leading-relaxed placeholder:text-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 ${
                              isDark
                                ? 'bg-gray-950 border-gray-800 text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-900'
                            }`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step Prev / Next Buttons */}
            <div className="pt-4 border-t border-line-subtle flex items-center justify-between">
              {activeStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveStep((prev) => prev - 1)}
                  className={`inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg border text-xs font-medium transition cursor-pointer ${
                    isDark
                      ? 'border-gray-800 hover:bg-gray-800 text-gray-300'
                      : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>上一步</span>
                </button>
              ) : (
                <div />
              )}

              {activeStep < 4 ? (
                <button
                  type="button"
                  onClick={() => setActiveStep((prev) => prev + 1)}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  <span>下一步</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={saving}
                  className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/30 transition cursor-pointer"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>完成并保存简历</span>
                </button>
              )}
            </div>
          </div>

          {/* Right: Real-time Paper Preview Sheet (5 cols ~ 42%) */}
          <div
            className={`lg:col-span-5 p-5 sm:p-6 overflow-y-auto border-t lg:border-t-0 lg:border-l ${
              isDark ? 'border-gray-800/80 bg-gray-900/40' : 'border-slate-200 bg-slate-100/60'
            }`}
          >
            <div className="space-y-3 sticky top-0">
              {/* Floating Encouragement Banner */}
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-xs ${
                  isDark
                    ? 'bg-blue-950/40 border-blue-800/50 text-blue-300'
                    : 'bg-white border-blue-200 text-blue-800'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="font-medium">
                    看起来很棒！实时预览将作为面试官视角渲染
                  </span>
                </div>
              </div>

              {/* Simulated A4 Paper Card */}
              <div
                className={`p-6 sm:p-7 rounded-xl border transition-all min-h-[540px] space-y-5 ${
                  isDark
                    ? 'bg-gray-900 border-gray-800 shadow-xl'
                    : 'bg-white border-slate-200 shadow-[0_16px_40px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]'
                }`}
              >
                {/* Paper Header */}
                <div className="space-y-1.5 border-b pb-4 border-line-subtle">
                  <div className="flex items-center justify-between">
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                      {form.name.trim() || '候选人姓名'}
                    </h1>
                    {form.job_role && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        {form.job_role}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                    {form.experience_years && (
                      <span>{form.experience_years} 年行业经验</span>
                    )}
                    {form.education && (
                      <>
                        <span>·</span>
                        <span>{form.education}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Paper Section 1: Professional Summary */}
                {form.summary_profile && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                      核心竞争优势 / Professional Summary
                    </div>
                    <p className="text-xs leading-relaxed text-slate-700 dark:text-gray-300 p-2.5 rounded-lg bg-slate-50 dark:bg-gray-950/60 border border-line-subtle">
                      {form.summary_profile}
                    </p>
                  </div>
                )}

                {/* Paper Section 2: Skills */}
                {form.skills.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                      技术栈矩阵 / Core Competencies
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {form.skills.map((skill) => (
                        <span
                          key={skill}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-gray-800 text-slate-800 dark:text-gray-200 text-[11px] font-medium border border-line-subtle"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Paper Section 3: Projects */}
                {form.projects.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                      重点项目经验 / Featured Projects
                    </div>
                    <div className="space-y-3">
                      {form.projects.map((proj, i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-gray-100">
                            <span>{proj.name || `未命名项目 #${i + 1}`}</span>
                            {proj.role && (
                              <span className="text-[11px] text-blue-600 dark:text-blue-400 font-normal">
                                {proj.role}
                              </span>
                            )}
                          </div>
                          {proj.tech_stack && (
                            <div className="text-[11px] text-slate-500 dark:text-gray-400 font-mono">
                              技术栈: {proj.tech_stack}
                            </div>
                          )}
                          {proj.highlights && (
                            <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap pl-2 border-l-2 border-blue-500/40">
                              {proj.highlights}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ==================== 4. Modal Footer ==================== */}
        <div
          className={`px-5 py-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 ${
            isDark ? 'border-gray-800 bg-gray-900/60' : 'border-slate-200 bg-white'
          }`}
        >
          <label className="flex items-center space-x-2 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.reparse}
              onChange={(e) => setForm({ ...form, reparse: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-gray-600 accent-blue-600 cursor-pointer"
            />
            <span>保存时同步触发 AI 重新解析</span>
          </label>

          <div className="flex items-center space-x-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg border text-xs font-medium transition cursor-pointer ${
                isDark
                  ? 'border-gray-800 hover:bg-gray-800 text-gray-300'
                  : 'border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={saving}
              className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-900/20 transition cursor-pointer"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>保存更新</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
