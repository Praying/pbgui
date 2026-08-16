import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import type { CoinDataState } from '../types';
import { useCoinDataState } from './useCoinDataState';

/* The page store port of coin_data.html :1713-3180 — persistence, /state
   loading, exchange normalization, sorting, CMC gating and number drafts. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

function stateFixture(overrides: Partial<CoinDataState> = {}): CoinDataState {
  return {
    cmc_pool: { ready: true, active_credentials: 1 },
    filters: { exchange: 'binance', market_cap: 0, vol_mcap: 10, tags: [], only_cpt: false, hide_notices: false },
    options: { exchanges: ['binance', 'bybit'], tags: ['meme', 'ai'], quote_filter: ['USDT'], vol_mcap_values: [1, 5, 10] },
    meta: {
      cmc_line: 'CMC refreshed 1m ago',
      cmc_line_detail: 'CMC detail',
      exchange_line: 'binance refreshed 1m ago',
      exchange_line_detail: 'binance detail',
      timestamps: {},
    },
    counts: { main: 1, unmatched_visible: 1, unmatched_all: 2, hip3: 0 },
    sections: { unmatched_title: 'CMC unmatched (binance) - USDT: 1, all quotes: 2', main_title: 'Filtered symbols (1)', hip3_title: 'HIP-3 symbols (0)' },
    warnings: [],
    rows: [
      {
        coin: 'BTC', ccxt_symbol: 'BTC/USDT:USDT', base: 'BTC', quote: 'USDT', copy_trading: false,
        cmc_id: 1, cmc_rank: 1, cmc_link: 'https://coinmarketcap.com/currencies/bitcoin',
        price: 50000, market_cap: 1e12, volume_24h: 1e9, vol_mcap: 0.01, tags: ['ai'],
        notice: '', contract_size: 1, min_amount: 0.001, min_cost: 5, precision_amount: 3,
        max_leverage: 125, min_order_price: 0.1,
      },
    ],
    unmatched_rows: [{ coin: 'FOO', symbol: 'FOOUSDT', base: 'FOO', quote: 'USDT', ccxt_symbol: 'FOO/USDT:USDT' }],
    hip3_rows: [],
    ...overrides,
  };
}

function makeStore() {
  return useCoinDataState({ t: (key, params) => `${key}${params ? ':' + JSON.stringify(params) : ''}` });
}

const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/api/coin-data/main_page');
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify(stateFixture()), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildStateUrl (:2126-2135)', () => {
  it('sends the filter set as query params with repeated tags', async () => {
    const store = makeStore();
    store.filters.value.exchange = 'bybit';
    store.filters.value.marketCap = 5;
    store.filters.value.volMcap = 20;
    store.filters.value.tags = ['meme', 'ai'];
    store.filters.value.onlyCpt = true;
    await store.loadState();

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('exchange=bybit');
    expect(url).toContain('market_cap=5');
    expect(url).toContain('vol_mcap=20');
    expect(url).toContain('tags=meme');
    expect(url).toContain('tags=ai');
    expect(url).toContain('only_cpt=true');
    expect(url.startsWith('http://pbgui.test:8000/api/coin-data/state?')).toBe(true);
  });

  it('drops only_cpt for exchanges without copy-trading support (:2132)', async () => {
    const store = makeStore();
    store.filters.value.exchange = 'binance';
    store.filters.value.onlyCpt = true;
    await store.loadState();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('only_cpt=true');

    store.filters.value.exchange = 'hyperliquid';
    await store.loadState();
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain('only_cpt=');
  });
});

describe('loadState (:2160-2182)', () => {
  it('applies the payload and reports the pool-ready status', async () => {
    const store = makeStore();
    await store.loadState();

    expect(store.serverState.value?.rows).toHaveLength(1);
    expect(store.actionStatus.value.isError).toBe(false);
    expect(store.actionStatus.value.message).toBe('market.ready');
  });

  it('reports the pool reason with the cached-data suffix when not ready (:2173-2175)', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(stateFixture({ cmc_pool: { ready: false, active_credentials: 0, reason: 'no key' } })), { status: 200 })
    );
    const store = makeStore();
    await store.loadState();

    expect(store.actionStatus.value.isError).toBe(true);
    expect(store.actionStatus.value.message).toContain('no key');
    expect(store.actionStatus.value.message).toContain('market.cachedCoinDataAvailable');
  });

  it('surfaces HTTP failures as error status (:2177-2181)', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    const store = makeStore();
    await store.loadState();

    expect(store.actionStatus.value.isError).toBe(true);
    expect(store.actionStatus.value.message).toContain('HTTP 500');
  });

  it('ignores stale responses after a newer load started (:2170-2172)', async () => {
    let resolveFirst!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(stateFixture()), { status: 200 }));

    const store = makeStore();
    const first = store.loadState();
    const second = store.loadState();
    resolveFirst(new Response(JSON.stringify(stateFixture({ counts: { main: 99, unmatched_visible: 0, unmatched_all: 0, hip3: 0 } })), { status: 200 }));
    await Promise.all([first, second]);

    expect(store.serverState.value?.counts.main).toBe(1); // second (fresh) payload wins
  });
});

describe('applyServerState normalization (:2137-2158, :2094-2110)', () => {
  it('resets the hip3 view and dex filter for non-hyperliquid exchanges', () => {
    const store = makeStore();
    store.activeView.value = 'hip3';
    store.selectedTable.value = 'hip3';
    store.selectedKey.value = 'hip3::FOO';
    store.filters.value.hip3Dex = 'hyperevm';

    store.applyServerState(stateFixture());

    expect(store.activeView.value).toBe('main');
    expect(store.selectedTable.value).toBe('main');
    expect(store.selectedKey.value).toBe('');
    expect(store.filters.value.hip3Dex).toBe('');
  });

  it('resets only_cpt for exchanges without copy-trading support', () => {
    const store = makeStore();
    store.filters.value.exchange = 'binance';
    store.filters.value.onlyCpt = true;

    store.applyServerState(stateFixture({ filters: { exchange: 'hyperliquid', market_cap: 0, vol_mcap: 10, tags: [], only_cpt: true, hide_notices: false } }));

    expect(store.filters.value.onlyCpt).toBe(false);
  });

  it('prunes a selected row that vanished from the payload (:2145-2154)', () => {
    const store = makeStore();
    store.selectRow('main', 'main::GONE/USDT:USDT');

    store.applyServerState(stateFixture());

    expect(store.selectedKey.value).toBe('');
    expect(store.selectedTable.value).toBe('main');
  });

  it('drops a hip3 dex whose option vanished (:2365-2367)', () => {
    const store = makeStore();
    store.applyServerState(
      stateFixture({
        filters: { exchange: 'hyperliquid', market_cap: 0, vol_mcap: 10, tags: [], only_cpt: false, hide_notices: false },
        hip3_rows: [{ dex: 'hyperevm', coin: 'FOO', ccxt_symbol: 'FOO-USD', quote: 'USDC', price: 1, volume_24h: 2, copy_trading: false, notice: '' }],
      })
    );
    store.filters.value.hip3Dex = 'hyperevm';

    store.applyServerState(
      stateFixture({
        filters: { exchange: 'hyperliquid', market_cap: 0, vol_mcap: 10, tags: [], only_cpt: false, hide_notices: false },
        hip3_rows: [{ dex: 'aster', coin: 'FOO', ccxt_symbol: 'FOO-USD', quote: 'USDC', price: 1, volume_24h: 2, copy_trading: false, notice: '' }],
      })
    );

    expect(store.filters.value.hip3Dex).toBe('');
  });

  it('persists filters to the URL query and the view to localStorage (:2015-2027)', () => {
    const store = makeStore();

    store.applyServerState(
      stateFixture({ filters: { exchange: 'binance', market_cap: 0, vol_mcap: 10, tags: ['meme'], only_cpt: false, hide_notices: false } })
    );

    expect(window.location.search).toContain('exchange=binance');
    expect(window.location.search).toContain('tags=meme');
    expect(window.localStorage.getItem('coin-data-ui-state')).toContain('"activeView":"main"');
  });
});

describe('hip3 filtering (:2328-2348)', () => {
  const hip3State = stateFixture({
    filters: { exchange: 'hyperliquid', market_cap: 0, vol_mcap: 10, tags: [], only_cpt: false, hide_notices: false },
    hip3_rows: [
      { dex: 'aster', coin: 'A', ccxt_symbol: 'A-USD', quote: 'USDC', price: 1, volume_24h: 30, copy_trading: false, notice: '' },
      { dex: 'hyperevm', coin: 'B', ccxt_symbol: 'B-USD', quote: 'USDC', price: 1, volume_24h: 20, copy_trading: false, notice: '' },
    ],
  });

  it('derives sorted dex options', () => {
    const store = makeStore();
    store.applyServerState(hip3State);
    expect(store.hip3DexOptions.value).toEqual(['aster', 'hyperevm']);
  });

  it('filters rows by the selected dex', () => {
    const store = makeStore();
    store.applyServerState(hip3State);
    store.filters.value.hip3Dex = 'aster';
    expect(store.filteredHip3Rows.value).toHaveLength(1);
    expect(store.filteredHip3Rows.value[0]?.dex).toBe('aster');
  });
});

describe('sorting (:2581-2604)', () => {
  it('sorts numerically by the active key with nulls last', () => {
    const store = makeStore();
    store.applyServerState(
      stateFixture({
        rows: [
          { coin: 'A', ccxt_symbol: 'A/USDT', base: 'A', quote: 'USDT', copy_trading: false, price: null, tags: [], notice: '' },
          { coin: 'B', ccxt_symbol: 'B/USDT', base: 'B', quote: 'USDT', copy_trading: false, price: 2, tags: [], notice: '' },
          { coin: 'C', ccxt_symbol: 'C/USDT', base: 'C', quote: 'USDT', copy_trading: false, price: 10, tags: [], notice: '' },
        ],
      })
    );
    store.handleSortClick('main', 'price');
    expect(store.sortedMainRows.value.map((row) => row.coin)).toEqual(['C', 'B', 'A']);

    store.handleSortClick('main', 'price');
    // nulls stay last in ascending order too (:2590-2591)
    expect(store.sortedMainRows.value.map((row) => row.coin)).toEqual(['B', 'C', 'A']);
  });

  it('defaults text columns to ascending and metric columns to descending (:2901)', () => {
    const store = makeStore();
    store.handleSortClick('main', 'coin');
    expect(store.sortStates.value.main).toEqual({ key: 'coin', dir: 'asc' });
    store.handleSortClick('main', 'market_cap');
    expect(store.sortStates.value.main).toEqual({ key: 'market_cap', dir: 'desc' });
  });

  it('toggles direction on a repeated header click (:2897-2899)', () => {
    const store = makeStore();
    store.handleSortClick('main', 'coin');
    store.handleSortClick('main', 'coin');
    expect(store.sortStates.value.main.dir).toBe('desc');
  });
});

describe('CMC gating (renderSidebarMeta :2283-2291)', () => {
  it('requires pool readiness AND an active credential', () => {
    const store = makeStore();
    store.applyServerState(stateFixture({ cmc_pool: { ready: true, active_credentials: 2 } }));
    expect(store.hasMaterializedCmcKey.value).toBe(true);

    store.applyServerState(stateFixture({ cmc_pool: { ready: true, active_credentials: 0 } }));
    expect(store.hasMaterializedCmcKey.value).toBe(false);

    store.applyServerState(stateFixture({ cmc_pool: { ready: false, active_credentials: 1 } }));
    expect(store.hasMaterializedCmcKey.value).toBe(false);
  });

  it('prefers the pool error/reason for the disabled title (:2285)', () => {
    const store = makeStore();
    store.applyServerState(stateFixture({ cmc_pool: { ready: false, active_credentials: 0, reason: 'vault sealed' } }));
    expect(store.cmcDisabledReason.value).toBe('vault sealed');
  });
});

describe('number drafts (:2402-2464, :3140-3161)', () => {
  it('commits complete drafts and schedules the reload', async () => {
    vi.useFakeTimers();
    const store = makeStore();
    expect(store.onNumberInput('market_cap', '5')).toBe(true);
    expect(store.filters.value.marketCap).toBe(5);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('keeps incomplete drafts without reloading (:3141-3144)', async () => {
    vi.useFakeTimers();
    const store = makeStore();
    expect(store.onNumberInput('market_cap', '5.')).toBe(false);
    expect(store.marketCapDraft.value).toBe('5.');
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('discards an incomplete draft on change, keeping the committed value (:3147-3150)', () => {
    const store = makeStore();
    store.onNumberInput('vol_mcap', '7.');
    store.onNumberChange('vol_mcap');
    expect(store.volMcapDraft.value).toBe('10'); // finalized back to the committed value
    expect(store.filters.value.volMcap).toBe(10);
  });

  it('steps vol/mcap through the server ladder (:2506-2512)', () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.applyServerState(stateFixture()); // ladder [1, 5, 10], current vol_mcap 10

    store.stepNumberFilter('vol_mcap', -1);
    expect(store.filters.value.volMcap).toBe(5); // 10 → previous rung

    store.stepNumberFilter('vol_mcap', -1);
    expect(store.filters.value.volMcap).toBe(1);

    store.stepNumberFilter('vol_mcap', 1); // 1 → next rung
    expect(store.filters.value.volMcap).toBe(5);

    store.applyServerState(stateFixture()); // back to 10
    store.stepNumberFilter('vol_mcap', 1); // at the ladder top — stays
    expect(store.filters.value.volMcap).toBe(10);
    vi.useRealTimers();
  });

  it('steps market_cap by the fixed 250 step (:2514-2525)', async () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.stepNumberFilter('market_cap', 1);
    expect(store.filters.value.marketCap).toBe(250);
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });
});

describe('resetFilters (:2921-2931)', () => {
  it('restores the default filter values', async () => {
    const store = makeStore();
    store.filters.value.marketCap = 99;
    store.filters.value.volMcap = 42;
    store.filters.value.tags = ['meme'];
    store.filters.value.onlyCpt = true;
    store.filters.value.hip3Dex = 'aster';

    store.resetFilters();
    await Promise.resolve();

    expect(store.filters.value.marketCap).toBe(0);
    expect(store.filters.value.volMcap).toBe(10);
    expect(store.filters.value.tags).toEqual([]);
    expect(store.filters.value.onlyCpt).toBe(false);
    expect(store.filters.value.hip3Dex).toBe('');
  });
});
