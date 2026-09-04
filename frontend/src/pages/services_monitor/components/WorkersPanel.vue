<script setup lang="ts">
/*
 * Workers panel, ported from the legacy frontend/services_monitor.html
 * fetchWorkers/renderWorkers/renderWorkerDetail/renderWorkerActionButtons/
 * updateWorkersSummary/selectWorker/updateWorkerLog/workerConfirmAction/
 * workerRestart/workerAction. Polling stays in App (legacy scheduleWorkers
 * only armed the timer while the panel was visible); this component owns the
 * list/detail rendering, the confirm dialogs (window.PBGuiDialogs, loaded by
 * index.html exactly like the old page) and the per-worker action POSTs.
 */
import { computed, ref, watch } from 'vue';
import { PhArrowClockwise, PhPlay, PhStop } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import EmptyState from '@/shared/components/EmptyState.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import { apiFetch } from '@/shared/api';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { apiBase } from '../config';
import { showResultPopup } from '../resultPopup';
import type { Worker, WorkersStatus } from '../types';
import LogViewer from './LogViewer.vue';

interface Props {
  workers: WorkersStatus;
  /** True when the latest forced fetch failed (legacy force error display). */
  loadError?: boolean;
}

const props = withDefaults(defineProps<Props>(), { loadError: false });

const emit = defineEmits<{ refresh: [] }>();

const { t, te } = useI18n();

/* ── Worker metadata i18n ──
 * The backend returns English text (label/type/summary/description/note/stats).
 * Known ids/labels map to sysmon.worker* keys; anything unknown (e.g. a worker
 * added on the backend later) falls back to the backend text verbatim. */

const WORKER_TYPE_KEYS: Record<string, string> = {
  'process worker': 'sysmon.workerType.processWorker',
  'scheduler task': 'sysmon.workerType.schedulerTask',
  'periodic task': 'sysmon.workerType.periodicTask',
};

const WORKER_GROUP_KEYS: Record<string, string> = {
  queue: 'sysmon.workerGroup.queue',
  internal: 'sysmon.workerGroup.internal',
};

/** Dynamic summaries built on the backend ("3 pending, 1 active" …). */
const SUMMARY_PATTERNS: { re: RegExp; key: string; params: (match: RegExpMatchArray) => Record<string, string> }[] = [
  { re: /^(\d+) pending, (\d+) active$/, key: 'sysmon.workerSummary.pendingActive', params: (m) => ({ pending: m[1]!, active: m[2]! }) },
  { re: /^(\d+) queued, (\d+) active$/, key: 'sysmon.workerSummary.queuedActive', params: (m) => ({ queued: m[1]!, active: m[2]! }) },
  { re: /^Maintains (\d+) cache target\(s\)$/, key: 'sysmon.workerSummary.hlcvsTargets', params: (m) => ({ count: m[1]! }) },
];

const SUMMARY_EXACT: Record<string, string> = {
  'Auto-pulls configured backtest archives': 'sysmon.workerSummary.archiveSync',
};

const STAT_LABEL_KEYS: Record<string, string> = {
  PID: 'sysmon.workerStat.pid',
  Pending: 'sysmon.workerStat.pending',
  Active: 'sysmon.workerStat.active',
  Done: 'sysmon.workerStat.done',
  Failed: 'sysmon.workerStat.failed',
  Queued: 'sysmon.workerStat.queued',
  Running: 'sysmon.workerStat.running',
  Backtesting: 'sysmon.workerStat.backtesting',
  Complete: 'sysmon.workerStat.complete',
  Error: 'sysmon.workerStat.error',
  Autostart: 'sysmon.workerStat.autostart',
  'Autostart CPU': 'sysmon.workerStat.autostartCpu',
  'CPU limit': 'sysmon.workerStat.cpuLimit',
  'CPU override': 'sysmon.workerStat.cpuOverride',
  Health: 'sysmon.workerStat.health',
  Targets: 'sysmon.workerStat.targets',
  'Auto pull': 'sysmon.workerStat.autoPull',
};

const STAT_VALUE_KEYS: Record<string, string> = {
  On: 'sysmon.workerStatValue.on',
  Off: 'sysmon.workerStatValue.off',
  Yes: 'sysmon.workerStatValue.yes',
  No: 'sysmon.workerStatValue.no',
  running: 'sysmon.workerStatValue.running',
  stopped: 'sysmon.workerStatValue.stopped',
  failed: 'sysmon.workerStatValue.failed',
};

/** Translate when the key exists; otherwise keep the backend text. */
function tr(key: string, fallback: string, params?: Record<string, string>): string {
  return te(key) ? t(key, params ?? {}) : fallback;
}

function workerText(item: Worker, field: 'label' | 'description' | 'note'): string {
  const fallback = field === 'label' ? item.label || item.id : item[field] || '';
  return tr(`sysmon.worker.${item.id}.${field}`, fallback);
}

function workerTypeText(item: Worker): string {
  const fallback = item.type || 'worker';
  const key = WORKER_TYPE_KEYS[fallback];
  return key ? tr(key, fallback) : fallback;
}

function groupLabel(group: { id?: string; label?: string }): string {
  const fallback = group.label || group.id || t('sysmon.workers');
  const key = group.id ? WORKER_GROUP_KEYS[group.id] : undefined;
  return key ? tr(key, fallback) : fallback;
}

function workerSummaryText(item: Worker): string {
  const raw = item.summary || '';
  if (!raw) return '';
  const exact = SUMMARY_EXACT[raw];
  if (exact) return tr(exact, raw);
  for (const pattern of SUMMARY_PATTERNS) {
    const match = raw.match(pattern.re);
    if (match) return tr(pattern.key, raw, pattern.params(match));
  }
  return raw;
}

function statLabelText(label: string): string {
  const key = STAT_LABEL_KEYS[label];
  return key ? tr(key, label) : label;
}

function statValueText(value: string): string {
  const key = STAT_VALUE_KEYS[value];
  return key ? tr(key, value) : value;
}

const groups = computed(() => props.workers.groups ?? []);
const counts = computed(() => props.workers.counts ?? { total: 0, running: 0 });

/** Legacy rebuildWorkerIndex. */
const workerIndex = computed<Record<string, Worker>>(() => {
  const index: Record<string, Worker> = {};
  for (const group of groups.value) {
    for (const item of group.items ?? []) index[item.id] = item;
  }
  return index;
});

const selectedWorkerId = ref('');
/** Exposed for the page's AI drawer context (workers panel selection). */
defineExpose({ selectedWorkerId });

/** Legacy renderWorkers selection repair: keep selection or fall back to first. */
watch(
  workerIndex,
  (index) => {
    if (selectedWorkerId.value && index[selectedWorkerId.value]) return;
    const first = groups.value.find((group) => group.items?.length)?.items?.[0]?.id ?? '';
    selectedWorkerId.value = first;
  },
  { immediate: true }
);

const selectedWorker = computed<Worker | null>(() => workerIndex.value[selectedWorkerId.value] ?? null);

/** Legacy updateWorkersSummary class. */
const summaryClass = computed(() => (Number(counts.value.running || 0) > 0 ? 'running' : 'stopped'));
const summaryText = computed(() =>
  t('sysmon.workersRunning', { running: counts.value.running || 0, total: counts.value.total || 0 })
);

interface WorkerButton {
  action: WorkerAction;
  label: string;
}

type WorkerAction = 'start' | 'stop' | 'restart';

/** Legacy renderWorkerActionButtons - same can_stop/can_start gating. */
function actionButtons(item: Worker): WorkerButton[] {
  if (!item || item.available === false) return [];
  const buttons: WorkerButton[] = [];
  if (item.running) {
    if (item.can_stop !== false) {
      buttons.push({ action: 'stop', label: t('sysmon.stop') });
      if (item.can_start !== false) buttons.push({ action: 'restart', label: t('sysmon.restart') });
    }
  } else if (item.can_start !== false) {
    buttons.push({ action: 'start', label: t('sysmon.start') });
  }
  return buttons;
}

const actionIcons = {
  start: PhPlay,
  stop: PhStop,
  restart: PhArrowClockwise,
} as const;

/** ui/ Button variant per action — mirrors the legacy .card-btn/.ctrl-btn tones
   (start=green, stop=red, restart=amber). */
const actionVariants = {
  start: 'success',
  stop: 'danger',
  restart: 'warning',
} as const;

function cardStats(item: Worker) {
  return (item.stats ?? []).slice(0, 3);
}

/** Legacy workerConfirm: PBGuiDialogs.confirm with the result-popup fallback. */
async function workerConfirm(title: string, message: string, confirmText: string): Promise<boolean> {
  const dialogs = (window as Window & { PBGuiDialogs?: { confirm?: (opts: { title: string; message: string; confirmText: string }) => Promise<boolean> } })
    .PBGuiDialogs;
  if (dialogs && typeof dialogs.confirm === 'function') {
    return dialogs.confirm({ title, message, confirmText });
  }
  showResultPopup({
    title: t('sysmon.confirmationBlocked'),
    message: t('sysmon.dialogUnavailable'),
    output: t('sysmon.reloadAndRetry'),
    isOk: false,
  });
  return false;
}

/** Legacy workerAction: POST, then force a refresh; errors are swallowed. */
async function workerAction(workerId: string, action: WorkerAction): Promise<void> {
  try {
    await apiFetch(`${apiBase()}/workers/${encodeURIComponent(workerId)}/${action}`, { method: 'POST' });
  } catch {
    /* legacy .catch(function () {}) */
  }
  emit('refresh');
}

/** Legacy workerConfirmAction for 'stop' (start/restart post directly). */
async function confirmStop(workerId: string): Promise<void> {
  const item = workerIndex.value[workerId];
  if (!item) return;
  const ok = await workerConfirm(
    t('sysmon.stopWorker'),
    t('sysmon.stopWorkerMsg', { label: item.label || workerId }),
    t('sysmon.stop')
  );
  if (!ok) return;
  void workerAction(workerId, 'stop');
}

/** Legacy workerRestart - always behind a confirm dialog. */
async function confirmRestart(workerId: string): Promise<void> {
  const item = workerIndex.value[workerId];
  if (!item) return;
  const ok = await workerConfirm(
    t('sysmon.restartWorker'),
    t('sysmon.restartWorkerMsg', { label: item.label || workerId }),
    t('sysmon.restart')
  );
  if (!ok) return;
  void workerAction(workerId, 'restart');
}

function onWorkerButton(workerId: string, action: WorkerAction): void {
  if (action === 'stop') void confirmStop(workerId);
  else if (action === 'restart') void confirmRestart(workerId);
  else void workerAction(workerId, 'start');
}
</script>

<template>
  <div class="ctrl-strip">
    <span class="ctrl-title">{{ t('sysmon.workers') }}</span>
    <div class="ctrl-status">
      <div class="status-dot" :class="summaryClass"></div>
      <span class="status-label">{{ summaryText }}</span>
    </div>
  </div>

  <div class="workers-shell">
    <div class="workers-groups">
      <ErrorState
        v-if="loadError"
        :title="t('common.error')"
        :message="t('sysmon.failedToLoadWorkerStatus')"
        :retry-label="t('sysmon.reloadAndRetry')"
        @retry="emit('refresh')"
      />
      <EmptyState v-else-if="!groups.length" :title="t('sysmon.noWorkersAvailable')" />
      <template v-else>
        <section v-for="group in groups" :key="group.id ?? group.label" class="worker-group">
          <div>
            <div class="worker-group-title">{{ groupLabel(group) }}</div>
            <div class="worker-group-subtitle">{{ (group.items ?? []).length }} {{ t('sysmon.itemCount') }}</div>
          </div>
          <div class="worker-grid">
            <article
              v-for="item in group.items ?? []"
              :key="item.id"
              class="worker-card"
              :class="[item.running ? 'running' : 'stopped', { selected: item.id === selectedWorkerId }]"
              :data-worker="item.id"
              @click="selectedWorkerId = item.id"
            >
              <div class="worker-type">{{ workerTypeText(item) }}</div>
              <div class="card-name">{{ workerText(item, 'label') }}</div>
              <div class="card-status-row">
                <span class="card-dot" :class="item.running ? 'running' : 'stopped'"></span>{{ item.running ? t('sysmon.running') : t('sysmon.stopped') }}
              </div>
              <div class="worker-summary">{{ workerSummaryText(item) }}</div>
              <div v-if="cardStats(item).length" class="worker-stats-inline">
                <span v-for="stat in cardStats(item)" :key="stat.label" class="worker-pill">{{ statLabelText(stat.label) }}: {{ statValueText(stat.value) }}</span>
              </div>
              <div class="worker-btnrow">
                <Button
                  v-for="b in actionButtons(item)"
                  :key="b.action"
                  class="card-btn"
                  :class="b.action"
                  :variant="actionVariants[b.action]"
                  size="sm"
                  type="button"
                  @click.stop="onWorkerButton(item.id, b.action)"
                ><PbIcon :icon="actionIcons[b.action]" /> {{ b.label }}</Button>
              </div>
            </article>
          </div>
        </section>
      </template>
    </div>

    <div class="worker-detail">
      <div class="worker-detail-body">
        <div v-if="!selectedWorker" class="worker-detail-empty">{{ t('sysmon.selectWorker') }}</div>
        <template v-else>
          <div class="worker-detail-top">
            <div>
              <div class="worker-detail-title">{{ workerText(selectedWorker, 'label') }}</div>
              <div class="worker-detail-subtitle">{{ workerTypeText(selectedWorker) }} • {{ workerSummaryText(selectedWorker) }}</div>
            </div>
            <span class="worker-state-badge" :class="selectedWorker.running ? 'running' : 'stopped'">
              {{ selectedWorker.running ? t('sysmon.running') : t('sysmon.stopped') }}
            </span>
          </div>
          <div class="worker-detail-desc">{{ workerText(selectedWorker, 'description') }}</div>
          <div v-if="selectedWorker.note" class="worker-detail-note">{{ workerText(selectedWorker, 'note') }}</div>
          <div class="worker-detail-actions">
            <Button
              v-for="b in actionButtons(selectedWorker)"
              :key="b.action"
              class="ctrl-btn"
              :class="b.action"
              :variant="actionVariants[b.action]"
              size="sm"
              type="button"
              @click.stop="onWorkerButton(selectedWorker.id, b.action)"
            ><PbIcon :icon="actionIcons[b.action]" /> {{ b.label }}</Button>
          </div>
          <div v-if="(selectedWorker.stats ?? []).length" class="worker-stats-grid">
            <div v-for="stat in selectedWorker.stats" :key="stat.label" class="worker-stat-card">
              <div class="worker-stat-label">{{ statLabelText(stat.label) }}</div>
              <div class="worker-stat-value">{{ statValueText(stat.value) }}</div>
            </div>
          </div>
        </template>
      </div>

      <!-- Legacy worker-log-section: log stream, monitor iframe or hint -->
      <div class="worker-log-section">
        <div v-if="!selectedWorker || !selectedWorker.log_file" class="worker-log-empty" :class="{ 'has-monitor': !!selectedWorker?.monitor_path }">
          <template v-if="!selectedWorker">
            <div>{{ t('sysmon.workerLogHint') }}</div>
          </template>
          <iframe
            v-else-if="selectedWorker.monitor_path"
            class="worker-monitor-frame"
            :src="selectedWorker.monitor_path"
            :title="t('sysmon.workerMonitorTitle', { label: workerText(selectedWorker, 'label') })"
          ></iframe>
          <template v-else>
            <div>{{ t('sysmon.noDedicatedWorkerLog') }}</div>
          </template>
        </div>
        <div v-else class="log-wrap worker-log-wrap">
          <LogViewer :key="selectedWorker.id" :file="selectedWorker.log_file" />
        </div>
      </div>
    </div>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (workers section). -->
<style scoped>
.ctrl-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  background: var(--surface-workspace);
}
.ctrl-title {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text-primary);
}
.ctrl-status {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-disabled);
  flex-shrink: 0;
}
.status-dot.running { background: var(--success); }
.status-dot.stopped { background: var(--danger); }
.status-label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.workers-shell {
  display: grid;
  grid-template-columns: minmax(340px, 44%) minmax(360px, 56%);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.workers-groups {
  overflow-y: auto;
  padding: var(--sp-lg);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--sp-lg);
  min-height: 0;
}
.worker-group { display: flex; flex-direction: column; gap: var(--sp-md); }
.worker-group-title {
  font-size: var(--fs-sm);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.worker-group-subtitle { font-size: var(--fs-xs); color: var(--text-muted); }
.worker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--sp-md); }
.worker-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: var(--sp-md);
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
  cursor: pointer;
  box-shadow: var(--shadow-panel);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-spring);
}
.worker-card:hover {
  border-color: var(--border-default);
  box-shadow: var(--shadow-elevated);
  transform: translateY(-1px);
}
.worker-card.selected { border-color: rgb(var(--accent-rgb) / 0.55); background: var(--surface-panel); }
.worker-card.running { border-color: rgb(var(--success-rgb) / 0.4); }
.worker-card.stopped { border-color: rgb(var(--danger-rgb) / 0.3); }
.worker-type {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.card-name { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); }
.card-status-row { display: flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--text-muted); }
.card-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-disabled); flex-shrink: 0; }
.card-dot.running { background: var(--success); }
.card-dot.stopped { background: var(--danger); }
.worker-summary { font-size: var(--fs-sm); color: var(--text-secondary); }
.worker-stats-inline { display: flex; flex-wrap: wrap; gap: var(--sp-xs); }
.worker-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-xs);
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--border-default);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  background: var(--surface-workspace);
}
.worker-btnrow { display: flex; flex-wrap: wrap; gap: var(--sp-xs); margin-top: var(--sp-xs); }
.worker-detail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-page);
}
.worker-detail-body {
  padding: var(--sp-lg);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-md);
  border-bottom: 1px solid var(--border-subtle);
}
.worker-detail-empty {
  color: var(--text-muted);
  font-size: var(--fs-base);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  text-align: center;
}
.worker-detail-top { display: flex; justify-content: space-between; gap: var(--sp-md); align-items: flex-start; }
.worker-detail-title { font-size: var(--fs-lg); font-weight: 700; color: var(--text-primary); }
.worker-detail-subtitle { font-size: var(--fs-sm); color: var(--text-secondary); margin-top: var(--sp-xs); }
.worker-detail-desc { font-size: var(--fs-base); color: var(--text-secondary); line-height: 1.5; }
.worker-detail-note {
  font-size: var(--fs-sm);
  color: var(--warning-soft);
  background: color-mix(in srgb, var(--warning-deep) 28%, var(--bg-card));
  border: 1px solid rgb(var(--warning-rgb) / 0.45);
  border-radius: 8px;
  padding: var(--sp-sm) var(--sp-md);
}
.worker-state-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-xs);
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--border-default);
  font-size: var(--fs-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.worker-state-badge.running { color: var(--success); border-color: rgb(var(--success-rgb) / 0.45); background: color-mix(in srgb, var(--success-deep) 28%, var(--bg-card)); }
.worker-state-badge.stopped { color: var(--danger-soft); border-color: rgb(var(--danger-rgb) / 0.35); background: color-mix(in srgb, var(--danger-deep) 28%, var(--bg-card)); }
.worker-detail-actions { display: flex; flex-wrap: wrap; gap: var(--sp-sm); }
.worker-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--sp-sm); }
.worker-stat-card {
  background: var(--bg-page);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: var(--sp-sm) var(--sp-md);
  min-width: 0;
}
.worker-stat-label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 3px;
}
.worker-stat-value { font-size: var(--fs-md); color: var(--text-primary); font-weight: 700; }
.worker-log-section { flex: 1; min-height: 320px; overflow: hidden; display: flex; flex-direction: column; }
.worker-log-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sp-md);
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-muted);
  padding: var(--sp-lg);
}
.worker-log-empty.has-monitor {
  align-items: stretch;
  justify-content: stretch;
  padding: 0;
  color: inherit;
}
.worker-monitor-frame {
  flex: 1;
  width: 100%;
  min-height: 320px;
  border: 0;
  background: var(--bg-page);
}
.worker-log-wrap,
.log-wrap { flex: 1; overflow: hidden; }
@media (max-width: 900px) {
  .workers-shell { grid-template-columns: 1fr; }
}
</style>
