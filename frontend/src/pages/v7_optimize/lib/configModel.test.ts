import { describe, expect, it } from 'vitest';
import {
  applyOptimizeSeed,
  applyOptimizeSweepPreset,
  applyScenarioTemplatePreview,
  buildSweepHoldoutBacktestConfig,
  filterOptimizeEnableOverridesForStrategy,
  buildEditorDraft,
  collectEditorConfig,
  flattenBounds,
  getPath,
  gpuContractItem,
  gpuDefaults,
  inflateBounds,
  metricAvailableForBackend,
  normalizeGpuSettings,
  normalizeParetoColumns,
  orderParetoMetrics,
  parseGpuFractions,
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

  it('applies the PB8 Sweep preset without mutating the source draft', () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'], starting_balance: 250 },
      bot: { long: { risk: {} }, short: { risk: {} } },
      live: { approved_coins: { long: ['BTCUSDT', 'ETHUSDT'], short: ['OLD'] }, ignored_coins: { short: ['BTCUSDT', 'OLD'] } },
      optimize: { bounds: { bot: { long: { risk: { n_positions: [2, 8], total_wallet_exposure_limit: [1, 4] } } } }, fixed_params: [] },
    }, 'v8', 'sweep');
    const next = applyOptimizeSweepPreset(draft, {
      template: 'sweep_cycles',
      parameters: { sweep_policy: { starting_balance: 1000 } },
    });

    expect(draft.backtest.starting_balance).toBe(250);
    expect(next.backtest.starting_balance).toBe(1000);
    expect(next.scoring).toEqual([
      { metric: 'gain_strategy_eq', goal: 'max' },
      { metric: 'sortino_ratio_strategy_eq', goal: 'max' },
      { metric: 'drawdown_worst_strategy_eq', goal: 'min' },
    ]);
    expect(next.limits).toEqual([
      { metric: 'drawdown_worst_strategy_eq', penalize_if: 'greater_than', value: 0.8 },
      { metric: 'backtest_completion_ratio', penalize_if: 'less_than', value: 0.99 },
    ]);
    expect(getPath(next.live, 'approved_coins.short')).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(next.optimize.write_all_results).toBe(true);
    expect(next.optimize.objective_scenario).toBeNull();
    expect(next.bounds['bot.long.risk.n_positions']).toEqual([1, 2]);
    expect(next.bounds['bot.long.risk.total_wallet_exposure_limit']).toEqual([6, 10]);
  });

  it('preserves the dynamic all-coins sentinel when applying Sweep symmetry', () => {
    const draft = buildEditorDraft({
      live: { approved_coins: 'all', ignored_coins: { short: ['BTCUSDT'] } },
      optimize: { bounds: {} },
    }, 'v8', 'all-coins');
    const next = applyOptimizeSweepPreset(draft, { template: 'sweep_cycles' });
    expect(next.live.approved_coins).toBe('all');
  });

  it('creates core Sweep bounds and fixes disabled-HSL Long parameters', () => {
    const draft = buildEditorDraft({
      bot: { long: { hsl: { enabled: false } }, short: {} },
      live: { approved_coins: { long: ['BTCUSDT', 'ETHUSDT'], short: [] } },
      optimize: {
        bounds: {
          bot: {
            long: {
              hsl: {
                red_threshold: [0.2, 0.8],
                ema_span_minutes: [30, 240],
                cooldown_minutes_after_red: [60, 600],
              },
            },
          },
        },
        fixed_params: [],
      },
    }, 'v8', 'hsl-sweep');

    const next = applyOptimizeSweepPreset(draft, { template: 'sweep_cycles' });

    expect(next.bounds['bot.long.risk.n_positions']).toEqual([1, 2]);
    expect(next.bounds['bot.long.risk.total_wallet_exposure_limit']).toEqual([6, 10]);
    expect(next.fixedParams).toEqual(expect.arrayContaining([
      'bot.long.hsl.red_threshold',
      'bot.long.hsl.ema_span_minutes',
      'bot.long.hsl.cooldown_minutes_after_red',
    ]));
  });

  it('applies scenario provenance and creates standalone holdout configs', () => {
    const draft = buildEditorDraft({ backtest: { exchanges: ['bybit'], start_date: '2020-01-01' }, pbgui: {} }, 'v8', 'scenario');
    const applied = applyScenarioTemplatePreview(draft, {
      template: 'walk_forward',
      training_scenarios: [{ label: 'train_01' }],
      reducer: { default: 'median' },
      provenance: { template: 'walk_forward', holdout_scenarios: [{ label: 'holdout_01' }] },
    });
    expect(applied.suite).toMatchObject({ enabled: true, scenarios: [{ label: 'train_01' }], aggregate: { default: 'median' } });
    expect(applied.pbgui.scenario_template).toMatchObject({ template: 'walk_forward' });
    const standalone = buildSweepHoldoutBacktestConfig(
      { backtest: { suite_enabled: true, scenarios: [{ label: 'train' }], aggregate: { default: 'mean' } }, pbgui: { scenario_template: {} } },
      { start_date: '2024-01-01', end_date: '2024-03-31' },
      'candidate_holdout',
    );
    const standaloneBacktest = standalone.backtest as Record<string, unknown>;
    const standalonePbgui = standalone.pbgui as Record<string, unknown>;
    expect(standaloneBacktest).toMatchObject({ start_date: '2024-01-01', end_date: '2024-03-31', base_dir: 'backtests/pbgui/candidate_holdout' });
    expect(standaloneBacktest.suite_enabled).toBeUndefined();
    expect(standaloneBacktest.scenarios).toBeUndefined();
    expect(standalonePbgui.scenario_template).toBeUndefined();
  });

  it('writes PB8 reducer and clears stale Suite provenance when disabled', () => {
    const draft = buildEditorDraft({
      backtest: { suite_enabled: true, scenarios: [{ label: 'train' }], reducer: { default: 'median' } },
      pbgui: { scenario_template: { template: 'walk_forward' } },
    }, 'v8', 'suite');

    const enabledConfig = collectEditorConfig(draft, 'v8');
    expect(enabledConfig.backtest).toMatchObject({ reducer: { default: 'median' } });
    expect(enabledConfig.backtest).not.toHaveProperty('aggregate');
    expect(enabledConfig.pbgui).toMatchObject({ scenario_template: { template: 'walk_forward' } });

    draft.suite.enabled = false;
    const disabledConfig = collectEditorConfig(draft, 'v8');
    expect(disabledConfig.backtest).not.toHaveProperty('reducer');
    expect(disabledConfig.backtest).not.toHaveProperty('aggregate');
    expect(disabledConfig.pbgui).not.toHaveProperty('scenario_template');
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

describe('GPU backend support', () => {
  const gpuContract = {
    items: {
      gpu: { available: false, reason: 'Apple MPS is unavailable in the PB8 process.', effective_defaults: { population_size: 512, batch_size: 128 } },
      pymoo: { available: true },
    },
    metric_sets: { cpu: ['adg', 'gain', 'drawdown_worst'], gpu_proxy: ['adg', 'gain_usd', 'gain_btc'] },
  };

  it('resolves the backend capability entry and defaults', () => {
    expect(gpuContractItem(gpuContract, 'gpu')?.available).toBe(false);
    expect(gpuContractItem(gpuContract, 'pymoo')?.available).toBe(true);
    expect(gpuContractItem(gpuContract, 'deap')).toBeNull();
    expect(gpuDefaults({ gpu: { batch_size: 64 } })).toEqual({ batch_size: 64 });
    expect(gpuDefaults({})).toEqual({});
  });

  it('filters metrics for the GPU backend using the proxy metric set', () => {
    expect(metricAvailableForBackend('gain', 'gpu', gpuContract)).toBe(true);
    expect(metricAvailableForBackend('gain_usd', 'gpu', gpuContract)).toBe(true);
    expect(metricAvailableForBackend('drawdown_worst', 'gpu', gpuContract)).toBe(false);
    expect(metricAvailableForBackend('drawdown_worst', 'pymoo', gpuContract)).toBe(true);
    expect(metricAvailableForBackend('drawdown_worst', 'gpu', null)).toBe(true);
  });

  it('parses successive-halving fractions strictly and falls back on invalid input', () => {
    expect(parseGpuFractions('0.25, 0.5, 1.0')).toEqual([0.25, 0.5, 1]);
    expect(parseGpuFractions('0.5, 0.2, 1.0')).toEqual([0.25, 0.5, 1]);
    expect(() => parseGpuFractions('0.5, 0.2, 1.0', true)).toThrow(/increase within \(0, 1\]/);
  });

  it('normalizes GPU settings and preserves unknown keys', () => {
    const defaults = { population_size: 512, successive_halving: { enabled: false, survival_fraction: 0.5 } };
    const normalized = normalizeGpuSettings({ population_size: '', drift_window: 0, unsupported: true }, defaults, false);
    const halving = normalized.successive_halving as Record<string, unknown>;
    expect(normalized.population_size).toBeNull();
    expect(halving.enabled).toBe(false);
    expect(halving.history_fractions).toEqual([0.25, 0.5, 1]);
    expect(normalized.unsupported).toBe(true);
  });

  it('rejects invalid GPU settings in strict mode', () => {
    expect(() => normalizeGpuSettings({ population_size: 0 }, { population_size: 512 }, true)).toThrow(/positive integer/);
    expect(() => normalizeGpuSettings({ drift_halt: 2 }, { drift_halt: 0.6 }, true)).toThrow(/drift_halt/);
  });
});
