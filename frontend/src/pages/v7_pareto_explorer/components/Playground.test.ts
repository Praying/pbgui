import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { pickSelectOption } from '@/shared/testing/select';
import Playground from './Playground.vue';
import { useParetoSession, type ParetoStore } from '../composables/useParetoSession';
import { useSurfaces } from '../composables/useSurfaces';
import type { PlaygroundPayload } from '../types';

/*
 * Pareto Playground stage — renderPlayground (:3300-3394) + the settings
 * column handlers (:4357-4434) + the projection triptych (:3372-3382).
 */

const i18n = createI18n('en');
const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {});
const fetchMock = vi.fn();
const plotlyNewPlot = vi.fn((_el: HTMLElement, _traces: unknown, _layout: unknown) => Promise.resolve());
const plotlyPurge = vi.fn();

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function makeStore(): ParetoStore {
  const store = useParetoSession({ apiBase: 'http://pbgui.test:8000/api/pareto-explorer', origin: 'http://pbgui.test:8000', seedVersion: 'v7', resultPath: '/r', t });
  store.applySession({ result_valid: true, result: { name: 'run1' } });
  return store;
}

function mountPlayground(store: ParetoStore) {
  const surfaces = useSurfaces({ store, t });
  const wrapper = mount(Playground, {
    props: { store, surfaces },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
  return { wrapper, surfaces };
}

function playgroundCalls(): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter((c) => String(c[0]).includes('/playground'))
    .map((c) => JSON.parse(String(c[1]?.body || '{}')) as Record<string, unknown>);
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/pareto-explorer/main_page?result_path=/r');
  vi.stubGlobal('fetch', fetchMock.mockReset().mockImplementation(() => ok({})));
  vi.stubGlobal('Plotly', {
    newPlot: plotlyNewPlot.mockClear(),
    react: vi.fn(() => Promise.resolve()),
    relayout: vi.fn(),
    purge: plotlyPurge.mockClear(),
    Plots: { resize: vi.fn() },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('placeholder vs rendered payload (:3314-3322)', () => {
  it('shows placeholders without a payload', () => {
    const store = makeStore();
    const { wrapper } = mountPlayground(store);
    expect(wrapper.get('#playground-chart').classes()).toContain('placeholder-chart');
    expect(wrapper.get('#playground-metric-summary').text()).toContain('multiple visualization modes');
    expect(wrapper.get('#playground-best-match').text()).toContain('Load a result to compute the best match');
    expect(wrapper.get('#playground-projections').isVisible()).toBe(false);
    wrapper.unmount();
  });

  it('renders the 2D chart with the summary and best-match lines (:3355-3364)', async () => {
    const store = makeStore();
    store.state.playground.payload = {
      viz_type: '2D Scatter',
      quick_view: 'Profit vs Risk',
      metrics: { x_metric: 'adg', y_metric: 'sharpe' },
      best_match: { config_index: 12, score: 88.2, style: 'sniper' },
      visualizations: { scatter_2d: { traces: [{ type: 'scatter' }], layout: {} } },
    } as PlaygroundPayload;
    const { wrapper } = mountPlayground(store);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.get('#playground-metric-summary').text()).toBe('2D Scatter: adg vs sharpe');
    expect(wrapper.get('#playground-best-match').text()).toBe('Best Match: Config #12 | Score: 88.2 | sniper');
    expect(wrapper.get('#playground-chart').classes()).not.toContain('placeholder-chart');
    expect(plotlyNewPlot).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});

describe('3D projections (:3372-3382)', () => {
  it('swaps the main chart for the triptych', async () => {
    const store = makeStore();
    store.state.playground.vizType = '3D Projections'; // loader echo (applyPlaygroundPayload)
    store.state.playground.payload = {
      viz_type: '3D Projections',
      visualizations: {
        projections: {
          xy: { traces: [{ type: 'scatter' }], layout: {} },
          xz: { traces: [{ type: 'scatter' }], layout: {} },
          yz: { traces: [{ type: 'scatter' }], layout: {} },
        },
      },
    } as PlaygroundPayload;
    const { wrapper } = mountPlayground(store);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.get('#playground-projections').isVisible()).toBe(true);
    expect(wrapper.get('#playground-chart-wrap').isVisible()).toBe(false);
    expect(plotlyNewPlot).toHaveBeenCalledTimes(3);
    expect(wrapper.get('#playground-chart-proj-xy').classes()).not.toContain('placeholder-chart');
    expect(wrapper.text()).toContain('XY projection');
    wrapper.unmount();
  });
});

describe('chart settings (:4357-4434)', () => {
  it('changing the visualization refetches with the new viz_type', async () => {
    const store = makeStore();
    const { wrapper } = mountPlayground(store);
    await pickSelectOption(wrapper, '#playground-viz-type', '3D Scatter (WebGL)');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.state.playground.vizType).toBe('3D Scatter');
    const bodies = playgroundCalls();
    expect(bodies.at(-1)!.viz_type).toBe('3D Scatter');
    wrapper.unmount();
  });

  it('radar resets an incompatible quick view (:4386)', async () => {
    const store = makeStore();
    store.state.playground.quickView = 'Profit vs Risk';
    const { wrapper } = mountPlayground(store);
    await pickSelectOption(wrapper, '#playground-viz-type', 'Radar Chart');
    expect(store.state.playground.quickView).toBe('Top Comparison');
    expect(wrapper.get('#playground-show-all-wrap').isVisible()).toBe(false); // radar hides shared toggles
    wrapper.unmount();
  });

  it('quick view changes refresh and Custom... preserves the current metrics (:4398-4407, :2121-2131)', async () => {
    const store = makeStore();
    store.state.playground.payload = { metrics: { x_metric: 'adg_w_usd', y_metric: 'sharpe', z_metric: 'cnc' } } as PlaygroundPayload;
    const { wrapper } = mountPlayground(store);
    // Custom controls hidden for the preset quick view (:2071)
    expect(wrapper.get('#playground-custom-controls').isVisible()).toBe(false);
    await pickSelectOption(wrapper, '#playground-quick-view', 'Custom...');
    expect(store.state.playground.customXMetric).toBe('adg_w_usd');
    expect(store.state.playground.customZMetric).toBe(''); // 2D Scatter clears z
    expect(wrapper.get('#playground-custom-controls').isVisible()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(playgroundCalls().length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('shows the z-axis select only for 3D custom views (:2073)', async () => {
    const store = makeStore();
    store.state.playground.payload = { metrics: { x_metric: 'a', y_metric: 'b', z_metric: 'c' } } as PlaygroundPayload;
    store.state.playground.vizType = '3D Scatter';
    store.state.playground.quickView = 'Custom...';
    const { wrapper } = mountPlayground(store);
    expect(wrapper.get('#playground-custom-z-wrap').isVisible()).toBe(true);
    wrapper.unmount();
  });

  it('weight sliders update the store and debounce a single refresh (:4357-4369)', async () => {
    vi.useFakeTimers();
    const store = makeStore(); // perfWeight defaults to 80
    const { wrapper } = mountPlayground(store);
    // reka slider: keyboard on the thumb (ArrowRight → +step); jsdom resolves
    // the thumb index only for the first step, so assert one step here.
    await wrapper.get('#playground-perf-weight [role="slider"]').trigger('keydown', { key: 'ArrowRight' });
    expect(store.state.playground.perfWeight).toBe(85);
    expect(wrapper.get('#playground-perf-weight-value').text()).toBe('85');
    await vi.advanceTimersByTimeAsync(140);
    const bodies = playgroundCalls();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.perf_weight).toBe(85);
    wrapper.unmount();
  });

  it('color select falls back to None when the metric left the payload list (:3345-3352)', async () => {
    const store = makeStore();
    store.state.playground.colorMetric = 'adg';
    store.state.playground.payload = { available_metrics: ['sharpe', 'cnc'] } as PlaygroundPayload;
    const { wrapper } = mountPlayground(store);
    expect(wrapper.get('#playground-color-metric').text()).toBe('None');
    await pickSelectOption(wrapper, '#playground-color-metric', 'sharpe');
    expect(store.state.playground.colorMetric).toBe('sharpe');
    wrapper.unmount();
  });

  it('projection layout toggle switches the row class (:4392-4397)', async () => {
    const store = makeStore();
    store.state.playground.vizType = '3D Projections';
    store.state.playground.payload = { viz_type: '3D Projections' } as PlaygroundPayload;
    const { wrapper } = mountPlayground(store);
    const switchControl = wrapper.get('#playground-projection-layout-row');
    expect(wrapper.get('#playground-projections').classes()).not.toContain('projections-row');
    await switchControl.trigger('click');
    expect(store.state.playground.projectionLayout).toBe('row');
    expect(wrapper.get('#playground-projections').classes()).toContain('projections-row');
    wrapper.unmount();
  });
});
