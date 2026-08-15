<script setup lang="ts">
/*
 * services_monitor migration — component → legacy function mapping
 * (source: frontend/services_monitor.html, kept as the fallback until Task 14)
 *
 * ┌─────────────────────┬─ Task ─┬─ Legacy functions ────────────────────────────────┐
 * │ OverviewCards       │ 9      │ renderOverviewCards, fetchStatus/updateStatusUI,   │
 * │                     │        │ serviceSkipped/StatusClass/StatusText/StatusTitle, │
 * │                     │        │ renderServiceButtons                               │
 * │ ServiceStatusBar    │ 9      │ updateStatusUI (sidebar dots + ctrl-strip),        │
 * │                     │        │ svcAction (start/stop/restart/enable/disable)      │
 * │ WorkersPanel        │ 10     │ fetchWorkers, renderWorkers, renderWorkerDetail,   │
 * │                     │        │ renderWorkerActionButtons, updateWorkersSummary,   │
 * │                     │        │ selectWorker, updateWorkerLog, workerConfirmAction/│
 * │                     │        │ workerRestart/workerAction                         │
 * │ ServiceLogPanel     │ 10     │ initLogViewer (per-service log tabs + ctrl-strip), │
 * │                     │        │ switchTab — covers pbcluster, pbrun, monitor-agent,│
 * │                     │        │ vps-monitor and the Log tabs of pbdata/pbcoindata/ │
 * │                     │        │ api-server                                         │
 * │ CmcPoolPanel        │ 11     │ loadCmcPool, renderCmcPool, cmcFetch, selectedCmcKey,│
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
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

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

const DEFAULT_PANEL = 'overview';

const { t } = useI18n();

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

function panelLabel(panel: PanelDef): string {
  return panel.i18nKey ? t(panel.i18nKey) : panel.name;
}

onMounted(() => {
  document.title = t('sysmon.servicesTitle');
});
</script>

<template>
  <nav id="topnav"></nav>
  <div id="page-body">
    <!-- Sidebar — status dots (Task 9) land on the .sb-dot spans -->
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
          <span class="sb-dot"></span><span>{{ panelLabel(panel) }}</span>
        </button>
      </div>
    </div>

    <!-- Main content — one placeholder container per legacy panel; Tasks 9–14
         replace the placeholder with the real panel component. -->
    <div id="main-content">
      <div
        v-for="panel in PANELS"
        :id="`panel-${panel.id}`"
        :key="panel.id"
        class="svc-panel"
        :class="{ active: panel.id === activePanel }"
      >
        <div class="panel-placeholder">
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
