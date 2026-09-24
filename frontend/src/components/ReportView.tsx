import React, { useState, useEffect } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Printer,
  Copy,
  Calendar,
  Target,
  Check,
  Download,
  Share2,
  Trophy,
  Zap,
  BookOpen,
  GitCompareArrows,
} from 'lucide-react';
import type { EvaluationReport, DrillCardItem, HistorySessionItem } from '../types';
import { useTheme } from '../context/ThemeContext';
import { ScorecardShareModal } from './ScorecardShareModal';
import { ComparisonModal } from './ComparisonModal';
import { apiFetch } from '../utils/api';

interface ReportViewProps {
  report: EvaluationReport;
  onRestart: () => void;
  onRechallenge?: () => void;
  sessionId?: string;
  /** 返回上一页（历史档案或控制台）；不传则不显示返回按钮 */
  onBack?: () => void;
  backLabel?: string;
}

export const ReportView: React.FC<ReportViewProps> = ({
  report,
  onRestart,
  onRechallenge,
  sessionId,
  onBack,
  backLabel = '返回',
}) => {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [activeDrillModal, setActiveDrillModal] = useState<DrillCardItem | null>(null);
  const [drillAnswer, setDrillAnswer] = useState('');
  const [drillSubmitted, setDrillSubmitted] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  /** 与本场对比的基准场次（优先同岗位、早于本场且有复盘报告的最近一场） */
  const [prevSession, setPrevSession] = useState<HistorySessionItem | null>(null);
  /** 上一场检索是否已结束，用于区分「加载中」与「确实没有可对比场次」 */
  const [prevLookupDone, setPrevLookupDone] = useState(!sessionId);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const lookupPreviousSession = async () => {
      try {
        const data = await apiFetch<{ history?: HistorySessionItem[] }>('/api/v1/interviews/history');
        const all = data.history || [];
        const current = all.find((h) => h.session_id === sessionId);
        let pool = all.filter((h) => h.has_report && h.session_id !== sessionId);
        // 只保留早于本场的场次；拿不到本场时间（如刚生成报告尚未落库）时退化为全部候选
        if (current?.created_at) {
          const currentTime = new Date(current.created_at).getTime();
          const earlier = pool.filter((h) => new Date(h.created_at).getTime() < currentTime);
          if (earlier.length > 0) pool = earlier;
        }
        pool.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        // 同岗位优先，找不到同岗位再退回任意岗位的最近一场
        const sameRole = current?.job_role
          ? pool.filter((h) => h.job_role === current.job_role)
          : [];
        if (!cancelled) setPrevSession((sameRole.length > 0 ? sameRole : pool)[0] ?? null);
      } catch (err) {
        console.error('Failed to lookup previous session for comparison:', err);
      } finally {
        if (!cancelled) setPrevLookupDone(true);
      }
    };

    lookupPreviousSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const radarData = [
    { subject: '技术深度', score: report.radar_scores.technical_depth, fullMark: 10 },
    { subject: '技术广度', score: report.radar_scores.technical_breadth, fullMark: 10 },
    { subject: '表达逻辑', score: report.radar_scores.communication_logic, fullMark: 10 },
    { subject: 'STAR规范', score: report.radar_scores.star_completeness, fullMark: 10 },
    { subject: '抗压韧性', score: report.radar_scores.stress_resilience, fullMark: 10 },
    { subject: '岗位契合', score: report.radar_scores.job_matching, fullMark: 10 },
  ];

  // Calculate composite score (0-100) & tier
  const scores = report.radar_scores;
  const avg =
    (scores.technical_depth +
      scores.technical_breadth +
      scores.communication_logic +
      scores.star_completeness +
      scores.stress_resilience +
      scores.job_matching) /
    6;
  const compositeScore = Math.min(100, Math.round(avg * 10));

  const getTierInfo = (score: number) => {
    if (score >= 90) return { tier: 'S', label: '卓越强推', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', beat: '96%' };
    if (score >= 80) return { tier: 'A+', label: '建议录用', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40', beat: '88%' };
    if (score >= 70) return { tier: 'A', label: '契合度高', badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', beat: '76%' };
    if (score >= 60) return { tier: 'B', label: '具备潜力', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', beat: '58%' };
    return { tier: 'C', label: '待加练提升', badge: 'bg-red-500/20 text-red-300 border-red-500/40', beat: '32%' };
  };

  const tierInfo = getTierInfo(compositeScore);

  const radarMetrics = [
    { label: '技术深度', val: scores.technical_depth, max: 10 },
    { label: '技术广度', val: scores.technical_breadth, max: 10 },
    { label: '表达逻辑', val: scores.communication_logic, max: 10 },
    { label: 'STAR规范', val: scores.star_completeness, max: 10 },
    { label: '抗压韧性', val: scores.stress_resilience, max: 10 },
    { label: '岗位契合', val: scores.job_matching, max: 10 },
  ];

  const getVerdictStyle = (verdict: string) => {
    if (verdict.includes('强烈推荐') || verdict.includes('通过')) {
      return 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300';
    }
    if (verdict.includes('待定')) {
      return 'bg-amber-950/60 border-amber-700/60 text-amber-300';
    }
    return 'bg-red-950/60 border-red-700/60 text-red-300';
  };

  const handleCopyMarkdown = () => {
    const mdLines = [
      `# 模拟面试多维能力诊断报告`,
      `**综合评级**：${tierInfo.tier} 级 · ${tierInfo.label}（${compositeScore} 分）`,
      `**综合结论**：${report.match_verdict}`,
      `\n**总体评估**：\n${report.overall_summary}\n`,
      `### 六维能力得分`,
      `- 技术深度：${report.radar_scores.technical_depth}/10`,
      `- 技术广度：${report.radar_scores.technical_breadth}/10`,
      `- 表达逻辑：${report.radar_scores.communication_logic}/10`,
      `- STAR规范：${report.radar_scores.star_completeness}/10`,
      `- 抗压韧性：${report.radar_scores.stress_resilience}/10`,
      `- 岗位契合：${report.radar_scores.job_matching}/10\n`,
      `### 核心优势`,
      ...report.strengths.map((s) => `- ${s}`),
      `\n### 待提升盲区`,
      ...report.weaknesses.map((w) => `- ${w}`),
    ];
    navigator.clipboard.writeText(mdLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`min-h-screen py-8 px-4 transition-colors duration-200 ${isDark ? 'bg-[#0B0F17] text-gray-100' : 'bg-[#F8FAFC] text-gray-800'}`}>
      <div className="max-w-5xl mx-auto space-y-8 print:p-0 print:space-y-4">
        {/* Back Navigation */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={`inline-flex items-center space-x-1.5 text-xs transition print:hidden cursor-pointer ${
              isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{backLabel}</span>
          </button>
        )}

        {/* 1. Header & Overall Hero Verdict */}
        <div
          className={`rounded-3xl p-6 sm:p-8 border shadow-xl relative overflow-hidden transition-all print:border-none print:shadow-none ${
            isDark
              ? 'bg-gradient-to-b from-[#111827] via-[#0F172A] to-[#0B0F19] border-gray-800 text-white'
              : 'bg-white border-gray-200 text-gray-900 shadow-card'
          }`}
        >
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
            <div className="space-y-2">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-semibold">
                <Trophy className="w-3.5 h-3.5 text-blue-400" />
                <span>多 Agent 模拟面试诊断认证</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                模拟面试多维能力诊断报告
              </h1>
              <p className={`text-xs max-w-xl ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                基于多位面试官协同博弈与影子观察员全维度质检，为您输出客观量化战报与个性化冲刺建议。
              </p>
            </div>

            {/* Hero Score Badge & Quick Actions */}
            <div
              className={`flex flex-wrap items-center gap-4 p-4 rounded-2xl border backdrop-blur-sm self-start lg:self-auto ${
                isDark ? 'bg-black/40 border-white/5' : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-baseline space-x-1.5">
                <span className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-emerald-400 tabular-nums">
                  {compositeScore}
                </span>
                <span className="text-gray-400 text-xs font-semibold">/ 100分</span>
              </div>

              <div className="space-y-1">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${tierInfo.badge}`}>
                  {tierInfo.tier} 级 · {tierInfo.label}
                </span>
                <div className="text-[11px] text-gray-400">
                  🔥 战胜全网 <span className="text-emerald-400 font-bold">{tierInfo.beat}</span> 候选人
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center space-x-2 border-l border-gray-700/40 pl-3">
                <button
                  type="button"
                  onClick={() => setShowShareModal(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-500/20 transition cursor-pointer"
                  title="生成精美战报卡并分享"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>分享战报</span>
                </button>

                <button
                  type="button"
                  onClick={onRechallenge || onRestart}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-500/20 transition cursor-pointer"
                  title="以当前配置重新发起模拟挑战"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>再次挑战</span>
                </button>

                {/* 与上一场对比：把「历史对比」入口放到最有语境的报告页 */}
                {prevSession ? (
                  <button
                    type="button"
                    onClick={() => setCompareOpen(true)}
                    className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs shadow-md shadow-violet-500/20 transition cursor-pointer"
                    title={`与「${prevSession.title}」对比六维能力演进`}
                  >
                    <GitCompareArrows className="w-3.5 h-3.5" />
                    <span>与上一场对比</span>
                  </button>
                ) : prevLookupDone ? (
                  <button
                    type="button"
                    disabled
                    className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-not-allowed ${
                      isDark ? 'border-gray-800 text-gray-500' : 'border-gray-300 text-gray-400'
                    }`}
                    title="完成 2 场及以上模拟后，即可与上一场做六维演进对比"
                  >
                    <GitCompareArrows className="w-3.5 h-3.5" />
                    <span>与上一场对比</span>
                  </button>
                ) : null}

                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className={`p-2 rounded-xl border transition cursor-pointer ${
                      isDark ? 'border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white' : 'border-gray-300 hover:bg-gray-100 text-gray-600'
                    }`}
                    title="打印 / 导出 PDF"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyMarkdown}
                    className={`p-2 rounded-xl border transition cursor-pointer ${
                      isDark ? 'border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white' : 'border-gray-300 hover:bg-gray-100 text-gray-600'
                    }`}
                    title="复制 Markdown 报告"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {sessionId && (
                    <a
                      href={`/api/v1/interviews/${sessionId}/export?format=markdown`}
                      download
                      className={`p-2 rounded-xl border transition cursor-pointer ${
                        isDark ? 'border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white' : 'border-gray-300 hover:bg-gray-100 text-gray-600'
                      }`}
                      title="下载完整面试对话（Markdown）"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Overall Conclusion Banner */}
          <div
            className={`p-4 rounded-2xl border text-xs leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDark ? 'bg-gray-950/70 border-gray-800 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}
          >
            <div>
              <span className="font-bold text-blue-500 mr-2">【综合考评结论】</span>
              <span>{report.overall_summary}</span>
            </div>
            <span className={`shrink-0 px-3 py-1 rounded-xl text-xs font-bold border self-start sm:self-auto ${getVerdictStyle(report.match_verdict)}`}>
              {report.match_verdict}
            </span>
          </div>
        </div>

        {/* 2. Radar Chart & Six-Dimension Bars */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Radar Chart */}
          <div
            className={`lg:col-span-6 rounded-3xl p-6 border flex flex-col items-center justify-between ${
              isDark ? 'bg-gray-900/80 border-gray-800' : 'bg-white border-gray-200 shadow-card'
            }`}
          >
            <div className="w-full flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center space-x-2 text-blue-500">
                <TrendingUp className="w-4 h-4" />
                <span>六维能力雷达图 (Competency Radar)</span>
              </h2>
              <span className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>各维度 10 分制</span>
            </div>

            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                  <PolarGrid stroke={isDark ? '#374151' : '#E2E8F0'} strokeDasharray="3 3" />
                  <PolarAngleAxis
                    dataKey="subject"
                    stroke={isDark ? '#9ca3af' : '#64748B'}
                    tick={{ fill: isDark ? '#d1d5db' : '#334155', fontSize: 11 }}
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 10]} stroke={isDark ? '#4b5563' : '#CBD5E1'} />
                  <Radar
                    name="候选人得分"
                    dataKey="score"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.4}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Six Dimension Bars */}
            <div className={`w-full grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              {radarMetrics.map((item, idx) => {
                const percent = Math.round((item.val / item.max) * 100);
                return (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl border ${
                      isDark ? 'bg-gray-950/60 border-gray-800' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{item.label}</span>
                      <span className="font-mono font-bold text-blue-500">{item.val}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-gray-800/40 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-sky-400 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        {/* Strengths & Weaknesses */}
        <div className="lg:col-span-6 space-y-4 flex flex-col justify-between">
          {/* Core Strengths */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-5 flex-1">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>考核核心亮点 (Key Strengths)</span>
            </h3>
            <ul className="space-y-2">
              {report.strengths.map((str, idx) => (
                <li key={idx} className="text-xs text-gray-300 flex items-start space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Key Weaknesses */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-5 flex-1">
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>暴露短板与失分点 (Identified Weaknesses)</span>
            </h3>
            <ul className="space-y-2">
              {report.weaknesses.map((weak, idx) => (
                <li key={idx} className="text-xs text-gray-300 flex items-start space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <span>{weak}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 3. Personalized 7-Day Training Roadmap */}
      {report.seven_day_roadmap && report.seven_day_roadmap.length > 0 && (
        <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                个性化 7 天分阶段冲刺强化计划 (7-Day Training Roadmap)
              </h2>
            </div>
            <span className="text-[11px] text-gray-400">基于失分薄弱点针对性定制</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {report.seven_day_roadmap.map((item, idx) => (
              <div
                key={idx}
                className="bg-gray-950/70 border border-gray-800 rounded-2xl p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="inline-block px-2.5 py-0.5 rounded-md bg-blue-900/40 text-blue-400 font-mono text-[10px] font-bold mb-2">
                    {item.day}
                  </div>
                  <h4 className="text-xs font-bold text-gray-200 mb-1.5">{item.phase}</h4>
                  <div className="space-y-1 mb-3">
                    {item.focus_topics.map((t, i) => (
                      <span
                        key={i}
                        className="inline-block text-[10px] px-2 py-0.5 rounded bg-gray-900 text-gray-400 border border-gray-800 mr-1 mb-1"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <ul className="text-[11px] text-gray-400 space-y-1">
                    {item.action_items.map((act, i) => (
                      <li key={i} className="flex items-start space-x-1.5">
                        <span className="text-blue-500 mt-0.5">›</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 pt-2.5 border-t border-gray-900 text-[10px] text-emerald-400">
                  <span className="font-semibold">达成目标：</span> {item.expected_outcome}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Interactive Drill Flashcards */}
      {report.drill_cards && report.drill_cards.length > 0 && (
        <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                薄弱点专项打靶卡片 (Targeted Drill Cards)
              </h2>
            </div>
            <span className="text-[11px] text-gray-400">点击卡片可即时开启单题快测</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.drill_cards.map((card) => (
              <div
                key={card.id}
                className="bg-gray-950/70 border border-gray-800/90 rounded-2xl p-4 flex flex-col justify-between hover:border-blue-500/50 transition group"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-red-300 flex items-center space-x-1.5">
                      <Zap className="w-3.5 h-3.5 text-red-400" />
                      <span>{card.weakness_title}</span>
                    </span>
                  </div>

                  <p className="text-xs text-gray-300 mb-2 leading-relaxed">
                    {card.concept_summary}
                  </p>

                  <div className="p-2.5 rounded-xl bg-gray-900/90 border border-gray-800 text-[11px] text-amber-300/90 mb-3">
                    💡 <span className="font-semibold">面试秘籍：</span> {card.interview_tips}
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-900 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 truncate max-w-[240px]">
                    例题：{card.sample_drill_question}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDrillModal(card);
                      setDrillAnswer('');
                      setDrillSubmitted(false);
                    }}
                    className="inline-flex items-center space-x-1 text-xs px-3 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 transition shrink-0"
                  >
                    <span>立即单题快测</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Detailed Question-by-Question Review with Before vs After Answer */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider flex items-center space-x-2">
          <BookOpen className="w-4 h-4 text-blue-400" />
          <span>逐题深度复盘与“黄金优化示范回答” (Before vs. After)</span>
        </h2>

        {report.detailed_reviews.map((rev) => (
          <div
            key={rev.round}
            className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6 space-y-4"
          >
            {/* Header: Question Round & Question Original */}
            <div className="flex items-start space-x-3">
              <span className="px-2.5 py-1 rounded-lg bg-blue-900/60 text-blue-300 font-mono text-xs font-bold shrink-0 border border-blue-700/50">
                第 {rev.round} 轮
              </span>
              <div>
                <span className="text-[11px] text-gray-400 font-medium block">
                  提问面试官：{rev.interviewer}
                </span>
                <h3 className="text-sm font-semibold text-gray-100 mt-0.5">{rev.question}</h3>
              </div>
            </div>

            {/* Candidate Original Answer vs Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-gray-950/80 border border-gray-800 rounded-2xl p-4">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">
                  候选人回答摘要 (Before)
                </span>
                <p className="text-gray-300 leading-relaxed italic">{rev.candidate_answer}</p>
              </div>

              <div className="bg-amber-950/20 border border-amber-900/30 rounded-2xl p-4">
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-1">
                  考点拆解与不足剖析 (Analysis)
                </span>
                <p className="text-amber-200/90 leading-relaxed">{rev.analysis}</p>
              </div>
            </div>

            {/* Better Answer Sample (Golden Optimization) */}
            <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-2xl p-4 text-xs">
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block mb-1.5 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>首席架构师黄金示范回答 (After Optimization)</span>
              </span>
              <p className="text-emerald-100 leading-relaxed whitespace-pre-wrap">
                {rev.better_answer_sample}
              </p>
            </div>

            {/* Key Takeaway */}
            <div className="text-[11px] text-gray-400 bg-gray-950 px-4 py-2 rounded-xl border border-gray-800/80">
              💡 <span className="font-semibold text-gray-300">核心复盘认知：</span> {rev.key_takeaway}
            </div>
          </div>
        ))}
      </div>

      {/* High-Moment Action Footer */}
      <div className="pt-6 border-t border-gray-800/40 flex flex-wrap items-center justify-center gap-3 print:hidden">
        <button
          onClick={onRechallenge || onRestart}
          className="inline-flex items-center space-x-2 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-600/25 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>以相同配置再次发起挑战</span>
        </button>

        <button
          onClick={() => setShowShareModal(true)}
          className="inline-flex items-center space-x-2 px-6 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow-lg shadow-blue-600/25 cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
          <span>生成战报卡并分享</span>
        </button>

        <button
          onClick={onRestart}
          className={`inline-flex items-center space-x-2 px-6 py-3.5 rounded-2xl border font-semibold text-xs transition cursor-pointer ${
            isDark
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700'
              : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>返回控制台</span>
        </button>
      </div>
      </div>

      {/* Interactive Quick Drill Modal */}
      {activeDrillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-lg p-6 relative shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-blue-400 flex items-center space-x-1.5">
                <Target className="w-4 h-4 text-blue-400" />
                <span>{activeDrillModal.weakness_title} · 单题快测</span>
              </span>
              <button
                type="button"
                onClick={() => setActiveDrillModal(null)}
                className="text-gray-400 hover:text-gray-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl text-xs text-gray-100 mb-3 leading-relaxed">
              <span className="text-amber-400 font-bold block mb-1">模拟考题：</span>
              {activeDrillModal.sample_drill_question}
            </div>

            {drillSubmitted ? (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-700/50 space-y-2 text-xs animate-fadeIn">
                <div className="text-emerald-400 font-semibold flex items-center space-x-1">
                  <CheckCircle className="w-4 h-4" />
                  <span>回答已提交！AI 评估点评：</span>
                </div>
                <p className="text-gray-300">
                  回答抓住了核心要点。请牢记秘籍：{activeDrillModal.interview_tips}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveDrillModal(null)}
                  className="mt-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                >
                  完成本次快测
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={drillAnswer}
                  onChange={(e) => setDrillAnswer(e.target.value)}
                  placeholder="在此输入你的回答..."
                  rows={4}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500 resize-none"
                />
                <button
                  type="button"
                  disabled={!drillAnswer.trim()}
                  onClick={() => setDrillSubmitted(true)}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  提交打靶答卷
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scorecard Share Modal */}
      <ScorecardShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        report={report}
        sessionId={sessionId}
      />

      {/* 与上一场对比 Modal（session_1 = 上一场，session_2 = 本场） */}
      {compareOpen && prevSession && sessionId && (
        <ComparisonModal
          open={compareOpen}
          sessionId1={prevSession.session_id}
          sessionId2={sessionId}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
};
