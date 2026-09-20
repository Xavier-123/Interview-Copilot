import React, { useState } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import {
  Award,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Printer,
  Copy,
  Calendar,
  Target,
  Check,
  Download,
  Zap
} from 'lucide-react';
import type { EvaluationReport, DrillCardItem } from '../types';

interface ReportViewProps {
  report: EvaluationReport;
  onRestart: () => void;
  sessionId?: string;
}

export const ReportView: React.FC<ReportViewProps> = ({ report, onRestart, sessionId }) => {
  const [copied, setCopied] = useState(false);
  const [activeDrillModal, setActiveDrillModal] = useState<DrillCardItem | null>(null);
  const [drillAnswer, setDrillAnswer] = useState('');
  const [drillSubmitted, setDrillSubmitted] = useState(false);

  const radarData = [
    { subject: '技术深度', score: report.radar_scores.technical_depth, fullMark: 10 },
    { subject: '技术广度', score: report.radar_scores.technical_breadth, fullMark: 10 },
    { subject: '表达逻辑', score: report.radar_scores.communication_logic, fullMark: 10 },
    { subject: 'STAR规范', score: report.radar_scores.star_completeness, fullMark: 10 },
    { subject: '抗压韧性', score: report.radar_scores.stress_resilience, fullMark: 10 },
    { subject: '岗位契合', score: report.radar_scores.job_matching, fullMark: 10 },
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
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8 print:p-0 print:space-y-4">
      {/* 1. Header & Overall Verdict */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6 sm:p-8 backdrop-blur shadow-xl relative overflow-hidden print:border-none print:shadow-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-900/40 border border-blue-700/50 text-blue-300 text-xs font-medium mb-2">
              <Award className="w-3.5 h-3.5 text-blue-400" />
              <span>多 Agent 模拟面试诊断书</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              模拟面试多维能力诊断报告
            </h1>
          </div>

          <div className="flex items-center space-x-3">
            <div
              className={`px-5 py-2.5 rounded-2xl border flex items-center space-x-2.5 shadow-md ${getVerdictStyle(
                report.match_verdict
              )}`}
            >
              <Sparkles className="w-5 h-5 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold opacity-80">综合面试结论</div>
                <div className="text-lg font-bold">{report.match_verdict}</div>
              </div>
            </div>

            {/* Print & Copy Buttons */}
            <div className="flex flex-col gap-1.5 print:hidden">
              <button
                type="button"
                onClick={handlePrint}
                className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs flex items-center space-x-1 transition"
                title="导出为 PDF / 打印报告"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleCopyMarkdown}
                className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs flex items-center space-x-1 transition"
                title="复制 Markdown 文本"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              {sessionId && (
                <a
                  href={`/api/v1/interviews/${sessionId}/export?format=markdown`}
                  download
                  className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs flex items-center space-x-1 transition"
                  title="下载完整面试对话与报告（Markdown）"
                >
                  <Download className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed bg-gray-950/60 border border-gray-800 rounded-2xl p-4">
          {report.overall_summary}
        </p>
      </div>

      {/* 2. Radar Chart & Core Strengths / Weaknesses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Radar Chart */}
        <div className="lg:col-span-6 bg-gray-900/80 border border-gray-800 rounded-3xl p-6 flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider mb-2 self-start flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span>六维能力雷达图 (Competency Radar)</span>
          </h2>

          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                <PolarGrid stroke="#374151" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="subject" stroke="#9ca3af" tick={{ fill: '#d1d5db', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 10]} stroke="#4b5563" />
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

      {/* Restart Footer */}
      <div className="text-center pt-4 print:hidden">
        <button
          onClick={onRestart}
          className="inline-flex items-center space-x-2 px-8 py-3.5 rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold text-xs transition border border-gray-700"
        >
          <RotateCcw className="w-4 h-4" />
          <span>返回控制台，开启新一轮模拟面试</span>
        </button>
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
    </div>
  );
};
