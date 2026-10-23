import { afterEach, describe, expect, it, vi } from 'vitest';
import { settle } from './settle';

afterEach(() => vi.useRealTimers());

describe('settle', () => {
  it('detects vitest fake timers instead of waiting on a clock that never advances', async () => {
    vi.useFakeTimers();
    expect('clock' in (setTimeout as unknown as object)).toBe(true);
    await settle(); // would hang the 5s test timeout if it awaited a real setTimeout
    vi.useRealTimers();
    expect('clock' in (setTimeout as unknown as object)).toBe(false);
  });

  it('waits out an async chain deeper than a fixed number of flushes', async () => {
    const calls: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls.push(1);
      return { ok: true };
    }));
    // a chain of 12 dependent promise hops followed by a fetch — deeper than "two flushes"
    let p: Promise<void> = Promise.resolve();
    for (let i = 0; i < 12; i += 1) p = p.then(() => undefined);
    void p.then(() => fetch('/x'));
    await settle();
    expect(calls).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('keeps waiting while new fetches keep arriving, and stops once they stop', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    // each response triggers the next request, two more times
    const chain = async (n: number): Promise<void> => {
      await new Promise((r) => setTimeout(r, 0));
      await fetch('/n');
      if (n > 0) await chain(n - 1);
    };
    void chain(2);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });
});
