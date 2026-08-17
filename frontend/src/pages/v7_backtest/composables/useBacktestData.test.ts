import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigs } from './useConfigs';
import { createToastQueue, type ToastItem } from '../lib/toast';
import { formatArchivePullElapsed, useElapsedTimer } from '../lib/elapsed';

/*
 * Configs data layer (loadConfigs :1647-1652 — list UI is M-v7-9),
 * the backtest toast (:1233-1251) and the 1 s archive-pull elapsed
 * timer (:9495-9529).
 */

const fetchMock = vi.fn();

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock.mockReset().mockImplementation(() => ok({})));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useConfigs (:1647-1652)', () => {
  it('GETs /configs and stores d.configs', async () => {
    fetchMock.mockImplementationOnce(() => ok({ configs: [{ name: 'a' }, { name: 'b' }] }));
    const store = useConfigs({ apiBase: 'http://h:8000/api/backtest-v7' });
    await store.loadConfigs();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://h:8000/api/backtest-v7/configs');
    expect(store.configs.value).toEqual([{ name: 'a' }, { name: 'b' }]);
    expect(store.loadedOnce.value).toBe(true);
  });

  it('a missing configs array degrades to empty (:1649)', async () => {
    fetchMock.mockImplementationOnce(() => ok({}));
    const store = useConfigs({ apiBase: 'http://h' });
    await store.loadConfigs();
    expect(store.configs.value).toEqual([]);
  });

  it('a failed load reports the error and marks the list unloaded-for-retry', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ detail: 'nope' }), { status: 500 })));
    const onError = vi.fn();
    const store = useConfigs({ apiBase: 'http://h', onError });
    await store.loadConfigs();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(store.loadedOnce.value).toBe(false);
  });

  it('lazy-load semantics: load only while empty (:1452)', async () => {
    fetchMock.mockImplementation(() => ok({ configs: [{ name: 'a' }] }));
    const store = useConfigs({ apiBase: 'http://h' });
    await store.loadIfEmpty();
    await store.loadIfEmpty();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('createToastQueue (:1233-1251)', () => {
  interface FakeTimers {
    now: number;
    ids: Map<number, () => void>;
    nextId: number;
  }
  function timers(): FakeTimers {
    return { now: 0, ids: new Map(), nextId: 1 };
  }
  function queue(t: FakeTimers, seen: ToastItem[] = []) {
    return createToastQueue({
      seen,
      timers: {
        setTimeout: (fn: () => void) => {
          const id = t.nextId++;
          t.ids.set(id, fn);
          return id;
        },
        clearTimeout: (id: number) => t.ids.delete(id),
      } as never,
      fetchFn: fetchMock,
      now: () => t.now,
    });
  }

  it('mirrors every toast into /api/notify_log fire-and-forget (:1241-1245)', () => {
    const t = timers();
    const q = queue(t);
    q.show('hello', 'ok');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notify_log',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ msg: 'hello', level: 'ok' }) })
    );
    q.dispose();
  });

  it('auto-removes after 4 s (:1250)', () => {
    const t = timers();
    const q = queue(t);
    q.show('gone soon', 'info');
    expect(q.items.value).toHaveLength(1);
    t.now += 4000;
    [...t.ids.values()].forEach((fn) => fn());
    expect(q.items.value).toHaveLength(0);
    q.dispose();
  });

  it('dedupes the same message within 10 s (:1236-1239)', () => {
    const t = timers();
    const q = queue(t);
    q.show('same', 'err');
    t.now += 5000;
    q.show('same', 'err');
    expect(q.items.value).toHaveLength(1);
    t.now += 6000; // > 10 s since the first
    q.show('same', 'err');
    expect(q.items.value).toHaveLength(2);
    q.dispose();
  });

  it('different types of the same message are distinct keys (:1236)', () => {
    const t = timers();
    const q = queue(t);
    q.show('msg', 'ok');
    q.show('msg', 'err');
    expect(q.items.value).toHaveLength(2);
    q.dispose();
  });

  it('notify_log failures are swallowed (:1245)', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    const t = timers();
    const q = queue(t);
    expect(() => q.show('x', 'info')).not.toThrow();
    await Promise.resolve();
    q.dispose();
  });
});

describe('formatArchivePullElapsed (:9495-9499)', () => {
  it('formats seconds only below a minute', () => {
    expect(formatArchivePullElapsed(1000, 1599)).toBe('0s');
    expect(formatArchivePullElapsed(1000, 11_000)).toBe('10s');
  });

  it('formats minutes and seconds above a minute', () => {
    expect(formatArchivePullElapsed(1000, 61_000)).toBe('1m 0s');
    expect(formatArchivePullElapsed(0, 125_000)).toBe('2m 5s');
  });

  it('never reports negative time (:9496)', () => {
    expect(formatArchivePullElapsed(5000, 1000)).toBe('0s');
  });
});

describe('useElapsedTimer (:9526-9528)', () => {
  it('ticks every second while running and stops cleanly', async () => {
    vi.useFakeTimers();
    try {
      const timer = useElapsedTimer();
      timer.start();
      expect(timer.elapsedText.value).toBe('0s');
      vi.advanceTimersByTime(3000);
      expect(timer.elapsedText.value).toBe('3s');
      vi.advanceTimersByTime(60_000);
      expect(timer.elapsedText.value).toBe('1m 3s');
      timer.stop();
      const frozen = timer.elapsedText.value;
      vi.advanceTimersByTime(5000);
      expect(timer.elapsedText.value).toBe(frozen);
    } finally {
      vi.useRealTimers();
    }
  });

  it('start resets the clock (:9512-9513)', async () => {
    vi.useFakeTimers();
    try {
      const timer = useElapsedTimer();
      timer.start();
      vi.advanceTimersByTime(5000);
      timer.start();
      expect(timer.elapsedText.value).toBe('0s');
      timer.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
