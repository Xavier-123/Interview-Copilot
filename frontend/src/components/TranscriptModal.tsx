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
  if (score == null) return 'bg-gray-800 text-gray-400 border-gray-700';
  if (score >= 0.8) return 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50';
  if (score >= 0.5) return 'bg-amber-950/60 text-amber-300 border-amber-700/50';
  return 'bg-red-950/60 text-red-300 border-red-700/50';
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
        <div className="rounded-2xl rounded-bl-md bg-gray-800/80 border border-gray-700/60 text-gray-100 px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words">
          {msg.content}
          <SearchSources metadata={msg.search_metadata} compact />

          {/* Prompt Inspection Toggle */}
          {promptLog && (
            <div className="mt-2 pt-2 border-t border-gray-700/50">
              <button
                type="button"
                onClick={() => setShowPrompt(!showPrompt)}
                className="flex items-center space-x-1.5 text-[11px] text-blue-400 hover:text-blue-300 font-medium transition"
              >
                <Terminal className="w-3 h-3 text-blue-400" />
                <span>{showPrompt ? '收起大模型 Prompt' : '查看传入大模型的整个 Prompt'}</span>
                {showPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showPrompt && (
                <div className="mt-2 space-y-2 bg-gray-950/90 rounded-xl p-3 border border-gray-800 text-[11px] font-sans">
                  <div className="flex items-center justify-between text-gray-400 pb-1.5 border-b border-gray-800/80">
                    <span className="font-semibold text-gray-300 flex items-center space-x-1 text-[11px]">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>大模型完整交互 ({promptLog.node} · {promptLog.call_type})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(`=== System Prompt ===\n${promptLog.system_prompt}\n\n=== User Prompt ===\n${promptLog.user_prompt}\n\n=== Model Response ===\n${promptLog.response}`, `all-${promptLog.id}`)}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition text-[10px]"
                    >
                      {copiedKey === `all-${promptLog.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === `all-${promptLog.id}` ? '已复制全量' : '复制全量 Prompt'}</span>
                    </button>
                  </div>

                  {/* System Prompt */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-gray-400 text-[10px]">
                      <span className="font-medium text-purple-400">1. 系统提示词 (System Prompt)</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(promptLog.system_prompt, `sys-${promptLog.id}`)}
                        className="text-gray-400 hover:text-white transition"
                      >
                        {copiedKey === `sys-${promptLog.id}` ? '已复制' : '复制'}
                      </button>
                    </div>
                    <div className="max-h-36 overflow-y-auto bg-gray-900/90 rounded-lg p-2 font-mono text-[10px] text-gray-300 whitespace-pre-wrap break-words border border-gray-800/80">
                      {promptLog.system_prompt}
                    </div>
                  </div>

                  {/* Human / User Prompt */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-gray-400 text-[10px]">
                      <span className="font-medium text-emerald-400">2. 传入指令与上下文 (Human Prompt)</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(promptLog.user_prompt, `usr-${promptLog.id}`)}
                        className="text-gray-400 hover:text-white transition"
                      >
                        {copiedKey === `usr-${promptLog.id}` ? '已复制' : '复制'}
                      </button>
                    </div>
                    <div className="max-h-36 overflow-y-auto bg-gray-900/90 rounded-lg p-2 font-mono text-[10px] text-gray-300 whitespace-pre-wrap break-words border border-gray-800/80">
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
        className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-800">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="truncate">{session?.title || '面试对话记录'}</span>
            </h2>
            {session && (
              <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
                <span className="px-2 py-0.5 rounded-md bg-blue-950/60 text-blue-300 border border-blue-900/50">
                  类型：{interviewTypeLabel(session.interview_type)}
                </span>
                {session.industry && (
                  <span className="px-2 py-0.5 rounded-md bg-gray-950 text-gray-400 border border-gray-800">{session.industry}</span>
                )}
                {session.job_role && (
                  <span className="px-2 py-0.5 rounded-md bg-gray-950 text-gray-400 border border-gray-800">{session.job_role}</span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-gray-950 text-gray-400 border border-gray-800">
                  共 {session.round_count ?? 0} 轮
                </span>
                {promptLogs.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-purple-950/60 text-purple-300 border border-purple-900/50 flex items-center space-x-1">
                    <Terminal className="w-3 h-3" />
                    <span>已捕获 {promptLogs.length} 次大模型 Prompt</span>
                  </span>
                )}
                {session.created_at && (
                  <span className="px-2 py-0.5 rounded-md bg-gray-950 text-gray-400 border border-gray-800 flex items-center space-x-1">
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
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition shrink-0"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 text-gray-400 text-xs">
              <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
              <span>正在加载完整对话记录...</span>
            </div>
          ) : error ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 text-gray-400 text-xs">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
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
                <div className="pt-2 border-t border-gray-800/80">
                  <h3 className="text-xs font-semibold text-gray-300 mb-2 flex items-center space-x-1.5">
                    <Bot className="w-3.5 h-3.5 text-indigo-400" />
                    <span>逐轮评估（影子观察员）</span>
                  </h3>
                  <div className="space-y-1.5">
                    {observations.map((obs, idx) => (
                      <div
                        key={idx}
                        className="flex items-start space-x-2 bg-gray-950/60 border border-gray-800/80 rounded-xl px-3 py-2 text-[11px]"
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded-md border font-mono shrink-0 ${scoreColor(obs.satisfaction_score)}`}
                          title="满足度评分"
                        >
                          {obs.satisfaction_score != null ? obs.satisfaction_score.toFixed(2) : '-'}
                        </span>
                        <div className="min-w-0 text-gray-400">
                          <span className="text-gray-200 font-medium">{obs.topic || '未命名考点'}</span>
                          {(obs.strengths?.length ?? 0) > 0 && (
                            <div className="truncate text-emerald-400/80">亮点：{obs.strengths!.join('；')}</div>
                          )}
                          {(obs.weaknesses?.length ?? 0) > 0 && (
                            <div className="truncate text-amber-400/80">不足：{obs.weaknesses!.join('；')}</div>
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
        <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-800">
          <span className="text-[10px] text-gray-500 flex items-center space-x-1">
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
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium border border-gray-700 transition"
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
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-purple-300 text-xs font-medium border border-gray-700 transition"
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
