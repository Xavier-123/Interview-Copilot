import type { LLMConfig } from '../types';

const STORAGE_KEY = 'ic_llm_config';

export function loadLLMConfig(): LLMConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as LLMConfig;
    if (!cfg || !cfg.api_key?.trim() || !cfg.model?.trim()) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function saveLLMConfig(cfg: LLMConfig | null): void {
  try {
    if (!cfg || !cfg.api_key?.trim() || !cfg.model?.trim()) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    }
  } catch {
    // localStorage unavailable (e.g. privacy mode), ignore
  }
}
