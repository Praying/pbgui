import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import CommandCenter from './CommandCenter.vue';
import { useParetoSession, type ParetoStore } from '../composables/useParetoSession';
import { useSurfaces } from '../composables/useSurfaces';
import type { CommandCenterPayload, PlaygroundPayload } from '../types';

/*
 * Command Center stage — champions (:2944-2973), insights (:2975-2990) and
 * the pareto/robustness preview (:2890-2942) incl. the full-load mirror on
 * the left summary (:2453-2458).
 */

const i18n = createI18n('en');
const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {});
const API_BASE = 'http://pbgui.test:8000/api/pareto-explorer';

const fetchMock = vi.fn();
const plotlyNewPlot = vi.fn((_el: HTMLElement, _traces: unknown, _layout: unknown) => Promise.resolve());
const plotlyPurge = vi.fn();
const plotlyResize = vi.fn();

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function mountStage(store: ParetoStore) {
  const surfaces = useSurfaces({ store, t });
  const wrapper = mount(CommandCenter, {
    props: { store, surfaces },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
  return { wrapper, surfaces };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/pareto-explorer/main_page?result_path=/r');
  vi.stubGlobal('fetch', fetchMock.mockReset().mockImplementation(() => ok({})));
  vi.stubGlobal('Plotly', {
    newPlot: plotlyNewPlot.mockClear(),
    react: vi.fn(() => Promise.resolve()),
    relayout: vi.fn(),
    purge: plotlyPurge.mockClear(),
    Plots: { resize: plotlyResize.mockClear() },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function makeStore(): ParetoStore {
  const store = useParetoSession({ apiBase: API_BASE, origin: 'http://pbgui.test:8000', seedVersion: 'v7', resultPath: '/r', t });
  store.applySession({ result_valid: true, result: { name: 'run1' } });
  return store;
}

describe('champions (:2944-2973)', () => {
  it('renders the ranked list and marks the selection active', async () => {
    const store = makeStore();
    store.state.commandCenter = {
      champions: [{ config_index: 4, style: 'momentum', composite_score: 91.5 }, { config_index: 9 }],
    } as CommandCenterPayload;
    store.state.selectedConfigIndex = 9;
    const { wrapper } = mountStage(store);
    const items = wrapper.findAll('.champion-item');
    expect(items).toHaveLength(2);
    expect(items[0]!.text()).toContain('#4');
    expect(items[0]!.text()).toContain('Rank 1');
    expect(items[0]!.text()).toContain('Score 91.5');
    expect(items[1]!.classes()).toContain('active');
    wrapper.unmount();
  });

  it('shows the empty placeholder without champions', () => {
    const store = makeStore();
    const { wrapper } = mountStage(store);
    expect(wrapper.get('#champion-list').text()).toContain('No champions available');
    wrapper.unmount();
  });

  it('clicking a champion loads its config detail', async () => {
    const store = makeStore();
    store.state.commandCenter = { champions: [{ config_index: 7 }] } as CommandCenterPayload;
    const { wrapper } = mountStage(store);
    await wrapper.get('.champion-item').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/config-detail'));
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call![1]?.body)).config_index).toBe(7);
    wrapper.unmount();
  });
});

describe('insights (:2975-2990)', () => {
  it('maps levels to chip classes', () => {
    const store = makeStore();
    store.state.commandCenter = { insights: [{ level: 'warning', text: 'near bounds' }, { level: 'success', text: 'ok' }] } as CommandCenterPayload;
    const { wrapper } = mountStage(store);
    const items = wrapper.findAll('.insight-item');
    expect(items).toHaveLength(2);
    expect(items[0]!.find('.status-chip').classes()).toContain('warn');
    expect(items[0]!.text()).toContain('near bounds');
    expect(items[1]!.find('.status-chip').classes()).toContain('good');
    wrapper.unmount();
  });
});

describe('pareto front preview (:2890-2942)', () => {
  it('keeps placeholders without a payload', () => {
    const store = makeStore();
    const { wrapper } = mountStage(store);
    expect(wrapper.get('#preview-left-summary').text()).toBe('Pareto preview chart will appear here.');
    expect(wrapper.get('#preview-pareto-chart').classes()).toContain('placeholder-chart');
    wrapper.unmount();
  });

  it('renders summaries and both charts from the playground payload', async () => {
    const store = makeStore();
    store.state.playground.payload = {
      counts: { configs: 40 },
      visualizations: {
        preview: {
          counts: { configs: 40, pareto: 5, show_all: true, total_configs: 900 },
          pareto_analysis: { traces: [{ type: 'scatter' }], layout: { height: 300 } },
          robustness: { traces: [{ type: 'scatter' }], layout: {} },
        },
      },
    } as PlaygroundPayload;
    const { wrapper } = mountStage(store);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.get('#preview-left-summary').text()).toBe('Pareto Analysis - Showing 40 / 900 configs | 5 Pareto ⭐');
    expect(wrapper.get('#preview-right-summary').text()).toBe('Robustness vs Performance - Showing 40 / 900 configs | 5 Pareto ⭐');
    expect(wrapper.get('#preview-pareto-chart').classes()).not.toContain('placeholder-chart');
    expect(plotlyNewPlot).toHaveBeenCalledTimes(2);
    const leftArgs = plotlyNewPlot.mock.calls[0]!;
    expect(leftArgs[1]).toEqual([{ type: 'scatter' }]);
    expect((leftArgs[2] as Record<string, unknown>).height).toBe(750); // previewPlotLayout minimum
    wrapper.unmount();
  });

  it('mirrors the full-load progress text while a scan is pending (:2453-2458)', () => {
    const store = makeStore();
    store.state.playground.payload = { counts: { configs: 3, pareto: 1 } } as PlaygroundPayload;
    store.state.fullLoadPending = true;
    store.progress.setFullLoadStatus('loading', 'Scanning 45% of all_results', 45);
    const { wrapper } = mountStage(store);
    expect(wrapper.get('#preview-left-summary').text()).toBe('Scanning 45% of all_results');
    expect(wrapper.get('#preview-right-summary').text()).toBe('Robustness preview chart will appear here.'); // only the left side mirrors
    wrapper.unmount();
  });

  it('toggling a preview setting refetches the playground (:4435-4444)', async () => {
    const store = makeStore();
    const { wrapper } = mountStage(store);
    await wrapper.get('#preview-show-all').setValue(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/playground'));
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call![1]?.body)).preview_show_all).toBe(true);
    wrapper.unmount();
  });
});
