<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  PhArrowRight,
  PhArchive,
  PhArrowsClockwise,
  PhChartBar,
  PhClipboardText,
  PhCompassTool,
  PhCopy,
  PhCube,
  PhDownloadSimple,
  PhFileText,
  PhFolderOpen,
  PhGear,
  PhHourglass,
  PhDna,
  PhPencilSimple,
  PhPlant,
  PhPlus,
  PhQuestion,
  PhTarget,
  PhTrash,
} from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import AppShell from '@/shared/components/AppShell.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import IconButton from '@/shared/components/IconButton.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { currentOptimizeAdapter, readIncomingDraft } from './config';
import ConfigEditorModal from './components/ConfigEditorModal.vue';
import ConfigsPanel from './components/ConfigsPanel.vue';
import ImportConfigModal from './components/ImportConfigModal.vue';
import OhlcvPreflightModal from './components/OhlcvPreflightModal.vue';
import ParetosPanel from './components/ParetosPanel.vue';
import PlotModal from './components/PlotModal.vue';
import QueueLogPanel from './components/QueueLogPanel.vue';
import QueuePanel from './components/QueuePanel.vue';
import ResultsPanel from './components/ResultsPanel.vue';
import SettingsModal from './components/SettingsModal.vue';
import { useOptimizeActions } from './composables/useOptimizeActions';
import { useOptimizePage } from './composables/useOptimizePage';
import type { OptimizePanel } from './config';
import type { ParetoItem, QueueItem, ResultSummary } from './types';
import type { PageSection } from '@/shared/navigation';
import { applyOptimizeSeed, buildEditorDraft, collectEditorConfig, type OptimizeEditorDraft } from './lib/configModel';
import '@/styles/tokens.css';
import '@/styles/base.css';
import './styles/optimize.css';

const { t } = useI18n();
const adapter = currentOptimizeAdapter();

function actionLabel(key: string): string {
  return t(key).replace(/^[^\p{L}\p{N}]+/u, '');
}
const toast = ref<{ message: string; kind: 'info' | 'success' | 'error' } | null>(null);
const duplicateSource = ref('');
const duplicateName = ref('');
const importOpen = ref(false);
const logOpen = ref(false);
const logFilename = ref('');
const logTitle = ref('');
const preflightOpen = ref(false);
const preflightLoading = ref(false);
const preflightData = ref<Record<string, unknown>>({});
const preflightJob = ref<Record<string, unknown> | null>(null);
const preflightConfig = ref<Record<string, unknown> | null>(null);
const preflightError = ref('');
const pbguiDataPath = ref('');
const confirmAction = ref<{ title: string; message: string; run: () => Promise<void> } | null>(null);
let toastTimer: number | undefined;
let liveRefreshTimer: number | undefined;
let preflightPollTimer: number | undefined;
let liveRefreshInFlight = false;

function openOptimizeHelp(): void {
  (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER?.();
}

function notify(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  toast.value = { message, kind };
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.value = null; }, 4000);
}

function detail(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function hasActiveRuns(): boolean { return page.queue.value.some((item) => item.status === 'running' || item.status === 'optimizing'); }
async function refreshLiveResults(force = false): Promise<void> {
  if (liveRefreshInFlight || (!force && !hasActiveRuns()) || (page.panel.value !== 'results' && page.panel.value !== 'paretos')) return;
  liveRefreshInFlight = true;
  try {
    await page.loadResults();
    if (page.panel.value === 'paretos' && page.selectedResultPath.value) await page.loadParetos();
  } finally {
    liveRefreshInFlight = false;
  }
}
function handlePageShow(): void { void refreshLiveResults(true); }
function handleVisibilityChange(): void { if (document.visibilityState === 'visible') void refreshLiveResults(true); }
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (page.editorOpen.value) { page.closeEditor(); return; }
  if (importOpen.value) { importOpen.value = false; return; }
  if (page.settingsOpen.value) { page.settingsOpen.value = false; return; }
  if (page.queueConfigChoice.value) { page.closeQueueConfigChoice(); return; }
  if (preflightOpen.value) { closePreflight(); return; }
  if (duplicateSource.value) { duplicateSource.value = ''; return; }
  if (confirmAction.value) { confirmAction.value = null; return; }
  if (logOpen.value) { logOpen.value = false; return; }
  if (actions.plot.value.open) { void actions.closePlot(); }
}
async function safely(action: () => Promise<void>): Promise<void> { try { await action(); } catch (error) { notify(detail(error), 'error'); } }

const page = useOptimizePage({ adapter, notify, search: window.location.search });
const actions = useOptimizeActions({ adapter, notify });
const panelTitle = computed(() => page.panel.value === 'queue' ? t('v7optimize.panelQueueTitle') : page.panel.value === 'results' ? t('v7optimize.panelResultsTitle') : page.panel.value === 'paretos' ? t('v7optimize.panelParetosTitle') : t('v7optimize.panelConfigsTitle'));
const panelSubtitle = computed(() => page.panel.value === 'queue' ? t('v7optimize.panelQueueSubtitle') : page.panel.value === 'results' ? t('v7optimize.panelResultsSubtitle') : page.panel.value === 'paretos' ? t('v7optimize.panelParetosSubtitle') : t('v7optimize.panelConfigsSubtitle'));
const selectedResult = computed(() => {
  if (page.panel.value === 'results' && page.selectedResults.value.size !== 1) return null;
  const path = [...page.selectedResults.value][0] || page.selectedResultPath.value;
  return page.results.value.find((row) => row.path === path) || null;
});
const selectedResultCapabilities = computed(() => {
  const row = selectedResult.value;
  if (!row) return { hasPareto: false, hasConfig: false, supports3d: false, supportsDash: false, resumable: false };
  const hasPareto = adapter.isV8 ? row.has_pareto === true : Number(row.pareto_count || 0) > 0;
  return {
    hasPareto,
    hasConfig: adapter.isV8 ? row.has_config === true : true,
    supports3d: adapter.isV8 ? row.supports_3d === true : hasPareto,
    supportsDash: adapter.isV8 ? row.supports_dash === true : hasPareto,
    resumable: adapter.isV8 && row.resumable === true,
  };
});

function toggle(kind: 'configs' | 'queue' | 'results' | 'paretos', key: string): void { page.toggleSelection(kind, key); }

/* Converged navigation: the four panels are rail sections under the active
   Optimize page item; non-zero counts ride along as section badges. */
const railSections = computed<PageSection[]>(() => [
  { key: 'configs', label: t('v7optimize.navConfigs'), badge: page.configs.value.length ? String(page.configs.value.length) : undefined },
  { key: 'queue', label: t('v7optimize.navQueue'), badge: page.queue.value.length ? String(page.queue.value.length) : undefined },
  { key: 'results', label: t('v7optimize.navResults'), badge: page.results.value.length ? String(page.results.value.length) : undefined },
  { key: 'paretos', label: t('v7optimize.navParetos'), badge: page.paretos.value.length ? String(page.paretos.value.length) : undefined },
]);
function onRailSection(key: string): void { page.setPanel(key as OptimizePanel); }

function visibleKeys(kind: 'configs' | 'queue' | 'results' | 'paretos'): string[] {
  return kind === 'configs'
    ? page.filteredConfigs.value.map((row) => String(row.name || ''))
    : kind === 'queue'
      ? page.filteredQueue.value.map((row) => String(row.filename || ''))
      : kind === 'results'
        ? page.filteredResults.value.map((row) => String(row.path || ''))
        : page.filteredParetos.value.map((row) => String(row.path || ''));
}
function clearVisible(kind: 'configs' | 'queue' | 'results' | 'paretos'): void { page.clearSelection(kind, visibleKeys(kind).filter(Boolean)); }

function selectVisible(kind: 'configs' | 'queue' | 'results' | 'paretos'): void {
  page.selectAll(kind, visibleKeys(kind).filter(Boolean));
}

async function migratePareto(row: ParetoItem): Promise<void> {
  if (adapter.isV8) return;
  await safely(async () => {
    const target = `${String(row.name || 'pareto').trim()}_v8`.slice(0, 120);
    const migrated = await actions.migrateV7({ path: row.path }, target);
    window.location.href = `${window.location.origin}/api/optimize-v8/main_page?open_config=${encodeURIComponent(migrated)}`;
  });
}

async function backtestSelectedParetos(): Promise<void> {
  const items = page.paretos.value
    .filter((row) => page.selectedParetos.value.has(row.path))
    .map((row) => ({ path: row.path, name: row.name }));
  if (!items.length) return notify(t('v7optimize.noParetosSelected'));
  window.location.href = await actions.backtestParetos(items);
}

function sortPanel(kind: 'configs' | 'queue' | 'results' | 'paretos', key: string): void {
  const sort = kind === 'configs' ? page.configSort : kind === 'queue' ? page.queueSort : kind === 'results' ? page.resultSort : page.paretoSort;
  sort.value = sort.value.key === key ? { key, direction: sort.value.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' };
}

function askDeleteConfigs(): void {
  if (!page.selectedConfigs.value.size) return notify(t('v7optimize.selectAtLeastOneConfigToDelete'));
  confirmAction.value = { title: t('v7optimize.deleteConfigs'), message: t('v7optimize.deleteSelectedConfigsMsg'), run: () => page.deleteConfigs() };
}
function askDeleteQueue(): void {
  if (!page.selectedQueue.value.size) return notify(t('v7optimize.selectAtLeastOneQueueItemToDelete'));
  confirmAction.value = { title: t('v7optimize.deleteQueueItems'), message: t('v7optimize.deleteSelectedQueueItemsMsg'), run: () => page.deleteQueueItems() };
}
function askDeleteResults(): void {
  if (!page.selectedResults.value.size) return notify(t('v7optimize.selectAtLeastOneResultToDelete'));
  confirmAction.value = { title: t('v7optimize.deleteOptimizeResults'), message: t('v7optimize.deleteResultsMsg'), run: () => page.deleteResults() };
}
async function acceptConfirm(): Promise<void> {
  const action = confirmAction.value; confirmAction.value = null;
  if (action) await safely(action.run);
}

function openDuplicate(name: string): void { duplicateSource.value = name; duplicateName.value = `${name}_copy`; }
async function duplicate(): Promise<void> {
  const source = duplicateSource.value; const name = duplicateName.value.trim(); duplicateSource.value = '';
  if (source && name) await safely(() => page.duplicateConfig(source, name));
}
async function queueSelected(): Promise<void> {
  if (!page.selectedConfigs.value.size) return notify(t('v7optimize.selectAtLeastOneConfigToQueue'));
  await safely(() => page.queueConfigs());
}
async function archiveSelected(): Promise<void> {
  if (!page.selectedConfigs.value.size) return notify(t('v7optimize.selectAtLeastOneConfigToArchive'));
  await safely(() => actions.archiveSelected([...page.selectedConfigs.value]));
}
async function migrateSelected(): Promise<void> {
  const name = [...page.selectedConfigs.value][0];
  if (!name) return notify(t('v7optimize.selectOneConfigToEdit'));
  const target = `${name}_v8`.slice(0, 120);
  await safely(async () => {
    const migrated = await actions.migrateV7({ name }, target);
    window.location.href = `${window.location.origin}/api/optimize-v8/main_page?open_config=${encodeURIComponent(migrated)}`;
  });
}

async function runQueueAction(filename: string, action: 'start' | 'stop' | 'restart' | 'requeue'): Promise<void> { await safely(() => page.queueAction(filename, action)); }
function openQueueLog(row: QueueItem): void { logFilename.value = row.filename; logTitle.value = String(row.name || row.filename); logOpen.value = true; }

async function openResult(row: ResultSummary | null): Promise<void> { if (row) await safely(() => page.selectResult(row)); else notify(t('v7optimize.selectOneResultFirst')); }
async function resultAction(row: ResultSummary, action: 'config' | 'explorer' | 'plot3d' | 'dash' | 'continue' | 'resume'): Promise<void> {
  await safely(async () => {
    if (action === 'config') { await page.openResultConfig(row.path, String(row.name || row.result || '')); return; }
    if (action === 'explorer') { window.location.href = actions.paretoExplorerUrl(row.path); return; }
    if (action === 'plot3d') { await actions.launch3d(row); return; }
    if (action === 'dash') { await actions.launchParetoDash(row); return; }
    if (action === 'resume') { await actions.resumeResult(row.path, String(row.name || row.result || 'checkpoint')); await page.loadQueue(); page.setPanel('queue'); return; }
    const seeded = await actions.seedWholeResult(row.path, String(row.name || row.result || 'continued_optimize'));
    page.openEditorPayload({ config: seeded, override_configs: seeded.override_configs as Record<string, unknown> }, String(seeded.name || ''), '', '', 'results');
  });
}
async function runSelectedResult(action: 'config' | 'plot3d' | 'dash' | 'continue' | 'resume'): Promise<void> {
  if (!selectedResult.value) return notify(t('v7optimize.selectOneResultFirst'));
  await resultAction(selectedResult.value, action);
}
function openParetoExplorer(row: ResultSummary | null = selectedResult.value): void {
  if (!row) return notify(t('v7optimize.selectOptimizeResultFirst'));
  window.location.href = actions.paretoExplorerUrl(row.path);
}

async function updateParetoFilter(kind: 'scenario' | 'statistic', value: string): Promise<void> {
  page.paretoMeta.value = { ...page.paretoMeta.value, [kind === 'scenario' ? 'selected_scenario' : 'selected_statistic']: value };
  await safely(() => page.loadParetos());
}
async function viewPareto(row: ParetoItem): Promise<void> {
  await safely(async () => {
    const data = await actions.paretoFile(row.path);
    actions.plot.value = { open: true, kind: 'text', title: `${t('v7optimize.paretoJson')} — ${row.name}`, html: '', url: '', text: JSON.stringify(data, null, 2), sessionId: '' };
  });
}
async function seedParetos(paths: string[], suggestedName = ''): Promise<void> {
  if (!page.selectedResultPath.value) return notify(t('v7optimize.noResultSelectedError'));
  await safely(async () => {
    const seeded = await actions.seedParetos(page.selectedResultPath.value, paths, suggestedName || page.selectedResultName.value);
    page.openEditorPayload({ config: seeded, override_configs: seeded.override_configs as Record<string, unknown> }, String(seeded.name || ''), '', '', 'paretos');
  });
}
async function seedPareto(row: ParetoItem): Promise<void> { await seedParetos([row.path], row.name); }
async function seedSelectedParetos(): Promise<void> {
  if (!page.selectedParetos.value.size) return notify(t('v7optimize.noParetosSelected'));
  await seedParetos([...page.selectedParetos.value]);
}

async function saveEditor(draft: OptimizeEditorDraft, queueAfterSave: boolean): Promise<void> { await page.saveEditor(queueAfterSave, draft); }
async function importLocal(config: Record<string, unknown>, name: string): Promise<void> {
  await safely(async () => {
    const payload = await actions.prepareImport(config, name);
    importOpen.value = false;
    page.openEditorPayload(payload, payload.name, '');
  });
}
async function importArchive(archive: string, path: string, name: string, collision: 'error' | 'copy' | 'overwrite'): Promise<void> {
  await safely(async () => {
    const imported = await actions.importArchiveConfig(archive, path, name, collision);
    importOpen.value = false;
    await page.loadConfigs();
    await page.openEditor(imported);
  });
}

function stopPreflightPolling(): void {
  if (preflightPollTimer !== undefined) window.clearTimeout(preflightPollTimer);
  preflightPollTimer = undefined;
}
function closePreflight(): void {
  stopPreflightPolling();
  preflightOpen.value = false;
}
async function refreshPreflightData(): Promise<void> {
  if (!preflightConfig.value) return;
  preflightLoading.value = true;
  preflightError.value = '';
  try { preflightData.value = await actions.ohlcvPreflight(preflightConfig.value); }
  catch (error) { preflightError.value = detail(error); }
  finally { preflightLoading.value = false; }
}
async function runPreflight(submittedDraft: OptimizeEditorDraft | null = page.editorDraft.value): Promise<void> {
  if (!submittedDraft) return;
  preflightOpen.value = true;
  preflightJob.value = null;
  stopPreflightPolling();
  try { preflightConfig.value = collectEditorConfig(submittedDraft, adapter.version); }
  catch (error) { preflightError.value = detail(error); return; }
  await refreshPreflightData();
}
function schedulePreflightPoll(): void {
  stopPreflightPolling();
  if (!preflightOpen.value || !preflightJob.value?.job_id) return;
  preflightPollTimer = window.setTimeout(() => { void refreshPreloadJob(); }, 1500);
}
async function refreshPreloadJob(): Promise<void> {
  const jobId = String(preflightJob.value?.job_id || '');
  if (!jobId) return;
  try {
    preflightJob.value = await actions.loadOhlcvPreload(jobId);
    const status = String(preflightJob.value.status || '');
    if (status === 'queued' || status === 'running' || status === 'stopped') schedulePreflightPoll();
    else await refreshPreflightData();
  } catch (error) { preflightError.value = detail(error); }
}
async function startPreload(): Promise<void> {
  if (!preflightConfig.value) return;
  preflightError.value = '';
  try {
    preflightJob.value = await actions.startOhlcvPreload(preflightConfig.value);
    schedulePreflightPoll();
  } catch (error) { preflightError.value = detail(error); }
}
async function stopPreload(): Promise<void> {
  const jobId = String(preflightJob.value?.job_id || '');
  if (!jobId) return;
  preflightError.value = '';
  try {
    preflightJob.value = await actions.stopOhlcvPreload(jobId);
    schedulePreflightPoll();
  } catch (error) { preflightError.value = detail(error); }
}

async function handleIncomingDraft(): Promise<void> {
  const incoming = readIncomingDraft(window.location.search);
  if (!incoming) return;
  await safely(async () => {
    const payload = await actions.loadIncomingDraft(incoming.id, incoming.name);
    const seededConfig = applyOptimizeSeed(payload.config, 'self');
    page.openEditorPayload({ ...payload, config: seededConfig }, incoming.name || payload.name, '');
    notify(t('v7optimize.loadedBacktestResultWithSelfSeeds'), 'success');
    const url = new URL(window.location.href);
    url.searchParams.delete('opt_draft_id');
    url.searchParams.delete('draft_name');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  });
}

onMounted(async () => {
  document.title = t('editor.optimize.pageTitle');
  window.PBGUI_HELP_OPENER = () => (window as Window & { PBGuiSharedHelp?: { open?: (topic: string) => void } }).PBGuiSharedHelp?.open?.('optimize');
  await page.loadAll();
  await handleIncomingDraft();
  try { pbguiDataPath.value = await actions.pbguiDataPath(); } catch { pbguiDataPath.value = ''; }
  page.connect();
  liveRefreshTimer = window.setInterval(() => { void refreshLiveResults(); }, 3000);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('keydown', handleKeydown);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onBeforeUnmount(() => {
  if (liveRefreshTimer !== undefined) window.clearInterval(liveRefreshTimer);
  stopPreflightPolling();
  window.removeEventListener('pageshow', handlePageShow);
  window.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<template>
  <AppShell
    class="core-workbench-shell core-workbench-shell--optimize"
    :page-key="adapter.navCurrent"
    :page-title="t('editor.optimize.pageTitle')"
    :page-family="adapter.label"
    :status-text="page.connected.value ? t('v7optimize.connected') : t('v7optimize.connectingToQueue')"
    :status-tone="page.connected.value ? 'success' : 'warning'"
    :sections="railSections"
    :active-section="page.panel.value"
    @update:section="onRailSection"
  >
    <template #header-actions>
      <IconButton
        class="pbgui-icon-button"
        :icon="PhQuestion"
        :label="t('nav.guide')"
        @click="openOptimizeHelp"
      />
    </template>

    <div id="opt-conn-banner" :class="page.connected.value ? 'connected' : 'disconnected'">{{ page.connected.value ? t('v7optimize.connected') : t('v7optimize.connectingToQueue') }}</div>
    <div id="page-body">
    <div class="workbench-page-content">
    <!-- Converged navigation: panel switching lives in the workbench rail
         (AppShell sections); this strip carries only the active panel's
         contextual actions. -->
    <div class="page-toolbar" role="toolbar">
      <template v-if="page.panel.value === 'configs'">
        <button class="sb-btn primary" @click="page.openEditor()"><PbIcon :icon="PhPlus" /> {{ actionLabel('v7optimize.newConfig') }}</button>
        <button class="sb-btn" @click="importOpen = true"><PbIcon :icon="PhDownloadSimple" /> {{ actionLabel('v7optimize.importConfig') }}</button>
        <button class="sb-btn" :disabled="page.selectedConfigs.value.size !== 1" @click="page.openEditor([...page.selectedConfigs.value][0])"><PbIcon :icon="PhPencilSimple" /> {{ actionLabel('v7optimize.editSelected') }}</button>
        <button class="sb-btn" data-test="duplicate-selected" :disabled="page.selectedConfigs.value.size !== 1" @click="openDuplicate([...page.selectedConfigs.value][0] || '')"><PbIcon :icon="PhCopy" /> {{ actionLabel('v7optimize.duplicate') }}</button>
        <button class="sb-btn" :disabled="!page.selectedConfigs.value.size" @click="queueSelected"><PbIcon :icon="PhArrowRight" /> {{ actionLabel('v7optimize.queueSelected') }}</button>
        <button class="sb-btn" :disabled="!page.selectedConfigs.value.size" @click="archiveSelected"><PbIcon :icon="PhArchive" /> {{ actionLabel('v7optimize.addToArchive') }}</button>
        <button v-if="!adapter.isV8" class="sb-btn" :disabled="page.selectedConfigs.value.size !== 1" @click="migrateSelected"><PbIcon :icon="PhArrowRight" /> {{ actionLabel('v7optimize.convertToPb8Optimize') }}</button>
        <button class="sb-btn danger" :disabled="!page.selectedConfigs.value.size" @click="askDeleteConfigs"><PbIcon :icon="PhTrash" /> {{ actionLabel('v7optimize.deleteSelected') }}</button>
      </template>
      <template v-else-if="page.panel.value === 'queue'">
        <button class="sb-btn danger" :disabled="!page.selectedQueue.value.size" @click="askDeleteQueue"><PbIcon :icon="PhTrash" /> {{ actionLabel('v7optimize.deleteSelected') }}</button>
        <button class="sb-btn" @click="page.settingsOpen.value = true"><PbIcon :icon="PhGear" /> {{ actionLabel('v7optimize.settings') }}</button>
      </template>
      <template v-else-if="page.panel.value === 'results'">
        <button class="sb-btn" data-test="result-paretos" :disabled="!selectedResultCapabilities.hasPareto" @click="openResult(selectedResult)"><PbIcon :icon="PhChartBar" /> {{ actionLabel('v7optimize.paretos') }}</button>
        <button class="sb-btn" :disabled="!selectedResultCapabilities.hasPareto" @click="openParetoExplorer()"><PbIcon :icon="PhTarget" /> {{ actionLabel('v7optimize.paretoExplorer') }}</button>
        <button class="sb-btn" data-test="result-dash" :disabled="!selectedResultCapabilities.supportsDash" @click="runSelectedResult('dash')"><PbIcon :icon="PhChartBar" /> {{ t('v7optimize.pdParetoDash') }}</button>
        <button class="sb-btn" :disabled="!selectedResultCapabilities.supports3d" @click="runSelectedResult('plot3d')"><PbIcon :icon="PhCube" /> {{ t('v7optimize.plot3d') }}</button>
        <button class="sb-btn" :disabled="!selectedResultCapabilities.hasPareto" @click="runSelectedResult('continue')"><PbIcon :icon="PhPlant" /> {{ actionLabel('v7optimize.continueOptimize') }}</button>
        <button v-if="adapter.isV8" class="sb-btn" :disabled="!selectedResultCapabilities.resumable" @click="runSelectedResult('resume')"><PbIcon :icon="PhArrowsClockwise" /> {{ actionLabel('v7optimize.resumeCheckpoint') }}</button>
        <button class="sb-btn" data-test="result-config" :disabled="!selectedResultCapabilities.hasConfig" @click="runSelectedResult('config')"><PbIcon :icon="PhFileText" /> {{ actionLabel('v7optimize.configDraft') }}</button>
        <button class="sb-btn danger" :disabled="!page.selectedResults.value.size" @click="askDeleteResults"><PbIcon :icon="PhTrash" /> {{ actionLabel('v7optimize.deleteSelected') }}</button>
      </template>
      <template v-else>
        <button class="sb-btn" :disabled="!page.selectedResultPath.value" @click="openParetoExplorer()"><PbIcon :icon="PhTarget" /> {{ actionLabel('v7optimize.paretoExplorer') }}</button>
        <button class="sb-btn" data-test="backtest-paretos" :disabled="!page.selectedParetos.value.size" @click="safely(backtestSelectedParetos)"><PbIcon :icon="PhArrowsClockwise" /> {{ actionLabel('v7optimize.backtest') }}</button>
        <button class="sb-btn" :disabled="!page.selectedParetos.value.size" @click="seedSelectedParetos"><PbIcon :icon="PhDna" /> {{ actionLabel('v7optimize.seedSelected') }}</button>
        <button class="sb-btn" :disabled="!page.selectedResultPath.value" @click="runSelectedResult('continue')"><PbIcon :icon="PhFolderOpen" /> {{ actionLabel('v7optimize.seedWholeResult') }}</button>
      </template>
      <hr v-if="page.editorOpen.value" class="sb-sep" />
      <button v-if="page.editorOpen.value" class="sb-btn" @click="runPreflight()"><PbIcon :icon="PhCompassTool" /> {{ actionLabel('v7optimize.ohlcvReadiness') }}</button>
    </div>

      <div v-if="page.runtimeWarning.value" class="opt-runtime-warning" data-test="pb8-runtime-warning" role="status" aria-live="polite">
        <strong>{{ t('v7optimize.pb8UpdateRequired') }}</strong>
        <span>{{ page.runtimeWarning.value }}</span>
        <a href="/api/vps-manager/main_page">{{ t('v7optimize.openVpsManagerUpdatePb8') }}</a>
      </div>
      <ErrorState
        v-if="page.error.value"
        class="opt-error opt-error-banner"
        :title="t('common.error')"
        :message="page.error.value"
        :retry-label="t('common.refresh')"
        @retry="page.loadAll"
      />
      <LoadingSkeleton v-if="page.loading.value" class="opt-loading" :label="t('common.loading')" />
      <template v-else>
        <section v-if="page.panel.value === 'configs'" class="opt-panel-wrap"><header class="opt-panel-head"><div><h1>{{ panelTitle }}</h1><p>{{ panelSubtitle }}</p></div></header><ConfigsPanel :is-v8="adapter.isV8" :rows="page.filteredConfigs.value" :selected="page.selectedConfigs.value" :search="page.configSearch.value" @update:search="page.configSearch.value = $event" @toggle="(name) => toggle('configs', name)" @edit="page.openEditor" @duplicate="openDuplicate" @sort="(key: string) => sortPanel('configs', key)" @select-all="selectVisible('configs')" @clear-selection="clearVisible('configs')" @select-range="(paths, selected) => page.setSelection('configs', paths, selected)" /></section>
        <section v-else-if="page.panel.value === 'queue'" class="opt-panel-wrap"><header class="opt-panel-head"><div><h1>{{ panelTitle }}</h1><p>{{ panelSubtitle }}</p></div></header><QueuePanel :rows="page.filteredQueue.value" :selected="page.selectedQueue.value" :search="page.configSearch.value" @update:search="page.configSearch.value = $event" @toggle="(filename) => toggle('queue', filename)" @action="runQueueAction" @edit="page.openQueueConfig" @log="openQueueLog" @move="(filename, delta) => safely(() => page.moveQueue(filename, delta))" @sort="(key: string) => sortPanel('queue', key)" @select-all="selectVisible('queue')" @clear-selection="clearVisible('queue')" @select-range="(paths, selected) => page.setSelection('queue', paths, selected)" @reorder="(filenames) => safely(() => page.reorderQueue(filenames))" /></section>
        <section v-else-if="page.panel.value === 'results'" class="opt-panel-wrap"><header class="opt-panel-head"><div><h1>{{ panelTitle }}</h1><p>{{ panelSubtitle }}</p></div></header><ResultsPanel :rows="page.filteredResults.value" :selected="page.selectedResults.value" :selected-path="page.selectedResultPath.value" :is-v8="adapter.isV8" :search="page.resultSearch.value" @update:search="page.resultSearch.value = $event" @toggle="(path) => toggle('results', path)" @open="openResult" @action="resultAction" @sort="(key: string) => sortPanel('results', key)" @select-all="selectVisible('results')" @clear-selection="clearVisible('results')" @select-range="(paths, selected) => page.setSelection('results', paths, selected)" /></section>
        <section v-else class="opt-panel-wrap"><header class="opt-panel-head"><div><h1>{{ panelTitle }}</h1><p>{{ panelSubtitle }}</p></div></header><ParetosPanel :rows="page.filteredParetos.value" :meta="page.paretoMeta.value" :result-name="page.selectedResultName.value" :selected="page.selectedParetos.value" :is-v8="adapter.isV8" @toggle="(path) => toggle('paretos', path)" @view="viewPareto" @seed="seedPareto" @migrate="migratePareto" @update:scenario="updateParetoFilter('scenario', $event)" @update:statistic="updateParetoFilter('statistic', $event)" @sort="(key: string) => sortPanel('paretos', key)" @select-all="selectVisible('paretos')" @clear-selection="clearVisible('paretos')" @select-range="(paths, selected) => page.setSelection('paretos', paths, selected)" /></section>
      </template>
    </div>
  </div>
  </AppShell>

  <ConfigEditorModal :open="page.editorOpen.value" :draft="page.editorDraft.value" :version="adapter.version" :error="page.editorError.value" :param-status="page.editorParamStatus.value" :limits-meta="page.settings.value.limitsMeta" :exchange-options="(page.settings.value.exchange_options as string[] | undefined) || []" :bot-params="(page.settings.value.bot_params as string[] | undefined) || []" :hsl-modes="(page.settings.value.hsl_signal_modes as string[] | undefined) || []" :backend-options="(page.settings.value.optimize_backend_options as string[] | undefined) || []" :optimize-defaults="(page.settings.value.optimize_defaults as Record<string, unknown> | undefined) || {}" :pymoo-algorithm-options="(page.settings.value.pymoo_algorithm_options as string[] | undefined) || []" :pymoo-ref-dir-method-options="(page.settings.value.pymoo_ref_dir_method_options as string[] | undefined) || []" :strategy-options="(page.settings.value.strategies as string[] | undefined) || []" :pbgui-data-path="pbguiDataPath" :load-symbols="actions.loadSymbols" @close="page.closeEditor" @save="saveEditor" @preflight="runPreflight" />
  <SettingsModal :open="page.settingsOpen.value" :settings="page.settings.value" @close="page.settingsOpen.value = false" @save="page.saveSettings" />
  <ImportConfigModal :open="importOpen" :archives="actions.archives.value" :configs="actions.archiveConfigs.value" :archive-name="actions.archiveName.value" :busy="actions.busy.value" @close="importOpen = false" @load-archives="actions.loadArchives" @load-configs="actions.loadArchiveConfigs" @local-import="importLocal" @archive-import="importArchive" />
  <PlotModal :plot="actions.plot.value" @close="actions.closePlot" />
  <QueueLogPanel :open="logOpen" :filename="logFilename" :title="logTitle" :adapter="adapter" @close="logOpen = false" />

  <div v-if="page.queueConfigChoice.value" class="opt-modal-backdrop">
    <section class="opt-modal opt-modal-small" role="dialog" aria-modal="true">
      <header class="opt-modal-head"><h2>{{ t('v7optimize.repairQueuedConfig') }}</h2><button class="opt-btn" @click="page.closeQueueConfigChoice">{{ t('common.close') }}</button></header>
      <div class="opt-modal-body">
        <p>{{ page.queueConfigChoice.value.message || t('v7optimize.queueConfigPathMissing') }}</p>
        <code class="opt-path-block">{{ page.queueConfigChoice.value.configPath }}</code>
        <p class="opt-muted">{{ t('v7optimize.queueConfigRepairNote') }}</p>
        <div class="opt-choice-list">
          <div v-for="candidate in page.queueConfigChoice.value.candidates" :key="candidate.path" class="opt-choice-row">
            <div><strong>{{ candidate.name }}</strong><small>{{ candidate.path }}</small></div>
            <div class="opt-actions"><button class="opt-btn small primary" @click="safely(() => page.repairQueueConfigCandidate(candidate.name))">{{ page.queueConfigChoice.value.intent === 'edit' ? t('v7optimize.useAndOpen') : t('v7optimize.useAndRepair') }}</button><button class="opt-btn small" @click="safely(() => page.openQueueConfigCandidate(candidate.name))">{{ t('v7optimize.open') }}</button></div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <OhlcvPreflightModal :open="preflightOpen" :loading="preflightLoading" :error="preflightError" :payload="preflightData" :job="preflightJob" @close="closePreflight" @refresh="refreshPreflightData" @preload="startPreload" @stop="stopPreload" />
  <div v-if="duplicateSource" class="opt-modal-backdrop"><section class="opt-modal opt-modal-small" role="dialog" aria-modal="true"><header class="opt-modal-head"><h2>{{ t('v7optimize.duplicateConfig') }}</h2><button class="opt-btn" @click="duplicateSource = ''">{{ t('common.close') }}</button></header><div class="opt-modal-body"><label class="opt-form-label">{{ t('v7optimize.duplicateConfigAs') }}<input v-model="duplicateName" class="opt-input" /></label></div><footer class="opt-modal-actions"><button class="opt-btn" @click="duplicateSource = ''">{{ t('common.cancel') }}</button><button class="opt-btn primary" @click="duplicate">{{ t('common.save') }}</button></footer></section></div>
  <div v-if="confirmAction" class="opt-modal-backdrop"><section class="opt-modal opt-modal-small" role="dialog" aria-modal="true"><header class="opt-modal-head"><h2>{{ confirmAction.title }}</h2></header><div class="opt-modal-body"><p>{{ confirmAction.message }}</p></div><footer class="opt-modal-actions"><button class="opt-btn" @click="confirmAction = null">{{ t('common.cancel') }}</button><button class="opt-btn danger" @click="acceptConfirm">{{ t('common.confirm') }}</button></footer></section></div>
  <div v-if="toast" class="opt-toast" :class="`opt-toast-${toast.kind}`">{{ toast.message }}</div>
</template>
