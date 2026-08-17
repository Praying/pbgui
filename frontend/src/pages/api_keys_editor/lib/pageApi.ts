import { apiBase } from '../config';

/**
 * Page-local fetch with the exact legacy apiFetch semantics
 * (api_keys_editor.html:1216-1240): cookie auth, JSON detail-object message
 * extraction, operationId propagation for TradFi saves, and 401 → clear
 * revealed secrets. The shared @/shared/api apiFetch keeps string-detail
 * semantics only, so this page keeps its own adapter.
 */

export class PageApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail: unknown,
    public operationId: string
  ) {
    super(message);
  }
}

type UnauthorizedHook = () => void;
const unauthorizedHooks = new Set<UnauthorizedHook>();

/** Register a 401 callback (revealed-key clearing); returns an unregister fn. */
export function onUnauthorized(hook: UnauthorizedHook): () => void {
  unauthorizedHooks.add(hook);
  return () => unauthorizedHooks.delete(hook);
}

export async function pageFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = apiBase() + path;
  const headers = { 'Content-Type': 'application/json' };
  const resp = await fetch(url, { credentials: 'same-origin', headers, ...options } as RequestInit & { headers: Record<string, string> });
  if (resp.status === 401) {
    for (const hook of [...unauthorizedHooks]) hook();
  }
  if (!resp.ok) {
    let detail: unknown = null;
    try {
      const body = await resp.json();
      detail = (body as { detail?: unknown }).detail != null ? (body as { detail?: unknown }).detail : body;
    } catch {
      detail = resp.statusText;
    }
    const message =
      detail && typeof detail === 'object'
        ? String(
            (detail as { message?: unknown; error?: unknown }).message ||
              (detail as { error?: unknown }).error ||
              resp.statusText ||
              'HTTP ' + resp.status
          )
        : String(detail || resp.statusText || 'HTTP ' + resp.status);
    const operationId =
      detail && typeof detail === 'object' ? String((detail as { operation_id?: unknown }).operation_id || '') : '';
    throw new PageApiError(message, resp.status, detail, operationId);
  }
  return (await resp.json()) as T;
}
