import { describe, expect, it } from 'vitest';
import {
  backtestExchangeOptions,
  buildExtraBtKeys,
  formatFeeInputValue,
  normalizeBacktestHslSignalModeValue,
  normalizeLogLevelValue,
  populateBacktestForm,
} from './backtestFormModel';

/*
 * Form model — the field seeding of showConfigEditor (:2599-2893) and
 * cfgSyncEditorFromParsed (:3345-3427), plus the shared normalizers
 * (formatFeeInputValue :2255-2259, normalizeLogLevelValue :4466-4472,
 * normalizeBacktestHslSignalModeValue :4486-4491,
 * backtestExchangeOptions :4493-4504, extra-bt classification :2186-2245).
 */

const EMPTY_CFG: Record<string, unknown> = {};

function form(cfg: Record<string, unknown>, name = 'cfg', options: { isV8?: boolean; hslModes?: string[]; exchangeOptions?: string[] } = {}) {
  return populateBacktestForm(name, cfg, {
    isV8: options.isV8 ?? false,
    hslModes: options.hslModes ?? ['coin', 'pside', 'unified'],
    exchangeOptions: options.exchangeOptions ?? [],
  });
}

describe('identity + time defaults (:2600-2613)', () => {
  it('seeds empty cfg with the documented defaults', () => {
    const state = form(EMPTY_CFG, '');
    expect(state.name).toBe('');
    expect(state.startDate).toBe('2020-01-01');
    expect(state.liquidationThreshold).toBe('0.05');
    expect(state.dynamicWelByTradability).toBe(true);
    expect(state.marketOrderSlippagePct).toBe('0.0005');
    expect(state.filterByMinEffectiveCost).toBe(true);
    expect(state.minimumCoinAgeDays).toBe('30');
    expect(state.startingBalance).toBe('1000');
    expect(state.balanceSampleDivider).toBe('60');
    expect(state.btcCollateralCap).toBe('0');
    expect(state.btcCollateralLtvCap).toBe('0');
    expect(state.marketCap).toBe('0');
    expect(state.volMcap).toBe('10');
    expect(state.candleIntervalMinutes).toBe('1');
    expect(state.gapToleranceOhlcvsMinutes).toBe('5');
    expect(state.loggingLevel).toBe('1');
  });

  it("renders end_date 'now' as today and remembers the semantic value (:2612, :2919)", () => {
    const today = new Date().toISOString().slice(0, 10);
    const state = form({ backtest: { end_date: 'now' } });
    expect(state.endDate).toBe(today);
    expect(state.endDateIsNow).toBe(true);
  });

  it('keeps a concrete end_date and clears the semantic flag', () => {
    const state = form({ backtest: { end_date: '2024-06-01', start_date: '2021-02-03' } });
    expect(state.endDate).toBe('2024-06-01');
    expect(state.endDateIsNow).toBe(false);
    expect(state.startDate).toBe('2021-02-03');
  });

  it('falls back to live.minimum_coin_age_days when backtest omits it (:2621)', () => {
    expect(form({ live: { minimum_coin_age_days: 7 } }).minimumCoinAgeDays).toBe('7');
    expect(form({ live: { minimum_coin_age_days: 0 } }).minimumCoinAgeDays).toBe('0');
  });

  it('reads filter_by_min_effective_cost from backtest, else live !== false (:2667)', () => {
    expect(form({ backtest: { filter_by_min_effective_cost: false } }).filterByMinEffectiveCost).toBe(false);
    expect(form({ live: { filter_by_min_effective_cost: false } }).filterByMinEffectiveCost).toBe(false);
    expect(form({ live: { filter_by_min_effective_cost: true } }).filterByMinEffectiveCost).toBe(true);
  });
});

describe('fee inputs (:2638-2659, formatFeeInputValue :2255-2259)', () => {
  it('disabled + value 0 when the override is null/undefined', () => {
    const state = form(EMPTY_CFG);
    expect(state.makerFeeEnabled).toBe(false);
    expect(state.makerFeeVal).toBe('0');
    expect(state.takerFeeEnabled).toBe(false);
    expect(state.takerFeeVal).toBe('0');
  });

  it('enabled with the precision-normalized value when set', () => {
    const state = form({ backtest: { maker_fee_override: 0.0002, taker_fee_override: 0.0005500000000001 } });
    expect(state.makerFeeEnabled).toBe(true);
    expect(state.makerFeeVal).toBe('0.0002');
    expect(state.takerFeeEnabled).toBe(true);
    expect(state.takerFeeVal).toBe('0.00055');
  });

  it('formatFeeInputValue passes non-finite values through (Number(null) is finite 0)', () => {
    expect(formatFeeInputValue('abc')).toBe('abc');
    expect(formatFeeInputValue(null)).toBe('0');
  });
});

describe('normalizers', () => {
  it('normalizeLogLevelValue clamps to 0..3 with fallback (:4466-4472)', () => {
    expect(normalizeLogLevelValue('2', 1)).toBe('2');
    expect(normalizeLogLevelValue(undefined, 1)).toBe('1');
    expect(normalizeLogLevelValue('junk', 1)).toBe('1');
    expect(normalizeLogLevelValue(-4, 1)).toBe('0');
    expect(normalizeLogLevelValue(9, 1)).toBe('3');
  });

  it('normalizeBacktestHslSignalModeValue keeps configured/unknown values and defaults to the first option (:4474-4491)', () => {
    const modes = ['coin', 'pside', 'unified'];
    expect(normalizeBacktestHslSignalModeValue('pside', modes)).toBe('pside');
    expect(normalizeBacktestHslSignalModeValue(' custom ', modes)).toBe('custom');
    expect(normalizeBacktestHslSignalModeValue('', modes)).toBe('coin');
    expect(normalizeBacktestHslSignalModeValue(null, [])).toBe('');
  });

  it('backtestExchangeOptions unions settings options with the selected list (:4493-4504)', () => {
    expect(backtestExchangeOptions(['bybit', 'weird'], { isV8: true, exchangeOptions: ['binance', 'bybit'] })).toEqual([
      'binance',
      'bybit',
      'weird',
    ]);
    // v7 (or v8 without settings) uses the static fallback list
    expect(backtestExchangeOptions(['kucoin'], { isV8: false, exchangeOptions: ['zzz'] })[0]).toBe('binance');
    expect(backtestExchangeOptions(['kucoin'], { isV8: false, exchangeOptions: ['zzz'] })).toContain('combined');
    expect(backtestExchangeOptions(['kucoin'], { isV8: false, exchangeOptions: ['zzz'] })).toContain('kucoin');
  });
});

describe('bot sides (:2816-2871)', () => {
  it('stringifies bot.long/bot.short with the TWE/npos defaults 1/0', () => {
    const state = form({ bot: { long: { total_wallet_exposure_limit: 2 } } });
    expect(JSON.parse(state.botLongJson)).toEqual({ total_wallet_exposure_limit: 2 });
    expect(JSON.parse(state.botShortJson)).toEqual({});
    expect(state.longTwe).toBe('2');
    expect(state.longNpos).toBe('1');
    expect(state.shortTwe).toBe('0');
    expect(state.shortNpos).toBe('0');
  });

  it('reads TWE/npos through the v8 risk.* remap', () => {
    const state = form({ bot: { long: { risk: { total_wallet_exposure_limit: 3, n_positions: 9 } } } }, 'cfg', { isV8: true });
    expect(state.longTwe).toBe('3');
    expect(state.longNpos).toBe('9');
  });
});

describe('extra backtest params (:2186-2245)', () => {
  it('collects unknown keys sorted, excluding known + v8-advanced sets', () => {
    const bt = {
      start_date: '2020-01-01', // known → excluded
      market_settings: {}, // v8-advanced → excluded on v8
      visible_metrics: [], // v8-advanced → excluded on v8
      hlcvs_data_dir: null,
      zzz_custom: 'value',
      numeric_extra: 5,
      flag_extra: true,
      obj_extra: { a: 1 },
    };
    const v7 = buildExtraBtKeys(bt, false);
    expect(v7.map((f) => f.key)).toEqual(['flag_extra', 'hlcvs_data_dir', 'market_settings', 'numeric_extra', 'obj_extra', 'visible_metrics', 'zzz_custom']);
    const v8 = buildExtraBtKeys(bt, true);
    expect(v8.map((f) => f.key)).toEqual(['flag_extra', 'hlcvs_data_dir', 'numeric_extra', 'obj_extra', 'zzz_custom']);
  });

  it('classifies kinds by the legacy typeof ladder and snapshots json text', () => {
    const fields = buildExtraBtKeys({ a: null, b: true, c: 1.5, d: { x: 1 }, e: 's' }, false);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.a!.kind).toBe('null');
    expect(byKey.b!.kind).toBe('boolean');
    expect(byKey.c!.kind).toBe('number');
    expect(byKey.d!.kind).toBe('json');
    expect(byKey.d!.text).toBe('{\n  "x": 1\n}');
    expect(byKey.e!.kind).toBe('string');
  });

  it('seeds extra fields into the form state with their display text', () => {
    const state = form({ backtest: { hlcvs_data_dir: null, numeric_extra: 5 } });
    expect(state.extraBt.map((f) => `${f.key}:${f.kind}`)).toEqual(['hlcvs_data_dir:null', 'numeric_extra:number']);
  });
});

describe('coin filters (:2756-2804)', () => {
  it('seeds pbgui filters, tags and the four coin lists from live', () => {
    const state = form({
      pbgui: { market_cap: 123, vol_mcap: 4.5, tags: ['a'], only_cpt: true, notices_ignore: true },
      live: {
        approved_coins: { long: ['BTC'], short: 'all' },
        ignored_coins: { long: ['DOGE'], short: [] },
      },
    });
    expect(state.marketCap).toBe('123');
    expect(state.volMcap).toBe('4.5');
    expect(state.tags).toEqual(['a']);
    expect(state.onlyCpt).toBe(true);
    expect(state.noticesIgnore).toBe(true);
    expect(state.approvedLong).toEqual(['BTC']);
    expect(state.approvedShort).toEqual(['all']);
    expect(state.ignoredLong).toEqual(['DOGE']);
    expect(state.ignoredShort).toEqual([]);
  });

  it('seeds the raw JSON text of the whole config (:2888)', () => {
    const state = form({ backtest: { start_date: '2021-01-01' } });
    expect(JSON.parse(state.rawJson).backtest.start_date).toBe('2021-01-01');
  });
});
