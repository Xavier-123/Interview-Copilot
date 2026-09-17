import React, { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  enablePrivacyMode,
  disablePrivacyMode,
  getPrivacyModeStatus,
} from '../utils/privacyMode';
import { Shield, ShieldAlert, X } from 'lucide-react';
import { PrivacyModeContext } from './privacyContext';

export const PrivacyModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    type: 'enable' | 'disable';
    title: string;
    desc: string;
  } | null>(null);

  const triggerToast = (type: 'enable' | 'disable') => {
    if (type === 'enable') {
      setToast({
        visible: true,
        type: 'enable',
        title: '已开启防偷窥摸鱼模式 (Alt + P)',
        desc: '敏感求职词汇已脱敏为代号 (MS/QZ/JL/GW/TD/XZ)，标签页已伪装为 Dev Copilot',
      });
    } else {
      setToast({
        visible: true,
        type: 'disable',
        title: '已退出防偷窥摸鱼模式',
        desc: '全站文本已瞬时无损还原，真实数据完好无损',
      });
    }
  };

  const togglePrivacyMode = useCallback(() => {
    setIsPrivacyMode((prev) => {
      const next = !prev;
      if (next) {
        enablePrivacyMode();
        triggerToast('enable');
      } else {
        disablePrivacyMode();
        triggerToast('disable');
      }
      return next;
    });
  }, []);

  // 监听全局快捷键 Alt + P / Option + P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检查 Alt / Option 键组合，且 key 为 P / p
      const isAltP = e.altKey && (e.code === 'KeyP' || e.key === 'p' || e.key === 'P' || e.key === 'π');
      if (isAltP) {
        e.preventDefault();
        e.stopPropagation();
        togglePrivacyMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [togglePrivacyMode]);

  // Toast 自动淡出定时器
  useEffect(() => {
    if (!toast?.visible) return;
    const timer = window.setTimeout(() => {
      setToast((prev) => (prev ? { ...prev, visible: false } : null));
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [toast?.visible, toast?.title]);

  // 组件卸载时确保恢复
  useEffect(() => {
    return () => {
      if (getPrivacyModeStatus()) {
        disablePrivacyMode();
      }
    };
  }, []);

  return (
    <PrivacyModeContext.Provider value={{ isPrivacyMode, togglePrivacyMode }}>
      {children}

      {/* 摸鱼模式全局提示浮窗 (Toast) */}
      {toast?.visible && (
        <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div
            className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-xl transition-all ${
              toast.type === 'enable'
                ? 'bg-gray-950/95 border-emerald-500/50 shadow-emerald-950/40 text-emerald-100'
                : 'bg-gray-950/95 border-blue-500/50 shadow-blue-950/40 text-blue-100'
            }`}
          >
            <div className="flex items-start space-x-3">
              <div
                className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                  toast.type === 'enable'
                    ? 'bg-emerald-900/60 text-emerald-400 border border-emerald-700/50'
                    : 'bg-blue-900/60 text-blue-400 border border-blue-700/50'
                }`}
              >
                {toast.type === 'enable' ? (
                  <ShieldAlert className="w-5 h-5 animate-pulse" />
                ) : (
                  <Shield className="w-5 h-5" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white tracking-wide">
                    {toast.title}
                  </h4>
                  <button
                    onClick={() => setToast(null)}
                    className="text-gray-400 hover:text-gray-200 p-0.5 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                  {toast.desc}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </PrivacyModeContext.Provider>
  );
};
