import type { SearchConfig } from '../types';

const STORAGE_KEY = 'ic_search_config';

export function loadSearchConfig(): SearchConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const config = JSON.parse(raw) as SearchConfig;
    if (config?.provider !== 'tavily' || !config.api_key?.trim()) return null;
    return { provider: 'tavily', api_key: config.api_key.trim() };
  } catch {
    return null;
  }
}

export function saveSearchConfig(config: SearchConfig | null): void {
  try {
    if (!config?.api_key?.trim()) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ provider: 'tavily', api_key: config.api_key.trim() }),
      );
    }
    window.dispatchEvent(new CustomEvent('ic-search-config-changed'));
  } catch {
    // localStorage unavailable (for example, privacy mode).
  }
}
