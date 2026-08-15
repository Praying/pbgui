import { getBoot } from './boot';

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`API ${status}: ${detail}`);
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getBoot().token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const resp = await fetch(url, { ...init, headers });
  const data: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = typeof (data as { detail?: unknown })?.detail === 'string' ? (data as { detail: string }).detail : resp.statusText;
    throw new ApiError(resp.status, detail);
  }
  return data as T;
}
