import { AlertTriangle, ExternalLink, Globe2 } from 'lucide-react';
import type { SearchMetadata } from '../types';

interface SearchSourcesProps {
  metadata?: SearchMetadata | null;
  compact?: boolean;
}

export function SearchSources({ metadata, compact = false }: SearchSourcesProps) {
  if (!metadata) return null;

  if (metadata.status === 'failed') {
    return (
      <div className="mt-2 flex items-start gap-1.5 border-t border-amber-800/30 pt-2 text-[10px] text-amber-300/90">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        <span>联网搜索未使用：{metadata.error_message || '搜索服务暂时不可用'}</span>
      </div>
    );
  }

  return (
    <details className={`mt-2 border-t border-emerald-800/30 pt-2 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-emerald-300 hover:text-emerald-200">
        <Globe2 className="h-3 w-3 shrink-0" />
        <span>
          Tavily 搜索成功 · {metadata.results.length} 个来源 · {metadata.latency_ms}ms
        </span>
      </summary>
      <div className="mt-2 space-y-1.5">
        {metadata.results.map((source, index) => (
          <a
            key={`${source.url}-${index}`}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-start gap-1.5 text-blue-300 hover:text-blue-200 hover:underline"
          >
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="break-words">{source.title || source.url}</span>
          </a>
        ))}
      </div>
    </details>
  );
}
