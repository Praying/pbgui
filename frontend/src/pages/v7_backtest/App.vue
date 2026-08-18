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
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
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

const { t } = useI18n();
const boot = getBoot();

const store = useBacktestPage({
  origin: boot.origin,
  t: (key, params) => t(key, params ?? {}),
  // suiteCollect's auto-save (:4769): the open scenario draft folds into
  // the state before every collect (Save / Save & Queue / raw-JSON sync).
  foldSuiteDraft: () => editorPanel.value?.foldSuiteDraft(),
  // showArchiveLog (:9633-9639): push/compact/openLog open the sync log.
  openArchiveSyncLog: () => archiveLogPanel.value?.open(),
});

const queuePanel = ref<InstanceType<typeof QueuePanel> | null>(null);
const configsPanel = ref<InstanceType<typeof ConfigsPanel> | null>(null);
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

const editorOpen = computed(() => store.editor.editingName.value !== null);
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

declare global {
  interface Window {
    PBGuiSidebarResize?: {
      init(options: { sidebarId: string; handleId: string; minWidth: number; maxWidth: number }): void;
    };
  }
}

onMounted(() => {
  document.title = t(store.adapter.titleKey, store.adapter.titleParams);
  window.PBGuiSidebarResize?.init({ sidebarId: 'sidebar', handleId: 'sidebar-resize', minWidth: 140, maxWidth: 300 });
  store.boot();
});
</script>

<template>
  <MigrationWatermark />
  <nav id="topnav"></nav>

  <div id="conn-banner" :class="bannerClass" data-i18n="v7backtest.connecting">{{ bannerText }}</div>

  <div id="page-body">
    <PanelShell
      :items="store.nav"
      :active="store.view.state.panel"
      :queue-badge="store.queueBadge.value"
      @select="store.selectPanel"
    >
      <template #ctx-configs>
        <button type="button" class="sb-btn accent" data-test="ctx-new-config" @click="store.editor.newConfig()">+ {{ t('v7backtest.newConfig') }}</button>
        <button type="button" class="sb-btn danger" data-test="ctx-delete-configs" @click="configsPanel?.deleteSelectedFlow(store.deleteConfigs)">
          🗑 {{ t('v7backtest.deleteSelected') }}
        </button>
      </template>
      <template #ctx-queue>
        <button
          type="button"
          class="sb-btn"
          data-test="queue-compare"
          @click="store.compareQueue(queuePanel?.selectedFilenames() ?? [], store.queueItems.value)"
        >
          📈 {{ t('v7backtest.compare') }}
        </button>
        <button type="button" class="sb-btn" data-test="clear-finished" @click="store.clearFinished">{{ t('v7backtest.clearFinished') }}</button>
        <button type="button" class="sb-btn danger" data-test="stop-all" @click="store.stopAllQueue">{{ t('v7backtest.stopAll') }}</button>
        <button type="button" class="sb-btn danger" data-test="delete-selected" @click="queuePanel?.deleteSelected()">
          {{ t('v7backtest.deleteSelected') }}
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
          🔄 {{ t('v7backtest.backtest') }}
        </button>
        <button type="button" class="sb-btn" data-test="results-compare" @click="store.compareResults">📈 {{ t('v7backtest.compare') }}</button>
        <button type="button" class="sb-btn danger" data-test="results-delete" @click="resultsPanel?.deleteSelectedFlow()">🗑 {{ t('v7backtest.deleteSelected') }}</button>
      </template>
      <template #ctx-archive>
        <!-- list-view actions (:747-753) -->
        <template v-if="!store.archive.selectedName.value">
          <button type="button" class="sb-btn" data-test="archive-pull-all" :disabled="store.archiveGit.pullRunning.value" @click="store.archiveGit.pullAll()">
            {{ store.archiveGit.pullButtonLabel.value }}
          </button>
          <button type="button" class="sb-btn" data-test="archive-push" @click="store.archiveGit.push()">⬆ {{ t('v7backtest.gitPush') }}</button>
          <button type="button" class="sb-btn accent" data-test="archive-add" @click="archivePanel?.openAddArchive()">+ {{ t('v7backtest.addArchive') }}</button>
          <button type="button" class="sb-btn" data-test="archive-setup" @click="store.archiveGit.openSetup()">⚙ {{ t('v7backtest.setup') }}</button>
          <button type="button" class="sb-btn" data-test="archive-log" @click="archiveLogPanel?.open()">📋 {{ t('v7backtest.log') }}</button>
        </template>
        <!-- results-view actions (:754-771), visibility per updateArchiveActionVisibility (:8969-8997) -->
        <template v-else>
          <button type="button" class="sb-btn" data-test="archive-back" @click="store.archive.closeArchive()">🏠 {{ t('v7backtest.archives') }}</button>
          <button v-if="store.archive.mode.value === 'backtests'" type="button" class="sb-btn" data-test="archive-rebacktest" @click="store.archive.startRebacktest()">🔄 {{ t('v7backtest.backtest') }}</button>
          <button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" class="sb-btn" data-test="archive-rename" @click="archivePanel?.openRename()">✏ {{ t('v7backtest.renameConfig') }}</button>
          <button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" class="sb-btn" data-test="archive-retest" @click="store.archive.startRetestReplace()">♻ {{ t('v7backtest.retestReplace') }}</button>
          <!-- Add to Run (:759) + Balance Calculator (:761) land in M-v7-12 -->
          <button v-if="store.archive.mode.value === 'backtests'" type="button" class="sb-btn" data-test="archive-compare" @click="store.archive.compareSelected()">📈 {{ t('v7backtest.compare') }}</button>
          <button v-if="store.archive.mode.value === 'backtests'" type="button" class="sb-btn" data-test="archive-score-preview" @click="store.archive.previewScores()">⭐ {{ t('v7backtest.scorePreview') }}</button>
          <template v-if="store.archive.mode.value === 'optimize'">
            <button type="button" class="sb-btn" data-test="archive-opt-view" @click="archivePanel?.openViewOptimize()">📄 {{ t('v7backtest.viewConfig') }}</button>
            <button type="button" class="sb-btn" data-test="archive-opt-open" @click="archivePanel?.openOptimizeFromConfig()">🧬 {{ t('v7backtest.optimizeFromConfig') }}</button>
            <button type="button" class="sb-btn" data-test="archive-opt-import" @click="archivePanel?.openImportOptimize()">📥 {{ t('v7backtest.importConfig') }}</button>
            <button v-if="store.archive.isOwn.value" type="button" class="sb-btn danger" data-test="archive-opt-delete" @click="archivePanel?.openDeleteOptimize()">🗑 {{ t('v7backtest.deleteConfig') }}</button>
          </template>
          <!-- Compact History (:767) — own-only, any mode (:8996) -->
          <button v-if="store.archive.isOwn.value" type="button" class="sb-btn danger" data-test="archive-compact" @click="store.archiveGit.compactHistory()">🧨 {{ t('v7backtest.compactHistory') }}</button>
          <button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" class="sb-btn danger" data-test="archive-remove-duplicates" @click="archivePanel?.openCleanup('duplicates')">🧹 {{ t('v7backtest.removeDuplicates') }}</button>
          <button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" class="sb-btn danger" data-test="archive-remove-liquidated" @click="archivePanel?.openCleanup('liquidated')">🧹 {{ t('v7backtest.removeLiquidated') }}</button>
          <button v-if="store.archive.mode.value === 'backtests' && store.archive.isOwn.value" type="button" class="sb-btn danger" data-test="archive-delete" @click="archivePanel?.openDeleteResults()">🗑 {{ t('v7backtest.deleteSelected') }}</button>
        </template>
      </template>
      <template v-if="!store.adapter.isV8" #ctx-legacy>
        <!-- legacy actions (:772-778); Add to Run lands in M-v7-12 -->
        <button type="button" class="sb-btn" data-test="legacy-refresh" @click="store.legacy?.loadLegacyResults()">↻ {{ t('v7backtest.refresh') }}</button>
        <button type="button" class="sb-btn" data-test="legacy-rebacktest" @click="store.legacy?.startRebacktest(store.editor.openEditor, () => store.selectPanel('configs'))">🔄 {{ t('v7backtest.backtest') }}</button>
        <button type="button" class="sb-btn" data-test="legacy-compare" @click="store.legacy?.compareSelected()">📈 {{ t('v7backtest.compare') }}</button>
        <button type="button" class="sb-btn danger" data-test="legacy-delete" @click="legacyPanel?.openDelete()">🗑 {{ t('v7backtest.deleteSelected') }}</button>
      </template>

      <!-- Editor sidebar (:782-804, setEditorMode :211-222) — handoff buttons land in M-v7-12 -->
      <template #editor>
        <div v-if="editorOpen" id="sidebar-editor" class="sidebar-sticky">
          <div class="sidebar-header"><span class="sb-title">{{ t('v7backtest.editBacktest') }}</span></div>
          <div class="sidebar-toolbar">
            <button type="button" class="sb-btn" :title="t('v7backtest.backToConfigsList')" @click="store.editor.closeEditor()">🏠 {{ t('v7backtest.home') }}</button>
            <button type="button" class="sb-btn primary" :title="t('v7backtest.saveConfig')" @click="store.editor.save()">💾 {{ t('v7backtest.save') }}</button>
            <button type="button" class="sb-btn info" :title="t('v7backtest.saveAndQueueTitle')" @click="store.editor.saveAndQueue()">▶ {{ t('v7backtest.saveQueue') }}</button>
            <!-- Results / Convert to V8 / Add to Run / Strategy Explorer / Balance Calc / OHLCV Readiness / Log / Import land in M-v7-12 -->
          </div>
        </div>
      </template>
    </PanelShell>

    <div id="main-content">
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
