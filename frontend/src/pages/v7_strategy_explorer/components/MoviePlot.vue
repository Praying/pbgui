<script setup lang="ts">
/**
 * Movie animation plot — renderMoviePlot (:2831-2858): Plotly.newPlot with
 * the figure spec, addFrames, slider/button/animated tracking of the
 * current frame, Plots.resize, and stepMovieFrame (:2814-2830) for the
 * arrow-key stepper.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildMovieFigureSpec } from '../lib/movieFigure';
import { getPlotly, plotlyFullscreenConfig } from '../lib/plotlyVendor';
import type { ExplorerStore } from '../composables/useStrategyExplorer';
import type { useMovie } from '../composables/useMovie';
import { deepGet } from '../lib/format';

type Movie = ReturnType<typeof useMovie>;

const props = defineProps<{ store: ExplorerStore; movie: Movie }>();
const { t } = useI18n();
const store = props.store;
const el = ref<HTMLElement | null>(null);
let spec: ReturnType<typeof buildMovieFigureSpec> = null;

function currentFrameIndex(): number {
  const plot = el.value as (HTMLElement & { layout?: Record<string, unknown> }) | null;
  const frames = store.lastMovieData.value?.frames || [];
  const rangeEnd = deepGet<string>(plot?.layout, ['xaxis', 'range', 1], '');
  const rangeMs = rangeEnd ? new Date(rangeEnd).getTime() : NaN;
  if (frames.length && isFinite(rangeMs)) {
    let bestIdx = 0;
    let bestDiff = Infinity;
    frames.forEach((frame, idx) => {
      const ms = new Date(frame.timestamp).getTime();
      if (!isFinite(ms)) return;
      const diff = Math.abs(ms - rangeMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    });
    props.movie.currentFrame.value = bestIdx;
    return bestIdx;
  }
  const active = deepGet<number>(plot?.layout, ['sliders', 0, 'active'], props.movie.currentFrame.value);
  const idx = Number(active);
  return isFinite(idx) ? Math.max(0, Math.floor(idx)) : Math.max(0, props.movie.currentFrame.value || 0);
}

/** stepMovieFrame (:2814-2830) — returns whether the frame advanced. */
function stepMovieFrame(direction: number): boolean {
  const plotly = getPlotly();
  if (!props.movie.playbackPaused.value || !spec || !plotly) return false;
  const frames = spec.frames || [];
  if (!el.value || !frames.length) return false;
  const current = Math.max(0, Math.min(frames.length - 1, currentFrameIndex()));
  const next = Math.max(0, Math.min(frames.length - 1, current + (direction < 0 ? -1 : 1)));
  props.movie.currentFrame.value = next;
  if (next !== current) {
    void plotly.animate(el.value, [String(next)], {
      mode: 'immediate',
      frame: { duration: 0, redraw: false },
      transition: { duration: 0 },
    });
  }
  return true;
}
defineExpose({ stepMovieFrame });

function render(initialFrameIdx?: number): void {
  const plotly = getPlotly();
  const data = store.lastMovieData.value;
  if (!plotly || !data) return;
  spec = buildMovieFigureSpec(
    data,
    store.selectedMovieSideKey(),
    { visible: store.controls.movieVisible, stepMins: Number(store.controls.movieStep || 1), balanceFallback: store.controls.balance, t: (key, p) => t(key, p ?? {}) },
    initialFrameIdx,
    props.movie.currentFrame.value
  );
  if (!spec) {
    if (el.value) el.value.innerHTML = '<p class="text-secondary">' + t('v7explore.noFramesToPlot') + '</p>';
    return;
  }
  props.movie.currentFrame.value = spec.activeFrame;
  plotly.purge(el.value ?? 'movie-plot');
  props.movie.playbackPaused.value = true;
  void plotly.newPlot(el.value ?? 'movie-plot', spec.data, spec.layout, plotlyFullscreenConfig('movie-plot')).then(() => {
    void plotly.addFrames(el.value ?? 'movie-plot', spec!.frames);
    const plot = el.value as (HTMLElement & { on?: (e: string, h: (ev: unknown) => void) => void }) | null;
    if (plot && plotly.Plots && plotly.Plots.resize) plotly.Plots.resize(plot);
    plot?.on?.('plotly_sliderchange', (ev: unknown) => {
      const label = deepGet<string>(ev, ['step', 'label'], '');
      const idx = Number(label);
      if (isFinite(idx)) props.movie.currentFrame.value = idx;
      props.movie.playbackPaused.value = true;
    });
    plot?.on?.('plotly_buttonclicked', (ev: unknown) => {
      const label = String(deepGet<string>(ev, ['button', 'label'], ''));
      props.movie.playbackPaused.value = label === 'Pause';
    });
    plot?.on?.('plotly_animated', () => {
      props.movie.currentFrame.value = currentFrameIndex();
    });
  });
}

onMounted(() => render());
watch(
  () => [store.lastMovieData.value, store.controls.movieVisible] as const,
  () => render(currentFrameIndex())
);
onBeforeUnmount(() => {
  getPlotly()?.purge(el.value ?? 'movie-plot');
});
</script>

<template>
  <div id="movie-plot" ref="el" class="movie-plot h-[760px] min-h-[760px] [content-visibility:auto] [contain-intrinsic-size:760px]"></div>
</template>
