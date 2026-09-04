/*
 * The page toast (v7_run.html:1388-1407): shows the message for 8 s with a
 * 300 ms fade, and mirrors every message into the notification log via
 * POST /api/notify_log (same-origin cookie session, failures swallowed).
 */

export type ToastKind = 'ok' | 'err' | 'info';

export const TOAST_VISIBLE_MS = 8000;
export const TOAST_FADE_MS = 300;

/** Kind → Tailwind colour utilities (v7_edit/lib/toast.ts parity). The static
 *  positioning utilities on the toast element stay untouched — classes are
 *  added, never replaced. */
const TOAST_CLASSES: Record<ToastKind, string[]> = {
  ok: ['bg-success', 'text-accent-contrast'],
  err: ['bg-danger', 'text-[#f2f5fb]'],
  info: ['bg-accent', 'text-[#f2f5fb]'],
};

const TOAST_COLOUR_CLASSES = [...new Set(Object.values(TOAST_CLASSES).flat())];

export interface ToastHandle {
  show(msg: string, kind?: ToastKind): void;
  /** Clear the timer and hide the element (Vue lifecycle cleanup). */
  dispose(): void;
}

/** Notify-log mirror (:1391-1396) — best effort, never surfaces errors. */
export function notifyLog(msg: string, level: ToastKind, fetchFn: typeof fetch = fetch): void {
  void fetchFn('/api/notify_log', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg, level }),
  }).catch(() => {
    /* legacy swallowed notify failures */
  });
}

export function createToast(
  el: () => HTMLElement | null,
  notify: typeof notifyLog = notifyLog,
  fetchFn: typeof fetch = fetch
): ToastHandle {
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers(): void {
    if (hideTimer !== null) clearTimeout(hideTimer);
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    hideTimer = null;
    fadeTimer = null;
  }

  return {
    show(msg: string, kind: ToastKind = 'info'): void {
      notify(msg, kind, fetchFn);
      const node = el();
      if (!node) return;
      clearTimers();
      node.textContent = msg;
      node.classList.remove(...TOAST_COLOUR_CLASSES);
      node.classList.add(...TOAST_CLASSES[kind]);
      node.style.display = 'block';
      node.style.opacity = '1';
      hideTimer = setTimeout(() => {
        node.style.opacity = '0';
        fadeTimer = setTimeout(() => {
          node.style.display = 'none';
        }, TOAST_FADE_MS);
      }, TOAST_VISIBLE_MS);
    },
    dispose(): void {
      clearTimers();
      const node = el();
      if (node) node.style.display = 'none';
    },
  };
}
