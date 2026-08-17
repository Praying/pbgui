<script setup lang="ts">
/**
 * Pareto Plotly chart target — the DOM half of renderPreview (:2924-2941),
 * renderPlayground (:3389-3392) and the projection triptych (:3379-3381):
 * newPlot + rememberChartHeight + bindPlotClick per figure, plus the
 * fullscreen modebar button (:2704-2721). The react fast-path decision lives
 * in useChartState.choosePlotRenderer (:2313) — legacy used newPlot for these
 * surfaces and react only in renderStableDeepPlot, so this wrapper renders
 * through Plotly.newPlot exactly like they did (fast-path parity is kept in
 * useChartState for the deep plots of M-v7-7).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { bindPlotClick, clearPlotClick } from '../lib/plotClick';
import { darkPlotLayout, previewPlotLayout } from '../lib/plotLayout';
import { getPlotly, paretoPlotlyConfig, type PlotlyLayout, type PlotlyTrace } from '../lib/plotlyVendor';
import { fitChartToWrap, rememberChartHeight } from '../composables/useChartState';
import type { ChartSpec } from '../types';

const props = withDefaults(
  defineProps<{
    chartId: string;
    /** The figure spec; null/empty renders the placeholder (:2895-2902). */
    spec: ChartSpec | null;
    /** i18n key shown while no figure exists. */
    placeholderKey: string;
    /** Preview figures get the lifted legend + 750px floor (:2914-2923). */
    isPreview?: boolean;
    /** Projections fit to their wrap before remembering height (:3379). */
    fitToWrap?: boolean;
    /** Clicking a point opens that config's detail. */
    clickSelectsConfig?: boolean;
    /** Resolves the Best Match trace name to an index (:2807-2809). */
    bestMatchIndex?: number | null;
  }>(),
  { isPreview: false, fitToWrap: false, clickSelectsConfig: false, bestMatchIndex: null }
);

const emit = defineEmits<{ (e: 'plot-click', configIndex: number): void }>();
const { t } = useI18n();
const el = ref<HTMLElement | null>(null);

const hasChart = computed(() => !!(props.spec && Array.isArray(props.spec.traces) && props.spec.traces.length));

function layout(): PlotlyLayout {
  const base = props.spec && props.spec.layout ? (props.spec.layout as PlotlyLayout) : {};
  return props.isPreview ? previewPlotLayout(base) : darkPlotLayout(base);
}

function render(): void {
  const plotly = getPlotly();
  const target = el.value;
  if (!plotly || !target || !hasChart.value) return;
  void plotly
    .newPlot(target, (props.spec!.traces || []) as PlotlyTrace[], layout(), paretoPlotlyConfig(t('v7explore.toggleFullscreen')))
    .then(() => {
      if (props.fitToWrap) fitChartToWrap(plotly, target);
      rememberChartHeight(target);
      if (props.clickSelectsConfig) {
        bindPlotClick(target, (configIndex) => emit('plot-click', configIndex), () => props.bestMatchIndex ?? null);
      }
    })
    .catch(() => {
      // legacy chains .then only; a failed plot keeps the placeholder text
    });
}

onMounted(render);
watch(
  () => [props.spec, props.isPreview] as const,
  () => render()
);
watch(hasChart, (chart) => {
  // renderPreview(null) reset the node (:2898-2901) — dropping the figure
  // clears the Plotly DOM so the placeholder shows alone.
  if (!chart && el.value) {
    clearPlotClick(el.value);
    getPlotly()?.purge(el.value);
  }
});

onBeforeUnmount(() => {
  clearPlotClick(el.value);
  if (el.value) getPlotly()?.purge(el.value);
});
</script>

<template>
  <div :id="chartId" ref="el" :class="hasChart ? 'small-chart' : 'placeholder-chart small-chart'">
    <span v-if="!hasChart">{{ t(placeholderKey) }}</span>
  </div>
</template>
