import { provide, inject, ref, type InjectionKey } from 'vue';
import { TOAST_VISIBLE_MS } from '@/shared/lib/toast';
import type { Translator } from '../types';

/**
 * Toasts + alert modal ported from showToast/closeAlertModal/updateAlertModal
 * (api_keys_editor.html:2270-2324): success/info render as transient toasts,
 * error/warning open the alert modal; every notification is relayed to
 * /api/notify_log (best-effort).
 */

export type ToastKind = 'success' | 'info' | 'error' | 'warning';

export interface ToastItem {
  id: number;
  kind: 'success' | 'info';
  message: string;
}

export interface AlertState {
  visible: boolean;
  kind: 'error' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
}

export interface Toasts {
  toasts: typeof toastsRef;
  alert: typeof alertRef;
  showToast(message: string, type?: ToastKind): void;
  dismissToast(id: number): void;
  updateAlert(message: string, type: 'error' | 'warning' | 'success' | 'info'): void;
  closeAlert(): void;
}

const toastsRef = ref<ToastItem[]>([]);
const alertRef = ref<AlertState>({ visible: false, kind: 'error', title: '', message: '' });

let nextToastId = 1;
let currentT: Translator = (key) => key;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

function relayToNotifyLog(message: string, kind: ToastKind): void {
  const fetchFn = (...args: Parameters<typeof fetch>) => globalThis.fetch(...args);
  void fetchFn('/api/notify_log', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg: message, level: kind === 'success' ? 'ok' : kind }),
  }).catch(() => {});
}

function dismissToast(id: number): void {
  const timer = toastTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    toastTimers.delete(id);
  }
  toastsRef.value = toastsRef.value.filter((toast) => toast.id !== id);
}

export function useToasts(t: Translator): Toasts {
  currentT = t;
  // Fresh state per instance keeps mounted units isolated in tests.
  for (const timer of toastTimers.values()) clearTimeout(timer);
  toastTimers.clear();
  toastsRef.value = [];
  alertRef.value = { visible: false, kind: 'error', title: '', message: '' };
  return {
    toasts: toastsRef,
    alert: alertRef,
    showToast,
    dismissToast,
    updateAlert,
    closeAlert,
  };
}

/** Injection key for panels mounted under the App shell. */
export const TOASTS_KEY: InjectionKey<Toasts> = Symbol('apikeys-toasts');

export function provideToasts(toasts: Toasts): void {
  provide(TOASTS_KEY, toasts);
}

/** Panels use injectToasts() — App provides; tests may provide their own. */
export function injectToasts(): Toasts {
  const injected = inject(TOASTS_KEY);
  if (injected) return injected;
  // Standalone mount without a provider: create a silent fallback so the
  // component still works (tests always provide a real instance).
  return useToasts(currentT);
}

function alertTitle(kind: ToastKind | 'success' | 'info'): string {
  if (kind === 'error') return currentT('common.error');
  if (kind === 'warning') return currentT('misc.apikeys.warning');
  if (kind === 'success') return currentT('misc.apikeys.result');
  return currentT('misc.apikeys.result');
}

function showToast(message: string, type: ToastKind = 'success'): void {
  relayToNotifyLog(message, type);
  if (type === 'error' || type === 'warning') {
    alertRef.value = { visible: true, kind: type, title: alertTitle(type), message };
    return;
  }
  const id = nextToastId++;
  toastsRef.value = [...toastsRef.value, { id, kind: type, message }];
  toastTimers.set(
    id,
    setTimeout(() => {
      dismissToast(id);
    }, TOAST_VISIBLE_MS)
  );
}

function updateAlert(message: string, type: 'error' | 'warning' | 'success' | 'info'): void {
  alertRef.value = { visible: true, kind: type, title: alertTitle(type), message };
}

function closeAlert(): void {
  alertRef.value = { ...alertRef.value, visible: false };
}

