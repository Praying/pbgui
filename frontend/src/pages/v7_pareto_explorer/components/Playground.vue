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
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
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

/** The visualization listbox — labels carry the renderer hint (:1282-1287). */
const VIZ_OPTIONS = [
  { value: '2D Scatter', label: '2D Scatter' },
  { value: '3D Scatter', label: '3D Scatter (WebGL)' },
  { value: '3D Projections', label: '3D Projections (2D)' },
  { value: 'Radar Chart', label: 'Radar Chart' },
] as const;
const vizTypeLabel = computed(() => VIZ_OPTIONS.find((option) => option.value === pg.vizType)?.label ?? pg.vizType);

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
function onVizTypeChange(value: unknown): void {
  pg.vizType = String(value || '2D Scatter');
  if (pg.vizType === 'Radar Chart' && !['Top Comparison', 'Risk Profile'].includes(pg.quickView)) {
    pg.quickView = 'Top Comparison';
  }
  props.surfaces.refreshPlaygroundFromSettings();
}

/** :4398-4407 — quick-view switch; entering Custom preserves the payload axes. */
function onQuickViewChange(value: unknown): void {
  const previous = pg.quickView;
  pg.quickView = String(value || 'Profit vs Risk');
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
function onCustomMetricChange(field: 'customXMetric' | 'customYMetric' | 'customZMetric', value: unknown): void {
  pg[field] = String(value || '');
  if (pg.quickView === 'Custom...') props.surfaces.refreshPlaygroundFromSettings();
}

/** The side-by-side switch maps the projectionLayout enum onto a boolean. */
const projectionLayoutRow = computed<boolean>({
  get: () => pg.projectionLayout === 'row',
  set: (value) => {
    pg.projectionLayout = value ? 'row' : 'stacked';
  },
});

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
          <label id="playground-projection-layout-wrap" v-show="isProjections" class="inline-flex cursor-pointer items-center gap-2.5 text-sm text-secondary select-none">
            <span>{{ t('v7explore.sideBySide') }}</span>
            <Switch
              id="playground-projection-layout-row"
              v-model="projectionLayoutRow"
              aria-label="Show projections side by side"
            />
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
            <Label id="playground-viz-type-label">{{ t('v7explore.visualization') }}</Label>
            <SelectRoot :model-value="pg.vizType" @update:model-value="onVizTypeChange">
              <SelectTrigger id="playground-viz-type" aria-labelledby="playground-viz-type-label">
                <span>{{ vizTypeLabel }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in VIZ_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</SelectItem>
              </SelectContent>
            </SelectRoot>
          </div>
          <div id="playground-show-all-wrap" v-show="!isRadar" class="form-field full col-span-12 flex flex-col gap-1.5">
            <div class="check-row flex min-h-8 items-center gap-2 text-secondary">
              <Checkbox id="playground-show-all" v-model="pg.showAll" @update:model-value="surfaces.refreshPlaygroundFromSettings()" />
              <Label for="playground-show-all">{{ t('v7explore.showAllConfigs') }}</Label>
            </div>
          </div>
          <div id="playground-use-weighted-wrap" v-show="!isRadar" class="form-field full col-span-12 flex flex-col gap-1.5">
            <div class="check-row flex min-h-8 items-center gap-2 text-secondary">
              <Checkbox id="playground-use-weighted" v-model="pg.useWeighted" @update:model-value="surfaces.refreshPlaygroundFromSettings()" />
              <Label for="playground-use-weighted">{{ t('v7explore.useWeightedMetrics') }}</Label>
            </div>
          </div>
          <div id="playground-use-btc-wrap" v-show="!isRadar" class="form-field full col-span-12 flex flex-col gap-1.5">
            <div class="check-row flex min-h-8 items-center gap-2 text-secondary">
              <Checkbox id="playground-use-btc" v-model="pg.useBtc" @update:model-value="surfaces.refreshPlaygroundFromSettings()" />
              <Label for="playground-use-btc">{{ t('v7explore.useBtcInsteadOfUsd') }}</Label>
            </div>
          </div>
          <div class="form-field full col-span-12 flex flex-col gap-1.5">
            <Label id="playground-quick-view-label">{{ t('v7explore.quickViews') }}</Label>
            <SelectRoot :model-value="pg.quickView" @update:model-value="onQuickViewChange">
              <SelectTrigger id="playground-quick-view" aria-labelledby="playground-quick-view-label">
                <span>{{ pg.quickView }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in quickViewOptions" :key="option" :value="option">{{ option }}</SelectItem>
              </SelectContent>
            </SelectRoot>
          </div>
          <div id="playground-custom-controls" v-show="visibility.showCustom" class="form-field full col-span-12 flex flex-col gap-1.5">
            <div class="load-status-card flex flex-col gap-2 rounded-xl border border-border-default bg-white/2 p-3">
              <div class="load-status-head flex items-center justify-between gap-2">
                <strong>{{ t('v7explore.customMetrics') }}</strong>
              </div>
              <div id="playground-custom-filters" v-show="visibility.showFilters" class="stack flex flex-col gap-3" style="gap: 8px">
                <div class="check-row flex min-h-8 items-center gap-2 text-secondary">
                  <Checkbox id="playground-allow-mixed-weighted" v-model="pg.allowMixedWeighted" @update:model-value="pg.quickView === 'Custom...' && surfaces.refreshPlaygroundFromSettings()" />
                  <Label for="playground-allow-mixed-weighted">{{ t('v7explore.allowMixedWeighted') }}</Label>
                </div>
                <div class="check-row flex min-h-8 items-center gap-2 text-secondary">
                  <Checkbox id="playground-allow-mixed-currency" v-model="pg.allowMixedCurrency" @update:model-value="pg.quickView === 'Custom...' && surfaces.refreshPlaygroundFromSettings()" />
                  <Label for="playground-allow-mixed-currency">{{ t('v7explore.allowMixedCurrency') }}</Label>
                </div>
              </div>
              <div class="stack flex flex-col gap-3" style="gap: 10px; margin-top: 8px">
                <div class="form-field full col-span-12 flex flex-col gap-1.5" style="gap: 6px">
                  <Label id="playground-custom-x-metric-label">{{ t('v7explore.xAxis') }}</Label>
                  <SelectRoot :model-value="customX.value" @update:model-value="onCustomMetricChange('customXMetric', $event)">
                    <SelectTrigger id="playground-custom-x-metric" aria-labelledby="playground-custom-x-metric-label">
                      <span>{{ customX.value }}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="option in customX.options" :key="option" :value="option">{{ option }}</SelectItem>
                    </SelectContent>
                  </SelectRoot>
                </div>
                <div class="form-field full col-span-12 flex flex-col gap-1.5" style="gap: 6px">
                  <Label id="playground-custom-y-metric-label">{{ t('v7explore.yAxis') }}</Label>
                  <SelectRoot :model-value="customY.value" @update:model-value="onCustomMetricChange('customYMetric', $event)">
                    <SelectTrigger id="playground-custom-y-metric" aria-labelledby="playground-custom-y-metric-label">
                      <span>{{ customY.value }}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="option in customY.options" :key="option" :value="option">{{ option }}</SelectItem>
                    </SelectContent>
                  </SelectRoot>
                </div>
                <div id="playground-custom-z-wrap" v-show="visibility.showZ" class="form-field full col-span-12 flex flex-col gap-1.5" style="gap: 6px">
                  <Label id="playground-custom-z-metric-label">{{ t('v7explore.zAxis') }}</Label>
                  <SelectRoot :model-value="customZ.value" @update:model-value="onCustomMetricChange('customZMetric', $event)">
                    <SelectTrigger id="playground-custom-z-metric" aria-labelledby="playground-custom-z-metric-label">
                      <span>{{ customZ.value }}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="option in customZ.options" :key="option" :value="option">{{ option }}</SelectItem>
                    </SelectContent>
                  </SelectRoot>
                </div>
              </div>
            </div>
          </div>
          <div id="playground-color-metric-wrap" v-show="!isRadar" class="form-field full col-span-12 flex flex-col gap-1.5">
            <Label id="playground-color-metric-label">{{ t('v7explore.colorBy') }}</Label>
            <SelectRoot :model-value="colorValue" @update:model-value="pg.colorMetric = String($event || 'None'); surfaces.refreshPlaygroundFromSettings()">
              <SelectTrigger id="playground-color-metric" aria-labelledby="playground-color-metric-label">
                <span>{{ colorValue === 'None' ? t('common.none') : colorValue }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in colorOptions" :key="option" :value="option">{{ option === 'None' ? t('common.none') : option }}</SelectItem>
              </SelectContent>
            </SelectRoot>
          </div>
          <div class="form-field full col-span-12 flex flex-col gap-1.5">
            <Label id="playground-perf-weight-label">{{ t('v7explore.performancePriority') }}</Label>
            <Slider id="playground-perf-weight" v-model="pg.perfWeight" :label="t('v7explore.performancePriority')" :min="0" :max="100" :step="5" @update:model-value="onWeightInput" />
            <div class="muted-line text-secondary" id="playground-perf-weight-value">{{ pg.perfWeight }}</div>
          </div>
          <div class="form-field full col-span-12 flex flex-col gap-1.5">
            <Label id="playground-risk-weight-label">{{ t('v7explore.riskAversion') }}</Label>
            <Slider id="playground-risk-weight" v-model="pg.riskWeight" :label="t('v7explore.riskAversion')" :min="0" :max="100" :step="5" @update:model-value="onWeightInput" />
            <div class="muted-line text-secondary" id="playground-risk-weight-value">{{ pg.riskWeight }}</div>
          </div>
          <div class="form-field full col-span-12 flex flex-col gap-1.5">
            <Label id="playground-robust-weight-label">{{ t('v7explore.robustnessImportance') }}</Label>
            <Slider id="playground-robust-weight" v-model="pg.robustWeight" :label="t('v7explore.robustnessImportance')" :min="0" :max="100" :step="5" @update:model-value="onWeightInput" />
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
