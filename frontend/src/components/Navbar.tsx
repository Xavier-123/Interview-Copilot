import React from 'react';
import { Bot, Sparkles, Clock, Shield, ShieldAlert } from 'lucide-react';
import { usePrivacyMode } from '../context/privacyContext';

interface NavbarProps {
  currentStage: string;
  elapsedSeconds: number;
  status: string;
}

export const Navbar: React.FC<NavbarProps> = ({ currentStage, elapsedSeconds }) => {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const stages = [
    { key: 'setup', label: '1. 简历对齐' },
    { key: 'icebreak', label: '2. 破冰介绍' },
    { key: 'technical', label: '3. 技术深挖' },
    { key: 'hr', label: '4. STAR行为' },
    { key: 'candidate_qa', label: '5. 反问答疑' },
    { key: 'report', label: '6. 复盘报告' },
  ];

  const getStageIndex = (stage: string) => {
    if (stage === 'setup') return 0;
    if (stage === 'icebreak' || stage === 'self_intro') return 1;
    if (stage === 'technical' || stage === 'transition_to_hr') return 2;
    if (stage === 'hr') return 3;
    if (stage === 'candidate_qa') return 4;
    if (stage === 'conclusion' || stage === 'finished' || stage === 'report') return 5;
    return 0;
  };

  const activeIdx = getStageIndex(currentStage);

  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
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
            <p className="text-xs text-gray-400">多 Agent 模拟面试与持续训练闭环</p>
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
                {i < stages.length - 1 && (
                  <span className="ml-2 text-gray-700">›</span>
                )}
              </div>
            );
          })}
        </nav>

        {/* Right Status & Timer & Privacy Mode */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Privacy Mode Toggle Button */}
          <button
            onClick={togglePrivacyMode}
            type="button"
            title="切换摸鱼与防偷窥模式 (Alt + P)"
            className={`flex items-center space-x-1.5 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              isPrivacyMode
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-md shadow-emerald-950/50 hover:bg-emerald-900/60'
                : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
            }`}
          >
            {isPrivacyMode ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="font-medium text-emerald-300">防偷窥模式</span>
                <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.2 text-[10px] bg-emerald-900/90 text-emerald-200 rounded border border-emerald-700/60 font-mono">
                  Alt+P
                </kbd>
              </>
            ) : (
              <>
                <Shield className="w-3.5 h-3.5 text-gray-400" />
                <span>防偷窥模式</span>
                <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.2 text-[10px] bg-gray-800 text-gray-400 rounded border border-gray-700 font-mono">
                  Alt+P
                </kbd>
              </>
            )}
          </button>

          <div className="flex items-center space-x-1.5 text-xs text-gray-400 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-mono">{formatTime(elapsedSeconds)}</span>
          </div>

          <div className="flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1.5 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI 面试团就绪</span>
          </div>
        </div>
      </div>
    </header>
  );
};
