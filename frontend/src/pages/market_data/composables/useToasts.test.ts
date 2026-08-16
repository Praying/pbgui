import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { useToasts } from './useToasts';

/* Legacy showToast (:4983-5002) + logNotification (:4969-4981):
   trims the text, no-ops on empty, relays to /api/notify_log (Bearer token),
   appends a .toast {level} node and removes it 3200 ms + 220 ms later. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('showToast guards (:4983-4986)', () => {
  it('no-ops on an empty or whitespace-only message', () => {
    const { toasts, showToast } = useToasts();
    showToast('');
    showToast('   ');
    showToast(null);
    expect(toasts.value).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trims the message before showing and relaying', () => {
    const { toasts, showToast } = useToasts();
    showToast('  saved  ', 'success');
    expect(toasts.value[0]?.message).toBe('saved');
  });
});

describe('notify_log relay (logNotification :4969-4981)', () => {
  it('posts {msg, level} with the boot bearer token to /api/notify_log', () => {
    const { showToast } = useToasts();
    showToast('Checksum saved', 'success');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/notify_log');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ msg: 'Checksum saved', level: 'success' });
  });

  it('defaults the relayed level to info (:4979)', () => {
    const { showToast } = useToasts();
    showToast('plain');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ msg: 'plain', level: 'info' });
  });

  it('swallows relay failures (legacy .catch no-op :4980)', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { toasts, showToast } = useToasts();
    showToast('still shows', 'error');
    expect(toasts.value).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4000);
  });
});

describe('toast lifecycle (:4987-5001)', () => {
  it('appends a visible toast that defaults to info', () => {
    const { toasts, showToast } = useToasts();
    showToast('hello');
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]).toMatchObject({ message: 'hello', level: 'info', leaving: false });
  });

  it('marks the toast is-leaving after 3200 ms', () => {
    const { toasts, showToast } = useToasts();
    showToast('hello', 'error');
    vi.advanceTimersByTime(3199);
    expect(toasts.value[0]?.leaving).toBe(false);
    vi.advanceTimersByTime(1);
    expect(toasts.value[0]?.leaving).toBe(true);
    expect(toasts.value).toHaveLength(1);
  });

  it('removes the toast 220 ms after the leaving phase', () => {
    const { toasts, showToast } = useToasts();
    showToast('hello');
    vi.advanceTimersByTime(3200 + 219);
    expect(toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts.value).toHaveLength(0);
  });

  it('runs independent timers for concurrent toasts', () => {
    const { toasts, showToast } = useToasts();
    showToast('first');
    vi.advanceTimersByTime(1000);
    showToast('second');
    vi.advanceTimersByTime(2200); // first hits 3200
    expect(toasts.value.map((t) => t.message)).toEqual(['first', 'second']);
    expect(toasts.value[0]?.leaving).toBe(true);
    expect(toasts.value[1]?.leaving).toBe(false);
    vi.advanceTimersByTime(220); // first fully gone; second only at leaving edge
    expect(toasts.value.map((t) => t.message)).toEqual(['second']);
  });

  it('gives each toast a distinct id', () => {
    const { toasts, showToast } = useToasts();
    showToast('a');
    showToast('b');
    expect(toasts.value[0]?.id).not.toBe(toasts.value[1]?.id);
  });

  it('dispose() clears pending timers without removing visible toasts early', () => {
    const { toasts, showToast, dispose } = useToasts();
    showToast('stuck');
    dispose();
    vi.advanceTimersByTime(10_000);
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]?.leaving).toBe(false);
  });
});

describe('custom notify relay', () => {
  it('uses the injected notify instead of fetch', () => {
    const notify = vi.fn();
    const { showToast } = useToasts({ notify });
    showToast('custom', 'warn');
    expect(notify).toHaveBeenCalledWith('custom', 'warn');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
