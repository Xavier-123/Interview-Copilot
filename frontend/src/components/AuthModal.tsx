import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Lock, Mail, Sparkles, LogIn, UserPlus, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, onClose }) => {
  const { login, register, guestLogin } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [realName, setRealName] = useState('');
  const [targetRole, setTargetRole] = useState('资深后端架构师');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 每次打开弹窗时重置表单，避免上次的注册模式/输入/报错残留
  useEffect(() => {
    if (open) {
      setIsRegister(false);
      setUsername('');
      setPassword('');
      setEmail('');
      setRealName('');
      setTargetRole('资深后端架构师');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await register({
          username: username.trim(),
          password,
          email: email.trim() || undefined,
          real_name: realName.trim() || undefined,
          target_role: targetRole.trim() || undefined,
        });
      } else {
        await login(username.trim(), password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await guestLogin();
      onClose();
    } catch (err: any) {
      setError(err.message || '游客登录失败');
    } finally {
      setLoading(false);
    }
  };

  // 用 Portal 渲染到 body：header 的 backdrop-blur 会成为 fixed 子元素的包含块，导致弹窗贴顶不居中
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-md p-6 relative shadow-2xl overflow-hidden">
        {/* Decorative blur */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="mb-6">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-900/40 border border-blue-700/50 text-blue-400 text-xs font-medium mb-2">
            <Sparkles className="w-3 h-3" />
            <span>{isRegister ? '新用户注册' : '欢迎回来'}</span>
          </div>
          <h2 className="text-xl font-bold text-white">
            {isRegister ? '创建你的求职面试账号' : '登录 Interview-Copilot'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {isRegister
              ? '注册后可永久保存你的面试历史报告与能力成长雷达'
              : '登录以同步你的个人档案、简历与历史面试对比'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-800/50 text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-300 mb-1 font-medium">用户名 / 账号</label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名"
                required
                className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 pl-9 pr-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {isRegister && (
            <>
              <div>
                <label className="block text-xs text-gray-300 mb-1 font-medium">电子邮箱 (选填)</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 pl-9 pr-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-300 mb-1 font-medium">真实姓名 / 称呼</label>
                <input
                  type="text"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="例如：张三"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-300 mb-1 font-medium">期望岗位</label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="例如：资深后端架构师"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-gray-300 mb-1 font-medium">密码</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                required
                className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 pl-9 pr-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/25 transition flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isRegister ? (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>立即注册并登录</span>
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span>确认登录</span>
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="my-4 flex items-center justify-between text-xs text-gray-500">
          <span className="w-full border-b border-gray-800" />
          <span className="px-2 shrink-0">或</span>
          <span className="w-full border-b border-gray-800" />
        </div>

        {/* Guest Mode Button */}
        <button
          onClick={handleGuestLogin}
          disabled={loading}
          type="button"
          className="w-full py-2.5 rounded-xl bg-gray-800/80 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs font-medium transition flex items-center justify-center space-x-1.5"
        >
          <span>免注册 · 一键游客快捷体验</span>
          <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
        </button>

        {/* Toggle Login / Register */}
        <div className="mt-4 text-center text-xs text-gray-400">
          {isRegister ? (
            <span>
              已有账号？{' '}
              <button
                type="button"
                onClick={() => setIsRegister(false)}
                className="text-blue-400 hover:underline font-medium"
              >
                直接登录
              </button>
            </span>
          ) : (
            <span>
              还没有账号？{' '}
              <button
                type="button"
                onClick={() => setIsRegister(true)}
                className="text-blue-400 hover:underline font-medium"
              >
                免费注册
              </button>
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
