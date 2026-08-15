/**
 * useOrdersFullscreen — port of buildOrders' fullscreen block
 * (dashboard_render.js:3815-3843). Unlike the Plotly widgets' useFullscreen
 * (which relayouts to explicit pixel sizes), the orders chart relies on
 * Lightweight-Charts autoSize: entering/exiting fullscreen only toggles the
 * ✕/⛶ glyph + the .do-fullscreen class and re-fits the visible range 150 ms
 * later so the chart reflows to the new container size.
 *
 * R4 fix: legacy registered `fullscreenchange`/`webkitfullscreenchange`
 * listeners on every build and removed them only through the destroy patch
 * (render.js:3846-3854); the composable disposes both listeners and the
 * pending refit timer with the Vue scope.
 */
import { onScopeDispose, ref, toRaw, type Ref } from 'vue';

const REFIT_DELAY_MS = 150;

type WebkitDocument = Document & { webkitFullscreenElement?: Element | null };
type WebkitExitDocument = Document & { webkitExitFullscreen?: () => void };
type WebkitRoot = HTMLElement & { webkitRequestFullscreen?: () => void };

export interface OrdersFullscreenOptions {
  /** The widget's .dt-root — the fullscreen target (render.js:3840). */
  rootEl: Ref<HTMLElement | null>;
  /** The 150 ms re-fit: `ctrl.chart.timeScale().fitContent()` (render.js:3827-3829). */
  refit: () => void;
}

export interface OrdersFullscreenController {
  /** Drives the ✕/⛶ glyph and the .do-fullscreen class (render.js:3818-3823). */
  isFullscreen: Ref<boolean>;
  /** The toolbar button click (render.js:3835-3843). */
  toggleFullscreen(): void;
}

export function useOrdersFullscreen(options: OrdersFullscreenOptions): OrdersFullscreenController {
  const isFullscreen = ref(false);
  let refitTimer: ReturnType<typeof setTimeout> | null = null;

  /** Legacy _syncFs state check: the fs element must be the widget root. */
  function isActive(): boolean {
    const fsEl = document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement;
    const root = options.rootEl.value ? toRaw(options.rootEl.value) : null;
    return !!(root && (fsEl === root));
  }

  /** Legacy _syncFs (render.js:3816-3831). */
  function handleChange(): void {
    isFullscreen.value = isActive();
    if (refitTimer !== null) clearTimeout(refitTimer);
    refitTimer = setTimeout(options.refit, REFIT_DELAY_MS);
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else if ((document as WebkitExitDocument).webkitExitFullscreen) {
        (document as WebkitExitDocument).webkitExitFullscreen!();
      }
      return;
    }
    const root = options.rootEl.value;
    if (!root) return;
    if (root.requestFullscreen) void root.requestFullscreen();
    else if ((root as WebkitRoot).webkitRequestFullscreen) {
      (root as WebkitRoot).webkitRequestFullscreen!();
    }
  }

  document.addEventListener('fullscreenchange', handleChange);
  document.addEventListener('webkitfullscreenchange', handleChange);

  onScopeDispose(() => {
    document.removeEventListener('fullscreenchange', handleChange);
    document.removeEventListener('webkitfullscreenchange', handleChange);
    if (refitTimer !== null) {
      clearTimeout(refitTimer);
      refitTimer = null;
    }
  });

  return { isFullscreen, toggleFullscreen };
}
