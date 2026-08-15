<script setup lang="ts">
/*
 * services_monitor migration — component → legacy function mapping
 * (source: frontend/services_monitor.html, kept as the fallback until Task 14)
 *
 * ┌─────────────────────┬─ Task ─┬─ Legacy functions ────────────────────────────────┐
 * │ OverviewCards       │ 9 ✓    │ renderOverviewCards, fetchStatus/updateStatusUI,   │
 * │                     │        │ serviceSkipped/StatusClass/StatusText/StatusTitle, │
 * │                     │        │ renderServiceButtons                               │
 * │ ServiceStatusBar    │ 9+     │ updateStatusUI sidebar dots + svcAction landed ✓;  │
 * │                     │        │ per-panel ctrl-strip landed in Task 10 ✓           │
 * │ WorkersPanel        │ 10 ✓   │ fetchWorkers, renderWorkers, renderWorkerDetail,   │
 * │                     │        │ renderWorkerActionButtons, updateWorkersSummary,   │
 * │                     │        │ selectWorker, updateWorkerLog, workerConfirmAction/│
 * │                     │        │ workerRestart/workerAction                         │
 * │ ServiceLogPanel     │ 10     │ initLogViewer (per-service log tabs + ctrl-strip), │
 * │                     │        │ switchTab — covers pbcluster, pbrun, monitor-agent,│
 * │                     │        │ vps-monitor and the Log tabs of pbdata/pbcoindata/ │
 * │                     │        │ api-server                                         │
 * │ CmcPoolPanel        │ 11 ✓   │ loadCmcPool, renderCmcPool, cmcFetch, selectedCmcKey,│
 * │                     │        │ updateCmcButtons, openCmcKeyModal/submitCmcKey,    │
 * │                     │        │ openCmcAuthorityModal/submitCmcAuthorityTransfer,  │
 * │                     │        │ toggleSelectedCmcKey, deleteSelectedCmcKey,        │
 * │                     │        │ cmcNumber/cmcDuration/cmcTimestamp                 │
 * │ PbDataSettings      │ 12     │ loadSettings, applySettings, renderPBDataSettings, │
 * │                     │        │ savePBDataSettings                                 │
 * │ PbDataStatus        │ 12     │ loadFetchSummary/renderFetchSummary,               │
 * │                     │        │ loadPollerMetrics/renderPollerMetrics,             │
 * │                     │        │ applyFetchFilters                                 │
 * │ ApiServerSettings   │ 13     │ applySettings, renderVpsHosts,                      │
 * │                     │        │ renderMonitorSettingsFields, renderAlertRouting-   │
 * │                     │        │ Settings/applyAlertRoutingSettings/collectAlert-   │
 * │                     │        │ RoutingFromForm, collectMonitorConfigFromForm,     │
 * │                     │        │ saveApiServerSettings, restartApiServer            │
 * │ CoinDataSettings    │ 13     │ saveCoinDataSettings (interval form)               │
 * │ MigrationPanel      │ 14     │ loadMigrationStatus, renderMigrationStatus,        │
 * │                     │        │ migrationStatusMeta, renderMigrationUnits/Crontab/ │
 * │                     │        │ StartScript/Processes, updateMigrationSummary,     │
 * │                     │        │ testSystemdMigration, runSystemdMigration,         │
 * │                     │        │ migrationConfirm                                  │
 * │ App (this skeleton) │ 8      │ selectPanel, restoreFromHash, sidebar markup       │
 * │                     │        │ (legacy sidebar resize handle lands with panels)   │
 * │ Topnav / overlays   │ —      │ pbgui_nav.js, pbgui_dialogs.js,                    │
 * │                     │        │ shared_help_overlay.js, prices overlay — stay as   │
 * │                     │        │ shared legacy scripts loaded by index.html         │
 * └─────────────────────┴────────┴────────────────────────────────────────────────────┘
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError, apiFetch } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import { serverMsg } from '@/shared/i18n';
import { usePolling } from '@/shared/composables/usePolling';
import OverviewCards from './components/OverviewCards.vue';
import ServiceLogPanel, { type ServiceTab } from './components/ServiceLogPanel.vue';
import WorkersPanel from './components/WorkersPanel.vue';
import CmcPoolPanel from './components/CmcPoolPanel.vue';
import CmcStatusBar from './components/CmcStatusBar.vue';
import { SERVICES } from './services';
import { apiBase } from './config';
import { cmcFetch } from './cmc';
import { showResultPopup } from './resultPopup';
import { migrationStatusMeta, serviceActionDoneText, serviceStatusClass, type Translate } from './status';
import type {
  CmcLeasesResponse,
  CmcPool,
  MigrationStatus,
  ServiceAction,
  ServiceStatus,
  ServiceStatusMap,
  WorkersStatus,
} from './types';

interface PanelDef {
  id: string;
  /** Fallback label; panels with i18nKey resolve through vue-i18n instead. */
  name: string;
  i18nKey?: string;
  component: string;
  task: string;
}

/** Sidebar/panel registry in legacy page order; ids match legacy data-panel values. */
const PANELS: PanelDef[] = [
  { id: 'overview', name: 'Overview', i18nKey: 'sysmon.overview', component: 'OverviewCards', task: 'Task 9' },
  { id: 'workers', name: 'Workers', i18nKey: 'sysmon.workers', component: 'WorkersPanel', task: 'Task 10' },
  { id: 'migration', name: 'Migration', i18nKey: 'sysmon.migration', component: 'MigrationPanel', task: 'Task 14' },
  { id: 'pbcluster', name: 'PBCluster', component: 'ServiceLogPanel', task: 'Task 10' },
  { id: 'pbrun', name: 'PBRun', component: 'ServiceLogPanel', task: 'Task 10' },
  { id: 'pbdata', name: 'PBData', component: 'PbDataPanel', task: 'Task 12' },
  { id: 'pbcoindata', name: 'PBCoinData', component: 'CmcPoolPanel', task: 'Task 11' },
  { id: 'monitor-agent', name: 'PBMonitorAgent', component: 'ServiceLogPanel', task: 'Task 10' },
  { id: 'vps-monitor', name: 'VPSMonitor', component: 'ServiceLogPanel', task: 'Task 10' },
  { id: 'api-server', name: 'PBAPIServer', component: 'ApiServerSettings', task: 'Task 13' },
];

/** Legacy tab markup for the multi-tab services; ids match data-tab values. */
const SERVICE_TABS: Record<string, ServiceTab[]> = {
  pbdata: [
    { id: 'log', i18nKey: 'sysmon.logTab', icon: '📋', task: 'Task 10' },
    { id: 'settings', i18nKey: 'sysmon.settings', icon: '⚙', task: 'Task 12' },
    { id: 'status', i18nKey: 'sysmon.status', icon: '📊', task: 'Task 12' },
  ],
  pbcoindata: [
    { id: 'log', i18nKey: 'sysmon.logTab', icon: '📋', task: 'Task 10' },
    { id: 'pool', i18nKey: 'sysmon.pool', task: 'Task 11' },
    { id: 'settings', i18nKey: 'sysmon.settings', icon: '⚙', task: 'Task 13' },
  ],
  'api-server': [
    { id: 'log', i18nKey: 'sysmon.logTab', icon: '📋', task: 'Task 10' },
    { id: 'settings', i18nKey: 'sysmon.settings', icon: '⚙', task: 'Task 13' },
  ],
};

const DEFAULT_PANEL = 'overview';

const { t } = useI18n();
const tt: Translate = (key, named) => (named ? t(key, named) : t(key));

/* ── Status polling + service actions (legacy fetchStatus/svcAction) ── */

/** Legacy scheduleStatus timeout. */
const STATUS_POLL_INTERVAL_MS = 5000;

const statuses = ref<ServiceStatusMap>({});
/** True after the first successful /status fetch — legacy ships unclassed dots until then. */
const hasLoadedStatus = ref(false);
/** svcId → in-flight action (legacy _serviceActionPending). */
const pendingActions = ref<Record<string, ServiceAction>>({});
/** Legacy _workers; fetchWorkers below updates it for the cards and the panel. */
const workers = ref<WorkersStatus>({ counts: { total: 0, running: 0 }, groups: [] });
/** True when the latest workers fetch failed (legacy force error display). */
const workersLoadError = ref(false);
/** Sidebar/overview counts, derived like the legacy updateWorkersSummary reads. */
const workersCounts = computed(() => workers.value.counts ?? { total: 0, running: 0 });
/** Legacy initial _migrationStatus: null until Task 14 wires the fetch. */
const migrationStatus = ref<MigrationStatus | null>(null);

/** Legacy fetchStatus: GET /status, keep the last payload on failure. */
async function fetchStatus(): Promise<void> {
  try {
    statuses.value = await apiFetch<ServiceStatusMap>(`${apiBase()}/status`);
    hasLoadedStatus.value = true;
  } catch {
    /* legacy rescheduled without touching the last known status */
  }
}

const statusPolling = usePolling(fetchStatus, STATUS_POLL_INTERVAL_MS);

/* ── Worker status polling (legacy fetchWorkers/scheduleWorkers) ── */

/** Legacy scheduleWorkers timeout. */
const WORKERS_POLL_INTERVAL_MS = 5000;

/** Legacy fetchWorkers: GET /workers/status, keep the last payload on failure. */
async function fetchWorkers(): Promise<void> {
  try {
    workers.value = await apiFetch<WorkersStatus>(`${apiBase()}/workers/status`);
    workersLoadError.value = false;
  } catch {
    workersLoadError.value = true;
  }
}

/** Legacy poll arm: the timer only runs while the workers panel is visible. */
const workersPolling = usePolling(fetchWorkers, WORKERS_POLL_INTERVAL_MS);

/* ── CMC pool (legacy loadCmcPool + _cmcLoad* state) ── */

/** Legacy _cmcPool (also the usage source: day / soft_credit_limit). */
const cmcPool = ref<CmcPool>({ keys: [] });
/** Legacy _cmcLeases. */
const cmcLeases = ref<CmcLeasesResponse>({ authority: {}, leases: [] });
/** True after the first successful load - keeps the legacy tbody placeholders before that. */
const cmcLoaded = ref(false);
/** Latest load phase for the status bar (legacy bar class + text swaps). */
const cmcStatus = ref<'loading' | 'ok' | 'error'>('loading');
/** serverMsg()-translated error for the unavailable status bar. */
const cmcLoadError = ref('');
/** Legacy #cmc-pool-message content written by loadCmcPool. */
const cmcNotice = ref<{ text: string; error: boolean } | null>(null);
let cmcLoadGeneration = 0;
let cmcLoadController: AbortController | null = null;

/** Legacy loadCmcPool: parallel pool + leases fetch, stale generations dropped. */
async function loadCmcPool(): Promise<void> {
  const generation = ++cmcLoadGeneration;
  cmcLoadController?.abort();
  cmcLoadController = new AbortController();
  const signal = cmcLoadController.signal;
  cmcStatus.value = 'loading';
  cmcNotice.value = { text: t('sysmon.loading'), error: false };
  try {
    const [pool, leases] = await Promise.all([
      cmcFetch<CmcPool>('/cmc-pool', { signal, cache: 'no-store' }),
      cmcFetch<CmcLeasesResponse>('/cmc-pool/leases', { signal, cache: 'no-store' }),
    ]);
    if (generation !== cmcLoadGeneration) return;
    cmcPool.value = pool || { keys: [] };
    cmcLeases.value = leases || { authority: {}, leases: [] };
    cmcLoaded.value = true;
    cmcStatus.value = 'ok';
    cmcNotice.value = {
      text: t('sysmon.leaseRecords', { count: cmcLeases.value.authority?.lease_count || 0 }),
      error: false,
    };
  } catch (error) {
    if (generation !== cmcLoadGeneration || (error as Error)?.name === 'AbortError') return;
    cmcStatus.value = 'error';
    cmcLoadError.value = serverMsg((error as Error).message);
    cmcNotice.value = { text: (error as Error).message, error: true };
  }
}

/** Legacy restoreFromHash: `#panelId` (tab suffix arrives with the panels). */
function panelFromHash(): string {
  const hash = window.location.hash.replace(/^#/, '');
  const panelId = hash.split('/')[0] ?? '';
  return PANELS.some((panel) => panel.id === panelId) ? panelId : DEFAULT_PANEL;
}

const activePanel = ref(panelFromHash());

/** Legacy selectPanel: swap the visible panel and persist it in the URL hash. */
function selectPanel(panelId: string): void {
  activePanel.value = panelId;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${panelId}`);
}

/** Legacy scheduleWorkers gating: poll only while the workers panel is active. */
watch(activePanel, (panelId) => {
  if (panelId === 'workers') workersPolling.start();
  else workersPolling.stop();
  if (panelId === 'pbcoindata') void loadCmcPool(); // legacy selectPanel
});

/** Legacy switchTab: switching to the pbcoindata pool tab reloads the pool. */
function onServiceTab(svcId: string, tabId: string): void {
  if (svcId === 'pbcoindata' && tabId === 'pool') void loadCmcPool();
}

function panelLabel(panel: PanelDef): string {
  return panel.i18nKey ? t(panel.i18nKey) : panel.name;
}

/** SERVICES registry lookup for the log panels (undefined for non-service panels). */
function serviceDef(panelId: string) {
  return SERVICES.find((svc) => svc.id === panelId);
}

/** Legacy updateStatusUI/updateWorkersSummary/updateMigrationSummary sidebar dot classes. */
function sidebarDotClass(panelId: string): string {
  if (!hasLoadedStatus.value) return '';
  if (panelId === 'workers') {
    return Number(workersCounts.value.running || 0) > 0 ? 'running' : 'stopped';
  }
  if (panelId === 'migration') {
    return migrationStatusMeta(tt, migrationStatus.value).cls; // '' until Task 14 loads data
  }
  return serviceStatusClass(statuses.value[panelId] ?? {});
}

/** Legacy error message fallback: serverMsg(err.message) or the generic failure label. */
function actionErrorText(error: unknown): string {
  if (error instanceof ApiError) return serverMsg(error.detail);
  if (error instanceof Error && error.message) return serverMsg(error.message);
  return t('sysmon.serviceActionFailed');
}

/** Legacy restartApiServer: restart the API server and wait behind the shared overlay. */
async function restartApiServer(): Promise<void> {
  try {
    await apiFetch(`${apiBase()}/api-server/restart`, { method: 'POST' });
    const overlay = (window as Window & { showRestartOverlay?: (origin: string, token: string) => void })
      .showRestartOverlay;
    if (typeof overlay === 'function') overlay(getBoot().origin, getBoot().token);
  } catch (error) {
    showResultPopup({
      title: t('sysmon.restartBlocked'),
      message: t('sysmon.restartRejected'),
      output: error instanceof ApiError ? serverMsg(error.detail) : t('sysmon.restartFailed'),
      isOk: false,
    });
  }
}

/** Legacy svcAction: POST /{svcId}/{action} with pending-state UX and result popups. */
async function serviceAction(svcId: string, action: ServiceAction): Promise<void> {
  if (pendingActions.value[svcId]) return; // legacy no-op while an action is pending
  pendingActions.value = { ...pendingActions.value, [svcId]: action };
  try {
    if (svcId === 'api-server' && action === 'restart') {
      await restartApiServer();
      return;
    }
    const data = await apiFetch<ServiceStatus & { error?: string }>(`${apiBase()}/${svcId}/${action}`, {
      method: 'POST',
    });
    if (data.running !== undefined) {
      statuses.value = { ...statuses.value, [svcId]: data };
    }
    if (data.error) throw new Error(data.error);
    if (action === 'restart') {
      showResultPopup({
        title: t('sysmon.serviceRestartRequested'),
        message: serviceActionDoneText(tt, action, svcId),
        output: t('sysmon.statusRefreshHint'),
        isOk: true, // legacy _resultPopup(..., true, false): footer with OK button stays visible
      });
    }
    void fetchStatus();
  } catch (error) {
    showResultPopup({
      title: t('sysmon.serviceActionFailed'),
      message: t('sysmon.couldNotAction', { action, svc: svcId }),
      output: actionErrorText(error),
      isOk: false,
    });
    void fetchStatus();
  } finally {
    const remaining = { ...pendingActions.value };
    delete remaining[svcId];
    pendingActions.value = remaining;
  }
}

onMounted(() => {
  document.title = t('sysmon.servicesTitle');
  statusPolling.start();
  void fetchWorkers(); // legacy fired fetchWorkers(false) once on load
  if (activePanel.value === 'workers') workersPolling.start(); // legacy selectPanel('workers')
  if (activePanel.value === 'pbcoindata') void loadCmcPool(); // legacy restoreFromHash -> selectPanel
});

onUnmounted(() => {
  statusPolling.stop();
  workersPolling.stop();
});
</script>

<template>
  <nav id="topnav"></nav>
  <div id="page-body">
    <!-- Sidebar — status dots driven by the polled /status payload (legacy updateStatusUI) -->
    <div id="sidebar">
      <div id="sidebar-inner">
        <button
          v-for="panel in PANELS"
          :key="panel.id"
          class="sb-btn"
          :class="{ active: panel.id === activePanel }"
          type="button"
          :data-panel="panel.id"
          @click="selectPanel(panel.id)"
        >
          <span v-if="panel.id !== 'overview'" class="sb-dot" :class="sidebarDotClass(panel.id)"></span><span>{{ panelLabel(panel) }}</span>
        </button>
      </div>
    </div>

    <!-- Main content — one container per legacy panel; Tasks 10–14 replace the
         remaining placeholders with the real panel components. -->
    <div id="main-content">
      <div
        v-for="panel in PANELS"
        :id="`panel-${panel.id}`"
        :key="panel.id"
        class="svc-panel"
        :class="{ active: panel.id === activePanel }"
      >
        <OverviewCards
          v-if="panel.id === 'overview'"
          :statuses="statuses"
          :pending="pendingActions"
          :workers-counts="workersCounts"
          :migration-status="migrationStatus"
          @action="serviceAction"
          @select="selectPanel"
        />
        <WorkersPanel
          v-else-if="panel.id === 'workers'"
          :workers="workers"
          :load-error="workersLoadError && activePanel === 'workers'"
          @refresh="fetchWorkers"
        />
        <ServiceLogPanel
          v-else-if="serviceDef(panel.id)"
          :svc-id="panel.id"
          :label="serviceDef(panel.id)!.label"
          :log-file="serviceDef(panel.id)!.logFile"
          :statuses="statuses"
          :pending="pendingActions"
          :active="panel.id === activePanel"
          :tabs="SERVICE_TABS[panel.id]"
          @action="serviceAction"
          @tab="onServiceTab"
        >
          <!-- Legacy #cmc-status-bar sits between the ctrl strip and the tab bar. -->
          <template v-if="panel.id === 'pbcoindata'" #above-tabs>
            <CmcStatusBar :status="cmcStatus" :load-error="cmcLoadError" :pool="cmcPool" @refresh="loadCmcPool" />
          </template>
          <template v-if="panel.id === 'pbcoindata'" #tab-pool>
            <CmcPoolPanel
              :pool="cmcPool"
              :leases="cmcLeases"
              :loaded="cmcLoaded"
              :load-notice="cmcNotice"
              @refresh="loadCmcPool"
            />
          </template>
        </ServiceLogPanel>
        <div v-else class="panel-placeholder">
          <div class="panel-placeholder-name">{{ panelLabel(panel) }}</div>
          <div class="panel-placeholder-hint">
            #panel-{{ panel.id }} · {{ panel.component }} ({{ panel.task }})
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<!-- Layout scaffolding ported from frontend/services_monitor.html (page-level,
     intentionally NOT scoped: pbgui_nav.js and panel components target these
     ids/classes). Base styles and tokens come from @/styles/tokens.css +
     base.css; panel-specific styles arrive with each panel component. -->
<style>
#page-body {
  display: flex;
  height: calc(100vh - 52px); /* topnav height, injected by pbgui_nav.js */
  overflow: hidden;
  background: #0e1117;
}

/* ── Sidebar ── */
#sidebar {
  width: 200px;
  min-width: 150px;
  max-width: 300px;
  flex-shrink: 0;
  background: #0e1117;
  border-right: 1px solid #1e2736;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
#sidebar-inner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.5rem;
  overflow-y: auto;
  flex: 1;
}
.sb-btn {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  color: #94a3b8;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--fs-sm);
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.1s;
}
.sb-btn:hover {
  background: #1a2030;
  color: #e2e8f0;
}
.sb-btn.active {
  background: rgba(99, 179, 237, 0.12);
  border-color: rgba(99, 179, 237, 0.3);
  color: #e2e8f0;
  font-weight: 600;
}
.sb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a5568;
  flex-shrink: 0;
}
.sb-dot.running {
  background: #21c354;
}
.sb-dot.stopped {
  background: #ff4b4b;
}
.sb-dot.warn {
  background: #f59e0b;
}

/* ── Main content / service panels ── */
#main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.svc-panel {
  display: none;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.svc-panel.active {
  display: flex;
}

/* Overview panel container (legacy #panel-overview); the grid's own padding
   mirrors the legacy inline style, so the page keeps both like the old file. */
#panel-overview {
  padding: 1.5rem;
  overflow-y: auto;
}

/* ── Result popup (raised imperatively by resultPopup.ts on <body>) ── */
.result-modal {
  position: fixed;
  z-index: 9000;
  background: #0d1621;
  border: 1px solid #1e2736;
  border-radius: 10px;
  width: 720px;
  min-width: 320px;
  min-height: 160px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  resize: both;
  overflow: hidden;
}
.result-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #1e2736;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}
.result-modal-header:active { cursor: grabbing; }
.result-modal-header h3 { margin: 0; font-size: var(--fs-md); color: #e2e8f0; }
.result-modal-close { background: none; border: none; color: #64748b; font-size: 1.4rem; cursor: pointer; padding: 0 4px; }
.result-modal-close:hover { color: #e2e8f0; }
.result-modal-status { padding: 0.6rem 1rem; font-size: var(--fs-sm); font-weight: 600; flex-shrink: 0; }
.result-modal-status.ok { background: #052e16; color: #4ade80; border-bottom: 1px solid #166534; }
.result-modal-status.fail { background: #2d1515; color: #fca5a5; border-bottom: 1px solid #7f1d1d; }
.result-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  font-family: monospace;
  font-size: var(--fs-xs);
  color: #cbd5e1;
  white-space: pre-wrap;
  word-break: break-all;
}
.result-modal-footer { padding: 0.5rem 1rem; border-top: 1px solid #1e2736; text-align: right; flex-shrink: 0; }
.result-modal-footer button {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.35rem 1.2rem;
  cursor: pointer;
  font-size: var(--fs-sm);
}
.result-modal-footer button:hover { background: #1d4ed8; }

/* Skeleton-only placeholder styling; removed as panels land. */
.panel-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-sm);
  color: #64748b;
}
.panel-placeholder-name {
  font-size: var(--fs-lg);
  font-weight: 700;
}
.panel-placeholder-hint {
  font-size: var(--fs-sm);
  color: #4a5568;
}
</style>
