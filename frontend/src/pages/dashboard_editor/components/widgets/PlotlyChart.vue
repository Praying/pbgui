<script setup lang="ts">
/**
 * PlotlyChart — the shared wrapper around the vendored window.Plotly global
 * (R2: loaded externally, never bundled), replacing the duplicated
 * render/reload/fullscreen blocks of renderTop/renderPnl/renderAdg/renderPpl
 * (render.js:600-684 and its 3 near-identical copies):
 *
 *  - Plotly.react on mount and whenever traces/layout change; the 80 ms
 *    Plots.resize runs after the FIRST render only (legacy noResize
 *    fast-path, render.js:679);
 *  - zoom preservation: before each react the current ranges are captured
 *    from the gd's layout into the per-cell zoom memory (legacy build*
 *    fast-path capture, render.js:1696-1709) and the widget's applyZoom
 *    composes them into the new layout; a live plotly_relayout listener
 *    keeps the memory current so a D-editor-2 epoch remount (the blessed
 *    cell-level rebuild) restores the zoom the legacy in-place update kept;
 *  - a one-shot fracRange (PPL sum-period switch) is consumed after the
 *    render that applies it; captureFracZoom() is exposed for the widget to
 *    arm it (dashboard_ppl.html _getFracZoom, render.js:1901-1913);
 *  - fullscreen modebar button + X close button via useFullscreen (the R4
 *    listener-leak fix);
 *  - Plotly.purge on unmount (R4 — legacy never purged).
 *
 * Deliberate deviation: a fresh mount without a previous render does NOT
 * overwrite the zoom memory (legacy full rebuilds lost the zoom entirely;
 * the epoch-rebuild contract requires the remount to keep it).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useFullscreen } from '../../composables/useFullscreen';
import { dashT } from '../../lib/i18n';
import {
  captureFracZoom,
  captureZoom,
  plotlyConfig,
  type GdLike,
  type PlotlyLayout,
  type PlotlyTrace,
} from '../../lib/plotlyLayouts';
import { getPlotly } from '../../lib/plotlyVendor';
import { dtChartClass, dtStatusClass } from './uiClasses';
import {
  dropFracRange,
  getSavedZoom,
  saveFracZoom,
  savePlainZoom,
  type SavedZoom,
} from '../../lib/savedZoom';

const props = withDefaults(
  defineProps<{
    traces: PlotlyTrace[];
    /** Base layout WITHOUT zoom — the widget's applyZoom composes the zoom. */
    layout: PlotlyLayout;
    /** Legacy opts.height — inline chart height + fullscreen restore. */
    height?: number | null;
    /** `row_col` of the owning cell; null disables zoom memory (TOP). */
    zoomPos?: string | null;
    /** Widget-specific zoom application (applyRangeZoom / applyPplZoom). */
    applyZoom?: (layout: PlotlyLayout, zoom: SavedZoom | null) => PlotlyLayout;
    /**
     * Selector of the fullscreen target root. Legacy widgets fullscreen
     * their own chrome root — `.dt-root` everywhere except income, which
     * requests fullscreen on `.di-root` (render.js:1528, 1558).
     */
    fullscreenRoot?: string;
    displayModeBar?: boolean;
    responsive?: boolean;
  }>(),
  {
    height: null,
    zoomPos: null,
    applyZoom: (layout: PlotlyLayout) => layout,
    fullscreenRoot: '.dt-root',
    displayModeBar: false,
    responsive: true,
  }
);

const chartEl = ref<HTMLElement | null>(null);
const plotlyMissing = ref(false);

let hasRendered = false;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let relayoutListenerAttached = false;

/* ── fullscreen (legacy render.js:647-684 via useFullscreen) ── */

const rootEl = computed<HTMLElement | null>(() =>
  chartEl.value
    ? ((chartEl.value.closest(props.fullscreenRoot) as HTMLElement | null) ?? null)
    : null
);

const fs = useFullscreen({
  rootEl,
  restoreHeight: () => props.height,
  relayout: (updates) => {
    const P = getPlotly();
    if (P && chartEl.value) void P.relayout(chartEl.value, updates);
  },
  resizeAfterExit: () => {
    const P = getPlotly();
    if (P && chartEl.value) P.Plots.resize(chartEl.value);
  },
});

/* ── render ── */

function renderChart(): void {
  const el = chartEl.value;
  if (!el) return;
  const P = getPlotly();
  if (!P) {
    plotlyMissing.value = true; // legacy: chartDiv.textContent = Plotly not loaded
    return;
  }
  plotlyMissing.value = false;

  /* pre-render capture — only when this gd already rendered (a fresh mount
     must not clobber the remount-restored zoom) */
  if (props.zoomPos && (el as unknown as GdLike).layout) {
    savePlainZoom(props.zoomPos, captureZoom(el as unknown as GdLike));
  }
  const zoom = props.zoomPos ? getSavedZoom(props.zoomPos) : null;
  const finalLayout = props.applyZoom(props.layout, zoom);

  void P.react(
    el,
    props.traces,
    finalLayout,
    plotlyConfig({
      displayModeBar: props.displayModeBar,
      responsive: props.responsive,
      onToggleFullscreen: fs.toggleFullscreen,
    })
  );

  /* live zoom memory: survives the epoch remounts */
  if (
    props.zoomPos &&
    !relayoutListenerAttached &&
    typeof (el as unknown as { on?: unknown }).on === 'function'
  ) {
    relayoutListenerAttached = true;
    (el as unknown as { on: (ev: string, cb: () => void) => void }).on(
      'plotly_relayout',
      () => {
        if (props.zoomPos) {
          savePlainZoom(props.zoomPos, captureZoom(el as unknown as GdLike));
        }
      }
    );
  }

  /* the one-shot frac remap is consumed by exactly one render */
  if (zoom?.fracRange && props.zoomPos) dropFracRange(props.zoomPos);

  if (!hasRendered) {
    hasRendered = true;
    resizeTimer = setTimeout(() => {
      P.Plots.resize(el);
    }, 80);
  }
}

watch([() => props.traces, () => props.layout], renderChart);
onMounted(renderChart);

onBeforeUnmount(() => {
  if (resizeTimer !== null) {
    clearTimeout(resizeTimer);
    resizeTimer = null;
  }
  /* R4: legacy never purged — memory + DOM growth on every rebuild */
  const P = getPlotly();
  if (P && chartEl.value) P.purge(chartEl.value);
});

/** PPL sum-period switch: arm the one-shot fractional zoom (dashboard_ppl.html). */
function captureFracZoomNow(): void {
  if (!props.zoomPos || !chartEl.value) return;
  saveFracZoom(props.zoomPos, captureFracZoom(chartEl.value as unknown as GdLike));
}

defineExpose({ captureFracZoom: captureFracZoomNow });

/* ── template helpers ── */

const heightStyle = computed<{ height: string } | undefined>(() =>
  props.height ? { height: props.height + 'px' } : undefined
);
</script>

<template>
  <div ref="chartEl" :class="dtChartClass" :style="heightStyle">
    <!-- explicit 'block'/'none' inline display, byte-parity with the legacy
         handler (render.js:650 closeBtn.style.display); v-show would restore
         an empty string and lose to the button's `hidden` base utility (the
         former widgets.css .dt-fs-close{display:none} rule), leaving the
         button invisible in real browsers -->
    <button
      class="dt-fs-close absolute left-2 top-2 z-[9999] hidden cursor-pointer rounded-sm border border-border-strong bg-elevated px-[0.55rem] py-[0.2rem] text-[0.82rem] leading-[1.5] text-primary hover:border-danger-deep hover:bg-danger-deep hover:text-[#f2f5fb]"
      :style="{ display: fs.isFullscreen.value ? 'block' : 'none' }"
      :title="dashT('dash.exitFullscreen', 'Exit Fullscreen')"
      @click="fs.exitFullscreen()"
    >
      ✕
    </button>
    <div v-if="plotlyMissing" :class="dtStatusClass">
      {{ dashT('dash.plotlyNotLoaded', 'Plotly not loaded') }}
    </div>
  </div>
</template>
