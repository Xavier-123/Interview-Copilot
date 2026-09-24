import React, { useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  /** 确认按钮文案，默认「确认」 */
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger 用红色确认按钮（删除等破坏性操作），primary 用品牌蓝 */
  tone?: 'danger' | 'primary';
  /** 确认动作进行中：按钮禁用并阻止重复提交 / Esc 关闭 */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 页内统一的确认弹窗，替代阻塞式 window.confirm。
 * 行为与 DateTimePicker 对齐：Esc 关闭、打开即聚焦确认按钮、带对话框语义。
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const { isDark } = useTheme();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmCls =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/20'
      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-all ${
          isDark ? 'bg-[#111827] border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900'
        }`}
      >
        <div className="flex items-start space-x-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              tone === 'danger'
                ? isDark
                  ? 'bg-red-950/60 border-red-800/60 text-red-400'
                  : 'bg-red-50 border-red-200 text-red-600'
                : isDark
                ? 'bg-blue-950/60 border-blue-800/60 text-blue-400'
                : 'bg-blue-50 border-blue-200 text-blue-600'
            }`}
          >
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="confirm-dialog-title" className="text-sm font-bold">
              {title}
            </h3>
            {description && (
              <div className={`text-xs mt-1.5 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {description}
              </div>
            )}
          </div>
        </div>

        <div
          className={`pt-4 mt-4 flex items-center justify-end space-x-3 border-t ${
            isDark ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`px-4 py-2 rounded-xl border text-xs font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isDark
                ? 'border-gray-800 hover:bg-gray-800 text-gray-300'
                : 'border-gray-300 hover:bg-gray-100 text-gray-700'
            }`}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-5 py-2 rounded-xl text-xs font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${confirmCls}`}
          >
            {busy ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
