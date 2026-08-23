import { describe, expect, it } from 'vitest';
import {
  applyOptimizeSeed,
  filterOptimizeEnableOverridesForStrategy,
  buildEditorDraft,
  collectEditorConfig,
  flattenBounds,
  inflateBounds,
  normalizeParetoColumns,
  orderParetoMetrics,
  parseJsonObject,
  readStoredParetoColumns,
  validatePb8ScenarioBases,
  validateScenarioReferences,
} from './configModel';

describe('optimize config model', () => {
  it('builds a structured draft without dropping unknown custom blocks', () => {
    const draft = buildEditorDraft({
      bot: { long: { n_positions: 3 }, short: { n_positions: 2 }, custom_bot: { keep: true } },
      optimize: { n_cpus: 4, iters: 1000, bounds: { long_n_positions: [1, 8] } },
      backtest: { base_dir: 'backtests/pbgui/demo', exchanges: ['bybit'], start_date: '2025-01-01', custom: 7, suite_enabled: true, scenarios: [{ label: 'bull' }] },
      custom_root: { keep: true },
    }, 'v7', 'demo');

    expect(draft.name).toBe('demo');
    expect(draft.exchanges).toEqual(['bybit']);
    expect(draft.bounds.long_n_positions).toEqual([1, 8]);
    expect(draft.raw.custom_root).toEqual({ keep: true });
    expect(draft.suite.scenarios[0]?.label).toBe('bull');
  });

  it('collects structured changes while preserving unknown data and v8 nested bounds', () => {
    const draft = buildEditorDraft({
      backtest: { custom: 7 },
      optimize: { bounds: { bot: { long: { risk: { wallet_exposure_limit: [0.1, 1] } } } } },
      custom_root: { keep: true },
    }, 'v8', 'demo');
    draft.exchanges = ['binance'];
    draft.bounds['bot.long.risk.wallet_exposure_limit'] = [0.2, 0.8];
    draft.optimize.n_cpus = 6;

    const config = collectEditorConfig(draft, 'v8');

    expect(config.backtest).toMatchObject({ base_dir: 'backtests/pbgui/demo', exchanges: ['binance'], custom: 7 });
    expect(config.optimize as Record<string, unknown>).toMatchObject({ n_cpus: 6 });
    expect((config.optimize as Record<string, unknown>).bounds).toEqual({ bot: { long: { risk: { wallet_exposure_limit: [0.2, 0.8] } } } });
    expect(config.custom_root).toEqual({ keep: true });
  });

  it('round trips flat and nested bound maps', () => {
    const nested = { bot: { long: { strategy: { recursive_grid: { ddown_factor: [0.1, 2] } } } } };
    expect(inflateBounds(flattenBounds(nested))).toEqual(nested);
  });


  it('writes the shared seed runtime contract without legacy optimize.starting_config', () => {
    const config = applyOptimizeSeed({ optimize: { starting_config: true }, pbgui: {} }, 'path', '/results/demo/pareto');
    expect(config.pbgui).toMatchObject({
      optimize_seed_mode: 'path',
      optimize_seed_path: '/results/demo/pareto',
      starting_config: false,
      optimize_runtime: { mode: 'pareto_seed', source: '/results/demo/pareto' },
    });
    expect((config.optimize as Record<string, unknown>).starting_config).toBeUndefined();
  });

  it('rejects invalid JSON sections and missing suite scenarios', () => {
    expect(() => parseJsonObject('[1]', 'Bot long')).toThrow('Bot long');
    expect(validateScenarioReferences(
      [{ metric: 'adg', scenario: 'missing' }],
      [{ metric: 'drawdown', scenario: 'bull' }],
      ['bull'],
    )).toEqual(['Unknown scoring scenario: missing']);
  });
  it('validates PB8 suite scenario bases with the legacy strict rules', () => {
    expect(validatePb8ScenarioBases({
      scoring: [{ metric: 'adg', scenario: 'bull', aggregate: 'mean' }],
      limits: [{ metric: 'drawdown', scenario: 'missing' }],
      objectiveScenario: 'missing',
      suiteEnabled: true,
      scenarioLabels: ['bull'],
    }).map((issue) => issue.key)).toEqual([
      'v7optimize.unknownObjectiveScenario',
      'v7optimize.namedScoringNoAggregate',
      'v7optimize.unknownLimitScenario',
    ]);

    expect(validatePb8ScenarioBases({
      scoring: [{ metric: 'adg', scenario: null }],
      limits: [{ metric: 'drawdown', scenario: null }],
      objectiveScenario: '',
      suiteEnabled: false,
      scenarioLabels: [],
    }).map((issue) => issue.key)).toEqual([
      'v7optimize.scoringScenarioRequiresSuite',
      'v7optimize.limitScenarioRequiresSuite',
    ]);
  });

  it('round trips canonical fixed runtime overrides without moving them under pbgui runtime', () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      optimize: { fixed_runtime_overrides: { 'bot.long.hsl_enabled': true } },
      pbgui: { optimize_runtime: { fine_tune_params: ['long.risk'] } },
    }, 'v8', 'runtime');
    expect(draft.runtimeOverrides).toEqual({ 'bot.long.hsl_enabled': true });
    draft.runtimeOverrides['bot.short.hsl_enabled'] = false;

    const config = collectEditorConfig(draft, 'v8');
    expect(config.optimize).toMatchObject({ fixed_runtime_overrides: { 'bot.long.hsl_enabled': true, 'bot.short.hsl_enabled': false } });
    expect(config.pbgui).toMatchObject({ optimize_runtime: { fine_tune_params: ['long.risk'] } });
    expect(((config.pbgui as Record<string, unknown>).optimize_runtime as Record<string, unknown>).overrides).toBeUndefined();
  });


  it('orders Pareto metrics pill-first and alphabetically afterwards', () => {
    expect(orderParetoMetrics(['zebra', 'gain', 'adg', 'gain', 'beta']))
      .toEqual(['adg', 'gain', 'beta', 'zebra']);
    expect(orderParetoMetrics([])).toEqual([]);
  });

  it('bounds the selected Pareto columns to the advertised catalog with a defaults fallback', () => {
    const available = ['gain', 'adg', 'drawdown_worst'];
    expect(normalizeParetoColumns(['adg', 'gain', 'unknown_metric'], available, ['gain']))
      .toEqual(['adg', 'gain']);
    expect(normalizeParetoColumns([], available, ['gain', 'drawdown_worst']))
      .toEqual(['gain', 'drawdown_worst']);
    // 空 catalog 时任何选择都归空（与旧版 setParetoMetricColumns 一致）
    expect(normalizeParetoColumns(['gain'], [], [])).toEqual([]);
  });

  it('degrades malformed stored Pareto column JSON to no selection', () => {
    expect(readStoredParetoColumns(null)).toEqual([]);
    expect(readStoredParetoColumns('')).toEqual([]);
    expect(readStoredParetoColumns('not json')).toEqual([]);
    expect(readStoredParetoColumns('{"gain":true}')).toEqual([]);
    expect(readStoredParetoColumns('[" gain ", "", "adg"]')).toEqual(['gain', 'adg']);
  });


  it('filters optimizer overrides by the strategy they require (v1.98.36)', () => {
    const overrides = ['lossless_close_trailing', 'forward_tp_grid', 'backward_tp_grid', 'hsl_enabled'];
    expect(filterOptimizeEnableOverridesForStrategy(overrides, 'trailing_martingale'))
      .toEqual(['lossless_close_trailing', 'hsl_enabled']);
    expect(filterOptimizeEnableOverridesForStrategy(overrides, 'trailing_grid_v7'))
      .toEqual(['forward_tp_grid', 'backward_tp_grid', 'hsl_enabled']);
    expect(filterOptimizeEnableOverridesForStrategy(overrides, 'neat'))
      .toEqual(['hsl_enabled']);
    // 字符串输入按逗号拆分（旧版 normalize 语义）
    expect(filterOptimizeEnableOverridesForStrategy(' lossless_close_trailing , hsl_enabled ', 'neat'))
      .toEqual(['hsl_enabled']);
    expect(filterOptimizeEnableOverridesForStrategy(null, 'neat')).toEqual([]);
  });

});
