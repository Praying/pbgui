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
 * (:8509-8532). Archive/legacy (M-v7-11) and handoffs (M-v7-12) extend
 * this shell.
 *
 * FLAVOR: pathname-derived (/api/backtest-v8/ → v8, config.ts) — both
 * routers serve this one build; v8 drops the legacy panel.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import BacktestConfigEditor from './components/BacktestConfigEditor.vue';
import ConfigsPanel from './components/ConfigsPanel.vue';
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
});

const queuePanel = ref<InstanceType<typeof QueuePanel> | null>(null);
const configsPanel = ref<InstanceType<typeof ConfigsPanel> | null>(null);
const editorPanel = ref<InstanceType<typeof BacktestConfigEditor> | null>(null);
const resultsPanel = ref<InstanceType<typeof ResultsPanel> | null>(null);

const bannerClass = computed(() => 'conn-' + store.banner.value);
const bannerText = computed(() =>
  store.banner.value === 'ok' ? t('v7backtest.connected') : store.banner.value === 'lost' ? t('v7backtest.connectionLost') : t('v7backtest.connecting')
);

const editorOpen = computed(() => store.editor.editingName.value !== null);
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
        <!-- Compare + Delete are cross-version (:735, :742); the other
             results actions land with M-v7-11/12 handoffs -->
        <button type="button" class="sb-btn" data-test="results-compare" @click="store.compareResults">📈 {{ t('v7backtest.compare') }}</button>
        <button type="button" class="sb-btn danger" data-test="results-delete" @click="resultsPanel?.deleteSelectedFlow()">🗑 {{ t('v7backtest.deleteSelected') }}</button>
      </template>
      <template #ctx-archive>
        <!-- archive actions land in M-v7-11 -->
      </template>
      <template v-if="!store.adapter.isV8" #ctx-legacy>
        <!-- legacy actions land in M-v7-11 -->
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
      <div id="panel-results" class="view-panel" :class="{ active: store.view.state.panel === 'results' }">
        <ResultsPanel ref="resultsPanel" :results="store.results" :version-bound-actions="store.results.versionFilter.value !== store.adapter.version" />
      </div>

      <!-- ARCHIVE panel — M-v7-11 -->
      <div id="panel-archive" class="view-panel" :class="{ active: store.view.state.panel === 'archive' }">
        <div class="empty-state"><div class="empty-icon">🗄️</div><p>Archive — M-v7-11</p></div>
      </div>

      <!-- LEGACY panel — v7 only (adapter drops it on v8, :160-162) — M-v7-11 -->
      <div
        v-if="!store.adapter.isV8"
        id="panel-legacy"
        class="view-panel"
        :class="{ active: store.view.state.panel === 'legacy' }"
      >
        <div class="empty-state"><div class="empty-icon">🧭</div><p>Legacy — M-v7-11</p></div>
      </div>
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
</template>
