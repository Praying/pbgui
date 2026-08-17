import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

/*
 * Page-shell integration — the Strategy Explorer twin of the v7_run dual
 * flavour tests. Both serving routes mount the SAME build; the flavour
 * comes from location.pathname (legacy IS_V8 :384 read the injected
 * API_BASE instead).
 */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: 'v1.99', serial: 'S9' })),
}));

const fetchMock = vi.fn();

const SNAPSHOT = {
  title: 'My Config',
  source: 'draft',
  config: { backtest: { starting_balance: 1500, exchanges: ['binance'] }, live: { approved_coins: { long: ['BTC'] } } },
  market: {
    exchange: 'binance',
    coin: 'BTC',
    reference_price: 42000,
    engine_status: 'pb8 ready',
    metadata: { ohlcv: { rows: 1200, selected_start: '2024-01-02T03:04:00' } },
  },
  candles: [
    { timestamp: '2024-01-02T03:00:00', open: 1, high: 2, low: 0.5, close: 1.5 },
    { timestamp: '2024-01-02T03:01:00', open: 1.5, high: 3, low: 1.4, close: 2.5 },
  ],
  sides: {
    long: { active: true, modes: { entry: 'GridOnly', close: 'GridOnly' }, summary: { entry_orders: 3 }, orders: { entries: [{ index: 1, qty: 1, price: 95 }, { index: 2, qty: 1, price: 92 }], closes: [{ index: 1, qty: -1, price: 112 }, { index: 2, qty: -1, price: 118 }] } },
    short: { active: false },
  },
  messages: [],
};

const SESSION = {
  page: {},
  snapshot: SNAPSHOT,
  handoff: {},
  movie: { message: 'movie ready' },
  messages: [{ level: 'info', text: 'hi' }],
};

const MARKETS = { exchanges: ['binance', 'okx'], coins_by_exchange: { binance: ['BTC', 'ETH'], okx: ['ETH'] } };

function stubFetch(session: unknown = SESSION): void {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = init && init.body ? String(init.body) : '';
    if (u.includes('/session')) return Promise.resolve(new Response(JSON.stringify(session), { status: 200 }));
    if (u.includes('/markets')) return Promise.resolve(new Response(JSON.stringify(MARKETS), { status: 200 }));
    if (u.includes('/snapshot')) return Promise.resolve(new Response(JSON.stringify(SNAPSHOT), { status: 200 }));
    if (u.includes('/movie/export/options')) return Promise.resolve(new Response(JSON.stringify({ codecs: [{ id: 'auto' }], defaults: {} }), { status: 200 }));
    void body;
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function mountApp(path: string): Promise<ReturnType<typeof mount>> {
  window.history.replaceState({}, '', path);
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  // session bootstrap chains /session → /markets → assertions below
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  return wrapper;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Strategy Explorer page shell (v7 flavour)', () => {
  it('boots from /session and renders the snapshot chips + stats', async () => {
    stubFetch();
    const wrapper = await mountApp('/api/strategy-explorer/main_page?draft_id=&result_path=');

    const sessionCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/session'))!;
    expect(String(sessionCall[0])).toBe('http://pbgui.test:8000/api/strategy-explorer/session?draft_id=&result_path=');

    expect(document.title).toBe('PBGui - Strategy Explorer');
    const title = wrapper.get('#strategy-explorer-title');
    expect(title.text()).toBe('Strategy Explorer');
    expect(wrapper.get('#source-chip').text()).toContain('My Config');
    expect(wrapper.get('#source-chip').classes()).toContain('ok'); // source=draft (:2024)
    expect(wrapper.get('#ohlcv-chip').classes()).toContain('ok');
    expect(wrapper.get('#engine-chip').text()).toBe('pb8 ready');
    expect(wrapper.get('#market-chip').text()).toContain('binance');
    // stats: 3 entry orders from the snapshot (:1373)
    expect(wrapper.get('#long-stats').text()).toContain('LONG Statistics');
    expect(wrapper.get('#long-stats').text()).toContain('3');
    wrapper.unmount();
  });

  it('shows the two v7 simulation modes and an editable compare folder', async () => {
    stubFetch();
    const wrapper = await mountApp('/api/strategy-explorer/main_page');
    wrapper.vm.$.appContext; // mount settled
    const simButtons = wrapper.findAll('#stage-simulation .action-btn');
    expect(simButtons.map((b) => b.text())).toEqual(['PBGui Simulation', 'PB7 Backtest Engine']);
    expect(wrapper.find('#compare-pb7-folder').attributes('readonly')).toBeUndefined();
    expect(wrapper.find('#compare-mode-secondary').isVisible()).toBe(true);
    wrapper.unmount();
  });
});

describe('Strategy Explorer page shell (v8 flavour)', () => {
  it('boots without result_path and applies the v8 UI collapse', async () => {
    stubFetch();
    const wrapper = await mountApp('/api/strategy-explorer-v8/main_page?draft_id=d-9');

    const sessionCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/session'))!;
    expect(String(sessionCall[0])).toBe('http://pbgui.test:8000/api/strategy-explorer-v8/session?draft_id=d-9');

    expect(document.title).toBe('PBGui - PB8 Strategy Explorer');
    expect(wrapper.get('#strategy-explorer-title').text()).toBe('PB8 Strategy Explorer');
    // ohlcv select reduced to the PB8 native candles option (:516)
    const sources = wrapper.findAll('#ohlcv-source-select option');
    expect(sources.map((o) => o.text())).toEqual(['PB8 native candles']);
    // movie engine reduced to pb8_engine (:527)
    const engines = wrapper.findAll('#movie-engine-select option');
    expect(engines.map((o) => o.attributes('value'))).toEqual(['pb8_engine']);
    // compare folder read-only, secondary mode hidden (:519-525)
    expect(wrapper.get('#compare-pb7-folder').attributes('readonly')).toBeDefined();
    expect(wrapper.find('#compare-mode-secondary').isVisible()).toBe(false);
    // single simulation mode (:486)
    const simButtons = wrapper.findAll('#stage-simulation .action-btn');
    expect(simButtons.map((b) => b.text())).toEqual(['PB8 Native Replay']);
    // draft_id is echoed into the request options (:1057) — the markets
    // POST of the bootstrap carries selectedOptions()
    const marketsCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/markets'))!;
    expect(String((marketsCall[1] as RequestInit | undefined)?.body)).toContain('"draft_id":"d-9"');
    wrapper.unmount();
  });

  it('persists the v8 refresh cache under the v8/draft key (:408, :794-816)', async () => {
    stubFetch();
    const wrapper = await mountApp('/api/strategy-explorer-v8/main_page?draft_id=d-9');
    const key = 'pbgui_strategy_explorer_refresh:v8:d-9';
    expect(window.sessionStorage.getItem(key)).toBeTruthy();
    const payload = JSON.parse(window.sessionStorage.getItem(key)!) as { config: Record<string, unknown>; controls: { stage: string } };
    // whitelist ∩ present keys — the fixture config carries backtest + live only
    expect(Object.keys(payload.config).sort()).toEqual(['backtest', 'live']);
    expect(payload.controls.stage).toBe('analysis');
    wrapper.unmount();
  });
});

describe('OHLCV chip aggregation tooltip (:2016-2028)', () => {
  it('appends the aggregated-candle count when the window exceeds the plot cap', async () => {
    const candles = Array.from({ length: 1800 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2024, 0, 1, 0, i)).toISOString(),
      open: 1, high: 2, low: 0.5, close: 1.5, volume: 1,
    }));
    const session = {
      ...SESSION,
      snapshot: { ...SNAPSHOT, candles, market: { ...SNAPSHOT.market, ohlcv_status: 'OK', metadata: { ohlcv: { rows: 1800, selected_start: '2024-01-02T03:04:00' } } } },
    };
    stubFetch(session);
    const wrapper = await mountApp('/api/strategy-explorer/main_page');

    const title = wrapper.get('#ohlcv-chip').attributes('title') ?? '';
    // 1800 candles > MAX_PLOT_CANDLES(900) → plotCandleInfo buckets to 900 (:2018)
    expect(title).toContain('loaded 1,800');
    expect(title).toContain('window 1,800');
    expect(title).toContain('plotting 900 aggregated candles');
    wrapper.unmount();
  });

  it('omits the segment when the window fits the plot cap', async () => {
    stubFetch();
    const wrapper = await mountApp('/api/strategy-explorer/main_page');
    const title = wrapper.get('#ohlcv-chip').attributes('title') ?? '';
    expect(title).not.toContain('aggregated');
    wrapper.unmount();
  });
});

describe('stage switching (:3066-3079)', () => {
  it('activates the requested stage section and sidebar button', async () => {
    stubFetch();
    const wrapper = await mountApp('/api/strategy-explorer/main_page');
    await wrapper.findAll('.sb-section').find((b) => b.text() === 'Movie Builder')!.trigger('click');
    expect((wrapper.get('#stage-movie').element as HTMLElement).classList.contains('active')).toBe(true);
    await wrapper.findAll('.sb-section').find((b) => b.text() === 'Analysis')!.trigger('click');
    expect((wrapper.get('#stage-analysis').element as HTMLElement).classList.contains('active')).toBe(true);
    wrapper.unmount();
  });
});
