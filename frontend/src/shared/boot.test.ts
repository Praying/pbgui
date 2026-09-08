import { describe, expect, it } from 'vitest';
import { getBoot } from './boot';

describe('getBoot', () => {
  it('returns injected boot info', () => {
    (globalThis as Record<string, unknown>).__BOOT__ = { origin: 'http://x:1', base_prefix: '', authenticated: true, version: 'v1', serial: 's1' };
    expect(getBoot()).toEqual({ origin: 'http://x:1', base_prefix: '', authenticated: true, version: 'v1', serial: 's1' });
  });
  it('throws when boot.js was not loaded', () => {
    (globalThis as Record<string, unknown>).__BOOT__ = undefined;
    expect(() => getBoot()).toThrow(/boot/);
  });
});
