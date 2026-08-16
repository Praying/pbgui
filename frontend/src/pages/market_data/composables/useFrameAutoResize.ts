/*
 * M-data-7 — the generic same-origin iframe height-sync engine. Dedupe of
 * the two legacy copies (recon R7):
 *
 *   installBest1mFrameAutoResize          :7447-7505 (hyperliquid
 *                                            data-actions frame, root keyed
 *                                            on #__HLDA_ROOT__)
 *   installBest1mJobMonitorFrameAutoResize :7507-7575 (best-1m job monitor,
 *                                            body.firstElementChild root +
 *                                            a ResizeObserver + a 120 ms
 *                                            settle re-sync)
 *
 * Legacy stored the observers on the frame element (:7493, :7554-7569) —
 * leak-safe on remount only because the element went with them. The port
 * owns them in the controller: every load disconnects the previous pair
 * (exactly the legacy reload behavior) and teardown() gives the component an
 * explicit unmount hook so nothing survives a Vue remount.
 */

/** Structural slice of HTMLIFrameElement the engine touches (test-friendly). */
export interface FrameHost {
  readonly contentDocument: Document | null;
  readonly contentWindow: { readonly document?: Document } | null;
  style: { height: string };
}

/** Options mirror of the two legacy variants. */
export interface UseFrameAutoResizeOptions {
  /** Resolves the frame (element ref getter — may be absent mid-remount). */
  frame: () => FrameHost | null | undefined;
  /** Content-root id (legacy #__HLDA_ROOT__ :7453); default: body.firstElementChild (:7513). */
  rootId?: string;
  /** Monitor variant adds a ResizeObserver on the content root (:7564-7570). */
  useResizeObserver?: boolean;
  /** Monitor variant re-syncs once after the settle delay (:7552). */
  settleMs?: number;
  /** Injectables for tests (defaults: window.requestAnimationFrame, setTimeout). */
  requestAnimationFrame?: (callback: () => void) => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  MutationObserverCtor?: typeof MutationObserver;
  ResizeObserverCtor?: new (callback: () => void) => {
    observe(target: Element): void;
    disconnect(): void;
  };
}

export interface FrameAutoResizeController {
  /** The iframe load handler (:7490-7504, :7550-7574). */
  handleLoad(): void;
  /** Disconnect the observers and cancel the settle timer (component unmount). */
  teardown(): void;
  /** Whether observers are currently attached. */
  isObserving(): boolean;
}

/** Element slice with the layout metrics legacy read (:7455-7458). */
type MeasuredElement = Element & { offsetHeight?: number };

/** Legacy height derivation (:7452-7468 / :7512-7528 — identical modulo the root). */
function getContentHeight(doc: Document, rootId?: string): number {
  const contentRoot = (rootId
    ? doc.getElementById(rootId) || doc.body?.firstElementChild || doc.body
    : doc.body?.firstElementChild || doc.body) as MeasuredElement | null;
  if (contentRoot) {
    const rect = contentRoot.getBoundingClientRect?.();
    const rootHeight = Math.max(
      Math.ceil((rect as DOMRect | undefined)?.height || 0),
      contentRoot.scrollHeight || 0,
      contentRoot.offsetHeight || 0
    );
    if (rootHeight > 0) return rootHeight; // :7460
  }
  return Math.max(
    doc.body?.scrollHeight || 0,
    doc.documentElement?.scrollHeight || 0,
    doc.body?.offsetHeight || 0,
    doc.documentElement?.offsetHeight || 0
  );
}

export function useFrameAutoResize(options: UseFrameAutoResizeOptions): FrameAutoResizeController {
  const raf: (callback: () => void) => number =
    options.requestAnimationFrame ??
    ((callback) => window.requestAnimationFrame(callback));
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  const MutationObserverCtor = options.MutationObserverCtor ?? window.MutationObserver;
  // Legacy installed the ResizeObserver unconditionally for the monitor
  // variant (:7564-7570); the typeof guard only covers environments without
  // the API (jsdom) — production browsers always have it.
  const ResizeObserverCtor =
    options.ResizeObserverCtor ??
    (typeof ResizeObserver === 'function' ? ResizeObserver : undefined);

  let resizeFramePending = false; // :7450
  let mutationObserver: {
    observe(target: Node, options?: MutationObserverInit): void;
    disconnect(): void;
  } | null = null;
  let resizeObserver: { observe(target: Element): void; disconnect(): void } | null = null;
  let settleTimer: ReturnType<typeof setTimeoutFn> | null = null;

  function applyHeight(): void {
    const frame = options.frame();
    if (!frame) return;
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document || null; // :7472
      if (!doc || !doc.body || !doc.documentElement) return; // :7473
      const nextHeight = getContentHeight(doc, options.rootId);
      if (nextHeight > 0) frame.style.height = `${nextHeight}px`; // :7475
    } catch {
      /* cross-origin or mid-teardown — legacy swallowed (:7476-7478) */
    }
  }

  /** rAF-coalesced sync (:7481-7488). */
  function queueHeightSync(): void {
    if (resizeFramePending) return;
    resizeFramePending = true;
    raf(() => {
      resizeFramePending = false;
      applyHeight();
    });
  }

  function disconnectObservers(): void {
    mutationObserver?.disconnect(); // :7493 / :7554
    mutationObserver = null;
    resizeObserver?.disconnect(); // :7555
    resizeObserver = null;
  }

  function handleLoad(): void {
    const frame = options.frame();
    if (!frame) return;
    queueHeightSync(); // :7491
    if (options.settleMs !== undefined) {
      if (settleTimer !== null) clearTimeoutFn(settleTimer);
      settleTimer = setTimeoutFn(() => {
        settleTimer = null;
        queueHeightSync(); // :7552
      }, options.settleMs);
    }
    try {
      disconnectObservers();
      const doc = frame.contentDocument || frame.contentWindow?.document || null;
      if (!doc || !doc.body) return; // :7495
      const contentRoot = (options.rootId
        ? doc.getElementById(options.rootId) || doc.body.firstElementChild || doc.body
        : doc.body.firstElementChild || doc.body) as Element | null;
      mutationObserver = new MutationObserverCtor(() => queueHeightSync()); // :7496-7498
      mutationObserver.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      }); // :7499
      if (options.useResizeObserver && ResizeObserverCtor && contentRoot) {
        resizeObserver = new ResizeObserverCtor(() => queueHeightSync()); // :7565-7567
        resizeObserver.observe(contentRoot); // :7568
      }
    } catch {
      /* legacy swallowed observer failures (:7501-7503) */
    }
  }

  function teardown(): void {
    disconnectObservers();
    if (settleTimer !== null) {
      clearTimeoutFn(settleTimer);
      settleTimer = null;
    }
  }

  return {
    handleLoad,
    teardown,
    isObserving: () => mutationObserver !== null,
  };
}
