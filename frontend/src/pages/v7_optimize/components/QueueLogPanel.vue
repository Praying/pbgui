<script setup lang="ts">
/**
 * Optimize queue log dialog — Vue port of the legacy floating #log-panel
 * (frontend/v7_optimize.html on main). The legacy panel wedged a drag/resize
 * shell around three regions: a header, the #opt-log-dashboard status cards
 * polled from /queue/{filename}/status every 2.5s, and the LogViewerPanel
 * terminal. This dialog keeps that composition under the workbench's modal
 * language: the header stays, the dashboard lives in OptimizeLogDashboard and
 * the local-file log stream in QueueLogTerminal (no more window.LogViewerPanel
 * global — that dependency is why the dialog used to render empty).
 */
import { PhTerminalWindow, PhX } from '@phosphor-icons/vue';
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { apiFetch } from '@/shared/api';
import { Button } from '@/shared/components/ui/button';
import OptimizeLogDashboard from './OptimizeLogDashboard.vue';
import QueueLogTerminal from './QueueLogTerminal.vue';
import type { OptimizeAdapter } from '../config';
import type { OptimizeLogStatus } from '../lib/optimizeLogStatus';

const props = defineProps<{ open: boolean; filename: string; title: string; adapter: OptimizeAdapter }>();
const emit = defineEmits<{ close: []; openResults: []; openExplorer: [] }>();
const { t } = useI18n();

/** Legacy poll cadence: startOptimizeLogStatusPolling used 2500ms. */
const STATUS_POLL_MS = 2500;

const status = ref<OptimizeLogStatus | null>(null);
const statusError = ref('');
let pollTimer: number | undefined;
let pollInFlight = false;
/** Filename the in-flight request belongs to (legacy state.logFilename guard). */
let pollFilename = '';

async function refreshStatus(): Promise<void> {
  if (pollInFlight || !pollFilename || document.visibilityState !== 'visible') return;
  pollInFlight = true;
  try {
    const payload = await apiFetch<OptimizeLogStatus>(
      `${props.adapter.apiBase}/queue/${encodeURIComponent(pollFilename)}/status`,
    );
    if (!props.open || props.filename !== pollFilename) return;
    status.value = payload;
    statusError.value = '';
  } catch (error) {
    if (!props.open || props.filename !== pollFilename) return;
    // Legacy refreshOptimizeLogStatus fallback: dashboard resets, activity
    // becomes "Status unavailable" and the error row carries the message.
    status.value = null;
    statusError.value = error instanceof Error ? error.message : String(error);
  } finally {
    pollInFlight = false;
  }
}

function stopPolling(): void {
  if (pollTimer !== undefined) window.clearInterval(pollTimer);
  pollTimer = undefined;
}

function startPolling(): void {
  stopPolling();
  pollFilename = props.filename;
  status.value = null;
  statusError.value = '';
  void refreshStatus();
  pollTimer = window.setInterval(() => { void refreshStatus(); }, STATUS_POLL_MS);
}

watch(
  () => [props.open, props.filename] as const,
  ([open]) => {
    if (open && props.filename) startPolling();
    else stopPolling();
  },
  { immediate: true },
);

onBeforeUnmount(stopPolling);

const heading = () => t('v7optimize.optimizeLogWithName', { name: props.title || props.filename });
</script>

<template>
  <div v-if="open" class="optimize-log-overlay">
    <section
      class="optimize-log-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="optimize-log-title"
    >
      <header class="optimize-log-dialog__header">
        <div class="optimize-log-dialog__heading">
          <span class="optimize-log-dialog__icon" aria-hidden="true">
            <PbIcon :icon="PhTerminalWindow" :size="19" weight="duotone" />
          </span>
          <div class="optimize-log-dialog__title-group">
            <h2 id="optimize-log-title">{{ heading() }}</h2>
            <code :title="filename">{{ adapter.queueLogPrefix }}{{ filename }}.log</code>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="optimize-log-dialog__close"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <PbIcon :icon="PhX" :size="18" />
        </Button>
      </header>
      <div class="optimize-log-dialog__content">
        <OptimizeLogDashboard
          :status="status"
          :status-error="statusError"
          :actions-enabled="!!(title || filename)"
          @open-results="emit('openResults')"
          @open-explorer="emit('openExplorer')"
        />
        <div class="optimize-log-dialog__viewer">
          <QueueLogTerminal
            v-if="filename"
            :key="filename"
            :file="adapter.queueLogPrefix + filename + '.log'"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style>
.optimize-log-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(15 15 15 / 0.78);
}

.optimize-log-dialog {
  display: flex;
  width: min(1180px, 100%);
  height: min(780px, calc(100dvh - 48px));
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface-panel);
  box-shadow: var(--shadow-modal), 0 0 0 1px rgb(var(--accent-rgb) / 0.06);
}

.optimize-log-dialog__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 10px 14px 10px 16px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-panel);
}

.optimize-log-dialog__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.optimize-log-dialog__icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(var(--accent-rgb) / 0.28);
  border-radius: var(--radius-md);
  background: rgb(var(--accent-rgb) / 0.1);
  color: var(--accent-soft);
}

.optimize-log-dialog__title-group {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.optimize-log-dialog__title-group h2 {
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.optimize-log-dialog__title-group code {
  max-width: min(640px, 60vw);
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.optimize-log-dialog__close {
  flex: 0 0 auto;
  border-color: var(--border-default);
}

/* Dashboard strip (own borders/padding) then the terminal fills the rest. */
.optimize-log-dialog__content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-deep);
}

.optimize-log-dialog__viewer {
  display: flex;
  min-height: 0;
  flex: 1;
  padding: 12px;
  background: var(--surface-deep);
}

@media (max-width: 720px) {
  .optimize-log-overlay {
    padding: 10px;
  }

  .optimize-log-dialog {
    height: calc(100dvh - 20px);
  }

  .optimize-log-dialog__header {
    min-height: 56px;
    padding-inline: 12px;
  }

  .optimize-log-dialog__viewer {
    padding: 8px;
  }
}
</style>
