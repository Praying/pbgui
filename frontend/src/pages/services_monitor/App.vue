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
 * │ PbDataSettings      │ 12 ✓   │ loadSettings, applySettings, renderPBDataSettings, │
 * │                     │        │ savePBDataSettings                                 │
 * │ PbDataStatus        │ 12+14 ✓│ loadFetchSummary/renderFetchSummary,               │
 * │                     │        │ loadPollerMetrics/renderPollerMetrics,             │
 * │                     │        │ applyFetchFilters                                 │
 * │ ApiServerSettings   │ 13 ✓   │ applySettings, renderVpsHosts,                      │
 * │                     │        │ renderMonitorSettingsFields (MonitorThresholds),   │
 * │                     │        │ renderAlertRoutingSettings (AlertRouting)/         │
 * │                     │        │ collectAlertRoutingFromForm/collectMonitorConfig-  │
 * │                     │        │ FromForm, saveApiServerSettings, restartApiServer  │
 * │ CoinDataSettings    │ 13 ✓   │ saveCoinDataSettings (interval form)               │
 * │ MigrationPanel      │ 14 ✓   │ loadMigrationStatus, renderMigrationStatus,        │
 * │                     │        │ migrationStatusMeta, renderMigrationUnits/Crontab/ │
 * │                     │        │ StartScript/Processes, updateMigrationSummary,     │
 * │                     │        │ testSystemdMigration, runSystemdMigration,         │
 * │                     │        │ migrationConfirm                                  │
 * │ PricesOverlay       │ 14 ✓   │ openPricesOverlay/closePricesOverlay,              │
 * │                     │        │ loadPricesOverlay/filterPricesOverlay (page-global)│
 * │ App (this skeleton) │ 8+14 ✓ │ selectPanel, restoreFromHash, sidebar markup +     │
 * │                     │        │ resize handle, PBGUI_HELP_OPENER/                  │
 * │                     │        │ _servicesGuideKeyword help wiring                  │
 * │ Shared overlays     │ —      │ pbgui_dialogs.js and shared_help_overlay.js stay   │
 * │                     │        │ as legacy helper scripts loaded by index.html      │
 * └─────────────────────┴────────┴────────────────────────────────────────────────────┘
 */
import { computed, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { PhArrowClockwise } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { ApiError, apiFetch } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import { serverMsg } from '@/shared/i18n';
import { usePolling } from '@/shared/composables/usePolling';
import OverviewCards from './components/OverviewCards.vue';
import ServiceLogPanel, { type ServiceTab } from './components/ServiceLogPanel.vue';
import WorkersPanel from './components/WorkersPanel.vue';
import MigrationPanel from './components/MigrationPanel.vue';
import PbDataStatus from './components/PbDataStatus.vue';
import PricesOverlay from './components/PricesOverlay.vue';
import CmcPoolPanel from './components/CmcPoolPanel.vue';
import CmcStatusBar from './components/CmcStatusBar.vue';
import PbDataSettings from './components/PbDataSettings.vue';
import CoinDataSettings from './components/CoinDataSettings.vue';
import ApiServerSettings from './components/ApiServerSettings.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import AppShell from '@/shared/components/AppShell.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
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
    { id: 'log', i18nKey: 'sysmon.logTab', task: 'Task 10' },
    { id: 'settings', i18nKey: 'sysmon.settings', task: 'Task 12' },
    { id: 'status', i18nKey: 'sysmon.status', task: 'Task 12' },
  ],
  pbcoindata: [
    { id: 'log', i18nKey: 'sysmon.logTab', task: 'Task 10' },
    { id: 'pool', i18nKey: 'sysmon.pool', task: 'Task 11' },
    { id: 'settings', i18nKey: 'sysmon.settings', task: 'Task 13' },
  ],
  'api-server': [
    { id: 'log', i18nKey: 'sysmon.logTab', task: 'Task 10' },
    { id: 'settings', i18nKey: 'sysmon.settings', task: 'Task 13' },
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
const statusLoadError = ref(false);
/** svcId → in-flight action (legacy _serviceActionPending). */
const pendingActions = ref<Record<string, ServiceAction>>({});
/** Legacy _workers; fetchWorkers below updates it for the cards and the panel. */
const workers = ref<WorkersStatus>({ counts: { total: 0, running: 0 }, groups: [] });
/** True when the latest workers fetch failed (legacy force error display). */
const workersLoadError = ref(false);
/** Sidebar/overview counts, derived like the legacy updateWorkersSummary reads. */
const workersCounts = computed(() => workers.value.counts ?? { total: 0, running: 0 });
/** Legacy _migrationStatus, updated by load/test/run flows. */
const migrationStatus = ref<MigrationStatus | null>(null);
/** Legacy in-flight button state: 'test' → testSystemdMigration, 'run' → runSystemdMigration. */
const migrationBusy = ref<'test' | 'run' | null>(null);
/** Legacy forced-reload placeholder (loadMigrationStatus(true) until the fetch settles). */
const migrationLoading = ref(false);
/** Legacy _apiRestartPendingUntil: the 90s window opened by a run with api_restart. */
let migrationRestartPendingUntil = 0;
/** Legacy _migrationRestartTimer. */
let migrationRestartTimer: ReturnType<typeof setTimeout> | undefined;

/** Legacy apiRestartPending: true while the restart window has not elapsed. */
function apiRestartPending(): boolean {
  return migrationRestartPendingUntil > 0 && Date.now() < migrationRestartPendingUntil;
}

/** Legacy scheduleMigrationRestartCheck: one-shot 3s retry (default), replace pending. */
function scheduleMigrationRestartCheck(delayMs: number): void {
  clearTimeout(migrationRestartTimer);
  migrationRestartTimer = setTimeout(() => {
    migrationRestartTimer = undefined;
    void loadMigrationStatus(false);
  }, delayMs || 3000);
}

/**
 * Legacy loadMigrationStatus: GET /migration/status; on failure during a
 * pending restart window keep the last status flagged _restart_pending and
 * retry after 3s, otherwise replace with the { _error } payload. A success
 * that ends a pending window refreshes the service + worker status.
 */
async function loadMigrationStatus(force: boolean): Promise<void> {
  if (force) migrationLoading.value = true;
  try {
    const data = await apiFetch<MigrationStatus>(`${apiBase()}/migration/status`);
    const restartWasPending = apiRestartPending();
    migrationRestartPendingUntil = 0;
    clearTimeout(migrationRestartTimer);
    migrationRestartTimer = undefined;
    migrationStatus.value = data;
    if (restartWasPending) {
      void fetchStatus();
      void fetchWorkers();
    }
  } catch (error) {
    if (apiRestartPending()) {
      migrationStatus.value = { ...(migrationStatus.value ?? {}), _restart_pending: true };
      scheduleMigrationRestartCheck(3000);
      return;
    }
    const message =
      error instanceof ApiError && error.detail
        ? error.detail
        : error instanceof Error && error.message
          ? error.message
          : t('sysmon.migrationStatusFailed');
    migrationStatus.value = { _error: message };
  } finally {
    migrationLoading.value = false;
  }
}

/** Legacy migrationConfirm: shared confirm dialog, result-popup fallback. */
async function migrationConfirm(): Promise<boolean> {
  const dialogs = (window as Window & {
    PBGuiDialogs?: { confirm?: (opts: { title: string; message: string; confirmText: string }) => Promise<boolean> };
  }).PBGuiDialogs;
  if (dialogs && typeof dialogs.confirm === 'function') {
    return dialogs.confirm({
      title: t('sysmon.migrateToSystemd'),
      message: t('sysmon.migrateToSystemdMsg'),
      confirmText: t('sysmon.migrate'),
    });
  }
  showResultPopup({
    title: t('sysmon.migrationBlocked'),
    message: t('sysmon.dialogUnavailable'),
    output: t('sysmon.reloadAndRetry'),
    isOk: false,
  });
  return false;
}

/** Legacy testSystemdMigration: POST /migration/test with dry-run popups. */
async function testSystemdMigration(): Promise<void> {
  migrationBusy.value = 'test';
  showResultPopup({
    title: t('sysmon.migrationTestTitle'),
    message: t('sysmon.dryRunRunning'),
    output: '',
    isOk: true,
    hideFoot: true, // legacy _resultPopup(..., true, true)
  });
  try {
    const data = await apiFetch<{ ok?: boolean; warnings?: string[]; errors?: string[]; logs?: string[] }>(
      `${apiBase()}/migration/test`,
      { method: 'POST' }
    );
    const lines = [
      ...(data.warnings ?? []).map((warning) => t('sysmon.warningLogPrefix') + warning),
      ...(data.errors ?? []).map((error) => t('sysmon.errorLogPrefix') + error),
      ...(data.logs ?? []),
    ];
    showResultPopup({
      title: t('sysmon.migrationTestTitle'),
      message: data.ok ? t('sysmon.dryRunCompleted') : t('sysmon.dryRunFoundBlockers'),
      output: lines.join('\n'),
      isOk: !!data.ok,
    });
  } catch (error) {
    const output =
      error instanceof ApiError && error.detail
        ? serverMsg(error.detail)
        : error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('sysmon.migrationTestFailed');
    showResultPopup({
      title: t('sysmon.migrationTestTitle'),
      message: t('sysmon.migrationTestFailed'),
      output,
      isOk: false,
    });
  } finally {
    migrationBusy.value = null;
  }
}

/** Legacy runSystemdMigration: confirm → POST /migration/run → restart window + retry. */
async function runSystemdMigration(): Promise<void> {
  if (!(await migrationConfirm())) return;
  migrationBusy.value = 'run';
  showResultPopup({
    title: t('sysmon.migrationTitle'),
    message: t('sysmon.migrationRunning'),
    output: '',
    isOk: true,
    hideFoot: true, // legacy _resultPopup(..., true, true)
  });
  try {
    const data = await apiFetch<{
      ok?: boolean;
      detail?: string;
      error?: string;
      warnings?: string[];
      logs?: string[];
      api_restart?: boolean;
      after?: MigrationStatus;
    }>(`${apiBase()}/migration/run`, { method: 'POST' });
    if (data.ok === false) throw new Error(data.detail || data.error || t('sysmon.migrationFailed'));
    const lines = [
      ...(data.warnings ?? []).map((warning) => t('sysmon.warningLogPrefix') + warning),
      ...(data.logs ?? []),
    ];
    if (data.api_restart) {
      migrationRestartPendingUntil = Date.now() + 90000; // legacy 90s restart window
    }
    migrationStatus.value = {
      ...(data.after ?? migrationStatus.value ?? {}),
      ...(data.api_restart ? { _restart_pending: true } : {}),
    };
    showResultPopup({
      title: t('sysmon.migrationTitle'),
      message: t('sysmon.migrationCompleted'),
      output: lines.join('\n'),
      isOk: true,
    });
    scheduleMigrationRestartCheck(3000);
  } catch (error) {
    const output =
      error instanceof Error && error.message ? serverMsg(error.message) : t('sysmon.migrationFailed');
    showResultPopup({
      title: t('sysmon.migrationTitle'),
      message: t('sysmon.migrationFailed'),
      output,
      isOk: false,
    });
    void loadMigrationStatus(true);
  } finally {
    migrationBusy.value = null;
  }
}

/** Legacy fetchStatus: GET /status, keep the last payload on failure. */
async function fetchStatus(): Promise<void> {
  try {
    statuses.value = await apiFetch<ServiceStatusMap>(`${apiBase()}/status`);
    hasLoadedStatus.value = true;
    statusLoadError.value = false;
  } catch {
    statusLoadError.value = true;
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

/** Legacy selectPanel: swap the visible panel, track the guide keyword, persist the hash. */
function selectPanel(panelId: string): void {
  activePanel.value = panelId;
  // legacy: window._servicesGuideKeyword = svc ? svc.guideKeyword : 'services_overview'
  const svc = SERVICES.find((s) => s.id === panelId);
  window._servicesGuideKeyword = svc ? svc.guideKeyword : 'services_overview';
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${panelId}`);
}

/* ── Help overlay wiring (legacy help overlay IIFE public opener) ── */

/**
 * Legacy window._servicesGuideKeyword: read by the shared help overlay opener;
 * updated on every panel select (svc.guideKeyword, else services_overview).
 */
declare global {
  interface Window {
    _servicesGuideKeyword?: string;
    PBGUI_HELP_OPENER?: () => void;
  }
}
window._servicesGuideKeyword = 'services_overview';

/**
 * Legacy window._openServicesHelp/PBGUI_HELP_OPENER: the pbgui_nav Guide button
 * calls this; it forwards the current panel's keyword to the shared overlay
 * script (PBGuiSharedHelp.open, loaded by index.html).
 */
window.PBGUI_HELP_OPENER = (): void => {
  const sharedHelp = (window as Window & {
    PBGuiSharedHelp?: { open?: (keyword: string, opts: { token: string }) => void };
  }).PBGuiSharedHelp;
  if (!sharedHelp || typeof sharedHelp.open !== 'function') return;
  sharedHelp.open(window._servicesGuideKeyword || 'services_overview', { token: getBoot().token });
};

/* ── Prices overlay (legacy window.openPricesOverlay target) ── */

const pricesOverlayEl = ref<InstanceType<typeof PricesOverlay> | null>(null);
const setPricesOverlay = (el: Element | ComponentPublicInstance | null): void => {
  pricesOverlayEl.value = el as InstanceType<typeof PricesOverlay> | null;
};

/** Legacy openPricesOverlay — invoked by the fetch-summary Prices group. */
function openPricesOverlay(): void {
  pricesOverlayEl.value?.open();
}

/* ── Sidebar resize (legacy sidebar resize IIFE) ── */

const sidebarEl = ref<HTMLElement | null>(null);
const resizeActive = ref(false);
let resizeStartX = 0;
let resizeStartW = 0;

/** Legacy #sidebar-resize mousedown: capture start position/width, arm the drag. */
function onSidebarResizeDown(event: MouseEvent): void {
  const sidebar = sidebarEl.value;
  if (!sidebar) return;
  resizeActive.value = true;
  resizeStartX = event.clientX;
  resizeStartW = sidebar.offsetWidth;
  document.body.style.cursor = 'col-resize';
}

/** Legacy document mousemove: clamp the sidebar width to 150-300px. */
function onSidebarResizeMove(event: MouseEvent): void {
  if (!resizeActive.value) return;
  const sidebar = sidebarEl.value;
  if (!sidebar) return;
  sidebar.style.width = `${Math.max(150, Math.min(300, resizeStartW + event.clientX - resizeStartX))}px`;
}

/** Legacy document mouseup: end the drag. */
function onSidebarResizeUp(): void {
  resizeActive.value = false;
  document.body.style.cursor = '';
}

onMounted(() => {
  document.addEventListener('mousemove', onSidebarResizeMove);
  document.addEventListener('mouseup', onSidebarResizeUp);
});

onUnmounted(() => {
  document.removeEventListener('mousemove', onSidebarResizeMove);
  document.removeEventListener('mouseup', onSidebarResizeUp);
});

/** Legacy scheduleWorkers gating: poll only while the workers panel is active. */
watch(activePanel, (panelId) => {
  if (panelId === 'workers') workersPolling.start();
  else workersPolling.stop();
  if (panelId === 'pbcoindata') void loadCmcPool(); // legacy selectPanel
  if (panelId === 'migration') void loadMigrationStatus(true); // legacy selectPanel
});

/** Legacy switchTab: settings tabs lazily load; the pbcoindata pool tab reloads the pool. */
function onServiceTab(svcId: string, tabId: string): void {
  serviceTabs.value = { ...serviceTabs.value, [svcId]: tabId };
  if (svcId === 'pbcoindata' && tabId === 'pool') void loadCmcPool();
  if (tabId === 'settings' && (SETTINGS_SERVICES as readonly string[]).includes(svcId)) {
    loadSettingsPane(svcId);
  }
}

/** Active tab per service — mirrors ServiceLogPanel's internal switchTab state so
 *  the pbdata status pane can gate its polling (legacy _fetchSummaryTimer). */
const serviceTabs = ref<Record<string, string>>(
  Object.fromEntries(
    Object.entries(SERVICE_TABS).map(([svcId, tabs]) => {
      const parts = window.location.hash.replace(/^#/, '').split('/');
      return [svcId, parts[0] === svcId && parts[1] && tabs.some((tab) => tab.id === parts[1]) ? parts[1] : 'log'];
    })
  )
);

/* ── Settings panes (legacy loadSettings/_settingsLoaded) ── */

type SettingsPaneInstance = ComponentPublicInstance<{ load: () => Promise<void> }>;

/** Services with a settings tab that lazily loads GET /settings/{svcId}. */
const SETTINGS_SERVICES = ['pbdata', 'pbcoindata', 'api-server'] as const;

/** Function refs — a string ref inside the PANELS v-for would collect an array. */
const settingsEls: Record<string, SettingsPaneInstance | null> = Object.fromEntries(
  SETTINGS_SERVICES.map((svcId) => [svcId, null])
);
/** Legacy _settingsLoaded[svc]: the settings load exactly once per session. */
const settingsLoaded: Record<string, boolean> = {};

function makeSettingsRef(svcId: string) {
  return (el: Element | ComponentPublicInstance | null): void => {
    settingsEls[svcId] = el as SettingsPaneInstance | null;
  };
}
const setPbdataSettings = makeSettingsRef('pbdata');
const setCoinDataSettings = makeSettingsRef('pbcoindata');
const setApiServerSettings = makeSettingsRef('api-server');

/** Legacy loadSettings(svcId): GET /settings/{svcId} into the settings pane. */
function loadSettingsPane(svcId: string): void {
  if (settingsLoaded[svcId]) return;
  settingsLoaded[svcId] = true;
  void settingsEls[svcId]?.load();
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
  void loadMigrationStatus(false); // legacy init loadMigrationStatus(false)
  if (activePanel.value === 'workers') workersPolling.start(); // legacy selectPanel('workers')
  if (activePanel.value === 'pbcoindata') void loadCmcPool(); // legacy restoreFromHash -> selectPanel
  // legacy restoreFromHash -> switchTab('settings') loads the settings once
  if (window.location.hash.split('/')[1] === 'settings' && (SETTINGS_SERVICES as readonly string[]).includes(activePanel.value)) {
    loadSettingsPane(activePanel.value);
  }
});

onUnmounted(() => {
  statusPolling.stop();
  workersPolling.stop();
  clearTimeout(migrationRestartTimer);
});
</script>

<template>
  <MigrationWatermark />
  <AppShell
    class="operations-shell operations-shell--services"
    page-key="system_services"
    :page-title="t('sysmon.servicesTitle')"
    :page-description="t('sysmon.servicesSubtitle')"
  >
    <template #status>
      <StatusStrip
        :label="t('sysmon.status')"
        :value="statusLoadError ? t('common.error') : hasLoadedStatus ? t('common.ok') : t('common.loading')"
        :tone="statusLoadError ? 'danger' : hasLoadedStatus ? 'success' : 'warning'"
      />
    </template>

    <template #header-actions>
      <button class="pbgui-action" type="button" @click="fetchStatus"><PbIcon :icon="PhArrowClockwise" /> {{ t('common.refresh') }}</button>
    </template>

  <div id="page-body">
    <!-- Sidebar — status dots driven by the polled /status payload (legacy updateStatusUI) -->
    <div id="sidebar" ref="sidebarEl">
      <div id="sidebar-resize" :class="{ active: resizeActive }" @mousedown="onSidebarResizeDown"></div>
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
    <div id="services-main-content">
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
        <MigrationPanel
          v-else-if="panel.id === 'migration'"
          :status="migrationStatus"
          :loading="migrationLoading"
          :busy="migrationBusy"
          @refresh="loadMigrationStatus(true)"
          @test="testSystemdMigration"
          @run="runSystemdMigration"
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
          <template v-if="panel.id === 'pbcoindata'" #tab-settings>
            <CoinDataSettings :ref="setCoinDataSettings" />
          </template>
          <template v-if="panel.id === 'pbdata'" #tab-settings>
            <PbDataSettings :ref="setPbdataSettings" />
          </template>
          <template v-if="panel.id === 'pbdata'" #tab-status>
            <PbDataStatus
              :active="activePanel === 'pbdata' && serviceTabs['pbdata'] === 'status'"
              @open-prices="openPricesOverlay"
            />
          </template>
          <template v-if="panel.id === 'api-server'" #tab-settings>
            <ApiServerSettings :ref="setApiServerSettings" />
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

  <!-- Page-global prices overlay (legacy #prices-overlay markup, outside page-body). -->
  <PricesOverlay :ref="setPricesOverlay" />
  </AppShell>
</template>

<!-- Layout scaffolding ported from frontend/services_monitor.html (page-level,
     intentionally NOT scoped because panel components target these ids/classes).
     Base styles and tokens come from @/styles/tokens.css +
     base.css; panel-specific styles arrive with each panel component. -->
<style>
#page-body {
  display: flex;
  flex: 1;
  height: auto;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-page);
}

.operations-shell--services .app-shell__workspace,
.operations-shell--services .app-shell__main,
.operations-shell--services .app-shell__primary {
  min-height: 0;
}

.operations-shell--services .app-shell__workspace {
  display: flex;
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
}

.operations-shell--services .app-shell__main {
  width: 100%;
  max-width: none;
  flex: 1;
  padding: 0;
}

.operations-shell--services .app-shell__primary {
  display: flex;
  flex-direction: column;
}

/* ── Sidebar ── */
#sidebar {
  width: 200px;
  min-width: 150px;
  max-width: 300px;
  flex-shrink: 0;
  background: #131114;
  border-right: 1px solid #29262c;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
#sidebar-resize {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  background: transparent;
  z-index: 1;
}
#sidebar-resize:hover,
#sidebar-resize.active {
  background: rgba(99, 179, 237, 0.4);
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
  color: #a29ca6;
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
  color: #eae7ea;
}
.sb-btn.active {
  background: rgba(99, 179, 237, 0.12);
  border-color: rgba(99, 179, 237, 0.3);
  color: #eae7ea;
  font-weight: 600;
}
.sb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4e4851;
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
#services-main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.svc-panel {
  display: none;
  flex-direction: column;
  height: 100%;
  min-height: 0;
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
  border: 1px solid #29262c;
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
  border-bottom: 1px solid #29262c;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}
.result-modal-header:active { cursor: grabbing; }
.result-modal-header h3 { margin: 0; font-size: var(--fs-md); color: #eae7ea; }
.result-modal-close { background: none; border: none; color: #716b75; font-size: 1.4rem; cursor: pointer; padding: 0 4px; }
.result-modal-close:hover { color: #eae7ea; }
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
.result-modal-footer { padding: 0.5rem 1rem; border-top: 1px solid #29262c; text-align: right; flex-shrink: 0; }
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
  color: #716b75;
}
.panel-placeholder-name {
  font-size: var(--fs-lg);
  font-weight: 700;
}
.panel-placeholder-hint {
  font-size: var(--fs-sm);
  color: #4e4851;
}

/* ── Services command-center refinement ───────────────────────────────────
   Keep service controls and panel behavior unchanged while improving the
   hierarchy of health states, navigation and operational surfaces. */
body {
  background:
    radial-gradient(circle at 7% 0%, rgba(37, 99, 235, 0.09), transparent 25rem),
    var(--bg-page);
}

#page-body {
  background:
    linear-gradient(135deg, rgba(19, 17, 20, 0.98), rgba(10, 17, 29, 0.97));
}

#sidebar {
  width: 224px;
  min-width: 176px;
  max-width: 320px;
  background:
    linear-gradient(180deg, rgba(18, 29, 46, 0.98), rgba(10, 16, 26, 0.98) 78%),
    var(--bg-page);
  border-right-color: rgba(96, 165, 250, 0.15);
}

#sidebar::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 150px;
  pointer-events: none;
  background: radial-gradient(circle at 22% 0%, rgba(56, 189, 248, 0.14), transparent 68%);
}

#sidebar-inner {
  position: relative;
  z-index: 1;
  gap: 5px;
  padding: 16px 12px 18px;
}

#sidebar-inner::before {
  content: 'SYSTEM HEALTH';
  display: block;
  margin: 4px 8px 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(162, 156, 166, 0.12);
  color: #dbeafe;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.sb-btn {
  min-height: 37px;
  padding: 0 12px;
  border-color: transparent;
  border-radius: 8px;
  color: #9db2ca;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.sb-btn:hover {
  transform: translateX(2px);
  border-color: rgba(96, 165, 250, 0.16);
  background: rgba(96, 165, 250, 0.08);
  color: #edf4fc;
}

.sb-btn.active {
  border-color: rgba(96, 165, 250, 0.3);
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.2), rgba(37, 99, 235, 0.04));
  box-shadow: inset 3px 0 #60a5fa;
  color: #dbeafe;
}

.sb-dot {
  width: 7px;
  height: 7px;
  box-shadow: 0 0 0 3px rgba(74, 85, 104, 0.1);
}

.sb-dot.running {
  background: #34d399;
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.12), 0 0 12px rgba(52, 211, 153, 0.42);
}

.sb-dot.stopped {
  background: #f87171;
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.1);
}

.sb-dot.warn {
  background: #fbbf24;
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.1);
}

#main-content {
  background:
    radial-gradient(circle at 94% 0%, rgba(56, 189, 248, 0.1), transparent 28rem),
    radial-gradient(circle at 0% 84%, rgba(20, 184, 166, 0.06), transparent 24rem),
    repeating-linear-gradient(135deg, rgba(162, 156, 166, 0.018) 0 1px, transparent 1px 42px),
    var(--bg-page);
}

#panel-overview {
  padding: 28px clamp(18px, 3vw, 42px) 42px;
}

#overview-grid {
  padding: 0;
  grid-template-columns: repeat(auto-fill, minmax(205px, 1fr));
  gap: 16px;
}

#overview-grid .svc-card {
  position: relative;
  min-height: 132px;
  padding: 17px;
  overflow: hidden;
  border-color: rgba(162, 156, 166, 0.14);
  border-radius: 13px;
  background:
    radial-gradient(circle at 100% 0%, rgba(96, 165, 250, 0.07), transparent 68%),
    rgba(19, 29, 45, 0.82);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.14), 0 1px rgba(255, 255, 255, 0.025) inset;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

#overview-grid .svc-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: linear-gradient(90deg, rgba(162, 156, 166, 0.45), transparent 72%);
}

#overview-grid .svc-card:hover {
  transform: translateY(-3px);
  border-color: rgba(96, 165, 250, 0.32);
  background:
    radial-gradient(circle at 100% 0%, rgba(56, 189, 248, 0.12), transparent 68%),
    rgba(20, 37, 59, 0.9);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(96, 165, 250, 0.04);
}

#overview-grid .svc-card.running {
  border-color: rgba(52, 211, 153, 0.28);
}

#overview-grid .svc-card.running::before {
  background: linear-gradient(90deg, #34d399, transparent 72%);
}

#overview-grid .svc-card.stopped {
  border-color: rgba(248, 113, 113, 0.26);
}

#overview-grid .svc-card.stopped::before {
  background: linear-gradient(90deg, #f87171, transparent 72%);
}

#overview-grid .card-name {
  color: #e8f0fa;
  font-size: 14px;
  letter-spacing: -0.01em;
}

#overview-grid .card-status-row {
  min-height: 25px;
  color: #8fa5be;
  line-height: 1.45;
}

#overview-grid .card-dot {
  width: 8px;
  height: 8px;
}

#overview-grid .card-buttons {
  margin-top: auto;
  gap: 6px;
}

#overview-grid .card-btn {
  min-height: 29px;
  padding: 0 10px;
  border-color: rgba(162, 156, 166, 0.16);
  border-radius: 7px;
  background: rgba(162, 156, 166, 0.08);
  color: #b7c6d8;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

#overview-grid .card-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(96, 165, 250, 0.36);
  background: rgba(37, 99, 235, 0.16);
  color: #edf4fc;
}

#overview-grid .card-btn.start {
  border-color: rgba(52, 211, 153, 0.32);
  background: rgba(16, 185, 129, 0.12);
  color: #86efac;
}

#overview-grid .card-btn.stop {
  border-color: rgba(248, 113, 113, 0.32);
  background: rgba(185, 28, 28, 0.15);
  color: #fca5a5;
}

#overview-grid .card-btn.restart {
  border-color: rgba(251, 191, 36, 0.32);
  background: rgba(180, 83, 9, 0.14);
  color: #fde68a;
}

#overview-grid .card-btn.enable {
  border-color: rgba(96, 165, 250, 0.32);
  background: rgba(37, 99, 235, 0.14);
  color: #bfdbfe;
}

.result-modal {
  border-color: rgba(96, 165, 250, 0.24);
  border-radius: 14px;
  background: linear-gradient(145deg, #172337, #101927);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.52), 0 1px rgba(255, 255, 255, 0.04) inset;
}

.result-modal-header {
  padding: 14px 17px;
  border-bottom-color: rgba(162, 156, 166, 0.14);
  background: rgba(24, 38, 59, 0.45);
}

.result-modal-header h3 {
  color: #e8f0fa;
}

.result-modal-status.ok {
  background: rgba(6, 95, 70, 0.32);
  border-bottom-color: rgba(52, 211, 153, 0.24);
}

.result-modal-status.fail {
  background: rgba(127, 29, 29, 0.32);
  border-bottom-color: rgba(248, 113, 113, 0.24);
}

.result-modal-footer {
  padding: 10px 17px;
  border-top-color: rgba(162, 156, 166, 0.14);
}

.result-modal-footer button {
  min-height: 34px;
  border: 1px solid rgba(96, 165, 250, 0.46);
  border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}

button:focus-visible {
  outline: 2px solid #7dd3fc;
  outline-offset: 2px;
}

@media (max-width: 980px) {
  #sidebar {
    width: 196px;
  }

  #panel-overview {
    padding: 22px 18px 32px;
  }

  #overview-grid {
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  }
}

@media (max-width: 680px) {
  #sidebar {
    width: 172px;
    min-width: 150px;
  }

  #sidebar-inner {
    padding-inline: 8px;
  }

  #sidebar-inner::before {
    margin-inline: 6px;
    font-size: 10px;
  }

  .sb-btn {
    padding-inline: 9px;
    font-size: 12px;
  }

  #panel-overview {
    padding: 16px 12px 24px;
  }

  #overview-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  #overview-grid .svc-card {
    min-height: 118px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
