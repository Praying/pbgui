<script setup lang="ts">
/**
 * Pareto Explorer page shell — the Vue port of
 * frontend/v7_pareto_explorer.html (4,791 L). M-v7-5 landed the scaffold +
 * bootstrap/load + route state; M-v7-6 (this) lands the command center,
 * config detail and playground charts; M-v7-7 the deep intelligence tabs and
 * preset handoffs. Legacy line refs below are provenance.
 *
 * ┌────────────────────────────┬─ Legacy regions ───────────────────────────┐
 * │ App (this shell)           │ markup :1096-1257, boot :4730-4752,        │
 * │                            │ selectStage :4132-4160, route state        │
 * │                            │ :1794-1804/:4123-4130, messages :1917-1933 │
 * │ useParetoSession           │ state :1656-1738, optimizeVersion          │
 * │                            │ :1765-1791, renderSession :3895-3984,      │
 * │                            │ applyLoadData :4502-4570, loadParetoData   │
 * │                            │ :4588-4691, bootstrap :4693-4726, sidebar  │
 * │                            │ scans :2838-2883 (mode chip :2852/:2878)   │
 * │ useLoadProgress            │ full-load :2414-2555, display range        │
 * │                            │ :2157-2214 (loading summary :2163-2173)    │
 * │ useSurfaces                │ loadCommandCenterData :4028-4075,          │
 * │                            │ loadConfigDetail :4077-4121, loadPlayground│
 * │                            │ :3395-3448 + renderPlayground state layer  │
 * │                            │ :3300-3330, resolveBackgroundLoadResponse  │
 * │                            │ :4572-4586, refresh scheduling :2222-2231  │
 * │ useChartState              │ react decision :2313, remembered heights   │
 * │                            │ :2689-2702, fullscreen :2723-2779,         │
 * │                            │ fitChartToWrap :2750-2766                  │
 * │ CommandCenter              │ champions :2944-2973, insights :2975-2990, │
 * │                            │ preview :2890-2942 + :1248-1274 markup     │
 * │ ConfigDetail               │ renderDetail :3849-3893 + :1506-1558       │
 * │                            │ markup, JsonPanel :4739-4746 (preset       │
 * │                            │ section :1559-1623 is M-v7-7 scope)        │
 * │ Playground / ScatterChart  │ renderPlayground :3300-3394 + :1279-1389   │
 * │   / ProjectionTriptych     │ markup, settings handlers :4357-4434       │
 * │ lib/paretoUrls             │ api bases + main_page builders :1782-1844, │
 * │                            │ back-to-optimize #results :4482-4487       │
 * │ lib/{viewRange,loadRequest,│ normalizeViewRange :1986-2007, /load body  │
 * │  loadSummary,plotLayout,   │ :4625-4660, result context :2557-2576,     │
 * │  plotClick,metrics,        │ darkPlotLayout :2580-2644, click extract   │
 * │  surfaceRequests,viewModels│ :2781-2824, metric filters :2009-2131      │
 * │ M-v7-7 placeholders        │ deep intelligence :1392+, preset :1559+    │
 * └────────────────────────────┴───────────────────────────────────────────┘
 *
 * FLAVOR: runtime, not pathname — see config.ts. The nav subtitle/current
 * are computed ONCE at boot from the ?optimize_version= seed (index.html,
 * legacy :4732-4733); a mid-session version flip updates buttons and URL
 * builders but not the nav highlight (legacy quirk, preserved + documented).
 */
import { computed, onBeforeUnmount, onMounted } from 'vue';
import type { Component } from 'vue';
import { PhBank, PhBrain, PhFolderOpen, PhGear, PhQuestion, PhTarget } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import { replaceTopLocation } from '@/shared/nav';
import AppShell from '@/shared/components/AppShell.vue';
import IconButton from '@/shared/components/IconButton.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import DataTipTooltip from '@/shared/components/DataTipTooltip.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import CommandCenter from './components/CommandCenter.vue';
import ConfigDetail from './components/ConfigDetail.vue';
import Playground from './components/Playground.vue';
import { useFullscreenRelayout } from './composables/useChartState';
import { useParetoSession } from './composables/useParetoSession';
import { useSurfaces, type Surfaces } from './composables/useSurfaces';
import {
  LOAD_STRATEGY_OPTIONS,
  VALID_DEEP_TABS,
  VALID_STAGES,
  paretoApiBase,
  readResultPath,
  readRouteState,
  readSeedOptimizeVersion,
} from './config';
import { buildLoadSummary } from './lib/loadSummary';
import { currentRangeMax, buildDisplayRangeLoadingSummary, normalizeViewRange } from './lib/viewRange';
import { getPlotly } from './lib/plotlyVendor';
import type { DeepTab, LoadData, ParetoStage, ParetoSession } from './types';
import type { PageSection } from '@/shared/navigation';

const { t } = useI18n();

const boot = getBoot();

/**
 * The bootstrap hook is a mutable indirection: the surfaces composable needs
 * the store, but the store's bootstrapSession tail must call the surfaces
 * (:4705-4715). Wiring order mirrors the legacy call graph.
 */
let onSessionApplied: ((data: ParetoSession) => void | Promise<void>) | null = null;

const store = useParetoSession({
  apiBase: paretoApiBase(boot.origin),
  origin: boot.origin,
  seedVersion: readSeedOptimizeVersion(),
  resultPath: readResultPath(),
  route: readRouteState(),
  t: (key, params) => t(key, params ?? {}),
  afterSessionApplied: (data) => onSessionApplied?.(data) ?? Promise.resolve(),
});

const surfaces: Surfaces = useSurfaces({ store, t: (key, params) => t(key, params ?? {}) });
onSessionApplied = () => surfaces.afterSession(); // legacy tail ignores the session payload (:4705)

/** The shared config-detail section (:4141-4145). */
const showSharedDetail = computed(() => store.state.stage === 'command_center' || store.state.stage === 'pareto_playground');

const STAGE_META: Record<ParetoStage, { icon: Component; labelKey: string }> = {
  command_center: { icon: PhBank, labelKey: 'v7explore.overview' },
  pareto_playground: { icon: PhTarget, labelKey: 'v7explore.explorer' },
  deep_intelligence: { icon: PhBrain, labelKey: 'v7explore.deepIntelligence' },
  settings: { icon: PhGear, labelKey: 'v7explore.settings' },
};

/* Converged navigation: the four stages are rail sections under the active
   Pareto Explorer page item. */
const railSections = computed<PageSection[]>(() =>
  VALID_STAGES.map((stage) => ({ key: stage, label: t(STAGE_META[stage].labelKey) })),
);

function openParetoHelp(): void {
  const sharedHelp = (window as Window & {
    PBGuiSharedHelp?: { open?: (topic: string) => void };
  }).PBGuiSharedHelp;
  sharedHelp?.open?.('37_pareto_explorer');
}

const DEEP_TAB_LABEL: Record<DeepTab, string> = {
  parameters: 'v7explore.parameters',
  scenarios: 'v7explore.scenarios',
  evolution: 'v7explore.evolution',
  correlations: 'v7explore.correlations',
};

const DEEP_TAB_DESC: Record<DeepTab, string> = {
  parameters: 'v7explore.parametersTabDesc',
  scenarios: 'v7explore.scenariosTabDesc',
  evolution: 'v7explore.evolutionTabDesc',
  correlations: 'v7explore.correlationsTabDesc',
};

const session = computed(() => store.state.session);
const load = computed<LoadData | null>(() => (session.value && session.value.load) || null);
const result = computed(() => (session.value && session.value.result) || null);
const valid = computed(() => !!(session.value && session.value.result_valid));

/** Summary metric derivations (:3913-3937). */
const totalResults = computed<number | null>(() => {
  const l = load.value;
  if (l && l.view_range && l.view_range.max != null) return l.view_range.max;
  if (l && l.load_stats && l.load_stats.selected_configs != null) return l.load_stats.selected_configs;
  return l && l.summary ? (l.summary.visible_configs ?? null) : null;
});
const selectedResults = computed(() => load.value?.summary?.selected_configs ?? totalResults.value);
const scannedResults = computed(() => {
  const l = load.value;
  if (!l) return null;
  return l.summary?.scanned_configs ?? (l.load_stats?.total_parsed ?? selectedResults.value);
});
const visibleResults = computed(() => {
  const l = load.value;
  if (!l) return null;
  if (l.summary && l.summary.visible_configs != null) return l.summary.visible_configs;
  if (l.view_range && l.view_range.end != null && l.view_range.start != null) {
    return Math.max(0, (l.view_range.end || 0) - (l.view_range.start || 0));
  }
  return null;
});
const totalParetos = computed(() => {
  const l = load.value;
  if (!l) return null;
  return l.summary ? (l.summary.pareto_configs ?? null) : (l.load_stats?.pareto_configs ?? null);
});

const metricResult = computed(() => (result.value ? result.value.name || '-' : '-'));
const metricParetos = computed(() => {
  if (totalParetos.value != null) return String(totalParetos.value);
  return result.value ? String(result.value.pareto_count ?? '-') : '-';
});
const metricAllResults = computed(() => {
  const l = load.value;
  if (l && l.mode === 'full' && selectedResults.value != null && scannedResults.value != null) {
    return visibleResults.value != null && visibleResults.value !== selectedResults.value
      ? t('v7explore.visibleSelectedScanned', {
          visible: visibleResults.value,
          selected: selectedResults.value,
          scanned: scannedResults.value,
        })
      : t('v7explore.selectedScanned', { selected: selectedResults.value, scanned: scannedResults.value });
  }
  if (visibleResults.value != null && totalResults.value != null && visibleResults.value !== totalResults.value) {
    return t('v7explore.visibleOfTotal', { visible: visibleResults.value, total: totalResults.value });
  }
  if (totalResults.value != null) return String(totalResults.value);
  return result.value ? t(result.value.has_all_results ? 'common.yes' : 'common.no') : '-';
});

/** Top chips (:3958-3964; transient states :2852-2853/:2878-2879). */
const resultChip = computed(() => (result.value ? result.value.name || '' : t('v7explore.noResultSelected')));
const modeChip = computed(() => {
  if (store.state.modeChipOverride) return store.state.modeChipOverride;
  if (!valid.value) return t('v7explore.missingResultPath');
  const l = load.value;
  if (l && l.mode === 'full') {
    const suffix =
      l.view_range && l.view_range.end != null && l.view_range.max != null
        ? ' (' + String(l.view_range.end) + '/' + String(l.view_range.max) + ' visible)'
        : '';
    return t('v7explore.fullModeLoaded', { visible: suffix });
  }
  return t('v7explore.fastModeLoaded');
});
const modeChipClass = computed(() => 'status-chip ' + (store.state.modeChipOverride || !valid.value ? 'warn' : 'good'));

/** Full-load status card (:2414-2451 label map). */
const fullLoadLabels: Record<string, string> = {
  idle: t('v7explore.idle'),
  loading: t('v7explore.loading'),
  loaded: t('v7explore.loaded'),
  error: t('v7explore.error'),
};
const fullLoadChipClass = computed(
  () => 'status-chip ' + (store.progress.fullLoad.stage === 'loaded' ? 'good' : store.progress.fullLoad.stage === 'error' ? 'bad' : 'warn')
);
const fullLoadBarStyle = computed(() => ({ width: String(store.progress.fullLoad.display) + '%' }));

/** Result Context pre (:2557-2578). */
const resultMetaJson = computed(() =>
  JSON.stringify(
    buildLoadSummary(load.value, result.value, {
      resultPath: store.state.resultPath,
      loadStrategy: store.state.loadStrategy,
      maxConfigs: store.state.maxConfigs,
    }),
    null,
    2
  )
);

/** Display-range card (:2347-2412). */
const rangeTotal = computed(() => currentRangeMax(load.value));
const rangeEnabled = computed(() => !!(store.state.allResultsLoaded && rangeTotal.value > 0));
const pendingRange = computed(() => {
  if (!rangeEnabled.value) return null;
  return (
    store.state.pendingViewRange ||
    store.state.viewRange ||
    normalizeViewRange(load.value?.view_range ?? null, rangeTotal.value, true) ||
    { start: 0, end: Math.min(500, rangeTotal.value), max: rangeTotal.value }
  );
});
/** renderDisplayRange's summary, with the in-flight loading line (:2163-2173). */
const rangeSummary = computed(() => {
  const progress = store.progress.displayRange;
  if (progress.loading && progress.range) {
    return buildDisplayRangeLoadingSummary(progress.display, progress.range, rangeTotal.value, (key, params) => t(key, params ?? {}));
  }
  return pendingRange.value
    ? t('v7explore.showingConfigs', {
        count: Math.max(0, pendingRange.value.end - pendingRange.value.start),
        start: pendingRange.value.start + 1,
        end: pendingRange.value.end,
      })
    // legacy default string (v7_pareto_explorer.html:1156, no i18n key)
    : 'Scan all_results to select candidates and enable visible-range filtering.';
});
const rangeSliderStyle = computed(() => ({
  '--range-load-fill': String(store.progress.displayRange.loading ? store.progress.displayRange.display : store.progress.displayRangePercent(pendingRange.value?.end ?? 0, rangeTotal.value)) + '%',
}));

function updatePendingRange(next: { start: number; end: number }): void {
  const normalized = normalizeViewRange({ ...next, max: rangeTotal.value }, rangeTotal.value, true);
  if (!normalized) return;
  store.state.pendingViewRange = normalized;
}

function applyDisplayRange(): void {
  if (!store.state.resultPath || !store.state.allResultsLoaded) return;
  const normalized = normalizeViewRange(store.state.pendingViewRange, rangeTotal.value, true);
  if (!normalized) return;
  store.state.pendingViewRange = { ...normalized };
  store.progress.startDisplayRangeProgress(normalized, rangeTotal.value, store.state.viewRange?.end ?? normalized.start);
  store
    .loadParetoData()
    .then((data) => {
      store.state.viewRange =
        data && data.view_range ? normalizeViewRange(data.view_range, currentRangeMax(data), true) : { ...normalized };
      store.state.pendingViewRange = store.state.viewRange ? { ...store.state.viewRange } : null;
      store.progress.finishDisplayRangeProgress(true, store.state.viewRange?.end ?? null, rangeTotal.value);
    })
    .catch(() => {
      store.progress.finishDisplayRangeProgress(false, store.state.viewRange?.end ?? null, rangeTotal.value);
    });
}

/** Sidebar guards — full handoffs land in M-v7-7 (:4179-4251). */
function requireSelectedConfig(): void {
  store.pushMessage('error', t('v7explore.noSelectedFullConfig'));
}

function goBackToOptimize(): void {
  replaceTopLocation(store.urlFor.backToOptimize());
}

function commandLoad(): void {
  store.loadParetoData().catch(() => {});
}

/** The page-level fullscreen relayout listener (:2768-2779). */
const fullscreenListener = useFullscreenRelayout(() => getPlotly());

onMounted(() => {
  document.title = t('v7explore.pageTitle');
  fullscreenListener.install();
  void store.bootstrapSession();
});

onBeforeUnmount(() => {
  fullscreenListener.dispose();
  surfaces.dispose();
  store.dispose();
});
</script>

<template>
  <MigrationWatermark />
  <DataTipTooltip />
  <AppShell
    class="core-workbench-shell core-workbench-shell--pareto"
    :page-key="readSeedOptimizeVersion() === 'v8' ? 'v8_pareto_explorer' : 'v7_pareto_explorer'"
    :page-title="t('v7explore.paretoExplorer')"
    :page-description="t('v7explore.pageSubtitle')"
    :page-family="readSeedOptimizeVersion() === 'v8' ? 'PBv8' : 'PBv7'"
    :sections="railSections"
    :active-section="store.state.stage"
    @update:section="store.selectStage($event as ParetoStage)"
  >
    <template #status>
      <div class="status-row">
        <span id="result-chip" class="chip sr-only">{{ resultChip }}</span>
        <StatusStrip :label="t('v7explore.result')" :value="resultChip" />
        <span id="mode-chip" :class="modeChipClass">{{ modeChip }}</span>
      </div>
    </template>
    <template #header-actions>
      <IconButton
        class="pbgui-icon-button"
        :icon="PhQuestion"
        :label="t('nav.guide')"
        @click="openParetoHelp"
      />
    </template>

    <div id="page-body">
    <div class="workbench-page-content">
    <!-- Stage nav lives in the workbench rail; this strip carries only the
         session actions (legacy ctx-actions :767-777). -->
    <div class="page-toolbar" role="toolbar">
      <button class="sb-btn" id="btn-back-optimize" @click="goBackToOptimize">
        <span>{{ t('v7explore.backToOptimize') }}</span>
      </button>
      <button class="sb-btn" id="btn-run-backtest" @click="requireSelectedConfig">
        <span>{{ t('v7explore.runBacktest') }}</span>
      </button>
      <button
        v-show="store.isV8.value"
        class="sb-btn"
        id="btn-pin-strategy-baseline"
        :disabled="!store.isV8.value"
        @click="requireSelectedConfig"
      >
        {{ t('v7explore.pinExplorerBaseline') }}
      </button>
      <button class="sb-btn" id="btn-open-strategy-explorer" @click="requireSelectedConfig">
        <span>{{ t('v7explore.strategyExplorer') }}</span>
      </button>
      <button class="sb-btn" id="btn-load-all-results" :disabled="store.state.fullLoadPending" @click="store.loadAllResults()">
        <PbIcon v-if="!store.state.fullLoadPending" :icon="PhFolderOpen" />
        {{ store.state.fullLoadPending ? t('v7explore.scanningAllResults') : 'Scan all_results' }}
      </button>
      <button v-show="store.state.allResultsLoaded" class="sb-btn" id="btn-load-pareto-only" @click="store.loadParetoOnly()">
        <span>{{ t('v7explore.showPassivbotParetos') }}</span>
      </button>
    </div>

      <section class="page-title sr-only">
        <div>
          <h1>{{ t('v7explore.paretoExplorer') }}</h1>
          <p id="page-subtitle">{{ t('v7explore.pageSubtitle') }}</p>
        </div>
      </section>

      <section id="messages" class="messages">
        <div
          v-for="(message, index) in store.state.messages"
          :key="index"
          class="message"
          :class="message.level === 'warning' ? 'warn' : message.level === 'error' ? 'bad' : 'info'"
        >
          {{ message.text }}
        </div>
      </section>

      <section v-if="rangeEnabled" id="display-range-card" class="panel-card range-card">
        <div class="range-header">
          <div>
            <h3>{{ t('v7explore.displayRange') }}</h3>
            <p class="hint">{{ t('v7explore.filterRankedVisible') }}</p>
          </div>
          <span id="display-range-total-chip" class="chip">{{ t('v7explore.selectedCount', { total: rangeTotal }) }}</span>
        </div>
        <div class="range-controls">
          <input
            id="display-range-end"
            class="range-slider"
            :class="{ 'range-loading': store.progress.displayRange.loading }"
            type="range"
            min="0"
            :max="rangeTotal"
            step="10"
            :value="pendingRange?.end ?? 0"
            :style="rangeSliderStyle"
            @input="updatePendingRange({ start: pendingRange?.start ?? 0, end: Number(($event.target as HTMLInputElement).value) || 0 })"
            @change="applyDisplayRange()"
          />
          <input
            id="display-range-start-input"
            class="range-number"
            type="number"
            min="0"
            :max="rangeTotal"
            step="10"
            :value="pendingRange?.start ?? 0"
            @change="updatePendingRange({ start: Number(($event.target as HTMLInputElement).value) || 0, end: pendingRange?.end ?? 0 }); applyDisplayRange()"
          />
          <input
            id="display-range-end-input"
            class="range-number"
            type="number"
            min="0"
            :max="rangeTotal"
            step="10"
            :value="pendingRange?.end ?? 0"
            @change="updatePendingRange({ start: pendingRange?.start ?? 0, end: Number(($event.target as HTMLInputElement).value) || 0 }); applyDisplayRange()"
          />
        </div>
        <div id="display-range-summary" class="range-summary">{{ rangeSummary }}</div>
      </section>

      <section class="metric-grid" id="summary-metrics">
        <div class="metric-card result-metric">
          <div class="label">{{ t('v7explore.result') }}</div>
          <div class="value" id="metric-result">{{ metricResult }}</div>
        </div>
        <div class="metric-card">
          <div class="label">{{ t('v7explore.paretoFront') }}</div>
          <div class="value" id="metric-paretos">{{ metricParetos }}</div>
        </div>
        <div class="metric-card">
          <div class="label">{{ t('v7explore.candidateSet') }}</div>
          <div class="value">
            <span id="metric-all-results">{{ metricAllResults }}</span>
            <!-- shown only once the full load finished (:2436-2439, handoff 4) -->
            <span
              v-show="store.progress.fullLoad.stage === 'loaded'"
              id="metric-full-load-chip"
              :class="fullLoadChipClass"
            >{{ fullLoadLabels[store.progress.fullLoad.stage] }}</span>
          </div>
          <div v-if="store.progress.fullLoad.stage === 'loading' || store.progress.fullLoad.stage === 'error'" class="metric-inline-status" id="metric-full-load-panel">
            <div id="metric-full-load-text" class="load-status-text">{{ store.progress.fullLoad.text }}</div>
            <div class="load-status-progress"><div id="metric-full-load-bar" :style="fullLoadBarStyle"></div></div>
          </div>
        </div>
      </section>

      <section v-show="store.state.stage === 'settings'" id="stage-settings" class="stage-view">
        <div class="stage-grid">
          <div class="stage-block half panel-card">
            <h3>{{ t('v7explore.loadControl') }}</h3>
            <div class="form-grid" style="margin-top: 12px">
              <div class="form-field wide">
                <label for="result-path-input">{{ t('v7explore.resultPath') }}</label>
                <input id="result-path-input" v-model="store.state.resultPathInput" type="text" placeholder="/path/to/optimize/result" />
              </div>
              <div class="form-field">
                <label for="max-configs-input">{{ t('v7explore.maxConfigs') }}</label>
                <input id="max-configs-input" v-model.number="store.state.maxConfigs" type="number" min="100" max="10000" step="100" />
              </div>
              <div class="form-field wide">
                <label for="load-strategy-select">{{ t('v7explore.candidateSelection') }}</label>
                <select id="load-strategy-select" v-model="store.state.loadStrategy" multiple size="7">
                  <option v-for="option in LOAD_STRATEGY_OPTIONS" :key="option" :value="option">{{ option }}</option>
                </select>
              </div>
              <div class="form-field">
                <label>&nbsp;</label>
                <div class="check-row">
                  <input id="persist-defaults-toggle" v-model="store.state.persistDefaults" type="checkbox" />
                  <label for="persist-defaults-toggle">{{ t('v7explore.persistDefaults') }}</label>
                </div>
              </div>
              <div class="form-field full">
                <div class="button-row">
                  <button class="btn primary" id="btn-command-load" @click="commandLoad">
                    {{ t('v7explore.loadResultContext') }}
                  </button>
                </div>
              </div>
              <div class="form-field full">
                <div class="load-status-card" id="full-load-status-card">
                  <div class="load-status-head">
                    <strong>{{ t('v7explore.fullLoadStatus') }}</strong>
                    <span id="full-load-status-chip" :class="fullLoadChipClass">{{ fullLoadLabels[store.progress.fullLoad.stage] }}</span>
                  </div>
                  <div id="full-load-status-text" class="load-status-text">
                    {{ store.progress.fullLoad.text || t('v7explore.scanToSelectCandidates') }}
                  </div>
                  <div class="load-status-progress"><div id="full-load-status-bar" :style="fullLoadBarStyle"></div></div>
                </div>
              </div>
            </div>
          </div>
          <div class="stage-block half panel-card">
            <h3>{{ t('v7explore.resultContext') }}</h3>
            <pre id="result-meta-json">{{ resultMetaJson }}</pre>
          </div>
        </div>
      </section>

      <CommandCenter v-show="store.state.stage === 'command_center'" :store="store" :surfaces="surfaces" />
      <Playground v-show="store.state.stage === 'pareto_playground'" :store="store" :surfaces="surfaces" />

      <!-- M-v7-7: deep-intelligence tab payloads + preset handoffs land here -->
      <section v-show="store.state.stage === 'deep_intelligence'" id="stage-deep-intelligence" class="stage-view">
        <div class="panel-card">
          <div class="deep-tabs">
            <button
              v-for="tab in VALID_DEEP_TABS"
              :key="tab"
              class="deep-tab-btn"
              :class="{ active: store.state.deepTab === tab }"
              :data-deep-tab="tab"
              @click="store.selectDeepTab(tab)"
            >
              {{ t(DEEP_TAB_LABEL[tab]) }}
            </button>
          </div>
          <p class="hint" id="deep-tab-description">{{ t(DEEP_TAB_DESC[store.state.deepTab]) }}</p>
        </div>
        <div class="panel-card" id="deep-tab-active-panel">
          <div class="placeholder-chart" id="deep-tab-placeholder">{{ t('v7explore.tabPlaceholder', { tab: store.state.deepTab }) }}</div>
        </div>
      </section>

      <ConfigDetail v-show="showSharedDetail" :store="store" />
    </div>
    </div>
  </AppShell>
</template>
