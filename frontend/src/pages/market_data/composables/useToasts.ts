import { onScopeDispose, ref, type Ref } from 'vue';
import { getBoot } from '@/shared/boot';
import { NOTIFY_LOG_URL } from '../config';
import type { ToastItem, ToastLevel } from '../types';

/*
 * Page-level toast mechanism — legacy showToast (:4983-5002) +
 * logNotification (:4969-4981):
 *
 *   - trim the text; empty → no-op (no relay, no toast)
 *   - relay {msg, level} to POST /api/notify_log with the boot bearer token,
 *     failures swallowed
 *   - append a toast; after 3200 ms mark it leaving; 220 ms later remove it
 *
 * Deviation (documented): legacy leaked its timers on unload; the composable
 * clears them on scope dispose (same cleanup call the dashboard/status
 * migrations apply).
 */

/** Legacy visibility window before the leaving phase (:4994). */
export const TOAST_VISIBLE_MS = 3200;
/** Legacy leaving-phase length before removal (:4996-5001, CSS 0.22 s). */
export const TOAST_LEAVE_MS = 220;

/** Injection key for panels to reach showToast (M-data-2..7). */
export const SHOW_TOAST_KEY: symbol = Symbol('market-data-show-toast');

export type NotifyRelay = (message: string, level: ToastLevel) => void;

export interface UseToastsOptions {
  /** Override the notify_log relay (tests / future transports). */
  notify?: NotifyRelay;
}

export interface UseToasts {
  toasts: Ref<ToastItem[]>;
  showToast(message: unknown, level?: ToastLevel): void;
  /** Clear all pending timers (legacy had no equivalent; leak fix). */
  dispose(): void;
}

/** Legacy logNotification relay (:4969-4981) — fire-and-forget POST. */
function defaultNotify(message: string, level: ToastLevel): void {
  void fetch(NOTIFY_LOG_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getBoot().token}`,
    },
    body: JSON.stringify({ msg: message, level }),
  }).catch(() => {
    /* legacy swallowed relay failures (:4980) */
  });
}

export function useToasts(options: UseToastsOptions = {}): UseToasts {
  const notify = options.notify ?? defaultNotify;
  const toasts = ref<ToastItem[]>([]);
  let toastSeq = 0;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  function removeToast(id: number): void {
    const hideTimer = timers.get(id);
    if (hideTimer !== undefined) clearTimeout(hideTimer);
    timers.delete(id);
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function scheduleRemoval(id: number): void {
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        toasts.value = toasts.value.map((toast) =>
          toast.id === id ? { ...toast, leaving: true } : toast
        ); // :4995 — is-leaving phase
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            toasts.value = toasts.value.filter((toast) => toast.id !== id); // :4997-5000
          }, TOAST_LEAVE_MS)
        );
      }, TOAST_VISIBLE_MS)
    );
  }

  function showToast(message: unknown, level: ToastLevel = 'info'): void {
    const text = String(message ?? '').trim();
    if (!text) return; // :4984-4985
    notify(text, level);
    toastSeq += 1;
    toasts.value = [...toasts.value, { id: toastSeq, message: text, level, leaving: false }];
    scheduleRemoval(toastSeq);
  }

  function dispose(): void {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }

  onScopeDispose(dispose);

  return { toasts, showToast, dispose };
}
