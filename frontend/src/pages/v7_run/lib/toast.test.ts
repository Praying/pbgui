import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_FADE_MS, TOAST_VISIBLE_MS, createToast, notifyLog } from './toast';

/* The toast contract (v7_run.html:1388-1407): notify-log mirror plus the
   8 s visible / 300 ms fade DOM animation. */

describe('notifyLog (:1391-1396)', () => {
  it('POSTs the message with same-origin credentials', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    notifyLog('hello', 'err', fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notify_log',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ msg: 'hello', level: 'err' }),
      })
    );
  });

  it('swallows failures', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('down')));
    await expect(
      new Promise<void>((resolve) => {
        notifyLog('x', 'ok', fetchMock as unknown as typeof fetch);
        resolve();
      })
    ).resolves.toBeUndefined();
  });
});

describe('createToast (:1397-1407)', () => {
  let el: HTMLDivElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    el.remove();
  });

  it('shows the message with the kind classes and mirrors it to the log', () => {
    const notify = vi.fn();
    const toast = createToast(() => el, notify);

    toast.show('Deleted!', 'ok');

    expect(notify).toHaveBeenCalledWith('Deleted!', 'ok', expect.anything());
    expect(el.textContent).toBe('Deleted!');
    expect(el.classList.contains('bg-success')).toBe(true);
    expect(el.style.display).toBe('block');
    expect(el.style.opacity).toBe('1');
  });

  it('swaps colour classes between kinds without touching static classes', () => {
    const toast = createToast(() => el, () => undefined);
    el.classList.add('fixed', 'bottom-5'); // the App.vue positioning utilities

    toast.show('one', 'ok');
    expect(el.classList.contains('bg-success')).toBe(true);

    toast.show('two', 'err');
    expect(el.classList.contains('bg-danger')).toBe(true);
    expect(el.classList.contains('bg-success')).toBe(false);
    expect(el.classList.contains('fixed')).toBe(true);
    expect(el.classList.contains('bottom-5')).toBe(true);
  });

  it('defaults to info and tolerates a missing element', () => {
    const notify = vi.fn();
    const toast = createToast(() => null, notify);
    expect(() => toast.show('gone', undefined)).not.toThrow();
    expect(notify).toHaveBeenCalledWith('gone', 'info', expect.anything());
  });

  it('fades after 8 s and hides after the fade', () => {
    const toast = createToast(() => el, () => undefined);
    toast.show('msg', 'info');

    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1);
    expect(el.style.opacity).toBe('1');
    vi.advanceTimersByTime(1);
    expect(el.style.opacity).toBe('0');
    vi.advanceTimersByTime(TOAST_FADE_MS);
    expect(el.style.display).toBe('none');
  });

  it('a second show resets the timers (:1402)', () => {
    const toast = createToast(() => el, () => undefined);
    toast.show('one', 'info');
    vi.advanceTimersByTime(TOAST_VISIBLE_MS + 100);
    toast.show('two', 'err');
    expect(el.style.opacity).toBe('1');
    vi.advanceTimersByTime(TOAST_VISIBLE_MS + TOAST_FADE_MS);
    expect(el.style.display).toBe('none');
  });

  it('dispose clears pending timers and hides the element', () => {
    const toast = createToast(() => el, () => undefined);
    toast.show('msg', 'info');
    toast.dispose();
    vi.advanceTimersByTime(TOAST_VISIBLE_MS + TOAST_FADE_MS + 10);
    expect(el.style.display).toBe('none');
    expect(el.style.opacity).toBe('1'); // fade timer was cleared
  });
});
