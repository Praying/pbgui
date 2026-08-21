import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import PlotlyChart from './PlotlyChart.vue';
import { getPlotly, type PlotlyVendor } from '../../lib/plotlyVendor';
import {
  applyPplZoom,
  applyRangeZoom,
  type PlotlyLayout,
} from '../../lib/plotlyLayouts';
import { getSavedZoom, resetSavedZoom, setSavedZoom, type SavedZoom } from '../../lib/savedZoom';

/*
 * The shared Plotly wrapper — ports renderTop/renderPnl/renderAdg/renderPpl's
 * Plotly.react + resize + savedZoom + fullscreen block (render.js:600-684):
 *
 *  - Plotly.react on mount and when traces/layout change; Plots.resize 80 ms
 *    after the FIRST render only (legacy noResize fast-path);
 *  - pre-render zoom capture from gd.layout → memory → layout (the legacy
 *    build* fast-path capture, render.js:1696-1709);
 *  - a live plotly_relayout listener keeps the memory current across the
 *    D-editor-2 epoch remounts;
 *  - one-shot fracRange is consumed after the render that applies it;
 *  - exposed captureFracZoom() for the PPL sum-period switch;
 *  - R4 fixes: Plotly.purge on unmount (legacy never purges) and fullscreen
 *    listeners removed via useFullscreen.
 */

enableAutoUnmount(afterEach);

/* ── fake window.Plotly ── */

interface FakeGdEl extends HTMLElement {
  layout?: Record<string, unknown>;
  data?: unknown[];
  on?: ReturnType<typeof vi.fn>;
}

const react = vi.fn();
const relayout = vi.fn();
const purge = vi.fn();
const plotsResize = vi.fn();

function installPlotly(): void {
  (window as unknown as { Plotly: PlotlyVendor }).Plotly = {
    react: react.mockImplementation((el: unknown, traces: unknown, layout: unknown) => {
      const gd = el as FakeGdEl;
      gd.layout = layout as Record<string, unknown>;
      gd.data = traces as unknown[];
      gd.on = gd.on ?? vi.fn();
    }),
    relayout,
    purge,
    Plots: { resize: plotsResize },
  };
}

function clearPlotly(): void {
  delete (window as unknown as { Plotly?: PlotlyVendor }).Plotly;
}

beforeEach(() => {
  vi.useFakeTimers();
  react.mockClear();
  relayout.mockClear();
  purge.mockClear();
  plotsResize.mockClear();
  resetSavedZoom();
  installPlotly();
});

afterEach(() => {
  vi.useRealTimers();
  clearPlotly();
});

/* ── mount helpers ── */

const HOST = defineComponent({
  components: { PlotlyChart },
  props: {
    traces: { type: Array, required: true },
    layout: { type: Object, required: true },
    height: { type: Number, default: null },
    zoomPos: { type: String, default: null },
    applyZoom: { type: Function, default: undefined },
  },
  template: `
    <div class="dt-root">
      <PlotlyChart ref="chartHost" :traces="traces" :layout="layout" :height="height"
        :zoom-pos="zoomPos" :apply-zoom="applyZoom" />
    </div>`,
});

interface Mounted {
  wrapper: ReturnType<typeof mount>;
  traces: { value: Record<string, unknown>[] };
  layout: { value: Record<string, unknown> };
}

function mountChart(options: {
  zoomPos?: string | null;
  height?: number | null;
  applyZoom?: (layout: PlotlyLayout, zoom: SavedZoom | null) => PlotlyLayout;
  setup?: (env: Mounted) => void;
} = {}): Mounted {
  const traces = ref<Record<string, unknown>[]>([{ x: ['a'], y: [1], type: 'bar' }]);
  const layout = ref<Record<string, unknown>>({ autosize: true });
  const wrapper = mount(HOST, {
    props: {
      traces: traces.value,
      layout: layout.value,
      height: options.height ?? undefined,
      zoomPos: options.zoomPos ?? undefined,
      applyZoom: options.applyZoom,
    },
  });
  const env = { wrapper, traces, layout };
  options.setup?.(env);
  return env;
}

function chartEl(wrapper: ReturnType<typeof mount>): FakeGdEl {
  return wrapper.get('.dt-chart').element as FakeGdEl;
}

async function updateProps(env: Mounted): Promise<void> {
  await env.wrapper.setProps({
    traces: env.traces.value,
    layout: env.layout.value,
  });
  await nextTick();
}

function simulateUserZoom(env: Mounted, xrange: [number, number], yrange: [number, number]): void {
  chartEl(env.wrapper).layout = {
    xaxis: { autorange: false, range: [...xrange] },
    yaxis: { autorange: false, range: [...yrange] },
  };
}

describe('PlotlyChart', () => {
  it('renders the legacy "Plotly not loaded" fallback when the global is missing', async () => {
    clearPlotly();
    const { wrapper } = mountChart();
    await nextTick();
    expect(wrapper.get('.dt-status').text()).toBe('Plotly not loaded');
    expect(react).not.toHaveBeenCalled();
    expect(wrapper.find('.dt-fs-close').exists()).toBe(true); // still in DOM, hidden
  });

  it('calls Plotly.react on mount with traces/layout/config and resizes after 80 ms once', async () => {
    const { wrapper } = mountChart({ height: 300 });
    await nextTick();
    const gd = chartEl(wrapper);
    expect(react).toHaveBeenCalledTimes(1);
    expect(react.mock.calls[0]![0]).toBe(gd);
    expect(react.mock.calls[0]![1]).toEqual([{ x: ['a'], y: [1], type: 'bar' }]);
    expect(react.mock.calls[0]![2]).toEqual({ autosize: true });
    const cfg = react.mock.calls[0]![3] as Record<string, unknown>;
    expect(cfg.displayModeBar).toBe(false); // legacy default
    expect(cfg.responsive).toBe(true); // legacy default
    expect(cfg.modeBarButtonsToAdd).toHaveLength(1);
    vi.advanceTimersByTime(80);
    expect(plotsResize).toHaveBeenCalledWith(gd);
  });

  it('binds the legacy inline height on .dt-chart', () => {
    const { wrapper } = mountChart({ height: 300 });
    expect(wrapper.get('.dt-chart').attributes('style')).toContain('height: 300px');
    expect(mountChart({ height: null }).wrapper.get('.dt-chart').attributes('style')).toBeUndefined();
  });

  it('re-renders on data change without the legacy resize delay (fast-path noResize)', async () => {
    const env = mountChart();
    await nextTick();
    vi.advanceTimersByTime(80); // let the first render's resize fire
    react.mockClear();
    plotsResize.mockClear();
    env.traces.value = [{ x: ['b'], y: [2], type: 'bar' }];
    await updateProps(env);
    expect(react).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(80);
    expect(plotsResize).not.toHaveBeenCalled();
  });

  it('captures the current zoom before react and applies it to the new layout (legacy fast-path)', async () => {
    const env = mountChart({ zoomPos: '1_2', applyZoom: applyRangeZoom });
    await nextTick();
    simulateUserZoom(env, [1, 2], [3, 4]);
    react.mockClear();
    env.traces.value = [{ x: ['b'], y: [2], type: 'bar' }];
    await updateProps(env);
    const layout = react.mock.calls[0]![2] as Record<string, unknown>;
    expect((layout.xaxis as Record<string, unknown>).range).toEqual([1, 2]);
    expect((layout.xaxis as Record<string, unknown>).autorange).toBe(false);
    expect((layout.yaxis as Record<string, unknown>).range).toEqual([3, 4]);
  });

  it('does not capture or apply zoom when zoomPos is null (TOP parity)', async () => {
    const env = mountChart();
    await nextTick();
    env.layout.value = { autosize: true, xaxis: { gridcolor: '#37333a' } };
    await updateProps(env);
    simulateUserZoom(env, [1, 2], [3, 4]);
    react.mockClear();
    env.traces.value = [{ x: ['b'], y: [2], type: 'bar' }];
    await updateProps(env);
    const layout = react.mock.calls[0]![2] as Record<string, unknown>;
    expect((layout.xaxis as Record<string, unknown>).range).toBeUndefined();
    expect(getSavedZoom('1_2')).toBeNull();
  });

  it('restores zoom from memory after a remount (D-editor-2 epoch rebuild)', async () => {
    setSavedZoom('1_2', { xrange: [1, 2], yrange: null });
    const env = mountChart({ zoomPos: '1_2', applyZoom: applyRangeZoom });
    await nextTick();
    const layout = react.mock.calls[0]![2] as Record<string, unknown>;
    expect((layout.xaxis as Record<string, unknown>).range).toEqual([1, 2]);
  });

  it('applies a one-shot fracRange via the ppl zoom and consumes it after the render', async () => {
    setSavedZoom('1_2', { xrange: null, yrange: null, fracRange: [0.25, 0.75] });
    const { wrapper } = mountChart({
      zoomPos: '1_2',
      applyZoom: (l, z) => applyPplZoom(l, z, 8),
    });
    await nextTick();
    const layout = react.mock.calls[0]![2] as Record<string, unknown>;
    expect((layout.xaxis as Record<string, unknown>).range).toEqual([2, 6]);
    expect(getSavedZoom('1_2')?.fracRange).toBeUndefined();
    expect(wrapper.exists()).toBe(true);
  });

  it('updates the zoom memory live via the plotly_relayout listener', async () => {
    const env = mountChart({ zoomPos: '1_2', applyZoom: applyRangeZoom });
    await nextTick();
    const gd = chartEl(env.wrapper);
    expect(gd.on).toBeDefined();
    expect(gd.on!.mock.calls[0]![0]).toBe('plotly_relayout');
    simulateUserZoom(env, [5, 6], [7, 8]);
    gd.on!.mock.calls[0]![1](); // fire the relayout event
    expect(getSavedZoom('1_2')).toEqual({ xrange: [5, 6], yrange: [7, 8] });
  });

  it('exposes captureFracZoom for the PPL sum-period switch (dashboard_ppl.html _getFracZoom)', async () => {
    const env = mountChart({ zoomPos: '1_2' });
    await nextTick();
    const gd = chartEl(env.wrapper);
    gd.layout = { xaxis: { autorange: false, range: [1, 3] }, yaxis: { autorange: false, range: [9, 10] } };
    gd.data = [{ x: [0, 1, 2, 3] }];
    /* template-ref access — the production WidgetPpl path (ref="chartRef"
       resolves through getExposeProxy; findComponent().vm goes through the
       public-instance proxy whose exposeProxy is compile-optimization
       sensitive) */
    const host = env.wrapper.vm as unknown as {
      $refs: { chartHost?: { captureFracZoom?: () => void } };
    };
    host.$refs.chartHost?.captureFracZoom?.();
    expect(getSavedZoom('1_2')).toEqual({
      xrange: null, yrange: [9, 10], fracRange: [0.25, 0.75],
    });
  });

  it('purges the plot on unmount (R4 — legacy never purged)', async () => {
    const { wrapper } = mountChart();
    await nextTick();
    const gd = chartEl(wrapper);
    wrapper.unmount();
    expect(purge).toHaveBeenCalledWith(gd);
  });

  it('fullscreen modebar click requests fullscreen on the widget .dt-root', async () => {
    const { wrapper } = mountChart();
    await nextTick();
    const cfg = react.mock.calls[0]![3] as {
      modeBarButtonsToAdd: Array<{ click: (gd: unknown) => void }>;
    };
    const root = wrapper.get('.dt-root').element as HTMLElement & {
      requestFullscreen?: () => void;
    };
    root.requestFullscreen = vi.fn();
    cfg.modeBarButtonsToAdd[0]!.click(chartEl(wrapper));
    expect(root.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('shows the close button in fullscreen and hides it on exit (legacy style.display toggle)', async () => {
    const { wrapper } = mountChart({ height: 300 });
    await nextTick();
    const closeBtn = wrapper.get('.dt-fs-close');
    /* the legacy handler sets inline 'block'/'none' (render.js:650); the
       widgets.css base rule is display:none, so only an explicit inline
       'block' wins in a real browser — v-show's empty-string restore would
       leave the button invisible */
    expect((closeBtn.element as HTMLElement).style.display).toBe('none');
    const root = wrapper.get('.dt-root').element;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: root });
    document.dispatchEvent(new Event('fullscreenchange'));
    await nextTick();
    expect((closeBtn.element as HTMLElement).style.display).toBe('block');
    /* exit → relayout restore + resize after 100 ms */
    expect(relayout).toHaveBeenCalledWith(
      chartEl(wrapper),
      { width: window.screen.width || window.innerWidth, height: (window.screen.availHeight || window.innerHeight) - 62 }
    );
    relayout.mockClear();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.dispatchEvent(new Event('fullscreenchange'));
    await nextTick();
    expect((closeBtn.element as HTMLElement).style.display).toBe('none');
    expect(relayout).toHaveBeenCalledWith(chartEl(wrapper), { width: null, height: 300 });
    vi.advanceTimersByTime(100);
    expect(plotsResize).toHaveBeenCalledWith(chartEl(wrapper));
  });

  it('removes the fullscreen listeners on unmount (R4 listener-leak fix)', async () => {
    const { wrapper } = mountChart();
    await nextTick();
    wrapper.unmount();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    /* a stale legacy handler would still relayout here */
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(relayout).not.toHaveBeenCalled();
    expect(getPlotly()).toBeDefined();
  });
});

describe('PlotlyChart fullscreenRoot selector (D-editor-7 income, render.js:1528/1558)', () => {
  it('defaults to .dt-root and honors a custom selector like .di-root', async () => {
    /* default: the wrapper's own .dt-root */
    const defaultHost = mount(HOST, {
      props: { traces: [{ x: ['a'], y: [1] }], layout: { autosize: true } },
    });
    const defaultRoot = defaultHost.get('.dt-root').element as HTMLElement & {
      requestFullscreen?: () => void;
    };
    defaultRoot.requestFullscreen = vi.fn();
    const defaultCfg = react.mock.calls[0]![3] as {
      modeBarButtonsToAdd: Array<{ click: (gd: unknown) => void }>;
    };
    defaultCfg.modeBarButtonsToAdd[0]!.click(defaultHost.get('.dt-chart').element);
    expect(defaultRoot.requestFullscreen).toHaveBeenCalledTimes(1);
    defaultHost.unmount();
    react.mockClear();

    /* income: fullscreen targets .di-root, not .dt-root */
    const incomeHost = defineComponent({
      components: { PlotlyChart },
      props: { traces: { type: Array, required: true }, layout: { type: Object, required: true } },
      template: `
        <div class="di-root">
          <PlotlyChart :traces="traces" :layout="layout" display-mode-bar responsive fullscreen-root=".di-root" />
        </div>`,
    });
    const wrapper = mount(incomeHost, {
      props: { traces: [{ x: ['a'], y: [1] }], layout: { autosize: true } },
    });
    const diRoot = wrapper.get('.di-root').element as HTMLElement & {
      requestFullscreen?: () => void;
    };
    diRoot.requestFullscreen = vi.fn();
    const cfg = react.mock.calls[0]![3] as {
      modeBarButtonsToAdd: Array<{ click: (gd: unknown) => void }>;
    };
    cfg.modeBarButtonsToAdd[0]!.click(wrapper.get('.dt-chart').element);
    expect(diRoot.requestFullscreen).toHaveBeenCalledTimes(1);
  });
});
