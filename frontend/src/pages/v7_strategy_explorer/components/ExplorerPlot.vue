<script setup lang="ts">
/**
 * Analysis/simulation Plotly target — the renderPlot DOM half (:1690-1700):
 * Plotly.react whenever the figure spec changes, then the candle zoom
 * handler (:656-691) restyles the candle bucket size on x-range relayout.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { analysisLayout, buildAnalysisFigure } from '../lib/analysisFigure';
import { plotCandleInfo, plotCandlePayload } from '../lib/candles';
import { parsePlotTime } from '../lib/format';
import { getPlotly, plotlyFullscreenConfig, type PlotlyTrace } from '../lib/plotlyVendor';
import type { ExplorerStore } from '../composables/useStrategyExplorer';
import type { FillEvent, StrategySnapshot } from '../types';

const props = defineProps<{
  store: ExplorerStore;
  sideKey: 'long' | 'short';
  plotId: string;
  /** Simulation fills ('sim-' prefix) — null on the analysis stage (:1675). */
  simEvents?: FillEvent[] | null;
  /** v8 movie handoff overrides the candles of the plot snapshot (:2071-2083). */
  snapshotOverride?: StrategySnapshot | null;
}>();
const { t } = useI18n();
const el = ref<HTMLElement | null>(null);

const snapshot = computed<StrategySnapshot>(() => props.snapshotOverride || props.store.state.snapshot || {});
const figure = computed(() => buildAnalysisFigure(props.sideKey, snapshot.value, props.simEvents ?? null, (key, p) => t(key, p ?? {})));

let removeZoom: (() => void) | null = null;

function render(): void {
  const plotly = getPlotly();
  const target = el.value;
  if (!plotly || !target) return;
  void plotly
    .react(target, figure.value.traces, analysisLayout(figure.value, props.sideKey, (key, p) => t(key, p ?? {})), plotlyFullscreenConfig(props.plotId))
    .then(() => installCandleZoom(target, snapshot.value.candles || []));
}

/** installCandleZoomHandler (:656-691). */
function installCandleZoom(target: HTMLElement, candles: import('../types').Candle[]): void {
  const plotly = getPlotly();
  if (!plotly || !candles.length) return;
  const dom = target as HTMLElement & { _pbguiCandleRelayout?: (ev: unknown) => void; on?: (e: string, h: (ev: unknown) => void) => void; removeListener?: (e: string, h: (ev: unknown) => void) => void };
  if (dom._pbguiCandleRelayout && dom.removeListener) dom.removeListener('plotly_relayout', dom._pbguiCandleRelayout);
  let rafId = 0;
  let pending: Record<string, unknown> | null = null;
  function payloadKey(bucketSize: number, payload: { x: (string | number)[] }): string {
    const x = payload.x || [];
    return String(bucketSize) + ':' + x.length + ':' + (x[0] || '') + ':' + (x[x.length - 1] || '');
  }
  const initialInfo = plotCandleInfo(candles);
  let currentKey = payloadKey(initialInfo.bucketSize || 1, plotCandlePayload(initialInfo));
  function applyRange(ev: Record<string, unknown> | null): void {
    rafId = 0;
    let start = NaN;
    let end = NaN;
    const e = ev || {};
    if (e['xaxis.range[0]'] !== undefined && e['xaxis.range[1]'] !== undefined) {
      start = parsePlotTime(e['xaxis.range[0]']);
      end = parsePlotTime(e['xaxis.range[1]']);
    } else if (Array.isArray(e['xaxis.range']) && (e['xaxis.range'] as unknown[]).length >= 2) {
      const range = e['xaxis.range'] as unknown[];
      start = parsePlotTime(range[0]);
      end = parsePlotTime(range[1]);
    }
    const info =
      isFinite(start) && isFinite(end) && end > start
        ? plotCandleInfo(candles, start, end)
        : plotCandleInfo(candles);
    if (!info.candles.length) return;
    const payload = plotCandlePayload(info);
    const key = payloadKey(info.bucketSize || 1, payload);
    if (key === currentKey) return;
    currentKey = key;
    void plotly!.restyle(target, { x: [payload.x], open: [payload.open], high: [payload.high], low: [payload.low], close: [payload.close], name: [payload.name] } as unknown as PlotlyTrace, [0]);
  }
  dom._pbguiCandleRelayout = (ev: unknown) => {
    pending = (ev || {}) as Record<string, unknown>;
    if (!rafId) rafId = requestAnimationFrame(() => applyRange(pending));
  };
  dom.on?.('plotly_relayout', dom._pbguiCandleRelayout);
  removeZoom = () => {
    if (rafId) cancelAnimationFrame(rafId);
    dom.removeListener?.('plotly_relayout', dom._pbguiCandleRelayout as (ev: unknown) => void);
  };
}

onMounted(render);
watch(figure, render, { deep: false });
onBeforeUnmount(() => {
  removeZoom?.();
  removeZoom = null;
  getPlotly()?.purge(el.value ?? props.plotId);
});
</script>

<template>
  <div :id="plotId" ref="el" class="plot h-[520px] min-h-[360px] overflow-hidden rounded-xl border border-secondary/14 bg-page/74 shadow-[0_14px_30px_rgba(5,8,14,0.14)] [content-visibility:auto] [contain-intrinsic-size:520px] max-[1250px]:h-[420px] max-[640px]:h-[360px] max-[640px]:min-h-[300px]"></div>
</template>
