import { describe, expect, it } from 'vitest';
import { collectBacktestConfig, finalizeBacktestConfigForSave, getManagedBacktestBaseDir, validateBacktestDateRanges } from './backtestCollect';
import { populateBacktestForm } from './backtestFormModel';

/*
 * collectBacktestConfig — the golden-parity port of collectConfig
 * (:4662-4810): raw JSON is the base (unknown keys survive), every
 * structured field overlays it, then the suite fragment, coin
 * overrides and extra backtest params merge in.
 */

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    isV8: false,
    suite: { suite_enabled: false, scenarios: [], aggregate: { default: 'mean' } },
    coinOverrides: undefined,
    marketSettings: null,
    resultMetrics: null,
    marketSettingsError: '',
    resultMetricsError: '',
    ...overrides,
  };
}

function state(cfg: Record<string, unknown>, name = 'mycfg', isV8 = false) {
  return populateBacktestForm(name, cfg, { isV8, hslModes: ['coin', 'pside', 'unified'], exchangeOptions: [] });
}

describe('collectConfig (:4662-4810)', () => {
  it('round-trips an edited config and preserves unknown keys at every level', () => {
    const cfg = {
      backtest: { start_date: '2021-01-01', end_date: '2022-02-02', exchanges: ['bybit'], unknown_bt: 'keep' },
      live: { approved_coins: { long: ['BTC'], short: [] }, ignored_coins: { long: [], short: [] }, custom_live: 42 },
      pbgui: { custom_pbgui: 'x' },
      bot: { long: { total_wallet_exposure_limit: 1, extra: {} }, short: { n_positions: 0 } },
      logging: { level: 2 },
      mystery_top_level: { deep: [1, 2] },
    };
    const form = state(cfg);
    form.name = 'mycfg';
    form.startingBalance = '5000';
    form.rawJson = JSON.stringify(cfg); // the textarea seeds the base
    const out = collectBacktestConfig(form, ctx());
    expect(out.mystery_top_level).toEqual({ deep: [1, 2] });
    expect((out.backtest as Record<string, unknown>).unknown_bt).toBe('keep');
    expect((out.live as Record<string, unknown>).custom_live).toBe(42);
    expect((out.pbgui as Record<string, unknown>).custom_pbgui).toBe('x');
    expect((out.backtest as Record<string, unknown>).start_date).toBe('2021-01-01');
    expect((out.backtest as Record<string, unknown>).end_date).toBe('2022-02-02');
    expect((out.backtest as Record<string, unknown>).starting_balance).toBe(5000);
    expect((out.backtest as Record<string, unknown>).exchanges).toEqual(['bybit']);
    expect((out.logging as Record<string, unknown>).level).toBe(2);
    expect((out.live as Record<string, unknown>).approved_coins).toEqual({ long: ['BTC'], short: [] });
    expect((out.bot as Record<string, unknown>).long).toEqual({ total_wallet_exposure_limit: 1, n_positions: 1, extra: {} });
  });

  it('collects end_date "now" from the semantic flag (:4674-4675)', () => {
    const form = state({ backtest: { end_date: 'now' } });
    form.endDateIsNow = true;
    const out = collectBacktestConfig(form, ctx());
    expect((out.backtest as Record<string, unknown>).end_date).toBe('now');
  });

  it('maps ltv 0 → null, empty ohlcv dir → null, and the fee checkboxes (:4683-4703)', () => {
    const form = state({});
    form.btcCollateralLtvCap = '0';
    form.ohlcvSourceDir = '  ';
    form.makerFeeEnabled = true;
    form.makerFeeVal = '0.0002';
    form.takerFeeEnabled = false;
    const out = collectBacktestConfig(form, ctx());
    expect((out.backtest as Record<string, unknown>).btc_collateral_ltv_cap).toBeNull();
    expect((out.backtest as Record<string, unknown>).ohlcv_source_dir).toBeNull();
    expect((out.backtest as Record<string, unknown>).maker_fee_override).toBeCloseTo(0.0002);
    expect((out.backtest as Record<string, unknown>).taker_fee_override).toBeNull();
  });

  it('always sets the managed base_dir (:4688-4689)', () => {
    const out = collectBacktestConfig(state({}, 'name with spaces'), ctx());
    expect((out.backtest as Record<string, unknown>).base_dir).toBe('backtests/pbgui/name with spaces');
  });

  it('collapses approved "all" per the legacy ladder (:4736-4744)', () => {
    const form = state({});
    form.approvedLong = ['all'];
    form.approvedShort = ['all'];
    expect((collectBacktestConfig(form, ctx()).live as Record<string, unknown>).approved_coins).toBe('all');

    const half = state({});
    half.approvedLong = ['all'];
    half.approvedShort = ['BTC'];
    expect((collectBacktestConfig(half, ctx()).live as Record<string, unknown>).approved_coins).toEqual({ long: 'all', short: ['BTC'] });

    const none = state({});
    none.approvedLong = ['BTC', 'ETH'];
    none.approvedShort = [];
    expect((collectBacktestConfig(none, ctx()).live as Record<string, unknown>).approved_coins).toEqual({ long: ['BTC', 'ETH'], short: [] });
  });

  it('drops deprecated live/pbgui keys present in the raw base (:4746, :4751)', () => {
    const cfg = { live: { empty_means_all_approved: true }, pbgui: { use_pbgui_market_data: true } };
    const form = state(cfg);
    form.rawJson = JSON.stringify(cfg);
    const out = collectBacktestConfig(form, ctx());
    expect(out.live).not.toHaveProperty('empty_means_all_approved');
    expect(out.pbgui).not.toHaveProperty('use_pbgui_market_data');
  });

  it('coin_sources/market_settings_sources are deleted when empty, kept when set (:4711-4716)', () => {
    const empty = state({ backtest: { coin_sources: {}, market_settings_sources: {} } });
    const outEmpty = collectBacktestConfig(empty, ctx());
    expect(outEmpty.backtest).not.toHaveProperty('coin_sources');
    expect(outEmpty.backtest).not.toHaveProperty('market_settings_sources');

    const filled = state({});
    filled.coinSources = { BTC: 'binance' };
    filled.marketSettingsSources = { ETH: 'bybit' };
    const outFilled = collectBacktestConfig(filled, ctx());
    expect((outFilled.backtest as Record<string, unknown>).coin_sources).toEqual({ BTC: 'binance' });
    expect((outFilled.backtest as Record<string, unknown>).market_settings_sources).toEqual({ ETH: 'bybit' });
  });

  it('overlays bot JSON, then TWE/npos through the flavor remap (:4756-4766)', () => {
    const form = state({ bot: { long: { total_wallet_exposure_limit: 1, keep: 'me' }, short: {} } });
    form.botLongJson = JSON.stringify({ total_wallet_exposure_limit: 1, keep: 'me' });
    form.longTwe = '1.75';
    form.longNpos = '6';
    form.shortTwe = '0';
    form.shortNpos = '0';
    const out = collectBacktestConfig(form, ctx());
    expect((out.bot as Record<string, unknown>).long).toEqual({ total_wallet_exposure_limit: 1.75, n_positions: 6, keep: 'me' });
    expect((out.bot as Record<string, unknown>).short).toEqual({ total_wallet_exposure_limit: 0, n_positions: 0 });

    const v8form = state({ bot: { long: {} } }, 'cfg', true);
    v8form.botLongJson = '{}';
    v8form.longTwe = '2';
    v8form.longNpos = '3';
    const v8out = collectBacktestConfig(v8form, ctx({ isV8: true }));
    expect((v8out.bot as Record<string, unknown>).long).toEqual({ risk: { total_wallet_exposure_limit: 2, n_positions: 3 } });
  });

  it('falls back to the raw JSON bot side when the textarea is unparseable (:4757-4762)', () => {
    const cfg = { bot: { long: { preserved: true } } };
    const form = state(cfg);
    form.botLongJson = '{oops';
    const out = collectBacktestConfig(form, ctx());
    expect((out.bot as Record<string, unknown>).long).toEqual({ preserved: true, total_wallet_exposure_limit: 1, n_positions: 1 });
  });

  it('merges the suite fragment and deletes the keys when disabled (:4769-4778)', () => {
    const disabled = collectBacktestConfig(state({ backtest: { suite_enabled: true, scenarios: [{ label: 'x' }], aggregate: { default: 'max' } } }), ctx());
    expect(disabled.backtest).not.toHaveProperty('suite_enabled');
    expect(disabled.backtest).not.toHaveProperty('scenarios');
    expect(disabled.backtest).not.toHaveProperty('aggregate');

    const enabled = collectBacktestConfig(
      state({ backtest: {} }),
      ctx({ suite: { suite_enabled: true, scenarios: [{ label: 'a' }, { label: 'b' }], aggregate: { default: 'min' } } })
    );
    expect((enabled.backtest as Record<string, unknown>).suite_enabled).toBe(true);
    expect((enabled.backtest as Record<string, unknown>).scenarios).toEqual([{ label: 'a' }, { label: 'b' }]);
    expect((enabled.backtest as Record<string, unknown>).aggregate).toEqual({ default: 'min' });
  });

  it('writes PB8 reducer and removes the legacy aggregate alias', () => {
    const form = state({ backtest: { aggregate: { default: 'mean' }, reducer: { default: 'mean' } } }, 'v8cfg', true);
    const out = collectBacktestConfig(form, ctx({
      isV8: true,
      suite: {
        suite_enabled: true,
        scenarios: [{ label: 'train' }],
        aggregate: { default: 'median', nested: { keep: true } },
        scenario_template: { template: 'walk_forward', parameters: { window_days: 90 } },
      },
    }));
    const backtest = out.backtest as Record<string, unknown>;
    expect(backtest.reducer).toEqual({ default: 'median', nested: { keep: true } });
    expect(backtest).not.toHaveProperty('aggregate');
    expect(out.pbgui).toHaveProperty('scenario_template');
  });

  it('writes PB7 aggregate and removes reducer', () => {
    const form = state({ backtest: { reducer: { default: 'median' } } });
    const out = collectBacktestConfig(form, ctx({ suite: { suite_enabled: true, scenarios: [], aggregate: { default: 'max' } } }));
    const backtest = out.backtest as Record<string, unknown>;
    expect(backtest.aggregate).toEqual({ default: 'max' });
    expect(backtest).not.toHaveProperty('reducer');
  });

  it('deletes suite aliases and provenance when disabled', () => {
    const form = state({
      backtest: {
        suite_enabled: true,
        scenarios: [{ label: 'old' }],
        aggregate: { default: 'mean' },
        reducer: { default: 'median' },
      },
      pbgui: { scenario_template: { template: 'rolling_windows' } },
    }, 'disabled', true);
    const out = collectBacktestConfig(form, ctx({ isV8: true }));
    expect(out.backtest).not.toHaveProperty('suite_enabled');
    expect(out.backtest).not.toHaveProperty('scenarios');
    expect(out.backtest).not.toHaveProperty('aggregate');
    expect(out.backtest).not.toHaveProperty('reducer');
    expect(out.pbgui).not.toHaveProperty('scenario_template');
  });

  it('moves coin overrides in/out per the panel snapshot (:4780-4786)', () => {
    const without = collectBacktestConfig(state({ coin_overrides: { BTC: {} } }), ctx());
    expect(without).not.toHaveProperty('coin_overrides');

    const withOverrides = collectBacktestConfig(state({}), ctx({ coinOverrides: { BTC: { a: 1 } } }));
    expect(withOverrides.coin_overrides).toEqual({ BTC: { a: 1 } });
  });

  it('overlays extra backtest params with the legacy type ladder (:4789-4807)', () => {
    const cfg = { backtest: { flag: false, num: '1', obj: { x: 1 }, maybe: 'text', raw: 'x' } };
    const form = state(cfg);
    // field kinds re-derived per type ladder; rebuild the array with edited values
    form.extraBt = form.extraBt.map((field) => {
      if (field.key === 'flag') return { ...field, checked: true };
      if (field.key === 'num') return { ...field, kind: 'number' as const, text: '2.5' };
      if (field.key === 'obj') return { ...field, kind: 'json' as const, text: '{"y":2}' };
      if (field.key === 'maybe') return { ...field, kind: 'null' as const, text: '' };
      if (field.key === 'raw') return { ...field, kind: 'string' as const, text: 'kept' };
      return field;
    });
    const out = collectBacktestConfig(form, ctx());
    expect((out.backtest as Record<string, unknown>).flag).toBe(true);
    expect((out.backtest as Record<string, unknown>).num).toBe(2.5);
    expect((out.backtest as Record<string, unknown>).obj).toEqual({ y: 2 });
    expect((out.backtest as Record<string, unknown>).maybe).toBeNull();
    expect((out.backtest as Record<string, unknown>).raw).toBe('kept');
  });

  it('writes market_settings/visible_metrics only on v8 (:4717-4722)', () => {
    const marketSettings = { mode: 'default', rows: [], extras: {}, error: '' };
    const resultMetrics = { mode: 'custom', selected: ['adg'], error: '', available: [] };
    const v7 = collectBacktestConfig(state({}, 'c', false), ctx({ isV8: false, marketSettings, resultMetrics }));
    expect(v7.backtest).not.toHaveProperty('market_settings');
    expect(v7.backtest).not.toHaveProperty('visible_metrics');

    const v8 = collectBacktestConfig(state({}, 'c', true), ctx({ isV8: true, marketSettings, resultMetrics }));
    // v8 mounts the expander (:2308) → always collected when no load error
    expect((v8.backtest as Record<string, unknown>).market_settings).toEqual({ overrides: {}, overrides_by_exchange: {} });
    expect((v8.backtest as Record<string, unknown>).visible_metrics).toEqual(['adg']);
  });
});

describe('finalizeBacktestConfigForSave (:4812-4821)', () => {
  it('forces the managed base_dir and rejects non-object configs', () => {
    const cfg = { backtest: { base_dir: 'backtests/pbgui/{config-name}' } };
    const out = finalizeBacktestConfigForSave('final', cfg);
    expect((out.backtest as Record<string, unknown>).base_dir).toBe('backtests/pbgui/final');
    expect(() => finalizeBacktestConfigForSave('x', 'nope' as unknown as Record<string, unknown>)).toThrow();
    expect(getManagedBacktestBaseDir('')).toBe('backtests/pbgui/{config-name}');
    expect(getManagedBacktestBaseDir(' a ')).toBe('backtests/pbgui/a');
  });
});

describe('cfgValidateDateRanges (:4409-4427)', () => {
  it('rejects end before start for the base config and per scenario', () => {
    expect(validateBacktestDateRanges({ backtest: { start_date: '2022-01-02', end_date: '2022-01-01' } })).toContain('end_date cannot be before');
    const scenarios = [{ label: 'early', start_date: '2023-05-05', end_date: '2023-01-01' }];
    expect(validateBacktestDateRanges({ backtest: { scenarios } })).toContain('"early"');
    expect(validateBacktestDateRanges({ backtest: { scenarios: [{ label: 's2' }] } })).toBe('');
    expect(validateBacktestDateRanges({ backtest: { end_date: 'now' } })).toBe('');
  });
});
