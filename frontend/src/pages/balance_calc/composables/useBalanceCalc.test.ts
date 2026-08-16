import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { useBalanceCalc } from './useBalanceCalc';

/* The store port of balance_calc.html :268-528 — instance loading, config
   load, the calculate flow and the draft pre-load. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();

function makeStore(initExchange = '') {
  return useBalanceCalc({
    t: (key, params) => `${key}${params ? ':' + JSON.stringify(params) : ''}`,
    exchanges: ['binance', 'bybit'],
    initExchange,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('loadInstances (:296-321)', () => {
  it('lists instances and auto-selects the matching pre-selection', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([{ name: 'bot', version: 'v7' }, { name: 'main', version: 'v8' }]))
      .mockResolvedValueOnce(jsonResponse({ config: { bot: true }, exchange: 'bybit' }));

    const store = makeStore();
    await store.loadInstances('main', 'v8');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://pbgui.test:8000/api/balance-calc/instances');
    expect(store.instances.value).toHaveLength(2);
    expect(store.selectedInstance.value?.name).toBe('main');
    expect(store.configText.value).toBe(JSON.stringify({ bot: true }, null, 4));
    expect(store.exchange.value).toBe('bybit');
  });

  it('keeps the empty list when the fetch fails (:320)', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const store = makeStore();
    await store.loadInstances('', '');
    expect(store.instances.value).toEqual([]);
  });
});

describe('selectInstance / load-config (:324-347)', () => {
  it('posts the name+version payload and fills the editor', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ config: { a: 1 } }));
    const store = makeStore();

    await store.selectInstance({ name: 'bot', version: 'v7' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://pbgui.test:8000/api/balance-calc/load-config');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'bot', version: 'v7' });
    expect(store.configText.value).toBe(JSON.stringify({ a: 1 }, null, 4));
  });

  it('writes the localized failure note into the editor on error (:345)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'instance missing' }, 404));
    const store = makeStore();

    await store.selectInstance({ name: 'gone', version: 'v7' });

    expect(store.configText.value).toContain('misc.balance.failedLoadConfig');
    expect(store.configText.value).toContain('instance missing');
  });
});

describe('calculate (:360-403)', () => {
  it('validates config text, JSON and exchange before posting', async () => {
    const store = makeStore();

    await store.calculate();
    expect(store.feedback.value?.kind).toBe('error');
    expect(store.feedback.value).toMatchObject({ message: 'misc.balance.enterConfig' });

    store.configText.value = '{invalid';
    await store.calculate();
    expect(store.feedback.value).toMatchObject({ kind: 'error' });

    store.configText.value = '{"x":1}';
    await store.calculate();
    expect(store.feedback.value).toMatchObject({ message: 'misc.balance.selectExchange' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the parsed config and stores the results', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        exchange: 'bybit',
        recommendation: {
          symbol: 'BTC', side: 'long', recommended_balance: 1000, min_order_price: 5,
          total_wallet_exposure_limit: 4, n_positions: 2, entry_initial_qty_pct: 0.1, calculated_balance: 250,
        },
        balance_long: [{ coin: 'BTC', balance: 250 }],
        balance_short: [],
        coin_infos: [],
      })
    );
    const store = makeStore();
    store.configText.value = '{"x":1}';
    store.exchange.value = 'bybit';

    await store.calculate();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://pbgui.test:8000/api/balance-calc/calculate');
    expect(JSON.parse(String(init.body))).toEqual({ config: { x: 1 }, exchange: 'bybit' });
    expect(store.results.value?.recommendation?.symbol).toBe('BTC');
    expect(store.calculating.value).toBe(false);
  });

  it('surfaces the API error field via serverMsg (:392-394)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Invalid config' }));
    const store = makeStore();
    store.configText.value = '{}';
    store.exchange.value = 'binance';

    await store.calculate();

    expect(store.feedback.value).toMatchObject({ kind: 'error', message: 'Invalid config' });
    expect(store.results.value).toBeNull();
  });

  it('reports request failures (:398-402)', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const store = makeStore();
    store.configText.value = '{}';
    store.exchange.value = 'binance';

    await store.calculate();

    expect(store.feedback.value).toMatchObject({ kind: 'error' });
    expect(store.feedback.value?.message).toContain('misc.balance.requestFailed');
  });
});

describe('loadDraft (:514-527)', () => {
  it('pre-loads the draft config and auto-calculates (:521-523)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ config: { draft: true } }))
      .mockResolvedValueOnce(jsonResponse({ exchange: 'binance', coin_infos: [] }));

    const store = makeStore('binance'); // INIT_EXCHANGE so auto-calculate passes validation
    const loaded = await store.loadDraft('d-1');

    expect(loaded).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://pbgui.test:8000/api/balance-calc/draft/d-1');
    expect(store.configText.value).toBe(JSON.stringify({ draft: true }, null, 4));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/calculate'); // auto-calculate
  });

  it('is a no-op without a draft id or without a config', async () => {
    const store = makeStore();
    expect(await store.loadDraft('')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(jsonResponse({}));
    expect(await store.loadDraft('d-2')).toBe(false);
    expect(store.configText.value).toBe('');
  });
});
