import React from 'react';
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
} from 'lucide-react';
import type { EvaluationReport } from '../types';

interface ReportViewProps {
  report: EvaluationReport;
  onRestart: () => void;
}

export const ReportView: React.FC<ReportViewProps> = ({ report, onRestart }) => {
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

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* 1. Header & Overall Verdict */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6 sm:p-8 backdrop-blur shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-900/40 border border-blue-700/50 text-blue-300 text-xs font-medium mb-2">
              <Award className="w-3.5 h-3.5 text-blue-400" />
              <span>全场综合复盘与诊断报告</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              模拟面试多维能力诊断书
            </h1>
          </div>

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
                  fill="#2563eb"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-2 w-full pt-2 border-t border-gray-800 text-center">
            {radarData.map((d) => (
              <div key={d.subject} className="bg-gray-950/60 p-2 rounded-xl border border-gray-800/80">
                <div className="text-[11px] text-gray-400">{d.subject}</div>
                <div className="text-sm font-bold text-blue-400 font-mono mt-0.5">{d.score} / 10</div>
              </div>
            ))}
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="lg:col-span-6 flex flex-col space-y-6">
          {/* Strengths */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6 flex-1">
            <h3 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider mb-3 flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>突出优势与亮点 (Key Strengths)</span>
            </h3>
            <ul className="space-y-2.5">
              {report.strengths.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start space-x-2.5 text-xs text-gray-300 bg-emerald-950/20 border border-emerald-900/40 p-3 rounded-xl"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Weaknesses */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6 flex-1">
            <h3 className="text-sm font-semibold text-amber-300 uppercase tracking-wider mb-3 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>失分点与薄弱项 (Areas to Improve)</span>
            </h3>
            <ul className="space-y-2.5">
              {report.weaknesses.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start space-x-2.5 text-xs text-gray-300 bg-amber-950/20 border border-amber-900/40 p-3 rounded-xl"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 3. Detailed Question-by-Question Review & Rewriting */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6 sm:p-8">
        <h2 className="text-lg font-bold text-white mb-2 flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-indigo-400" />
          <span>逐题深度复盘与标准答案润色优化 (Answer Rewriting)</span>
        </h2>
        <p className="text-xs text-gray-400 mb-6">
          “如果我是你，该怎么回答更好” —— 针对每一道关键考题，提供对比示范与高阶答题范式。
        </p>

        <div className="space-y-6">
          {report.detailed_reviews.map((rev, index) => (
            <div
              key={index}
              className="bg-gray-950/80 border border-gray-800 rounded-2xl p-5 space-y-4 shadow-sm"
            >
              {/* Question Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-900/60 text-blue-300 border border-blue-700/50 text-xs font-semibold">
                    Round {rev.round} · {rev.interviewer}
                  </span>
                  <span className="text-sm font-semibold text-gray-100">{rev.question}</span>
                </div>
              </div>

              {/* Candidate Answer Summary & Analysis */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-900/60 border border-gray-800/80 p-3 rounded-xl">
                  <div className="text-[11px] font-semibold text-gray-400 mb-1">候选人回答实录摘要：</div>
                  <p className="text-gray-300 leading-relaxed">{rev.candidate_answer}</p>
                </div>
                <div className="bg-gray-900/60 border border-gray-800/80 p-3 rounded-xl">
                  <div className="text-[11px] font-semibold text-amber-400 mb-1">考点剖析与优缺点点评：</div>
                  <p className="text-gray-300 leading-relaxed">{rev.analysis}</p>
                </div>
              </div>

              {/* Better Answer Sample (Golden Answer) */}
              <div className="bg-gradient-to-r from-blue-950/40 to-indigo-950/30 border border-blue-800/40 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-blue-300">优化示范回答 (Golden Sample)：</span>
                </div>
                <p className="text-xs text-blue-100/90 leading-relaxed font-sans whitespace-pre-wrap">
                  {rev.better_answer_sample}
                </p>
              </div>

              {/* Key Takeaway */}
              <div className="text-[11px] text-gray-400 bg-gray-900/40 px-3 py-2 rounded-lg border border-gray-800/60 flex items-center space-x-2">
                <span className="text-indigo-400 font-semibold">💡 核心认知沉淀：</span>
                <span>{rev.key_takeaway}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Targeted Learning Plan */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6 sm:p-8">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
          <TrendingUp className="w-5 h-5 text-teal-400" />
          <span>针对性技能提升计划 (Actionable Roadmap)</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.learning_plan.map((plan, idx) => (
            <div
              key={idx}
              className="bg-gray-950/80 border border-gray-800 rounded-2xl p-5 flex flex-col justify-between"
            >
              <div>
                <h4 className="text-sm font-bold text-teal-300 mb-1">{plan.topic}</h4>
                <p className="text-xs text-gray-400 mb-3">{plan.reason}</p>
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-gray-300">推荐强化行动：</div>
                  {plan.recommended_actions.map((act, aIdx) => (
                    <div
                      key={aIdx}
                      className="flex items-start space-x-2 text-xs text-gray-400"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                      <span>{act}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Restart CTA */}
      <div className="flex justify-center pb-8">
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center space-x-2 px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <RotateCcw className="w-4 h-4" />
          <span>开启下一场模拟训练</span>
        </button>
      </div>
    </div>
  );
};
