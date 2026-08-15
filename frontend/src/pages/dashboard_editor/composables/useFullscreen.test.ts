import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import { useFullscreen, type FullscreenController } from './useFullscreen';

/*
 * Port of the duplicated legacy fullscreen handlers (render.js:647-659,
 * 1639-1650, 1905-1936, 3920-3931, + modebar click 661-678, close button
 * 805-812):
 *
 *  - fullscreenchange/webkitfullscreenchange listeners toggle the close
 *    button and relayout to fill the screen (availHeight - 62) or restore
 *    (width/height null, Plots.resize 100 ms later);
 *  - the modebar button toggles requestFullscreen/exitFullscreen on the
 *    widget's .dt-root; the close button exits;
 *  - R4 fix: legacy never removed its 6 listeners per rebuild — the
 *    composable removes them on unmount.
 */

interface FsDocument {
  fullscreenElement: Element | null;
  webkitFullscreenElement: Element | null;
  exitFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
}

function fakeRoot(): HTMLElement & { requestFullscreen?: () => void; webkitRequestFullscreen?: () => void } {
  return { requestFullscreen: vi.fn() } as unknown as HTMLElement & { requestFullscreen: () => void };
}

/* Spies that FORWARD to the real document methods — registration assertions
   and live event dispatch both work (a plain spy would swallow the handlers
   and dispatched events would never reach the composable). */
const realAdd = document.addEventListener.bind(document);
const realRemove = document.removeEventListener.bind(document);
const addSpy = vi.fn(
  (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) =>
    realAdd(type, listener, options)
);
const removeSpy = vi.fn(
  (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) =>
    realRemove(type, listener, options)
);

beforeEach(() => {
  addSpy.mockClear();
  removeSpy.mockClear();
  document.addEventListener = addSpy as unknown as typeof document.addEventListener;
  document.removeEventListener = removeSpy as unknown as typeof document.removeEventListener;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  Object.defineProperty(document, 'webkitFullscreenElement', { configurable: true, value: null });
  (document as unknown as FsDocument).exitFullscreen = undefined;
  (document as unknown as FsDocument).webkitExitFullscreen = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setFsElement(el: Element | null): void {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: el });
}

function setup(options: {
  root: HTMLElement | null;
  restoreHeight?: number | null;
}): {
  ctrl: FullscreenController;
  relayout: ReturnType<typeof vi.fn>;
  resizeAfterExit: ReturnType<typeof vi.fn>;
  scope: EffectScope;
} {
  const rootEl = ref<HTMLElement | null>(options.root);
  const relayout = vi.fn();
  const resizeAfterExit = vi.fn();
  const scope = effectScope();
  const ctrl = scope.run(() =>
    useFullscreen({
      rootEl,
      restoreHeight: () => options.restoreHeight ?? null,
      relayout,
      resizeAfterExit,
    })
  )!;
  return { ctrl, relayout, resizeAfterExit, scope };
}

describe('useFullscreen', () => {
  it('registers both legacy event names on setup and removes them on unmount (R4)', () => {
    const { scope } = setup({ root: fakeRoot() });
    expect(addSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('webkitfullscreenchange', expect.any(Function));
    scope.stop();
    expect(removeSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('webkitfullscreenchange', expect.any(Function));
  });

  it('entering fullscreen relayouts to screen width × (availHeight - 62) and flips the close flag', () => {
    const root = fakeRoot();
    const { ctrl, relayout } = setup({ root, restoreHeight: 300 });
    setFsElement(root);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(ctrl.isFullscreen.value).toBe(true);
    /* assert the legacy formula itself (jsdom's screen is 0×0, so the
       innerWidth/innerHeight fallbacks apply here) */
    const fsW = window.screen.width || window.innerWidth;
    const fsH = (window.screen.availHeight || window.innerHeight) - 62;
    expect(relayout).toHaveBeenCalledWith({ width: fsW, height: fsH });
  });

  it('leaving fullscreen restores null sizes, the stored height, and resizes 100 ms later', () => {
    vi.useFakeTimers();
    const root = fakeRoot();
    const { ctrl, relayout, resizeAfterExit } = setup({ root, restoreHeight: 300 });
    setFsElement(root);
    document.dispatchEvent(new Event('fullscreenchange'));
    relayout.mockClear();
    setFsElement(null);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(ctrl.isFullscreen.value).toBe(false);
    expect(relayout).toHaveBeenCalledWith({ width: null, height: 300 });
    expect(resizeAfterExit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(resizeAfterExit).toHaveBeenCalledTimes(1);
  });

  it('treats another widget entering fullscreen as an exit for this one (legacy root check)', () => {
    const root = fakeRoot();
    const other = fakeRoot();
    const { ctrl, relayout } = setup({ root, restoreHeight: 280 });
    setFsElement(other);
    document.dispatchEvent(new Event('webkitfullscreenchange'));
    expect(ctrl.isFullscreen.value).toBe(false);
    expect(relayout).toHaveBeenCalledWith({ width: null, height: 280 });
  });

  it('supports the webkit fullscreen element fallback', () => {
    const root = fakeRoot();
    const { ctrl } = setup({ root });
    Object.defineProperty(document, 'webkitFullscreenElement', { configurable: true, value: root });
    document.dispatchEvent(new Event('webkitfullscreenchange'));
    expect(ctrl.isFullscreen.value).toBe(true);
  });

  it('modebar toggle requests fullscreen on the root when not active', () => {
    const root = fakeRoot();
    const { ctrl } = setup({ root });
    ctrl.toggleFullscreen();
    expect(root.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('modebar toggle exits when already active', () => {
    const root = fakeRoot();
    const { ctrl } = setup({ root });
    const exit = vi.fn();
    (document as unknown as FsDocument).exitFullscreen = exit;
    setFsElement(root);
    ctrl.toggleFullscreen();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(root.requestFullscreen).not.toHaveBeenCalled();
  });

  it('falls back to webkit request/exit variants like legacy', () => {
    const root = fakeRoot();
    delete (root as { requestFullscreen?: () => void }).requestFullscreen;
    (root as HTMLElement & { webkitRequestFullscreen: () => void }).webkitRequestFullscreen = vi.fn();
    const { ctrl } = setup({ root });
    ctrl.toggleFullscreen();
    expect((root as HTMLElement & { webkitRequestFullscreen: () => void }).webkitRequestFullscreen).toHaveBeenCalledTimes(1);

    setFsElement(root);
    const exit = vi.fn();
    (document as unknown as FsDocument).webkitExitFullscreen = exit;
    ctrl.toggleFullscreen();
    ctrl.exitFullscreen();
    expect(exit).toHaveBeenCalledTimes(2);
  });

  it('close-button exit uses document.exitFullscreen', () => {
    const root = fakeRoot();
    const { ctrl } = setup({ root });
    const exit = vi.fn();
    (document as unknown as FsDocument).exitFullscreen = exit;
    ctrl.exitFullscreen();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('no-ops the toggle without a root element', () => {
    const { ctrl, relayout } = setup({ root: null });
    ctrl.toggleFullscreen();
    expect(relayout).not.toHaveBeenCalled();
  });

  it('clears the pending exit-resize timer on unmount (R4-style cleanup)', () => {
    vi.useFakeTimers();
    const root = fakeRoot();
    const { scope, resizeAfterExit } = setup({ root });
    setFsElement(root);
    document.dispatchEvent(new Event('fullscreenchange'));
    setFsElement(null);
    document.dispatchEvent(new Event('fullscreenchange'));
    scope.stop();
    vi.advanceTimersByTime(100);
    expect(resizeAfterExit).not.toHaveBeenCalled();
  });
});
