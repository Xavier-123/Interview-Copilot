import React, { useState, useEffect } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { X, TrendingUp, Sparkles } from 'lucide-react';
import type { ComparisonResult } from '../types';
import { apiFetch } from '../utils/api';

interface ComparisonModalProps {
  open: boolean;
  sessionId1: string;
  sessionId2: string;
  onClose: () => void;
}

export const ComparisonModal: React.FC<ComparisonModalProps> = ({
  open,
  sessionId1,
  sessionId2,
  onClose,
}) => {
  const [data, setData] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && sessionId1 && sessionId2) {
      const fetchComparison = async () => {
        setLoading(true);
        setError(null);
        try {
          const result = await apiFetch<ComparisonResult>('/api/v1/interviews/history/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id_1: sessionId1,
              session_id_2: sessionId2,
            }),
          });
          setData(result);
        } catch (err: any) {
          setError(err.message || '获取两场对比数据失败');
        } finally {
          setLoading(false);
        }
      };

      fetchComparison();
    }
  }, [open, sessionId1, sessionId2]);

  if (!open) return null;

  const radarChartData =
    data?.radar_comparison.map((item) => ({
      subject: item.dimension,
      '首次面试': item.session_1_score,
      '本次面试': item.session_2_score,
      fullMark: 10,
    })) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-4xl p-6 sm:p-8 relative shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">双场次能力演进与深度对比分析</h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-gray-400 hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3 text-gray-400 text-xs">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <span>正在交叉比对两场面试雷达与维度增量...</span>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-xs text-red-400 bg-red-950/30 rounded-2xl border border-red-800/40 my-4 p-4">
            {error}
          </div>
        ) : data ? (
          <div className="overflow-y-auto flex-1 space-y-6 pt-4 pr-1">
            {/* Overview Banner */}
            <div className="p-4 rounded-2xl bg-gray-950/70 border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">
                  成长诊断总结
                </span>
                <p className="text-xs text-gray-200 mt-1 leading-relaxed">{data.summary}</p>
              </div>
              <div className="shrink-0 flex items-center space-x-2 bg-blue-950/60 border border-blue-800/50 px-3 py-2 rounded-xl">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-300">
                  综合评分变化：
                  <span
                    className={`font-mono font-bold ml-1 ${
                      data.overall_improvement >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {data.overall_improvement >= 0 ? `+${data.overall_improvement}` : data.overall_improvement}
                  </span>
                </span>
              </div>
            </div>

            {/* Radar Comparison Chart */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-7 bg-gray-950/50 border border-gray-800/80 rounded-2xl p-4 flex flex-col items-center">
                <span className="text-xs font-semibold text-gray-300 self-start mb-1">
                  六维重叠雷达对比 (Overlapping Radar)
                </span>
                <div className="w-full h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarChartData}>
                      <PolarGrid stroke="#374151" strokeDasharray="3 3" />
                      <PolarAngleAxis dataKey="subject" stroke="#9ca3af" tick={{ fill: '#d1d5db', fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 10]} stroke="#4b5563" />
                      <Radar
                        name="前次面试"
                        dataKey="首次面试"
                        stroke="#94a3b8"
                        fill="#94a3b8"
                        fillOpacity={0.25}
                      />
                      <Radar
                        name="本次面试"
                        dataKey="本次面试"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.4}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Delta table */}
              <div className="md:col-span-5 space-y-2">
                <span className="text-xs font-semibold text-gray-300 block mb-2">
                  各项维度分值增量 (Score Deltas)
                </span>
                <div className="space-y-2">
                  {data.radar_comparison.map((dim) => {
                    const isPositive = dim.delta >= 0;
                    return (
                      <div
                        key={dim.dimension_key}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-gray-950/60 border border-gray-800 text-xs"
                      >
                        <span className="text-gray-300">{dim.dimension}</span>
                        <div className="flex items-center space-x-3">
                          <span className="text-gray-400 font-mono text-[11px]">
                            {dim.session_1_score} → {dim.session_2_score}
                          </span>
                          <span
                            className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                              isPositive
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                : 'bg-red-950/80 text-red-300 border border-red-800/60'
                            }`}
                          >
                            {isPositive ? `+${dim.delta}` : dim.delta}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Strengths / Weaknesses evolution */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-gray-950/70 border border-gray-800">
                <span className="font-semibold text-gray-300 block mb-2">
                  前次面试结论：{data.session_1.match_verdict}
                </span>
                <ul className="space-y-1.5 text-gray-400 text-[11px]">
                  {data.session_1.weaknesses.map((w, idx) => (
                    <li key={idx} className="flex items-start space-x-1.5">
                      <span className="text-gray-500">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-gray-950/70 border border-blue-900/40">
                <span className="font-semibold text-blue-300 block mb-2">
                  本次面试结论：{data.session_2.match_verdict}
                </span>
                <ul className="space-y-1.5 text-gray-300 text-[11px]">
                  {data.session_2.weaknesses.map((w, idx) => (
                    <li key={idx} className="flex items-start space-x-1.5">
                      <span className="text-blue-400">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
