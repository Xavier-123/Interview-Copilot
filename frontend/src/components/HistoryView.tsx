import React, { useState, useEffect } from 'react';
import {
  History,
  Calendar,
  ArrowRight,
  Trash2,
  TrendingUp,
  FileText,
  CheckSquare,
  Square,
  MessageSquare
} from 'lucide-react';
import type { HistorySessionItem } from '../types';
import { interviewTypeLabel } from '../types';
import { ComparisonModal } from './ComparisonModal';
import { TranscriptModal } from './TranscriptModal';

interface HistoryViewProps {
  onBack: () => void;
  onViewReport: (sessionId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onBack, onViewReport }) => {
  const [history, setHistory] = useState<HistorySessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [transcriptSessionId, setTranscriptSessionId] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    const token = localStorage.getItem('interview_copilot_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch('/api/v1/interviews/history', { headers });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确认删除该场面试记录及复盘报告吗？')) return;

    try {
      const res = await fetch(`/api/v1/interviews/history/${sessionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setHistory((prev) => prev.filter((s) => s.session_id !== sessionId));
        setSelectedSessions((prev) => prev.filter((id) => id !== sessionId));
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const toggleSelect = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedSessions.includes(sessionId)) {
      setSelectedSessions(selectedSessions.filter((id) => id !== sessionId));
    } else {
      if (selectedSessions.length >= 2) {
        // Keep max 2
        setSelectedSessions([selectedSessions[1], sessionId]);
      } else {
        setSelectedSessions([...selectedSessions, sessionId]);
      }
    }
  };

  const getVerdictStyle = (verdict?: string) => {
    if (!verdict) return 'bg-gray-800 text-gray-400 border-gray-700';
    if (verdict.includes('强烈推荐') || verdict.includes('通过')) {
      return 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300';
    }
    if (verdict.includes('待定')) {
      return 'bg-amber-950/60 border-amber-700/60 text-amber-300';
    }
    return 'bg-red-950/60 border-red-700/60 text-red-300';
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center space-x-1.5 text-xs text-gray-400 hover:text-white mb-2 transition"
          >
            <span>← 返回模拟面试配置</span>
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center space-x-2">
            <History className="w-6 h-6 text-blue-400" />
            <span>模拟面试历史档案与演进对比</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            浏览所有历史模拟记录，勾选任意 2 场可一键发起雷达重叠对比与弱项攻坚分析
          </p>
        </div>

        {/* Comparison Trigger Button */}
        {selectedSessions.length === 2 && (
          <button
            type="button"
            onClick={() => setShowComparison(true)}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-blue-500/25 transition animate-pulse"
          >
            <TrendingUp className="w-4 h-4" />
            <span>对比已勾选的 2 场面试</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3 text-gray-400 text-xs">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span>正在读取面试历史档案...</span>
        </div>
      ) : history.length === 0 ? (
        <div className="py-16 bg-gray-900/60 border border-gray-800 rounded-3xl text-center space-y-3 p-6">
          <FileText className="w-12 h-12 text-gray-600 mx-auto" />
          <h3 className="text-sm font-semibold text-gray-300">暂无历史模拟面试记录</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            立即完成一场全真多 Agent 模拟面试，系统将自动沉淀你的多维诊断报告与雷达数据。
          </p>
          <button
            onClick={onBack}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
          >
            开启第一场模拟面试
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {history.map((item) => {
            const isSelected = selectedSessions.includes(item.session_id);

            return (
              <div
                key={item.session_id}
                onClick={() => {
                  if (item.has_report) onViewReport(item.session_id);
                }}
                className={`rounded-3xl p-5 border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? 'bg-gray-900 border-blue-500 ring-2 ring-blue-500/30 shadow-xl'
                    : 'bg-gray-900/70 border-gray-800/80 hover:border-gray-700'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={(e) => toggleSelect(item.session_id, e)}
                        className="text-gray-400 hover:text-blue-400 p-0.5"
                        title="勾选用于对比"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-500" />
                        )}
                      </button>
                      <span className="text-xs font-bold text-white truncate max-w-[200px]">
                        {item.title}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {item.match_verdict && (
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full border font-semibold ${getVerdictStyle(
                            item.match_verdict
                          )}`}
                        >
                          {item.match_verdict}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDelete(item.session_id, e)}
                        className="text-gray-500 hover:text-red-400 p-1 transition"
                        title="删除记录"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap gap-1.5 mb-3 text-[10px]">
                    <span className="px-2 py-0.5 rounded-md bg-gray-950 text-gray-400 border border-gray-800">
                      {item.industry}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-gray-950 text-gray-400 border border-gray-800">
                      {item.job_role}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-950/60 text-blue-300 border border-blue-900/50">
                      类型：{interviewTypeLabel(item.interview_type)}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-gray-950 text-gray-400 border border-gray-800">
                      共 {item.round_count} 轮问答
                    </span>
                  </div>

                  {/* Summary snippet */}
                  {item.overall_summary && (
                    <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed mb-3">
                      {item.overall_summary}
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-gray-800/80 flex items-center justify-between text-[10px] text-gray-500">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {item.created_at
                        ? new Date(item.created_at).toLocaleString([], {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '近期'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTranscriptSessionId(item.session_id);
                      }}
                      className="inline-flex items-center space-x-1 text-blue-400 hover:text-blue-300 font-medium transition"
                      title="在线回看完整对话记录"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>查看对话</span>
                    </button>
                    {item.has_report ? (
                      <span className="text-blue-400 font-medium flex items-center space-x-1">
                        <span>查看深度复盘</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="text-gray-600">未完成报告</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Comparison Modal */}
      {showComparison && selectedSessions.length === 2 && (
        <ComparisonModal
          open={showComparison}
          sessionId1={selectedSessions[0]}
          sessionId2={selectedSessions[1]}
          onClose={() => setShowComparison(false)}
        />
      )}

      {/* Transcript Modal */}
      {transcriptSessionId && (
        <TranscriptModal
          sessionId={transcriptSessionId}
          onClose={() => setTranscriptSessionId(null)}
        />
      )}
    </div>
  );
};
