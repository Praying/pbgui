<script setup lang="ts">
/**
 * Backtest workbench shell — the M-v7-8 scaffold of
 * frontend/v7_backtest.html (10,340 L): page chrome (DOM :660-1005),
 * view-state restore + panel switching (:1331-1462), the queue WS
 * (:1267-1337), the settings modal (:1467-1642) and the queue panel
 * (:5136-5226, :5787-5871). M-v7-9 adds the configs list (:1654-1712),
 * the config editor (:2563-2946) and the queue-draft modal (:2062-2145).
 * M-v7-10 adds the results workbench (:834-869): version-filtered
 * loadResults with the empty-retry ladder (:5357-5416), the sortable +
 * drag-selectable results table (:5514-5785), per-result charts
 * (:6576-7528), the compare flows (:7646-7860) and the delete flow
 * (:8509-8532). M-v7-11 adds the archive workbench (:875-917,
 * :8822-9463) and the legacy panel (:918-945). Handoffs (M-v7-12)
 * extend this shell.
 *
 * FLAVOR: pathname-derived (/api/backtest-v8/ → v8, config.ts) — both
 * routers serve this one build; v8 drops the legacy panel.
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
  PhArchive,
  PhArrowsClockwise,
  PhChartBar,
  PhChartLineUp,
  PhCheck,
  PhClipboardText,
  PhCompassTool,
  PhDownloadSimple,
  PhFloppyDisk,
  PhGear,
  PhHouse,
  PhPlay,
  PhPlus,
  PhQuestion,
  PhTrash,
  PhUploadSimple,
  PhWallet,
} from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import { replaceTopLocation } from '@/shared/nav';
import AppShell from '@/shared/components/AppShell.vue';
import DataTipTooltip from '@/shared/components/DataTipTooltip.vue';
import IconButton from '@/shared/components/IconButton.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import ArchiveGitModals from './components/ArchiveGitModals.vue';
import ArchiveLogPanel from './components/ArchiveLogPanel.vue';
import ArchivePanel from './components/ArchivePanel.vue';
import BacktestConfigEditor from './components/BacktestConfigEditor.vue';
import ConfigsPanel from './components/ConfigsPanel.vue';
import LegacyPanel from './components/LegacyPanel.vue';
import RebacktestModal from './components/RebacktestModal.vue';
import PanelShell from './components/PanelShell.vue';
import QueueDraftModal from './components/QueueDraftModal.vue';
import QueuePanel from './components/QueuePanel.vue';
import ResultsPanel from './components/ResultsPanel.vue';
import SettingsModal from './components/SettingsModal.vue';
import { useBacktestPage } from './composables/useBacktestPage';
import type { PageSection } from '@/shared/navigation';
import type { BacktestPanel } from './types';

const { t } = useI18n();
const boot = getBoot();

function cleanLabel(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, '');
}

function actionLabel(key: string): string {
  return cleanLabel(t(key));
}

const store = useBacktestPage({
  origin: boot.origin,
  t: (key, params) => t(key, params ?? {}),
  // suiteCollect's auto-save (:4769): the open scenario draft folds into
  // the state before every collect (Save / Save & Queue / raw-JSON sync).
  foldSuiteDraft: () => editorPanel.value?.foldSuiteDraft(),
  // showArchiveLog (:9633-9639): push/compact/openLog open the sync log.
  openArchiveSyncLog: () => archiveLogPanel.value?.open(),
});

function openBacktestHelp(): void {
  const sharedHelp = (window as Window & {
    PBGuiSharedHelp?: { open?: (topic: string, options?: { token?: string }) => void };
  }).PBGuiSharedHelp;
  sharedHelp?.open?.(store.adapter.isV8 ? '42_pbv8_backtest' : '35_pbv7_backtest', { token: boot.token });
}

const queuePanel = ref<InstanceType<typeof QueuePanel> | null>(null);
const configsPanel = ref<InstanceType<typeof ConfigsPanel> | null>(null);
const configsSelectedCount = computed(() => configsPanel.value?.selectedCount ?? 0);
const editorPanel = ref<InstanceType<typeof BacktestConfigEditor> | null>(null);
const resultsPanel = ref<InstanceType<typeof ResultsPanel> | null>(null);
const archivePanel = ref<InstanceType<typeof ArchivePanel> | null>(null);
const archiveLogPanel = ref<InstanceType<typeof ArchiveLogPanel> | null>(null);
const legacyPanel = ref<InstanceType<typeof LegacyPanel> | null>(null);
/** Results pin state (:6415-6419) — `unpinned` releases the panel chrome. */
const resultsPinned = ref(true);
/** Archive (:6384-6397) + legacy (:6400-6413) pin states. */
const archivePinned = ref(true);
const legacyPinned = ref(true);

const bannerClass = computed(() => 'conn-' + store.banner.value);
const bannerText = computed(() =>
  store.banner.value === 'ok' ? t('v7backtest.connected') : store.banner.value === 'lost' ? t('v7backtest.connectionLost') : t('v7backtest.connecting')
);
/* Connection success is quiet: a transient toast, while the persistent banner
   only appears on disconnect/error (the header status strip covers the ok
   state). Avoids the old always-on green strip duplicating the status dot. */
watch(
  () => store.banner.value,
  (next, previous) => {
    if (next === 'ok' && previous !== 'ok') store.toast.show(t('v7backtest.connected'), 'ok');
  }
);

const editorOpen = computed(() => store.editor.editingName.value !== null);
const editorHasSavedConfig = computed(() => !!store.editor.editingName.value && store.editor.editingName.value !== '__new__');
const importOpen = ref(false);

/* Converged navigation: the five panels are rail sections under the active
   Backtest page item; the queue count rides along as the section badge. */
const railSections = computed<PageSection[]>(() =>
  store.nav.map((item) => ({
    key: item.panel,
    label: t(item.labelKey),
    badge: item.badge ? store.queueBadge.value || undefined : undefined,
  })),
);

function onRailSection(key: string): void {
  store.selectPanel(key as BacktestPanel);
}
const importName = ref('');
const importJson = ref('');
const importError = ref('');
const importLoading = ref(false);
const ohlcvOpen = ref(false);
const ohlcvLoading = ref(false);
const ohlcvError = ref('');
const ohlcvData = ref<Record<string, unknown> | null>(null);
/** The archive/legacy panels mount once their panel is first visited. */
const archiveMounted = computed(() => store.view.state.panel === 'archive' || store.archive.archives.value.length > 0);
const legacyMounted = computed(() => store.view.state.panel === 'legacy' || (store.legacy?.rows.value.length ?? 0) > 0);
const editorSettings = computed(() => ({
  hslModes: store.settingsStore.settings.value.hsl_signal_modes,
  exchangeOptions: store.editor.exchangeOptions(),
}));

function onQueueViewResults(name: string): void {
  store.viewConfigResults(name);
}
function onQueueShowLog(filename: string): void {
  /* the LogViewerPanel wrapper lands with the M-v7-10 log surface */
  void filename;
}
function onQueueEditConfig(name: string): void {
  void store.editor.editConfig(name);
}
function onNothingSelected(): void {
  store.notifyError(t('v7backtest.nothingSelected'));
}

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === 'string' ? detail : response.statusText || `HTTP ${response.status}`);
  }
  return data;
}

function currentConfig(): Record<string, unknown> | null {
  try {
    return store.editor.collect();
  } catch (error) {
    store.notifyError(t('v7backtest.failedPrepareConfig', { msg: error instanceof Error ? error.message : String(error) }));
    return null;
  }
}

function openImport(): void {
  importName.value = store.editor.editingName.value === '__new__' ? '' : store.editor.state.name;
  importJson.value = '';
  importError.value = '';
  importOpen.value = true;
}

async function submitImport(): Promise<void> {
  importError.value = '';
  importLoading.value = true;
  try {
    await store.editor.importConfig(importName.value, importJson.value);
    importOpen.value = false;
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error);
  } finally {
    importLoading.value = false;
  }
}

function editorResults(): void {
  const name = store.editor.editingName.value;
  if (!name || name === '__new__') return;
  store.editor.closeEditor();
  store.viewConfigResults(name);
}

async function convertEditorToV8(): Promise<void> {
  const name = store.editor.editingName.value;
  if (!name || name === '__new__' || store.adapter.isV8) return;
  const targetName = `${name.slice(0, 120)}_v8`;
  try {
    const data = await requestJson(`${boot.origin}/api/backtest-v8/migrate-v7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_type: 'backtest_config', source_name: name, target_name: targetName }),
    });
    replaceTopLocation(`${boot.origin}/api/backtest-v8/main_page?config=${encodeURIComponent(String(data.name || targetName))}`);
  } catch (error) {
    store.notifyError(t('v7backtest.v8ConversionFailed', { msg: error instanceof Error ? error.message : String(error) }));
  }
}

async function addEditorToRun(): Promise<void> {
  const name = store.editor.editingName.value;
  if (!name || name === '__new__') return;
  try {
    const saved = await requestJson(`${store.apiBase}/configs/${encodeURIComponent(name)}`);
    const config = structuredClone((saved.config && typeof saved.config === 'object' ? saved.config : {}) as Record<string, unknown>);
    const live = config.live && typeof config.live === 'object' && !Array.isArray(config.live) ? (config.live as Record<string, unknown>) : {};
    const pbgui = config.pbgui && typeof config.pbgui === 'object' && !Array.isArray(config.pbgui) ? (config.pbgui as Record<string, unknown>) : {};
    config.live = live;
    config.pbgui = { ...pbgui, from_backtest_config: name, enabled_on: 'disabled' };
    const data = await requestJson(`${boot.origin}/api/v7/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    replaceTopLocation(`${boot.origin}/api/v7/edit_page?new=1&draft_id=${encodeURIComponent(String(data.draft_id || ''))}`);
  } catch (error) {
    store.notifyError(t('v7backtest.failedWithMsg', { msg: error instanceof Error ? error.message : String(error) }));
  }
}

async function openStrategyExplorer(): Promise<void> {
  const config = currentConfig();
  if (!config) return;
  const base = `${boot.origin}/api/${store.adapter.isV8 ? 'strategy-explorer-v8' : 'strategy-explorer'}`;
  try {
    const body = store.adapter.isV8 ? { config, override_configs: await store.editor.coinOv.snapshotAllFiles() } : { config };
    const data = await requestJson(`${base}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    replaceTopLocation(`${base}/main_page?draft_id=${encodeURIComponent(String(data.draft_id || ''))}`);
  } catch (error) {
    store.notifyError(t('v7backtest.failedOpenStrategyExplorer', { msg: error instanceof Error ? error.message : String(error) }));
  }
}

async function openBalanceCalculator(): Promise<void> {
  const config = currentConfig();
  if (!config) return;
  const backtest = config.backtest && typeof config.backtest === 'object' && !Array.isArray(config.backtest) ? (config.backtest as Record<string, unknown>) : {};
  const exchanges = Array.isArray(backtest.exchanges) ? backtest.exchanges.map(String) : [];
  const exchange = String(exchanges[0] || 'binance').toLowerCase();
  const base = `${boot.origin}/api/balance-calc`;
  try {
    const data = await requestJson(`${base}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    replaceTopLocation(`${base}/main_page?draft_id=${encodeURIComponent(String(data.draft_id || ''))}&exchange=${encodeURIComponent(exchange)}`);
  } catch (error) {
    store.notifyError(t('v7backtest.failedOpenBalanceCalculator', { msg: error instanceof Error ? error.message : String(error) }));
  }
}

async function openOhlcvReadiness(): Promise<void> {
  const config = currentConfig();
  if (!config) return;
  ohlcvOpen.value = true;
  ohlcvLoading.value = true;
  ohlcvError.value = '';
  ohlcvData.value = null;
  try {
    ohlcvData.value = await requestJson(`${store.apiBase}/ohlcv-preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
  } catch (error) {
    ohlcvError.value = error instanceof Error ? error.message : String(error);
  } finally {
    ohlcvLoading.value = false;
  }
}

/** kvLoadCoins' /symbols loader (:3925-3935). */
function loadSymbols(exchange: string): Promise<{ symbols: string[]; catalog?: Record<string, string> }> {
  return fetch(`${boot.origin}/api/v7/symbols?exchange=${encodeURIComponent(exchange)}`, { credentials: 'same-origin' }).then(
    (response) => response.json() as Promise<{ symbols: string[]; catalog?: Record<string, string> }>
  );
}

function onTemplateExchanges(needed: readonly string[]): void {
  const base = store.editor.state.exchanges;
  const added = needed.filter((exchange) => !base.includes(exchange));
  if (added.length === 0) return;
  store.editor.state.exchanges = [...base, ...added];
  store.toast.show(t('editor.suite.addedExchanges', { ex: added.join(', ') }), 'ok');
}

onMounted(() => {
  document.title = t(store.adapter.titleKey, store.adapter.titleParams);
  store.boot();
});
</script>

<template>
  <MigrationWatermark />
  <DataTipTooltip />
  <AppShell
    class="core-workbench-shell core-workbench-shell--backtest"
    :page-key="store.adapter.navCurrent"
    :page-title="t(store.adapter.titleKey, store.adapter.titleParams)"
    :page-family="store.adapter.label"
    :status-text="bannerText"
    :status-tone="bannerClass === 'conn-ok' ? 'success' : bannerClass === 'conn-lost' ? 'danger' : 'warning'"
    :sections="railSections"
    :active-section="store.view.state.panel"
    @update:section="onRailSection"
  >
    <template #header-actions>
      <IconButton
        class="pbgui-icon-button"
        :icon="PhQuestion"
        :label="t('nav.guide')"
        @click="openBacktestHelp"
      />
    </template>

    <div v-if="store.banner.value !== 'ok'" id="conn-banner" :class="bannerClass" data-i18n="v7backtest.connecting">{{ bannerText }}</div>

    <div id="page-body">

    <div class="workbench-page-content">
    <PanelShell
      :items="store.nav"
      :active="store.view.state.panel"
      :editor-open="editorOpen"
    >
      <template #ctx-configs>
        <button type="button" class="sb-btn accent" data-test="ctx-new-config" @click="store.editor.newConfig()"><PbIcon :icon="PhPlus" /> {{ actionLabel('v7backtest.newConfig') }}</button>
        <button type="button" class="sb-btn danger" data-test="ctx-delete-configs" :disabled="configsSelectedCount === 0" @click="configsPanel?.deleteSelectedFlow(store.deleteConfigs)">
          <PbIcon :icon="PhTrash" />
          {{ actionLabel('v7backtest.deleteSelected') }} ({{ configsSelectedCount }})
        </button>
      </template>
      <template #ctx-queue>
        <button
          type="button"
          class="sb-btn"
          data-test="queue-compare"
          @click="store.compareQueue(queuePanel?.selectedFilenames() ?? [], store.queueItems.value)"
        >
          <PbIcon :icon="PhChartLineUp" />
          {{ actionLabel('v7backtest.compare') }}
        </button>
        <button type="button" class="sb-btn" data-test="clear-finished" @click="store.clearFinished"><PbIcon :icon="PhCheck" /> {{ actionLabel('v7backtest.clearFinished') }}</button>
        <button type="button" class="sb-btn danger" data-test="stop-all" @click="store.stopAllQueue">{{ t('v7backtest.stopAll') }}</button>
        <button type="button" class="sb-btn danger" data-test="delete-selected" @click="queuePanel?.deleteSelected()">
          <PbIcon :icon="PhTrash" />
          {{ actionLabel('v7backtest.deleteSelected') }}
        </button>
        <hr class="sb-sep" />
        <button type="button" class="sb-btn" data-test="open-settings" @click="store.openSettingsModal">{{ t('v7backtest.settings') }}</button>
      </template>
      <template #ctx-results>
        <!-- Backtest (:733) is version-bound (:5349-5355); Compare + Delete are
             cross-version (:735, :742); the other results handoffs land in M-v7-12 -->
        <button
          type="button"
          class="sb-btn"
          data-test="results-rebacktest"
          :disabled="store.results.versionFilter.value !== store.adapter.version"
          :title="store.results.versionFilter.value !== store.adapter.version ? t('v7backtest.actionVersionBound', { version: store.adapter.version.toUpperCase() }) : ''"
          @click="store.startResultsRebacktest"
        >
          <PbIcon :icon="PhArrowsClockwise" />
          {{ actionLabel('v7backtest.backtest') }}
        </button>
        <button type="button" class="sb-btn" data-test="results-add-run" :disabled="store.results.getSelected().length !== 1" @click="store.addResultsToRun">
          <PbIcon :icon="PhPlay" />
          {{ actionLabel('v7backtest.addToRun') }}
        </button>
        <button type="button" class="sb-btn" data-test="results-compare" @click="store.compareResults"><PbIcon :icon="PhChartLineUp" /> {{ actionLabel('v7backtest.compare') }}</button>
        <button type="button" class="sb-btn danger" data-test="results-delete" @click="resultsPanel?.deleteSelectedFlow()"><PbIcon :icon="PhTrash" /> {{ actionLabel('v7backtest.deleteSelected') }}</button>
      </template>
      <template #ctx-archive>
        <!-- list-view actions (:747-753) -->
        <template v-if="!store.archive.selectedName.value">
          <button type="button" class="sb-btn" data-test="archive-pull-all" :disabled="store.archiveGit.pullRunning.value" @click="store.archiveGit.pullAll()">
            <PbIcon :icon="PhDownloadSimple" /> {{ cleanLabel(store.archiveGit.pullButtonLabel.value) }}
          </button>
          <button type="button" class="sb-btn" data-test="archive-push" @click="store.archiveGit.push()"><PbIcon :icon="PhUploadSimple" /> {{ actionLabel('v7backtest.gitPush') }}</button>
          <button type="button" class="sb-btn accent" data-test="archive-add" @click="archivePanel?.openAddArchive()"><PbIcon :icon="PhPlus" /> {{ actionLabel('v7backtest.addArchive') }}</button>
          <button type="button" class="sb-btn" data-test="archive-setup" @click="store.archiveGit.openSetup()"><PbIcon :icon="PhGear" /> {{ actionLabel('v7backtest.setup') }}</button>
          <button type="button" class="sb-btn" data-test="archive-log" @click="archiveLogPanel?.open()"><PbIcon :icon="PhClipboardText" /> {{ actionLabel('v7backtest.log') }}</button>
        </template>
        <!-- results-view actions (:754-771), visibility per updateArchiveActionVisibility (:8969-8997) -->
        <template v-else>
          <button type="button" class="sb-btn" data-test="archive-back" @click="store.archive.closeArchive()"><PbIcon :icon="PhArchive" /> {{ actionLabel('v7backtest.archives') }}</button>
          <button v-if="store.archive.mode.value === 'backtests'" type="button" class="sb-btn" data-test="archive-rebacktest" @click="store.archive.startRebacktest()"><PbIcon :icon="PhArrowsClockwise" /> {{ actionLabel('v7backtest.backtest') }}</button>
          <button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" class="sb-btn" data-test="archive-rename" @click="archivePanel?.openRename()">{{ t('v7backtest.renameConfig') }}</button>
          <button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" class="sb-btn" data-test="archive-retest" @click="store.archive.startRetestReplace()">{{ t('v7backtest.retestReplace') }}</button>
          <!-- Add to Run (:759) + Balance Calculator (:761) land in M-v7-12 -->
          <button v-if="store.archive.mode.value === 'backtests'" type="button" class="sb-btn" data-test="archive-compare" @click="store.archive.compareSelected()"><PbIcon :icon="PhChartLineUp" /> {{ actionLabel('v7backtest.compare') }}</button>
          <button v-if="store.archive.mode.value === 'backtests'" type="button" class="sb-btn" data-test="archive-score-preview" @click="store.archive.previewScores()">{{ t('v7backtest.scorePreview') }}</button>
          <template v-if="store.archive.mode.value === 'optimize'">
            <button type="button" class="sb-btn" data-test="archive-opt-view" @click="archivePanel?.openViewOptimize()">{{ t('v7backtest.viewConfig') }}</button>
            <button type="button" class="sb-btn" data-test="archive-opt-open" @click="archivePanel?.openOptimizeFromConfig()">{{ t('v7backtest.optimizeFromConfig') }}</button>
            <button type="button" class="sb-btn" data-test="archive-opt-import" @click="archivePanel?.openImportOptimize()">{{ t('v7backtest.importConfig') }}</button>
            <button v-if="store.archive.isOwn.value" type="button" class="sb-btn danger" data-test="archive-opt-delete" @click="archivePanel?.openDeleteOptimize()">{{ t('v7backtest.deleteConfig') }}</button>
          </template>
          <!-- Compact History (:767) — own-only, any mode (:8996) -->
          <button v-if="store.archive.isOwn.value" type="button" class="sb-btn danger" data-test="archive-compact" @click="store.archiveGit.compactHistory()">{{ t('v7backtest.compactHistory') }}</button>
          <button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" class="sb-btn danger" data-test="archive-remove-duplicates" @click="archivePanel?.openCleanup('duplicates')">{{ t('v7backtest.removeDuplicates') }}</button>
          <button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" class="sb-btn danger" data-test="archive-remove-liquidated" @click="archivePanel?.openCleanup('liquidated')">{{ t('v7backtest.removeLiquidated') }}</button>
          <button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" class="sb-btn danger" data-test="archive-delete" @click="archivePanel?.openDeleteResults()"><PbIcon :icon="PhTrash" /> {{ actionLabel('v7backtest.deleteSelected') }}</button>
        </template>
      </template>
      <template v-if="!store.adapter.isV8" #ctx-legacy>
        <!-- legacy actions (:772-778); Add to Run lands in M-v7-12 -->
        <button type="button" class="sb-btn" data-test="legacy-refresh" @click="store.legacy?.loadLegacyResults()"><PbIcon :icon="PhArrowsClockwise" /> {{ t('v7backtest.refresh') }}</button>
        <button type="button" class="sb-btn" data-test="legacy-rebacktest" @click="store.legacy?.startRebacktest(store.editor.openEditor, () => store.selectPanel('configs'))"><PbIcon :icon="PhArrowsClockwise" /> {{ actionLabel('v7backtest.backtest') }}</button>
        <button type="button" class="sb-btn" data-test="legacy-compare" @click="store.legacy?.compareSelected()"><PbIcon :icon="PhChartLineUp" /> {{ actionLabel('v7backtest.compare') }}</button>
        <button type="button" class="sb-btn danger" data-test="legacy-delete" @click="legacyPanel?.openDelete()"><PbIcon :icon="PhTrash" /> {{ actionLabel('v7backtest.deleteSelected') }}</button>
      </template>

      <!-- Editor toolbar (:782-804, setEditorMode :211-222) — replaces the
           panel actions while a config session is open -->
      <template #editor>
        <div v-if="editorOpen" id="editor-toolbar" class="editor-toolbar">
          <span class="tb-title">{{ t('v7backtest.editBacktest') }}</span>
          <div class="editor-nav-group" data-test="editor-nav-group">
            <div class="editor-action-label">{{ t('v7backtest.editorNavigation') }}</div>
            <button type="button" class="sb-btn" data-test="editor-home" :title="t('v7backtest.backToConfigsList')" @click="store.editor.closeEditor()"><PbIcon :icon="PhHouse" /> {{ actionLabel('v7backtest.home') }}</button>
            <button type="button" class="sb-btn" data-test="editor-import" @click="openImport"><PbIcon :icon="PhDownloadSimple" /> {{ actionLabel('v7backtest.import') }}</button>
          </div>
          <div class="editor-analysis-group" data-test="editor-analysis-group">
            <div class="editor-action-label">{{ t('v7backtest.editorAnalysis') }}</div>
            <button type="button" class="sb-btn" data-test="editor-results" :disabled="!editorHasSavedConfig" @click="editorResults"><PbIcon :icon="PhChartBar" /> {{ actionLabel('v7backtest.results') }}</button>
            <button type="button" class="sb-btn" data-test="editor-strategy-explorer" @click="openStrategyExplorer">{{ t('v7backtest.strategyExplorer') }}</button>
            <button type="button" class="sb-btn" data-test="editor-balance-calc" @click="openBalanceCalculator"><PbIcon :icon="PhWallet" /> {{ actionLabel('v7backtest.balanceCalculator') }}</button>
            <button type="button" class="sb-btn" data-test="editor-ohlcv" @click="openOhlcvReadiness"><PbIcon :icon="PhCompassTool" /> {{ actionLabel('v7backtest.ohlcvReadiness') }}</button>
          </div>
          <div class="editor-config-group" data-test="editor-config-group">
            <div class="editor-action-label">{{ t('v7backtest.editorConfigActions') }}</div>
            <button v-if="!store.adapter.isV8" type="button" class="sb-btn" data-test="editor-convert-v8" :disabled="!editorHasSavedConfig" @click="convertEditorToV8">{{ t('v7backtest.convertToV8') }}</button>
            <button type="button" class="sb-btn" data-test="editor-add-run" :disabled="!editorHasSavedConfig" @click="addEditorToRun"><PbIcon :icon="PhPlay" /> {{ actionLabel('v7backtest.addToRun') }}</button>
          </div>
          <div class="editor-save-group" data-test="editor-save-group">
            <div class="editor-action-label">{{ t('v7backtest.editorSaveActions') }}</div>
            <button type="button" class="sb-btn primary" data-test="editor-save" :title="t('v7backtest.saveConfig')" @click="store.editor.save()"><PbIcon :icon="PhFloppyDisk" /> {{ actionLabel('v7backtest.save') }}</button>
            <button type="button" class="sb-btn info" data-test="editor-save-queue" :title="t('v7backtest.saveAndQueueTitle')" @click="store.editor.saveAndQueue()"><PbIcon :icon="PhPlay" /> {{ actionLabel('v7backtest.saveQueue') }}</button>
          </div>
        </div>
      </template>
    </PanelShell>

      <!-- CONFIGS panel (:812-821) -->
      <div id="panel-configs" class="view-panel" :class="{ active: store.view.state.panel === 'configs' }">
        <ConfigsPanel
          v-show="!editorOpen"
          ref="configsPanel"
          :configs="store.configsStore.configs.value"
          :sort="store.view.state.sorts.configs"
          :is-v8="store.adapter.isV8"
          @sort="store.setConfigsSort"
          @edit="store.editor.editConfig"
          @queue="store.addConfigToQueue"
          @view-results="onQueueViewResults"
          @duplicate="store.duplicateConfig"
          @new-config="store.editor.newConfig()"
        />
        <BacktestConfigEditor
          v-if="editorOpen"
          ref="editorPanel"
          :state="store.editor.state"
          :is-v8="store.adapter.isV8"
          :hsl-modes="editorSettings.hslModes"
          :exchange-options="editorSettings.exchangeOptions"
          :suite="store.editor.suite.value"
          :suite-exchanges="editorSettings.exchangeOptions"
          :available-coins="store.editor.coinOptions.value.filter((coin) => coin !== 'all')"
          :bot-params="store.editor.botParams.value"
          :coin-ov="store.editor.coinOv"
          :market-settings="store.editor.marketSettings.value"
          :result-metrics="store.editor.resultMetrics.value"
          :market-coins="store.editor.marketCoins.value"
          :coin-options="store.editor.coinOptions.value"
          :coin-labels="store.editor.coinLabels.value"
          :tag-options="store.editor.tagOptions.value"
          :raw-error-line="store.editor.rawError.value?.line ?? null"
          :long-error-line="store.editor.longErrorLine.value"
          :short-error-line="store.editor.shortErrorLine.value"
          :param-status="store.editor.paramStatus.value"
          :load-symbols="loadSymbols"
          :apply-filters="() => store.editor.applyFilters()"
          :fill-pbgui-data-path="() => store.editor.fillPbguiDataPath()"
          @update:suite="store.editor.suite.value = $event"
          @template-exchanges="onTemplateExchanges"
        />
      </div>

      <QueuePanel
        ref="queuePanel"
        :active="store.view.state.panel === 'queue'"
        :items="store.queueItems.value"
        @start="store.startQueueItem"
        @restart="store.restartQueueItem"
        @stop="store.stopQueueItem"
        @remove="store.removeQueueItem"
        @view-results="onQueueViewResults"
        @show-log="onQueueShowLog"
        @edit-config="onQueueEditConfig"
        @delete="store.deleteQueueItems"
        @nothing-selected="onNothingSelected"
      />

      <!-- RESULTS panel (:834-869) — toolbar + table + compare + charts -->
      <div
        id="panel-results"
        class="view-panel"
        :class="{ active: store.view.state.panel === 'results', unpinned: !resultsPinned }"
      >
        <ResultsPanel
          ref="resultsPanel"
          v-model:pinned="resultsPinned"
          :results="store.results"
          :version-bound-actions="store.results.versionFilter.value !== store.adapter.version"
        />
      </div>

      <!-- ARCHIVE panel (:875-917) — M-v7-11 -->
      <ArchivePanel
        v-if="archiveMounted"
        ref="archivePanel"
        v-model:pinned="archivePinned"
        :archive="store.archive"
        :active="store.view.state.panel === 'archive'"
        :version="store.adapter.version"
      />

      <!-- LEGACY panel (:918-945) — v7 only (adapter drops it on v8, :160-162) -->
      <LegacyPanel
        v-if="!store.adapter.isV8 && legacyMounted"
        ref="legacyPanel"
        v-model:pinned="legacyPinned"
        :legacy="store.legacy!"
        :active="store.view.state.panel === 'legacy'"
      />
      </div>
    </div>
  </AppShell>

  <div id="toast">
    <div v-for="item in store.toasts.value" :key="item.id" class="toast-msg" :class="'toast-' + item.kind">{{ item.msg }}</div>
  </div>

  <QueueDraftModal
    :open="store.editor.queueDraftOpen.value"
    :items="store.editor.queueDraftItems.value"
    :use-pbgui-market-data="store.settingsStore.settings.value.use_pbgui_market_data"
    :post-queue="store.editor.postQueue"
    :get-pbgui-data-path="store.editor.getPbguiDataPath"
    @queued="store.editor.onQueueDraftQueued"
    @close="store.editor.queueDraftOpen.value = false"
    @error="(message: string) => store.notifyError(message)"
  />

  <SettingsModal
    :settings="store.settingsStore.settings.value"
    :open="store.settingsOpen.value"
    :cleaning="store.settingsCleaning.value"
    @save="store.saveSettings"
    @cleanup="store.cleanNow"
    @close="store.settingsOpen.value = false"
  />

  <div v-if="importOpen" id="modal-root" data-test="config-import-modal">
    <div class="modal-box import-config-modal">
      <div class="modal-title">{{ t('v7backtest.importJsonConfig') }}</div>
      <div class="modal-body">
        <div class="form-group">
          <label>{{ t('v7backtest.configName') }}</label>
          <input v-model="importName" type="text" data-test="config-import-name" />
        </div>
        <div class="form-group">
          <label>{{ t('v7backtest.importJson') }}</label>
          <textarea v-model="importJson" rows="18" :placeholder="t('v7backtest.pasteJsonHere')" data-test="config-import-json"></textarea>
        </div>
        <div v-if="importError" class="field-status field-status-inline error" data-test="config-import-error">{{ importError }}</div>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" :disabled="importLoading" @click="importOpen = false">{{ t('common.cancel') }}</button>
        <button type="button" class="modal-btn modal-btn-primary" data-test="config-import-submit" :disabled="importLoading" @click="submitImport">{{ t('v7backtest.importShort') }}</button>
      </div>
    </div>
  </div>

  <div v-if="ohlcvOpen" id="modal-root" data-test="ohlcv-readiness-modal">
    <div class="modal-box ohlcv-readiness-modal">
      <div class="modal-title">{{ t('v7backtest.ohlcvReadinessTitle') }}</div>
      <div class="modal-body">
        <div v-if="ohlcvLoading" class="muted-line">{{ t('editor.preflight.running') }}</div>
        <div v-else-if="ohlcvError" class="field-status field-status-inline error">{{ ohlcvError }}</div>
        <pre v-else class="ohlcv-readiness-json">{{ JSON.stringify(ohlcvData, null, 2) }}</pre>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-btn-primary" data-test="ohlcv-readiness-close" @click="ohlcvOpen = false">{{ t('common.close') }}</button>
      </div>
    </div>
  </div>

  <!-- rebacktestSelected's parameter popup (:7895-7956) -->
  <RebacktestModal
    :open="store.resultsRebacktestOpen.value"
    :defaults="store.resultsRebacktestDefaults.value"
    @confirm="(fields) => { store.resultsRebacktestOpen.value = false; void store.confirmResultsRebacktest(fields); }"
    @close="store.resultsRebacktestOpen.value = false"
    @error="store.notifyError"
  />

  <!-- archive git-maintenance modals (M-v7-12, the M-v7-11 DEFERRED block) -->
  <ArchiveGitModals :git="store.archiveGit" />
  <ArchiveLogPanel ref="archiveLogPanel" />
</template>
