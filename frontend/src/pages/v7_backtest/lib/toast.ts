import { ref } from 'vue';
import { TOAST_VISIBLE_MS } from '@/shared/lib/toast';
import type { ToastKind } from '../types.toast';

/**
 * The backtest toast (v7_backtest.html:1233-1251): a reactive queue of
 * messages auto-removed after 4 s, deduped per type+text for 10 s, each
 * mirrored fire-and-forget into POST /api/notify_log.
 */

export interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}

export const TOAST_DEDUPE_MS = 10_000;
export { TOAST_VISIBLE_MS };

export interface ToastQueueOptions {
  seen?: ToastItem[];
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
  fetchFn?: typeof fetch;
  now?: () => number;
}

export interface ToastQueue {
  items: { value: ToastItem[] };
  show(msg: string, kind?: ToastKind): void;
  dismiss(id: number): void;
  dispose(): void;
}

export function createToastQueue(options: ToastQueueOptions = {}): ToastQueue {
  const setTimeoutFn =
    options.timers?.setTimeout ??
    ((fn: () => void, ms?: number) => globalThis.setTimeout(fn, ms));
  const clearTimeoutFn =
    options.timers?.clearTimeout ??
    ((id: any) => globalThis.clearTimeout(id));
  const fetchFn =
    options.fetchFn ??
    ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const now = options.now ?? (() => Date.now());
  const items = ref<ToastItem[]>(Array.isArray(options.seen) ? options.seen : []);
  const recent = new Map<string, number>();
  const removals = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;

  function notifyLog(msg: string, level: ToastKind): void {
    void fetchFn('/api/notify_log', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg, level }),
    }).catch(() => {
      /* legacy swallowed notify failures (:1245) */
    });
  }

  function dismiss(id: number): void {
    const timer = removals.get(id);
    if (timer !== undefined) {
      clearTimeoutFn(timer);
      removals.delete(id);
    }
    items.value = items.value.filter((item) => item.id !== id);
  }

  return {
    items,
    dismiss,
    show(msg: string, kind: ToastKind = 'info'): void {
      const key = kind + ':' + String(msg || '');
      const stamp = now();
      if (recent.has(key) && stamp - (recent.get(key) ?? 0) < TOAST_DEDUPE_MS) return;
      recent.set(key, stamp);
      notifyLog(msg, kind);
      const id = nextId++;
      items.value = [...items.value, { id, msg, kind }];
      removals.set(
        id,
        setTimeoutFn(() => {
          dismiss(id);
        }, TOAST_VISIBLE_MS)
      );
    },
    dispose(): void {
      for (const timer of removals.values()) clearTimeoutFn(timer);
      removals.clear();
      items.value = [];
    },
  };
}
