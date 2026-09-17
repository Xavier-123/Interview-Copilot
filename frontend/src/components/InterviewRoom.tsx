import React, { useState, useRef, useEffect } from 'react';
import { Send, Lightbulb, CheckCircle2, Bot, User } from 'lucide-react';
import type { Message } from '../types';
import { InterviewerPanel } from './InterviewerPanel';

interface InterviewRoomProps {
  sessionId: string;
  stage: string;
  currentInterviewer: string;
  messages: Message[];
  status: string;
  lifelinesUsed: number;
  isThinking: boolean;
  shadowLogsCount: number;
  onSendMessage: (text: string) => void;
  onRequestLifeline: () => void;
  onFinishInterview: () => void;
}

export const InterviewRoom: React.FC<InterviewRoomProps> = ({
  currentInterviewer,
  messages,
  lifelinesUsed,
  isThinking,
  shadowLogsCount,
  onSendMessage,
  onRequestLifeline,
  onFinishInterview,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isThinking) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getInterviewerBadge = (name?: string) => {
    switch (name) {
      case 'orchestrator':
        return {
          title: '主考官 · 王主持',
          badgeBg: 'bg-blue-900/60 text-blue-300 border-blue-700/50',
          bubbleBg: 'bg-blue-950/20 border-blue-900/40 text-blue-100',
        };
      case 'technical':
        return {
          title: '技术面试官 · 李架构',
          badgeBg: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50',
          bubbleBg: 'bg-cyan-950/20 border-cyan-900/40 text-cyan-100',
        };
      case 'hr':
        return {
          title: 'HR面试官 · 陈总监',
          badgeBg: 'bg-purple-900/60 text-purple-300 border-purple-700/50',
          bubbleBg: 'bg-purple-950/20 border-purple-900/40 text-purple-100',
        };
      case 'challenger':
        return {
          title: '压力挑战官 · 张挑刺',
          badgeBg: 'bg-amber-900/60 text-amber-300 border-amber-700/50',
          bubbleBg: 'bg-amber-950/20 border-amber-900/40 text-amber-100',
        };
      default:
        return {
          title: '面试官',
          badgeBg: 'bg-gray-800 text-gray-300 border-gray-700',
          bubbleBg: 'bg-gray-900 border-gray-800 text-gray-200',
        };
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-4 px-4 flex flex-col h-[calc(100vh-5rem)]">
      {/* 1. Multi-Agent Seat Panel */}
      <div className="mb-4">
        <InterviewerPanel
          currentInterviewer={currentInterviewer}
          isThinking={isThinking}
          shadowLogsCount={shadowLogsCount}
        />
      </div>

      {/* 2. Chat Dialogue Feed */}
      <div className="flex-1 bg-gray-950/70 border border-gray-800/80 rounded-2xl p-4 overflow-y-auto space-y-4">
        {messages.map((msg, index) => {
          const isCandidate = msg.role === 'user';
          const meta = getInterviewerBadge(msg.name);

          return (
            <div
              key={index}
              className={`flex items-start space-x-3 ${
                isCandidate ? 'flex-row-reverse space-x-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                  isCandidate
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 border border-gray-700 text-gray-300'
                }`}
              >
                {isCandidate ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>

              {/* Message Box */}
              <div
                className={`max-w-2xl rounded-2xl p-4 border text-sm leading-relaxed ${
                  isCandidate
                    ? 'bg-indigo-950/40 border-indigo-800/50 text-indigo-100 rounded-tr-none'
                    : `${meta.bubbleBg} rounded-tl-none`
                }`}
              >
                <div className="flex items-center justify-between mb-1.5 space-x-3">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${
                      isCandidate
                        ? 'bg-indigo-900/60 text-indigo-300 border-indigo-700/40'
                        : meta.badgeBg
                    }`}
                  >
                    {isCandidate ? '候选人 (你)' : meta.title}
                  </span>
                  {msg.timestamp && (
                    <span className="text-[10px] text-gray-500">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  )}
                </div>

                <div className="whitespace-pre-wrap font-sans text-[13px]">{msg.content}</div>
              </div>
            </div>
          );
        })}

        {/* Thinking Indicator */}
        {isThinking && (
          <div className="flex items-center space-x-3 text-xs text-gray-400 py-2 px-1 animate-pulse">
            <div className="w-8 h-8 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-center space-x-2 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
              <span>面试官正在倾听并研讨下一轮提问与评估...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. Action and Input Bar */}
      <div className="mt-3 bg-gray-900/80 border border-gray-800 rounded-2xl p-3">
        {/* Tool Row */}
        <div className="flex items-center justify-between mb-2 text-xs">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onRequestLifeline}
              disabled={isThinking}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 text-amber-300 transition disabled:opacity-50"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <span>求助提示 Lifeline</span>
              {lifelinesUsed > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded bg-amber-900/80 text-[10px] text-amber-200">
                  已用 {lifelinesUsed} 次
                </span>
              )}
            </button>
            <span className="text-[11px] text-gray-500 hidden sm:inline">
              (点击可获得思路引导，但影子观察员会记入辅助档案)
            </span>
          </div>

          <button
            type="button"
            onClick={onFinishInterview}
            disabled={isThinking}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-emerald-950/60 border border-gray-700 hover:border-emerald-700/60 text-gray-300 hover:text-emerald-300 transition"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>交卷并生成评估报告</span>
          </button>
        </div>

        {/* Input Textarea */}
        <div className="relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isThinking
                ? '面试官正在发言中，请稍候...'
                : '输入你的回答... (按 Enter 发送，Shift+Enter 换行)'
            }
            disabled={isThinking}
            rows={3}
            className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 pr-24 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none font-sans leading-relaxed disabled:opacity-50"
          />

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isThinking}
            className="absolute bottom-3 right-3 inline-flex items-center space-x-1 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
          >
            <span>发送回答</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
