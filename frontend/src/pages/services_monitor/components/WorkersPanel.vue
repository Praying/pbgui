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
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
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

const { t } = useI18n();

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
  icon: '▶' | '■' | '↻';
}

type WorkerAction = 'start' | 'stop' | 'restart';

/** Legacy renderWorkerActionButtons - same can_stop/can_start gating. */
function actionButtons(item: Worker): WorkerButton[] {
  if (!item || item.available === false) return [];
  const buttons: WorkerButton[] = [];
  if (item.running) {
    if (item.can_stop !== false) {
      buttons.push({ action: 'stop', label: t('sysmon.stop'), icon: '■' });
      if (item.can_start !== false) buttons.push({ action: 'restart', label: t('sysmon.restart'), icon: '↻' });
    }
  } else if (item.can_start !== false) {
    buttons.push({ action: 'start', label: t('sysmon.start'), icon: '▶' });
  }
  return buttons;
}

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
    <span style="flex: 1"></span>
    <button class="ctrl-btn refresh" type="button" @click="emit('refresh')">↻ {{ t('common.refresh') }}</button>
  </div>

  <div class="workers-shell">
    <div class="workers-groups">
      <template v-if="loadError">
        <div class="worker-detail-empty">{{ t('sysmon.failedToLoadWorkerStatus') }}</div>
      </template>
      <template v-else-if="!groups.length">
        <div class="worker-detail-empty">{{ t('sysmon.noWorkersAvailable') }}</div>
      </template>
      <template v-else>
        <section v-for="group in groups" :key="group.id ?? group.label" class="worker-group">
          <div>
            <div class="worker-group-title">{{ group.label || group.id || t('sysmon.workers') }}</div>
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
              <div class="worker-type">{{ item.type || 'worker' }}</div>
              <div class="card-name">{{ item.label || item.id }}</div>
              <div class="card-status-row">
                <span class="card-dot" :class="item.running ? 'running' : 'stopped'"></span>{{ item.running ? t('sysmon.running') : t('sysmon.stopped') }}
              </div>
              <div class="worker-summary">{{ item.summary || '' }}</div>
              <div v-if="cardStats(item).length" class="worker-stats-inline">
                <span v-for="stat in cardStats(item)" :key="stat.label" class="worker-pill">{{ stat.label }}: {{ stat.value }}</span>
              </div>
              <div class="worker-btnrow">
                <button
                  v-for="b in actionButtons(item)"
                  :key="b.action"
                  class="card-btn"
                  :class="b.action"
                  type="button"
                  @click.stop="onWorkerButton(item.id, b.action)"
                >{{ b.icon }} {{ b.label }}</button>
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
              <div class="worker-detail-title">{{ selectedWorker.label || selectedWorker.id }}</div>
              <div class="worker-detail-subtitle">{{ selectedWorker.type || 'worker' }} • {{ selectedWorker.summary || '' }}</div>
            </div>
            <span class="worker-state-badge" :class="selectedWorker.running ? 'running' : 'stopped'">
              {{ selectedWorker.running ? t('sysmon.running') : t('sysmon.stopped') }}
            </span>
          </div>
          <div class="worker-detail-desc">{{ selectedWorker.description || '' }}</div>
          <div v-if="selectedWorker.note" class="worker-detail-note">{{ selectedWorker.note }}</div>
          <div class="worker-detail-actions">
            <button
              v-for="b in actionButtons(selectedWorker)"
              :key="b.action"
              class="ctrl-btn"
              :class="b.action"
              type="button"
              @click.stop="onWorkerButton(selectedWorker.id, b.action)"
            >{{ b.icon }} {{ b.label }}</button>
          </div>
          <div v-if="(selectedWorker.stats ?? []).length" class="worker-stats-grid">
            <div v-for="stat in selectedWorker.stats" :key="stat.label" class="worker-stat-card">
              <div class="worker-stat-label">{{ stat.label }}</div>
              <div class="worker-stat-value">{{ stat.value }}</div>
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
            :title="(selectedWorker.label || selectedWorker.id) + ' monitor'"
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
  border-bottom: 1px solid #1e2736;
  flex-shrink: 0;
  background: #111827;
}
.ctrl-title {
  font-size: var(--fs-md);
  font-weight: 700;
  color: #e2e8f0;
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
  background: #4a5568;
  flex-shrink: 0;
}
.status-dot.running { background: #21c354; }
.status-dot.stopped { background: #ff4b4b; }
.status-label {
  font-size: var(--fs-xs);
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ctrl-btn {
  padding: 0.25rem 0.75rem;
  border-radius: 5px;
  border: 1px solid #2d3748;
  background: #1a202c;
  color: #94a3b8;
  cursor: pointer;
  font-size: var(--fs-sm);
  font-family: inherit;
  transition: all 0.12s;
}
.ctrl-btn:hover { border-color: #4a5568; color: #e2e8f0; }
.ctrl-btn.start { border-color: #166534; color: #4ade80; background: #052e16; }
.ctrl-btn.stop { border-color: #7f1d1d; color: #fca5a5; background: #2d1515; }
.ctrl-btn.restart { border-color: #b45309; color: #fcd34d; background: #1c1a08; }

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
  border-right: 1px solid #1e2736;
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
  color: #94a3b8;
}
.worker-group-subtitle { font-size: var(--fs-xs); color: #64748b; }
.worker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--sp-md); }
.worker-card {
  background: #131b2b;
  border: 1px solid #1e2736;
  border-radius: 10px;
  padding: var(--sp-md);
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.worker-card:hover { border-color: #2d3748; }
.worker-card.selected { border-color: rgba(99, 179, 237, 0.55); background: #162032; }
.worker-card.running { border-color: rgba(33, 195, 84, 0.4); }
.worker-card.stopped { border-color: rgba(255, 75, 75, 0.3); }
.worker-type {
  font-size: var(--fs-xs);
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.card-name { font-size: var(--fs-sm); font-weight: 700; color: #e2e8f0; }
.card-status-row { display: flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: #64748b; }
.card-dot { width: 7px; height: 7px; border-radius: 50%; background: #4a5568; flex-shrink: 0; }
.card-dot.running { background: #21c354; }
.card-dot.stopped { background: #ff4b4b; }
.worker-summary { font-size: var(--fs-sm); color: #cbd5e1; }
.worker-stats-inline { display: flex; flex-wrap: wrap; gap: var(--sp-xs); }
.worker-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-xs);
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid #2d3748;
  font-size: var(--fs-xs);
  color: #94a3b8;
  background: #111827;
}
.worker-btnrow { display: flex; flex-wrap: wrap; gap: var(--sp-xs); margin-top: var(--sp-xs); }
.card-btn {
  align-self: flex-start;
  padding: 0.2rem 0.65rem;
  border-radius: 4px;
  border: 1px solid #2d3748;
  background: #1a202c;
  color: #94a3b8;
  cursor: pointer;
  font-size: var(--fs-xs);
  font-family: inherit;
  transition: all 0.12s;
}
.card-btn:hover { border-color: #4a5568; color: #e2e8f0; }
.card-btn.start { border-color: #166534; color: #4ade80; background: #052e16; }
.card-btn.stop { border-color: #7f1d1d; color: #fca5a5; background: #2d1515; }
.card-btn.restart { border-color: #b45309; color: #fcd34d; background: #1c1a08; }
.worker-detail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #0f1722;
}
.worker-detail-body {
  padding: var(--sp-lg);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-md);
  border-bottom: 1px solid #1e2736;
}
.worker-detail-empty {
  color: #64748b;
  font-size: var(--fs-base);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  text-align: center;
}
.worker-detail-top { display: flex; justify-content: space-between; gap: var(--sp-md); align-items: flex-start; }
.worker-detail-title { font-size: var(--fs-lg); font-weight: 700; color: #e2e8f0; }
.worker-detail-subtitle { font-size: var(--fs-sm); color: #94a3b8; margin-top: var(--sp-xs); }
.worker-detail-desc { font-size: var(--fs-base); color: #cbd5e1; line-height: 1.5; }
.worker-detail-note {
  font-size: var(--fs-sm);
  color: #fcd34d;
  background: #1c1a08;
  border: 1px solid rgba(180, 83, 9, 0.45);
  border-radius: 8px;
  padding: var(--sp-sm) var(--sp-md);
}
.worker-state-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-xs);
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid #2d3748;
  font-size: var(--fs-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.worker-state-badge.running { color: #4ade80; border-color: rgba(33, 195, 84, 0.45); background: #052e16; }
.worker-state-badge.stopped { color: #fca5a5; border-color: rgba(255, 75, 75, 0.35); background: #2d1515; }
.worker-detail-actions { display: flex; flex-wrap: wrap; gap: var(--sp-sm); }
.worker-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--sp-sm); }
.worker-stat-card {
  background: #131b2b;
  border: 1px solid #1e2736;
  border-radius: 8px;
  padding: var(--sp-sm) var(--sp-md);
  min-width: 0;
}
.worker-stat-label {
  font-size: var(--fs-xs);
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 3px;
}
.worker-stat-value { font-size: var(--fs-md); color: #e2e8f0; font-weight: 700; }
.worker-log-section { flex: 1; min-height: 320px; overflow: hidden; display: flex; flex-direction: column; }
.worker-log-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sp-md);
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #64748b;
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
  background: #0b1220;
}
.worker-log-wrap,
.log-wrap { flex: 1; overflow: hidden; }
@media (max-width: 900px) {
  .workers-shell { grid-template-columns: 1fr; }
}
</style>
