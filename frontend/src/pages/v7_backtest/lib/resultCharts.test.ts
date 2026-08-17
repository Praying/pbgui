import { describe, expect, it } from 'vitest';
import {
  applyPriceOverlay,
  beChartTraces,
  chartLayout,
  compareTraces,
  COMPARE_COLORS,
  drawdownTraces,
  hardStopChartSpec,
  plotlyFullscreenConfig,
  pnlTraces,
  priceOverlayTrace,
  tweTraces,
} from './resultCharts';
import type { BacktestResultItem, BacktestVersion, BeSeries } from '../types';

/*
 * The chart *spec* builders — pure trace/layout factories mirroring the
 * legacy Plotly calls: _chartLayout (:7212-7224), renderBEChart
 * (:6968-7025), renderPnlChart (:7243-7282), renderTWEChart
 * (:7374-7513), renderHardStopDrawdownChart (:7127-7204) and the compare
 * trace builder (:7626-7634). Plotly itself is touched only by the
 * wrapper component.
 */

function be(): BeSeries {
  return {
    time: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'],
    balance: [100, 110],
    equity: [101, 109],
    balance_btc: [0.002, 0.0022],
    equity_btc: [0.0021, 0.0021],
  };
}

const result: BacktestResultItem = {
  path: 'backtests/cfg/binance/r1',
  config_name: 'cfg',
  result_name: 'r1',
  exchange_dir: 'binance',
  backtest_version: 'v7',
  modified: '2024-01-02T03:04:05Z',
};

describe('chartLayout (:7212-7224)', () => {
  it('builds the shared dark layout with unified hover', () => {
    const layout = chartLayout('T', 'Balance');
    expect(layout).toMatchObject({
      paper_bgcolor: '#0e1117',
      plot_bgcolor: '#0e1117',
      height: 800,
      hovermode: 'x unified',
      title: { text: 'T', x: 0.5 },
      yaxis: { gridcolor: '#333640', title: 'Balance' },
    });
    expect((layout.margin as Record<string, number>).l).toBe(60);
  });
});

describe('plotlyFullscreenConfig (:6436-6450)', () => {
  it('is responsive with the custom fullscreen modebar button', () => {
    const config = plotlyFullscreenConfig('Toggle Fullscreen');
    expect(config.responsive).toBe(true);
    const buttons = config.modeBarButtonsToAdd as Array<{ name: string; title: string; click: unknown }>;
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toMatchObject({ name: 'fullscreen', title: 'Toggle Fullscreen' });
    expect(typeof buttons[0]!.click).toBe('function');
  });
});

describe('BE chart traces (:6990-7023)', () => {
  it('balance uses the thick line, equity the thin one', () => {
    const traces = beChartTraces(be(), { isBtc: false });
    expect(traces).toHaveLength(2);
    expect(traces[0]!).toMatchObject({ name: 'equity' });
    expect((traces[0]!.line as Record<string, number>).width).toBe(0.75);
    expect(traces[1]!).toMatchObject({ name: 'balance' });
    expect((traces[1]!.line as Record<string, number>).width).toBe(2.5);
  });

  it('the BTC variant reads the *_btc series (:6995-6998)', () => {
    const traces = beChartTraces(be(), { isBtc: true });
    expect(traces[0]!).toMatchObject({ name: 'equity_btc', y: be().equity_btc });
    expect(traces[1]!).toMatchObject({ name: 'balance_btc', y: be().balance_btc });
  });

  it('drawdown traces plot the normalized 1→0 curve (:6981-6990)', () => {
    const series = { ...be(), equity: [100, 50] };
    const traces = drawdownTraces(series, { isBtc: false });
    expect(traces).toHaveLength(1);
    expect(traces[0]!).toMatchObject({ name: 'Drawdown', y: [1, 0.5] });
    expect((traces[0]!.line as Record<string, number>).width).toBe(1.5);
  });
});

describe('price overlay (:7004-7022)', () => {
  const price = {
    available: true,
    time: ['2024-01-01T00:00:00Z'],
    close: [42000],
    exchange: 'binance',
    coin: 'BTC',
  };

  it('the overlay trace rides the right axis with a dotted line', () => {
    const trace = priceOverlayTrace(price);
    expect(trace).toMatchObject({
      yaxis: 'y2',
      name: 'binance / BTC close',
      hovertemplate: '%{y:.8g}<extra>Coin price</extra>',
    });
    expect((trace.line as Record<string, unknown>).dash).toBe('dot');
  });

  it('applyPriceOverlay widens the right margin and mounts yaxis2 (:7014-7021)', () => {
    const layout = applyPriceOverlay(chartLayout('T', 'Balance'), price);
    expect((layout.margin as Record<string, number>).r).toBe(80);
    expect((layout.yaxis2 as Record<string, unknown>).title).toBe('BTC Price');
    expect((layout.yaxis2 as Record<string, unknown>).overlaying).toBe('y');
  });
});

describe('pnlTraces (:7243-7282)', () => {
  it('groups cumulative pnl+fees per coin', () => {
    const csv = {
      headers: ['time', 'coin', 'pnl', 'fee_paid'],
      rows: [
        { time: '2024-01-01T00:00:00Z', coin: 'BTC', pnl: '10', fee_paid: '-1' },
        { time: '2024-01-01T01:00:00Z', coin: 'ETH', pnl: '-2', fee_paid: '0' },
        { time: '2024-01-01T02:00:00Z', coin: 'BTC', pnl: '5', fee_paid: '0' },
      ],
    };
    const traces = pnlTraces(csv, result);
    expect(traces).toHaveLength(2);
    const btc = traces.find((tr) => tr.name === 'BTC');
    const eth = traces.find((tr) => tr.name === 'ETH');
    expect(btc?.y).toEqual([9, 14]);
    expect(eth?.y).toEqual([-2]);
  });

  it('uses the symbol column when coin is absent (:7252)', () => {
    const csv = {
      headers: ['time', 'symbol', 'pnl'],
      rows: [{ time: '2024-01-01T00:00:00Z', symbol: 'SOL', pnl: '3' }],
    };
    expect(pnlTraces(csv, result)[0]).toMatchObject({ name: 'SOL', y: [3] });
  });

  it('empty rows yield no traces (:7245-7247)', () => {
    expect(pnlTraces({ headers: ['time'], rows: [] }, result)).toEqual([]);
  });
});

describe('tweTraces (:7484-7503)', () => {
  function fillsCsv() {
    return {
      headers: ['', 'coin', 'balance', 'psize', 'pprice', 'type'],
      rows: [
        { '': '2024-01-01T00:00:00Z', coin: 'BTC', balance: '100', psize: '50', pprice: '2', type: 'long' },
        { '': '2024-01-01T01:00:00Z', coin: 'BTC', balance: '100', psize: '30', pprice: '2', type: 'short' },
      ],
    };
  }

  it('builds Long/Short TWE aggregates plus legendonly per-coin traces', () => {
    const traces = tweTraces(fillsCsv(), 1440, result);
    const names = traces.map((tr) => String(tr.name));
    expect(names).toEqual(['Long TWE', 'Short TWE', 'BTC Long WE', 'BTC Short WE']);
    // WE = (1/balance) * psize * pprice: long 50*2/100 = 1, short 30*2/100 = 0.6
    expect(traces[0]!).toMatchObject({ y: [1] });
    expect(traces[1]!).toMatchObject({ y: [0.6] });
    expect(traces[2]!).toMatchObject({ visible: 'legendonly' });
  });

  it('rows with zero balance are skipped (:7396-7397)', () => {
    const csv = {
      headers: ['', 'coin', 'balance', 'psize', 'pprice'],
      rows: [{ '': '2024-01-01T00:00:00Z', coin: 'BTC', balance: '0', psize: '50', pprice: '2' }],
    };
    expect(tweTraces(csv, 1440, result)).toEqual([]);
  });

  it('empty rows yield no traces (:7376-7378)', () => {
    expect(tweTraces({ headers: [], rows: [] }, 1440, result)).toEqual([]);
  });
});

describe('compareTraces (:7626-7634)', () => {
  it('labels each pair with version + last three path segments and cycles the palette', () => {
    const items = [
      { path: 'backtests_v8/cfg/bybit/r1', version: 'v8' as BacktestVersion, be: be() },
      { path: 'backtests/cfg2/binance/r2', version: 'v7' as BacktestVersion, be: { ...be(), time: [] } },
    ];
    const traces = compareTraces(items);
    expect(traces).toHaveLength(2); // the empty-BE item is dropped
    expect(traces[0]).toMatchObject({ name: 'eq PBV8 cfg/bybit/r1', line: { width: 0.75, color: COMPARE_COLORS[0] } });
    expect(traces[1]).toMatchObject({ name: 'bal PBV8 cfg/bybit/r1', line: { width: 2.5, color: COMPARE_COLORS[0], dash: 'dot' } });
  });
});

describe('hardStopChartSpec (:7127-7204)', () => {
  const v8Config = {
    bot: {
      long: {
        risk: { total_wallet_exposure_limit: 1, n_positions: 3 },
        hsl: { enabled: true, red_threshold: 0.2, ema_span_minutes: 60, tier_ratios: { yellow: 0.5, orange: 0.75 } },
      },
    },
    live: { pnls_max_lookback_days: 30 },
  };

  it('returns an empty reason when no side enables the hard stop (:7131-7133)', () => {
    const spec = hardStopChartSpec('v8', be(), { bot: {} });
    expect(spec.traces).toEqual([]);
    expect(String(spec.emptyReason)).toContain('not enabled');
  });

  it('builds raw/EMA/score/threshold/proximity traces for the enabled side', () => {
    const spec = hardStopChartSpec('v8', be(), v8Config);
    expect(spec.emptyReason).toBeNull();
    const names = spec.traces.map((tr) => String(tr.name));
    expect(names).toContain('Raw Drawdown');
    expect(names).toContain('EMA Drawdown');
    expect(names).toContain('Trigger Score');
    expect(names).toContain('Yellow Threshold');
    expect(names).toContain('Orange Threshold');
    expect(names).toContain('RED Threshold');
    expect(names).toContain('RED Proximity');
    expect(names).toContain('RED Hit');
    expect((spec.layout as Record<string, unknown>).height).toBe(800);
  });

  it('renders both sides with prefixed names and a taller layout (:7155-7163)', () => {
    const bothSides = {
      bot: {
        long: v8Config.bot.long,
        short: {
          risk: { total_wallet_exposure_limit: 1, n_positions: 2 },
          hsl: { enabled: true, red_threshold: 0.4, ema_span_minutes: 30 },
        },
      },
      live: {},
    };
    const spec = hardStopChartSpec('v8', be(), bothSides);
    const names = spec.traces.map((tr) => String(tr.name));
    expect(names).toContain('Long Raw Drawdown');
    expect(names).toContain('Short Raw Drawdown');
    expect((spec.layout as Record<string, unknown>).height).toBe(1100);
  });
});
