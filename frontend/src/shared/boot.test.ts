import { describe, expect, it } from 'vitest';
import { getBoot } from './boot';
import { resolveNavigationHref } from './lib/navigationHref';

describe('getBoot', () => {
  it('returns injected boot info', () => {
    (globalThis as Record<string, unknown>).__BOOT__ = { origin: 'http://x:1', base_prefix: '', authenticated: true, version: 'v1', serial: 's1' };
    expect(getBoot()).toEqual({ origin: 'http://x:1', base_prefix: '', authenticated: true, version: 'v1', serial: 's1' });
  });
  it('throws when boot.js was not loaded', () => {
    (globalThis as Record<string, unknown>).__BOOT__ = undefined;
    expect(() => getBoot()).toThrow(/boot/);
  });

  it('mounts local navigation without changing external or already-mounted targets', () => {
    (globalThis as Record<string, unknown>).__BOOT__ = { origin: 'http://test', base_prefix: '/team/pbgui' };
    expect(resolveNavigationHref('/api/jobs/main_page?view=history')).toBe('/team/pbgui/api/jobs/main_page?view=history');
    expect(resolveNavigationHref('/team/pbgui/api/jobs/main_page')).toBe('/team/pbgui/api/jobs/main_page');
    expect(resolveNavigationHref('https://external.test/api/jobs')).toBe('https://external.test/api/jobs');
    expect(resolveNavigationHref('//external.test/api/jobs')).toBe('//external.test/api/jobs');
    expect(resolveNavigationHref('#settings')).toBe('#settings');
  });
});
