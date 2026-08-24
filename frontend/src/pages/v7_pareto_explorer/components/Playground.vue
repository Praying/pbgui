<script setup lang="ts">
/**
 * Pareto Playground stage — renderPlayground (:3300-3394) + markup
 * (:1279-1389): the explorer chart / 3D projection triptych, the chart
 * settings column (viz type, quick views, custom metrics with the
 * currency/weighting filters, color-by, the three best-match weight sliders)
 * and the best-match line. Handlers port :4357-4434.
 */
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ProjectionTriptych from './ProjectionTriptych.vue';
import ScatterChart from './ScatterChart.vue';
import {
  customControlVisibility,
  filterCustomMetrics,
  preservedCustomMetrics,
  quickViewOptionsFor,
  resolveMetricOptions,
} from '../lib/metrics';
import { getPlotly } from '../lib/plotlyVendor';
import { bestMatchText, playgroundMetricSummary } from '../lib/viewModels';
import type { ParetoStore } from '../composables/useParetoSession';
import type { Surfaces } from '../composables/useSurfaces';
import type { ChartSpec, PlaygroundMetrics } from '../types';

const props = defineProps<{
  store: ParetoStore;
  surfaces: Surfaces;
}>();

const { t } = useI18n();
const store = props.store;
const pg = store.state.playground;

const payload = computed(() => pg.payload);
const bestMatchIndex = computed(() => payload.value?.best_match?.config_index ?? null);
const availableMetrics = computed<string[]>(() => (Array.isArray(payload.value?.available_metrics) ? payload.value!.available_metrics! : []));

const isRadar = computed(() => pg.vizType === 'Radar Chart');
const isProjections = computed(() => pg.vizType === '3D Projections');
const visibility = computed(() => customControlVisibility(pg.quickView, pg.vizType));

/** The main figure — scatter_3d / radar / scatter_2d by viz type (:3384-3388). */
const mainSpec = computed<ChartSpec | null>(() => {
  const viz = payload.value?.visualizations;
  if (!viz) return null;
  if (pg.vizType === '3D Scatter') return (viz.scatter_3d as ChartSpec | undefined) ?? null;
  if (pg.vizType === 'Radar Chart') return (viz.radar as ChartSpec | undefined) ?? null;
  return (viz.scatter_2d as ChartSpec | undefined) ?? null;
});

const quickViewOptions = computed(() => quickViewOptionsFor(pg.vizType));

/** updatePlaygroundCustomUi's option lists (:2076-2079). */
const customAvailable = computed(() =>
  filterCustomMetrics(availableMetrics.value, {
    allowMixedCurrency: pg.allowMixedCurrency,
    useBtc: pg.useBtc,
    allowMixedWeighted: pg.allowMixedWeighted,
    useWeighted: pg.useWeighted,
  })
);
const payloadMetrics = computed<PlaygroundMetrics>(() => payload.value?.metrics || {});
const customX = computed(() => resolveMetricOptions(customAvailable.value, pg.customXMetric, payloadMetrics.value.x_metric || ''));
const customY = computed(() => resolveMetricOptions(customAvailable.value, pg.customYMetric, payloadMetrics.value.y_metric || ''));
const customZ = computed(() => resolveMetricOptions(customAvailable.value, pg.customZMetric, payloadMetrics.value.z_metric || ''));

/** The color select shows None first; a vanished metric falls back to None (:3345-3352). */
const colorOptions = computed(() => ['None', ...availableMetrics.value]);
const colorValue = computed(() => (colorOptions.value.includes(pg.colorMetric) ? pg.colorMetric : 'None'));

const metricSummary = computed(() =>
  payload.value ? playgroundMetricSummary(payload.value) : t('v7explore.multipleVisualizationModes')
);
const bestMatchLine = computed(() => (payload.value ? bestMatchText(payload.value, (key, params) => t(key, params ?? {})) : t('v7explore.loadToComputeBestMatch')));

/** :4384-4391 — viz switch + radar quick-view reset. */
function onVizTypeChange(event: Event): void {
  const value = String((event.target as HTMLSelectElement).value || '2D Scatter');
  pg.vizType = value;
  if (pg.vizType === 'Radar Chart' && !['Top Comparison', 'Risk Profile'].includes(pg.quickView)) {
    pg.quickView = 'Top Comparison';
  }
  props.surfaces.refreshPlaygroundFromSettings();
}

/** :4398-4407 — quick-view switch; entering Custom preserves the payload axes. */
function onQuickViewChange(event: Event): void {
  const previous = pg.quickView;
  pg.quickView = String((event.target as HTMLSelectElement).value || 'Profit vs Risk');
  if (pg.quickView === 'Custom...' && previous !== 'Custom...') {
    const preserved = preservedCustomMetrics(payloadMetrics.value, pg.vizType);
    if (preserved.x) pg.customXMetric = preserved.x;
    if (preserved.y) pg.customYMetric = preserved.y;
    pg.customZMetric = preserved.z;
  }
  props.surfaces.refreshPlaygroundFromSettings();
}

/** :4357-4369 — the three weight sliders share one debounced refresh. */
function onWeightInput(): void {
  props.surfaces.schedulePlaygroundRefresh(120);
}

/** :4423-4434 — custom axes only refresh Custom quick views. */
function onCustomMetricChange(field: 'customXMetric' | 'customYMetric' | 'customZMetric', event: Event): void {
  pg[field] = String((event.target as HTMLSelectElement).value || '');
  if (pg.quickView === 'Custom...') props.surfaces.refreshPlaygroundFromSettings();
}

/** resizePlaygroundCharts (:2233-2242, :4146-4150). */
function resizeCharts(): void {
  const plotly = getPlotly();
  if (!plotly) return;
  for (const id of ['playground-chart', 'playground-chart-proj-xy', 'playground-chart-proj-xz', 'playground-chart-proj-yz']) {
    const node = document.getElementById(id);
    if (!node || !node.classList || node.classList.contains('placeholder-chart')) continue;
    try {
      plotly.Plots.resize(node);
    } catch {
      // legacy swallows resize failures
    }
  }
}

watch(
  () => store.state.stage,
  (stage) => {
    if (stage === 'pareto_playground') {
      requestAnimationFrame(() => setTimeout(resizeCharts, 80));
    }
  }
);
</script>

<template>
  <section id="stage-pareto-playground" class="stage-view">
    <div class="compact-three-col grid items-start grid-cols-[1fr_1fr_340px] gap-3 max-[900px]:grid-cols-1">
      <div class="chart-card panel-card min-w-0 rounded-xl border border-border-default bg-panel p-3.5" style="grid-column: span 2">
        <div class="title-row flex flex-wrap items-center justify-between gap-3">
          <h3 class="mb-2">{{ t('v7explore.explorer') }}</h3>
          <label id="playground-projection-layout-wrap" v-show="isProjections" class="inline-switch inline-flex items-center gap-2.5 text-sm text-secondary select-none">
            <span>{{ t('v7explore.sideBySide') }}</span>
            <input
              id="playground-projection-layout-row"
              class="absolute pointer-events-none opacity-0"
              :checked="pg.projectionLayout === 'row'"
              type="checkbox"
              role="switch"
              aria-label="Show projections side by side"
              @change="pg.projectionLayout = ($event.target as HTMLInputElement).checked ? 'row' : 'stacked'"
            />
            <span class="switch-track relative h-6 w-11 shrink-0 rounded-full border border-border-default bg-white/18 transition-[background-color,border-color] duration-180 ease-[ease]" aria-hidden="true"></span>
          </label>
        </div>
        <p class="muted-line text-secondary" id="playground-metric-summary">{{ metricSummary }}</p>
        <div class="chart-wrap relative overflow-hidden min-w-0" id="playground-chart-wrap" v-show="!isProjections">
          <ScatterChart
            chart-id="playground-chart"
            :spec="mainSpec"
            placeholder-key="v7explore.loadToRenderExplorerChart"
            click-selects-config
            :best-match-index="bestMatchIndex"
            @plot-click="surfaces.loadConfigDetail($event).catch(() => {})"
          />
        </div>
        <!-- legacy keeps the stack in the DOM hidden (:3319/:3370) — charts only
             plot once 3D Projections supplies their figures -->
        <ProjectionTriptych v-show="isProjections" :store="store" :surfaces="surfaces" />
      </div>
      <div class="chart-card panel-card min-w-0 rounded-xl border border-border-default bg-panel p-3.5">
        <h3 class="mb-2">{{ t('v7explore.chartSettings') }}</h3>
        <div class="form-grid grid grid-cols-[repeat(12,minmax(0,1fr))] gap-3" style="margin-top: 12px">
          <div class="form-field full col-span-12 flex flex-col gap-1.5">
            <label for="playground-viz-type" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.visualization') }}</label>
            <select id="playground-viz-type" class="min-h-8 rounded-lg border border-border-default bg-elevated px-2.5 py-1.5 text-primary focus:border-accent focus:outline-none" :value="pg.vizType" @change="onVizTypeChange">
              <option value="2D Scatter">2D Scatter</option>
              <option value="3D Scatter">3D Scatter (WebGL)</option>
              <option value="3D Projections">3D Projections (2D)</option>
              <option value="Radar Chart">Radar Chart</option>
            </select>
          </div>
          <div id="playground-show-all-wrap" v-show="!isRadar" class="form-field full col-span-12 flex flex-col gap-1.5">
            <div class="check-row flex min-h-8 items-center gap-2 text-secondary">
              <input id="playground-show-all" class="h-4 w-4" v-model="pg.showAll" type="checkbox" @change="surfaces.refreshPlaygroundFromSettings()" />
              <label for="playground-show-all" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.showAllConfigs') }}</label>
            </div>
          </div>
          <div id="playground-use-weighted-wrap" v-show="!isRadar" class="form-field full col-span-12 flex flex-col gap-1.5">
            <div class="check-row flex min-h-8 items-center gap-2 text-secondary">
              <input id="playground-use-weighted" class="h-4 w-4" v-model="pg.useWeighted" type="checkbox" @change="surfaces.refreshPlaygroundFromSettings()" />
              <label for="playground-use-weighted" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.useWeightedMetrics') }}</label>
            </div>
          </div>
          <div id="playground-use-btc-wrap" v-show="!isRadar" class="form-field full col-span-12 flex flex-col gap-1.5">
            <div class="check-row flex min-h-8 items-center gap-2 text-secondary">
              <input id="playground-use-btc" class="h-4 w-4" v-model="pg.useBtc" type="checkbox" @change="surfaces.refreshPlaygroundFromSettings()" />
              <label for="playground-use-btc" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.useBtcInsteadOfUsd') }}</label>
            </div>
          </div>
          <div class="form-field full col-span-12 flex flex-col gap-1.5">
            <label for="playground-quick-view" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.quickViews') }}</label>
            <select id="playground-quick-view" class="min-h-8 rounded-lg border border-border-default bg-elevated px-2.5 py-1.5 text-primary focus:border-accent focus:outline-none" :value="pg.quickView" @change="onQuickViewChange">
              <option v-for="option in quickViewOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </div>
          <div id="playground-custom-controls" v-show="visibility.showCustom" class="form-field full col-span-12 flex flex-col gap-1.5">
            <div class="load-status-card flex flex-col gap-2 rounded-xl border border-border-default bg-white/2 p-3">
              <div class="load-status-head flex items-center justify-between gap-2">
                <strong>{{ t('v7explore.customMetrics') }}</strong>
              </div>
              <div id="playground-custom-filters" v-show="visibility.showFilters" class="stack flex flex-col gap-3" style="gap: 8px">
                <div class="check-row flex min-h-8 items-center gap-2 text-secondary">
                  <input id="playground-allow-mixed-weighted" class="h-4 w-4" v-model="pg.allowMixedWeighted" type="checkbox" @change="pg.quickView === 'Custom...' && surfaces.refreshPlaygroundFromSettings()" />
                  <label for="playground-allow-mixed-weighted" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.allowMixedWeighted') }}</label>
                </div>
                <div class="check-row flex min-h-8 items-center gap-2 text-secondary">
                  <input id="playground-allow-mixed-currency" class="h-4 w-4" v-model="pg.allowMixedCurrency" type="checkbox" @change="pg.quickView === 'Custom...' && surfaces.refreshPlaygroundFromSettings()" />
                  <label for="playground-allow-mixed-currency" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.allowMixedCurrency') }}</label>
                </div>
              </div>
              <div class="stack flex flex-col gap-3" style="gap: 10px; margin-top: 8px">
                <div class="form-field full col-span-12 flex flex-col gap-1.5" style="gap: 6px">
                  <label for="playground-custom-x-metric" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.xAxis') }}</label>
                  <select id="playground-custom-x-metric" class="min-h-8 rounded-lg border border-border-default bg-elevated px-2.5 py-1.5 text-primary focus:border-accent focus:outline-none" :value="customX.value" @change="onCustomMetricChange('customXMetric', $event)">
                    <option v-for="option in customX.options" :key="option" :value="option">{{ option }}</option>
                  </select>
                </div>
                <div class="form-field full col-span-12 flex flex-col gap-1.5" style="gap: 6px">
                  <label for="playground-custom-y-metric" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.yAxis') }}</label>
                  <select id="playground-custom-y-metric" class="min-h-8 rounded-lg border border-border-default bg-elevated px-2.5 py-1.5 text-primary focus:border-accent focus:outline-none" :value="customY.value" @change="onCustomMetricChange('customYMetric', $event)">
                    <option v-for="option in customY.options" :key="option" :value="option">{{ option }}</option>
                  </select>
                </div>
                <div id="playground-custom-z-wrap" v-show="visibility.showZ" class="form-field full col-span-12 flex flex-col gap-1.5" style="gap: 6px">
                  <label for="playground-custom-z-metric" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.zAxis') }}</label>
                  <select id="playground-custom-z-metric" class="min-h-8 rounded-lg border border-border-default bg-elevated px-2.5 py-1.5 text-primary focus:border-accent focus:outline-none" :value="customZ.value" @change="onCustomMetricChange('customZMetric', $event)">
                    <option v-for="option in customZ.options" :key="option" :value="option">{{ option }}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div id="playground-color-metric-wrap" v-show="!isRadar" class="form-field full col-span-12 flex flex-col gap-1.5">
            <label for="playground-color-metric" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.colorBy') }}</label>
            <select id="playground-color-metric" class="min-h-8 rounded-lg border border-border-default bg-elevated px-2.5 py-1.5 text-primary focus:border-accent focus:outline-none" :value="colorValue" @change="pg.colorMetric = String(($event.target as HTMLSelectElement).value || 'None'); surfaces.refreshPlaygroundFromSettings()">
              <option v-for="option in colorOptions" :key="option" :value="option">{{ option === 'None' ? t('common.none') : option }}</option>
            </select>
          </div>
          <div class="form-field full col-span-12 flex flex-col gap-1.5">
            <label for="playground-perf-weight" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.performancePriority') }}</label>
            <input id="playground-perf-weight" class="min-h-8 rounded-lg border border-border-default px-2.5 py-1.5 text-primary" v-model.number="pg.perfWeight" type="range" min="0" max="100" step="5" @input="onWeightInput" />
            <div class="muted-line text-secondary" id="playground-perf-weight-value">{{ pg.perfWeight }}</div>
          </div>
          <div class="form-field full col-span-12 flex flex-col gap-1.5">
            <label for="playground-risk-weight" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.riskAversion') }}</label>
            <input id="playground-risk-weight" class="min-h-8 rounded-lg border border-border-default px-2.5 py-1.5 text-primary" v-model.number="pg.riskWeight" type="range" min="0" max="100" step="5" @input="onWeightInput" />
            <div class="muted-line text-secondary" id="playground-risk-weight-value">{{ pg.riskWeight }}</div>
          </div>
          <div class="form-field full col-span-12 flex flex-col gap-1.5">
            <label for="playground-robust-weight" class="text-xs text-secondary uppercase tracking-[0.05em]">{{ t('v7explore.robustnessImportance') }}</label>
            <input id="playground-robust-weight" class="min-h-8 rounded-lg border border-border-default px-2.5 py-1.5 text-primary" v-model.number="pg.robustWeight" type="range" min="0" max="100" step="5" @input="onWeightInput" />
            <div class="muted-line text-secondary" id="playground-robust-weight-value">{{ pg.robustWeight }}</div>
          </div>
          <div class="form-field full col-span-12 flex flex-col gap-1.5"><div class="button-row flex flex-wrap gap-2"></div></div>
        </div>
        <div style="margin-top: 12px">
          <h4 class="mb-2">{{ t('v7explore.bestMatch') }}</h4>
          <p class="muted-line text-secondary" id="playground-best-match">{{ bestMatchLine }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* The switch knob pseudo-element and the :checked / :focus-visible sibling
   states ported from styles/pareto-base.css — pseudo-elements and sibling
   combinators can't be utilities. The track's static styling lives on the
   element as utilities; these un-layered rules override them when the state
   applies (un-layered CSS beats @layer utilities). */
.switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #f2f5fb /* switch knob */;
  transition: transform 0.18s ease;
  box-shadow: 0 1px 3px rgba(5, 8, 14, 0.35);
}

.inline-switch input:checked + .switch-track {
  background: rgb(var(--accent-rgb) / 0.35);
  border-color: var(--accent);
}

.inline-switch input:checked + .switch-track::after {
  transform: translateX(20px);
}

.inline-switch input:focus-visible + .switch-track {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
