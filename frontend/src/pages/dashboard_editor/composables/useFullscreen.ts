/**
 * useFullscreen — the dedup of the six duplicated legacy fullscreen handlers
 * (render.js:647-678, 1639-1665, 1905-1936, 3920-3946 — the same
 * fullscreenchange listener, modebar click and close-button logic in every
 * Plotly renderer):
 *
 *  - fullscreenchange + webkitfullscreenchange toggle the close button and
 *    relayout to `screen.width × (availHeight - 62)` on enter, `{width:null,
 *    height:origHeight}` on exit with a Plots.resize 100 ms later;
 *  - the modebar button requests/exits fullscreen on the widget's .dt-root
 *    (the legacy `gd.closest('.dt-root')` derivation);
 *  - the close button exits fullscreen.
 *
 * R4 fix: legacy added these listeners on EVERY render and never removed
 * them (6 registrations per rebuild); the composable registers once and
 * removes both listeners + the pending resize timer on unmount.
 */
import { onScopeDispose, ref, toRaw, type Ref } from 'vue';

const FS_OVERHEAD_PX = 62; // legacy: header (~40px) + daterange (~22px)
const EXIT_RESIZE_MS = 100;

type WebkitDocument = Document & { webkitFullscreenElement?: Element | null };
type WebkitExitDocument = Document & { webkitExitFullscreen?: () => void };
type WebkitRoot = HTMLElement & { webkitRequestFullscreen?: () => void };

export interface FullscreenOptions {
  /** The widget's .dt-root (the fullscreen target). */
  rootEl: Ref<HTMLElement | null>;
  /** Legacy origHeight — the restore height when leaving fullscreen. */
  restoreHeight: () => number | null;
  /** Legacy `P.relayout(chartDiv, …)` with the size updates. */
  relayout: (updates: { width: number | null; height: number | null }) => void;
  /** Legacy `P.Plots.resize(chartDiv)` 100 ms after exit. */
  resizeAfterExit: () => void;
}

export interface FullscreenController {
  /** Legacy closeBtn.style.display toggle — bind with v-show. */
  isFullscreen: Ref<boolean>;
  /** Legacy modebar button click handler. */
  toggleFullscreen(): void;
  /** Legacy close-button click handler. */
  exitFullscreen(): void;
}

export function useFullscreen(options: FullscreenOptions): FullscreenController {
  const isFullscreen = ref(false);
  let exitResizeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Legacy isFull: fsEl === own root; any fsEl when there is no root.
   *  toRaw: template refs hold raw elements, but a test-supplied ref() holds
   *  a reactive proxy — the raw comparison must work against both. */
  function isActive(): boolean {
    const fsEl =
      document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement;
    const root = options.rootEl.value ? toRaw(options.rootEl.value) : null;
    return root ? fsEl === root : !!fsEl;
  }

  /** Legacy fschangeHandler (render.js:647-659). */
  function handleChange(): void {
    const isFull = isActive();
    isFullscreen.value = isFull;
    if (isFull) {
      const fsW = window.screen.width || window.innerWidth;
      const fsH = (window.screen.availHeight || window.innerHeight) - FS_OVERHEAD_PX;
      options.relayout({ width: fsW, height: fsH });
    } else {
      options.relayout({ width: null, height: options.restoreHeight() || null });
      exitResizeTimer = setTimeout(options.resizeAfterExit, EXIT_RESIZE_MS);
    }
  }

  function exitDocument(): void {
    if (document.exitFullscreen) void document.exitFullscreen();
    else if ((document as WebkitExitDocument).webkitExitFullscreen) {
      (document as WebkitExitDocument).webkitExitFullscreen!();
    }
  }

  /** Legacy modebar button click (render.js:661-678). */
  function toggleFullscreen(): void {
    if (isActive()) {
      exitDocument();
      return;
    }
    const root = options.rootEl.value;
    if (!root) return;
    if (root.requestFullscreen) void root.requestFullscreen();
    else if ((root as WebkitRoot).webkitRequestFullscreen) {
      (root as WebkitRoot).webkitRequestFullscreen!();
    }
  }

  /** Legacy close-button click (render.js:805-812). */
  function exitFullscreen(): void {
    exitDocument();
  }

  document.addEventListener('fullscreenchange', handleChange);
  document.addEventListener('webkitfullscreenchange', handleChange);

  /* onScopeDispose (the useDashboardWs pattern): runs on component unmount
     and on effectScope.stop() in tests. */
  onScopeDispose(() => {
    document.removeEventListener('fullscreenchange', handleChange);
    document.removeEventListener('webkitfullscreenchange', handleChange);
    if (exitResizeTimer !== null) {
      clearTimeout(exitResizeTimer);
      exitResizeTimer = null;
    }
  });

  return { isFullscreen, toggleFullscreen, exitFullscreen };
}
