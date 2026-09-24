import React, { useState } from 'react';
import { Bot, Sparkles, Clock, Shield, ShieldAlert, Settings, Users2, FileText, Calendar, LayoutDashboard, Sun, Moon } from 'lucide-react';
import { usePrivacyMode } from '../context/privacyContext';
import { useTheme } from '../context/ThemeContext';
import { SettingsModal } from './SettingsModal';
import { loadLLMConfig } from '../utils/llmConfig';
import type { AppView } from '../types';

interface NavbarProps {
  currentStage: string;
  elapsedSeconds: number;
  status: string;
  /** 当前主视图 */
  currentView?: AppView;
  /** 视图切换回调 */
  onNavigate?: (view: AppView) => void;
  /** 当前是否处于面试/报告页面，用于决定是否渲染五段进度条 */
  inInterview?: boolean;
  onNavigatePersonas?: () => void;
  onNavigateHome?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentStage,
  elapsedSeconds,
  currentView = 'home',
  onNavigate,
  inInterview = false,
  onNavigatePersonas,
  onNavigateHome,
}) => {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const { toggleTheme, isDark } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const customModel = loadLLMConfig()?.model;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const stages = [
    { key: 'setup', label: '1. 简历对齐' },
    { key: 'icebreak', label: '2. 破冰介绍' },
    { key: 'technical', label: '3. 核心考核' },
    { key: 'candidate_qa', label: '4. 反问答疑' },
    { key: 'report', label: '5. 复盘报告' },
  ];

  const getStageIndex = (stage: string) => {
    if (stage === 'setup' || stage === 'history') return 0;
    if (stage === 'icebreak' || stage === 'self_intro') return 1;
    if (stage === 'technical' || stage === 'hr' || stage === 'management' || stage === 'transition_to_hr')
      return 2;
    if (stage === 'candidate_qa') return 3;
    if (stage === 'conclusion' || stage === 'finished' || stage === 'report') return 4;
    return 0;
  };

  const activeIdx = getStageIndex(currentStage);

  return (
    <header
      className={`border-b transition-colors duration-200 sticky top-0 z-50 backdrop-blur ${
        isDark
          ? 'border-gray-800 bg-gray-950/80'
          : 'border-slate-200/80 bg-white/85 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Left: Logo */}
        <div
          onClick={() => {
            if (onNavigate) onNavigate('home');
            else if (onNavigateHome) onNavigateHome();
          }}
          className="flex items-center space-x-3 cursor-pointer group shrink-0"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center space-x-2">
              <span
                className={`font-bold text-base md:text-lg bg-clip-text text-transparent ${
                  isDark
                    ? 'bg-gradient-to-r from-blue-400 to-indigo-300'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-700'
                }`}
              >
                Interview-Copilot
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center space-x-1 ${
                  isDark
                    ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                <Sparkles className={`w-2.5 h-2.5 mr-0.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                Multi-Agent
              </span>
            </div>
            <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
              求职作战与多 Agent 模拟面试闭环
            </p>
          </div>
        </div>

        {/* Center: Global Navigation Tabs */}
        {onNavigate && (
          <nav
            className={`flex items-center space-x-1 p-1 rounded-xl border transition-colors ${
              isDark ? 'bg-gray-900/70 border-gray-800/80' : 'bg-slate-100/80 border-slate-200/60'
            }`}
          >
            <button
              onClick={() => onNavigate('home')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                currentView === 'home'
                  ? isDark
                    ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40 shadow-sm'
                    : 'bg-white text-blue-600 border border-blue-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] font-semibold'
                  : isDark
                  ? 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden md:inline">首页</span>
            </button>

            <button
              onClick={() => onNavigate('resumes')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                currentView === 'resumes'
                  ? isDark
                    ? 'bg-purple-600/30 text-purple-400 border border-purple-500/40 shadow-sm'
                    : 'bg-white text-purple-600 border border-purple-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] font-semibold'
                  : isDark
                  ? 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>简历管理</span>
            </button>

            <button
              onClick={() => onNavigate('interviews')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                currentView === 'interviews'
                  ? isDark
                    ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 shadow-sm'
                    : 'bg-white text-emerald-600 border border-emerald-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] font-semibold'
                  : isDark
                  ? 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>面试管理</span>
            </button>

            <button
              onClick={() => onNavigate('setup')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                currentView === 'setup' || currentView === 'interview' || currentView === 'report'
                  ? isDark
                    ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40 shadow-sm'
                    : 'bg-white text-blue-600 border border-blue-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] font-semibold'
                  : isDark
                  ? 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>模拟面试</span>
            </button>
          </nav>
        )}

        {/* Right Status & Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Persona Library Button */}
          {onNavigatePersonas && (
            <button
              type="button"
              onClick={onNavigatePersonas}
              title="创建和管理你的自定义面试官角色"
              className={`flex items-center space-x-1 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                isDark
                  ? 'bg-gray-900/80 hover:bg-gray-800 border-gray-800 hover:border-violet-700/60 text-gray-300'
                  : 'bg-white hover:bg-slate-50 border-slate-200/80 hover:border-violet-300 text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
              }`}
            >
              <Users2 className={`w-3.5 h-3.5 ${isDark ? 'text-violet-400' : 'text-violet-600'}`} />
              <span className="hidden sm:inline">角色库</span>
            </button>
          )}

          {/* LLM Settings Button */}
          <button
            onClick={() => setSettingsOpen(true)}
            type="button"
            title={
              customModel
                ? `当前使用前端自定义模型: ${customModel}`
                : '大模型 API 配置（当前使用后端默认配置）'
            }
            className={`flex items-center justify-center w-8 h-8 text-xs rounded-lg border transition-all cursor-pointer ${
              customModel
                ? isDark
                  ? 'bg-blue-950/80 border-blue-500/60 hover:bg-blue-900/60'
                  : 'bg-blue-50 border-blue-300 text-blue-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                : isDark
                ? 'bg-gray-900/80 border-gray-800 hover:border-gray-700'
                : 'bg-white border-slate-200/80 hover:bg-slate-50 text-slate-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
            }`}
          >
            <Settings className={`w-4 h-4 ${customModel ? 'text-blue-400' : isDark ? 'text-gray-400' : 'text-slate-600'}`} />
          </button>

          {/* Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            type="button"
            title={
              isDark
                ? '切换至 Linear 极简浅色风 (适合长时间阅读与办公)'
                : '切换至 原生深色科技风 (沉浸专注)'
            }
            className={`flex items-center justify-center w-8 h-8 text-xs rounded-lg border transition-all cursor-pointer ${
              isDark
                ? 'bg-gray-900/80 border-gray-800 hover:border-gray-700 hover:bg-gray-800 text-amber-400'
                : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50 text-blue-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
            }`}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform duration-300" />
            ) : (
              <Moon className="w-4 h-4 text-blue-600 hover:-rotate-12 transition-transform duration-300" />
            )}
          </button>

          {/* Privacy Mode Toggle Button */}
          <button
            onClick={togglePrivacyMode}
            type="button"
            title="切换摸鱼与防偷窥模式 (Alt + P)"
            className={`flex items-center justify-center w-8 h-8 text-xs rounded-lg border transition-all cursor-pointer ${
              isPrivacyMode
                ? isDark
                  ? 'bg-emerald-950/80 border-emerald-500/60 shadow-md shadow-emerald-950/50'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                : isDark
                ? 'bg-gray-900/80 border-gray-800 hover:border-gray-700'
                : 'bg-white border-slate-200/80 hover:bg-slate-50 text-slate-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
            }`}
          >
            {isPrivacyMode ? (
              <ShieldAlert className="w-4 h-4 text-emerald-400 animate-pulse" />
            ) : (
              <Shield className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-slate-600'}`} />
            )}
          </button>

          {/* Timer */}
          <div
            className={`flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded-lg border ${
              isDark
                ? 'text-gray-400 bg-gray-900 border-gray-800'
                : 'text-slate-600 bg-white border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
            }`}
          >
            <Clock className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            <span className="font-mono">{formatTime(elapsedSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Stages Stepper: 仅在面试进行中/复盘报告页显示 */}
      {inInterview && (
        <nav
          className={`hidden md:block border-t ${
            isDark ? 'border-gray-800/60' : 'border-slate-200/80 bg-slate-50/50'
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 h-10 flex items-center justify-center space-x-1">
            {stages.map((st, i) => {
              const isDone = i < activeIdx;
              const isCurrent = i === activeIdx;
              return (
                <div
                  key={st.key}
                  className={`flex items-center text-xs px-3 py-1 rounded-lg transition-colors ${
                    isCurrent
                      ? isDark
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 font-medium'
                        : 'bg-blue-50 text-blue-700 border border-blue-200 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                      : isDone
                      ? isDark
                        ? 'text-gray-400 font-normal'
                        : 'text-slate-600 font-normal'
                      : isDark
                      ? 'text-gray-600'
                      : 'text-slate-400'
                  }`}
                >
                  <span>{st.label}</span>
                  {i < stages.length - 1 && (
                    <span className={`ml-2 ${isDark ? 'text-gray-700' : 'text-slate-300'}`}>›</span>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
      )}

      {/* Modals */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
};
