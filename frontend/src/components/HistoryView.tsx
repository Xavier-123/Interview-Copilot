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
import { apiFetch } from '../utils/api';

interface HistoryViewProps {
  onBack?: () => void;
  onViewReport: (sessionId: string) => void;
  hideBack?: boolean;
  /** 受控勾选列表（由父级持有，跨页面返回时恢复勾选现场）；不传则组件内部自持 */
  selectedSessions?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onBack,
  onViewReport,
  hideBack = false,
  selectedSessions: controlledSelection,
  onSelectionChange,
}) => {
  const [history, setHistory] = useState<HistorySessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalSelection, setInternalSelection] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [transcriptSessionId, setTranscriptSessionId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSessions = controlledSelection ?? internalSelection;
  const updateSelection = (ids: string[]) => {
    if (onSelectionChange) {
      onSelectionChange(ids);
    } else {
      setInternalSelection(ids);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ history?: HistorySessionItem[] }>('/api/v1/interviews/history');
      const list: HistorySessionItem[] = data.history || [];
      setHistory(list);
      updateSelection(selectedSessions.filter((id) => list.some((h) => h.session_id === id)));
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const showError = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确认删除该场面试记录及复盘报告吗？')) return;

    try {
      await apiFetch(`/api/v1/interviews/history/${sessionId}`, {
        method: 'DELETE',
      });
      setHistory((prev) => prev.filter((s) => s.session_id !== sessionId));
      updateSelection(selectedSessions.filter((id) => id !== sessionId));
    } catch (err) {
      console.error('Failed to delete session:', err);
      showError('删除失败，请检查网络连接');
    }
  };

  const handleBatchDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const count = selectedSessions.length;
    if (count === 0 || deleting) return;
    if (!confirm(`确认删除选中的 ${count} 场面试记录及复盘报告吗？此操作不可恢复。`)) return;

    setDeleting(true);
    try {
      const data = await apiFetch<{ deleted?: number }>('/api/v1/interviews/history/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_ids: selectedSessions }),
      });
      const deleted = data.deleted ?? 0;
      setHistory((prev) => prev.filter((s) => !selectedSessions.includes(s.session_id)));
      updateSelection([]);
      if (deleted < count) {
        showError(`已删除 ${deleted} 条，${count - deleted} 条未找到或删除失败`);
      }
    } catch (err) {
      console.error('Failed to batch delete sessions:', err);
      showError('批量删除失败，请检查网络连接');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedSessions.includes(sessionId)) {
      updateSelection(selectedSessions.filter((id) => id !== sessionId));
    } else {
      updateSelection([...selectedSessions, sessionId]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedSessions.length === history.length) {
      updateSelection([]);
    } else {
      updateSelection(history.map((h) => h.session_id));
    }
  };

  const getVerdictStyle = (verdict?: string) => {
    if (!verdict) return 'bg-surface-hover text-content-secondary border-line-default dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
    if (verdict.includes('强烈推荐') || verdict.includes('通过')) {
      return 'bg-status-success-bg border-status-success-border text-status-success dark:bg-emerald-950/60 dark:border-emerald-700/60 dark:text-emerald-300';
    }
    if (verdict.includes('待定')) {
      return 'bg-status-warning-bg border-status-warning-border text-status-warning dark:bg-amber-950/60 dark:border-amber-700/60 dark:text-amber-300';
    }
    return 'bg-status-danger-bg border-status-danger-border text-status-danger dark:bg-red-950/60 dark:border-red-700/60 dark:text-red-300';
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {!hideBack && onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center space-x-1.5 text-xs text-content-secondary hover:text-content-primary mb-2 transition cursor-pointer"
            >
              <span>← 返回模拟面试配置</span>
            </button>
          )}
          <h1 className="text-2xl font-bold text-content-primary flex items-center space-x-2">
            <History className="w-6 h-6 text-brand-primary" />
            <span>模拟面试历史档案与演进对比</span>
          </h1>
          <p className="text-xs text-content-secondary mt-1">
            仅归档保存完成 3 轮及以上深度问答的有效模拟记录（未满 3 轮已自动清理）；勾选任意 2 场可一键发起雷达重叠对比与弱项攻坚分析。
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {history.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-2xl bg-surface border border-line-default hover:border-line-focus text-content-secondary font-medium text-xs transition"
            >
              {selectedSessions.length === history.length ? (
                <CheckSquare className="w-4 h-4 text-brand-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>{selectedSessions.length === history.length ? '取消全选' : '全选'}</span>
            </button>
          )}
          {selectedSessions.length >= 1 && (
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-2xl bg-status-danger-bg hover:bg-red-500/20 border border-status-danger-border text-status-danger font-semibold text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              <span>{deleting ? '正在删除...' : `批量删除 (${selectedSessions.length})`}</span>
            </button>
          )}
          {selectedSessions.length === 2 && (
            <button
              type="button"
              onClick={() => setShowComparison(true)}
              className="inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-blue-500/25 transition animate-pulse"
            >
              <TrendingUp className="w-4 h-4" />
              <span>对比已勾选的 2 场面试</span>
            </button>
          )}
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div className="px-4 py-2.5 rounded-xl bg-status-danger-bg border border-status-danger-border text-status-danger text-xs">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3 text-content-secondary text-xs">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span>正在读取面试历史档案...</span>
        </div>
      ) : history.length === 0 ? (
        <div className="py-16 bg-surface border border-line-subtle rounded-3xl text-center space-y-3 p-6 shadow-sm">
          <FileText className="w-12 h-12 text-content-placeholder mx-auto" />
          <h3 className="text-sm font-semibold text-content-secondary">暂无历史模拟面试记录</h3>
          <p className="text-xs text-content-muted max-w-sm mx-auto">
            立即完成一场多 Agent 模拟面试，系统将自动沉淀你的多维诊断报告与雷达数据。
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
                    ? 'bg-surface border-blue-500 ring-2 ring-blue-500/30 shadow-xl'
                    : 'bg-surface border-line-subtle hover:border-line-default shadow-sm'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={(e) => toggleSelect(item.session_id, e)}
                        className="text-content-secondary hover:text-brand-primary p-0.5"
                        title="勾选用于对比（恰好 2 场）或批量删除"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand-primary" />
                        ) : (
                          <Square className="w-4 h-4 text-content-muted" />
                        )}
                      </button>
                      <span className="text-xs font-bold text-content-primary truncate max-w-[200px]">
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
                        className="text-content-muted hover:text-status-danger p-1 transition"
                        title="删除记录"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap gap-1.5 mb-3 text-[10px]">
                    <span className="px-2 py-0.5 rounded-md bg-surface-subtle text-content-secondary border border-line-subtle">
                      {item.industry}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-surface-subtle text-content-secondary border border-line-subtle">
                      {item.job_role}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900/50">
                      类型：{interviewTypeLabel(item.interview_type)}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-surface-subtle text-content-secondary border border-line-subtle">
                      共 {item.round_count} 轮问答
                    </span>
                  </div>

                  {/* Summary snippet */}
                  {item.overall_summary && (
                    <p className="text-[11px] text-content-secondary line-clamp-2 leading-relaxed mb-3">
                      {item.overall_summary}
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-line-subtle flex items-center justify-between text-[10px] text-content-muted">
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
                      className="inline-flex items-center space-x-1 text-brand-primary hover:text-blue-500 dark:hover:text-blue-300 font-medium transition"
                      title="在线回看完整对话记录"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>查看对话</span>
                    </button>
                    {item.has_report ? (
                      <span className="text-brand-primary font-medium flex items-center space-x-1">
                        <span>查看深度复盘</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="text-content-placeholder">未完成报告</span>
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
