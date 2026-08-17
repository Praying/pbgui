<script setup lang="ts">
/**
 * Pareto Explorer page scaffold — the Vue port of
 * frontend/v7_pareto_explorer.html (4,791 L). M-v7-5 covers the scaffold +
 * bootstrap/load + route state; M-v7-6 lands the command center, config
 * detail and playground charts; M-v7-7 the deep intelligence tabs and preset
 * handoffs. Legacy line refs below are provenance.
 *
 * ┌────────────────────────────┬─ Legacy regions ───────────────────────────┐
 * │ App (this scaffold)        │ markup :1096-1257, boot :4730-4752,        │
 * │                            │ selectStage :4132-4160, route state        │
 * │                            │ :1794-1804/:4123-4130                      │
 * │ useParetoSession           │ state :1656-1738, optimizeVersion          │
 * │                            │ :1765-1791, renderSession state layer      │
 * │                            │ :3895-3984, applyLoadData :4502-4570,      │
 * │                            │ loadParetoData :4588-4691, bootstrap       │
 * │                            │ :4693-4726, sidebar scans :2838-2883       │
 * │ useLoadProgress            │ full-load :2414-2555, display range        │
 * │                            │ :2157-2214                                 │
 * │ lib/paretoUrls             │ api bases + main_page builders :1782-1844, │
 * │                            │ back-to-optimize #results :4482-4487       │
 * │ lib/{viewRange,loadRequest,│ normalizeViewRange :1986-2007, /load body  │
 * │  loadSummary}              │ :4625-4660, result context :2557-2576      │
 * │ M-v7-6/7 placeholders      │ command center :1234-1277, playground      │
 * │                            │ :1279+, deep intelligence :1392+           │
 * └────────────────────────────┴───────────────────────────────────────────┘
 *
 * FLAVOR: runtime, not pathname — see config.ts. The nav subtitle/current
 * are computed ONCE at boot from the ?optimize_version= seed (index.html,
 * legacy :4732-4733); a mid-session version flip updates buttons and URL
 * builders but not the nav highlight (legacy quirk, preserved + documented).
 */
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import { replaceTopLocation } from '@/shared/nav';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import { useParetoSession } from './composables/useParetoSession';
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
import { currentRangeMax, normalizeViewRange } from './lib/viewRange';
import type { DeepTab, LoadData, ParetoStage } from './types';

const { t } = useI18n();

const boot = getBoot();
const store = useParetoSession({
  apiBase: paretoApiBase(boot.origin),
  origin: boot.origin,
  seedVersion: readSeedOptimizeVersion(),
  resultPath: readResultPath(),
  route: readRouteState(),
  t: (key, params) => t(key, params ?? {}),
});

const STAGE_META: Record<ParetoStage, { icon: string; labelKey: string }> = {
  command_center: { icon: '🏛', labelKey: 'v7explore.overview' },
  pareto_playground: { icon: '🎯', labelKey: 'v7explore.explorer' },
  deep_intelligence: { icon: '🧠', labelKey: 'v7explore.deepIntelligence' },
  settings: { icon: '⚙️', labelKey: 'v7explore.settings' },
};

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

/** Top chips (:3958-3964, transient states :2852/:2878). */
const resultChip = computed(() => (result.value ? result.value.name || '' : t('v7explore.noResultSelected')));
const modeChip = computed(() => {
  if (store.state.fullLoadPending) return t('v7explore.loadingFullResult');
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
const modeChipClass = computed(() => 'status-chip ' + (valid.value || store.state.fullLoadPending ? 'good' : 'warn'));

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
const rangeSummary = computed(() =>
  pendingRange.value
    ? t('v7explore.showingConfigs', {
        count: Math.max(0, pendingRange.value.end - pendingRange.value.start),
        start: pendingRange.value.start + 1,
        end: pendingRange.value.end,
      })
    // legacy default string (v7_pareto_explorer.html:1156, no i18n key)
    : 'Scan all_results to select candidates and enable visible-range filtering.'
);
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

declare global {
  interface Window {
    PBGuiSidebarResize?: {
      init(options: { sidebarId: string; handleId: string; minWidth: number; maxWidth: number }): void;
    };
  }
}

onMounted(() => {
  document.title = t('v7explore.pageTitle');
  // initSidebarResize (:4497-4500) — after mount, when #sidebar exists
  window.PBGuiSidebarResize?.init({ sidebarId: 'sidebar', handleId: 'sidebar-resize', minWidth: 140, maxWidth: 300 });
  void store.bootstrapSession();
});

onBeforeUnmount(() => {
  store.dispose();
});
</script>

<template>
  <MigrationWatermark />
  <nav id="topnav"></nav>

  <div id="page-body">
    <aside id="sidebar">
      <div id="sidebar-inner">
        <button
          v-for="stage in VALID_STAGES"
          :key="stage"
          class="sb-section"
          :class="{ active: store.state.stage === stage }"
          :data-stage="stage"
          @click="store.selectStage(stage)"
        >
          <span class="sb-icon">{{ STAGE_META[stage].icon }}</span> <span>{{ t(STAGE_META[stage].labelKey) }}</span>
        </button>

        <hr class="sb-sep" />

        <div class="ctx-actions" style="display: block">
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
            {{ store.state.fullLoadPending ? t('v7explore.scanningAllResults') : '📂 Scan all_results' }}
          </button>
          <button v-show="store.state.allResultsLoaded" class="sb-btn" id="btn-load-pareto-only" @click="store.loadParetoOnly()">
            <span>{{ t('v7explore.showPassivbotParetos') }}</span>
          </button>
        </div>
      </div>
      <div id="sidebar-resize"></div>
    </aside>

    <main id="main-content">
      <section class="page-title">
        <div>
          <h1>{{ t('v7explore.paretoExplorer') }}</h1>
          <p id="page-subtitle">{{ t('v7explore.pageSubtitle') }}</p>
        </div>
        <div class="status-row">
          <span id="result-chip" class="chip">{{ resultChip }}</span>
          <span id="mode-chip" :class="modeChipClass">{{ modeChip }}</span>
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
            <span v-show="false" id="metric-full-load-chip" class="status-chip warn">{{ t('v7explore.idle') }}</span>
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

      <section v-show="store.state.stage === 'command_center'" id="stage-command-center" class="stage-view">
        <div class="stage-grid">
          <div class="stage-block half panel-card">
            <h3>{{ t('v7explore.topChampions') }}</h3>
            <div id="champion-list" class="champion-list">
              <div class="placeholder-panel">{{ t('v7explore.loadToInspectChampions') }}</div>
            </div>
          </div>
          <div class="stage-block half panel-card">
            <h3>{{ t('v7explore.insights') }}</h3>
            <div id="insight-list" class="insight-list">
              <div class="placeholder-panel">{{ t('v7explore.insightsWillAppear') }}</div>
            </div>
          </div>
          <div class="stage-block panel-card">
            <h3>{{ t('v7explore.paretoFrontPreview') }}</h3>
            <div class="toolbar" style="margin-bottom: 12px">
              <div class="check-row" style="max-width: 280px">
                <input id="preview-use-weighted" v-model="store.state.previewUseWeighted" type="checkbox" />
                <label for="preview-use-weighted">{{ t('v7explore.useWeightedMetrics') }}</label>
              </div>
              <div class="check-row" style="max-width: 260px">
                <input id="preview-show-all" v-model="store.state.previewShowAll" type="checkbox" />
                <label for="preview-show-all">{{ t('v7explore.showAllConfigs') }}</label>
              </div>
            </div>
            <div class="preview-grid">
              <div class="chart-card">
                <p class="muted-line" id="preview-left-summary">{{ t('v7explore.paretoPreviewWillAppear') }}</p>
                <div class="chart-wrap" id="preview-pareto-wrap">
                  <div class="placeholder-chart small-chart" id="preview-pareto-chart">{{ t('v7explore.loadToRenderParetoPreview') }}</div>
                </div>
              </div>
              <div class="chart-card">
                <p class="muted-line" id="preview-right-summary">{{ t('v7explore.robustnessPreviewWillAppear') }}</p>
                <div class="chart-wrap" id="preview-robustness-wrap">
                  <div class="placeholder-chart small-chart" id="preview-robustness-chart">{{ t('v7explore.loadToRenderRobustnessPreview') }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-show="store.state.stage === 'pareto_playground'" id="stage-pareto-playground" class="stage-view">
        <div class="compact-three-col">
          <div class="chart-card panel-card" style="grid-column: span 2">
            <div class="title-row">
              <h3>{{ t('v7explore.explorer') }}</h3>
            </div>
            <p class="muted-line" id="playground-metric-summary">{{ t('v7explore.multipleVisualizationModes') }}</p>
            <div class="chart-wrap" id="playground-chart-wrap">
              <div id="playground-chart" class="placeholder-chart small-chart">{{ t('v7explore.loadToRenderExplorerChart') }}</div>
            </div>
          </div>
          <div class="chart-card panel-card">
            <h3>{{ t('v7explore.chartSettings') }}</h3>
            <!-- M-v7-6 lands the full chart-settings column -->
            <p class="muted-line">Chart settings arrive with the playground charts migration.</p>
          </div>
        </div>
      </section>

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
    </main>
  </div>
</template>
