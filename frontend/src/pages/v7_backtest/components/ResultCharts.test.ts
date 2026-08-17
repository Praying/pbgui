import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from '@/shared/i18n';
import PlotlyDiv from './PlotlyDiv.vue';
import TweChart from './TweChart.vue';
import ResultCharts from './ResultCharts.vue';
import type { PlotlyConfig, PlotlyLayout, PlotlyTrace, PlotlyVendor } from '../lib/plotlyVendor';
import type { ResultActionKind } from '../types';

/*
 * The chart components — PlotlyDiv (the newPlot/react/relayout/restyle
 * wrapper), TweChart (renderTWEChart :7374-7513 + the resolution select
 * :6674-6678 + the show-coins toggle :7516-7528) and ResultCharts
 * (onResultActionsChanged :6576-6786). window.Plotly is faked like the
 * dashboard/pareto tests (never bundled, R2/R5).
 */

enableAutoUnmount(afterEach);

const newPlot = vi.fn();
const react = vi.fn();
const relayout = vi.fn();
const restyle = vi.fn();
const purge = vi.fn();
const plotsResize = vi.fn();

function installPlotly(): void {
  (window as unknown as { Plotly: PlotlyVendor }).Plotly = {
    newPlot: newPlot.mockImplementation(async (el: unknown) => el),
    react: react.mockImplementation(async (el: unknown) => el),
    relayout,
    restyle,
    purge,
    Plots: { resize: plotsResize },
  } as unknown as PlotlyVendor;
}

beforeEach(() => {
  vi.clearAllMocks();
  installPlotly();
});

afterEach(() => {
  delete (window as unknown as { Plotly?: PlotlyVendor }).Plotly;
  document.body.innerHTML = '';
});

describe('PlotlyDiv', () => {
  function mountPlot(props: { traces: PlotlyTrace[]; layout: PlotlyLayout }): ReturnType<typeof mount> {
    return mount(PlotlyDiv, { props, global: { plugins: [createI18n('en')] }, attachTo: document.body });
  }

  it('newPlots on mount with the traces/layout/config', () => {
    mountPlot({ traces: [{ x: [1], y: [2], name: 't' }], layout: { title: 'T' } });
    expect(newPlot).toHaveBeenCalledTimes(1);
    const args = newPlot.mock.calls[0]!;
    expect((args[1]! as Array<{ name: string }>)[0]!.name).toBe('t');
    expect(args[2]).toEqual({ title: 'T' }); // layout passes through untouched
    expect((args[3] as Record<string, unknown>).responsive).toBe(true);
  });

  it('reacts (not newPlots) when traces change — the zoom-preserving fast path (R5)', async () => {
    const wrapper = mountPlot({ traces: [{ x: [], y: [], name: 'a' }], layout: {} });
    expect(newPlot).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ traces: [{ x: [], y: [], name: 'b' }] });
    expect(react).toHaveBeenCalledTimes(1);
    expect(newPlot).toHaveBeenCalledTimes(1);
  });

  it('exposes relayout for the log-scale toggle (:7206-7210)', async () => {
    const wrapper = mountPlot({ traces: [], layout: {} });
    (wrapper.vm as unknown as { relayout: (u: Record<string, unknown>) => void }).relayout({ 'yaxis.type': 'log' });
    expect(relayout).toHaveBeenCalledWith(wrapper.find('div').element, { 'yaxis.type': 'log' });
  });

  it('purges on unmount (R4/R5)', () => {
    const wrapper = mountPlot({ traces: [], layout: {} });
    wrapper.unmount();
    expect(purge).toHaveBeenCalledTimes(1);
  });
});

function fillsCsv() {
  return {
    headers: ['', 'coin', 'balance', 'psize', 'pprice', 'type'],
    rows: [
      { '': '2024-01-01T00:00:00Z', coin: 'BTC', balance: '100', psize: '50', pprice: '2', type: 'long' },
      { '': '2024-01-02T00:00:00Z', coin: 'BTC', balance: '100', psize: '30', pprice: '2', type: 'short' },
    ],
  };
}

const resultItem = {
  path: 'backtests/cfg/binance/r1',
  config_name: 'cfg',
  result_name: 'r1',
  exchange_dir: 'binance',
  backtest_version: 'v7' as const,
  modified: '2024-01-02T03:04:05Z',
};

describe('TweChart (:6670-6682, :7374-7513, :7516-7528)', () => {
  function mountTwe(resolution = 1440) {
    return mount(TweChart, {
      props: { csv: fillsCsv(), result: resultItem, resolution },
      global: { plugins: [createI18n('en')] },
      attachTo: document.body,
    });
  }

  it('renders Long/Short TWE + legendonly coin traces at the given resolution', () => {
    mountTwe(1440);
    const traces = newPlot.mock.calls[0]![1] as Array<{ name: string; visible?: string }>;
    expect(traces.map((tr) => tr.name)).toEqual(['Long TWE', 'Short TWE', 'BTC Long WE', 'BTC Short WE']);
    expect(traces.find((tr) => tr.name === 'BTC Long WE')?.visible).toBe('legendonly');
  });

  it('changing the resolution re-renders with resampled traces (:7363-7372)', async () => {
    const wrapper = mountTwe(1440);
    await wrapper.find('[data-test="twe-res"]').setValue('60');
    expect(react).toHaveBeenCalledTimes(1);
    const traces = react.mock.calls[0]![1] as Array<{ name: string }>;
    expect(traces[0]).toMatchObject({ name: 'Long TWE' });
    expect(wrapper.find('[data-test="twe-res"]').attributes('value') ?? (wrapper.find('[data-test="twe-res"]').element as HTMLSelectElement).value).toBe('60');
  });

  it('show-coins toggles restyle over the per-coin trace indices (:7516-7528)', async () => {
    const wrapper = mountTwe(1440);
    await wrapper.find('[data-test="twe-showcoins"]').setValue(true);
    expect(restyle).toHaveBeenCalledTimes(1);
    const args = restyle.mock.calls[0]!;
    expect(args[1]).toEqual({ visible: [true, true] }); // traces 2..3
    expect(args[2]).toEqual([2, 3]);
  });
});

describe('ResultCharts (:6576-6786)', () => {
  const fetchMock = vi.fn();

  function csv(text: string): Promise<Response> {
    return Promise.resolve(new Response(text, { status: 200 }));
  }

  const equityCsv = ',usd_total_balance,usd_total_equity,btc_total_balance,btc_total_equity\n2024-01-01T00:00:00Z,100,101,0.001,0.0011\n2024-01-02T00:00:00Z,110,109,0.0012,0.0012';
  const fillsCsvText = ',time,coin,balance,psize,pprice,type,pnl,fee_paid\n0,2024-01-01T00:00:00Z,BTC,100,50,2,long,10,-1\n0,2024-01-02T00:00:00Z,BTC,100,30,2,short,5,0';

  function mountCharts(
    actions: ResultActionKind[],
    resultOverrides: Record<string, unknown> = {}
  ) {
    const result = { ...resultItem, ...resultOverrides };
    return mount(ResultCharts, {
      props: {
        sections: [{ result, actions: new Set(actions) }],
        version: 'v7' as const,
        dataApi: {
          resultApiBaseFor: () => 'http://h:8000/api/backtest-v7',
          fetchCsv: (file: string) =>
            fetchMock(file) as unknown as Promise<{ headers: string[]; rows: Record<string, string>[] }>,
          loadBe: () => Promise.resolve({ time: ['2024-01-01', '2024-01-02'], balance: [100, 110], equity: [101, 109], balance_btc: [0.001, 0.0012], equity_btc: [0.0011, 0.0012] }),
          loadFills: () => Promise.resolve(fillsCsv()),
          // v7 flavor: flat side root + hsl_ prefix (sideValues remap)
          loadConfig: () =>
            Promise.resolve({
              bot: { long: { total_wallet_exposure_limit: 1, n_positions: 3, hsl_enabled: true, hsl_red_threshold: 0.2, hsl_ema_span_minutes: 60 } },
              live: {},
            }),
          loadAnalysis: () => Promise.resolve({ metric: 1 }),
          loadFiles: (_path: string, _result: unknown, kind: string) => Promise.resolve(kind === 'fills' ? ['fills_plots/btc.png'] : ['plot1.png']),
          imageUrl: (path: string, _result: unknown, filename: string) => `http://h/img?path=${path}&filename=${filename}`,
          loadPrice: () => Promise.resolve({ available: false, time: [], close: [] }),
          beForCompare: () =>
            Promise.resolve({ path: '', version: 'v7' as const, be: { time: [], balance: [], equity: [], balance_btc: [], equity_btc: [] } }),
          clearCachesFor: () => undefined,
        },
      },
      global: { plugins: [createI18n('en')] },
      attachTo: document.body,
    });
  }

  beforeEach(() => {
    fetchMock.mockReset().mockImplementation((file: string) =>
      csv(file === 'fills' ? fillsCsvText : equityCsv)
    );
  });

  it('the view section renders BE/PnL/DD/hard-stop/TWE charts (:6624-6694)', async () => {
    const wrapper = mountCharts(['view']);
    await vi.waitFor(() => expect(newPlot.mock.calls.length).toBeGreaterThanOrEqual(5));
    const chartIds = newPlot.mock.calls.map((call) => (call[0] as HTMLElement).id);
    expect(chartIds.filter((id) => id.includes('be-chart'))).toHaveLength(1);
    expect(chartIds.filter((id) => id.includes('pnl-chart'))).toHaveLength(1);
    expect(chartIds.filter((id) => id.includes('dd-chart'))).toHaveLength(1);
    expect(chartIds.filter((id) => id.includes('hard-stop-chart'))).toHaveLength(1);
    expect(chartIds.filter((id) => id.includes('twe-chart'))).toHaveLength(1);
    // btc_collateral_cap == 0 → no BTC pair
    expect(chartIds.filter((id) => id.includes('be-btc'))).toHaveLength(0);
    expect(wrapper.find('#results-charts').exists()).toBe(true);
  });

  it('btc_collateral_cap > 0 adds the BTC balance + drawdown charts (:6684-6692)', async () => {
    mountCharts(['view'], { btc_collateral_cap: 0.5 });
    await vi.waitFor(() => expect(newPlot.mock.calls.length).toBeGreaterThanOrEqual(7));
    const chartIds = newPlot.mock.calls.map((call) => (call[0] as HTMLElement).id);
    expect(chartIds.filter((id) => id.includes('be-btc-chart'))).toHaveLength(1);
    expect(chartIds.filter((id) => id.includes('dd-btc-chart'))).toHaveLength(1);
  });

  it('liquidated results render the warning with its reasons (:6628-6634)', async () => {
    const wrapper = mountCharts(['view'], { liquidated: true, drawdown_worst: 0.97, equity_balance_diff_neg_max: 0.1, starting_balance: 1000, final_balance: 40 });
    await vi.waitFor(() => expect(newPlot).toHaveBeenCalled());
    const text = wrapper.find('[data-test="liquidation-warning"]').text();
    expect(text).toContain('liquidation');
    expect(text).toContain('drawdown_worst=0.9700');
    expect(text).toContain('final_bal=40');
    expect(text).not.toContain('eq_bal_diff');
  });

  it('the log-scale checkbox relayouts only the yaxis type (:7206-7210, :6640)', async () => {
    mountCharts(['view']);
    await vi.waitFor(() => expect(newPlot).toHaveBeenCalled());
    relayout.mockClear();
    const toggle = document.querySelector<HTMLInputElement>('[data-test="be-log-toggle"]');
    expect(toggle).not.toBeNull();
    toggle!.checked = true;
    toggle!.dispatchEvent(new Event('change'));
    await nextTick();
    expect(relayout).toHaveBeenCalledWith(expect.anything(), { 'yaxis.type': 'log' });
  });

  it('analysis + config sections render the JSON payloads (:6697-6721)', async () => {
    const wrapper = mountCharts(['analysis', 'config']);
    await vi.waitFor(() => expect(wrapper.text()).toContain('metric'));
    expect(wrapper.find('[data-test="analysis-section"]').text()).toContain('metric');
    expect(wrapper.find('[data-test="config-section"]').text()).toContain('bot');
  });

  it('plot + fills sections list the PNG images with their URLs (:6723-6743)', async () => {
    const wrapper = mountCharts(['plot', 'fills']);
    await vi.waitFor(() => expect(wrapper.findAll('img').length).toBe(2));
    const srcs = wrapper.findAll('img').map((img) => img.attributes('src'));
    expect(srcs).toContain('http://h/img?path=backtests/cfg/binance/r1&filename=plot1.png');
    expect(srcs).toContain('http://h/img?path=backtests/cfg/binance/r1&filename=fills_plots/btc.png');
    const fillsImg = wrapper.findAll('img').find((img) => (img.attributes('src') ?? '').includes('fills_plots'));
    expect(fillsImg?.attributes('alt')).toBe('fills_plots/btc.png');
  });

  it('the price-market select renders when the result exposes markets (:6641-6649)', async () => {
    const wrapper = mountCharts(['view'], { coins: ['BTC'], exchange_dir: 'binance' });
    await vi.waitFor(() => expect(wrapper.find('[data-test="price-market"]').exists()).toBe(true));
    // option values are exchange|coin with each side encoded, literal pipe (:6571-6573)
    expect(wrapper.findAll('[data-test="price-market"] option').map((o) => (o.element as HTMLOptionElement).value)).toEqual(['binance|BTC']);
  });
});

describe('image section edge cases (:7560-7593)', () => {
  it('empty lists render the legacy literals (:7565, :7583)', async () => {
    const empty = mount(
      ResultCharts,
      {
        props: {
          sections: [{ result: resultItem, actions: new Set<ResultActionKind>(['plot', 'fills']) }],
          version: 'v7' as const,
          dataApi: {
            resultApiBaseFor: () => 'http://h:8000/api/backtest-v7',
            fetchCsv: () => Promise.resolve({ headers: [], rows: [] }),
            loadBe: () => Promise.resolve({ time: [], balance: [], equity: [], balance_btc: [], equity_btc: [] }),
            loadFills: () => Promise.resolve({ headers: [], rows: [] }),
            loadConfig: () => Promise.resolve({}),
            loadAnalysis: () => Promise.resolve({}),
            loadFiles: () => Promise.resolve([]),
            imageUrl: (path: string, _result: unknown, filename: string) => `http://h/img?path=${path}&filename=${filename}`,
            loadPrice: () => Promise.resolve({ available: false, time: [], close: [] }),
            beForCompare: () =>
              Promise.resolve({ path: '', version: 'v7' as const, be: { time: [], balance: [], equity: [], balance_btc: [], equity_btc: [] } }),
            clearCachesFor: () => undefined,
          },
        },
        global: { plugins: [createI18n('en')] },
        attachTo: document.body,
      }
    );
    await vi.waitFor(() => expect(empty.find('[data-test="plot-section"]').text()).toContain('No plot images found'));
    expect(empty.find('[data-test="fills-section"]').text()).toContain('No fills plots found');
  });

  it('a /results/files failure renders the red Failed message (:7574, :7592)', async () => {
    const failing = mount(
      ResultCharts,
      {
        props: {
          sections: [{ result: resultItem, actions: new Set<ResultActionKind>(['plot', 'fills']) }],
          version: 'v7' as const,
          dataApi: {
            resultApiBaseFor: () => 'http://h:8000/api/backtest-v7',
            fetchCsv: () => Promise.resolve({ headers: [], rows: [] }),
            loadBe: () => Promise.resolve({ time: [], balance: [], equity: [], balance_btc: [], equity_btc: [] }),
            loadFills: () => Promise.resolve({ headers: [], rows: [] }),
            loadConfig: () => Promise.resolve({}),
            loadAnalysis: () => Promise.resolve({}),
            loadFiles: () => Promise.reject(new Error('files unavailable')),
            imageUrl: () => '',
            loadPrice: () => Promise.resolve({ available: false, time: [], close: [] }),
            beForCompare: () =>
              Promise.resolve({ path: '', version: 'v7' as const, be: { time: [], balance: [], equity: [], balance_btc: [], equity_btc: [] } }),
            clearCachesFor: () => undefined,
          },
        },
        global: { plugins: [createI18n('en')] },
        attachTo: document.body,
      }
    );
    await vi.waitFor(() => expect(failing.find('[data-test="plot-section"]').text()).toContain('Failed: files unavailable'));
    expect(failing.find('[data-test="fills-section"]').text()).toContain('Failed: files unavailable');
  });
});
