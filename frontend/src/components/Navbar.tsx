import React, { useState } from 'react';
import { Bot, Sparkles, Clock, Shield, ShieldAlert, Settings, History, User, LogIn, Users2 } from 'lucide-react';
import { usePrivacyMode } from '../context/privacyContext';
import { useAuth } from '../context/AuthContext';
import { SettingsModal } from './SettingsModal';
import { AuthModal } from './AuthModal';
import { UserProfileModal } from './UserProfileModal';
import { loadLLMConfig } from '../utils/llmConfig';

interface NavbarProps {
  currentStage: string;
  elapsedSeconds: number;
  status: string;
  onNavigateHistory?: () => void;
  onNavigatePersonas?: () => void;
  onNavigateHome?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentStage,
  elapsedSeconds,
  onNavigateHistory,
  onNavigatePersonas,
  onNavigateHome,
}) => {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const { user } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div
          onClick={onNavigateHome}
          className="flex items-center space-x-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
                Interview-Copilot
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50 flex items-center space-x-1">
                <Sparkles className="w-3 h-3 mr-0.5 text-blue-400" />
                Multi-Agent
              </span>
            </div>
            <p className="text-xs text-gray-400">全真多 Agent 模拟面试与持续训练闭环</p>
          </div>
        </div>

        {/* Stages Stepper */}
        <nav className="hidden md:flex items-center space-x-1">
          {stages.map((st, i) => {
            const isDone = i < activeIdx;
            const isCurrent = i === activeIdx;
            return (
              <div
                key={st.key}
                className={`flex items-center text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  isCurrent
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 font-medium'
                    : isDone
                    ? 'text-gray-400 font-normal'
                    : 'text-gray-600'
                }`}
              >
                <span>{st.label}</span>
                {i < stages.length - 1 && <span className="ml-2 text-gray-700">›</span>}
              </div>
            );
          })}
        </nav>

        {/* Right Status & Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Persona Library Button */}
          {onNavigatePersonas && (
            <button
              type="button"
              onClick={onNavigatePersonas}
              title="创建和管理你的自定义面试官角色"
              className="flex items-center space-x-1 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-gray-900/80 hover:bg-gray-800 border border-gray-800 hover:border-violet-700/60 text-gray-300 transition cursor-pointer"
            >
              <Users2 className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden sm:inline">角色库</span>
            </button>
          )}

          {/* History Button */}
          {onNavigateHistory && (
            <button
              type="button"
              onClick={onNavigateHistory}
              title="查看面试历史档案与双场次对比"
              className="flex items-center space-x-1 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-gray-900/80 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-300 transition cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">历史对比</span>
            </button>
          )}

          {/* User Auth / Profile Button */}
          {user ? (
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex items-center space-x-1.5 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900/50 border border-blue-800/50 text-blue-300 transition cursor-pointer"
            >
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span className="max-w-[80px] truncate font-medium">
                {user.profile?.real_name || user.username}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="flex items-center space-x-1 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-gray-900/80 hover:bg-gray-800 border border-gray-800 text-gray-300 transition cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-gray-400" />
              <span>登录/注册</span>
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
            className={`flex items-center space-x-1.5 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              customModel
                ? 'bg-blue-950/80 border-blue-500/60 text-blue-300 hover:bg-blue-900/60'
                : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
            }`}
          >
            <Settings className={`w-3.5 h-3.5 ${customModel ? 'text-blue-400' : ''}`} />
            <span className="hidden lg:inline font-medium">
              {customModel ? `模型: ${customModel}` : '模型'}
            </span>
          </button>

          {/* Privacy Mode Toggle Button */}
          <button
            onClick={togglePrivacyMode}
            type="button"
            title="切换摸鱼与防偷窥模式 (Alt + P)"
            className={`flex items-center space-x-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
              isPrivacyMode
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-md shadow-emerald-950/50'
                : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {isPrivacyMode ? (
              <ShieldAlert className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            ) : (
              <Shield className="w-3.5 h-3.5 text-gray-400" />
            )}
            <span className="hidden sm:inline">防偷窥</span>
          </button>

          {/* Timer */}
          <div className="flex items-center space-x-1.5 text-xs text-gray-400 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-mono">{formatTime(elapsedSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Modals */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <UserProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
};
