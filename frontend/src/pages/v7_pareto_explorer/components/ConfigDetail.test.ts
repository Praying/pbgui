import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ConfigDetail from './ConfigDetail.vue';
import { useParetoSession, type ParetoStore } from '../composables/useParetoSession';
import { useSurfaces } from '../composables/useSurfaces';
import type { ConfigDetailPayload } from '../types';

/*
 * Selected-config detail (:3849-3893 + markup :1506-1625): metrics, style,
 * robustness, all-metrics (capped), scenario metrics and the full-config
 * JsonPanel (:4739-4746). The preset generator section lands in M-v7-7.
 */

const i18n = createI18n('en');
const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {});

function makeStore(): ParetoStore {
  return useParetoSession({ apiBase: 'http://pbgui.test:8000/api/pareto-explorer', origin: 'http://pbgui.test:8000', seedVersion: 'v7', resultPath: '/r', t });
}

function mountDetail(store: ParetoStore) {
  const surfaces = useSurfaces({ store, t });
  const wrapper = mount(ConfigDetail, {
    props: { store, surfaces },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
  return { wrapper, surfaces };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/pareto-explorer/main_page?result_path=/r');
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const DETAIL: ConfigDetailPayload = {
  config_index: 3,
  style: 'balanced',
  explorer_score: 77.5,
  robustness: 0.91,
  top_metrics: [{ name: 'adg', value: 1.5 }],
  risk_profile: { max_drawdown: 0.2 },
  all_metrics: [{ name: 'adg', value: 1.5 }, { name: 'positions_held_per_day', value: 4.2 }, { name: 'position_held_hours_mean', value: 12 }],
  has_scenarios: true,
  scenario_metrics: { bull: { adg: 1, sharpe: 2 } },
  full_config: { bot: { long: {} } },
};

describe('empty state (:3851-3861)', () => {
  it('shows placeholders and the no-selection title', () => {
    const store = makeStore();
    const { wrapper } = mountDetail(store);
    expect(wrapper.get('#detail-title').text()).toBe('No config selected');
    expect(wrapper.get('#detail-top-metrics').text()).toContain('Select a champion');
    expect(wrapper.get('#detail-style-panel').text()).toContain('Trading style details');
    expect(wrapper.get('#detail-robustness-panel').text()).toContain('Robustness details');
    expect(wrapper.get('#detail-all-metrics').text()).toContain('All suite metrics');
    expect(wrapper.get('#detail-scenario-section').isVisible()).toBe(false);
    expect(wrapper.get('#detail-full-config').text()).toBe('No config selected');
    wrapper.unmount();
  });
});

describe('detail render (:3863-3893)', () => {
  it('renders title, metrics, style rows, robustness and all metrics', () => {
    const store = makeStore();
    store.state.selectedDetail = DETAIL;
    const { wrapper } = mountDetail(store);
    expect(wrapper.get('#detail-title').text()).toBe('#3');
    const mini = wrapper.findAll('#detail-top-metrics .mini-metric');
    expect(mini).toHaveLength(1);
    expect(mini[0]!.text()).toContain('adg');
    const styleRows = wrapper.findAll('#detail-style-panel .detail-item');
    expect(styleRows).toHaveLength(4);
    expect(styleRows[0]!.text()).toContain('balanced');
    expect(styleRows[1]!.text()).toContain('Positions/Day');
    expect(styleRows[1]!.text()).toContain('4.2');
    expect(styleRows[2]!.text()).toContain('12');
    expect(styleRows[3]!.text()).toContain('77.5');
    expect(wrapper.get('#detail-robustness-panel .stats-row').text()).toContain('0.91');
    expect(wrapper.findAll('#detail-all-metrics .detail-item')).toHaveLength(3);
    wrapper.unmount();
  });

  it('binds bilingual metric tooltips on all-metrics names', () => {
    const store = makeStore();
    store.state.selectedDetail = {
      ...DETAIL,
      all_metrics: [{ name: 'adg_w_usd', value: 1.5 }, { name: 'mystery_metric', value: 2 }],
    };
    const { wrapper } = mountDetail(store);
    const names = wrapper.findAll('#detail-all-metrics .detail-item strong');
    const tip = names[0]!.attributes('data-tip');
    expect(tip).toContain('平均日收益');
    expect(tip).toContain('Average Daily Gain');
    expect(tip).toContain('近期加权');
    expect(names[1]!.attributes('data-tip')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders scenario metrics with sorted chips (:3041-3063)', () => {
    const store = makeStore();
    store.state.selectedDetail = DETAIL;
    const { wrapper } = mountDetail(store);
    expect(wrapper.get('#detail-scenario-section').isVisible()).toBe(true);
    const item = wrapper.get('#detail-scenario-metrics .detail-item');
    expect(item.text()).toContain('bull');
    expect(item.text()).toContain('2 metrics shown');
    expect(item.findAll('.chip').length).toBeGreaterThanOrEqual(3);
    wrapper.unmount();
  });

  it('serialises the full config into the JsonPanel pre', () => {
    const store = makeStore();
    store.state.selectedDetail = DETAIL;
    const { wrapper } = mountDetail(store);
    expect(wrapper.get('#detail-full-config').text()).toBe(JSON.stringify(DETAIL.full_config, null, 2));
    wrapper.unmount();
  });

  it('falls back to the unavailable text without a full config (:3892)', () => {
    const store = makeStore();
    store.state.selectedDetail = { config_index: 1 };
    const { wrapper } = mountDetail(store);
    expect(wrapper.get('#detail-full-config').text()).toBe('Full config unavailable.');
    wrapper.unmount();
  });

  it('uses the shared PBGuiJsonPanel chrome when the global is present (:4739-4746)', () => {
    const createPanelHtml = vi.fn(
      () => '<div class="json-panel-wrap" id="detail-full-config-wrap"><pre id="detail-full-config" class="json-pre"></pre></div>'
    );
    const setContent = vi.fn();
    vi.stubGlobal('PBGuiJsonPanel', { createPanelHtml, setContent });
    const store = makeStore();
    store.state.selectedDetail = DETAIL;
    const { wrapper } = mountDetail(store);
    expect(createPanelHtml).toHaveBeenCalledWith({ wrapId: 'detail-full-config-wrap', preId: 'detail-full-config', title: 'Config', collapsedHeight: '400px' });
    expect(setContent).toHaveBeenCalledWith('detail-full-config', JSON.stringify(DETAIL.full_config, null, 2), { expanded: false });
    expect(wrapper.find('#detail-full-config-wrap').exists()).toBe(true);
    wrapper.unmount();
  });
});
