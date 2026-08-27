import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { getBoot } from '@/shared/boot';
import App from './App.vue';
import BusyOverlay from './components/BusyOverlay.vue';
import type { CoinDataState } from './types';

/* Page-shell integration: mount, /state render, view switching, CMC button
   gating in the DOM (the contract the legacy HTML-string pytest asserted). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const BASE = 'http://pbgui.test:8000';

function stateFixture(overrides: Partial<CoinDataState> = {}): CoinDataState {
  return {
    cmc_pool: { ready: true, active_credentials: 1 },
    filters: { exchange: 'binance', market_cap: 0, vol_mcap: 10, tags: [], only_cpt: false, hide_notices: false },
    options: { exchanges: ['binance', 'bybit', 'hyperliquid'], tags: ['meme', 'ai'], quote_filter: ['USDT'], vol_mcap_values: [1, 5, 10] },
    meta: { cmc_line: 'CMC refreshed 1m ago', cmc_line_detail: 'd1', exchange_line: 'binance refreshed 1m ago', exchange_line_detail: 'd2', timestamps: {} },
    counts: { main: 2, unmatched_visible: 1, unmatched_all: 3, hip3: 0 },
    sections: { unmatched_title: 'CMC unmatched (binance) - USDT: 1, all quotes: 3', main_title: 'Filtered symbols (2)', hip3_title: 'HIP-3 symbols (0)' },
    warnings: [],
    rows: [
      { coin: 'BTC', ccxt_symbol: 'BTC/USDT:USDT', base: 'BTC', quote: 'USDT', copy_trading: true, cmc_id: 1, cmc_rank: 1, cmc_link: 'https://coinmarketcap.com/currencies/bitcoin', price: 50000, market_cap: 1e12, volume_24h: 1e9, vol_mcap: 0.01, tags: ['ai', 'pow'], notice: '', contract_size: 1, min_amount: 0.001, min_cost: 5, precision_amount: 3, max_leverage: 125, min_order_price: 0.1 },
      { coin: 'ETH', ccxt_symbol: 'ETH/USDT:USDT', base: 'ETH', quote: 'USDT', copy_trading: false, cmc_id: 2, cmc_rank: 2, cmc_link: '', price: 3000, market_cap: 4e11, volume_24h: 5e8, vol_mcap: 0.05, tags: [], notice: 'weird listing', contract_size: 1, min_amount: 0.01, min_cost: 5, precision_amount: 3, max_leverage: 100, min_order_price: 0.1 },
    ],
    unmatched_rows: [{ coin: 'FOO', symbol: 'FOOUSDT', base: 'FOO', quote: 'USDT', ccxt_symbol: 'FOO/USDT:USDT' }],
    hip3_rows: [],
    ...overrides,
  };
}

const fetchMock = vi.fn();

function installState(state: CoinDataState): void {
  fetchMock.mockImplementation((url: string | URL) => {
    const u = String(url);
    if (u.includes('/api/coin-data/state')) {
      return Promise.resolve(new Response(JSON.stringify(state), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
}

async function mountApp() {
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  await new Promise((resolve) => setTimeout(resolve, 0)); // flush the initial loadState
  return wrapper;
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/api/coin-data/main_page');
  fetchMock.mockReset();
  installState(stateFixture());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window._openCoinDataHelp;
  delete window.PBGUI_HELP_OPENER;
  document.body.innerHTML = '';
});

describe('Coin Data page shell', () => {
  it('renders the main table rows from /state with formatted cells', async () => {
    const wrapper = await mountApp();

    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.get('#main-content').element.tagName).toBe('DIV');
    const mainRows = wrapper.findAll('#main-body tr.data-row');
    expect(mainRows).toHaveLength(2);
    expect(mainRows[0]!.text()).toContain('BTC');
    expect(mainRows[0]!.text()).toContain('$50K');
    expect(mainRows[0]!.text()).toContain('1.00T');
    expect(mainRows[0]!.text()).toContain('0.0100x');
    expect(wrapper.find('#main-panel-title').text()).toContain('Matched symbols (2)');
    expect(wrapper.find('#quotes-pill').text()).toBe('Quotes: USDT');
  });

  it('switches views through the rail sections and renders the unmatched table', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('#unmatched-panel').classes()).toContain('hidden');

    await wrapper.find('[data-testid="rail-section-unmatched"]').trigger('click');
    expect(wrapper.find('#unmatched-panel').classes()).not.toContain('hidden');
    expect(wrapper.find('#main-panel').classes()).toContain('hidden');
    expect(wrapper.findAll('#unmatched-body tr.data-row')).toHaveLength(1);
    expect(wrapper.find('#unmatched-body').text()).toContain('FOOUSDT');
  });

  it('renders the page views as rail sections with the active view marked', async () => {
    const wrapper = await mountApp();

    const sectionButtons = wrapper.findAll('.workbench-rail__subitem'); // accordion children of the active page entry
    expect(sectionButtons.map((button) => button.attributes('data-testid'))).toEqual([
      'rail-section-main',
      'rail-section-unmatched',
    ]);
    expect(sectionButtons[0]!.classes()).toContain('workbench-rail__subitem--active');
    expect(sectionButtons[0]!.text()).toBe('Matched Symbols (2)');
    expect(sectionButtons[1]!.text()).toBe('CMC Unmatched (1)');
    wrapper.unmount();

    installState(
      stateFixture({
        filters: { exchange: 'hyperliquid', market_cap: 0, vol_mcap: 10, tags: [], only_cpt: false, hide_notices: false },
        hip3_rows: [{ dex: 'aster', coin: 'FOO', ccxt_symbol: 'FOO-USD', quote: 'USDC', price: 1, volume_24h: 2, copy_trading: false, notice: '' }],
      })
    );
    const hl = await mountApp();

    const hlSections = hl.findAll('.workbench-rail__subitem');
    expect(hlSections).toHaveLength(3); // hip3 joins for hyperliquid
    expect(hlSections[2]!.attributes('data-testid')).toBe('rail-section-hip3');
    expect(hlSections[2]!.text()).toBe('HIP-3 Symbols (1)');
    expect(hl.find('[data-testid="rail-section-main"]').classes()).toContain('workbench-rail__subitem--active');
  });

  it('shows the selected-row card on row click with detail fields', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('#selected-card').classes()).not.toContain('visible');

    await wrapper.findAll('#main-body tr.data-row')[0]!.trigger('click');
    expect(wrapper.find('#selected-card').classes()).toContain('visible');
    expect(wrapper.find('#selected-title').text()).toBe('BTC');
    const labels = wrapper.findAll('#selected-grid .kv-label').map((node) => node.text());
    expect(labels).toContain('CCXT Symbol');
    expect(labels).toContain('vol/mcap');
    const link = wrapper.find('#selected-cmc-link');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://coinmarketcap.com/currencies/bitcoin');
  });

  it('gates only the CMC refresh buttons on the materialized pool key (legacy pytest contract)', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('#btn-refresh-cmc').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('#btn-refresh-exchange').attributes('disabled')).toBeUndefined();
    wrapper.unmount();

    installState(stateFixture({ cmc_pool: { ready: false, active_credentials: 0, reason: 'vault sealed' } }));
    const gated = await mountApp();

    expect(gated.find('#btn-refresh-cmc').attributes('disabled')).toBeDefined();
    expect(gated.find('#btn-refresh-cmc-all').attributes('disabled')).toBeDefined();
    expect(gated.find('#btn-refresh-cmc').attributes('title')).toContain('vault sealed');
    expect(gated.find('#btn-refresh-cmc').attributes('title')).toContain('Cached Coin Data remains readable.');
    // non-CMC refresh stays enabled; the cached view stays rendered
    expect(gated.find('#btn-refresh-exchange').attributes('disabled')).toBeUndefined();
    expect(gated.find('#btn-refresh-all').attributes('disabled')).toBeUndefined();
    expect(gated.findAll('#main-body tr.data-row')).toHaveLength(2);
  });

  it('renders warnings from the state payload', async () => {
    installState(stateFixture({ warnings: ['No mapping data available for binance.'] }));
    const wrapper = await mountApp();

    expect(wrapper.find('#warning-box').classes()).not.toContain('hidden');
    expect(wrapper.find('#warning-box').text()).toContain('No mapping data available');
  });

  it('exposes the hip3 view only for hyperliquid and the CPT toggle only for supported exchanges', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('[data-testid="rail-section-hip3"]').exists()).toBe(false); // binance payload
    expect(wrapper.find('#btn-only-cpt').exists()).toBe(true);
    wrapper.unmount();

    installState(
      stateFixture({
        filters: { exchange: 'hyperliquid', market_cap: 0, vol_mcap: 10, tags: [], only_cpt: false, hide_notices: false },
        hip3_rows: [{ dex: 'aster', coin: 'FOO', ccxt_symbol: 'FOO-USD', quote: 'USDC', price: 1, volume_24h: 2, copy_trading: false, notice: '' }],
      })
    );
    const hl = await mountApp();

    expect(hl.find('[data-testid="rail-section-hip3"]').exists()).toBe(true);
    expect(hl.find('#btn-only-cpt').exists()).toBe(false);

    await hl.find('[data-testid="rail-section-hip3"]').trigger('click');
    expect(hl.find('#hip3-panel').classes()).not.toContain('hidden');
    expect(hl.findAll('#hip3-body tr.data-row')).toHaveLength(1);
    expect(hl.find('#field-hip3-dex').classes()).not.toContain('hidden');
  });

  it('keeps the busy overlay hidden until a refresh starts', async () => {
    const wrapper = await mountApp();
    expect(wrapper.find('#busy-overlay').classes()).not.toContain('visible');
  });

  it('renders busy progress with a transform instead of width geometry', () => {
    const wrapper = mount(BusyOverlay, {
      props: { busy: { visible: true, title: 'Refreshing', percent: 42.5, subtle: 'Working' } },
      global: { plugins: [createI18n('en')] },
    });

    const progressFill = wrapper.find('#busy-progress-fill');
    expect(progressFill.attributes('style')).toContain('transform: scaleX(0.425)');
    expect(progressFill.attributes('style')).not.toContain('width:');
  });

  it('sets the document title and registers the help opener', async () => {
    await mountApp();
    expect(document.title).toBe('Coin Data - PBGui');
    expect(typeof window.PBGUI_HELP_OPENER).toBe('function');
  });
});
