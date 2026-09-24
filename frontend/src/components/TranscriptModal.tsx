import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileText,
  Braces,
  Calendar,
  MessageSquare,
  User,
  Bot,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Terminal,
  Sparkles,
} from 'lucide-react';
import type { TranscriptData, TranscriptMessage, PromptLogItem } from '../types';
import { interviewTypeLabel } from '../types';
import { getInterviewerMeta } from '../utils/interviewers';
import { SearchSources } from './SearchSources';
import { apiFetch } from '../utils/api';

interface TranscriptModalProps {
  sessionId: string;
  onClose: () => void;
}

const scoreColor = (score?: number) => {
  if (score == null) return 'bg-surface-hover text-content-secondary border-line-default dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  if (score >= 0.8) return 'bg-status-success-bg text-status-success border-status-success-border dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700/50';
  if (score >= 0.5) return 'bg-status-warning-bg text-status-warning border-status-warning-border dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700/50';
  return 'bg-status-danger-bg text-status-danger border-status-danger-border dark:bg-red-950/60 dark:text-red-300 dark:border-red-700/50';
};

const formatTime = (ts?: string | null) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const MessageBubble: React.FC<{
  msg: TranscriptMessage;
  personaLabels?: Record<string, string>;
  promptLog?: PromptLogItem;
}> = ({
  msg,
  personaLabels,
  promptLog,
}) => {
  const isUser = msg.role === 'user';
  const [showPrompt, setShowPrompt] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600/90 text-white px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words">
          {msg.content}
        </div>
      </div>
    );
  }
  const meta = getInterviewerMeta(msg.name, personaLabels);
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] w-full">
        <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-semibold mb-1 ${meta.badgeBg}`}>
          {meta.title}
        </span>
        <div className="rounded-2xl rounded-bl-md bg-surface-subtle border border-line-subtle text-content-primary px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words">
          {msg.content}
          <SearchSources metadata={msg.search_metadata} compact />

          {/* Prompt Inspection Toggle */}
          {promptLog && (
            <div className="mt-2 pt-2 border-t border-line-default">
              <button
                type="button"
                onClick={() => setShowPrompt(!showPrompt)}
                className="flex items-center space-x-1.5 text-[11px] text-brand-primary hover:text-blue-500 dark:hover:text-blue-300 font-medium transition"
              >
                <Terminal className="w-3 h-3 text-brand-primary" />
                <span>{showPrompt ? '收起大模型 Prompt' : '查看传入大模型的整个 Prompt'}</span>
                {showPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showPrompt && (
                <div className="mt-2 space-y-2 bg-surface-elevated rounded-xl p-3 border border-line-subtle text-[11px] font-sans">
                  <div className="flex items-center justify-between text-content-muted pb-1.5 border-b border-line-subtle">
                    <span className="font-semibold text-content-secondary flex items-center space-x-1 text-[11px]">
                      <Sparkles className="w-3 h-3 text-status-warning" />
                      <span>大模型完整交互 ({promptLog.node} · {promptLog.call_type})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(`=== System Prompt ===\n${promptLog.system_prompt}\n\n=== User Prompt ===\n${promptLog.user_prompt}\n\n=== Model Response ===\n${promptLog.response}`, `all-${promptLog.id}`)}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded bg-surface-hover hover:bg-surface-active text-content-secondary hover:text-content-primary transition text-[10px]"
                    >
                      {copiedKey === `all-${promptLog.id}` ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === `all-${promptLog.id}` ? '已复制全量' : '复制全量 Prompt'}</span>
                    </button>
                  </div>

                  {/* System Prompt */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-content-muted text-[10px]">
                      <span className="font-medium text-purple-600 dark:text-purple-400">1. 系统提示词 (System Prompt)</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(promptLog.system_prompt, `sys-${promptLog.id}`)}
                        className="text-content-muted hover:text-content-primary transition"
                      >
                        {copiedKey === `sys-${promptLog.id}` ? '已复制' : '复制'}
                      </button>
                    </div>
                    <div className="max-h-36 overflow-y-auto bg-surface-subtle rounded-lg p-2 font-mono text-[10px] text-content-secondary whitespace-pre-wrap break-words border border-line-subtle">
                      {promptLog.system_prompt}
                    </div>
                  </div>

                  {/* Human / User Prompt */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-content-muted text-[10px]">
                      <span className="font-medium text-status-success">2. 传入指令与上下文 (Human Prompt)</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(promptLog.user_prompt, `usr-${promptLog.id}`)}
                        className="text-content-muted hover:text-content-primary transition"
                      >
                        {copiedKey === `usr-${promptLog.id}` ? '已复制' : '复制'}
                      </button>
                    </div>
                    <div className="max-h-36 overflow-y-auto bg-surface-subtle rounded-lg p-2 font-mono text-[10px] text-content-secondary whitespace-pre-wrap break-words border border-line-subtle">
                      {promptLog.user_prompt}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const TranscriptModal: React.FC<TranscriptModalProps> = ({ sessionId, onClose }) => {
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTranscript = async () => {
      setLoading(true);
      setError(null);
      try {
        setTranscript(await apiFetch<TranscriptData>(`/api/v1/interviews/${sessionId}/transcript`));
      } catch (err: any) {
        setError(err.message || '对话记录加载失败');
      } finally {
        setLoading(false);
      }
    };
    fetchTranscript();
  }, [sessionId]);

  const session = transcript?.session;
  const messages = transcript?.messages ?? [];
  const observations = transcript?.observations ?? [];
  const promptLogs = transcript?.prompt_logs ?? [];

  const promptLogMap = useMemo(() => {
    const map = new Map<string, PromptLogItem>();
    promptLogs.forEach((p) => {
      if (p.id) map.set(p.id, p);
    });
    return map;
  }, [promptLogs]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line-default rounded-3xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-line-subtle">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-content-primary flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-brand-primary shrink-0" />
              <span className="truncate">{session?.title || '面试对话记录'}</span>
            </h2>
            {session && (
              <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900/50">
                  类型：{interviewTypeLabel(session.interview_type)}
                </span>
                {session.industry && (
                  <span className="px-2 py-0.5 rounded-md bg-surface-subtle text-content-secondary border border-line-subtle">{session.industry}</span>
                )}
                {session.job_role && (
                  <span className="px-2 py-0.5 rounded-md bg-surface-subtle text-content-secondary border border-line-subtle">{session.job_role}</span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-surface-subtle text-content-secondary border border-line-subtle">
                  共 {session.round_count ?? 0} 轮
                </span>
                {promptLogs.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-600 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900/50 flex items-center space-x-1">
                    <Terminal className="w-3 h-3" />
                    <span>已捕获 {promptLogs.length} 次大模型 Prompt</span>
                  </span>
                )}
                {session.created_at && (
                  <span className="px-2 py-0.5 rounded-md bg-surface-subtle text-content-secondary border border-line-subtle flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatTime(session.created_at)}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition shrink-0"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 text-content-secondary text-xs">
              <Loader2 className="w-7 h-7 animate-spin text-brand-primary" />
              <span>正在加载完整对话记录...</span>
            </div>
          ) : error ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 text-content-secondary text-xs">
              <AlertTriangle className="w-8 h-8 text-status-warning" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {messages.map((msg, idx) => (
                  <MessageBubble
                    key={idx}
                    msg={msg}
                    personaLabels={transcript?.persona_labels}
                    promptLog={msg.prompt_log_id ? promptLogMap.get(msg.prompt_log_id) : undefined}
                  />
                ))}
              </div>

              {observations.length > 0 && (
                <div className="pt-2 border-t border-line-subtle">
                  <h3 className="text-xs font-semibold text-content-secondary mb-2 flex items-center space-x-1.5">
                    <Bot className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>逐轮评估（影子观察员）</span>
                  </h3>
                  <div className="space-y-1.5">
                    {observations.map((obs, idx) => (
                      <div
                        key={idx}
                        className="flex items-start space-x-2 bg-surface-subtle border border-line-subtle rounded-xl px-3 py-2 text-[11px]"
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded-md border font-mono shrink-0 ${scoreColor(obs.satisfaction_score)}`}
                          title="满足度评分"
                        >
                          {obs.satisfaction_score != null ? obs.satisfaction_score.toFixed(2) : '-'}
                        </span>
                        <div className="min-w-0 text-content-secondary">
                          <span className="text-content-primary font-medium">{obs.topic || '未命名考点'}</span>
                          {(obs.strengths?.length ?? 0) > 0 && (
                            <div className="truncate text-status-success">亮点：{obs.strengths!.join('；')}</div>
                          )}
                          {(obs.weaknesses?.length ?? 0) > 0 && (
                            <div className="truncate text-status-warning">不足：{obs.weaknesses!.join('；')}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer: Downloads */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-line-subtle">
          <span className="text-[10px] text-content-muted flex items-center space-x-1">
            <User className="w-3 h-3" />
            <span>对话数据与 Prompt 实录已双轨持久化</span>
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <a
              href={`/api/v1/interviews/${sessionId}/export?format=markdown`}
              download
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>对话 Markdown</span>
            </a>
            <a
              href={`/api/v1/interviews/${sessionId}/export?format=json`}
              download
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-surface-hover hover:bg-surface-active text-content-primary text-xs font-medium border border-line-default transition"
            >
              <Braces className="w-3.5 h-3.5" />
              <span>对话 JSON</span>
            </a>
            <a
              href={`/api/v1/interviews/${sessionId}/export?format=prompts_markdown`}
              download
              title="下载完整大模型 Prompt 输入与上下文实录 (.md)"
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-purple-700/80 hover:bg-purple-600 text-white text-xs font-medium border border-purple-500/50 transition"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Prompt 实录 (.md)</span>
            </a>
            <a
              href={`/api/v1/interviews/${sessionId}/export?format=prompts_json`}
              download
              title="下载完整大模型 Prompt 输入与上下文实录 (.json)"
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-surface-hover hover:bg-surface-active text-purple-600 dark:text-purple-300 text-xs font-medium border border-line-default transition"
            >
              <Braces className="w-3.5 h-3.5" />
              <span>Prompt JSON</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
