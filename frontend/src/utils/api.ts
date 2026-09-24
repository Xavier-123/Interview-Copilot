export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Fetch JSON and turn every non-2xx response into a predictable exception.
 * Keeping this at one boundary prevents pages from rendering an error payload
 * (for example { detail: ... }) as if it were a successful session snapshot.
 */
export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : '网络连接失败',
      0,
    );
  }

  let payload: unknown = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  } else {
    payload = await response.text().catch(() => null);
  }

  if (!response.ok) {
    const detail =
      typeof payload === 'object' && payload !== null && 'detail' in payload
        ? String((payload as { detail?: unknown }).detail || '')
        : typeof payload === 'string'
          ? payload
          : '';
    throw new ApiError(detail || `请求失败（HTTP ${response.status}）`, response.status, detail);
  }

  return payload as T;
}

/**
 * 把异常转成可直接展示给用户的文案。
 * 后端在模型不可用等场景会返回可读的 detail，优先把它透出去，
 * 避免页面用"请稍后重试"把真实原因盖掉。
 */
export function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.detail || error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
