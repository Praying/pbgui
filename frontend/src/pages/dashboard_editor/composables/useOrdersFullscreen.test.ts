import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { effectScope } from 'vue';
import { useOrdersFullscreen } from './useOrdersFullscreen';

/*
 * useOrdersFullscreen — port of buildOrders' fullscreen block
 * (dashboard_render.js:3815-3843): the fullscreenchange listeners that toggle
 * the ✕/⛶ glyph + .do-fullscreen class and re-fit the chart 150 ms later,
 * plus the R4 fix — legacy never removed these listeners (the destroy patch
 * at render.js:3846-3854 was the only cleanup); the composable disposes them.
 */

type WebkitDocument = Document & { webkitFullscreenElement?: Element | null };

function setFullscreenElement(el: Element | null): void {
  /* jsdom has no fullscreen support — define the property like the
     useFullscreen tests do (configurable so tests can swap it) */
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: el });
}

function dispatchFullscreenChange(): void {
  document.dispatchEvent(new Event('fullscreenchange'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useOrdersFullscreen (render.js:3815-3843)', () => {
  it('starts inactive', () => {
    setFullscreenElement(null);
    const root = document.createElement('div');
    const fs = useOrdersFullscreen({ rootEl: ref(root), refit: vi.fn() });
    expect(fs.isFullscreen.value).toBe(false);
  });

  it('goes active when the document fullscreen element is the widget root (render.js:3817-3824)', () => {
    const root = document.createElement('div');
    const fs = useOrdersFullscreen({ rootEl: ref(root), refit: vi.fn() });
    setFullscreenElement(root);
    dispatchFullscreenChange();
    expect(fs.isFullscreen.value).toBe(true);
    setFullscreenElement(null);
    dispatchFullscreenChange();
    expect(fs.isFullscreen.value).toBe(false);
  });

  it('stays inactive when some other element is fullscreen (strict ===, render.js:3817)', () => {
    const root = document.createElement('div');
    const fs = useOrdersFullscreen({ rootEl: ref(root), refit: vi.fn() });
    setFullscreenElement(document.body);
    dispatchFullscreenChange();
    expect(fs.isFullscreen.value).toBe(false);
  });

  it('re-fits the chart 150 ms after every change, enter and exit (render.js:3825-3830)', async () => {
    vi.useFakeTimers();
    try {
      const root = document.createElement('div');
      const refit = vi.fn();
      useOrdersFullscreen({ rootEl: ref(root), refit });
      expect(refit).not.toHaveBeenCalled();
      setFullscreenElement(root);
      dispatchFullscreenChange();
      expect(refit).not.toHaveBeenCalled(); /* still inside the 150 ms delay */
      vi.advanceTimersByTime(150);
      expect(refit).toHaveBeenCalledTimes(1);
      setFullscreenElement(null);
      dispatchFullscreenChange();
      vi.advanceTimersByTime(150);
      expect(refit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('toggleFullscreen requests fullscreen on the root (render.js:3835-3843)', () => {
    const root = document.createElement('div');
    const request = vi.fn();
    root.requestFullscreen = () => {
      request();
      return Promise.resolve();
    };
    const exit = vi.fn();
    document.exitFullscreen = () => {
      exit();
      return Promise.resolve();
    };
    const fs = useOrdersFullscreen({ rootEl: ref(root), refit: vi.fn() });
    fs.toggleFullscreen();
    expect(request).toHaveBeenCalledTimes(1);
    setFullscreenElement(root);
    dispatchFullscreenChange();
    fs.toggleFullscreen();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('removes the listeners and the pending refit on dispose (R4 fix, render.js:3846-3854)', async () => {
    vi.useFakeTimers();
    try {
      const scope = effectScope();
      const root = document.createElement('div');
      const refit = vi.fn();
      const fs = scope.run(() => useOrdersFullscreen({ rootEl: ref(root), refit }))!;
      setFullscreenElement(root);
      dispatchFullscreenChange();
      scope.stop();
      /* the pending 150 ms refit dies with the scope */
      vi.advanceTimersByTime(200);
      expect(refit).not.toHaveBeenCalled();
      /* and a later change neither flips state nor refits */
      setFullscreenElement(null);
      dispatchFullscreenChange();
      expect(fs.isFullscreen.value).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the webkit-prefixed fullscreen element (render.js:3817)', () => {
    const root = document.createElement('div');
    const fs = useOrdersFullscreen({ rootEl: ref(root), refit: vi.fn() });
    (document as WebkitDocument).webkitFullscreenElement = root;
    try {
      document.dispatchEvent(new Event('webkitfullscreenchange'));
      expect(fs.isFullscreen.value).toBe(true);
    } finally {
      delete (document as WebkitDocument).webkitFullscreenElement;
    }
  });
});
