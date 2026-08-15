import { describe, expect, it, vi } from 'vitest';
import { currentGeneration, useDashboardFetch, type FetchLike } from './useDashboardFetch';

function okJson<T>(data: T): ReturnType<typeof vi.fn<FetchLike>> {
  return vi.fn<FetchLike>().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useDashboardFetch (editor _buildGen skeleton)', () => {
  it('stores data on success and exposes the in-flight loading state', async () => {
    const d = deferred<FetchLike>();
    const fetchFn = vi.fn().mockReturnValue(
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ rows: [1] }) })
    );
    const api = useDashboardFetch<{ rows: number[] }>('top_1_2', { fetchFn });
    void d;
    const run = api.run('http://x/top_data?users=ALL');

    expect(api.loading.value).toBe(true);
    expect(api.data.value).toBeNull();

    await run;
    expect(api.loading.value).toBe(false);
    expect(api.data.value).toEqual({ rows: [1] });
    expect(api.error.value).toBe(false);
  });

  it('sets error when the first fetch fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const api = useDashboardFetch<unknown>('bal_1_1', { fetchFn });

    await api.run('http://x/balance?users=ALL');

    expect(api.error.value).toBe(true);
    expect(api.data.value).toBeNull();
  });

  it('keeps the last data and stays error-free when a later fetch fails (legacy children.length > 0 guard)', async () => {
    const fetchFn = okJson({ rows: [1] });
    const api = useDashboardFetch<{ rows: number[] }>('top_1_1', { fetchFn });
    await api.run('http://x/1');

    fetchFn.mockResolvedValueOnce({ ok: false, status: 502, json: () => Promise.resolve({}) });
    await api.run('http://x/2');

    expect(api.data.value).toEqual({ rows: [1] });
    expect(api.error.value).toBe(false);
  });

  it('clears the error once a fetch succeeds', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const api = useDashboardFetch<{ v: string }>('pnl_2_1', { fetchFn });
    await api.run('http://x/1');
    expect(api.error.value).toBe(true);

    fetchFn.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ v: 'ok' }) });
    await api.run('http://x/2');

    expect(api.error.value).toBe(false);
    expect(api.data.value).toEqual({ v: 'ok' });
  });

  it('discards a slow success that resolves after a newer run (legacy _buildGen staleness)', async () => {
    const slow = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    const fetchFn = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ gen: 2 }) })
      );
    const api = useDashboardFetch<{ gen: number }>('top_1_2', { fetchFn });

    const first = api.run('http://x/1');
    const second = api.run('http://x/2');
    await second;
    expect(api.data.value).toEqual({ gen: 2 });

    slow.resolve({ ok: true, status: 200, json: () => Promise.resolve({ gen: 1 }) });
    await first;
    expect(api.data.value).toEqual({ gen: 2 }); // stale gen:1 response discarded
  });

  it('discards a stale failure (a newer run owns the widget)', async () => {
    const slow = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    const fetchFn = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ gen: 2 }) })
      );
    const api = useDashboardFetch<{ gen: number }>('top_1_2', { fetchFn });

    const first = api.run('http://x/1');
    await api.run('http://x/2');
    slow.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    await first;

    expect(api.error.value).toBe(false);
    expect(api.data.value).toEqual({ gen: 2 });
  });

  it('shares the generation counter between instances with the same key (legacy global _buildGen)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    const a = useDashboardFetch('pos_2_1', { fetchFn });
    const b = useDashboardFetch('pos_2_1', { fetchFn });

    await a.run('http://x/1');
    expect(currentGeneration('pos_2_1')).toBe(1);
    expect(b.generation.value).toBe(0); // b has not run yet

    await b.run('http://x/2');
    expect(currentGeneration('pos_2_1')).toBe(2);

    // a's next run is gen 3; b's gen-4 run supersedes it before a's fetch lands
    const stale = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    fetchFn.mockReturnValueOnce(stale.promise);
    const aRun = a.run('http://x/3');
    await b.run('http://x/4');
    stale.resolve({ ok: true, status: 200, json: () => Promise.resolve({ who: 'a' }) });
    await aRun;
    expect(a.data.value).toEqual({}); // a keeps its gen-1 data; the stale gen-3 payload is discarded
  });

  it('invalidate() bumps the key generation so in-flight work is discarded', async () => {
    const slow = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    const fetchFn = vi.fn().mockReturnValue(slow.promise);
    const api = useDashboardFetch('adg_3_2', { fetchFn });

    const run = api.run('http://x/adg');
    expect(currentGeneration('adg_3_2')).toBe(1);
    api.invalidate();
    expect(currentGeneration('adg_3_2')).toBe(2);

    slow.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await run;
    expect(api.data.value).toBeNull();
  });

  it('defaults to the global fetch when no fetchFn is provided', async () => {
    const stub = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
    vi.stubGlobal('fetch', stub);
    const api = useDashboardFetch<{ ok: boolean }>('ppl_1_1');

    await api.run('http://x/ppl_data');
    expect(stub).toHaveBeenCalledWith('http://x/ppl_data');
    expect(api.data.value).toEqual({ ok: true });

    vi.unstubAllGlobals();
  });

  it('treats a JSON parse failure like a network failure (legacy r.json() rejection)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('bad json')),
    });
    const api = useDashboardFetch<unknown>('bal_1_1', { fetchFn });

    await api.run('http://x/balance?users=ALL');

    expect(api.error.value).toBe(true);
    expect(api.data.value).toBeNull();
    expect(api.loading.value).toBe(false);
  });
});
