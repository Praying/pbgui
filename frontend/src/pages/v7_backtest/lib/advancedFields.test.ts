import { describe, expect, it } from 'vitest';
import {
  MARKET_FIELDS,
  collectMarketSettings,
  collectVisibleMetrics,
  flattenMarketSettings,
  marketSettingsExtras,
  metricCategory,
  serializeMarketSettings,
  validateMarketSettings,
  validatePb8AdvancedFields,
  visibleMetricsState,
  type MarketSettingsRow,
  type ResultMetricsState,
} from './advancedFields';

/*
 * Advanced fields — the port of js/backtest_advanced_fields.js (135 L:
 * flatten/extras/serialize, visibleMetricsState, metricCategory) plus the
 * page-side marketSettingsCollect (:2372-2383), marketSettingsValidate
 * (:2385-2411), resultMetricsCollect (:2538-2542) and the pb8 save gate
 * pb8AdvancedFieldsValidate (:2544-2561).
 */

describe('flattenMarketSettings (:37-70)', () => {
  it('splits overrides into global rows and per-exchange rows, coins sorted', () => {
    const rows = flattenMarketSettings({
      overrides: { ZEC: { min_cost: 2 }, BTC: {} },
      overrides_by_exchange: { bybit: { ETH: { qty_step: 0.001 } } },
    });
    expect(rows).toEqual([
      { scope: 'global', exchange: '', coin: 'BTC', values: {} },
      { scope: 'global', exchange: '', coin: 'ZEC', values: { min_cost: 2 } },
      { scope: 'exchange', exchange: 'bybit', coin: 'ETH', values: { qty_step: 0.001 } },
    ]);
  });

  it('throws on non-object shapes (the load-error path)', () => {
    expect(() => flattenMarketSettings([1])).toThrow(TypeError);
    expect(() => flattenMarketSettings({ overrides: 'nope' })).toThrow(TypeError);
    expect(() => flattenMarketSettings({ overrides_by_exchange: { binance: 5 } })).toThrow(TypeError);
    expect(flattenMarketSettings(null)).toEqual([]);
    expect(flattenMarketSettings(undefined)).toEqual([]);
  });

  it('extras keep every root key except the two override maps (:72-80)', () => {
    expect(marketSettingsExtras({ overrides: {}, overrides_by_exchange: {}, note: 'n', version: 3 })).toEqual({ note: 'n', version: 3 });
    expect(marketSettingsExtras(null)).toEqual({});
  });
});

describe('serializeMarketSettings (:82-103)', () => {
  it('rebuilds the nested maps, upper-casing coins on v7, preserving identifiers on v8', () => {
    const rows: MarketSettingsRow[] = [
      { scope: 'global', exchange: '', coin: 'btc', values: { min_cost: 2 } },
      { scope: 'exchange', exchange: 'Bybit', coin: 'eth', values: {} },
      { scope: 'global', exchange: '', coin: '  ', values: { min_cost: 1 } },
    ];
    expect(serializeMarketSettings(rows, {}, false)).toEqual({
      overrides: { BTC: { min_cost: 2 } },
      overrides_by_exchange: { bybit: { ETH: {} } },
    });
    expect(serializeMarketSettings(rows.slice(0, 1), {}, true)).toEqual({ overrides: { btc: { min_cost: 2 } }, overrides_by_exchange: {} });
  });

  it('keeps extras at the root (:82)', () => {
    expect(serializeMarketSettings([], { keep: 1 }, false)).toEqual({ keep: 1, overrides: {}, overrides_by_exchange: {} });
  });
});

describe('visibleMetricsState (:105-116) + resultMetricsCollect (:2538-2542)', () => {
  it('maps null/[]/list to default/all/custom', () => {
    expect(visibleMetricsState(null)).toEqual({ mode: 'default', selected: [] });
    expect(visibleMetricsState([])).toEqual({ mode: 'all', selected: [] });
    expect(visibleMetricsState(['adg_strategy_eq'])).toEqual({ mode: 'custom', selected: ['adg_strategy_eq'] });
    expect(() => visibleMetricsState('x' as unknown as string[])).toThrow(TypeError);
    expect(() => visibleMetricsState([''])).toThrow(TypeError);
  });

  it('collects null for default, [] for all, the list for custom', () => {
    const base: ResultMetricsState = { mode: 'default', selected: [], available: [], error: '' };
    expect(collectVisibleMetrics(base)).toBeNull();
    expect(collectVisibleMetrics({ ...base, mode: 'all' })).toEqual([]);
    expect(collectVisibleMetrics({ ...base, mode: 'custom', selected: ['a', 'b'] })).toEqual(['a', 'b']);
  });
});

describe('metricCategory (:118-125)', () => {
  it('buckets metrics into the five legacy categories', () => {
    expect(metricCategory('hard_stop_loss')).toBe('Hard Stop');
    expect(metricCategory('n_fills')).toBe('Trading Activity');
    expect(metricCategory('drawdown_worst')).toBe('Risk & Recovery');
    expect(metricCategory('sharpe_ratio')).toBe('Performance Ratios');
    expect(metricCategory('adg')).toBe('Returns & Growth');
  });
});

describe('collectMarketSettings (:2372-2383)', () => {
  it('coerces numeric field strings and passes them to serialize with the flavor flag', () => {
    const rows: MarketSettingsRow[] = [
      { scope: 'global', exchange: '', coin: 'btc', values: { min_cost: '2.5', qty_step: 'abc' } },
    ];
    expect(collectMarketSettings({ rows, extras: {}, error: '' }, false)).toEqual({
      overrides: { BTC: { min_cost: 2.5, qty_step: 'abc' } },
      overrides_by_exchange: {},
    });
  });
});

describe('validateMarketSettings (:2385-2411) — the advanced-field gates', () => {
  it('accepts empty and well-formed rows', () => {
    expect(validateMarketSettings({ rows: [], extras: {}, error: '' })).toBe('');
    const ok = validateMarketSettings({
      rows: [{ scope: 'exchange', exchange: 'bybit', coin: 'BTC', values: { qty_step: '0.001', min_cost: '0' } }],
      extras: {},
      error: '',
    });
    expect(ok).toBe('');
  });

  it('surfaces the load error first, then missing coin/exchange', () => {
    expect(validateMarketSettings({ rows: [], extras: {}, error: 'boom' })).toContain('boom');
    expect(validateMarketSettings({ rows: [{ scope: 'global', exchange: '', coin: '', values: {} }], extras: {}, error: '' })).toContain('requires a coin');
    expect(
      validateMarketSettings({ rows: [{ scope: 'exchange', exchange: ' ', coin: 'BTC', values: {} }], extras: {}, error: '' })
    ).toContain('requires an exchange');
  });

  it('rejects duplicates, non-numeric and non-positive values', () => {
    const dup = [{ scope: 'global', exchange: '', coin: 'BTC', values: {} }, { scope: 'global', exchange: '', coin: 'BTC', values: {} }] as MarketSettingsRow[];
    expect(validateMarketSettings({ rows: dup, extras: {}, error: '' })).toContain('duplicate');
    expect(
      validateMarketSettings({ rows: [{ scope: 'global', exchange: '', coin: 'BTC', values: { min_cost: 'abc' } }], extras: {}, error: '' })
    ).toContain('must be numeric');
    expect(
      validateMarketSettings({ rows: [{ scope: 'global', exchange: '', coin: 'BTC', values: { qty_step: '0' } }], extras: {}, error: '' })
    ).toContain('greater than zero');
    expect(
      validateMarketSettings({ rows: [{ scope: 'global', exchange: '', coin: 'BTC', values: { min_cost: '-1' } }], extras: {}, error: '' })
    ).toContain('cannot be negative');
  });
});

describe('validatePb8AdvancedFields (:2544-2561)', () => {
  it('passes trivially on v7', () => {
    expect(validatePb8AdvancedFields(false, { rows: [], extras: {}, error: 'x' }, { mode: 'custom', selected: [], available: [], error: '' })).toBe('');
  });

  it('routes market-settings errors to the market scope and metrics errors to the metrics scope', () => {
    const metrics: ResultMetricsState = { mode: 'default', selected: [], available: [], error: '' };
    const badMarket = validatePb8AdvancedFields(true, { rows: [{ scope: 'global', exchange: '', coin: '', values: {} }], extras: {}, error: '' }, metrics);
    expect(badMarket).toMatch(/^Market Settings/);

    const badMetrics = validatePb8AdvancedFields(
      true,
      { rows: [], extras: {}, error: '' },
      { mode: 'custom', selected: [], available: [], error: 'bad list' }
    );
    expect(badMetrics).toMatch(/^Result Metrics/);

    const emptyCustom = validatePb8AdvancedFields(true, { rows: [], extras: {}, error: '' }, { mode: 'custom', selected: [], available: [], error: '' });
    expect(emptyCustom).toContain('at least one custom result metric');

    expect(validatePb8AdvancedFields(true, { rows: [], extras: {}, error: '' }, metrics)).toBe('');
  });
});

describe('MARKET_FIELDS (:16-19)', () => {
  it('keeps the five editable market fields in the legacy order', () => {
    expect(MARKET_FIELDS).toEqual(['qty_step', 'price_step', 'min_qty', 'min_cost', 'c_mult']);
  });
});
