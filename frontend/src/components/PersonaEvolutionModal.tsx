import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  User,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Sliders,
  Award,
  MessageSquare,
  Flame,
} from 'lucide-react';
import type { Persona } from '../types';
import { apiFetch } from '../utils/api';

interface SimulationTurn {
  round: number;
  speaker: string;
  role: string;
  name: string;
  content: string;
  topic?: string;
}

interface CriticDefect {
  round?: number;
  description: string;
  severity?: 'high' | 'medium' | 'low';
  suggestion?: string;
}

interface EvolutionResult {
  persona_id: string;
  persona_name: string;
  topic: string;
  simulation_transcript: SimulationTurn[];
  critic_report: {
    critique_score?: number;
    defects?: CriticDefect[];
    overall_evaluation?: string;
    strengths?: string[];
  };
  original_spec: {
    name: string;
    avatar: string;
    description: string;
    system_prompt: string;
    skepticism_level: number;
    focus_topics: string[];
    deep_dive_hint?: string;
    probe_hint?: string;
  };
  optimized_spec: {
    system_prompt: string;
    negative_rules: string[];
    golden_few_shots: string[];
    skepticism_level: number;
    deep_dive_hint?: string;
    probe_hint?: string;
    optimization_rationale?: string;
  };
}

interface PersonaEvolutionModalProps {
  open: boolean;
  persona: Persona | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CANDIDATE_BEHAVIORS = [
  { key: 'vague', label: '含糊套话型', desc: '堆砌概念术语，回避落地细节，测试面试官穿透力' },
  { key: 'memorized', label: '死记硬背型', desc: '照本宣科复述八股文，测试能否灵活考察底层原理' },
  { key: 'adversarial', label: '犀利对抗型', desc: '反驳质疑或提出苛刻边界条件，测试面试官控场与应变' },
  { key: 'standard', label: '标准平稳型', desc: '中规中矩常态回答，全方位考察面试官节奏与评分' },
];

export const PersonaEvolutionModal: React.FC<PersonaEvolutionModalProps> = ({
  open,
  persona,
  onClose,
  onSuccess,
}) => {
  const [candidateBehavior, setCandidateBehavior] = useState('vague');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvolutionResult | null>(null);
  const [activeTab, setActiveTab] = useState<'solution' | 'transcript' | 'critic'>('solution');
  const [applying, setApplying] = useState(false);
  const [customV2Name, setCustomV2Name] = useState('');

  // 初始化主题选择
  useEffect(() => {
    if (persona) {
      setSelectedTopic(persona.focus_topics?.[0] || '核心技术架构与落地难点');
      setCustomV2Name(`${persona.name} (V2 进化版)`);
      setResult(null);
      setError(null);
    }
  }, [persona]);

  // 触发仿真推演
  const handleStartEvolution = async () => {
    if (!persona) return;
    setLoading(true);
    setError(null);
    setLoadingStep(1);

    // 动态步进模拟动画，提升交互体感
    const timer1 = setTimeout(() => setLoadingStep(2), 2000);
    const timer2 = setTimeout(() => setLoadingStep(3), 6000);
    const timer3 = setTimeout(() => setLoadingStep(4), 10000);

    try {
      const json = await apiFetch<{ data: any }>(`/api/v1/personas/${persona.id}/auto-evolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_topic: selectedTopic || undefined,
          candidate_behavior: candidateBehavior,
        }),
      });

      setResult(json.data);
      setActiveTab('solution');
    } catch (err: any) {
      setError(err.message || '仿真演练异常');
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setLoading(false);
    }
  };

  // 应用优化成果（覆盖或另存新版本）
  const handleApply = async (mode: 'overwrite' | 'save_as_new') => {
    if (!persona || !result) return;
    setApplying(true);
    try {
      const payload = {
        apply_mode: mode,
        optimized_system_prompt: result.optimized_spec.system_prompt,
        skepticism_level: result.optimized_spec.skepticism_level,
        deep_dive_hint: result.optimized_spec.deep_dive_hint,
        probe_hint: result.optimized_spec.probe_hint,
        negative_rules: result.optimized_spec.negative_rules,
        golden_few_shots: result.optimized_spec.golden_few_shots,
        new_name: mode === 'save_as_new' ? customV2Name.trim() || undefined : undefined,
      };

      await apiFetch(`/api/v1/personas/${persona.id}/apply-evolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      alert(mode === 'overwrite' ? '✅ 优化方案已成功覆盖更新当前面试官！' : '🎉 已成功将优化成果另存为全新角色版本！');
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setApplying(false);
    }
  };

  if (!open || !persona) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-surface border border-line-default rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line-subtle shrink-0 bg-surface-subtle">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-100 to-fuchsia-100 border border-violet-200 dark:from-violet-600/30 dark:to-fuchsia-600/30 dark:border-violet-500/40 flex items-center justify-center text-xl shrink-0">
              {persona.avatar || '🎭'}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-content-primary flex items-center gap-1.5">
                  <span>一键迭代优化面试官</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 dark:bg-violet-950/80 dark:border-violet-700/60 dark:text-violet-300 font-normal">
                    AI Auto-Evolution
                  </span>
                </h2>
              </div>
              <p className="text-xs text-content-secondary mt-0.5">
                对战目标：<span className="text-content-primary font-medium">{persona.name}</span>
                <span className="mx-2 text-content-placeholder">|</span>
                通过推演仿真发现机械破绽与套话，定向升级人设、避坑铁律与黄金范式
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-2 text-content-secondary hover:text-content-primary rounded-xl hover:bg-surface-hover transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Bar */}
        <div className="px-6 py-3 bg-surface border-b border-line-subtle shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-content-secondary font-medium">对抗候选人风格:</span>
            <div className="flex rounded-xl bg-surface-subtle p-1 border border-line-subtle">
              {CANDIDATE_BEHAVIORS.map((cb) => (
                <button
                  key={cb.key}
                  disabled={loading || applying}
                  onClick={() => setCandidateBehavior(cb.key)}
                  className={`text-xs px-3 py-1 rounded-lg transition ${
                    candidateBehavior === cb.key
                      ? 'bg-violet-600 text-white font-medium shadow-sm'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                  title={cb.desc}
                >
                  {cb.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleStartEvolution}
              disabled={loading || applying}
              className="flex items-center space-x-1.5 text-xs px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium shadow-lg shadow-violet-900/20 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{result ? '重新推演进化' : '开始仿真推演对战'}</span>
            </button>
          </div>
        </div>

        {/* Modal Main Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">
          {loading ? (
            /* Loading Pipeline View */
            <div className="h-full flex flex-col items-center justify-center space-y-8 animate-fadeIn">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-violet-50 border border-violet-200 dark:bg-violet-600/10 dark:border-violet-500/30 flex items-center justify-center animate-pulse">
                  <Flame className="w-10 h-10 text-violet-500 dark:text-violet-400 animate-bounce" />
                </div>
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-sm font-semibold text-content-primary">面试官认知推演与自演进闭环进行中</h3>
                <p className="text-xs text-content-secondary">系统正通过真实对抗推演发现破绽并提炼高维追问经验...</p>
              </div>

              {/* Step indicator */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 w-full max-w-2xl">
                {[
                  { step: 1, title: '候选人画像匹配', desc: CANDIDATE_BEHAVIORS.find(c => c.key === candidateBehavior)?.label },
                  { step: 2, title: '双轮仿真对抗', desc: '真实模拟问答多轮交互' },
                  { step: 3, title: 'Critic 缺陷诊断', desc: '深度审查套话与穿透力' },
                  { step: 4, title: '综合方案生成', desc: '人设重塑与经验固化' },
                ].map((s) => (
                  <div
                    key={s.step}
                    className={`p-3 rounded-2xl border transition-all ${
                      loadingStep === s.step
                        ? 'bg-violet-50 border-violet-400 text-violet-700 ring-1 ring-violet-500/50 dark:bg-violet-950/40 dark:border-violet-500 dark:text-violet-300'
                        : loadingStep > s.step
                        ? 'bg-status-success-bg border-status-success-border text-status-success'
                        : 'bg-surface-subtle border-line-subtle text-content-placeholder'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 text-xs font-semibold">
                      {loadingStep > s.step ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-current text-[10px] flex items-center justify-center shrink-0">
                          {s.step}
                        </span>
                      )}
                      <span>{s.title}</span>
                    </div>
                    <p className="text-[10px] mt-1 text-content-secondary truncate">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : error ? (
            /* Error View */
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-status-danger-bg border border-status-danger-border flex items-center justify-center text-status-danger">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-status-danger">仿真演进执行遇到问题</p>
                <p className="text-xs text-content-secondary max-w-md">{error}</p>
              </div>
              <button
                onClick={handleStartEvolution}
                className="text-xs px-4 py-2 rounded-xl bg-surface-hover hover:bg-surface-active text-content-primary transition"
              >
                重试
              </button>
            </div>
          ) : !result ? (
            /* Pre-start Overview View */
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-violet-50 border border-violet-200 dark:bg-violet-950/50 dark:border-violet-800/40 flex items-center justify-center text-violet-500 dark:text-violet-400">
                <Sparkles className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-content-primary">一键自演进：让面试官越练越聪明</h3>
                <p className="text-xs text-content-secondary leading-relaxed">
                  系统将为你所选的面试官实时匹配一位具有鲜明行为特征的合成候选人（如含糊套话、死记八股等），
                  自动推进仿真对战，再由后台独立 Critic 评估专家对面试官的开场白、追问穿透力与审查破绽进行多维诊断，
                  最终产出针对性优化的人设 Prompt、避坑铁律与黄金追问范例。
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-surface-subtle border border-line-subtle w-full text-left space-y-2 text-xs">
                <div className="text-content-primary font-semibold flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
                  <span>本次推演参数预设</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-content-secondary">
                  <div>
                    考察主题: <span className="text-content-primary">{selectedTopic}</span>
                  </div>
                  <div>
                    候选人风格: <span className="text-content-primary">{CANDIDATE_BEHAVIORS.find(c => c.key === candidateBehavior)?.label}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleStartEvolution}
                className="flex items-center space-x-2 text-sm px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium shadow-xl shadow-violet-900/30 transition transform hover:-translate-y-0.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>立即启动仿真推演与诊断</span>
              </button>
            </div>
          ) : (
            /* Results Presentation */
            <div className="h-full flex flex-col overflow-hidden space-y-4">
              {/* Tab Navigation */}
              <div className="flex items-center justify-between border-b border-line-subtle pb-2 shrink-0">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setActiveTab('solution')}
                    className={`flex items-center space-x-1.5 text-xs px-3.5 py-1.5 rounded-xl font-medium transition ${
                      activeTab === 'solution'
                        ? 'bg-violet-600 text-white shadow'
                        : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>优化方案对比与规则</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('transcript')}
                    className={`flex items-center space-x-1.5 text-xs px-3.5 py-1.5 rounded-xl font-medium transition ${
                      activeTab === 'transcript'
                        ? 'bg-violet-600 text-white shadow'
                        : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>仿真对战实录 (双轮攻防)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('critic')}
                    className={`flex items-center space-x-1.5 text-xs px-3.5 py-1.5 rounded-xl font-medium transition ${
                      activeTab === 'critic'
                        ? 'bg-violet-600 text-white shadow'
                        : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Critic 专家诊断 ({result.critic_report.critique_score || 8.0}分)</span>
                  </button>
                </div>

                <div className="text-xs text-content-secondary flex items-center space-x-2">
                  <span className="text-content-muted">考察点:</span>
                  <span className="text-content-secondary font-mono">{result.topic}</span>
                </div>
              </div>

              {/* Tab 1: Solution */}
              {activeTab === 'solution' && (
                <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                  {/* Summary Banner */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-50 via-indigo-50 to-surface-subtle border border-violet-200 dark:from-violet-950/40 dark:via-indigo-950/30 dark:to-gray-950/40 dark:border-violet-800/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-violet-600 dark:text-violet-400 tracking-wider">
                        核心升级说明
                      </span>
                      <p className="text-xs text-content-primary leading-relaxed">
                        {result.optimized_spec.optimization_rationale || '优化了提问方式，消除了客套开场白，大幅增强了对底层机制的穿透力度。'}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center space-x-3 bg-surface border border-line-subtle px-3.5 py-2 rounded-xl">
                      <div className="text-right">
                        <div className="text-[10px] text-content-muted">怀疑度调优</div>
                        <div className="text-xs font-mono font-bold text-content-primary flex items-center space-x-1">
                          <span>{result.original_spec.skepticism_level.toFixed(2)}</span>
                          <ArrowRight className="w-3 h-3 text-violet-500 dark:text-violet-400 inline" />
                          <span className="text-violet-600 dark:text-violet-300 font-bold">{result.optimized_spec.skepticism_level.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* System Prompt Comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-surface-subtle border border-line-subtle flex flex-col">
                      <div className="flex items-center justify-between pb-2 border-b border-line-subtle mb-2">
                        <span className="text-xs font-bold text-content-secondary">优化前系统提示词 (Original)</span>
                        <span className="text-[10px] text-content-muted">长度: {result.original_spec.system_prompt.length} 字</span>
                      </div>
                      <div className="text-xs text-content-secondary whitespace-pre-wrap font-mono leading-relaxed overflow-y-auto max-h-56 bg-surface p-3 rounded-xl border border-line-subtle">
                        {result.original_spec.system_prompt}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-violet-50/60 border border-violet-200 dark:bg-violet-950/20 dark:border-violet-800/40 flex flex-col">
                      <div className="flex items-center justify-between pb-2 border-b border-violet-200 dark:border-violet-800/50 mb-2">
                        <span className="text-xs font-bold text-violet-700 dark:text-violet-300 flex items-center space-x-1">
                          <Sparkles className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
                          <span>优化后系统提示词 (Optimized)</span>
                        </span>
                        <span className="text-[10px] text-violet-500/80 dark:text-violet-400/80">长度: {result.optimized_spec.system_prompt.length} 字</span>
                      </div>
                      <div className="text-xs text-content-primary whitespace-pre-wrap font-mono leading-relaxed overflow-y-auto max-h-56 bg-surface p-3 rounded-xl border border-violet-200 dark:border-violet-900/30">
                        {result.optimized_spec.system_prompt}
                      </div>
                    </div>
                  </div>

                  {/* Negative Rules & Golden Few-shots */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Negative Rules */}
                    <div className="p-4 rounded-2xl bg-surface-subtle border border-status-warning-border flex flex-col space-y-2.5">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-status-warning">
                        <ShieldAlert className="w-4 h-4 text-status-warning" />
                        <span>提炼沉淀的【避坑铁律】(采纳后写入记忆库)</span>
                      </div>
                      <div className="space-y-2">
                        {(result.optimized_spec.negative_rules || []).map((rule, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-status-warning-bg border border-status-warning-border text-amber-700 dark:text-amber-200/90 leading-relaxed flex items-start space-x-2"
                          >
                            <span className="text-amber-500 font-bold shrink-0">{idx + 1}.</span>
                            <span>{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Golden Few-shots */}
                    <div className="p-4 rounded-2xl bg-surface-subtle border border-status-success-border flex flex-col space-y-2.5">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-status-success">
                        <Award className="w-4 h-4 text-status-success" />
                        <span>提炼沉淀的【黄金示范出题】(采纳后写入记忆库)</span>
                      </div>
                      <div className="space-y-2">
                        {(result.optimized_spec.golden_few_shots || []).map((shot, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-status-success-bg border border-status-success-border text-emerald-700 dark:text-emerald-200/90 leading-relaxed flex items-start space-x-2"
                          >
                            <span className="text-emerald-500 font-bold shrink-0">✨</span>
                            <span className="italic">“{shot}”</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Transcript */}
              {activeTab === 'transcript' && (
                <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                  {result.simulation_transcript.map((msg, index) => {
                    const isInterviewer = msg.speaker === 'interviewer';
                    return (
                      <div
                        key={index}
                        className={`flex gap-3 ${isInterviewer ? 'justify-start' : 'justify-end'}`}
                      >
                        {isInterviewer && (
                          <div className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-200 dark:bg-violet-950/60 dark:border-violet-800/60 flex items-center justify-center text-sm shrink-0">
                            {persona.avatar || '🎭'}
                          </div>
                        )}
                        <div
                          className={`max-w-2xl rounded-2xl p-3.5 text-xs leading-relaxed space-y-1 ${
                            isInterviewer
                              ? 'bg-surface-subtle border border-line-subtle text-content-primary'
                              : 'bg-indigo-50 border border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800/50 dark:text-indigo-100'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] text-content-muted">
                            <span className="font-semibold text-content-secondary">
                              {isInterviewer ? `${persona.name} (第${msg.round}轮提问)` : `合成候选人 (${CANDIDATE_BEHAVIORS.find(c => c.key === candidateBehavior)?.label})`}
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                        {!isInterviewer && (
                          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 dark:bg-indigo-950/60 dark:border-indigo-800/60 flex items-center justify-center text-sm shrink-0">
                            <User className="w-4 h-4 text-indigo-500 dark:text-indigo-300" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tab 3: Critic Report */}
              {activeTab === 'critic' && (
                <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                  <div className="p-4 rounded-2xl bg-surface-subtle border border-line-subtle flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-content-primary">Critic 诊断评分与结论</div>
                      <p className="text-xs text-content-secondary mt-1">
                        {result.critic_report.overall_evaluation || '该面试官风格明确，但在应对套话回答时仍需强化极限追问，避免被表面术语带偏。'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-content-muted">综合诊断分</div>
                      <div className="text-xl font-bold font-mono text-violet-600 dark:text-violet-400">
                        {result.critic_report.critique_score || 8.0}
                        <span className="text-xs text-content-muted"> / 10.0</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <span className="text-xs font-bold text-content-secondary">检测到的缺陷项与改进建议 ({result.critic_report.defects?.length || 0}项)</span>
                    {(result.critic_report.defects || []).length === 0 ? (
                      <div className="p-6 text-center text-xs text-content-secondary bg-surface-subtle rounded-2xl border border-line-subtle">
                        未检测到明显失真缺陷，面试官综合表现良好
                      </div>
                    ) : (
                      result.critic_report.defects?.map((defect, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl bg-surface-subtle border border-line-subtle space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-rose-600 dark:text-rose-300 flex items-center space-x-1.5">
                              <AlertCircleIcon />
                              <span>{defect.description}</span>
                            </span>
                            {defect.severity && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-600 dark:bg-rose-950/60 dark:border-rose-800/50 dark:text-rose-300 uppercase">
                                {defect.severity}
                              </span>
                            )}
                          </div>
                          {defect.suggestion && (
                            <p className="text-xs text-content-secondary pl-4 border-l-2 border-violet-400 dark:border-violet-500/40 mt-1">
                              建议: {defect.suggestion}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Actions */}
        {result && (
          <div className="px-6 py-4 bg-surface-subtle border-t border-line-subtle shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <input
                type="text"
                value={customV2Name}
                onChange={(e) => setCustomV2Name(e.target.value)}
                placeholder="新版本名称"
                className="text-xs px-3 py-2 rounded-xl bg-surface border border-line-default text-content-primary focus:outline-none focus:border-violet-500 w-44"
              />
              <button
                type="button"
                onClick={() => handleApply('save_as_new')}
                disabled={applying}
                className="text-xs px-3.5 py-2 rounded-xl bg-surface-hover hover:bg-surface-active text-content-primary transition font-medium disabled:opacity-50"
              >
                另存为新版本
              </button>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="text-xs px-3.5 py-2 rounded-xl bg-transparent hover:bg-surface-hover text-content-secondary hover:text-content-primary transition"
              >
                放弃本次优化
              </button>
              <button
                type="button"
                onClick={() => handleApply('overwrite')}
                disabled={applying}
                className="flex items-center space-x-1.5 text-xs px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold shadow-lg shadow-violet-900/30 transition disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>一键覆盖应用优化成果</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AlertCircleIcon: React.FC = () => (
  <svg
    className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <circle cx="12" cy="12" r="10" strokeWidth="2" />
    <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" />
    <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" />
  </svg>
);
