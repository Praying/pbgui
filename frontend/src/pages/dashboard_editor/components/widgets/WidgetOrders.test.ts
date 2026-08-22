import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import {
  emitPositionSelected,
  resetPositionsBus,
} from '../../lib/positionsBus';
import type { Candle, OrdersData, PositionRow } from '../../types/widgets';
import WidgetOrders from './WidgetOrders.vue';

/*
 * WidgetOrders — port of buildOrdersInline (dashboard_editor.html:1977-2152)
 * + DashRender.buildOrders chrome (dashboard_render.js:3612-3857). The old
 * code is the spec; every URL/state/DOM assertion below mirrors it.
 */

enableAutoUnmount(afterEach);

/* ── the LightweightCharts fake ── */

interface LwcEnv {
  chart: {
    applyOptions: ReturnType<typeof vi.fn>;
    priceScale: ReturnType<typeof vi.fn>;
    timeScale: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    addCandlestickSeries: ReturnType<typeof vi.fn>;
    addHistogramSeries: ReturnType<typeof vi.fn>;
  };
  series: {
    setData: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    applyOptions: ReturnType<typeof vi.fn>;
    createPriceLine: ReturnType<typeof vi.fn>;
    removePriceLine: ReturnType<typeof vi.fn>;
  };
  volSeries: {
    setData: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    applyOptions: ReturnType<typeof vi.fn>;
    createPriceLine: ReturnType<typeof vi.fn>;
    removePriceLine: ReturnType<typeof vi.fn>;
  };
  createChart: ReturnType<typeof vi.fn>;
  ts: {
    fitContent: ReturnType<typeof vi.fn>;
    subscribeVisibleLogicalRangeChange: ReturnType<typeof vi.fn>;
    unsubscribeVisibleLogicalRangeChange: ReturnType<typeof vi.fn>;
  };
}

function installLwc(): LwcEnv {
  const makeSeries = () => ({
    setData: vi.fn(),
    update: vi.fn(),
    applyOptions: vi.fn(),
    createPriceLine: vi.fn(() => ({ applyOptions: vi.fn() })),
    removePriceLine: vi.fn(),
  });
  const series = makeSeries();
  const volSeries = makeSeries();
  const ts = {
    fitContent: vi.fn(),
    subscribeVisibleLogicalRangeChange: vi.fn(),
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
  };
  const chart = {
    applyOptions: vi.fn(),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    timeScale: vi.fn(() => ts),
    remove: vi.fn(),
    addCandlestickSeries: vi.fn(() => series),
    addHistogramSeries: vi.fn(() => volSeries),
  };
  const createChart = vi.fn(() => chart);
  (window as unknown as Record<string, unknown>).LightweightCharts = {
    createChart,
    CrosshairMode: { Normal: 3 },
    LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  };
  return { chart, series, volSeries, createChart, ts };
}

/* ── fixtures ── */

function candle(t: number, o: number, h: number, l: number, c: number, v: number): Candle {
  return { t, o, h, l, c, v };
}

const CANDLES: Candle[] = [
  candle(1720000000000, 100, 110, 90, 105, 10),
  candle(1720014400000, 105, 115, 95, 108, 20),
];

function ordersPayload(overrides: Partial<OrdersData> = {}): OrdersData {
  return {
    candles: CANDLES,
    orders: [{ price: 90, side: 'buy' }],
    position: { entry: 95, size: 2, upnl: 12.5, side: 'long' },
    user: 'alice',
    symbol: 'BTC/USDT:USDT',
    ...overrides,
  };
}

const ALICE: PositionRow = {
  user: 'alice',
  symbol: 'BTC/USDT:USDT',
  side: 'long',
  size: 2,
  upnl: 12.5,
  entry: 95,
  price: 108,
};

const BOB: PositionRow = {
  user: 'bob',
  symbol: 'ETH/USDT:USDT',
  side: 'short',
  size: 3,
  upnl: -1,
  entry: 200,
  price: 198,
};

const ORDERS_URL =
  '/api/dashboard/orders_data?user=alice&symbol=BTC%2FUSDT%3AUSDT&side=long&timeframe=4h&limit=500&live=1';
const BOB_URL =
  '/api/dashboard/orders_data?user=bob&symbol=ETH%2FUSDT%3AUSDT&side=short&timeframe=4h&limit=500&live=1';

interface Env {
  store: ReturnType<typeof useDashboardStore>;
  fetch: ReturnType<typeof vi.fn>;
  lwc: LwcEnv;
}

/** Minimal fetch Response shape the widget/composables consume. */
interface Resp {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function jsonResponse(body: unknown): Resp {
  return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
}

/** A promise whose resolution the test controls (out-of-order responses). */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mountOrders(options: {
  config?: Record<string, unknown>;
  payloads?: Record<string, unknown>;
  fetchError?: boolean;
  viewOnly?: boolean;
  onStore?: (store: ReturnType<typeof useDashboardStore>) => void;
} = {}): { wrapper: ReturnType<typeof mount>; env: Env } {
  const store = useDashboardStore({
    apiBase: '/api',
    origName: 'D',
    viewOnly: options.viewOnly ?? false,
    standalone: false,
  });
  store.loadConfig(options.config ?? { dashboard_type_2_1: 'ORDERS' });
  options.onStore?.(store);

  const lwc = installLwc();
  const fetchMock = vi.fn();
  if (options.fetchError) {
    fetchMock.mockRejectedValue(new Error('network'));
  } else {
    const payloads = options.payloads ?? { default: ordersPayload() };
    fetchMock.mockImplementation((url: string) => {
      const body = Object.prototype.hasOwnProperty.call(payloads, url)
        ? payloads[url as keyof typeof payloads]
        : (payloads.default as unknown);
      if (body instanceof Error) return Promise.reject(body);
      /* fresh object per response — the widget's shallowRef watch must fire
         on every successful fetch, including repeat selections */
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => JSON.parse(JSON.stringify(body)) as unknown,
      });
    });
  }
  vi.stubGlobal('fetch', fetchMock);

  const host = defineComponent({
    components: { WidgetOrders },
    provide() {
      return {
        [cellContextKey as symbol]: { row: 2, col: 1 },
        [widgetDragKey as symbol]: {
          onHeaderDragStart: () => {},
          onHeaderDragEnd: () => {},
        },
      };
    },
    template: '<div class="cell-wrap"><WidgetOrders /></div>',
  });
  return { wrapper: mount(host), env: { store, fetch: fetchMock, lwc } };
}

/** ORDERS at 2_1 linked to the POSITIONS widget at 1_1 (the auto-link target). */
function linkedConfig(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rows: 2,
    cols: 1,
    dashboard_type_1_1: 'POSITIONS',
    dashboard_type_2_1: 'ORDERS',
    dashboard_orders_2_1: 'view_orders_1_1',
    ...extra,
  };
}

async function settle(): Promise<void> {
  await flushPromises();
  await flushPromises();
}

beforeEach(() => {
  resetDashboardStore();
  resetPositionsBus();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).LightweightCharts;
});

describe('WidgetOrders — link resolution (editor:1980-2014)', () => {
  it('shows the link-positions status and no chrome without any POSITIONS cell (editor:2008-2014)', async () => {
    const { wrapper } = mountOrders({ config: { dashboard_type_2_1: 'ORDERS' } });
    await settle();
    expect(wrapper.get('.dt-status').text()).toBe(
      'Link a POSITIONS widget above to see Orders preview.'
    );
    expect(wrapper.find('.dt-header').exists()).toBe(false);
  });

  it('auto-links to the first POSITIONS cell and schedules a sync (editor:1985-1999)', async () => {
    const spyRef = { spy: null as ReturnType<typeof vi.spyOn> | null };
    const { env } = mountOrders({
      config: linkedConfig({ dashboard_orders_2_1: undefined as unknown as string }),
      onStore: (store) => {
        spyRef.spy = vi.spyOn(store, 'scheduleSync');
      },
    });
    await settle();
    expect(env.store.state['dashboard_orders_2_1']).toBe('view_orders_1_1');
    expect(spyRef.spy).toHaveBeenCalledWith();
  });

  it('keeps a persisted link without rewriting it (editor:1981-1986)', async () => {
    const { env } = mountOrders({
      config: linkedConfig({ dashboard_orders_2_1: 'view_orders_1_1' }),
    });
    const spy = vi.spyOn(env.store, 'scheduleSync');
    spy.mockClear();
    await settle();
    /* no link rewrite → no sync from resolution (only fetches happen) */
    expect(spy).not.toHaveBeenCalled();
    expect(env.store.state['dashboard_orders_2_1']).toBe('view_orders_1_1');
  });

  it('renders the select-a-position placeholder with the Orders chrome (editor:2150, render.js:3628-3642)', async () => {
    const { wrapper } = mountOrders({ config: linkedConfig() });
    await settle();
    expect(wrapper.get('.dt-title').text()).toBe('Orders');
    expect(wrapper.get('.dt-icon').text()).toBe('📝');
    expect(wrapper.get('.dt-header .dt-meta').text()).toBe(
      'Select a position in the linked Positions widget'
    );
    expect(wrapper.get('.dt-nodata').text()).toBe(
      'Select a position in the linked Positions widget'
    );
    expect(wrapper.find('.do-tf-bar').exists()).toBe(false);
  });
});

describe('WidgetOrders — selection linkage (editor:2135-2151)', () => {
  it('loads the linked cell remembered selection on mount (editor:2146-2148)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { env } = mountOrders({ config: linkedConfig() });
    await settle();
    expect(env.fetch).toHaveBeenCalledWith(ORDERS_URL);
  });

  it('builds the chart and the legacy chrome from the payload (render.js:3644-3761)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper, env } = mountOrders({ config: linkedConfig() });
    await settle();
    await vi.waitFor(() => {
      expect(env.lwc.createChart).toHaveBeenCalledTimes(1);
    });
    /* timeframe bar: 11 buttons, 4h active (render.js:3649-3668) */
    const tfBtns = wrapper.findAll('.do-tf-btn');
    expect(tfBtns.map((b) => b.text())).toEqual([
      '1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w',
    ]);
    expect(tfBtns.filter((b) => b.classes().includes('do-tf-active')).map((b) => b.text()))
      .toEqual(['4h']);
    /* user / symbol info (render.js:3694-3697 — Vue interpolation, no v-html) */
    const users = wrapper.findAll('.dt-meta-user').map((s) => s.text());
    expect(users).toEqual(['alice', 'BTC/USDT:USDT']);
    /* legend (render.js:3710-3728) */
    const legend = wrapper.findAll('.do-leg-item').map((i) => i.text());
    expect(legend).toEqual(['Entry', 'Price', 'Buy Order', 'Sell Order']);
    const swatches = wrapper.findAll('.do-leg-solid, .do-leg-dotted, .do-leg-dashed');
    expect(swatches.map((s) => (s.element as HTMLElement).style.borderColor)).toEqual([
      'rgb(163, 173, 194)', 'rgb(163, 173, 194)', 'rgb(70, 200, 143)', 'rgb(229, 97, 92)',
    ]);
    /* fullscreen toolbar (render.js:3743-3751) */
    expect(wrapper.get('.do-fs-btn').text()).toBe('⛶');
  });

  it('shows the live uPnL from the exchange payload (render.js:3686-3693)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper } = mountOrders({ config: linkedConfig() });
    await settle();
    /* raw textContent — VTU's text() trims the legacy leading space */
    expect((wrapper.get('.do-pos-info').element as HTMLElement).textContent).toBe(' · uPnL: +12.50');
    expect(wrapper.get('.do-pos-info span').classes()).toContain('dt-pos');
  });

  it('colors a negative uPnL red', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper } = mountOrders({
      config: linkedConfig(),
      payloads: {
        default: ordersPayload({ position: { entry: 95, size: 2, upnl: -3.25, side: 'long' } }),
      },
    });
    await settle();
    expect((wrapper.get('.do-pos-info').element as HTMLElement).textContent).toBe(' · uPnL: -3.25');
    expect(wrapper.get('.do-pos-info span').classes()).toContain('dt-neg');
  });

  it('omits the uPnL span when the payload has no position (render.js:3688)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper } = mountOrders({
      config: linkedConfig(),
      payloads: { default: ordersPayload({ position: null }) },
    });
    await settle();
    expect(wrapper.find('.do-pos-info').exists()).toBe(false);
  });

  it('renders the clock span (render.js:3683-3684, 3701-3704)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper } = mountOrders({ config: linkedConfig() });
    await settle();
    expect(wrapper.get('.do-clock').text()).toMatch(/\d/);
  });

  it('shows the no-candle placeholder for empty candle payloads (render.js:3734-3741)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper, env } = mountOrders({
      config: linkedConfig(),
      payloads: { default: ordersPayload({ candles: [] }) },
    });
    await settle();
    expect(wrapper.get('.dt-nodata').text()).toBe('No candle data for this symbol.');
    expect(env.lwc.createChart).not.toHaveBeenCalled();
  });

  it('shows the data-unavailable message when the fetch fails (editor:2129-2132)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper } = mountOrders({ config: linkedConfig(), fetchError: true });
    await settle();
    expect(wrapper.get('.dt-nodata').text()).toBe('⚠ Data unavailable');
  });

  it('refetches when the linked POSITIONS widget selects another row (editor:2136-2141)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { env } = mountOrders({ config: linkedConfig() });
    await settle();
    await vi.waitFor(() => {
      expect(env.lwc.createChart).toHaveBeenCalledTimes(1);
    });
    emitPositionSelected('1_1', BOB);
    await settle();
    expect(env.fetch).toHaveBeenLastCalledWith(BOB_URL);
    await vi.waitFor(() => {
      /* a new selection is a full rebuild (legacy buildOrders innerHTML='') */
      expect(env.lwc.createChart).toHaveBeenCalledTimes(2);
    });
  });

  it('replaces the chart with the error message when a reselection fetch fails (editor:2129-2132)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper, env } = mountOrders({ config: linkedConfig() });
    await settle();
    await vi.waitFor(() => {
      expect(env.lwc.createChart).toHaveBeenCalledTimes(1);
    });
    env.fetch.mockImplementation(() => Promise.reject(new Error('x')));
    emitPositionSelected('1_1', BOB);
    await settle();
    expect(wrapper.get('.dt-nodata').text()).toBe('⚠ Data unavailable');
    expect(wrapper.find('.do-chart-wrap').exists()).toBe(false);
  });

  it('ignores selections from cells other than the linked one (editor:2137)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { env } = mountOrders({ config: linkedConfig() });
    await settle();
    const calls = env.fetch.mock.calls.length;
    emitPositionSelected('9_9', BOB);
    await settle();
    expect(env.fetch.mock.calls.length).toBe(calls);
  });

  it('discards a slower response from the previous selection (legacy _ordInlineLoadSeq_ guard)', async () => {
    /* Regression lock for dashboard_editor.html's per-position load sequence:
     * a slow response for the PREVIOUS selection must never replace the newer
     * selection's chart, no matter the resolution order. */
    const { env } = mountOrders({ config: linkedConfig() });
    await settle();

    const aliceFetch = deferred<Resp>();
    const bobFetch = deferred<Resp>();
    let call = 0;
    env.fetch.mockImplementation(() => (call++ === 0 ? aliceFetch.promise : bobFetch.promise));

    emitPositionSelected('1_1', ALICE);
    await settle();
    emitPositionSelected('1_1', BOB);
    await settle();
    expect(env.fetch).toHaveBeenLastCalledWith(BOB_URL);

    /* the newer selection resolves first and owns the chart */
    bobFetch.resolve(jsonResponse(ordersPayload({ user: 'bob', symbol: 'ETH/USDT:USDT' })));
    await vi.waitFor(() => {
      expect(env.lwc.createChart).toHaveBeenCalledTimes(1);
    });

    /* the stale ALICE response lands afterwards and must be discarded */
    aliceFetch.resolve(jsonResponse(ordersPayload()));
    await settle();
    await settle();
    expect(env.lwc.createChart).toHaveBeenCalledTimes(1);
  });
});

describe('WidgetOrders — timeframe switching (editor:2077-2099)', () => {
  async function mountedWithSelection(): Promise<{ wrapper: ReturnType<typeof mount>; env: Env }> {
    emitPositionSelected('1_1', ALICE);
    const out = mountOrders({ config: linkedConfig() });
    await settle();
    await vi.waitFor(() => {
      expect(out.env.lwc.createChart).toHaveBeenCalledTimes(1);
    });
    return out;
  }

  it('switches timeframe through the fast path: setData, no chart rebuild (editor:2090-2092)', async () => {
    const { wrapper, env } = await mountedWithSelection();
    const tfUrl =
      '/api/dashboard/orders_data?user=alice&symbol=BTC%2FUSDT%3AUSDT&side=long&timeframe=1d&limit=1500&live=1';
    const newCandles = [candle(1720000000000, 50, 60, 45, 55, 100)];
    env.fetch.mockImplementation((url: string) =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ candles: newCandles }) })
    );
    await wrapper
      .findAll('.do-tf-btn')
      .find((b) => b.text() === '1d')!
      .trigger('click');
    await settle();
    expect(env.fetch).toHaveBeenLastCalledWith(tfUrl);
    expect(env.lwc.series.setData).toHaveBeenLastCalledWith([
      { time: 1720000000, open: 50, high: 60, low: 45, close: 55 },
    ]);
    expect(env.lwc.createChart).toHaveBeenCalledTimes(1);
  });

  it('moves the active timeframe highlight', async () => {
    const { wrapper } = await mountedWithSelection();
    await wrapper
      .findAll('.do-tf-btn')
      .find((b) => b.text() === '1d')!
      .trigger('click');
    await settle();
    expect(
      wrapper.findAll('.do-tf-btn').filter((b) => b.classes().includes('do-tf-active')).map((b) => b.text())
    ).toEqual(['1d']);
  });

  it('falls back to a full reload when the timeframe fetch fails (editor:2097-2099)', async () => {
    const { wrapper, env } = await mountedWithSelection();
    let failedOnce = false;
    env.fetch.mockImplementation((url: string) => {
      if (url.includes('timeframe=1d') && !failedOnce) {
        failedOnce = true;
        return Promise.reject(new Error('x'));
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ordersPayload() });
    });
    await wrapper
      .findAll('.do-tf-btn')
      .find((b) => b.text() === '1d')!
      .trigger('click');
    await settle();
    await vi.waitFor(() => {
      expect(env.lwc.createChart).toHaveBeenCalledTimes(2);
    });
  });

  it('falls back to a full reload when the response has no candles field (editor:2091-2094)', async () => {
    const { wrapper, env } = await mountedWithSelection();
    let first = true;
    env.fetch.mockImplementation((url: string) => {
      if (url.includes('timeframe=1d') && first) {
        first = false;
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ordersPayload() });
    });
    await wrapper
      .findAll('.do-tf-btn')
      .find((b) => b.text() === '1d')!
      .trigger('click');
    await settle();
    await vi.waitFor(() => {
      expect(env.lwc.createChart).toHaveBeenCalledTimes(2);
    });
  });
});

describe('WidgetOrders — lazy history loading (editor:2101-2123)', () => {
  it('prepends older candles through the generation-guarded controller', async () => {
    emitPositionSelected('1_1', ALICE);
    const { env } = mountOrders({ config: linkedConfig() });
    await settle();
    await vi.waitFor(() => {
      expect(env.lwc.createChart).toHaveBeenCalledTimes(1);
    });
    /* the controller subscribed a visible-range handler at build */
    const subscribe = env.lwc.ts.subscribeVisibleLogicalRangeChange;
    const handler = subscribe.mock.calls[0]![0] as (r: { from: number; to: number } | null) => void;
    /* payload older candles for the since-fetch */
    const older = [candle(1719985600000, 90, 100, 85, 100, 8)];
    env.fetch.mockImplementation((url: string) => {
      expect(url).toBe(
        '/api/dashboard/orders_data?user=alice&symbol=BTC%2FUSDT%3AUSDT&side=long' +
          '&timeframe=4h&since=1715680000000&limit=300&live=1'
      );
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ candles: older }) });
    });
    handler({ from: 5, to: 100 });
    await settle();
    /* merged: older + the two base candles — the fast path, view preserved */
    expect(env.lwc.series.setData).toHaveBeenLastCalledWith([
      { time: 1719985600, open: 90, high: 100, low: 85, close: 100 },
      { time: 1720000000, open: 100, high: 110, low: 90, close: 105 },
      { time: 1720014400, open: 105, high: 115, low: 95, close: 108 },
    ]);
    expect(env.lwc.createChart).toHaveBeenCalledTimes(1);
  });
});

describe('WidgetOrders — chrome parity (render.js:3612-3857)', () => {
  it('hides the trash button in view mode (legacy onDelete null)', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper } = mountOrders({ config: linkedConfig(), viewOnly: true });
    await settle();
    expect(wrapper.find('.dt-trash').exists()).toBe(false);
  });

  it('shows the trash button in edit mode and clears the cell', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper, env } = mountOrders({ config: linkedConfig() });
    await settle();
    await wrapper.get('.dt-trash').trigger('click');
    expect(env.store.cellType(2, 1)).toBe('NONE');
    expect(env.store.state['dashboard_orders_2_1']).toBeUndefined();
  });

  it('destroys the chart on unmount', async () => {
    emitPositionSelected('1_1', ALICE);
    const { wrapper, env } = mountOrders({ config: linkedConfig() });
    await settle();
    await vi.waitFor(() => {
      expect(env.lwc.createChart).toHaveBeenCalledTimes(1);
    });
    wrapper.unmount();
    expect(env.lwc.chart.remove).toHaveBeenCalled();
  });
});
