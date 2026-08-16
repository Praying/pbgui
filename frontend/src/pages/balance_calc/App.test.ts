import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { getBoot } from '@/shared/boot';
import App from './App.vue';

/* Page-shell integration: mount, instance/exchange selects, calculate flow
   and result rendering (the contract the legacy HTML-string pytest asserted). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();

const RESULTS = {
  exchange: 'bybit',
  recommendation: {
    symbol: 'BTC', side: 'long', recommended_balance: 1000, min_order_price: 5,
    total_wallet_exposure_limit: 4, n_positions: 2, entry_initial_qty_pct: 0.1, calculated_balance: 250,
  },
  balance_long: [{ coin: 'BTC', balance: 250 }],
  balance_short: [{ coin: 'ETH', balance: 90 }],
  coin_infos: [
    { coin: 'BTC', currentPrice: 50000, contractSize: '1', min_amount: '0.001', min_cost: '5', min_order_price: '5', max_lev: '100' },
  ],
};

async function mountApp() {
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return wrapper;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/balance-calc/main_page');
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/instances')) {
      return Promise.resolve(new Response(JSON.stringify([{ name: 'main', version: 'v7' }]), { status: 200 }));
    }
    if (u.endsWith('/load-config')) {
      return Promise.resolve(new Response(JSON.stringify({ config: { bot: true }, exchange: 'bybit' }), { status: 200 }));
    }
    if (u.endsWith('/calculate')) {
      return Promise.resolve(new Response(JSON.stringify(RESULTS), { status: 200 }));
    }
    void init;
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Balance Calculator page shell', () => {
  it('renders the toolbar with exchanges and the intro message', async () => {
    const wrapper = await mountApp();

    const options = wrapper.findAll('#sel-exchange option');
    expect(options.map((option) => option.text())).toEqual([
      'binance', 'bybit', 'bitget', 'gateio', 'hyperliquid', 'kucoin', 'okx',
    ]);
    expect(wrapper.find('#results-panel .msg-info').text()).toContain('Calculate');
    expect(document.title).toBe('Balance Calculator');
  });

  it('loads the instance list and loads its config on selection', async () => {
    const wrapper = await mountApp();

    const instanceOptions = wrapper.findAll('#sel-instance option');
    expect(instanceOptions.at(-1)!.text()).toBe('[PB7] main');

    await instanceOptions.at(-1)!.setValue(JSON.stringify({ name: 'main', version: 'v7' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((wrapper.find('#config-editor').element as HTMLTextAreaElement).value).toBe(JSON.stringify({ bot: true }, null, 4));
  });

  it('calculates and renders all result cards', async () => {
    const wrapper = await mountApp();
    await wrapper.find('#config-editor').setValue('{"x":1}');
    await wrapper.findAll('#sel-exchange option')[1]!.setValue('bybit');
    await wrapper.find('#btn-calc').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const panel = wrapper.find('#results-panel');
    expect(panel.text()).toContain('Exchange');
    expect(panel.text()).toContain('bybit');
    expect(panel.text()).toContain('1000 USDT');
    expect(panel.text()).toContain('Balance per Coin (Long)');
    expect(panel.text()).toContain('Balance per Coin (Short)');
    expect(panel.text()).toContain('Coin Information');
    expect(panel.text()).toContain('BTC');
    expect(panel.find('.msg-error').exists()).toBe(false);
  });

  it('shows validation errors without fetching', async () => {
    const wrapper = await mountApp();

    await wrapper.find('#btn-calc').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.find('.msg-error').exists()).toBe(true);
    const calls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes('/calculate'))).toBe(false);
  });

  it('renders the intro when a result has no content (:478-479)', async () => {
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/instances')) return Promise.resolve(new Response('[]', { status: 200 }));
      if (u.endsWith('/calculate')) return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    const wrapper = await mountApp();
    await wrapper.find('#config-editor').setValue('{}');
    await wrapper.findAll('#sel-exchange option')[0]!.setValue('binance');
    await wrapper.find('#btn-calc').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.find('#results-panel .msg-info').text()).toContain('No results');
  });
});
