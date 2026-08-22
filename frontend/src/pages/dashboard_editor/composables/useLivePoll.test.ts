import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canLivePoll,
  useLiveBalance,
  useLivePositions,
  type LivePollController,
} from './useLivePoll';
import type { FetchLike } from './useDashboardFetch';

const BASE = 'http://pbgui.test:8000/api';

function okJson(data: unknown): FetchLike {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

function deferredJson() {
  let resolve!: (d: unknown) => void;
  const json = () =>
    new Promise<unknown>((res) => {
      resolve = res;
    });
  /* Return a callable so the inner resolve/reject are read at call time —
     json() assigns them on first invocation by the composable. */
  return {
    json,
    resolve: (d: unknown) => resolve(d),
  };
}

interface LivePollTestOpts {
  fetchFn?: FetchLike;
  now?: () => number;
  isBlocked?: () => boolean;
  isConnected?: () => boolean;
  onData?: (data: unknown, source: 'live' | 'mixed' | 'db') => void;
}

function makePositions(opts: LivePollTestOpts = {}): LivePollController {
  return useLivePositions({
    apiBase: BASE,
    fetchFn: opts.fetchFn ?? okJson({ positions: [], source: 'db' }),
    now: opts.now ?? (() => Date.now()),
    isBlocked: opts.isBlocked ?? (() => false),
    isConnected: opts.isConnected ?? (() => true),
    onData: opts.onData ?? (() => {}),
  });
}

function makeBalance(opts: LivePollTestOpts = {}): LivePollController {
  return useLiveBalance({
    apiBase: BASE,
    fetchFn: opts.fetchFn ?? okJson({ rows: [], source: 'db' }),
    now: opts.now ?? (() => Date.now()),
    isBlocked: opts.isBlocked ?? (() => false),
    isConnected: opts.isConnected ?? (() => true),
    onData: opts.onData ?? (() => {}),
  });
}

describe('useLivePositions (editor _connectLivePos:1084-1119)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects ALL / empty / missing / oversized user lists without connecting', () => {
    const fetchFn = vi.fn();
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['ALL']);
    poll.connect('1_1', []);
    poll.connect('1_1', undefined);
    poll.connect('1_1', null);
    poll.connect('1_1', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11']);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects when more than 10 initial rows are shown', () => {
    const fetchFn = vi.fn();
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1'], new Array(11).fill({}));

    expect(fetchFn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows exactly 10 users and 10 rows (legacy caps are inclusive)', () => {
    const fetchFn = okJson({ positions: [], source: 'live' });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', Array.from({ length: 10 }, (_, i) => `u${i}`), new Array(10).fill({}));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    poll.disconnect();
  });

  it('fetches immediately with the live=1 URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ positions: [{ sym: 'BTC' }], source: 'live' }),
    });
    const poll = makePositions({ fetchFn });

    poll.connect('2_1', ['u1', 'u2']);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(`${BASE}/dashboard/positions_data?users=u1%2Cu2&live=1`);
  });

  it('passes positions and source to onData (legacy container._dpUpdate)', async () => {
    const rows = [{ sym: 'BTC' }];
    const fetchFn = okJson({ positions: rows, source: 'live' });
    const onData = vi.fn();
    const poll = makePositions({ fetchFn, onData });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0);

    expect(onData).toHaveBeenCalledWith(rows, 'live');
  });

  it('defaults the source to db when the server omits it', async () => {
    const fetchFn = okJson({ positions: [] });
    const onData = vi.fn();
    const poll = makePositions({ fetchFn, onData });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0);

    expect(onData).toHaveBeenCalledWith([], 'db');
  });

  it('shows live status in green on live data', async () => {
    const fetchFn = okJson({ positions: [], source: 'live' });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0);

    expect(poll.statusText.value).toBe('Live: now');
    expect(poll.statusColor.value).toBe('#46c88f');
  });

  it('clears the green color for mixed/db sources (legacy _setSourceStatus)', async () => {
    const fetchFn = okJson({ positions: [], source: 'mixed' });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0);

    expect(poll.statusText.value).toBe('Mixed live/DB: now');
    expect(poll.statusColor.value).toBe('');
  });

  it('re-applies the aging status every second', async () => {
    const fetchFn = okJson({ positions: [], source: 'live' });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(poll.statusText.value).toBe('Live: now'); // age 1s still reads "now"

    await vi.advanceTimersByTimeAsync(1000);
    expect(poll.statusText.value).toBe('Live: 2s ago');

    await vi.advanceTimersByTimeAsync(1000);
    expect(poll.statusText.value).toBe('Live: 3s ago');
  });

  it('respects the 5s minimum gap between fetches', async () => {
    const fetchFn = okJson({ positions: [], source: 'db' });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1']); // immediate fetch (#1)
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(1); // 1s-4s ticks all skipped

    await vi.advanceTimersByTimeAsync(1000); // t=5s — gap reached
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000); // t=10s
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('does not stack fetches while one is in flight (legacy st.loading guard)', async () => {
    const d = deferredJson();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: d.json });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0); // immediate fetch starts, hangs
    await vi.advanceTimersByTimeAsync(10_000); // ticks see loading → skip
    expect(fetchFn).toHaveBeenCalledTimes(1);

    d.resolve({ positions: [], source: 'db' });
    // let the next fetches settle immediately instead of hanging on the same deferred json
    fetchFn.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ positions: [], source: 'db' }),
    });
    await vi.advanceTimersByTimeAsync(1000); // settle; t=11s tick — gap since the t=0 fetch start is ≥ 5s
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000); // t=16s — gap since t=11s
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('skips refreshes while the multi-select dropdown is open (legacy .msel-drop.open guard)', async () => {
    let blocked = true;
    const fetchFn = okJson({ positions: [], source: 'db' });
    const poll = makePositions({ fetchFn, isBlocked: () => blocked });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(5000); // blocked even for the immediate refresh
    expect(fetchFn).not.toHaveBeenCalled();

    blocked = false;
    await vi.advanceTimersByTimeAsync(1000); // next tick proceeds
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('disconnects and stops ticking when the container detaches', async () => {
    let connected = true;
    const fetchFn = okJson({ positions: [], source: 'db' });
    const poll = makePositions({ fetchFn, isConnected: () => connected });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    connected = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0); // interval cleared (legacy leaked this timer)
  });

  it('never starts when already detached at connect time', () => {
    const fetchFn = vi.fn();
    const poll = makePositions({ fetchFn, isConnected: () => false });

    poll.connect('1_1', ['u1']);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears only the status color on fetch error (legacy _clearBadge)', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ positions: [], source: 'live' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0);
    expect(poll.statusText.value).toBe('Live: now');
    expect(poll.statusColor.value).toBe('#46c88f');

    await vi.advanceTimersByTimeAsync(5000); // t=5s tick: ages the text, then the failed fetch runs
    expect(poll.statusColor.value).toBe(''); // color cleared…
    expect(poll.statusText.value).toBe('Live: 5s ago'); // …but the text is preserved (aged by the tick)
  });

  it('reuses the existing connection when users are unchanged (legacy early return)', async () => {
    const fetchFn = okJson({ positions: [], source: 'db' });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1', 'u2']);
    poll.connect('1_1', ['u1', 'u2']); // rebuild after a WS event — same users
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('reconnects with a fresh immediate fetch when users change', async () => {
    const fetchFn = okJson({ positions: [], source: 'db' });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1']);
    poll.connect('1_1', ['u1', 'u2']); // different users → restart
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenLastCalledWith(`${BASE}/dashboard/positions_data?users=u1%2Cu2&live=1`);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('drops the connection when users become invalid', async () => {
    const fetchFn = okJson({ positions: [], source: 'db' });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1']);
    expect(vi.getTimerCount()).toBe(1);

    poll.connect('1_1', ['ALL']);
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchFn).toHaveBeenCalledTimes(1); // only the initial valid fetch
  });

  it('disconnect() stops the timer and the fetches', async () => {
    const fetchFn = okJson({ positions: [], source: 'db' });
    const poll = makePositions({ fetchFn });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0);
    poll.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores stale in-flight responses from a superseded connection', async () => {
    const slow = deferredJson();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: slow.json })
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ positions: ['new'], source: 'live' }) });
    const onData = vi.fn();
    const poll = makePositions({ fetchFn, onData });

    poll.connect('1_1', ['u1']); // hangs
    poll.connect('1_1', ['u2']); // restart — new immediate fetch lands
    await vi.advanceTimersByTimeAsync(0);
    expect(onData).toHaveBeenCalledWith(['new'], 'live');

    slow.resolve({ positions: ['old'], source: 'db' });
    await vi.advanceTimersByTimeAsync(0);
    expect(onData).not.toHaveBeenCalledWith(['old'], 'db'); // old connection discarded
    expect(poll.statusText.value).toBe('Live: now');
  });
});

describe('useLiveBalance (editor _connectLiveBal:1121-1159)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches the balance URL with live=1', async () => {
    const fetchFn = okJson({ rows: [], totals: {}, source: 'live' });
    const poll = makeBalance({ fetchFn });

    poll.connect('1_1', ['u1', 'u2']);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchFn).toHaveBeenCalledWith(`${BASE}/dashboard/balance?users=u1%2Cu2&live=1`);
  });

  it('updates the widget only for live/mixed sources (legacy buildBalance gate)', async () => {
    const liveRows = { rows: [{ user: 'u1' }], source: 'live' };
    const fetchFn = okJson(liveRows);
    const onData = vi.fn();
    const poll = makeBalance({ fetchFn, onData });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0);

    expect(onData).toHaveBeenCalledWith(liveRows, 'live');
    expect(poll.statusText.value).toBe('Live: now');
    expect(poll.statusColor.value).toBe('#46c88f');
  });

  it('ignores db-source responses (no rebuild, no status update) until the next tick', async () => {
    const fetchFn = okJson({ rows: [], source: 'db' });
    const onData = vi.fn();
    const poll = makeBalance({ fetchFn, onData });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0);

    expect(onData).not.toHaveBeenCalled();
    expect(poll.statusText.value).toBe(''); // untouched on the db path

    await vi.advanceTimersByTimeAsync(1000); // tick re-applies status from internal state
    expect(poll.statusText.value).toBe('DB fallback: now');
    expect(poll.statusColor.value).toBe('');
  });

  it('applies the same user-list caps as positions', () => {
    const fetchFn = vi.fn();
    const poll = makeBalance({ fetchFn });

    poll.connect('1_1', ['ALL']);
    poll.connect('1_1', []);
    poll.connect('1_1', undefined);
    poll.connect('1_1', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11']);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not stack fetches and clears the color on errors like positions', async () => {
    const d = deferredJson();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: d.json });
    const poll = makeBalance({ fetchFn });

    poll.connect('1_1', ['u1']);
    await vi.advanceTimersByTimeAsync(0); // json() is invoked by the composable → resolve is armed
    d.resolve({ rows: [], source: 'live' });
    await vi.advanceTimersByTimeAsync(0);
    expect(poll.statusColor.value).toBe('#46c88f');

    fetchFn.mockResolvedValueOnce({ ok: false, status: 502, json: () => Promise.resolve({}) });
    await vi.advanceTimersByTimeAsync(5000);
    expect(poll.statusColor.value).toBe('');
    expect(poll.statusText.value).toBe('Live: 5s ago'); // preserved (aged by the tick)
  });

  it('reconnects when users change', async () => {
    const fetchFn = okJson({ rows: [], source: 'db' });
    const poll = makeBalance({ fetchFn });

    poll.connect('1_1', ['u1']);
    poll.connect('1_1', ['u2']);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenLastCalledWith(`${BASE}/dashboard/balance?users=u2&live=1`);
  });
});

describe('canLivePoll — the shared eligibility gate (editor:1091/1128)', () => {
  it('accepts 1..10 specific users', () => {
    expect(canLivePoll(['u1'])).toBe(true);
    expect(canLivePoll(Array.from({ length: 10 }, (_, i) => 'u' + i))).toBe(true);
  });

  it('rejects null, empty, ALL and >10-user selections', () => {
    expect(canLivePoll(null)).toBe(false);
    expect(canLivePoll([])).toBe(false);
    expect(canLivePoll(['ALL'])).toBe(false);
    expect(canLivePoll(['u1', 'ALL'])).toBe(false);
    expect(canLivePoll(Array.from({ length: 11 }, (_, i) => 'u' + i))).toBe(false);
  });
});
