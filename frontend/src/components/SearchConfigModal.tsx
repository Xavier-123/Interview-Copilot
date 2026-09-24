import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Eraser, Globe2, Loader2, Search, X } from 'lucide-react';
import type { SearchMetadata } from '../types';
import { loadSearchConfig, saveSearchConfig } from '../utils/searchConfig';
import { apiFetch } from '../utils/api';

interface SearchConfigModalProps {
  open: boolean;
  onClose: () => void;
}

export function SearchConfigModal({ open, onClose }: SearchConfigModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SearchMetadata | null>(null);

  useEffect(() => {
    if (!open) return;
    setApiKey(loadSearchConfig()?.api_key ?? '');
    setTestResult(null);
  }, [open]);

  if (!open) return null;

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await apiFetch<SearchMetadata>('/api/v1/search/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'tavily', api_key: apiKey.trim() || null }),
      });
      setTestResult(data);
    } catch {
      setTestResult({
        provider: 'tavily',
        query: '',
        status: 'failed',
        results: [],
        error_code: 'network_error',
        error_message: '无法连接后端搜索服务',
        latency_ms: 0,
      });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    saveSearchConfig(apiKey.trim() ? { provider: 'tavily', api_key: apiKey.trim() } : null);
    onClose();
  };

  const clear = () => {
    saveSearchConfig(null);
    setApiKey('');
    setTestResult(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line-default bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-status-success" />
            <span className="text-sm font-semibold text-content-primary">搜索引擎配置</span>
          </div>
          <button type="button" onClick={onClose} title="关闭" className="text-content-muted transition hover:text-content-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-[11px] leading-relaxed text-content-secondary">
            API Key 仅保存在当前浏览器，每次搜索时临时发送，不会写入面试记录。留空时使用后端环境变量 TAVILY_API_KEY。
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-content-secondary">搜索引擎</label>
            <select disabled value="tavily" className="w-full rounded-xl border border-line-default bg-surface-subtle px-3 py-2 text-xs text-content-primary">
              <option value="tavily">Tavily Search</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-content-secondary">Tavily API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setTestResult(null);
              }}
              autoComplete="off"
              placeholder="tvly-...（可留空使用服务端配置）"
              className="w-full rounded-xl border border-line-default bg-surface-subtle px-3 py-2 font-mono text-xs text-content-primary placeholder-content-placeholder focus:border-status-success focus:outline-none focus:ring-1 focus:ring-status-success"
            />
          </div>

          {testResult && (
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
              testResult.status === 'success'
                ? 'border-status-success-border bg-status-success-bg text-status-success'
                : 'border-status-warning-border bg-status-warning-bg text-status-warning'
            }`}>
              {testResult.status === 'success' ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Search className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>{testResult.status === 'success' ? `连接成功，返回 ${testResult.results.length} 个结果` : testResult.error_message}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line-subtle px-5 py-4">
          <button type="button" onClick={clear} className="flex items-center gap-1.5 rounded-lg border border-line-default px-3 py-2 text-xs text-content-secondary transition hover:border-status-danger-border hover:text-status-danger">
            <Eraser className="h-3.5 w-3.5" />
            <span>清除本地 Key</span>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={testConnection} disabled={testing} className="flex items-center gap-1.5 rounded-lg border border-status-success-border px-3 py-2 text-xs text-status-success transition hover:bg-status-success-bg disabled:opacity-50">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              <span>{testing ? '测试中' : '测试连接'}</span>
            </button>
            <button type="button" onClick={save} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500">
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
