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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import ConnectionNotice from '@/shared/components/ConnectionNotice.vue';
import DataTipTooltip from '@/shared/components/DataTipTooltip.vue';
import IconButton from '@/shared/components/IconButton.vue';
import JsonViewer from '@/shared/components/JsonViewer.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
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
import { modalBackdropClass, modalBoxClass } from './lib/uiClasses';
import type { PageSection } from '@/shared/navigation';
import { aiFocusedField, useAiPageContext } from '@/shared/ai/context';
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
  const topic = store.adapter.isV8 ? '42_pbv8_backtest' : '35_pbv7_backtest';
  window.location.href = `/api/help/main_page?topic=${encodeURIComponent(topic)}`;
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

const hasPendingOwnArchiveChanges = computed(() => {
  const ownArchive = store.archive.archives.value.find((archive) => archive?.is_own);
  const migrationStatus = ownArchive?.migration_status;
  if (!migrationStatus || typeof migrationStatus !== 'object') return false;
  const gitStatus = (migrationStatus as { git?: unknown }).git;
  return !!gitStatus && typeof gitStatus === 'object' && (gitStatus as { dirty?: unknown }).dirty === true;
});

const bannerClass = computed(() => 'conn-' + store.banner.value);
const bannerText = computed(() =>
  store.banner.value === 'ok' ? t('v7backtest.connected') : store.banner.value === 'lost' ? t('v7backtest.connectionLost') : t('v7backtest.connecting')
);
/* Toast tone (the former .toast-ok/.toast-err/.toast-info rules). */
function toastToneClass(kind: string): string {
  if (kind === 'ok') return 'bg-success text-accent-contrast';
  if (kind === 'err') return 'bg-danger text-accent-contrast';
  return 'bg-accent text-accent-contrast';
}
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
/** The editor command bar belongs only to the configuration workbench. */
const editorToolbarOpen = computed(() => editorOpen.value && store.view.state.panel === 'configs');

/* AI drawer page context — Vue port of the legacy backtest registration
   (panel section, editing config / open archive entities, filter focus;
   v1.99.2 adds the queue selection plus running queue items as
   backtest_queue_item entities). The legacy show_log page action lands
   with the M-v7-10 queue log surface (onQueueShowLog is still a stub). */
useAiPageContext({
  id: 'backtest',
  getContext: () => {
    const entities: Array<{ kind: string; version?: string; name: string }> = [];
    const editing = store.editor.editingName.value;
    if (editing && editing !== '__new__') {
      entities.push({ kind: 'backtest_config', version: store.adapter.version, name: editing });
    }
    if (store.view.state.panel === 'archive' && store.archive.selectedName.value) {
      entities.push({ kind: 'backtest_archive', version: store.adapter.version, name: store.archive.selectedName.value });
    }
    if (store.view.state.panel === 'queue') {
      for (const filename of (queuePanel.value?.selectedFilenames() ?? []).slice(0, 8)) {
        if (store.queueItems.value.some((item) => item.filename === filename)) {
          entities.push({ kind: 'backtest_queue_item', version: store.adapter.version, name: filename });
        }
      }
    }
    if (entities.length < 8) {
      for (const item of store.queueItems.value
        .filter((entry) => entry.status === 'running' || entry.status === 'backtesting')
        .slice(0, 8 - entities.length)) {
        const name = String(item.filename);
        if (!entities.some((entity) => entity.kind === 'backtest_queue_item' && entity.name === name)) {
          entities.push({ kind: 'backtest_queue_item', version: store.adapter.version, name });
        }
      }
    }
    return {
      section: store.view.state.panel,
      entities,
      focused_field: aiFocusedField({
        'configs-filter': { path: 'backtest.configs.filter', label: 'Config Filter' },
        'results-filter': { path: 'backtest.results.filter', label: 'Result Filter' },
        'cfg-name': { path: 'backtest.config.name', label: 'Config name' },
      }),
    };
  },
});
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
const AI_BACKTEST_COMPARE_STORAGE_KEY = 'pbgui:ai:backtest_compare:v1';
const AI_BACKTEST_COMPARE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
interface AiQueueCompareRequest {
  version: 'v8';
  proposal_id: string;
  filenames: string[];
  created_at: number;
}
const aiQueueCompareRequest = ref<AiQueueCompareRequest | null>(null);
let aiQueueCompareOpening = false;
let aiQueueCompareRetryCount = 0;
let aiQueueCompareRetryTimer: number | undefined;
/** The archive/legacy panels mount once their panel is first visited. */
const archiveMounted = computed(() => store.view.state.panel === 'archive' || store.archive.archives.value.length > 0);
const legacyMounted = computed(() => store.view.state.panel === 'legacy' || (store.legacy?.rows.value.length ?? 0) > 0);
const editorSettings = computed(() => ({
  hslModes: store.settingsStore.settings.value.hsl_signal_modes,
  exchangeOptions: store.editor.exchangeOptions(),
}));

async function convertResultToV8(path: string): Promise<void> {
  const result = store.results.results.value.find((item) => item.path === path);
  if (!result || store.adapter.isV8) return;
  const targetName = `${String(result.config_name || result.result_name || 'result').slice(0, 100)}_v8`;
  try {
    const data = await requestJson(`${boot.origin}/api/backtest-v8/migrate-v7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'backtest_result',
        source_name: String(result.config_name || result.result_name || 'result'),
        source_path: path,
        target_name: targetName,
        allow_manual_review_output: true,
      }),
    });
    if (data.draft_id) {
      replaceTopLocation(`${boot.origin}/api/backtest-v8/main_page?opt_draft_id=${encodeURIComponent(String(data.draft_id))}&draft_name=${encodeURIComponent(String(data.name || targetName))}`);
      return;
    }
    replaceTopLocation(`${boot.origin}/api/backtest-v8/main_page?config=${encodeURIComponent(String(data.name || targetName))}`);
  } catch (error) {
    store.notifyError(t('v7backtest.v8ConversionFailed', { msg: error instanceof Error ? error.message : String(error) }));
  }
}

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
      body: JSON.stringify({
        source_type: 'backtest_config',
        source_name: name,
        target_name: targetName,
        allow_manual_review_output: true,
      }),
    });
    if (data.draft_id) {
      replaceTopLocation(`${boot.origin}/api/backtest-v8/main_page?opt_draft_id=${encodeURIComponent(String(data.draft_id))}&draft_name=${encodeURIComponent(String(data.name || targetName))}`);
      return;
    }
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

function normalizeAiQueueCompareRequest(value: unknown): AiQueueCompareRequest | null {
  if (!adapterIsV8()) return null;
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiQueueCompareRequest>;
  if (raw.version !== 'v8' || !Array.isArray(raw.filenames)) return null;
  const filenames = Array.from(
    new Set(raw.filenames.map((filename) => String(filename)).filter((filename) => /^[A-Za-z0-9_.-]{1,128}$/.test(filename))),
  );
  const createdAt = Number(raw.created_at || 0);
  if (
    filenames.length < 2 ||
    filenames.length > 1000 ||
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt > AI_BACKTEST_COMPARE_MAX_AGE_MS
  ) {
    return null;
  }
  return { version: 'v8', proposal_id: String(raw.proposal_id || ''), filenames, created_at: createdAt };
}

function adapterIsV8(): boolean {
  return store.adapter.isV8;
}

function clearAiQueueCompareRequest(): void {
  aiQueueCompareRequest.value = null;
  aiQueueCompareOpening = false;
  aiQueueCompareRetryCount = 0;
  if (aiQueueCompareRetryTimer !== undefined) window.clearTimeout(aiQueueCompareRetryTimer);
  aiQueueCompareRetryTimer = undefined;
  try {
    window.sessionStorage.removeItem(AI_BACKTEST_COMPARE_STORAGE_KEY);
  } catch {
    // Session storage is optional; the in-memory state is still cleared.
  }
}

function storeAiQueueCompareRequest(value: unknown): boolean {
  const normalized = normalizeAiQueueCompareRequest(value);
  if (!normalized) return false;
  aiQueueCompareRequest.value = normalized;
  aiQueueCompareOpening = false;
  aiQueueCompareRetryCount = 0;
  if (aiQueueCompareRetryTimer !== undefined) window.clearTimeout(aiQueueCompareRetryTimer);
  aiQueueCompareRetryTimer = undefined;
  try {
    window.sessionStorage.setItem(AI_BACKTEST_COMPARE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // The current page can still finish the handoff without persistence.
  }
  store.selectPanel('queue');
  queuePanel.value?.setSelected(normalized.filenames);
  void maybeOpenAiQueueCompare();
  return true;
}

function restoreAiQueueCompareRequest(): void {
  if (!adapterIsV8()) return;
  let stored: unknown = null;
  try {
    stored = JSON.parse(window.sessionStorage.getItem(AI_BACKTEST_COMPARE_STORAGE_KEY) || 'null');
  } catch {
    stored = null;
  }
  if (!storeAiQueueCompareRequest(stored)) {
    try {
      window.sessionStorage.removeItem(AI_BACKTEST_COMPARE_STORAGE_KEY);
    } catch {
      // Ignore unavailable session storage.
    }
  }
}

function scheduleAiQueueCompareRetry(): void {
  if (aiQueueCompareRetryTimer !== undefined) window.clearTimeout(aiQueueCompareRetryTimer);
  aiQueueCompareRetryCount += 1;
  if (aiQueueCompareRetryCount >= 15) {
    clearAiQueueCompareRequest();
    store.notifyError(t('v7backtest.couldNotMatchResults'));
    return;
  }
  aiQueueCompareRetryTimer = window.setTimeout(() => {
    aiQueueCompareRetryTimer = undefined;
    void maybeOpenAiQueueCompare();
  }, 2000);
}

async function maybeOpenAiQueueCompare(): Promise<void> {
  const request = aiQueueCompareRequest.value;
  if (!request || aiQueueCompareOpening || !adapterIsV8()) return;
  const itemsByFilename = new Map(store.queueItems.value.map((item) => [String(item.filename), item]));
  const selectedItems = request.filenames.map((filename) => itemsByFilename.get(filename)).filter(Boolean);
  queuePanel.value?.setSelected(request.filenames);
  if (selectedItems.length !== request.filenames.length) return;
  const terminalItems = selectedItems.filter((item) => ['complete', 'error', 'stopped'].includes(String(item?.status)));
  if (terminalItems.length !== selectedItems.length) return;
  if (terminalItems.filter((item) => item?.status === 'complete').length < 2) {
    clearAiQueueCompareRequest();
    store.notifyError(t('v7backtest.selectAtLeast2CompletedQueue'));
    return;
  }
  aiQueueCompareOpening = true;
  try {
    const opened = await store.compareQueue(request.filenames, store.queueItems.value);
    if (opened) {
      clearAiQueueCompareRequest();
    } else {
      aiQueueCompareOpening = false;
      scheduleAiQueueCompareRetry();
    }
  } catch {
    aiQueueCompareOpening = false;
    scheduleAiQueueCompareRetry();
  }
}

function handleAiQueueCompareRequest(event: Event): void {
  if (!adapterIsV8()) return;
  storeAiQueueCompareRequest((event as CustomEvent).detail);
}

onMounted(() => {
  document.title = t(store.adapter.titleKey, store.adapter.titleParams);
  (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER = openBacktestHelp;
  window.addEventListener('pbgui:ai-backtest-compare-request', handleAiQueueCompareRequest);
  store.boot();
  restoreAiQueueCompareRequest();
});

onBeforeUnmount(() => {
  delete (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
  window.removeEventListener('pbgui:ai-backtest-compare-request', handleAiQueueCompareRequest);
  if (aiQueueCompareRetryTimer !== undefined) window.clearTimeout(aiQueueCompareRetryTimer);
});

watch(
  () => store.queueItems.value,
  () => {
    if (aiQueueCompareRequest.value) void maybeOpenAiQueueCompare();
  },
);
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
    :status-tone="bannerClass === 'conn-ok' ? 'success' : bannerClass === 'conn-lost' ? 'danger' : 'neutral'"
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

    <ConnectionNotice
      :state="store.banner.value"
      :waiting-text="t('v7backtest.connecting')"
      :lost-text="t('v7backtest.connectionLost')"
    />

    <div id="page-body" class="flex h-[calc(100dvh_-_var(--nav-height))] min-h-0 flex-col overflow-hidden max-[760px]:relative">

    <div
      class="workbench-page-content flex min-h-0 flex-1 flex-col overflow-hidden bg-page bg-[radial-gradient(circle_at_94%_0%,rgb(var(--accent-rgb)/0.09),transparent_28rem),radial-gradient(circle_at_0%_84%,rgb(var(--success-rgb)/0.05),transparent_24rem),repeating-linear-gradient(135deg,rgb(var(--text-secondary-rgb)/0.016)_0_1px,transparent_1px_42px)] px-[var(--page-padding)] pb-[var(--page-padding)] pt-[var(--page-padding)]"
    >
    <PanelShell
      :items="store.nav"
      :active="store.view.state.panel"
      :editor-open="editorToolbarOpen"
    >
      <template #ctx-configs>
        <Button type="button" variant="primary" class="sb-btn" data-test="ctx-new-config" @click="store.editor.newConfig()"><PbIcon :icon="PhPlus" /> {{ actionLabel('v7backtest.newConfig') }}</Button>
        <Button type="button" variant="danger" class="sb-btn" data-test="ctx-delete-configs" :disabled="configsSelectedCount === 0" @click="configsPanel?.deleteSelectedFlow(store.deleteConfigs)">
          <PbIcon :icon="PhTrash" />
          {{ actionLabel('v7backtest.deleteSelected') }} ({{ configsSelectedCount }})
        </Button>
      </template>
      <template #ctx-queue>
        <Button
          type="button"
          variant="default"
          class="sb-btn"
          data-test="queue-compare"
          @click="store.compareQueue(queuePanel?.selectedFilenames() ?? [], store.queueItems.value)"
        >
          <PbIcon :icon="PhChartLineUp" />
          {{ actionLabel('v7backtest.compare') }}
        </Button>
        <Button type="button" variant="default" class="sb-btn" data-test="clear-finished" @click="store.clearFinished"><PbIcon :icon="PhCheck" /> {{ actionLabel('v7backtest.clearFinished') }}</Button>
        <Button type="button" variant="danger" class="sb-btn" data-test="stop-all" @click="store.stopAllQueue">{{ t('v7backtest.stopAll') }}</Button>
        <Button type="button" variant="danger" class="sb-btn" data-test="delete-selected" @click="queuePanel?.deleteSelected()">
          <PbIcon :icon="PhTrash" />
          {{ actionLabel('v7backtest.deleteSelected') }}
        </Button>
        <hr class="sb-sep" />
        <Button type="button" variant="default" class="sb-btn" data-test="open-settings" @click="store.openSettingsModal"><PbIcon :icon="PhGear" />{{ actionLabel('v7backtest.settings') }}</Button>
      </template>
      <template #ctx-results>
        <!-- Backtest (:733) is version-bound (:5349-5355); Compare + Delete are
             cross-version (:735, :742); the other results handoffs land in M-v7-12 -->
        <Button
          type="button"
          variant="default"
          class="sb-btn"
          data-test="results-rebacktest"
          :disabled="store.results.versionFilter.value !== store.adapter.version"
          :title="store.results.versionFilter.value !== store.adapter.version ? t('v7backtest.actionVersionBound', { version: store.adapter.version.toUpperCase() }) : ''"
          @click="store.startResultsRebacktest"
        >
          <PbIcon :icon="PhArrowsClockwise" />
          {{ actionLabel('v7backtest.backtest') }}
        </Button>
        <Button type="button" variant="default" class="sb-btn" data-test="results-add-run" :disabled="store.results.getSelected().length !== 1" @click="store.addResultsToRun">
          <PbIcon :icon="PhPlay" />
          {{ actionLabel('v7backtest.addToRun') }}
        </Button>
        <Button type="button" variant="default" class="sb-btn" data-test="results-compare" @click="store.compareResults"><PbIcon :icon="PhChartLineUp" /> {{ actionLabel('v7backtest.compare') }}</Button>
        <Button type="button" variant="default" class="sb-btn" data-test="results-add-archive" :disabled="store.results.getSelected().length === 0 || store.resultsArchiveAdding.value" :aria-busy="store.resultsArchiveAdding.value" @click="store.addResultsToArchive">
          <PbIcon :icon="PhArchive" />
          {{ actionLabel('v7backtest.addToArchive') }}
        </Button>
        <Button v-if="hasPendingOwnArchiveChanges" type="button" variant="primary" class="sb-btn" data-test="results-push-archive" @click="store.archiveGit.push">
          <PbIcon :icon="PhUploadSimple" />
          {{ actionLabel('v7backtest.gitPush') }}
        </Button>
        <Button type="button" variant="danger" class="sb-btn" data-test="results-delete" @click="resultsPanel?.deleteSelectedFlow()"><PbIcon :icon="PhTrash" /> {{ actionLabel('v7backtest.deleteSelected') }}</Button>
      </template>
      <template #ctx-archive>
        <!-- list-view actions (:747-753) -->
        <template v-if="!store.archive.selectedName.value">
          <Button type="button" variant="default" class="sb-btn" data-test="archive-pull-all" :disabled="store.archiveGit.pullRunning.value" @click="store.archiveGit.pullAll()">
            <PbIcon :icon="PhDownloadSimple" /> {{ cleanLabel(store.archiveGit.pullButtonLabel.value) }}
          </Button>
          <Button type="button" variant="default" class="sb-btn" data-test="archive-push" @click="store.archiveGit.push()"><PbIcon :icon="PhUploadSimple" /> {{ actionLabel('v7backtest.gitPush') }}</Button>
          <Button type="button" variant="primary" class="sb-btn" data-test="archive-add" @click="archivePanel?.openAddArchive()"><PbIcon :icon="PhPlus" /> {{ actionLabel('v7backtest.addArchive') }}</Button>
          <Button type="button" variant="default" class="sb-btn" data-test="archive-setup" @click="store.archiveGit.openSetup()"><PbIcon :icon="PhGear" /> {{ actionLabel('v7backtest.setup') }}</Button>
          <Button type="button" variant="default" class="sb-btn" data-test="archive-log" @click="archiveLogPanel?.open()"><PbIcon :icon="PhClipboardText" /> {{ actionLabel('v7backtest.log') }}</Button>
        </template>
        <!-- results-view actions (:754-771), visibility per updateArchiveActionVisibility (:8969-8997) -->
        <template v-else>
          <Button type="button" variant="default" class="sb-btn" data-test="archive-back" @click="store.archive.closeArchive()"><PbIcon :icon="PhArchive" /> {{ actionLabel('v7backtest.archives') }}</Button>
          <Button v-if="store.archive.mode.value === 'backtests'" type="button" variant="default" class="sb-btn" data-test="archive-rebacktest" @click="store.archive.startRebacktest()"><PbIcon :icon="PhArrowsClockwise" /> {{ actionLabel('v7backtest.backtest') }}</Button>
          <Button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" variant="default" class="sb-btn" data-test="archive-rename" @click="archivePanel?.openRename()">{{ t('v7backtest.renameConfig') }}</Button>
          <Button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" variant="default" class="sb-btn" data-test="archive-retest" @click="store.archive.startRetestReplace()">{{ t('v7backtest.retestReplace') }}</Button>
          <!-- Add to Run (:759) + Balance Calculator (:761) land in M-v7-12 -->
          <Button v-if="store.archive.mode.value === 'backtests'" type="button" variant="default" class="sb-btn" data-test="archive-compare" @click="store.archive.compareSelected()"><PbIcon :icon="PhChartLineUp" /> {{ actionLabel('v7backtest.compare') }}</Button>
          <Button v-if="store.archive.mode.value === 'backtests'" type="button" variant="default" class="sb-btn" data-test="archive-score-preview" @click="store.archive.previewScores()">{{ t('v7backtest.scorePreview') }}</Button>
          <template v-if="store.archive.mode.value === 'optimize'">
            <Button type="button" variant="default" class="sb-btn" data-test="archive-opt-view" @click="archivePanel?.openViewOptimize()">{{ t('v7backtest.viewConfig') }}</Button>
            <Button type="button" variant="default" class="sb-btn" data-test="archive-opt-open" @click="archivePanel?.openOptimizeFromConfig()">{{ t('v7backtest.optimizeFromConfig') }}</Button>
            <Button type="button" variant="default" class="sb-btn" data-test="archive-opt-import" @click="archivePanel?.openImportOptimize()">{{ t('v7backtest.importConfig') }}</Button>
            <Button v-if="store.archive.isOwn.value" type="button" variant="danger" class="sb-btn" data-test="archive-opt-delete" @click="archivePanel?.openDeleteOptimize()">{{ t('v7backtest.deleteConfig') }}</Button>
          </template>
          <!-- Compact History (:767) — own-only, any mode (:8996) -->
          <Button v-if="store.archive.isOwn.value" type="button" variant="danger" class="sb-btn" data-test="archive-compact" @click="store.archiveGit.compactHistory()">{{ t('v7backtest.compactHistory') }}</Button>
          <Button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" variant="danger" class="sb-btn" data-test="archive-remove-duplicates" @click="archivePanel?.openCleanup('duplicates')">{{ t('v7backtest.removeDuplicates') }}</Button>
          <Button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" variant="danger" class="sb-btn" data-test="archive-remove-liquidated" @click="archivePanel?.openCleanup('liquidated')">{{ t('v7backtest.removeLiquidated') }}</Button>
          <Button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" variant="danger" class="sb-btn" data-test="archive-delete" @click="archivePanel?.openDeleteResults()"><PbIcon :icon="PhTrash" /> {{ actionLabel('v7backtest.deleteSelected') }}</Button>
        </template>
      </template>
      <template v-if="!store.adapter.isV8" #ctx-legacy>
        <!-- legacy actions (:772-778); Add to Run lands in M-v7-12 -->
        <Button type="button" variant="default" class="sb-btn" data-test="legacy-refresh" @click="store.legacy?.loadLegacyResults()"><PbIcon :icon="PhArrowsClockwise" /> {{ actionLabel('v7backtest.refresh') }}</Button>
        <Button type="button" variant="default" class="sb-btn" data-test="legacy-rebacktest" @click="store.legacy?.startRebacktest(store.editor.openEditor, () => store.selectPanel('configs'))"><PbIcon :icon="PhArrowsClockwise" /> {{ actionLabel('v7backtest.backtest') }}</Button>
        <Button type="button" variant="default" class="sb-btn" data-test="legacy-compare" @click="store.legacy?.compareSelected()"><PbIcon :icon="PhChartLineUp" /> {{ actionLabel('v7backtest.compare') }}</Button>
        <Button type="button" variant="danger" class="sb-btn" data-test="legacy-delete" @click="legacyPanel?.openDelete()"><PbIcon :icon="PhTrash" /> {{ actionLabel('v7backtest.deleteSelected') }}</Button>
      </template>

      <!-- Editor toolbar (:782-804, setEditorMode :211-222) — replaces the
           panel actions while a config session is open -->
      <template #editor>
        <div v-if="editorOpen" id="editor-toolbar" class="editor-toolbar flex w-full flex-wrap items-center gap-x-5 gap-y-2">
          <span class="tb-title text-xs font-bold uppercase tracking-[0.13em] text-primary">{{ t('v7backtest.editBacktest') }}</span>
          <div class="editor-nav-group flex flex-wrap items-center gap-1.5" data-test="editor-nav-group">
            <div class="editor-action-label px-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{{ t('v7backtest.editorNavigation') }}</div>
            <Button type="button" variant="default" class="sb-btn" data-test="editor-home" :title="t('v7backtest.backToConfigsList')" @click="store.editor.closeEditor()"><PbIcon :icon="PhHouse" /> {{ actionLabel('v7backtest.home') }}</Button>
            <Button type="button" variant="default" class="sb-btn" data-test="editor-import" @click="openImport"><PbIcon :icon="PhDownloadSimple" /> {{ actionLabel('v7backtest.import') }}</Button>
          </div>
          <div class="editor-analysis-group flex flex-wrap items-center gap-1.5" data-test="editor-analysis-group">
            <div class="editor-action-label px-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{{ t('v7backtest.editorAnalysis') }}</div>
            <Button type="button" variant="default" class="sb-btn" data-test="editor-results" :disabled="!editorHasSavedConfig" @click="editorResults"><PbIcon :icon="PhChartBar" /> {{ actionLabel('v7backtest.results') }}</Button>
            <Button type="button" variant="default" class="sb-btn" data-test="editor-strategy-explorer" @click="openStrategyExplorer">{{ t('v7backtest.strategyExplorer') }}</Button>
            <Button type="button" variant="default" class="sb-btn" data-test="editor-balance-calc" @click="openBalanceCalculator"><PbIcon :icon="PhWallet" /> {{ actionLabel('v7backtest.balanceCalculator') }}</Button>
            <Button type="button" variant="default" class="sb-btn" data-test="editor-ohlcv" @click="openOhlcvReadiness"><PbIcon :icon="PhCompassTool" /> {{ actionLabel('v7backtest.ohlcvReadiness') }}</Button>
          </div>
          <div class="editor-config-group flex flex-wrap items-center gap-1.5" data-test="editor-config-group">
            <div class="editor-action-label px-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{{ t('v7backtest.editorConfigActions') }}</div>
            <Button v-if="!store.adapter.isV8" type="button" variant="default" class="sb-btn" data-test="editor-convert-v8" :disabled="!editorHasSavedConfig" @click="convertEditorToV8">{{ t('v7backtest.convertToV8') }}</Button>
            <Button type="button" variant="default" class="sb-btn" data-test="editor-add-run" :disabled="!editorHasSavedConfig" @click="addEditorToRun"><PbIcon :icon="PhPlay" /> {{ actionLabel('v7backtest.addToRun') }}</Button>
          </div>
          <div class="editor-save-group ml-auto flex flex-wrap items-center gap-1.5" data-test="editor-save-group">
            <div class="editor-action-label px-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{{ t('v7backtest.editorSaveActions') }}</div>
            <Button
              type="button"
              variant="primary"
              class="sb-btn font-bold"
              data-test="editor-save"
              :title="t('v7backtest.saveConfig')"
              @click="store.editor.save()"
            >
              <PbIcon :icon="PhFloppyDisk" /> {{ actionLabel('v7backtest.save') }}
            </Button>
            <Button
              type="button"
              variant="success"
              class="sb-btn font-bold"
              data-test="editor-save-queue"
              :title="t('v7backtest.saveAndQueueTitle')"
              @click="store.editor.saveAndQueue()"
            >
              <PbIcon :icon="PhPlay" /> {{ actionLabel('v7backtest.saveQueue') }}
            </Button>
          </div>
        </div>
      </template>
    </PanelShell>

      <!-- CONFIGS panel (:812-821) -->
      <div
        id="panel-configs"
        class="view-panel min-h-0 flex-1 flex-col overflow-hidden"
        :class="[store.view.state.panel === 'configs' ? 'flex' : 'hidden', { active: store.view.state.panel === 'configs' }]"
      >
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
        class="view-panel min-h-0 flex-1 flex-col overflow-hidden"
        :class="[store.view.state.panel === 'results' ? 'flex' : 'hidden', { active: store.view.state.panel === 'results', unpinned: !resultsPinned }]"
      >
        <ResultsPanel
          ref="resultsPanel"
          v-model:pinned="resultsPinned"
          :results="store.results"
          :version-bound-actions="store.results.versionFilter.value !== store.adapter.version"
          :allow-v8-convert="!store.adapter.isV8"
          @convert="convertResultToV8"
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

  <div id="toast" class="pointer-events-none fixed bottom-6 right-6 z-[var(--z-toast)] flex flex-col gap-2">
    <div
      v-for="item in store.toasts.value"
      :key="item.id"
      class="toast-msg pointer-events-auto animate-[bt-fade-in_0.2s] rounded-md px-4 py-2.5 text-sm font-medium"
      :class="['toast-' + item.kind, toastToneClass(item.kind)]"
    >
      {{ item.msg }}
    </div>
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

  <div v-if="importOpen" id="modal-root" :class="modalBackdropClass" data-test="config-import-modal">
    <div :class="[modalBoxClass, 'w-[min(760px,92vw)]']">
      <div class="text-lg font-semibold">{{ t('v7backtest.importJsonConfig') }}</div>
      <div class="min-h-0 flex-1 overflow-auto">
        <div class="form-group">
          <label>{{ t('v7backtest.configName') }}</label>
          <Input v-model="importName" type="text" data-test="config-import-name" />
        </div>
        <div class="form-group">
          <label>{{ t('v7backtest.importJson') }}</label>
          <Textarea v-model="importJson" rows="18" :placeholder="t('v7backtest.pasteJsonHere')" data-test="config-import-json" class="min-h-[320px]! max-h-[60vh]" />
        </div>
        <div v-if="importError" class="field-status field-status-inline error" data-test="config-import-error">{{ importError }}</div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="default" class="modal-btn" :disabled="importLoading" @click="importOpen = false">{{ t('common.cancel') }}</Button>
        <Button type="button" variant="primary" class="modal-btn" data-test="config-import-submit" :disabled="importLoading" @click="submitImport">{{ t('v7backtest.importShort') }}</Button>
      </div>
    </div>
  </div>

  <div v-if="ohlcvOpen" id="modal-root" :class="modalBackdropClass" data-test="ohlcv-readiness-modal">
    <div :class="[modalBoxClass, 'w-[min(760px,92vw)]']">
      <div class="text-lg font-semibold">{{ t('v7backtest.ohlcvReadinessTitle') }}</div>
      <div class="min-h-0 flex-1 overflow-auto">
        <div v-if="ohlcvLoading" class="text-secondary">{{ t('editor.preflight.running') }}</div>
        <div v-else-if="ohlcvError" class="field-status field-status-inline error">{{ ohlcvError }}</div>
        <JsonViewer v-else :data="ohlcvData" :max-height="420" />
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="primary" class="modal-btn" data-test="ohlcv-readiness-close" @click="ohlcvOpen = false">{{ t('common.close') }}</Button>
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

<style>
/* ═══════════════════════════════════════════════════════════════
   Ported from styles/backtest-shell.css (deleted at the Tailwind
   migration). Everything expressible as utilities moved onto the
   templates; the rules below stay as CSS for the documented reasons.
   The block is unscoped on purpose — the old stylesheet was
   page-global, and the html/body rules have no component root.

   Dropped outright (identical values live in the src/styles/
   tailwind.css base + alias layers, or are superseded): the :root
   alias block, the * reset, the html/body font/colour/height
   defaults, the reduced-motion block, #modal-root.open (v-if
   controls presence), #log-panel/.visible (class binding + display
   ternary in ArchiveLogPanel), the page .sb-sep override (the shared
   components.css chrome owns .sb-sep), @keyframes archive-spin
   (animate-spin) and the dead #configs-editor .bot-side-primary
   margin (BotSideEditor's inline style always won).
   ═══════════════════════════════════════════════════════════════ */

/* ── Root chrome ─────────────────────────────────────────────── */
html,
body {
  overflow: hidden;
}

/* New-config command surface: the page-level accent glow. */
body {
  background:
    radial-gradient(circle at 7% 0%, rgb(var(--accent-deep-rgb) / 0.09), transparent 25rem),
    var(--bg);
}

.page-toolbar {
  background: var(--bg-card);
}

.page-toolbar [data-test="editor-save-queue"] {
  background: var(--success);
  border-color: var(--success);
  color: var(--accent-contrast);
}

.page-toolbar [data-test="editor-save-queue"]:hover:not(:disabled) {
  background: var(--success-soft);
  border-color: var(--success-soft);
}

/* Keep the editor's prominent headings on the shared semantic type scale. */
.core-workbench-shell--backtest #configs-editor .config-editor-intro h1 {
  font-size: clamp(var(--text-title), 2.6vw, var(--text-display));
}

.core-workbench-shell--backtest #configs-editor .config-editor-section header h2 {
  font-size: var(--text-section);
}

/* ── Shell scroll release (:has() — no utility form) ─────────── */
/* When a results panel is unpinned, main-content scrolls everything. */
.workbench-page-content:has(#panel-results.active.unpinned) { overflow-y: auto; }
.workbench-page-content:has(#panel-archive.active.arc-unpinned) { overflow-y: auto; }
.workbench-page-content:has(#panel-legacy.active.leg-unpinned) { overflow-y: auto; }
/* The editor is a long-form document, unlike the fixed-height queue/
   results workspaces — the main content owns the vertical scroll here. */
.workbench-page-content:has(#configs-editor) {
  overflow-x: hidden;
  overflow-y: auto;
}
#panel-configs.active:has(#configs-editor) {
  min-width: 0;
}
#panel-configs.active:has(#configs-editor) {
  display: block !important;
  flex: none;
  height: auto;
  min-height: 100%;
  overflow: visible;
}

/* ── Panel pin states ──────────────────────────────────────────
   State combos over the panels' flex/overflow utilities (un-layered
   CSS outranks @layer utilities, so the unpinned release wins). */
#panel-results.active:not(.unpinned) { height: 100%; }
#panel-results.active.unpinned { overflow: visible; flex: none; min-height: unset; height: auto; }
#panel-results.unpinned #results-scroll-area { flex: none; min-height: unset; overflow-y: visible; }
#panel-archive.active:not(.arc-unpinned) { height: 100%; }
#panel-archive.active.arc-unpinned { overflow: visible; flex: none; min-height: unset; height: auto; }
#panel-archive.arc-unpinned #archive-results-view { overflow: visible; flex: none; min-height: unset; }
#panel-archive.arc-unpinned #archive-results-scroll { flex: none; min-height: unset; overflow-y: visible; }
#panel-legacy.active:not(.leg-unpinned) { height: 100%; }
#panel-legacy.active.leg-unpinned { overflow: visible; flex: none; min-height: unset; height: auto; }
#panel-legacy.leg-unpinned #legacy-results-view { overflow: visible; flex: none; min-height: unset; }
#panel-legacy.leg-unpinned #legacy-results-scroll { flex: none; min-height: unset; overflow-y: visible; }

/* ── Shared table system (.tbl) ────────────────────────────────
   Cross-page contract: src/shared/coinOverrides/components/
   CoinOverridesPanel.vue renders .tbl markup too, and the row hover/
   selected states paint td descendants — a relationship utilities
   cannot express. .check-col/.actions-cell/.sort-arrow stay with it
   because .tbl's own th/td padding would outrank any utility placed
   on those cells (un-layered CSS beats @layer utilities). */
.tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--fs-base); user-select: none; }
.tbl th { position: sticky; top: 0; z-index: 2; background: var(--bg2); font-size: var(--fs-sm);
          text-transform: uppercase; letter-spacing: .5px; color: var(--text-dim);
          padding: 8px 10px; text-align: left; border-bottom: 2px solid var(--border);
          cursor: pointer; user-select: none; white-space: nowrap; }
.tbl th:hover { color: var(--text); }
.tbl td { padding: 7px 10px; border-bottom: 1px solid var(--border); white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.tbl tr:hover td { background: rgba(255,255,255,.03); }
.tbl tbody tr { cursor: pointer; }
.tbl tr.selected td { background: rgb(var(--accent-rgb) / .12); }
.tbl tr.selected td:first-child { border-left: 3px solid var(--accent); }
.tbl td.actions-cell { white-space: nowrap; overflow: visible; padding: 6px 8px; }
.actions-column { min-width: 84px; }
.backtest-row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--control-gap);
}
.backtest-row-action:focus-visible {
  outline: 2px solid var(--accent-soft);
  outline-offset: 2px;
  box-shadow: var(--focus-ring);
}
.sort-arrow { margin-left: 4px; font-size: var(--fs-xs); }
/* Configs list: checkbox column + zebra. The checkboxes themselves are
   ui/ Checkbox now — the former .check-col input sizing rule is dead. */
.check-col { width: 34px; padding-left: 8px !important; }
.configs-tbl tbody tr:nth-child(even):not(:hover):not(.selected) td { background: rgb(var(--text-secondary-rgb) / 0.04); }

/* ═══════════════════════════════════════════════════════════════
   Shared editor form system — CROSS-PAGE CONTRACT.
   src/shared/coinOverrides/components/CoinOverridesPanel.vue renders
   .expander / .form-group / .form-row / .cols-4 / .ms-* / .act-btn
   markup whose class names are shared with v7_edit (see
   src/pages/v7_edit/App.vue, which styles the same contract), so
   these cannot become this page's utilities. The page-local editor
   primitives (BacktestConfigEditor, BotSideEditor, CoinMultiSelect,
   AdvancedFieldsPanel) reuse the identical contract. Un-layered like
   the old backtest-shell.css.
   ═══════════════════════════════════════════════════════════════ */

/* Form grid */
.form-row { display: grid; gap: var(--sp-sm); margin: var(--sp-sm) 0; }
.cols-2 { grid-template-columns: 1fr 1fr; }

.form-group { display: flex; flex-direction: column; min-width: 0; margin-bottom: var(--sp-sm); }
.form-group label { font-size: var(--fs-xs); color: var(--text-dim); letter-spacing: .03em; margin-bottom: 2px; }
.form-group input, .form-group select, .form-group textarea { min-height: var(--input-h); padding: var(--sp-sm); background: var(--bg-input);
    color: var(--text); border: 1px solid var(--border); border-radius: 4px; font-size: var(--fs-sm); outline: none; width: 100%; }
.form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: var(--accent); }
.form-group textarea { height: auto; min-height: 140px; font-family: var(--mono, ui-monospace, monospace); resize: vertical; }

/* Action buttons — shared with CoinOverridesPanel */
.act-btn { background: none; border: 1px solid var(--border); border-radius: 4px; color: var(--text-dim);
           cursor: pointer; padding: 3px 8px; font-size: var(--fs-xs); transition: all .15s; }
.act-btn:hover { color: var(--text); border-color: var(--accent); }
.act-btn-danger:hover { color: var(--red); border-color: var(--red); }
.act-btn:disabled { opacity: .45; cursor: not-allowed; }

/* Checkbox row */
.chk-row { display: flex; align-items: flex-start; gap: 6px; min-height: var(--input-h); height: auto; min-width: 0; }
.chk-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent); flex-shrink: 0; }
.chk-row label { margin: 0; min-width: 0; flex: 1 1 auto; color: var(--text); font-size: var(--fs-sm); line-height: 1.2; white-space: normal; overflow-wrap: anywhere; word-break: break-word; cursor: pointer; }
.section-title { margin: var(--sp-lg) 0 var(--sp-sm); padding-bottom: var(--sp-xs); border-bottom: 1px solid var(--border); font-size: var(--fs-md); font-weight: 600; }

/* Expanders */
.expander { margin: var(--sp-sm) 0 var(--sp-md); border: 1px solid var(--border); border-radius: 6px; }
.expander-header {
  display: flex; align-items: center; gap: 6px; width: 100%; padding: var(--sp-sm) var(--sp-md);
  border: 0; border-radius: 6px; background: var(--bg2); color: var(--text); font: inherit;
  font-size: var(--fs-sm); font-weight: 600; text-align: left; cursor: pointer; user-select: none;
}
.expander.open .expander-header { border-radius: 6px 6px 0 0; }
.expander-header:hover { background: var(--bg3); }
.expander-header .arrow { font-size: 10px; transition: transform .2s; }
.expander.open .expander-header .arrow { transform: rotate(90deg); }
.expander-body { display: none; padding: var(--sp-md); }
.expander.open .expander-body { display: block; }

/* Number stepper */
.num-stepper { display: flex; align-items: center; }
.num-stepper input { flex: 1; min-width: 0; border-radius: 0 !important; text-align: center; }
.num-stepper input[type="number"] { appearance: textfield; -moz-appearance: textfield; }
.num-stepper input[type="number"]::-webkit-inner-spin-button,
.num-stepper input[type="number"]::-webkit-outer-spin-button { margin: 0; -webkit-appearance: none; }
.stepper-btn {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 28px; height: var(--input-h); padding: 0; border: 1px solid var(--border);
  background: var(--bg3); color: var(--text); font-size: 16px; line-height: 1; cursor: pointer;
}
.stepper-btn:first-child { border-right: 0; border-radius: 4px 0 0 4px; }
.stepper-btn:last-child { border-left: 0; border-radius: 0 4px 4px 0; }
.stepper-btn:hover { border-color: var(--accent); background: var(--accent); color: var(--accent-contrast); }

/* Multiselect (tag-input) */
.ms-wrap {
  position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 3px;
  min-height: var(--input-h); padding: 2px 4px; border: 1px solid var(--border); border-radius: 4px;
  background: var(--bg-input); cursor: text;
}
.ms-wrap:focus-within { border-color: var(--accent); }
.form-group .ms-wrap input.ms-input {
  flex: 1; width: auto; min-width: 60px; height: 24px; min-height: 24px; padding: 0;
  border: 0; background: transparent; color: var(--text); font-family: var(--font); font-size: var(--fs-sm); outline: 0;
}
.core-workbench-shell--backtest .ms-clear-btn,
.core-workbench-shell--backtest .ms-all-btn { margin-left: 2px; padding: 0 3px; border-radius: 3px; color: var(--text-dim); font-size: 12px; cursor: pointer; }
.ms-clear-btn:hover { background: rgb(var(--danger-rgb) / .15); color: var(--red); }
.ms-all-btn:hover { background: rgb(var(--accent-rgb) / .15); color: var(--accent); }
.ms-tag {
  display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px;
  border: 1px solid var(--border); border-radius: 3px; background: var(--bg3); color: var(--text); font-size: var(--fs-xs);
}
.ms-tag.ms-tag-all { border-color: var(--green); background: var(--green); color: var(--accent-contrast); font-weight: 600; }
.core-workbench-shell--backtest .ms-tag .ms-x { color: var(--text-dim); font-size: 12px; line-height: 1; cursor: pointer; }
.ms-tag .ms-x:hover { color: var(--red); }
.ms-dropdown {
  position: absolute; z-index: 100; top: 100%; right: 0; left: 0; display: none;
  max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 0 0 4px 4px; background: var(--bg-input);
}
.ms-dropdown.open { display: block; }
.ms-option { padding: 4px 8px; font-size: var(--fs-sm); cursor: pointer; }
.ms-option:hover, .ms-option.highlight, .ms-option.highlighted { background: var(--bg3); }
.ms-option.selected { color: var(--accent); }
.raw-json-wrap { position: relative; width: 100%; min-width: 0; }
.raw-json-wrap textarea { display: block; width: 100%; min-width: 0; }
.field-status { display: none; font-size: var(--fs-sm); line-height: 1.35; }
.field-status.error { display: block; color: var(--red); }
.field-status-inline.error { margin-top: var(--sp-xs); padding: 6px 10px; border: 1px solid rgb(var(--danger-rgb) / .35); border-radius: 4px; background: rgb(var(--danger-deep-rgb) / .35); }

/* ── PBv7 config editor grids (container-query machinery) ───────
   The 12-column editor grid and the cols-* ladders are targeted by
   named-container queries below, so the classes stay. */
.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.cols-7 { grid-template-columns: repeat(7, minmax(0, 1fr)); }
.cols-8 { grid-template-columns: repeat(8, minmax(0, 1fr)); }
.span-4 { grid-column: span 4; }
.config-editor-12 { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); }
.editor-span-1 { grid-column: span 1; }
.editor-span-2 { grid-column: span 2; }
.editor-span-4 { grid-column: span 4; }
.editor-span-6 { grid-column: span 6; }
.editor-span-12 { grid-column: span 12; }
@media (max-width: 760px) {
  .cols-2 { grid-template-columns: 1fr; }
}
@media (max-width: 1400px) {
  .cols-8 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .config-editor-12 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .editor-span-12 { grid-column: span 6; }
  .editor-span-6 { grid-column: span 6; }
  .editor-span-4 { grid-column: span 3; }
  .editor-span-2 { grid-column: span 2; }
  .editor-span-1 { grid-column: span 1; }
}
@media (max-width: 700px) {
  .cols-3, .cols-4, .cols-5, .cols-6, .cols-7, .cols-8 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .span-4 { grid-column: span 2; }
  .config-editor-12 { grid-template-columns: 1fr; }
  .editor-span-1, .editor-span-2, .editor-span-4, .editor-span-6, .editor-span-12 { grid-column: span 1; }
}

/* ── #configs-editor surface refinements ────────────────────────
   These restyle the shared contract classes inside the editor —
   including CoinOverridesPanel's markup, which mounts inside
   #configs-editor — so they must stay CSS. */
#configs-editor .form-group { margin-bottom: 0; }
#configs-editor .form-group label span,
#configs-editor .chk-row label span { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
#configs-editor .form-group input,
#configs-editor .form-group select { height: var(--input-h); min-height: var(--input-h); padding: 0 var(--sp-sm); font-family: var(--font); }
#configs-editor .form-group textarea { height: auto; padding: var(--sp-sm); }
#configs-editor .form-row {
  gap: 10px 12px;
  margin: 0 0 12px;
}
#configs-editor .form-group > label {
  display: flex;
  align-content: flex-start;
  align-items: flex-start;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
  min-height: 2.25em;
  overflow: visible;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.2;
  letter-spacing: 0.035em;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
}
#configs-editor .form-group input,
#configs-editor .form-group select,
#configs-editor .form-group textarea,
#configs-editor .ms-wrap {
  border-color: rgb(var(--text-secondary-rgb) / 0.15);
  border-radius: 8px;
  background: rgb(var(--bg-page-rgb) / 0.68);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.025);
}
#configs-editor .form-group input,
#configs-editor .form-group select {
  height: 36px;
  min-height: 36px;
}
#configs-editor .form-group input:hover,
#configs-editor .form-group select:hover,
#configs-editor .ms-wrap:hover {
  border-color: rgb(var(--accent-rgb) / 0.34);
  background: rgb(var(--bg-page-rgb) / 0.82);
}
#configs-editor .form-group input:focus,
#configs-editor .form-group select:focus,
#configs-editor .form-group textarea:focus,
#configs-editor .ms-wrap:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgb(var(--accent-rgb) / 0.13);
  outline: none;
}
#configs-editor .form-group input::placeholder {
  color: var(--text-muted);
}
#configs-editor .form-group input[type='checkbox'] {
  width: 16px;
  height: 16px;
  min-height: 16px;
  accent-color: var(--accent);
}
#configs-editor .chk-row {
  min-height: 36px;
  align-items: center;
  padding: 7px 9px;
  border: 1px solid rgb(var(--text-secondary-rgb) / 0.12);
  border-radius: 8px;
  background: rgb(var(--text-secondary-rgb) / 0.045);
}
#configs-editor .chk-row label {
  min-height: 0;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 11px;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
}
#configs-editor .chk-row,
#configs-editor .ms-wrap,
#configs-editor .ms-tag {
  min-width: 0;
  max-width: 100%;
}
#configs-editor .ms-tag {
  overflow-wrap: anywhere;
}
#configs-editor .form-group .ms-wrap input.ms-input {
  flex: 1 1 60px;
  min-width: 0;
  max-width: 100%;
  /* restores the shared contract height — #configs-editor .form-group
     input (height: 36px) out-specifies .form-group .ms-wrap
     input.ms-input and used to stretch the tag box to ~42px. */
  height: 24px;
  min-height: 24px;
  padding: 0;
}
#configs-editor .ms-wrap {
  min-height: 36px;
}
#configs-editor .ms-label-name {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}
#configs-editor .ms-label-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  flex-shrink: 0;
}
#configs-editor .ms-label-actions .ms-clear-btn,
#configs-editor .ms-label-actions .ms-all-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 0;
  padding: 0;
}
#configs-editor .num-stepper {
  height: 36px;
}
/* Advanced-execution and filters rows: fields where a checkbox sits where
   the other columns carry a label must occupy the same first-line height,
   and must not slide down when a neighbouring multi-select (tags chips)
   grows the row. The chk-row keeps its boxed look everywhere else. */
#configs-editor .config-editor-trading-advanced .chk-row,
#configs-editor .config-editor-filters .chk-row {
  min-height: 2.25em;
  align-items: center;
  margin-bottom: 2px;
  padding: 0;
  border: 0;
  background: none;
}
#configs-editor .config-editor-trading-advanced .chk-row label,
#configs-editor .config-editor-filters .chk-row label {
  line-height: 1.2;
}
#configs-editor .stepper-btn {
  width: 34px;
  height: 36px;
  border-color: rgb(var(--text-secondary-rgb) / 0.16);
  background: rgb(var(--text-secondary-rgb) / 0.09);
  color: var(--text-secondary);
}
#configs-editor .stepper-btn:hover {
  border-color: rgb(var(--accent-rgb) / 0.48);
  background: rgb(var(--accent-deep-rgb) / 0.22);
  color: var(--text-primary);
}
#configs-editor .expander {
  margin: 12px 0 14px;
  border-color: rgb(var(--text-secondary-rgb) / 0.14);
  border-radius: 9px;
  background: rgb(var(--bg-page-rgb) / 0.26);
}
#configs-editor .expander-header {
  min-height: 38px;
  padding: 0 12px;
  border-radius: 8px;
  background: rgb(var(--text-secondary-rgb) / 0.055);
  color: var(--text-secondary);
}
#configs-editor .expander-header:hover {
  background: rgb(var(--accent-deep-rgb) / 0.1);
  color: var(--text-primary);
}
#configs-editor .expander.open .expander-header {
  border-bottom: 1px solid rgb(var(--text-secondary-rgb) / 0.13);
  border-radius: 8px 8px 0 0;
  background: rgb(var(--accent-deep-rgb) / 0.1);
}
#configs-editor .expander-body {
  padding: 14px;
}
#configs-editor .bot-json-expander {
  margin-bottom: 0;
}
#configs-editor .bot-json-expander.error {
  border-color: rgb(var(--warning-rgb) / 0.38);
}
#configs-editor .act-btn {
  min-height: 36px;
  padding: 0 10px;
  border-color: rgb(var(--accent-rgb) / 0.25);
  border-radius: 8px;
  background: rgb(var(--accent-deep-rgb) / 0.08);
  color: var(--accent-soft);
}
#configs-editor .act-btn:hover {
  border-color: rgb(var(--accent-rgb) / 0.48);
  background: rgb(var(--accent-deep-rgb) / 0.18);
}
@media (max-width: 700px) {
  #configs-editor .form-row {
    gap: 10px;
    margin-bottom: 12px;
  }
}

/* ── Editor chrome pseudo-elements (no utility form) ─────────── */
.config-editor-intro::before {
  content: '';
  position: absolute;
  top: 0;
  left: 4px;
  width: 42px;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent));
  box-shadow: 0 0 18px rgb(var(--accent-rgb) / 0.46);
}
.config-editor-section::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: linear-gradient(90deg, rgb(var(--accent-rgb) / 0.76), transparent 68%);
}
.config-editor-section:nth-of-type(3)::before {
  background: linear-gradient(90deg, rgb(var(--success-rgb) / 0.76), transparent 68%);
}
.config-editor-section:nth-of-type(4)::before {
  background: linear-gradient(90deg, rgb(var(--warning-rgb) / 0.76), transparent 68%);
}
.config-editor-section:nth-of-type(5)::before {
  background: linear-gradient(90deg, rgb(155 142 222 / 0.76), transparent 68%);
}

/* ── Container queries: the editor trading grids ─────────────── */
@container backtest-editor (min-width: 701px) and (max-width: 1180px) {
  .config-editor-trading-primary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .config-editor-trading-primary > .editor-span-2 {
    grid-column: span 1;
  }

  .config-editor-trading-primary > .editor-span-12 {
    grid-column: span 3;
  }

  .config-editor-trading-advanced > .editor-span-2,
  .config-editor-trading-advanced > .editor-span-4 {
    grid-column: span 4;
  }

  .config-editor-trading-primary .form-group > label {
    min-height: 2.5em;
    align-items: flex-start;
  }
}

@container backtest-editor (max-width: 700px) {
  .config-editor-12,
  .config-editor-trading-primary,
  #configs-editor .cols-2 {
    grid-template-columns: 1fr;
  }

  .editor-span-1,
  .editor-span-2,
  .editor-span-4,
  .editor-span-6,
  .editor-span-12 {
    grid-column: span 1;
  }

  .bot-side-head,
  .bot-side-title {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}

/* The default 200px shell sidebar plus up to 72px of main-content
   horizontal padding leaves about 1164px for the editor at a 1440px
   viewport. These viewport ranges approximate the 701–1180px container
   contract for browsers without container-query support. */
@supports not (container-type: inline-size) {
  @media (min-width: 952px) and (max-width: 1460px) {
    .config-editor-trading-primary {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .config-editor-trading-primary > .editor-span-2 {
      grid-column: span 1;
    }

    .config-editor-trading-primary > .editor-span-12 {
      grid-column: span 3;
    }

    .config-editor-trading-advanced > .editor-span-2,
    .config-editor-trading-advanced > .editor-span-4 {
      grid-column: span 4;
    }

    .config-editor-trading-primary .form-group > label {
      min-height: 2.5em;
      align-items: flex-start;
    }
  }

  @media (max-width: 951px) {
    .config-editor-12,
    .config-editor-trading-primary,
    #configs-editor .cols-2 {
      grid-template-columns: 1fr;
    }

    .editor-span-1,
    .editor-span-2,
    .editor-span-4,
    .editor-span-6,
    .editor-span-12 {
      grid-column: span 1;
    }

    .bot-side-head,
    .bot-side-title {
      align-items: flex-start;
      flex-wrap: wrap;
    }
  }
}

/* ── Keyframes ───────────────────────────────────────────────── */
@keyframes bt-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes archive-pull-bar { 0% { left: -35%; } 100% { left: 100%; } }

/* ── Archive pull progress bar (pseudo-element sweep) ─────────── */
.archive-pull-bar::before { content: ''; position: absolute; top: 0; bottom: 0; left: -35%; width: 35%;
                             background: linear-gradient(90deg, transparent, var(--accent), transparent);
                             animation: archive-pull-bar 1.4s ease-in-out infinite; }

/* ── Document-delegated tooltip layer (DataTipTooltip.vue) ──────
   Shared component (also used by market_data) — its root carries no
   classes, so this page styles it here. z-index continues the page
   scale (100 < 500 < 1000 < 2000 < this). */
#data-tip-tooltip {
  display: none;
  position: fixed;
  left: 0;
  top: 0;
  z-index: var(--z-tooltip);
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: var(--fs-xs);
  font-weight: normal;
  padding: 6px 10px;
  white-space: pre-wrap;
  max-width: 480px;
  line-height: 1.5;
  box-shadow: var(--shadow-elevated);
  pointer-events: none;
  will-change: transform;
}
</style>
