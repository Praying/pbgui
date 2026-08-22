import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from '@/shared/i18n';
import LegacyPanel from './LegacyPanel.vue';
import { useLegacyResults } from '../composables/useLegacyResults';
import { useViewState } from '../composables/useViewState';
import type { ResultsStore } from '../composables/useResults';
import type { BacktestResultItem } from '../types';

/*
 * LegacyPanel — the DOM port of the legacy results panel (:918-945):
 * config filter + text search (:922-926), select-all/deselect/pin
 * (:928-930), the 25vh wrap + resize handle (:932-938), the compare
 * area (:941) and the shared charts host (:942). v8 never mounts it.
 */

enableAutoUnmount(afterEach);

const fetchMock = vi.fn();
const notify = vi.fn();
const wsRefresh = vi.fn();

function ok(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function fakeResults(): ResultsStore {
  return {
    version: 'v7',
    results: { value: [] },
    dataApi: {
      beForCompare: async () => ({ path: 'p', version: 'v7', be: { time: [], balance: [], equity: [], balance_btc: [], equity_btc: [] } }),
    },
  } as unknown as ResultsStore;
}

function makeStore() {
  return useLegacyResults({
    apiBase: 'http://h:8000/api/backtest-v7',
    version: 'v7',
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    notify,
    getCurrentPanel: () => 'legacy',
    view: useViewState({
      version: 'v7',
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage,
      history: { replaceState: () => {} },
      initial: { panel: 'legacy', sorts: { configs: { col: 'modified', asc: false }, results: { col: 'modified', asc: false }, archive: { col: 'adg', asc: false }, legacy: { col: 'adg', asc: false } } },
    }),
    results: fakeResults(),
    wsRefresh,
    selectPanel: () => {},
    fetchFn: fetchMock as unknown as typeof fetch,
  });
}

function mountPanel(store: ReturnType<typeof makeStore>) {
  return mount(LegacyPanel, { props: { legacy: store, active: true }, global: { plugins: [createI18n('en')] }, attachTo: document.body });
}

const row = (path: string, overrides: Partial<BacktestResultItem> = {}): BacktestResultItem => ({
  path,
  config_name: 'old',
  result_name: 'res',
  backtest_version: 'v7',
  adg: 1,
  ...overrides,
});

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(() => ok({}));
  notify.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('LegacyPanel (:918-945)', () => {
  it('renders the toolbar + table without the version column', () => {
    const store = makeStore();
    store.rows.value = [row('p1', { suggested_name: 'renamed', coins_text: 'BTC' })];
    const wrapper = mountPanel(store);
    expect(wrapper.find('#legacy-results-toolbar').exists()).toBe(true);
    const header = wrapper.find('#legacy-results-table thead').text();
    expect(header).toContain('ADG');
    expect(header).not.toContain('Version');
    expect(wrapper.find('#legacy-results-table tbody tr').text()).toContain('old');
  });

  it('shows the legacy empty state (:9446-9448)', () => {
    const store = makeStore();
    store.rows.value = [];
    const wrapper = mountPanel(store);
    expect(wrapper.find('#legacy-results-table').text()).toContain('No legacy results found under pb7/backtests.');
  });

  it('filters by config + text', async () => {
    const store = makeStore();
    store.rows.value = [row('p1', { config_name: 'a' }), row('p2', { config_name: 'b', result_name: 'needle' })];
    const wrapper = mountPanel(store);
    await wrapper.find('#legacy-results-config-filter').setValue('b');
    expect(wrapper.findAll('#legacy-results-table tbody tr')).toHaveLength(1);
    await wrapper.find('#legacy-results-config-filter').setValue('');
    await wrapper.find('#legacy-results-filter').setValue('needle');
    expect(wrapper.findAll('#legacy-results-table tbody tr')).toHaveLength(1);
  });

  it('select-all / deselect + pin class', async () => {
    const store = makeStore();
    store.rows.value = [row('p1'), row('p2')];
    const wrapper = mountPanel(store);
    await wrapper.find('[data-test="legacy-select-all"]').trigger('click');
    expect(store.getSelected()).toHaveLength(2);
    await wrapper.find('[data-test="legacy-deselect"]').trigger('click');
    expect(store.getSelected()).toHaveLength(0);
    const pinButton = wrapper.find('#legacy-results-pin-btn');
    expect(pinButton.attributes('aria-label')).toBe(pinButton.attributes('title'));
    expect(pinButton.find('svg').exists()).toBe(true);
    await pinButton.trigger('click');
    expect(wrapper.find('#panel-legacy').classes()).toContain('leg-unpinned');
  });
});
