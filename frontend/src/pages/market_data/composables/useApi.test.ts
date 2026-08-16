import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { useApi } from './useApi';

/* Legacy fetch helpers verbatim (market_data_main.html):
   fetchJson :4896-4908, fetchApiKeysJson :4910-4931 (401 → token-clear hook,
   body detail extraction), fetchJobsJson :4933-4941, fetchHeatmapJson
   :4943-4955. URL bases come from config.ts (M-data-1). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const BASE = 'http://pbgui.test:8000/api/market-data';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

interface QueuedResponse {
  body: unknown;
  ok: boolean;
  status: number;
  jsonThrows?: boolean;
}

let fetchMock: ReturnType<typeof vi.fn>;
let calls: RecordedCall[];
let queue: QueuedResponse[];

/** Queue the next response; the recorder stays installed for every call. */
function respond(body: unknown, init: { ok?: boolean; status?: number } = {}): void {
  queue.push({ body, ok: init.ok ?? true, status: init.status ?? 200 });
}

beforeEach(() => {
  calls = [];
  queue = [];
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift() ?? { body: {}, ok: true, status: 200 };
    return Promise.resolve({
      ok: next.ok,
      status: next.status,
      json: () =>
        next.jsonThrows ? Promise.reject(new Error('bad json')) : Promise.resolve(next.body),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson (:4896-4908)', () => {
  it('hits the market-data base and returns the parsed payload', async () => {
    const api = useApi();
    respond({ hello: 'world' });
    const data = await api.fetchJson<{ hello: string }>('/settings/hyperliquid');
    expect(calls[0]?.url).toBe(`${BASE}/settings/hyperliquid`);
    expect(data).toEqual({ hello: 'world' });
  });

  it('defaults cache to no-store (:4898)', async () => {
    const api = useApi();
    await api.fetchJson('/status/hyperliquid');
    expect(calls[0]?.init?.cache).toBe('no-store');
  });

  it('keeps an explicit cache option', async () => {
    const api = useApi();
    await api.fetchJson('/status/hyperliquid', { cache: 'force-cache' });
    expect(calls[0]?.init?.cache).toBe('force-cache');
  });

  it('adds a JSON content-type only when a body is sent (:4900-4902)', async () => {
    const api = useApi();
    await api.fetchJson('/settings/hyperliquid');
    await api.fetchJson('/settings/hyperliquid', { method: 'POST', body: '{"a":1}' });
    const headers = (call: number) => new Headers(calls[call]?.init?.headers);
    expect(headers(0).get('Content-Type')).toBeNull();
    expect(headers(1).get('Content-Type')).toBe('application/json');
  });

  it('does not mutate the caller-provided options object', async () => {
    const api = useApi();
    const init: RequestInit = { method: 'POST', body: '{"a":1}' };
    await api.fetchJson('/settings/hyperliquid', init);
    expect(init).toEqual({ method: 'POST', body: '{"a":1}' });
  });

  it('throws HTTP {status} on a non-ok response (:4904-4906)', async () => {
    const api = useApi();
    respond({ detail: 'ignored by fetchJson' }, { ok: false, status: 500 });
    await expect(api.fetchJson('/settings/hyperliquid')).rejects.toThrow('HTTP 500');
  });
});

describe('fetchJobsJson (:4933-4941)', () => {
  it('hits the root-stripped /api/jobs base', async () => {
    const api = useApi();
    respond([{ id: 'j1' }]);
    const data = await api.fetchJobsJson<{ id: string }[]>('/jobs/');
    expect(calls[0]?.url).toBe('http://pbgui.test:8000/api/jobs/');
    expect(data).toEqual([{ id: 'j1' }]);
  });

  it('defaults cache to no-store but adds no content-type (:4934-4936)', async () => {
    const api = useApi();
    await api.fetchJobsJson('/jobs/');
    expect(calls[0]?.init?.cache).toBe('no-store');
    expect(new Headers(calls[0]?.init?.headers).get('Content-Type')).toBeNull();
  });

  it('throws HTTP {status} on failure (:4937-4939)', async () => {
    const api = useApi();
    respond(null, { ok: false, status: 503 });
    await expect(api.fetchJobsJson('/jobs/')).rejects.toThrow('HTTP 503');
  });
});

describe('fetchHeatmapJson (:4943-4955)', () => {
  it('hits the rewritten /api/heatmap base', async () => {
    const api = useApi();
    respond({ figure: {} });
    await api.fetchHeatmapJson('/overview');
    expect(calls[0]?.url).toBe('http://pbgui.test:8000/api/heatmap/overview');
  });

  it('adds a JSON content-type when a body is sent and defaults no-store', async () => {
    const api = useApi();
    await api.fetchHeatmapJson('/queue-build-ohlcv', { method: 'POST', body: '{}' });
    expect(calls[0]?.init?.cache).toBe('no-store');
    expect(new Headers(calls[0]?.init?.headers).get('Content-Type')).toBe('application/json');
  });

  it('throws HTTP {status} on failure', async () => {
    const api = useApi();
    respond(null, { ok: false, status: 404 });
    await expect(api.fetchHeatmapJson('/minutes')).rejects.toThrow('HTTP 404');
  });
});

describe('fetchApiKeysJson (:4910-4931)', () => {
  it('prefixes /api-keys on the jobs root', async () => {
    const api = useApi();
    respond({ profiles: [] });
    await api.fetchApiKeysJson('/tradfi/profiles');
    expect(calls[0]?.url).toBe('http://pbgui.test:8000/api/api-keys/tradfi/profiles');
  });

  it('returns the parsed payload', async () => {
    const api = useApi();
    respond({ token: 'abc' });
    await expect(api.fetchApiKeysJson('/tradfi/reveal')).resolves.toEqual({ token: 'abc' });
  });

  it('returns {} when the body parses to null (:4930)', async () => {
    const api = useApi();
    respond(null);
    await expect(api.fetchApiKeysJson('/tradfi/config')).resolves.toEqual({});
  });

  it('extracts a string detail from the error body (:4926-4928)', async () => {
    const api = useApi();
    respond({ detail: 'vault locked' }, { ok: false, status: 409 });
    await expect(api.fetchApiKeysJson('/tradfi/reveal')).rejects.toThrow('vault locked');
  });

  it('extracts detail.message when detail is an object (:4927)', async () => {
    const api = useApi();
    respond({ detail: { message: 'structured failure' } }, { ok: false, status: 400 });
    await expect(api.fetchApiKeysJson('/tradfi/reveal')).rejects.toThrow('structured failure');
  });

  it('falls back to HTTP {status} when no usable detail exists (:4928)', async () => {
    const api = useApi();
    respond({}, { ok: false, status: 403 });
    await expect(api.fetchApiKeysJson('/tradfi/reveal')).rejects.toThrow('HTTP 403');
    respond({ detail: '' }, { ok: false, status: 403 });
    await expect(api.fetchApiKeysJson('/tradfi/reveal')).rejects.toThrow('HTTP 403');
  });

  it('fires the 401 hook before failing (:4924 — legacy clearTiingoRevealedToken)', async () => {
    const onUnauthorized = vi.fn();
    const api = useApi({ onUnauthorized });
    respond(null, { ok: false, status: 401 });
    await expect(api.fetchApiKeysJson('/tradfi/reveal')).rejects.toThrow('HTTP 401');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not fire the 401 hook for other statuses or successes', async () => {
    const onUnauthorized = vi.fn();
    const api = useApi({ onUnauthorized });
    respond({}, { ok: false, status: 500 });
    await expect(api.fetchApiKeysJson('/tradfi/reveal')).rejects.toThrow();
    respond({ ok: true });
    await api.fetchApiKeysJson('/tradfi/reveal');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('survives an unparseable error body (legacy try/catch :4919-4923)', async () => {
    const api = useApi();
    queue.push({ body: null, ok: false, status: 502, jsonThrows: true });
    await expect(api.fetchApiKeysJson('/tradfi/reveal')).rejects.toThrow('HTTP 502');
  });
});
