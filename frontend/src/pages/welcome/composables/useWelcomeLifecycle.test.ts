import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { useWelcome } from './useWelcome';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Welcome authentication reload lifecycle', () => {
  it('cancels the delayed reload when its owning scope leaves', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('__BOOT__', {
      origin: 'http://test', base_prefix: '', authenticated: true, version: 'fixture', serial: 'fixture',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Password updated' }))));
    const scope = effectScope();
    const store = scope.run(() => useWelcome({ t: (key) => key }))!;
    store.newPassword.value = 'synthetic-password-fixture';
    await store.changePassword();
    expect(vi.getTimerCount()).toBe(1);
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(250);
  });
});
