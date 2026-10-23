import { onBeforeUnmount, ref } from 'vue';

/**
 * Bottom-pinned scrolling for a streaming list.
 *
 * The failure this prevents: a list that appends lines every few hundred
 * milliseconds also calls `el.scrollTop = el.scrollHeight` on every append.
 * A user who scrolls up to read something is yanked back to the bottom on
 * the next line, so reading history during a live stream is impossible.
 *
 * The rule is two conditions, both required to re-pin:
 *
 *   1. The view was at the bottom already (within PIN_THRESHOLD px).
 *      Scrolling up is a statement of intent; honour it until the user
 *      comes back.
 *   2. The user has not scrolled recently (SCROLL_QUIET_MS). A wheel event
 *      fires a frame or two before the scroll position settles, so a pure
 *      position check would see the pre-scroll "at bottom" state and pin
 *      once more — the exact jitter the user feels as a fight.
 *
 * Momentum scrolling on a trackpad keeps emitting scroll events, so the
 * quiet window restarts on each one and the guard holds through the
 * whole gesture.
 *
 * Every consumer needs the same two watched inputs (the row count and the
 * scroll element), so this composable owns the listeners too: call
 * `onScroll` from the element's @scroll and `pin()` after the DOM updates.
 */
const PIN_THRESHOLD = 40;
const SCROLL_QUIET_MS = 150;

export interface StreamingScrollOptions {
  /** Extra room to absorb sub-pixel rounding on fractional zoom levels. */
  threshold?: number;
  /** How long after the last user scroll before auto-pinning resumes. */
  quietMs?: number;
}

export function useStreamingScroll(options: StreamingScrollOptions = {}) {
  const threshold = options.threshold ?? PIN_THRESHOLD;
  const quietMs = options.quietMs ?? SCROLL_QUIET_MS;

  /** True when the view is (or was last known to be) at the bottom. */
  const atBottom = ref(true);
  /** True when the user has deliberately scrolled away from the bottom. */
  const isScrolledUp = ref(false);

  let lastUserScrollAt = 0;
  let listening = false;
  let trackedEl: HTMLElement | null = null;
  let detachUserListeners: (() => void) | null = null;

  function readAtBottom(el: HTMLElement): boolean {
    return el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
  }

  function noteUserScroll(): void {
    lastUserScrollAt = Date.now();
  }

  /**
   * Attach the intent listeners. They live on the scroll element so a wheel
   * over the list counts, and on it only — a page-level wheel listener would
   * mistake scrolling the document for scrolling the list.
   */
  function attach(el: HTMLElement | null): void {
    if (trackedEl === el && listening) return;
    detach();
    trackedEl = el;
    if (!el) return;
    const handler = noteUserScroll;
    el.addEventListener('wheel', handler, { passive: true });
    el.addEventListener('touchmove', handler, { passive: true });
    el.addEventListener('keydown', handler);
    listening = true;
    detachUserListeners = () => {
      el.removeEventListener('wheel', handler);
      el.removeEventListener('touchmove', handler);
      el.removeEventListener('keydown', handler);
    };
  }

  function detach(): void {
    detachUserListeners?.();
    detachUserListeners = null;
    listening = false;
    trackedEl = null;
  }

  /** Call from the scroll element's @scroll handler. */
  function onScroll(event: Event): void {
    const el = event.currentTarget as HTMLElement | null;
    if (!el) return;
    atBottom.value = readAtBottom(el);
    isScrolledUp.value = !atBottom.value;
  }

  /**
   * Call after the list grows (in nextTick, so heights are final). Returns
   * true when it actually moved the view.
   */
  function pin(el: HTMLElement | null): boolean {
    if (!el) return false;
    // A recent user scroll wins over the content arriving underneath it.
    if (Date.now() - lastUserScrollAt < quietMs) return false;
    if (!readAtBottom(el)) {
      atBottom.value = false;
      isScrolledUp.value = true;
      return false;
    }
    el.scrollTop = el.scrollHeight;
    atBottom.value = true;
    isScrolledUp.value = false;
    return true;
  }

  /** The explicit "jump to latest" affordance — always honoured. */
  function scrollToBottom(el: HTMLElement | null, smooth = true): void {
    lastUserScrollAt = 0;
    atBottom.value = true;
    isScrolledUp.value = false;
    if (!el) return;
    if (smooth && !prefersReducedMotion()) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }

  onBeforeUnmount(detach);

  return {
    atBottom,
    isScrolledUp,
    attach,
    detach,
    onScroll,
    pin,
    scrollToBottom,
  };
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export type StreamingScroll = ReturnType<typeof useStreamingScroll>;
