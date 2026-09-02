/**
 * Suite editor model — the pure half of js/suite_editor.js (975 L):
 * built-in templates (:39-74) with the v8 override-path migration
 * (:114-125), aggregate-metric normalization (:129-145), suiteLoad
 * (:148-176) and suiteCollect (:179-191). Shared with the optimize page
 * (M-v7-14, recon R11: build once, reuse).
 */

export interface SuiteScenario {
  label?: string;
  start_date?: string;
  end_date?: string;
  exchanges?: string[];
  coins?: string[];
  ignored_coins?: string[];
  coin_sources?: Record<string, string>;
  overrides?: Record<string, unknown>;
}

export interface SuiteTemplate {
  scenarios: SuiteScenario[];
  aggregate: Record<string, string>;
}

export interface SuiteState {
  enabled: boolean;
  scenarios: SuiteScenario[];
  /** Index of the scenario being edited; -1 = none. */
  editIdx: number;
  aggregate: Record<string, string>;
  /** PB8 scenario-generator provenance stored in pbgui.scenario_template. */
  scenarioTemplate?: Record<string, unknown>;
}

export interface ScenarioGeneratorContext {
  start_date?: string | null;
  end_date?: string | null;
  exchanges?: readonly string[];
  starting_balance?: number | null;
}

export interface ScenarioGeneratorDraft {
  template: 'rolling_windows' | 'walk_forward' | 'sweep_cycles';
  window_days: number;
  stride_days: number;
  training_windows: number;
  holdout_windows: number;
  exchange_mode: 'inherit' | 'per_exchange';
  auto_windows: boolean;
  balance_multiplier?: number;
  starting_balance?: number;
  refill_cost?: number;
  cooldown_days?: number;
}

export type ScenarioGeneratorRequest = Omit<ScenarioGeneratorDraft, 'starting_balance'> & {
  start_date: string | null;
  end_date: string | null;
  exchanges: string[];
  starting_balance?: number | null;
};

export interface ScenarioGeneratorPreview {
  template: string;
  training_scenarios: SuiteScenario[];
  holdout_scenarios: SuiteScenario[];
  reducer?: Record<string, string>;
  provenance?: Record<string, unknown>;
  warnings?: string[];
  [key: string]: unknown;
}

export const SUITE_TEMPLATES: Record<string, SuiteTemplate> = {
  'Exchange Comparison': {
    scenarios: [{ label: 'binance_only', exchanges: ['binance'] }, { label: 'bybit_only', exchanges: ['bybit'] }],
    aggregate: { default: 'mean' },
  },
  'Date Windows': {
    scenarios: [
      { label: '2021', start_date: '2021-01-01', end_date: '2021-12-31' },
      { label: '2022', start_date: '2022-01-01', end_date: '2022-12-31' },
      { label: '2023', start_date: '2023-01-01', end_date: '2023-12-31' },
      { label: '2024', start_date: '2024-01-01', end_date: '2024-12-31' },
    ],
    aggregate: { default: 'mean' },
  },
  'TWE Sensitivity': {
    scenarios: [
      { label: 'twe_0.5', overrides: { 'bot.long.total_wallet_exposure_limit': 0.5, 'bot.short.total_wallet_exposure_limit': 0.5 } },
      { label: 'twe_1.0', overrides: { 'bot.long.total_wallet_exposure_limit': 1.0, 'bot.short.total_wallet_exposure_limit': 1.0 } },
      { label: 'twe_1.5', overrides: { 'bot.long.total_wallet_exposure_limit': 1.5, 'bot.short.total_wallet_exposure_limit': 1.5 } },
      { label: 'twe_2.0', overrides: { 'bot.long.total_wallet_exposure_limit': 2.0, 'bot.short.total_wallet_exposure_limit': 2.0 } },
    ],
    aggregate: { default: 'mean', drawdown_worst_strategy_eq: 'max' },
  },
  'n_positions Sensitivity': {
    scenarios: [
      { label: 'npos_5', overrides: { 'bot.long.n_positions': 5, 'bot.short.n_positions': 5 } },
      { label: 'npos_10', overrides: { 'bot.long.n_positions': 10, 'bot.short.n_positions': 10 } },
      { label: 'npos_15', overrides: { 'bot.long.n_positions': 15, 'bot.short.n_positions': 15 } },
      { label: 'npos_20', overrides: { 'bot.long.n_positions': 20, 'bot.short.n_positions': 20 } },
    ],
    aggregate: { default: 'mean', drawdown_worst_strategy_eq: 'max' },
  },
};

const SUITE_TEMPLATE_KEYS: readonly string[] = ['Exchange Comparison', 'Date Windows', 'TWE Sensitivity', 'n_positions Sensitivity'];

/** _suiteAggMetricFallbacks (:85-90). */
export const SUITE_AGG_METRIC_FALLBACKS: readonly string[] = [
  'adg_strategy_eq',
  'drawdown_worst_strategy_eq',
  'drawdown_worst_mean_1pct_strategy_eq',
  'peak_recovery_days_strategy_eq',
  'peak_recovery_hours_strategy_eq',
  'position_held_days_max',
  'position_held_hours_max',
  'sharpe_ratio_strategy_eq',
  'sortino_ratio_strategy_eq',
  'backtest_completion_ratio',
];

export const DEFAULT_SUITE_EXCHANGES: readonly string[] = ['binance', 'bybit', 'bitget', 'okx', 'hyperliquid', 'kucoin'];

/** _suiteNormalizeAggMetrics (:129-145). */
export function normalizeSuiteAggMetrics(metrics: readonly string[] | null | undefined): string[] {
  const source = Array.isArray(metrics) && metrics.length > 0 ? metrics : SUITE_AGG_METRIC_FALLBACKS;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of source) {
    const value = String(entry ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result.length > 0 ? result : SUITE_AGG_METRIC_FALLBACKS.slice();
}

/** _suiteAggMetricOptions (:142-145). */
export function suiteAggMetricOptions(stateMetrics: readonly string[], extraMetrics: readonly string[]): string[] {
  return normalizeSuiteAggMetrics([...stateMetrics, ...extraMetrics]);
}

export function suiteAggregateMethods(isV8: boolean): string[] {
  return isV8 ? ['mean', 'min', 'max', 'std', 'median'] : ['mean', 'min', 'max'];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

/** Templates whose override paths migrate for v8 (:115). */
const V8_MIGRATED_TEMPLATES: readonly string[] = ['TWE Sensitivity', 'n_positions Sensitivity'];

/**
 * migrateSuiteTemplateOverrides (:114-125) — on v8 the TWE/n_positions
 * templates override `bot.<side>.risk.*` instead of the side root; other
 * templates are untouched.
 */
export function migrateSuiteTemplateOverrides(name: string, isV8: boolean): SuiteTemplate {
  const template = SUITE_TEMPLATES[name];
  if (!template) return { scenarios: [], aggregate: { default: 'mean' } };
  const migrated = clone(template);
  if (!isV8 || !V8_MIGRATED_TEMPLATES.includes(name)) return migrated;
  for (const scenario of migrated.scenarios) {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scenario.overrides ?? {})) {
      next[key.replace(/^(bot\.(?:long|short))\.(total_wallet_exposure_limit|n_positions)$/, '$1.risk.$2')] = value;
    }
    scenario.overrides = next;
  }
  return migrated;
}

export interface SuiteLoadOptions {
  /** Keep editing the same scenario (by label, then index) on re-sync (:160-174). */
  preserveEdit?: boolean;
  /** PB8 prefers reducer and supports std/median; PB7 uses aggregate only. */
  isV8?: boolean;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** suiteLoad (:148-176). */
export function suiteLoad(cfg: Record<string, unknown>, prev: SuiteState, options: SuiteLoadOptions = {}): SuiteState {
  const bt = object(cfg.backtest);
  const pbgui = object(cfg.pbgui);
  const prevEditIdx = prev.editIdx;
  let prevLabel = '';
  if (prevEditIdx >= 0 && prev.scenarios[prevEditIdx]) prevLabel = String(prev.scenarios[prevEditIdx]!.label ?? '');
  const nextScenarios: SuiteScenario[] = Array.isArray(bt.scenarios) ? clone(bt.scenarios) : [];
  const sourceAggregate = options.isV8 && bt.reducer ? bt.reducer : bt.aggregate;
  const allowedMethods = new Set(suiteAggregateMethods(options.isV8 === true));
  const aggregate = sourceAggregate && typeof sourceAggregate === 'object' && !Array.isArray(sourceAggregate)
    ? Object.fromEntries(Object.entries(sourceAggregate as Record<string, unknown>).map(([key, value]) => {
        const method = String(value || 'mean');
        return [key, allowedMethods.has(method) ? method : 'mean'];
      }))
    : { default: 'mean' };
  if (!aggregate.default) aggregate.default = 'mean';
  const next: SuiteState = {
    enabled: !!bt.suite_enabled,
    scenarios: nextScenarios,
    editIdx: -1,
    aggregate,
  };
  if (next.enabled && pbgui.scenario_template && typeof pbgui.scenario_template === 'object' && !Array.isArray(pbgui.scenario_template)) {
    next.scenarioTemplate = clone(pbgui.scenario_template) as Record<string, unknown>;
  }
  if (options.preserveEdit && next.enabled && prevEditIdx >= 0) {
    let nextEditIdx = -1;
    if (prevLabel) {
      for (let i = 0; i < nextScenarios.length; i++) {
        if (String(nextScenarios[i]?.label ?? '') === prevLabel) {
          nextEditIdx = i;
          break;
        }
      }
    }
    if (nextEditIdx < 0 && prevEditIdx < nextScenarios.length) nextEditIdx = prevEditIdx;
    next.editIdx = nextEditIdx;
  }
  return next;
}

/** suiteCollect (:179-191). */
export function suiteCollect(state: SuiteState): {
  suite_enabled: boolean;
  scenarios?: SuiteScenario[];
  aggregate?: Record<string, string>;
  scenario_template?: Record<string, unknown>;
} {
  const result: {
    suite_enabled: boolean;
    scenarios?: SuiteScenario[];
    aggregate?: Record<string, string>;
    scenario_template?: Record<string, unknown>;
  } = {
    suite_enabled: state.enabled,
  };
  if (state.enabled) {
    result.scenarios = clone(state.scenarios);
    result.aggregate = clone(state.aggregate);
    if (state.scenarioTemplate) result.scenario_template = clone(state.scenarioTemplate);
  }
  return result;
}

function clearScenarioTemplate(state: SuiteState): SuiteState {
  const next = { ...state };
  delete next.scenarioTemplate;
  return next;
}

/** _suiteApplyTemplate state half (:519-546) — exchanges still merge in the page layer. */
export function applySuiteTemplate(state: SuiteState, name: string, isV8: boolean): SuiteState {
  const template = migrateSuiteTemplateOverrides(name, isV8);
  return { ...clearScenarioTemplate(state), scenarios: clone(template.scenarios), aggregate: clone(template.aggregate), editIdx: -1 };
}

/** _suiteResetToBase (:549-556). */
export function resetSuiteToBase(state: SuiteState): SuiteState {
  return { ...clearScenarioTemplate(state), scenarios: [{ label: 'base' }], aggregate: { default: 'mean' }, editIdx: -1 };
}

/** _suiteAddScenario (:612-617). */
export function addSuiteScenario(state: SuiteState): SuiteState {
  const scenarios = [...state.scenarios, { label: 'scenario_' + (state.scenarios.length + 1) }];
  return { ...clearScenarioTemplate(state), scenarios, editIdx: scenarios.length - 1 };
}

/** _suiteRemoveScenario (:629-635). */
export function removeSuiteScenario(state: SuiteState, idx: number): SuiteState {
  const scenarios = state.scenarios.filter((_, i) => i !== idx);
  let editIdx = state.editIdx;
  if (editIdx === idx) editIdx = -1;
  else if (editIdx > idx) editIdx -= 1;
  return { ...clearScenarioTemplate(state), scenarios, editIdx };
}

/** _suiteMoveScenario (:637-647). */
export function moveSuiteScenario(state: SuiteState, idx: number, dir: number): SuiteState {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= state.scenarios.length) return state;
  const scenarios = state.scenarios.slice();
  const tmp = scenarios[idx]!;
  scenarios[idx] = scenarios[newIdx]!;
  scenarios[newIdx] = tmp;
  let editIdx = state.editIdx;
  if (editIdx === idx) editIdx = newIdx;
  else if (editIdx === newIdx) editIdx = idx;
  return { ...clearScenarioTemplate(state), scenarios, editIdx };
}

/** The override value ladder of _suiteConfirmOverride (:771-775). */
export function parseOverrideValue(val: string): unknown {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val !== '' && !Number.isNaN(Number(val))) return Number(val);
  return val;
}

/** Split a dotted override key into side + parameter (:715-723). */
export function splitOverrideKey(key: string): { side: string; param: string } {
  const parts = key.split('.');
  if (parts.length >= 3 && parts[0] === 'bot') return { side: parts[1]!, param: parts.slice(2).join('.') };
  if (parts.length >= 2) return { side: parts[0]!, param: parts.slice(1).join('.') };
  return { side: '', param: key };
}
