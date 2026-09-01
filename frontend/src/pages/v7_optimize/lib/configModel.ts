/** Lossless structured model for PBv7/PBv8 Optimize configs. */
import type { OptimizeVersion } from '../config';
import { suiteCollect, suiteLoad, type SuiteState } from '@/shared/suiteEditor/suiteModel';

export type JsonObject = Record<string, unknown>;
export type BoundPair = [number, number] | unknown[];

export interface OptimizeEditorDraft {
  name: string;
  raw: JsonObject;
  backtest: JsonObject;
  exchanges: string[];
  botLong: JsonObject;
  botShort: JsonObject;
  botExtra: JsonObject;
  live: JsonObject;
  optimize: JsonObject;
  pbgui: JsonObject;
  logging: JsonObject;
  bounds: Record<string, BoundPair>;
  fixedParams: string[];
  scoring: unknown[];
  limits: unknown[] | JsonObject;
  suite: SuiteState;
  runtimeOverrides: JsonObject;
  overrideConfigs: JsonObject;
}

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

export function objectValue(value: unknown): JsonObject {
  return isObject(value) ? cloneValue(value) : {};
}

export function getPath(root: unknown, path: string | string[], fallback?: unknown): unknown {
  const parts = Array.isArray(path) ? path : path.split('.').filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, part)) return fallback;
    current = current[part];
  }
  return current === undefined || current === null ? fallback : current;
}

export function setPath(root: JsonObject, path: string | string[], value: unknown): JsonObject {
  const parts = Array.isArray(path) ? path : path.split('.').filter(Boolean);
  let current = root;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = cloneValue(value);
      return;
    }
    if (!isObject(current[part])) current[part] = {};
    current = current[part] as JsonObject;
  });
  return root;
}

export function flattenBounds(root: unknown, prefix = '', output: Record<string, BoundPair> = {}): Record<string, BoundPair> {
  if (!isObject(root)) return output;
  Object.entries(root).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) flattenBounds(value, path, output);
    else output[path] = cloneValue(Array.isArray(value) ? value : [value, value]);
  });
  return output;
}

export function inflateBounds(flat: Record<string, BoundPair>): JsonObject {
  const nested: JsonObject = {};
  Object.entries(flat).forEach(([path, value]) => setPath(nested, path, value));
  return nested;
}

export function parseJsonObject(raw: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(parsed)) throw new Error(`${label}: JSON value must be an object`);
  return parsed;
}

function normalizeExchanges(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  const single = String(value ?? '').trim();
  return single ? [single] : [];
}

function deriveName(config: JsonObject, fallback: string): string {
  if (fallback) return fallback;
  const baseDir = String(getPath(config, 'backtest.base_dir', '') || '');
  return baseDir.split(/[\\/]/).filter(Boolean).at(-1) || '';
}

export function buildEditorDraft(
  configValue: unknown,
  version: OptimizeVersion,
  fallbackName = '',
  overrideConfigs: unknown = {},
): OptimizeEditorDraft {
  const raw = objectValue(configValue);
  const backtest = objectValue(raw.backtest);
  const bot = objectValue(raw.bot);
  const optimize = objectValue(raw.optimize);
  const pbgui = objectValue(raw.pbgui);
  const botExtra = objectValue(bot);
  delete botExtra.long;
  delete botExtra.short;
  const rawBounds = objectValue(optimize.bounds);
  const rawFixed = Array.isArray(optimize.fixed_params) ? optimize.fixed_params : [];
  const rawScoring = Array.isArray(optimize.scoring) ? optimize.scoring : [];
  const rawLimits = Array.isArray(optimize.limits) || isObject(optimize.limits) ? optimize.limits : [];
  const runtime = objectValue(pbgui.optimize_runtime);

  return {
    name: deriveName(raw, fallbackName),
    raw,
    backtest,
    exchanges: normalizeExchanges(backtest.exchanges ?? backtest.exchange),
    botLong: objectValue(bot.long),
    botShort: objectValue(bot.short),
    botExtra,
    live: objectValue(raw.live),
    optimize,
    pbgui,
    logging: objectValue(raw.logging),
    bounds: version === 'v8' ? flattenBounds(rawBounds) : cloneValue(rawBounds) as Record<string, BoundPair>,
    fixedParams: rawFixed.map(String),
    scoring: cloneValue(rawScoring),
    limits: cloneValue(rawLimits),
    suite: suiteLoad(
      raw,
      { enabled: false, scenarios: [], editIdx: -1, aggregate: { default: 'mean' } },
      { isV8: version === 'v8' },
    ),
    runtimeOverrides: objectValue(optimize.fixed_runtime_overrides ?? runtime.overrides),
    overrideConfigs: objectValue(overrideConfigs),
  };
}

export function collectEditorConfig(draft: OptimizeEditorDraft, version: OptimizeVersion): JsonObject {
  const config = objectValue(draft.raw);
  const backtest = { ...objectValue(config.backtest), ...objectValue(draft.backtest) };
  const bot = { ...objectValue(config.bot), ...objectValue(draft.botExtra) };
  const optimize = { ...objectValue(config.optimize), ...objectValue(draft.optimize) };
  const pbgui = { ...objectValue(config.pbgui), ...objectValue(draft.pbgui) };

  if (draft.name.trim()) backtest.base_dir = `backtests/pbgui/${draft.name.trim()}`;
  else delete backtest.base_dir;
  backtest.exchanges = [...draft.exchanges];
  delete backtest.exchange;

  bot.long = objectValue(draft.botLong);
  bot.short = objectValue(draft.botShort);
  optimize.bounds = version === 'v8' ? inflateBounds(draft.bounds) : cloneValue(draft.bounds);
  optimize.fixed_params = [...draft.fixedParams];
  optimize.scoring = cloneValue(draft.scoring);
  optimize.limits = cloneValue(draft.limits);

  const suite = suiteCollect(draft.suite);
  backtest.suite_enabled = suite.suite_enabled;
  if (suite.suite_enabled) {
    backtest.scenarios = cloneValue(suite.scenarios ?? []);
    if (version === 'v8') {
      backtest.reducer = cloneValue(suite.aggregate ?? { default: 'mean' });
      delete backtest.aggregate;
    } else {
      backtest.aggregate = cloneValue(suite.aggregate ?? { default: 'mean' });
      delete backtest.reducer;
    }
    if (suite.scenario_template) pbgui.scenario_template = cloneValue(suite.scenario_template);
    else delete pbgui.scenario_template;
  } else {
    delete backtest.scenarios;
    delete backtest.aggregate;
    delete backtest.reducer;
    delete pbgui.scenario_template;
  }
  optimize.fixed_runtime_overrides = objectValue(draft.runtimeOverrides);
  const runtime = objectValue(pbgui.optimize_runtime);
  delete runtime.overrides;
  pbgui.optimize_runtime = runtime;

  config.backtest = backtest;
  config.bot = bot;
  config.live = objectValue(draft.live);
  config.optimize = optimize;
  config.pbgui = pbgui;
  config.logging = objectValue(draft.logging);
  return config;
}

export interface ScenarioValidationIssue {
  key: string;
  params?: Record<string, string>;
}

export interface Pb8ScenarioValidationInput {
  scoring: unknown[];
  limits: unknown[];
  objectiveScenario: unknown;
  suiteEnabled: boolean;
  scenarioLabels: unknown[];
}

export interface ScenarioGeneratorContext {
  start_date: string;
  end_date: string;
  exchanges: string[];
}

export interface SweepScenarioPreview {
  template?: string;
  parameters?: Record<string, unknown>;
  training_scenarios?: unknown[];
  reducer?: Record<string, string>;
  provenance?: Record<string, unknown>;
}

/** Normalize the legacy `now` end-date sentinel for the PB8 preview contract. */
export function normalizeScenarioEndDate(value: unknown, today = new Date()): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized !== 'now') return String(value ?? '').trim();
  return [today.getUTCFullYear(), String(today.getUTCMonth() + 1).padStart(2, '0'), String(today.getUTCDate()).padStart(2, '0')].join('-');
}

/** Build a stable signature used to reject stale async scenario and OHLCV results. */
export function scenarioContextSignature(context: ScenarioGeneratorContext): string {
  return JSON.stringify({
    start_date: context.start_date || null,
    end_date: normalizeScenarioEndDate(context.end_date) || null,
    exchanges: context.exchanges.slice(),
  });
}

function approvedCoinList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((coin) => coin.trim()).filter((coin) => coin && coin !== 'all');
}

function canonicalFixedKey(key: string): string {
  return key.replace(/^bot\.(long|short)\./, '$1.');
}

function isSweepHslAutoFixedBound(draft: OptimizeEditorDraft, key: string): boolean {
  if (!key.startsWith('bot.long.')) return false;
  const suffix = key.slice('bot.long.'.length);
  const hslBound = new Set([
    'hsl_red_threshold',
    'hsl_ema_span_minutes',
    'hsl_cooldown_minutes_after_red',
    'hsl.red_threshold',
    'hsl.ema_span_minutes',
    'hsl.cooldown_minutes_after_red',
  ]).has(suffix);
  if (!hslBound) return false;
  const configured = draft.runtimeOverrides['bot.long.hsl_enabled'];
  const fallback = getPath(draft.botLong, 'hsl.enabled', false);
  return !(configured === undefined ? fallback : configured);
}

/** Apply the legacy Sweep long-side bound and fixed-parameter rules immutably. */
export function applyOptimizeSweepLongBoundsPreset(draft: OptimizeEditorDraft, approvedLong: string[]): OptimizeEditorDraft {
  const next = cloneValue(draft);
  const approvedCount = approvedLong.length;
  if (!approvedCount) return next;
  const positionsKey = 'bot.long.risk.n_positions';
  const tweKey = 'bot.long.risk.total_wallet_exposure_limit';
  next.bounds[positionsKey] = [1, approvedCount];
  next.bounds[tweKey] = [6, 10];
  setPath(next.botLong, 'risk.n_positions', approvedCount);
  setPath(next.botLong, 'risk.total_wallet_exposure_limit', 6);

  const fixed = new Set(next.fixedParams.map(String));
  Object.entries(next.bounds).forEach(([key, pair]) => {
    if (!key.startsWith('bot.long.')) return;
    fixed.delete(key);
    fixed.delete(canonicalFixedKey(key));
    const low = Array.isArray(pair) ? pair[0] : undefined;
    const high = Array.isArray(pair) ? pair[1] : undefined;
    const zeroWidth = String(low) === String(high);
    const rankingParameter = approvedCount === 1 && /forager\.score_weights_(ema_readiness|volatility|volume)$/.test(key);
    if (zeroWidth || isSweepHslAutoFixedBound(next, key) || rankingParameter || (key === positionsKey && approvedCount === 1)) fixed.add(key);
  });
  next.fixedParams = [...fixed].sort();
  return next;
}

/** Keep PB8 approved coins symmetric while removing overlap from short ignored coins. */
export function applyOptimizeSweepCoinSymmetry(draft: OptimizeEditorDraft): OptimizeEditorDraft {
  const next = cloneValue(draft);
  const approvedRoot = getPath(next.live, 'approved_coins', []);
  const approvedLongValue = isObject(approvedRoot) ? approvedRoot.long : approvedRoot;
  const allCoinsApproved = approvedLongValue === 'all'
    || (Array.isArray(approvedLongValue) && approvedLongValue.map(String).includes('all'));
  if (allCoinsApproved) {
    if (isObject(approvedRoot)) setPath(next.live, 'approved_coins.short', 'all');
    else next.live.approved_coins = 'all';
    return next;
  }
  const approvedLong = approvedCoinList(approvedLongValue);
  setPath(next.live, 'approved_coins.short', approvedLong);
  const ignoredShort = approvedCoinList(getPath(next.live, 'ignored_coins.short', []));
  setPath(next.live, 'ignored_coins.short', ignoredShort.filter((coin) => !approvedLong.includes(coin)));
  return next;
}

/** Apply the deterministic PB8 Sweep objective, limits, balance, and symmetry preset. */
export function applyOptimizeSweepPreset(draft: OptimizeEditorDraft, preview: SweepScenarioPreview): OptimizeEditorDraft {
  if (preview.template !== 'sweep_cycles') return cloneValue(draft);
  let next = applyOptimizeSweepCoinSymmetry(draft);
  const sweepPolicy = isObject(preview.parameters?.sweep_policy) ? preview.parameters!.sweep_policy as JsonObject : {};
  if (sweepPolicy.starting_balance !== undefined) next.backtest.starting_balance = cloneValue(sweepPolicy.starting_balance);
  next.scoring = [
    { metric: 'gain_strategy_eq', goal: 'max' },
    { metric: 'sortino_ratio_strategy_eq', goal: 'max' },
    { metric: 'drawdown_worst_strategy_eq', goal: 'min' },
  ];
  next.limits = [
    { metric: 'drawdown_worst_strategy_eq', penalize_if: 'greater_than', value: 0.8 },
    { metric: 'backtest_completion_ratio', penalize_if: 'less_than', value: 0.99 },
  ];
  next.optimize.objective_scenario = null;
  next.optimize.write_all_results = true;
  next = applyOptimizeSweepLongBoundsPreset(next, approvedCoinList(getPath(next.live, 'approved_coins.long', [])));
  return next;
}

/** Apply generated training scenarios and retain holdout provenance immutably. */
export function applyScenarioTemplatePreview(draft: OptimizeEditorDraft, preview: SweepScenarioPreview): OptimizeEditorDraft {
  let next = cloneValue(draft);
  next.suite = {
    enabled: true,
    scenarios: cloneValue(preview.training_scenarios ?? []),
    editIdx: -1,
    aggregate: cloneValue(preview.reducer ?? { default: 'mean' }),
    ...(preview.provenance ? { scenarioTemplate: cloneValue(preview.provenance) } : {}),
  } as SuiteState;
  if (preview.provenance) next.pbgui.scenario_template = cloneValue(preview.provenance);
  return preview.template === 'sweep_cycles' ? applyOptimizeSweepPreset(next, preview) : next;
}

/** Build one standalone Backtest config from an immutable Sweep holdout window. */
export function buildSweepHoldoutBacktestConfig(configValue: JsonObject, holdout: { start_date: string; end_date: string }, draftName: string): JsonObject {
  const config = cloneValue(configValue);
  const backtest = isObject(config.backtest) ? config.backtest : {};
  config.backtest = {
    ...backtest,
    start_date: holdout.start_date,
    end_date: holdout.end_date,
    base_dir: `backtests/pbgui/${draftName}`,
  };
  const standalone = config.backtest as JsonObject;
  delete standalone.suite_enabled;
  delete standalone.scenarios;
  delete standalone.reducer;
  delete standalone.aggregate;
  if (isObject(config.pbgui)) delete config.pbgui.scenario_template;
  return config;
}

/** Validate PB8 suite/objective references with the same strict rules as the legacy editor. */
export function validatePb8ScenarioBases(input: Pb8ScenarioValidationInput): ScenarioValidationIssue[] {
  const issues: ScenarioValidationIssue[] = [];
  const labels = new Set<string>();
  input.scenarioLabels.forEach((label) => {
    const raw = String(label ?? '');
    const normalized = raw.trim();
    if (!normalized) issues.push({ key: 'v7optimize.suiteScenarioLabelsEmpty' });
    else if (raw !== normalized) issues.push({ key: 'v7optimize.suiteScenarioLabelsWhitespace', params: { raw } });
    else if (labels.has(normalized)) issues.push({ key: 'v7optimize.duplicateSuiteLabel', params: { label: normalized } });
    else labels.add(normalized);
  });

  const objectiveScenario = String(input.objectiveScenario ?? '').trim();
  if (objectiveScenario) {
    if (!input.suiteEnabled) issues.push({ key: 'v7optimize.objectiveScenarioRequiresSuite' });
    if (!labels.has(objectiveScenario)) issues.push({ key: 'v7optimize.unknownObjectiveScenario', params: { scenario: objectiveScenario } });
  }

  const allowedAggregates = new Set(['', 'mean', 'min', 'max', 'std', 'median']);
  input.scoring.forEach((rawEntry) => {
    if (!isObject(rawEntry)) return;
    const aggregate = String(rawEntry.aggregate ?? rawEntry.reducer ?? '').trim().toLowerCase();
    if (!allowedAggregates.has(aggregate)) issues.push({ key: 'v7optimize.unsupportedScoringAggregate', params: { aggregate } });
    const hasScenario = Object.prototype.hasOwnProperty.call(rawEntry, 'scenario');
    const scenario = rawEntry.scenario;
    const namedScenario = hasScenario && scenario !== null && String(scenario ?? '').trim() !== '';
    if (hasScenario && scenario !== null && !String(scenario ?? '').trim()) issues.push({ key: 'v7optimize.scoringScenarioEmpty' });
    if ((hasScenario || aggregate) && !input.suiteEnabled) issues.push({ key: 'v7optimize.scoringScenarioRequiresSuite' });
    if (namedScenario && !labels.has(String(scenario))) issues.push({ key: 'v7optimize.unknownScoringScenario', params: { scenario: String(scenario) } });
    if (namedScenario && aggregate) issues.push({ key: 'v7optimize.namedScoringNoAggregate' });
    if (!hasScenario && objectiveScenario && aggregate) issues.push({ key: 'v7optimize.objectiveInheritingNoAggregate' });
  });

  input.limits.forEach((rawEntry) => {
    if (!isObject(rawEntry)) return;
    const hasScenario = Object.prototype.hasOwnProperty.call(rawEntry, 'scenario');
    const scenario = rawEntry.scenario;
    const namedScenario = hasScenario && scenario !== null && String(scenario ?? '').trim() !== '';
    if (hasScenario && scenario !== null && !String(scenario ?? '').trim()) issues.push({ key: 'v7optimize.limitScenarioEmpty' });
    if (hasScenario && !input.suiteEnabled) issues.push({ key: 'v7optimize.limitScenarioRequiresSuite' });
    if (namedScenario && !labels.has(String(scenario))) issues.push({ key: 'v7optimize.unknownLimitScenario', params: { scenario: String(scenario) } });
    if (namedScenario && (rawEntry.stat || rawEntry.reducer)) issues.push({ key: 'v7optimize.namedLimitNoStat' });
  });
  return issues;
}

export function migrateOptimizeBackend(optimizeValue: unknown, nextBackend: string, defaultsValue: unknown = {}): JsonObject {
  const optimize = objectValue(optimizeValue);
  const defaults = objectValue(defaultsValue);
  const defaultNumber = (key: string, fallback: number): number => {
    const value = Number(defaults[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  const previousBackend = String(optimize.backend || '').trim().toLowerCase();
  const targetBackend = String(nextBackend || '').trim().toLowerCase();
  if (previousBackend === targetBackend) return optimize;

  if (previousBackend === 'deap' && targetBackend === 'pymoo') {
    const pymoo = objectValue(optimize.pymoo);
    const shared = objectValue(pymoo.shared);
    if (optimize.crossover_eta != null) shared.crossover_eta = optimize.crossover_eta;
    if (optimize.crossover_probability != null) shared.crossover_prob_var = optimize.crossover_probability;
    if (optimize.mutation_eta != null) shared.mutation_eta = optimize.mutation_eta;
    if (optimize.mutation_indpb != null) shared.mutation_prob_var = optimize.mutation_indpb;
    pymoo.shared = shared;
    optimize.pymoo = pymoo;
  } else if (previousBackend === 'pymoo' && targetBackend === 'deap') {
    const shared = objectValue(getPath(optimize, 'pymoo.shared', {}));
    if (optimize.population_size == null) optimize.population_size = 500;
    optimize.crossover_eta = shared.crossover_eta ?? 20;
    optimize.mutation_eta = shared.mutation_eta ?? 20;
    optimize.mutation_indpb = shared.mutation_prob_var === 'auto' || shared.mutation_prob_var == null
      ? defaultNumber('mutation_indpb', 0.0135135135)
      : shared.mutation_prob_var;
    optimize.offspring_multiplier = defaultNumber('offspring_multiplier', 1);
    optimize.crossover_probability = defaultNumber('crossover_probability', 0.64);
    optimize.mutation_probability = defaultNumber('mutation_probability', 0.34);
  }
  optimize.backend = targetBackend;
  cleanupOptimizeBackendFields(optimize);
  return optimize;
}

export function cleanupOptimizeBackendFields(optimize: JsonObject): void {
  const backend = String(optimize.backend || '').trim().toLowerCase();
  if (backend === 'pymoo') {
    ['offspring_multiplier', 'crossover_probability', 'mutation_probability', 'mutation_indpb', 'crossover_eta', 'mutation_eta'].forEach((key) => delete optimize[key]);
  } else if (backend === 'deap') {
    delete optimize.pymoo;
  }
}

function scenarioOf(entry: unknown): string {
  if (!isObject(entry)) return '';
  return String(entry.scenario ?? entry.scenario_label ?? '').trim();
}

export function validateScenarioReferences(scoring: unknown[], limits: unknown[], labels: string[]): string[] {
  const known = new Set(labels.map((label) => label.trim()).filter(Boolean));
  const errors: string[] = [];
  scoring.forEach((entry) => {
    const scenario = scenarioOf(entry);
    if (scenario && scenario !== 'Aggregated' && !known.has(scenario)) errors.push(`Unknown scoring scenario: ${scenario}`);
  });
  limits.forEach((entry) => {
    const scenario = scenarioOf(entry);
    if (scenario && scenario !== 'Aggregated' && !known.has(scenario)) errors.push(`Unknown limit scenario: ${scenario}`);
  });
  return errors;
}

export function scenarioLabels(suite: SuiteState): string[] {
  const scenarios = suite.scenarios;
  return scenarios.map((item) => isObject(item) ? String(item.label ?? item.name ?? '').trim() : '').filter(Boolean);
}

export type OptimizeSeedMode = 'none' | 'self' | 'path';

/** Apply the legacy editor's shared PB7/PB8 seed metadata contract. */
export function applyOptimizeSeed(configValue: unknown, mode: OptimizeSeedMode, path = ''): JsonObject {
  const config = objectValue(configValue);
  const pbgui = objectValue(config.pbgui);
  const optimize = objectValue(config.optimize);
  const runtime = objectValue(pbgui.optimize_runtime);
  const normalizedPath = String(path || '').trim();
  const normalizedMode: OptimizeSeedMode = mode === 'path' && !normalizedPath ? 'none' : mode;

  pbgui.optimize_seed_mode = normalizedMode;
  if (normalizedMode === 'path') pbgui.optimize_seed_path = normalizedPath;
  else delete pbgui.optimize_seed_path;
  pbgui.starting_config = normalizedMode === 'self';
  runtime.mode = normalizedMode === 'none' ? 'fresh' : 'pareto_seed';
  runtime.source = normalizedMode === 'self' ? '__self__' : normalizedMode === 'path' ? normalizedPath : '';
  pbgui.optimize_runtime = runtime;
  delete optimize.starting_config;
  config.pbgui = pbgui;
  config.optimize = optimize;
  return config;
}

/* ── Pareto metric column selection (legacy v7_optimize.html:2810-2895) ── */

/** Short pill labels for the common Pareto metrics; key order is the column order. */
export const PARETO_METRIC_PILL_LABELS: Record<string, string> = {
  adg: 'adg',
  gain: 'gain',
  drawdown_worst: 'dd',
  sharpe_ratio: 'sharpe',
  loss_profit_ratio: 'lpr',
  sortino_ratio: 'sortino',
  omega_ratio: 'omega',
  equity_balance_diff_neg_max: 'eq diff',
};

/** Pill metrics first (in label order), remaining metrics alphabetically. */
export function orderParetoMetrics(metrics: Iterable<string>): string[] {
  const seen: Record<string, boolean> = {};
  for (const metric of metrics) {
    const normalized = String(metric || '').trim();
    if (normalized) seen[normalized] = true;
  }
  const ordered = Object.keys(PARETO_METRIC_PILL_LABELS).filter((metric) => !!seen[metric]);
  Object.keys(seen)
    .sort()
    .forEach((metric) => {
      if (!ordered.includes(metric)) ordered.push(metric);
    });
  return ordered;
}

/** Bound, dedupe and keep only advertised metrics; fall back to defaults when empty. */
export function normalizeParetoColumns(
  metrics: Iterable<string>,
  available: readonly string[],
  defaults: readonly string[],
): string[] {
  const selected = orderParetoMetrics(metrics).filter((metric) => available.includes(metric));
  if (selected.length) return selected;
  return orderParetoMetrics(defaults.length ? defaults : available.slice(0, 1));
}

/** Parse the persisted column list; malformed storage degrades to no selection. */
export function readStoredParetoColumns(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) return [];
    return stored
      .map((metric) => String(metric ?? '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* ── Strategy-dependent optimizer overrides (legacy v7_optimize.html:5675-5695, v1.98.36) ── */

/** Overrides that only apply to one strategy kind. */
export const OPTIMIZE_OVERRIDE_STRATEGY_REQUIREMENTS: Record<string, string> = {
  lossless_close_trailing: 'trailing_martingale',
  forward_tp_grid: 'trailing_grid_v7',
  backward_tp_grid: 'trailing_grid_v7',
};

/** normalizeOptimizeEnableOverrides — trim, drop empties, dedupe (string input splits on commas). */
export function normalizeOptimizeEnableOverrides(value: unknown): string[] {
  let items: unknown[];
  if (Array.isArray(value)) items = value.slice();
  else if (typeof value === 'string') items = value.split(',');
  else if (value != null) items = [value];
  else items = [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = String(item ?? '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/** filterOptimizeEnableOverridesForStrategy — drop overrides the strategy cannot apply. */
export function filterOptimizeEnableOverridesForStrategy(value: unknown, strategyKind: unknown): string[] {
  const strategy = String(strategyKind ?? '').trim();
  return normalizeOptimizeEnableOverrides(value).filter((item) => {
    const required = OPTIMIZE_OVERRIDE_STRATEGY_REQUIREMENTS[item];
    return !required || required === strategy;
  });
}

/* ── GPU (Apple MPS) backend support (legacy v7_optimize.html v2.0.5) ── */

export interface GpuContractItem {
  recognized?: boolean;
  available?: boolean;
  metric_set?: string;
  metric_eligibility_known?: boolean;
  reason_code?: string;
  reason?: string;
  runtime?: JsonObject;
  exact_only_metrics?: string[];
  effective_defaults?: JsonObject;
}

export const GPU_HALVING_DEFAULT_FRACTIONS = [0.25, 0.5, 1.0];

/** Resolve the backend-capability entry for a single backend from the additive contract. */
export function gpuContractItem(contract: unknown, backend: string): GpuContractItem | null {
  if (!isObject(contract) || !isObject(contract.items)) return null;
  const item = contract.items[String(backend || '').trim().toLowerCase()];
  return isObject(item) ? (item as unknown as GpuContractItem) : null;
}

/** GPU defaults from the optimize template metadata (optimize_defaults.gpu). */
export function gpuDefaults(optimizeDefaults: unknown): JsonObject {
  if (!isObject(optimizeDefaults)) return {};
  return isObject(optimizeDefaults.gpu) ? cloneValue(optimizeDefaults.gpu) : {};
}

/** Proxy-metric set advertised for the GPU backend, or null when unknown. */
export function gpuMetricSet(contract: unknown): string[] | null {
  if (!isObject(contract) || !isObject(contract.metric_sets)) return null;
  const set = contract.metric_sets.gpu_proxy;
  return Array.isArray(set) ? set.map(String) : null;
}

/** Whether a base metric can be evaluated by the currently selected backend. */
export function metricAvailableForBackend(baseMetric: unknown, backend: unknown, contract: unknown): boolean {
  if (String(backend || '').trim().toLowerCase() !== 'gpu') return true;
  const supported = gpuMetricSet(contract);
  if (!supported) return true;
  const base = String(baseMetric ?? '').trim();
  return supported.includes(base) || supported.includes(`${base}_usd`) || supported.includes(`${base}_btc`);
}

export function gpuUnavailableMessage(capability: GpuContractItem | null): string {
  if (!capability || capability.available !== false) return '';
  const reason = String(capability.reason || 'This backend is unavailable on the current host.');
  return `${reason} Editor preview and Save remain available; Queue and Start are blocked on this host.`;
}

export function gpuAutoPlaceholder(capability: GpuContractItem | null, key: string): string {
  const defaults = capability && isObject(capability.effective_defaults) ? capability.effective_defaults : {};
  const value = defaults[key];
  return value == null ? 'auto' : `auto (${Number(value).toLocaleString()})`;
}

/** Parse successive-halving history fractions; invalid input falls back to defaults (or throws when strict). */
export function parseGpuFractions(value: unknown, strict = false): number[] {
  const raw = Array.isArray(value) ? value.map(String).join(', ') : String(value ?? '');
  const values = raw.trim() ? raw.trim().split(',').map((item) => Number(item.trim())) : [];
  const valid = values.length > 0
    && values.every((item, index) => Number.isFinite(item) && item > 0 && item <= 1 && (index === 0 || item > values[index - 1]!))
    && Math.abs(values[values.length - 1]! - 1) <= 1e-12;
  if (!valid && strict) throw new Error('GPU successive-halving fractions must increase within (0, 1] and end at 1.0.');
  return valid ? values : [...GPU_HALVING_DEFAULT_FRACTIONS];
}

/**
 * Normalize and validate the GPU settings object the editor binds to.
 * Mirrors collectOptimizeGpuSettings + populateOptimizeGpuSettings from the
 * legacy editor: unsupported keys are dropped, blanks resolve to auto/null
 * and invalid values throw when `strict` is set.
 */
export function normalizeGpuSettings(gpuValue: unknown, defaults: JsonObject, strict: boolean): JsonObject {
  const gpu = isObject(gpuValue) ? cloneValue(gpuValue) : {};
  const supports = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(defaults, key) || Object.prototype.hasOwnProperty.call(gpu, key);
  const effective = (key: string): unknown =>
    Object.prototype.hasOwnProperty.call(gpu, key) ? gpu[key] : defaults[key];

  const nullablePositiveInteger = (raw: unknown, label: string): number | null => {
    if (raw == null || raw === '') return null;
    const value = Number(raw);
    if ((!Number.isInteger(value) || value <= 0) && strict) throw new Error(`${label} must be a positive integer or blank for auto.`);
    return Math.max(1, Math.round(value));
  };
  const nonnegativeInteger = (raw: unknown, label: string): number => {
    const value = raw == null || raw === '' ? 0 : Number(raw);
    if ((!Number.isInteger(value) || value < 0) && strict) throw new Error(`${label} must be a non-negative integer.`);
    return Math.max(0, Math.round(value));
  };
  const numberOr = (raw: unknown, fallback: number): number => {
    const value = raw == null || raw === '' ? fallback : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  if (supports('auto_lean_parallelism')) gpu.auto_lean_parallelism = effective('auto_lean_parallelism') !== false;
  if (supports('population_size')) gpu.population_size = nullablePositiveInteger(effective('population_size'), 'GPU population_size');
  if (supports('batch_size')) gpu.batch_size = nullablePositiveInteger(effective('batch_size'), 'GPU batch_size');
  if (supports('max_dispatch_candidate_bars')) gpu.max_dispatch_candidate_bars = nullablePositiveInteger(effective('max_dispatch_candidate_bars'), 'GPU max_dispatch_candidate_bars');
  if (supports('exact_workers')) gpu.exact_workers = nonnegativeInteger(effective('exact_workers'), 'GPU exact_workers');
  if (supports('max_pending_exact')) gpu.max_pending_exact = nonnegativeInteger(effective('max_pending_exact'), 'GPU max_pending_exact');
  if (supports('validate_per_generation')) gpu.validate_per_generation = nullablePositiveInteger(effective('validate_per_generation'), 'GPU validate_per_generation') || 8;
  if (supports('checkpoint_interval_seconds')) gpu.checkpoint_interval_seconds = numberOr(effective('checkpoint_interval_seconds'), 5);
  if (supports('drift_probes')) gpu.drift_probes = nonnegativeInteger(effective('drift_probes'), 'GPU drift_probes');
  if (supports('drift_window')) gpu.drift_window = nullablePositiveInteger(effective('drift_window'), 'GPU drift_window') || 128;
  if (supports('drift_min_samples')) gpu.drift_min_samples = nullablePositiveInteger(effective('drift_min_samples'), 'GPU drift_min_samples') || 32;
  if (supports('drift_halt')) gpu.drift_halt = numberOr(effective('drift_halt'), 0.6);
  if (strict && (Number(gpu.checkpoint_interval_seconds) <= 0 || Number(gpu.drift_halt) <= 0 || Number(gpu.drift_halt) > 1)) {
    throw new Error('GPU checkpoint interval must be positive and drift_halt must be within (0, 1].');
  }

  if (supports('successive_halving')) {
    const sourceHalving = isObject(effective('successive_halving')) ? effective('successive_halving') as JsonObject : {};
    const halving = cloneValue(sourceHalving);
    halving.enabled = !!halving.enabled;
    halving.history_fractions = parseGpuFractions(halving.history_fractions, strict);
    halving.survival_fraction = numberOr(halving.survival_fraction, 0.5);
    halving.min_survivors = nullablePositiveInteger(halving.min_survivors, 'GPU min_survivors') || 64;
    if (strict && (Number(halving.survival_fraction) <= 0 || Number(halving.survival_fraction) > 1)) {
      throw new Error('GPU successive-halving survival_fraction must be within (0, 1].');
    }
    gpu.successive_halving = halving;
  }
  return gpu;
}
