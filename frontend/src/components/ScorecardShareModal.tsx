import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Award,
  Check,
  Copy,
  Printer,
  Calendar,
  Share2,
  TrendingUp,
} from 'lucide-react';
import type { EvaluationReport } from '../types';
import { useTheme } from '../context/ThemeContext';

interface ScorecardShareModalProps {
  open: boolean;
  onClose: () => void;
  report: EvaluationReport;
  sessionId?: string;
}

export const ScorecardShareModal: React.FC<ScorecardShareModalProps> = ({
  open,
  onClose,
  report,
}) => {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  // Calculate composite score (0-100) from radar scores (each 0-10)
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

  // Determine tier & color
  const getTier = (score: number) => {
    if (score >= 90) return { label: 'S · 卓越强推', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
    if (score >= 80) return { label: 'A+ · 建议录用', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
    if (score >= 70) return { label: 'A · 契合度高', badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' };
    if (score >= 60) return { label: 'B · 具备潜力', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    return { label: 'C · 待加练提升', badge: 'bg-red-500/20 text-red-300 border-red-500/40' };
  };

  const tier = getTier(compositeScore);

  const radarItems = [
    { label: '技术深度', val: scores.technical_depth, max: 10 },
    { label: '技术广度', val: scores.technical_breadth, max: 10 },
    { label: '表达逻辑', val: scores.communication_logic, max: 10 },
    { label: 'STAR规范', val: scores.star_completeness, max: 10 },
    { label: '抗压韧性', val: scores.stress_resilience, max: 10 },
    { label: '岗位契合', val: scores.job_matching, max: 10 },
  ];

  const handleCopyText = () => {
    const text = [
      `🎯【Interview Copilot 模拟面试战报】`,
      `综合评级：${tier.label}（综合得分：${compositeScore} 分）`,
      `考核结论：${report.match_verdict}`,
      `\n六维能力得分：`,
      ...radarItems.map((item) => `• ${item.label}：${item.val}/10`),
      `\n核心亮点：`,
      ...report.strengths.slice(0, 3).map((s) => `✓ ${s}`),
      `\n由 Interview Copilot 多 Agent 智能面试评估系统生成`,
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintCard = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden transition-all flex flex-col ${
          isDark
            ? 'bg-[#0B0F19] border-gray-800 text-white'
            : 'bg-white border-gray-200 text-gray-900 shadow-2xl'
        }`}
      >
        {/* Header Action */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-800/40">
          <div className="flex items-center space-x-2 text-xs font-semibold">
            <Share2 className="w-4 h-4 text-blue-500" />
            <span>分享成绩战报卡</span>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-xl transition cursor-pointer ${
              isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shareable Card Canvas */}
        <div className="p-6 overflow-y-auto max-h-[75vh]">
          <div
            id="shareable-scorecard"
            className="rounded-2xl p-6 relative overflow-hidden border border-blue-500/20 bg-gradient-to-b from-[#111927] via-[#0D131F] to-[#0A0E17] text-white shadow-2xl"
          >
            {/* Ambient Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Top Brand Tag */}
            <div className="flex items-center justify-between mb-5 relative z-10">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/30">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-blue-400 uppercase font-mono">
                    Interview Copilot
                  </div>
                  <div className="text-[10px] text-gray-400">全真模拟面试 · 成绩评测单</div>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${tier.badge}`}>
                {tier.label}
              </span>
            </div>

            {/* Big Hero Score */}
            <div className="text-center py-4 my-2 rounded-xl bg-white/[0.02] border border-white/5 relative z-10">
              <div className="text-[11px] text-gray-400 font-medium mb-1">模拟面试综合得分</div>
              <div className="flex items-baseline justify-center space-x-1">
                <span className="text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-emerald-400 font-mono tabular-nums">
                  {compositeScore}
                </span>
                <span className="text-gray-400 text-sm font-semibold">/ 100</span>
              </div>
              <div className="mt-2 text-xs text-blue-200 font-medium px-4">
                综合结论：<span className="text-white font-bold">{report.match_verdict}</span>
              </div>
            </div>

            {/* Six Dimension Bars */}
            <div className="space-y-2.5 my-5 relative z-10">
              <div className="text-[11px] font-semibold text-gray-400 flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                  <span>六维能力维度速览</span>
                </span>
                <span>单项 10 分制</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {radarItems.map((item, idx) => {
                  const percent = Math.round((item.val / item.max) * 100);
                  return (
                    <div key={idx} className="p-2 rounded-lg bg-black/30 border border-white/5">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-gray-300">{item.label}</span>
                        <span className="text-blue-300 font-mono font-bold">{item.val}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-sky-400 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Core Strengths */}
            {report.strengths && report.strengths.length > 0 && (
              <div className="relative z-10 pt-3 border-t border-white/10">
                <div className="text-[11px] font-semibold text-emerald-400 mb-1.5 flex items-center space-x-1">
                  <Award className="w-3.5 h-3.5" />
                  <span>核心亮点突破</span>
                </div>
                <div className="space-y-1 text-xs text-gray-300">
                  {report.strengths.slice(0, 2).map((s, idx) => (
                    <div key={idx} className="flex items-start space-x-1.5 text-[11px] leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
                      <span className="line-clamp-2">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Card Footer Stamp */}
            <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-500 relative z-10">
              <span className="flex items-center space-x-1">
                <Calendar className="w-3 h-3 text-gray-400" />
                <span>评测时间：{new Date().toLocaleDateString()}</span>
              </span>
              <span>Interview Copilot 认证战报</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t border-gray-800/40 flex items-center justify-end space-x-3 bg-black/20">
          <button
            type="button"
            onClick={handlePrintCard}
            className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
              isDark ? 'border-gray-800 hover:bg-gray-800 text-gray-300' : 'border-gray-300 hover:bg-gray-100 text-gray-700'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>打印 / 导出 PDF</span>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-500/20 transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>已复制战报摘要</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>复制战报文本</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
