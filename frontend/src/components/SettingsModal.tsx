import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Cpu, Info, Eraser } from 'lucide-react';
import type { LLMConfig } from '../types';
import { loadLLMConfig, saveLLMConfig } from '../utils/llmConfig';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState('0.7');

  useEffect(() => {
    if (open) {
      const cfg = loadLLMConfig();
      setBaseUrl(cfg?.base_url ?? '');
      setApiKey(cfg?.api_key ?? '');
      setModel(cfg?.model ?? '');
      setTemperature(cfg?.temperature != null ? String(cfg.temperature) : '0.7');
    }
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    const cfg: LLMConfig = {
      base_url: baseUrl.trim(),
      api_key: apiKey.trim(),
      model: model.trim(),
      temperature: temperature ? Number(temperature) : undefined,
    };
    saveLLMConfig(cfg);
    onClose();
  };

  const handleClear = () => {
    saveLLMConfig(null);
    setBaseUrl('');
    setApiKey('');
    setModel('');
    setTemperature('0.7');
    onClose();
  };

  const inputCls =
    'w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono';

  // 用 Portal 渲染到 body：header 的 backdrop-blur 会成为 fixed 子元素的包含块，导致弹窗贴顶不居中
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-gray-100">大模型 API 配置</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-start space-x-2 text-[11px] text-gray-400 bg-blue-950/40 border border-blue-900/50 rounded-xl p-3 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <span>
              在此填写后将<strong className="text-blue-300">优先使用</strong>以下配置调用大模型；
              留空则使用后端 <code className="font-mono text-blue-300">.env</code> 中的默认配置。
              API Key 仅保存在本浏览器 localStorage 中。
            </span>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">
              API Base URL <span className="text-gray-600">（OpenAI 兼容地址，可选）</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="如 https://api.deepseek.com/v1 ，OpenAI 官方可留空"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">
              API Key <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className={inputCls}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">
              模型名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="如 deepseek-chat / gpt-4o / qwen-plus"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">
              Temperature <span className="text-gray-600">（可选，默认 0.7）</span>
            </label>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-800">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center space-x-1.5 text-xs text-gray-400 hover:text-red-300 px-3 py-2 rounded-lg border border-gray-800 hover:border-red-900/60 transition-colors"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>清空（用后端配置）</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!apiKey.trim() || !model.trim()}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
