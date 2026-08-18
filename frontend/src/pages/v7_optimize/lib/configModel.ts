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
    suite: suiteLoad(raw, { enabled: false, scenarios: [], editIdx: -1, aggregate: { default: 'mean' } }),
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
    backtest.aggregate = cloneValue(suite.aggregate ?? { default: 'mean' });
  } else {
    delete backtest.scenarios;
    delete backtest.aggregate;
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
