<script setup lang="ts">
/*
 * market_data_status migration — legacy function → component mapping
 * (source: frontend/market_data_status.html, kept as the live legacy fragment)
 *
 * Behavior inventory: market_data_status is the per-exchange status monitor
 * FRAGMENT of market_data_main — market_data_main.html fetches
 * /api/market-data/status-monitor/{exchange} and injects the HTML into
 * #status-monitor-host (mountStatusMonitor, market_data_main.html:4142),
 * re-executing inline scripts on every exchange switch and calling
 * root.__mdsDestroy() before each remount (main.ts exposes that contract).
 *
 * ┌──────────────────────┬───────────────────────────────────────────────────┐
 * │ App (mds-root shell) │ data-exchange resolution + missing token/exchange │
 * │                      │ warning (legacy root.innerHTML swap), WS status  │
 * │                      │ wiring, callAPI actions, toasts, notify_log      │
 * │ ControlsBar          │ Refresh Now / Cancel Queued / Stop buttons        │
 * │ ProgressPanel        │ done/total bar, Running.../Starting... fallbacks  │
 * │ CoinTable            │ 8-column coin rows + waiting/no-coin empty states │
 * │ statusWs (composable)│ /ws/market-data frames, infinite exponential      │
 * │                      │ back-off 2 s → 30 s (useStatusWs)                │
 * ├──────────────────────┴───────────────────────────────────────────────────┤
 * Shell boundary (intentional): AppShell and StatusStrip are not rendered
 * because this component is a fragment mounted inside market_data's status
 * host. The parent owns navigation and the fragment must remain dimensionless
 * so exchange switches can unmount and remount it in place.
 *
 * │ NOT PORTED (with justification):                                          │
 * │ - escapeHtml(): Vue interpolation and bound attributes escape by          │
 * │   construction; no v-html anywhere in the page.                           │
 * │ - updateConnectionStatus(): legacy body was `void connected; void        │
 * │   message;` — a deliberate no-op, so no connection indicator exists.      │
 * │ - data-api-host/data-api-base/data-token attrs: token and origin come    │
 * │   from /api/boot.js (shared apiFetch adds the Bearer header); only the   │
 * │   per-instance exchange still rides the route-injected data-exchange.    │
 * │ - api POST via raw fetch: replaced by the shared apiFetch; legacy never  │
 * │   checked resp.ok, so non-ok bodies flowed into the !success branch —    │
 * │   apiFetch throws instead and the catch shows the same class of error    │
 * │   toast (net effect identical for real backend responses).               │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
import { computed, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhArrowClockwise, PhWarning } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import EmptyState from '@/shared/components/EmptyState.vue';
import { apiFetch } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import { serverMsg } from '@/shared/i18n';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import CoinTable from './components/CoinTable.vue';
import ControlsBar from './components/ControlsBar.vue';
import ProgressPanel from './components/ProgressPanel.vue';
import { dialogsConfirm } from './dialogs';
import {
  NOTIFY_LOG_URL,
  cancelRefreshUrl,
  readExchange,
  refreshNowUrl,
  stopRunUrl,
  wsUrl,
} from './config';
import { useStatusWs } from './statusWs';
import type { ToastItem, ToastKind } from './types';

import { TOAST_VISIBLE_MS } from '@/shared/lib/toast';

const { t } = useI18n();

/* Legacy showToast timing: visible 4 s, then slideOut 0.3 s (html:585-588). */
const TOAST_SLIDE_OUT_MS = 300;

const exchange = readExchange();
const configOk = exchange !== '';

const ws = configOk ? useStatusWs({ url: wsUrl(exchange) }) : null;
const status = computed(() => ws?.status.value ?? null);
const connected = computed(() => ws?.connected.value ?? false);
const received = computed(() => status.value !== null);
const coinRows = computed(() => status.value?.coin_rows ?? []);
const queued = computed(() => status.value?.queued === true);
const running = computed(() => status.value?.running === true);
const actionPending = ref(false);

/* ── toasts (legacy showToast + notify_log relay) ── */

const toasts = ref<ToastItem[]>([]);
let toastSeq = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

function removeToast(id: number): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
  toastTimers.delete(id);
}

function scheduleToastRemoval(id: number): void {
  const hideTimer = setTimeout(() => {
    toastTimers.delete(id);
    toasts.value = toasts.value.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast));
    toastTimers.set(
      id,
      setTimeout(() => removeToast(id), TOAST_SLIDE_OUT_MS),
    );
  }, TOAST_VISIBLE_MS);
  toastTimers.set(id, hideTimer);
}

function showToast(message: string, kind: ToastKind = 'info'): void {
  const fetchFn = (...args: Parameters<typeof fetch>) => globalThis.fetch(...args);
  void fetchFn(NOTIFY_LOG_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({ msg: String(message ?? ''), level: kind }),
  }).catch(() => {
    /* legacy swallowed relay failures */
  });
  toastSeq += 1;
  toasts.value = [...toasts.value, { id: toastSeq, message, kind, leaving: false }];
  scheduleToastRemoval(toastSeq);
}

onUnmounted(() => {
  for (const timer of toastTimers.values()) clearTimeout(timer);
  toastTimers.clear();
});

/* Kind → shared tonal toast classes (components.css `.toast-*`): elevated
   surface + status-coloured rail. The solid accent fills are retired — the
   near-white text on them failed contrast badly. */
function toastToneClass(kind: ToastKind): string {
  if (kind === 'success') return 'toast-success';
  if (kind === 'error') return 'toast-error';
  return 'toast-info';
}

/* ── actions (legacy callAPI + setupEventListeners) ── */

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function callEndpoint(url: string, successMessage: string): Promise<void> {
  if (actionPending.value) return;
  if (url === refreshNowUrl() && (queued.value || running.value)) return;
  actionPending.value = true;
  try {
    const data = await apiFetch<{ success?: boolean; error?: string }>(url, {
      method: 'POST',
      body: JSON.stringify({ exchange }),
    });
    if (data.success) {
      showToast(successMessage, 'success');
    } else {
      showToast(serverMsg(String(data.error ?? '')) || t('misc.mds.actionFailed'), 'error');
    }
  } catch (error) {
    showToast(t('misc.mds.errorPrefix', { error: errorMessage(error) }), 'error');
  } finally {
    actionPending.value = false;
  }
}

function onRefreshNow(): void {
  void callEndpoint(refreshNowUrl(), t('misc.mds.refreshTriggered'));
}

function onCancelRefresh(): void {
  void callEndpoint(cancelRefreshUrl(), t('misc.mds.refreshCancelled'));
}

async function onStopRun(): Promise<void> {
  const confirmed = await dialogsConfirm({
    title: t('misc.mds.stopRefreshTitle'),
    message: t('misc.mds.stopRefreshMessage'),
    detail: t('misc.mds.stopRefreshDetail'),
    confirmText: t('misc.mds.stop'),
  });
  if (!confirmed) return;
  await callEndpoint(stopRunUrl(), t('misc.mds.stopSignalSent'));
}
</script>

<template>
  <div class="mds-root">
    <MigrationWatermark />
    <EmptyState
      v-if="!configOk"
      :icon="PhWarning"
      :title="t('misc.mds.missingTokenOrExchange')"
    />
    <div v-else class="mds-container">
      <div class="mds-content-wrapper">
        <div v-if="configOk && !connected" class="mb-2 inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs text-warning-soft" role="status" aria-live="polite"><PbIcon :icon="PhArrowClockwise" :size="12" class="animate-spin" />{{ t('misc.mds.reconnecting') }}</div>
        <ControlsBar :queued="queued" :running="running" :received="received" :action-pending="actionPending" @refresh="onRefreshNow" @cancel="onCancelRefresh" @stop="onStopRun" />
        <ProgressPanel :status="status" />
        <CoinTable :rows="coinRows" :received="received" />
      </div>
    </div>
    <div class="mds-toast-stack">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="mds-toast toast"
        :class="toastToneClass(toast.kind)"
        :style="{
          animation: toast.leaving ? 'mds-slideOut var(--motion-slow) ease' : undefined,
        }"
        role="status"
        tabindex="0"
        @click="removeToast(toast.id)"
        @keydown.enter="removeToast(toast.id)"
        @keydown.space.prevent="removeToast(toast.id)"
      >
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<!-- Ported from .mds-root … (market_data_status.html:5-266). Scoped: the page
     renders standalone or as a fragment inside #mds-app — either way the
     .mds-* selector chain keeps everything page-local. -->
<style scoped>
.mds-root {
  font-family: var(--font-sans);
  color: var(--text-primary);
  line-height: 1.6;
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mds-root :deep(*) {
  box-sizing: border-box;
}

.mds-container {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mds-content-wrapper {
  width: 100%;
  margin-top: 0;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mds-toast-stack {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
  width: min(420px, calc(100vw - 40px));
}

.mds-toast {
  animation: mds-slideIn var(--motion-slow) var(--ease-standard);
  cursor: pointer;
  user-select: none;
}

@keyframes mds-slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes mds-slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(400px);
    opacity: 0;
  }
}
</style>
