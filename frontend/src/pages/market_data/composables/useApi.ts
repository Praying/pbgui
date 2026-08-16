import { apiUrl, heatmapApiUrl, jobsApiUrl } from '../config';

/*
 * Data layer — the legacy fetch helpers (market_data_main.html) with their
 * URL bases injected from config.ts:
 *
 *   fetchJson         :4896-4908  market-data router, cookie session
 *   fetchApiKeysJson  :4910-4931  /api/api-keys/* on the jobs root, 401 →
 *                                  onUnauthorized hook (legacy
 *                                  clearTiingoRevealedToken, M-data-4), body
 *                                  detail extraction
 *   fetchJobsJson     :4933-4941  /api/jobs/* on the jobs root
 *   fetchHeatmapJson  :4943-4955  /api/heatmap/* via the rewrite
 *
 * Deviation (documented): legacy mutated the caller's options object
 * (:4897-4902); the port builds a fresh init (immutability, same wire bytes).
 */

type FetchLike = typeof fetch;

export interface UseApiOptions {
  fetchImpl?: FetchLike;
  /** Legacy 401 side effect (:4924) — clearTiingoRevealedToken lands in M-data-4. */
  onUnauthorized?: () => void;
}

export interface UseApi {
  fetchJson<T>(path: string, init?: RequestInit): Promise<T>;
  fetchJobsJson<T>(path: string, init?: RequestInit): Promise<T>;
  fetchHeatmapJson<T>(path: string, init?: RequestInit): Promise<T>;
  fetchApiKeysJson<T>(path: string, init?: RequestInit): Promise<T>;
}

/** Shared request shaping: default no-store, JSON content-type with a body. */
function withDefaults(init: RequestInit | undefined, opts: { contentType: boolean }): RequestInit {
  const headers = new Headers(init?.headers);
  const body = init?.body;
  if (opts.contentType && body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return { ...init, cache: init?.cache ?? 'no-store', headers };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null; // legacy try/catch around the error-body parse (:4919-4923)
  }
}

export function useApi(options: UseApiOptions = {}): UseApi {
  const doFetch: FetchLike = options.fetchImpl ?? ((...args) => fetch(...args));

  async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await doFetch(apiUrl(path), withDefaults(init, { contentType: true }));
    if (!response.ok) throw new Error(`HTTP ${response.status}`); // :4904-4906
    return (await response.json()) as T;
  }

  async function fetchJobsJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await doFetch(jobsApiUrl(path), withDefaults(init, { contentType: false }));
    if (!response.ok) throw new Error(`HTTP ${response.status}`); // :4937-4939
    return (await response.json()) as T;
  }

  async function fetchHeatmapJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await doFetch(heatmapApiUrl(path), withDefaults(init, { contentType: true }));
    if (!response.ok) throw new Error(`HTTP ${response.status}`); // :4952-4954
    return (await response.json()) as T;
  }

  async function fetchApiKeysJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await doFetch(
      jobsApiUrl(`/api-keys${path}`),
      withDefaults(init, { contentType: true })
    );
    const payload = (await parseJson(response)) as
      | { detail?: unknown }
      | null;
    if (response.status === 401) options.onUnauthorized?.(); // :4924
    if (!response.ok) {
      const detail = payload?.detail;
      const message =
        detail && typeof detail === 'object'
          ? (detail as { message?: unknown }).message
          : detail;
      const text = message ? String(message) : ''; // falsy details fall through
      throw new Error(text || `HTTP ${response.status}`); // :4926-4928
    }
    return (payload ?? {}) as T; // :4930
  }

  return { fetchJson, fetchJobsJson, fetchHeatmapJson, fetchApiKeysJson };
}
