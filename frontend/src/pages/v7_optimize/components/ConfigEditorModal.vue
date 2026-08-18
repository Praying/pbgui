<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import SuiteEditor from '@/shared/suiteEditor/SuiteEditor.vue';
import ScoringLimitsEditor from './ScoringLimitsEditor.vue';
import BotJsonEditor from './BotJsonEditor.vue';
import type { OptimizeVersion } from '../config';
import {
  buildEditorDraft,
  cloneValue,
  cleanupOptimizeBackendFields,
  collectEditorConfig,
  getPath,
  isObject,
  migrateOptimizeBackend,
  parseJsonObject,
  scenarioLabels,
  setPath,
  validatePb8ScenarioBases,
  type BoundPair,
  type JsonObject,
  type OptimizeEditorDraft,
} from '../lib/configModel';

const props = defineProps<{
  open: boolean;
  draft: OptimizeEditorDraft | null;
  version: OptimizeVersion;
  error: string;
  paramStatus?: Record<string, unknown>;
  limitsMeta?: unknown;
  exchangeOptions?: string[];
  botParams?: string[];
  hslModes?: string[];
  backendOptions?: string[];
  optimizeDefaults?: Record<string, unknown>;
  pymooAlgorithmOptions?: string[];
  pymooRefDirMethodOptions?: string[];
  strategyOptions?: string[];
  pbguiDataPath?: string;
  loadSymbols?: (exchange: string) => Promise<{ symbols: string[]; catalog?: Record<string, string> }>;
}>();
const emit = defineEmits<{ close: []; save: [draft: OptimizeEditorDraft, queueAfterSave: boolean]; preflight: [draft: OptimizeEditorDraft] }>();
const { t } = useI18n();

type EditorTab = 'general' | 'bot-long' | 'bot-short' | 'bounds' | 'optimizer' | 'objectives' | 'suite' | 'runtime' | 'raw';
type SectionName = 'backtest' | 'optimize' | 'live' | 'pbgui' | 'logging';
type BotSide = 'long' | 'short';
type SeedMode = 'none' | 'self' | 'path';
type AdditionalParamType = 'boolean' | 'number' | 'json' | 'null' | 'string';
const KNOWN_OPTIMIZE_KEYS = new Set([
  'iters', 'n_cpus', 'starting_config', 'pareto_max_size', 'backend', 'max_pending_starting_evals_per_cpu',
  'offspring_multiplier', 'population_size', 'crossover_probability', 'mutation_probability', 'mutation_indpb',
  'crossover_eta', 'mutation_eta', 'round_to_n_significant_digits', 'compress_results_file', 'write_all_results',
  'enable_overrides', 'fixed_params', 'fixed_runtime_overrides', 'scoring', 'limits', 'bounds', 'pymoo',
]);
const DEAP_HINT_KEYS = ['offspring_multiplier', 'crossover_probability', 'mutation_probability', 'mutation_indpb', 'crossover_eta', 'mutation_eta'];
const tabs: { id: EditorTab; label: string }[] = [
  { id: 'general', label: 'v7optimize.editorTabGeneral' },
  { id: 'bot-long', label: 'v7optimize.editorTabBotLong' },
  { id: 'bot-short', label: 'v7optimize.editorTabBotShort' },
  { id: 'bounds', label: 'v7optimize.editorTabBounds' },
  { id: 'optimizer', label: 'v7optimize.editorTabOptimizer' },
  { id: 'objectives', label: 'v7optimize.editorTabObjectives' },
  { id: 'suite', label: 'v7optimize.editorTabSuite' },
  { id: 'runtime', label: 'v7optimize.editorTabRuntime' },
  { id: 'raw', label: 'v7optimize.editorTabRaw' },
];

const tab = ref<EditorTab>('general');
const local = ref<OptimizeEditorDraft | null>(null);
const localError = ref('');
const exchangeText = ref('');
const tagsText = ref('');
const approvedLongText = ref('');
const approvedShortText = ref('');
const ignoredLongText = ref('');
const ignoredShortText = ref('');
const botLongJson = ref('{}');
const botShortJson = ref('{}');
const scoringJson = ref('[]');
const limitsJson = ref('[]');
const pymooJson = ref('{}');
const enableOverridesJson = ref('{}');
const coinSourcesJson = ref('{}');
const runtimeJson = ref('{}');
const overrideJson = ref('{}');
const rawJson = ref('{}');
const seedMode = ref<SeedMode>('none');
const seedPath = ref('');
const objectiveScenarioMode = ref<'aggregate' | 'named'>('aggregate');
const objectiveScenarioName = ref('');
const fineTuneText = ref('');
const polishPercentageText = ref('');
const polishBoundsMode = ref('clamp');
const newBoundKey = ref('');
const availableCoins = ref<string[]>([]);
const additionalParamJson = ref<Record<string, string>>({});
let marketGeneration = 0;

function json(value: unknown): string { return JSON.stringify(value ?? {}, null, 2); }
function csv(value: unknown): string { return Array.isArray(value) ? value.map(String).join(', ') : String(value ?? ''); }
function coinText(value: unknown): string { return value === 'all' ? 'all' : csv(value); }
function parseCsv(value: string): string[] { return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]; }
function parseCoinText(value: string): string[] | 'all' { return value.trim().toLowerCase() === 'all' ? 'all' : parseCsv(value); }
function isKnownOptimizeKey(key: string): boolean {
  return KNOWN_OPTIMIZE_KEYS.has(key) || (props.version === 'v8' && (key === 'seed' || key === 'objective_scenario'));
}
function additionalParamType(value: unknown): AdditionalParamType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value !== null && typeof value === 'object') return 'json';
  return value === null ? 'null' : 'string';
}
function initializeAdditionalParams(): void {
  additionalParamJson.value = {};
  Object.entries(local.value?.optimize ?? {}).forEach(([key, value]) => {
    if (!isKnownOptimizeKey(key) && additionalParamType(value) === 'json') additionalParamJson.value[key] = json(value);
  });
}
function inferOptimizeBackend(optimize: JsonObject): string {
  const configured = String(optimize.backend || '').trim().toLowerCase();
  if (configured) return configured;
  return DEAP_HINT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(optimize, key)) ? 'deap' : 'pymoo';
}

function load(source: OptimizeEditorDraft | null): void {
  local.value = source ? cloneValue(source) : null;
  localError.value = '';
  tab.value = 'general';
  if (!local.value) return;
  local.value.optimize.backend = inferOptimizeBackend(local.value.optimize);
  initializeAdditionalParams();
  exchangeText.value = local.value.exchanges.join(', ');
  tagsText.value = csv(local.value.pbgui.tags);
  approvedLongText.value = coinText(getPath(local.value.live, 'approved_coins.long', []));
  approvedShortText.value = coinText(getPath(local.value.live, 'approved_coins.short', []));
  ignoredLongText.value = coinText(getPath(local.value.live, 'ignored_coins.long', []));
  ignoredShortText.value = coinText(getPath(local.value.live, 'ignored_coins.short', []));
  botLongJson.value = json(local.value.botLong);
  botShortJson.value = json(local.value.botShort);
  scoringJson.value = json(local.value.scoring);
  limitsJson.value = json(local.value.limits);
  pymooJson.value = json(local.value.optimize.pymoo);
  enableOverridesJson.value = json(local.value.optimize.enable_overrides);
  coinSourcesJson.value = json(local.value.backtest.coin_sources ?? local.value.pbgui.coin_sources);
  runtimeJson.value = json(local.value.runtimeOverrides);
  overrideJson.value = json(local.value.overrideConfigs);
  rawJson.value = json(collectEditorConfig(local.value, props.version));
  const configuredMode = String(local.value.pbgui.optimize_seed_mode || '').trim();
  seedMode.value = configuredMode === 'path' || configuredMode === 'self'
    ? configuredMode
    : local.value.pbgui.starting_config ? 'self' : 'none';
  seedPath.value = String(local.value.pbgui.optimize_seed_path || '');
  objectiveScenarioName.value = String(local.value.optimize.objective_scenario || '');
  objectiveScenarioMode.value = objectiveScenarioName.value ? 'named' : 'aggregate';
  const runtime = getPath(local.value.pbgui, 'optimize_runtime', {}) as JsonObject;
  fineTuneText.value = Array.isArray(runtime.fine_tune_params) ? runtime.fine_tune_params.map(String).join(', ') : String(runtime.fine_tune_params || '');
  const polish = Number(runtime.polish_percentage);
  polishPercentageText.value = Number.isFinite(polish) ? String(polish * 100) : '';
  polishBoundsMode.value = String(runtime.polish_bounds_mode || 'clamp');
}

function pymooObject(): JsonObject {
  if (!local.value) return {};
  const current = local.value.optimize.pymoo;
  if (!current || typeof current !== 'object' || Array.isArray(current)) local.value.optimize.pymoo = {};
  return local.value.optimize.pymoo as JsonObject;
}
function pymooShared(): JsonObject {
  const pymoo = pymooObject();
  if (!pymoo.shared || typeof pymoo.shared !== 'object' || Array.isArray(pymoo.shared)) pymoo.shared = {};
  return pymoo.shared as JsonObject;
}
function syncPymooJson(): void { pymooJson.value = json(local.value?.optimize.pymoo ?? {}); }
function pymooText(path: string, fallback: string): string { return String(getPath(pymooObject(), path, fallback) ?? fallback); }
function pymooNumber(path: string, fallback: number): number {
  const value = Number(getPath(pymooObject(), path, fallback));
  return Number.isFinite(value) ? value : fallback;
}
function setPymooText(path: string, value: string): void { setPymooValue(path, value); }
function setPymooAlgorithm(value: string): void {
  setPymooText('algorithm', value);
  if (props.version === 'v7' && effectivePymooAlgorithm.value === 'nsga2' && pymooPopulationMode() === 'auto' && local.value) local.value.optimize.population_size = 500;
}
function setPymooValue(path: string, value: unknown): void {
  setPath(pymooObject(), path, value);
  syncPymooJson();
}
function setPymooNumber(path: string, raw: string): void {
  const value = Number(raw);
  setPath(pymooObject(), path, Number.isFinite(value) ? value : raw);
  syncPymooJson();
}
function pymooPopulationMode(): 'auto' | 'value' {
  return local.value?.optimize.population_size === null || local.value?.optimize.population_size === undefined ? 'auto' : 'value';
}
function setPymooPopulationMode(mode: string): void {
  if (!local.value) return;
  local.value.optimize.population_size = mode === 'auto' ? null : pymooNumber('population_size', 500);
}
function setPymooPopulationSize(raw: string): void {
  if (!local.value) return;
  const value = Number(raw);
  if (Number.isFinite(value)) local.value.optimize.population_size = value;
}
function refDirPartitionsMode(): 'auto' | 'value' {
  return pymooText('algorithms.nsga3.ref_dirs.n_partitions', 'auto') === 'auto' ? 'auto' : 'value';
}
function setRefDirPartitionsMode(mode: string): void {
  if (mode === 'auto') setPymooValue('algorithms.nsga3.ref_dirs.n_partitions', 'auto');
  else if (refDirPartitionsMode() === 'auto') setPymooValue('algorithms.nsga3.ref_dirs.n_partitions', 1);
}
function mutationProbabilityMode(): 'auto' | 'value' {
  return pymooText('shared.mutation_prob_var', 'auto') === 'auto' ? 'auto' : 'value';
}
function setMutationProbabilityMode(mode: string): void {
  if (mode === 'auto') setPath(pymooShared(), 'mutation_prob_var', 'auto');
  else if (pymooText('shared.mutation_prob_var', '') === 'auto') setPath(pymooShared(), 'mutation_prob_var', 0.1);
  syncPymooJson();
}
function setMutationProbability(raw: string): void { setPymooNumber('shared.mutation_prob_var', raw); }
function setObjectiveScenario(mode: string): void {
  if (!local.value || props.version !== 'v8') return;
  objectiveScenarioMode.value = mode === 'named' ? 'named' : 'aggregate';
  local.value.optimize.objective_scenario = objectiveScenarioMode.value === 'named' ? objectiveScenarioName.value.trim() : null;
}
function setObjectiveScenarioName(value: string): void {
  objectiveScenarioName.value = value;
  if (local.value && objectiveScenarioMode.value === 'named') local.value.optimize.objective_scenario = value.trim();
}
function optimizeRuntime(): JsonObject {
  if (!local.value) return {};
  const current = getPath(local.value.pbgui, 'optimize_runtime', {});
  if (!current || typeof current !== 'object' || Array.isArray(current)) setPath(local.value.pbgui, 'optimize_runtime', {});
  return getPath(local.value.pbgui, 'optimize_runtime', {}) as JsonObject;
}
function setFineTuneText(value: string): void {
  fineTuneText.value = value;
  setPath(optimizeRuntime(), 'fine_tune_params', parseCsv(value));
}
function setPolishPercentage(value: string): void {
  polishPercentageText.value = value;
  const parsed = Number(value);
  setPath(optimizeRuntime(), 'polish_percentage', value.trim() === '' ? null : (Number.isFinite(parsed) ? parsed / 100 : value));
}
function setPolishBoundsMode(value: string): void {
  polishBoundsMode.value = value;
  setPath(optimizeRuntime(), 'polish_bounds_mode', value);
}
function runtimeOverrideValue(key: string, fallback: unknown): unknown { return local.value?.runtimeOverrides[key] ?? fallback; }
function setRuntimeOverride(key: string, value: unknown): void {
  if (!local.value) return;
  local.value.runtimeOverrides[key] = value;
  runtimeJson.value = json(local.value.runtimeOverrides);
}


async function loadMarkets(exchanges: string[]): Promise<void> {
  const generation = ++marketGeneration;
  if (!props.loadSymbols || !exchanges.length) { availableCoins.value = []; return; }
  const results = await Promise.allSettled(exchanges.map((exchange) => props.loadSymbols!(exchange)));
  if (generation !== marketGeneration) return;
  const coins = new Set<string>();
  results.forEach((result) => { if (result.status === 'fulfilled') result.value.symbols.forEach((symbol) => coins.add(String(symbol))); });
  availableCoins.value = [...coins].sort();
}
watch(() => [props.open, props.draft] as const, ([open]) => { if (open) { load(props.draft); void loadMarkets(props.draft?.exchanges || []); } }, { immediate: true, deep: true });

const displayedError = computed(() => localError.value || props.error);
const boundRows = computed(() => Object.entries(local.value?.bounds ?? {}).sort(([a], [b]) => a.localeCompare(b)));
const availableExchanges = computed(() => {
  const values = new Set([...(props.exchangeOptions ?? []), ...(local.value?.exchanges ?? [])]);
  return [...values].filter(Boolean).sort();
});
const availableBackends = computed(() => {
  const selected = String(local.value?.optimize.backend || '');
  const values = new Set([...(props.backendOptions ?? []), selected, 'pymoo', 'deap']);
  return [...values].filter(Boolean);
});
const availableStrategies = computed(() => {
  const selected = String(local.value?.live.strategy_kind || '');
  return [...new Set([...(props.strategyOptions ?? []), selected].filter(Boolean))];
});
const availableHslModes = computed(() => {
  const selected = String(local.value?.live.hsl_signal_mode || '');
  return [...new Set([...(props.hslModes ?? []), selected].filter(Boolean))];
});
const currentBackend = computed(() => String(local.value?.optimize.backend || 'pymoo'));
const availablePymooAlgorithms = computed(() => [...new Set([...(props.pymooAlgorithmOptions ?? []), pymooText('algorithm', 'auto'), 'auto', 'nsga2', 'nsga3'].filter(Boolean))]);
const availablePymooRefDirMethods = computed(() => [...new Set([...(props.pymooRefDirMethodOptions ?? []), pymooText('algorithms.nsga3.ref_dirs.method', 'das_dennis')].filter(Boolean))]);
const effectivePymooAlgorithm = computed(() => {
  if (currentBackend.value !== 'pymoo') return '';
  const algorithm = pymooText('algorithm', 'auto').toLowerCase();
  const objectiveCount = local.value?.scoring.length ?? 0;
  if (algorithm === 'auto') return objectiveCount <= 3 ? 'nsga2' : 'nsga3';
  if (algorithm === 'nsga3' && objectiveCount < 2) return 'nsga2';
  return algorithm;
});

const additionalOptimizeEntries = computed(() => Object.entries(local.value?.optimize ?? {})
  .filter(([key]) => !isKnownOptimizeKey(key))
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => ({ key, value, type: additionalParamType(value) })));

function switchOptimizeBackend(nextBackend: string): void {
  if (!local.value) return;
  local.value.optimize = migrateOptimizeBackend(local.value.optimize, nextBackend, props.optimizeDefaults);
  pymooJson.value = json(local.value.optimize.pymoo);
}
function setAdditionalBoolean(key: string, value: boolean): void { if (local.value) local.value.optimize[key] = value; }
function setAdditionalValue(key: string, value: string, type: AdditionalParamType): void {
  if (!local.value) return;
  if (type === 'number') {
    const parsed = Number(value);
    local.value.optimize[key] = Number.isFinite(parsed) ? parsed : value;
  } else if (type === 'null') {
    const raw = value.trim();
    if (!raw || raw === 'null') local.value.optimize[key] = null;
    else {
      try { local.value.optimize[key] = JSON.parse(raw) as unknown; } catch { local.value.optimize[key] = value; }
    }
  } else {
    local.value.optimize[key] = value;
  }
}
function setAdditionalJson(key: string, value: string): void { additionalParamJson.value[key] = value; }
function applyAdditionalJsonParams(): void {
  if (!local.value) return;
  additionalOptimizeEntries.value.forEach((entry) => {
    if (entry.type !== 'json') return;
    const raw = additionalParamJson.value[entry.key] ?? json(entry.value);
    try { local.value!.optimize[entry.key] = JSON.parse(raw) as unknown; }
    catch (error) {
      throw new Error(t('v7optimize.additionalParameterJsonError', { key: entry.key, error: error instanceof Error ? error.message : String(error) }));
    }
  });
}

function section(section: SectionName): JsonObject | null { return local.value?.[section] ?? null; }
function numberField(sectionName: SectionName, key: string, fallback = 0): number {
  const value = section(sectionName)?.[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function setNumber(sectionName: SectionName, key: string, value: string): void {
  const target = section(sectionName);
  if (!target) return;
  const parsed = Number(value);
  target[key] = Number.isFinite(parsed) ? parsed : value;
}
function setText(sectionName: SectionName, key: string, value: string): void {
  const target = section(sectionName);
  if (target) target[key] = value;
}
function booleanField(sectionName: SectionName, key: string, fallback = false): boolean {
  const value = section(sectionName)?.[key];
  return value === undefined ? fallback : !!value;
}
function setBoolean(sectionName: SectionName, key: string, value: boolean): void {
  const target = section(sectionName);
  if (target) target[key] = value;
}

function toggleExchange(exchange: string, checked: boolean): void {
  if (!local.value) return;
  const next = new Set(local.value.exchanges);
  if (checked) next.add(exchange); else next.delete(exchange);
  local.value.exchanges = [...next];
  exchangeText.value = local.value.exchanges.join(', ');
}
function applyExchangeText(): void { if (local.value) local.value.exchanges = parseCsv(exchangeText.value); }

function botJson(side: BotSide): string { return side === 'long' ? botLongJson.value : botShortJson.value; }
function setBotJson(side: BotSide, value: string): void { if (side === 'long') botLongJson.value = value; else botShortJson.value = value; }
function botObject(side: BotSide): JsonObject {
  try { return parseJsonObject(botJson(side), `Bot ${side}`); } catch { return cloneValue(side === 'long' ? local.value?.botLong ?? {} : local.value?.botShort ?? {}); }
}
function botPath(key: 'twe' | 'npos' | 'hsl'): string {
  if (props.version === 'v8') return key === 'twe' ? 'risk.total_wallet_exposure_limit' : key === 'npos' ? 'risk.n_positions' : 'hsl.enabled';
  return key === 'twe' ? 'total_wallet_exposure_limit' : key === 'npos' ? 'n_positions' : 'hsl_enabled';
}
function botNumber(side: BotSide, key: 'twe' | 'npos', fallback: number): number {
  const value = Number(getPath(botObject(side), botPath(key), fallback));
  return Number.isFinite(value) ? value : fallback;
}
function setBotNumber(side: BotSide, key: 'twe' | 'npos', raw: string): void {
  const target = botObject(side);
  const parsed = Number(raw);
  setPath(target, botPath(key), Number.isFinite(parsed) ? parsed : raw);
  setBotJson(side, json(target));
}
function botBoolean(side: BotSide, key: 'hsl'): boolean { return !!getPath(botObject(side), botPath(key), false); }
function setBotBoolean(side: BotSide, key: 'hsl', value: boolean): void {
  const target = botObject(side);
  setPath(target, botPath(key), value);
  setBotJson(side, json(target));
}

function pairValue(pair: BoundPair, index: number): string { return Array.isArray(pair) && pair[index] !== undefined ? String(pair[index]) : ''; }
function setBoundValue(key: string, index: number, value: string): void {
  if (!local.value) return;
  const current = Array.isArray(local.value.bounds[key]) ? [...local.value.bounds[key]!] : [0, 0];
  const parsed = Number(value);
  current[index] = Number.isFinite(parsed) ? parsed : value;
  local.value.bounds[key] = current;
}
function addBound(): void {
  if (!local.value) return;
  const key = newBoundKey.value.trim();
  if (!key || Object.prototype.hasOwnProperty.call(local.value.bounds, key)) return;
  local.value.bounds[key] = [0, 1];
  newBoundKey.value = '';
}
function deleteBound(key: string): void { if (local.value) delete local.value.bounds[key]; }
function boundFixed(key: string): boolean { return !!local.value?.fixedParams.includes(key); }
function setBoundFixed(key: string, fixed: boolean): void {
  if (!local.value) return;
  const values = new Set(local.value.fixedParams);
  if (fixed) values.add(key); else values.delete(key);
  local.value.fixedParams = [...values];
}

function parseArray(raw: string, label: string): unknown[] {
  let value: unknown;
  try { value = JSON.parse(raw || '[]'); } catch (error) { throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
  if (!Array.isArray(value)) throw new Error(`${label}: JSON value must be an array`);
  return value;
}

function applySeedState(): void {
  if (!local.value) return;
  const pbgui = local.value.pbgui;
  pbgui.optimize_seed_mode = seedMode.value;
  pbgui.starting_config = seedMode.value === 'self';
  if (seedMode.value === 'path' && seedPath.value.trim()) pbgui.optimize_seed_path = seedPath.value.trim();
  else delete pbgui.optimize_seed_path;
  const runtime = parseJsonObject(json(pbgui.optimize_runtime), 'Optimize runtime');
  runtime.mode = seedMode.value === 'none' ? 'fresh' : 'pareto_seed';
  runtime.source = seedMode.value === 'self' ? '__self__' : seedMode.value === 'path' ? seedPath.value.trim() : '';
  pbgui.optimize_runtime = runtime;
}

function applyTextSections(): void {
  if (!local.value) return;
  applyExchangeText();
  local.value.pbgui.tags = parseCsv(tagsText.value);
  setPath(local.value.live, 'approved_coins.long', parseCoinText(approvedLongText.value));
  setPath(local.value.live, 'approved_coins.short', parseCoinText(approvedShortText.value));
  setPath(local.value.live, 'ignored_coins.long', parseCoinText(ignoredLongText.value));
  setPath(local.value.live, 'ignored_coins.short', parseCoinText(ignoredShortText.value));
  local.value.botLong = parseJsonObject(botLongJson.value, 'Bot long');
  local.value.botShort = parseJsonObject(botShortJson.value, 'Bot short');
  local.value.scoring = parseArray(scoringJson.value, 'Scoring');
  const parsedLimits: unknown = JSON.parse(limitsJson.value || '[]');
  if (!Array.isArray(parsedLimits) && (parsedLimits === null || typeof parsedLimits !== 'object')) throw new Error('Limits: JSON value must be an array or object');
  local.value.limits = cloneValue(parsedLimits) as unknown[] | Record<string, unknown>;
  const pymooFromJson = parseJsonObject(pymooJson.value, 'Pymoo');
  const structuredPymoo = local.value.optimize.pymoo;
  local.value.optimize.pymoo = pymooFromJson;
  const mergedPymoo = local.value.optimize.pymoo as JsonObject;
  if (structuredPymoo && typeof structuredPymoo === 'object' && !Array.isArray(structuredPymoo)) {
    const structured = structuredPymoo as JsonObject;
    if (structured.algorithm !== undefined) mergedPymoo.algorithm = structured.algorithm;
    if (structured.shared && typeof structured.shared === 'object' && !Array.isArray(structured.shared)) {
      mergedPymoo.shared = { ...((pymooFromJson.shared as JsonObject) || {}), ...(structured.shared as JsonObject) };
    }
    const structuredRefDirs = getPath(structured, 'algorithms.nsga3.ref_dirs', null);
    if (structuredRefDirs && typeof structuredRefDirs === 'object' && !Array.isArray(structuredRefDirs)) {
      setPath(mergedPymoo, 'algorithms.nsga3.ref_dirs', {
        ...((getPath(pymooFromJson, 'algorithms.nsga3.ref_dirs', {}) as JsonObject) || {}),
        ...(structuredRefDirs as JsonObject),
      });
    }
  }
  let parsedEnableOverrides: unknown;
  try { parsedEnableOverrides = JSON.parse(enableOverridesJson.value || '[]'); }
  catch (error) { throw new Error(`Enable overrides: ${error instanceof Error ? error.message : String(error)}`); }
  if (!Array.isArray(parsedEnableOverrides) && (parsedEnableOverrides === null || typeof parsedEnableOverrides !== 'object')) throw new Error('Enable overrides: JSON value must be an array or object');
  local.value.optimize.enable_overrides = cloneValue(parsedEnableOverrides);
  local.value.backtest.coin_sources = parseJsonObject(coinSourcesJson.value, 'Coin sources');
  local.value.runtimeOverrides = parseJsonObject(runtimeJson.value, 'Runtime overrides');
  local.value.overrideConfigs = parseJsonObject(overrideJson.value, 'Override configs');
  applySeedState();
  applyAdditionalJsonParams();
  if (props.version === 'v8') {
    local.value.optimize.objective_scenario = objectiveScenarioMode.value === 'named' ? objectiveScenarioName.value.trim() : null;
  }
  cleanupOptimizeBackendFields(local.value.optimize);
  const limitRows = Array.isArray(local.value.limits) ? local.value.limits : [];
  if (props.version === 'v8') {
    const scenarioIssues = validatePb8ScenarioBases({
      scoring: local.value.scoring,
      limits: limitRows,
      objectiveScenario: local.value.optimize.objective_scenario,
      suiteEnabled: local.value.suite.enabled,
      scenarioLabels: local.value.suite.scenarios.map((scenario) => isObject(scenario) ? scenario.label ?? '' : ''),
    });
    if (scenarioIssues.length) throw new Error(t(scenarioIssues[0]!.key, scenarioIssues[0]!.params || {}));
  }
}

function applyRaw(): void {
  if (!local.value) return;
  try {
    const prepared = buildEditorDraft(parseJsonObject(rawJson.value, 'Raw config JSON'), props.version, local.value.name, local.value.overrideConfigs);
    load(prepared);
    tab.value = 'raw';
  } catch (error) {
    localError.value = error instanceof Error ? error.message : String(error);
  }
}
function save(queueAfterSave: boolean): void {
  if (!local.value) return;
  try {
    localError.value = '';
    applyTextSections();
    if (!local.value.name.trim()) throw new Error(t('v7optimize.configNameRequired'));
    if (!local.value.exchanges.length) throw new Error(t('v7optimize.selectAtLeastOneExchange'));
    if (props.version === 'v8' && polishPercentageText.value.trim()) {
      const polish = Number(polishPercentageText.value);
      if (!Number.isFinite(polish) || polish < 0 || polish > 100) throw new Error(t('editor.optimize.polishPctError'));
    }
    emit('save', cloneValue(local.value), queueAfterSave);
  } catch (error) {
    localError.value = error instanceof Error ? error.message : String(error);
  }
}
function preflight(): void {
  if (!local.value) return;
  try {
    localError.value = '';
    applyTextSections();
    emit('preflight', cloneValue(local.value));
  } catch (error) {
    localError.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<template>
  <div v-if="open && local" class="opt-modal-backdrop">
    <section class="opt-modal opt-editor-modal" role="dialog" aria-modal="true" aria-labelledby="opt-editor-title">
      <header class="opt-modal-head">
        <div><h2 id="opt-editor-title">{{ t('v7optimize.editOptimize') }}</h2><small>{{ version.toUpperCase() }}</small></div>
        <div class="opt-actions"><button class="opt-btn" data-action="preflight" type="button" @click="preflight">🧭 {{ t('v7optimize.ohlcvReadiness') }}</button><button class="opt-btn" @click="emit('close')">{{ t('common.close') }}</button></div>
      </header>
      <nav class="opt-editor-tabs">
        <button v-for="item in tabs" :key="item.id" type="button" :data-tab="item.id" :class="{ active: tab === item.id }" @click="tab = item.id">{{ t(item.label) }}</button>
      </nav>
      <div class="opt-modal-body opt-editor-body">
        <section v-if="tab === 'general'" class="opt-editor-grid">
          <label class="opt-form-label span-2">{{ t('v7optimize.configName') }}<input v-model="local.name" class="opt-input" /></label>
          <label class="opt-form-label">start_date<input class="opt-input" type="date" :value="String(local.backtest.start_date || '')" @input="setText('backtest', 'start_date', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">end_date<input class="opt-input" type="date" :value="String(local.backtest.end_date || '')" @input="setText('backtest', 'end_date', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">starting_balance<input class="opt-input" type="number" :value="numberField('backtest', 'starting_balance', 1000)" @input="setNumber('backtest', 'starting_balance', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">candle_interval_minutes<input class="opt-input" type="number" :value="numberField('backtest', 'candle_interval_minutes', 60)" @input="setNumber('backtest', 'candle_interval_minutes', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label" data-field="btc-collateral-cap">btc_collateral_cap<input class="opt-input" type="number" step="any" :value="numberField('backtest', 'btc_collateral_cap', 0)" @input="setNumber('backtest', 'btc_collateral_cap', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">btc_collateral_ltv_cap<input class="opt-input" type="number" step="any" :value="numberField('backtest', 'btc_collateral_ltv_cap', 0)" @input="setNumber('backtest', 'btc_collateral_ltv_cap', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">hsl_signal_mode<select class="opt-input" :value="String(local.live.hsl_signal_mode || '')" @change="setText('live', 'hsl_signal_mode', ($event.target as HTMLSelectElement).value)"><option v-for="mode in availableHslModes" :key="mode" :value="mode">{{ mode }}</option></select></label>
          <label v-if="version === 'v8'" class="opt-form-label">strategy_kind<select class="opt-input" :value="String(local.live.strategy_kind || '')" @change="setText('live', 'strategy_kind', ($event.target as HTMLSelectElement).value)"><option v-for="strategy in availableStrategies" :key="strategy" :value="strategy">{{ strategy }}</option></select></label>
          <label class="opt-form-label span-4">ohlcv_source_dir<div class="opt-inline-control"><input class="opt-input opt-grow" :value="String(local.backtest.ohlcv_source_dir || '')" @input="setText('backtest', 'ohlcv_source_dir', ($event.target as HTMLInputElement).value)" /><button class="opt-btn small" type="button" @click="setText('backtest', 'ohlcv_source_dir', '')">×</button><button v-if="pbguiDataPath" class="opt-btn small" type="button" @click="setText('backtest', 'ohlcv_source_dir', pbguiDataPath)">{{ t('v7optimize.pbguiData') }}</button></div></label>
          <label class="opt-form-label">market_cap<input class="opt-input" type="number" step="any" :value="numberField('pbgui', 'market_cap', 0)" @input="setNumber('pbgui', 'market_cap', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">vol_mcap<input class="opt-input" type="number" step="any" :value="numberField('pbgui', 'vol_mcap', 0)" @input="setNumber('pbgui', 'vol_mcap', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">minimum_coin_age_days<input class="opt-input" type="number" :value="numberField('live', 'minimum_coin_age_days', 0)" @input="setNumber('live', 'minimum_coin_age_days', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label span-2">tags<input v-model="tagsText" class="opt-input" /></label>
          <label><input type="checkbox" :checked="booleanField('pbgui', 'only_cpt')" @change="setBoolean('pbgui', 'only_cpt', ($event.target as HTMLInputElement).checked)" /> only_cpt</label>
          <label><input type="checkbox" :checked="booleanField('pbgui', 'notices_ignore')" @change="setBoolean('pbgui', 'notices_ignore', ($event.target as HTMLInputElement).checked)" /> notices_ignore</label>
          <label class="opt-form-label span-4">exchanges<input v-model="exchangeText" class="opt-input" @blur="applyExchangeText" /></label>
          <div v-if="availableExchanges.length" class="opt-exchange-grid span-4"><label v-for="exchange in availableExchanges" :key="exchange"><input type="checkbox" :checked="local.exchanges.includes(exchange)" @change="toggleExchange(exchange, ($event.target as HTMLInputElement).checked)" /> {{ exchange }}</label></div>
          <label class="opt-form-label span-2">approved_coins.long<input v-model="approvedLongText" class="opt-input" /></label>
          <label class="opt-form-label span-2">approved_coins.short<input v-model="approvedShortText" class="opt-input" /></label>
          <label class="opt-form-label span-2">ignored_coins.long<input v-model="ignoredLongText" class="opt-input" /></label>
          <label class="opt-form-label span-2">ignored_coins.short<input v-model="ignoredShortText" class="opt-input" /></label>
          <label class="opt-form-label span-4">coin_sources<textarea v-model="coinSourcesJson" class="opt-json small" /></label>
        </section>

        <section v-else-if="tab === 'bot-long'" class="opt-editor-stack">
          <div class="opt-editor-grid cols-3"><label class="opt-form-label">total_wallet_exposure_limit<input class="opt-input" type="number" step="any" :value="botNumber('long', 'twe', 1)" @input="setBotNumber('long', 'twe', ($event.target as HTMLInputElement).value)" /></label><label class="opt-form-label">n_positions<input class="opt-input" type="number" step="1" :value="botNumber('long', 'npos', 1)" @input="setBotNumber('long', 'npos', ($event.target as HTMLInputElement).value)" /></label><label><input type="checkbox" :checked="botBoolean('long', 'hsl')" @change="setBotBoolean('long', 'hsl', ($event.target as HTMLInputElement).checked)" /> hsl_enabled</label></div>
          <BotJsonEditor v-model="botLongJson" label="Bot long JSON" :status="(paramStatus?.long as Record<string, unknown> | undefined) || {}" />
        </section>
        <section v-else-if="tab === 'bot-short'" class="opt-editor-stack">
          <div class="opt-editor-grid cols-3"><label class="opt-form-label">total_wallet_exposure_limit<input class="opt-input" type="number" step="any" :value="botNumber('short', 'twe', 0)" @input="setBotNumber('short', 'twe', ($event.target as HTMLInputElement).value)" /></label><label class="opt-form-label">n_positions<input class="opt-input" type="number" step="1" :value="botNumber('short', 'npos', 0)" @input="setBotNumber('short', 'npos', ($event.target as HTMLInputElement).value)" /></label><label><input type="checkbox" :checked="botBoolean('short', 'hsl')" @change="setBotBoolean('short', 'hsl', ($event.target as HTMLInputElement).checked)" /> hsl_enabled</label></div>
          <BotJsonEditor v-model="botShortJson" label="Bot short JSON" :status="(paramStatus?.short as Record<string, unknown> | undefined) || {}" />
        </section>

        <section v-else-if="tab === 'bounds'" class="opt-bounds-editor">
          <div class="opt-toolbar"><input v-model="newBoundKey" class="opt-input opt-grow" placeholder="bot.long.risk.wallet_exposure_limit" @keydown.enter.prevent="addBound" /><button class="opt-btn primary" type="button" @click="addBound">＋ Add</button></div>
          <div v-for="[key, pair] in boundRows" :key="key" class="opt-bound-row">
            <code>{{ key }}</code>
            <input class="opt-input" type="number" step="any" :value="pairValue(pair, 0)" @input="setBoundValue(key, 0, ($event.target as HTMLInputElement).value)" />
            <span>→</span>
            <input class="opt-input" type="number" step="any" :value="pairValue(pair, 1)" @input="setBoundValue(key, 1, ($event.target as HTMLInputElement).value)" />
            <input class="opt-input" type="number" step="any" :data-field="`bound-step-${key}`" :value="pairValue(pair, 2)" placeholder="step" @input="setBoundValue(key, 2, ($event.target as HTMLInputElement).value)" />
            <label class="opt-bound-fixed"><input type="checkbox" :data-field="`bound-fixed-${key}`" :checked="boundFixed(key)" @change="setBoundFixed(key, ($event.target as HTMLInputElement).checked)" /> fixed</label>
            <button class="opt-btn danger small" type="button" @click="deleteBound(key)">×</button>
          </div>
        </section>

        <section v-else-if="tab === 'optimizer'" class="opt-editor-grid">
          <label class="opt-form-label">backend<select class="opt-input" data-field="optimizer-backend" :value="currentBackend" @change="switchOptimizeBackend(($event.target as HTMLSelectElement).value)"><option v-for="backend in availableBackends" :key="backend" :value="backend">{{ backend }}</option></select></label>
          <label class="opt-form-label">iters<input class="opt-input" type="number" min="1" :value="numberField('optimize', 'iters', 100000)" @input="setNumber('optimize', 'iters', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">n_cpus<input class="opt-input" type="number" min="1" :value="numberField('optimize', 'n_cpus', 1)" @input="setNumber('optimize', 'n_cpus', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">pareto_max_size<input class="opt-input" type="number" min="1" :value="numberField('optimize', 'pareto_max_size', 100)" @input="setNumber('optimize', 'pareto_max_size', ($event.target as HTMLInputElement).value)" /></label>
          <label v-if="version === 'v7'" class="opt-form-label">max_pending_starting_evals_per_cpu<input class="opt-input" type="number" min="1" :value="numberField('optimize', 'max_pending_starting_evals_per_cpu', 1)" @input="setNumber('optimize', 'max_pending_starting_evals_per_cpu', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">round_to_n_significant_digits<input class="opt-input" type="number" min="1" :value="numberField('optimize', 'round_to_n_significant_digits', 5)" @input="setNumber('optimize', 'round_to_n_significant_digits', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">logging_level<input class="opt-input" type="number" min="0" max="3" :value="numberField('logging', 'level', 1)" @input="setNumber('logging', 'level', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">memory_snapshot_interval_minutes<input class="opt-input" type="number" min="0" :value="numberField('logging', 'memory_snapshot_interval_minutes', 30)" @input="setNumber('logging', 'memory_snapshot_interval_minutes', ($event.target as HTMLInputElement).value)" /></label>
          <label class="opt-form-label">volume_refresh_info_threshold_seconds<input class="opt-input" type="number" min="0" :value="numberField('logging', 'volume_refresh_info_threshold_seconds', 30)" @input="setNumber('logging', 'volume_refresh_info_threshold_seconds', ($event.target as HTMLInputElement).value)" /></label>
          <label><input type="checkbox" :checked="booleanField('optimize', 'compress_results_file')" @change="setBoolean('optimize', 'compress_results_file', ($event.target as HTMLInputElement).checked)" /> compress_results_file</label>
          <label><input type="checkbox" :checked="booleanField('optimize', 'write_all_results')" @change="setBoolean('optimize', 'write_all_results', ($event.target as HTMLInputElement).checked)" /> write_all_results</label>
          <label class="opt-form-label">seed_mode<select v-model="seedMode" class="opt-input"><option value="none">none</option><option value="self">self</option><option value="path">path</option></select></label>
          <label v-if="seedMode === 'path'" class="opt-form-label span-3" data-field="seed-path">seed_path<input v-model="seedPath" class="opt-input" /></label>
          <label v-if="version === 'v8'" class="opt-form-label">rng_seed<input class="opt-input" type="number" min="0" :value="numberField('optimize', 'seed', 0)" @input="setNumber('optimize', 'seed', ($event.target as HTMLInputElement).value)" /></label>
          <template v-if="currentBackend === 'pymoo'">
            <div class="opt-editor-grid cols-4 span-4">
              <label class="opt-form-label">algorithm<select class="opt-input" data-field="pymoo-algorithm" :value="pymooText('algorithm', 'auto')" @change="setPymooAlgorithm(($event.target as HTMLSelectElement).value)"><option v-for="algorithm in availablePymooAlgorithms" :key="algorithm" :value="algorithm">{{ algorithm }}</option></select></label>
              <label class="opt-form-label">{{ t('v7optimize.effectiveAlgorithm') }}<input class="opt-input" data-field="pymoo-effective-algorithm" readonly :value="effectivePymooAlgorithm" /></label>
              <label class="opt-form-label">population mode<select class="opt-input" data-field="pymoo-population-mode" :value="pymooPopulationMode()" @change="setPymooPopulationMode(($event.target as HTMLSelectElement).value)"><option value="auto">auto</option><option value="value">explicit</option></select></label>
              <label class="opt-form-label">population size<input class="opt-input" data-field="pymoo-population-size" type="number" min="1" :disabled="pymooPopulationMode() === 'auto'" :value="pymooPopulationMode() === 'auto' ? 500 : numberField('optimize', 'population_size', 500)" @input="setPymooPopulationSize(($event.target as HTMLInputElement).value)" /></label>
              <label class="opt-form-label">eliminate_duplicates<select class="opt-input" data-field="pymoo-eliminate-duplicates" :value="String(!!getPath(pymooShared(), 'eliminate_duplicates', false))" @change="setPymooValue('shared.eliminate_duplicates', ($event.target as HTMLSelectElement).value === 'true')"><option value="false">false</option><option value="true">true</option></select></label>
              <label class="opt-form-label">crossover_eta<input class="opt-input" type="number" step="any" :value="pymooNumber('shared.crossover_eta', 20)" @input="setPymooNumber('shared.crossover_eta', ($event.target as HTMLInputElement).value)" /></label>
              <label class="opt-form-label">crossover_prob_var<input class="opt-input" type="number" step="any" :value="pymooNumber('shared.crossover_prob_var', 0.5)" @input="setPymooNumber('shared.crossover_prob_var', ($event.target as HTMLInputElement).value)" /></label>
              <label class="opt-form-label">mutation_eta<input class="opt-input" type="number" step="any" :value="pymooNumber('shared.mutation_eta', 20)" @input="setPymooNumber('shared.mutation_eta', ($event.target as HTMLInputElement).value)" /></label>
              <label class="opt-form-label">mutation probability mode<select class="opt-input" data-field="pymoo-mutation-prob-mode" :value="mutationProbabilityMode()" @change="setMutationProbabilityMode(($event.target as HTMLSelectElement).value)"><option value="auto">auto</option><option value="value">explicit</option></select></label>
              <label class="opt-form-label">mutation_prob_var<input class="opt-input" type="number" step="any" :disabled="mutationProbabilityMode() === 'auto'" :value="mutationProbabilityMode() === 'auto' ? 0 : pymooNumber('shared.mutation_prob_var', 0.1)" @input="setMutationProbability(($event.target as HTMLInputElement).value)" /></label>
            </div>
            <div v-if="effectivePymooAlgorithm === 'nsga3'" class="opt-editor-grid cols-4 span-4">
              <label class="opt-form-label">reference direction method<select class="opt-input" data-field="pymoo-ref-dir-method" :value="pymooText('algorithms.nsga3.ref_dirs.method', 'das_dennis')" @change="setPymooText('algorithms.nsga3.ref_dirs.method', ($event.target as HTMLSelectElement).value)"><option v-for="method in availablePymooRefDirMethods" :key="method" :value="method">{{ method }}</option></select></label>
              <label class="opt-form-label">partitions mode<select class="opt-input" data-field="pymoo-ref-dir-partitions-mode" :value="refDirPartitionsMode()" @change="setRefDirPartitionsMode(($event.target as HTMLSelectElement).value)"><option value="auto">auto</option><option value="value">explicit</option></select></label>
              <label class="opt-form-label">reference partitions<input class="opt-input" data-field="pymoo-ref-dir-partitions" type="number" min="1" :disabled="refDirPartitionsMode() === 'auto'" :value="refDirPartitionsMode() === 'auto' ? 1 : pymooNumber('algorithms.nsga3.ref_dirs.n_partitions', 1)" @input="setPymooNumber('algorithms.nsga3.ref_dirs.n_partitions', ($event.target as HTMLInputElement).value)" /></label>
              <span class="opt-muted">{{ t('v7optimize.nsga3ReferenceDirections') }}</span>
            </div>
            <label class="opt-form-label span-4" data-field="pymoo-json">pymoo JSON<textarea v-model="pymooJson" class="opt-json small" /></label>
          </template>
          <template v-if="currentBackend === 'deap'">
            <label class="opt-form-label">population_size<input class="opt-input" type="number" :value="numberField('optimize', 'population_size', 500)" @input="setNumber('optimize', 'population_size', ($event.target as HTMLInputElement).value)" /></label>
            <label class="opt-form-label">crossover_probability<input class="opt-input" type="number" step="any" :value="numberField('optimize', 'crossover_probability', 0.7)" @input="setNumber('optimize', 'crossover_probability', ($event.target as HTMLInputElement).value)" /></label>
            <label class="opt-form-label">mutation_probability<input class="opt-input" type="number" step="any" :value="numberField('optimize', 'mutation_probability', 0.2)" @input="setNumber('optimize', 'mutation_probability', ($event.target as HTMLInputElement).value)" /></label>
            <label class="opt-form-label">offspring_multiplier<input class="opt-input" type="number" step="any" :value="numberField('optimize', 'offspring_multiplier', 1)" @input="setNumber('optimize', 'offspring_multiplier', ($event.target as HTMLInputElement).value)" /></label>
            <label class="opt-form-label">crossover_eta<input class="opt-input" type="number" step="any" :value="numberField('optimize', 'crossover_eta', 20)" @input="setNumber('optimize', 'crossover_eta', ($event.target as HTMLInputElement).value)" /></label>
            <label class="opt-form-label">mutation_eta<input class="opt-input" type="number" step="any" :value="numberField('optimize', 'mutation_eta', 20)" @input="setNumber('optimize', 'mutation_eta', ($event.target as HTMLInputElement).value)" /></label>
            <label class="opt-form-label">mutation_indpb<input class="opt-input" type="number" step="any" :value="numberField('optimize', 'mutation_indpb', 0.1)" @input="setNumber('optimize', 'mutation_indpb', ($event.target as HTMLInputElement).value)" /></label>
          </template>
          <label class="opt-form-label span-4">enable_overrides<textarea v-model="enableOverridesJson" class="opt-json small" /></label>
          <div class="opt-editor-stack span-4">
            <div>
              <strong>{{ t('v7optimize.additionalParameters') }}</strong>
              <p class="opt-muted">{{ t('v7optimize.additionalParametersHint') }}</p>
            </div>
            <p v-if="!additionalOptimizeEntries.length" class="opt-muted">{{ t('v7optimize.noAdditionalParameters') }}</p>
            <div v-else class="opt-editor-grid cols-3">
              <label v-for="entry in additionalOptimizeEntries" :key="entry.key" class="opt-form-label" :class="{ 'span-3': entry.type === 'json' }">
                {{ entry.key }}
                <input v-if="entry.type === 'boolean'" type="checkbox" :data-extra-param="entry.key" :checked="!!entry.value" @change="setAdditionalBoolean(entry.key, ($event.target as HTMLInputElement).checked)" />
                <input v-else-if="entry.type === 'number'" class="opt-input" type="number" step="any" :data-extra-param="entry.key" :value="entry.value" @input="setAdditionalValue(entry.key, ($event.target as HTMLInputElement).value, entry.type)" />
                <textarea v-else-if="entry.type === 'json'" class="opt-json small" :data-extra-param="entry.key" :value="additionalParamJson[entry.key]" @input="setAdditionalJson(entry.key, ($event.target as HTMLTextAreaElement).value)" />
                <input v-else class="opt-input" type="text" :data-extra-param="entry.key" :placeholder="entry.type === 'null' ? 'null' : ''" :value="entry.value === null ? '' : String(entry.value)" @input="setAdditionalValue(entry.key, ($event.target as HTMLInputElement).value, entry.type)" />
              </label>
            </div>
          </div>
        </section>

        <section v-else-if="tab === 'objectives'" class="opt-objectives-tab">
          <div v-if="version === 'v8'" class="opt-editor-grid cols-3">
            <label class="opt-form-label">objective scenario<select class="opt-input" data-field="objective-scenario" :value="objectiveScenarioMode" @change="setObjectiveScenario(($event.target as HTMLSelectElement).value)"><option value="aggregate">suite aggregate</option><option value="named">named scenario</option></select></label>
            <label v-if="objectiveScenarioMode === 'named'" class="opt-form-label span-2">scenario label<input class="opt-input" :value="objectiveScenarioName" @input="setObjectiveScenarioName(($event.target as HTMLInputElement).value)" /></label>
          </div>
          <ScoringLimitsEditor :scoring="local.scoring" :limits="local.limits" :scenario-labels="scenarioLabels(local.suite)" :version="version" :metadata="limitsMeta" @update:scoring="local.scoring = $event; scoringJson = json($event)" @update:limits="local.limits = $event; limitsJson = json($event)" />
          <div class="opt-editor-grid cols-2">
            <label class="opt-form-label">scoring JSON<textarea v-model="scoringJson" class="opt-json medium" /></label>
            <label class="opt-form-label">limits JSON<textarea v-model="limitsJson" class="opt-json medium" /></label>
            <label class="opt-form-label span-2">fixed_params<input class="opt-input" :value="local.fixedParams.join(', ')" @input="local.fixedParams = ($event.target as HTMLInputElement).value.split(',').map((v) => v.trim()).filter(Boolean)" /></label>
          </div>
        </section>
        <section v-else-if="tab === 'suite'"><SuiteEditor v-model="local.suite" :exchanges="availableExchanges" :available-coins="availableCoins" :bot-params="botParams || []" :is-v8="version === 'v8'" :exchange-options="availableExchanges" /></section>
        <section v-else-if="tab === 'runtime'" class="opt-editor-stack">
          <div v-if="version === 'v8'" class="opt-editor-grid cols-3">
            <label class="opt-form-label span-2">fine_tune_params<input class="opt-input" data-field="fine-tune-params" :value="fineTuneText" placeholder="long.risk, short.strategy" @input="setFineTuneText(($event.target as HTMLInputElement).value)" /></label>
            <label class="opt-form-label">polish_percentage (%)<input class="opt-input" data-field="polish-percentage" type="number" min="0" max="100" step="0.01" :value="polishPercentageText" @input="setPolishPercentage(($event.target as HTMLInputElement).value)" /></label>
            <label class="opt-form-label">polish_bounds_mode<select class="opt-input" data-field="polish-bounds-mode" :value="polishBoundsMode" @change="setPolishBoundsMode(($event.target as HTMLSelectElement).value)"><option value="clamp">clamp</option><option value="override-tunable">override-tunable</option><option value="override-all">override-all</option></select></label>
          </div>
          <div class="opt-editor-grid cols-2">
            <label><input type="checkbox" data-field="runtime-bot-long-hsl-enabled" :checked="!!runtimeOverrideValue('bot.long.hsl_enabled', false)" @change="setRuntimeOverride('bot.long.hsl_enabled', ($event.target as HTMLInputElement).checked)" /> bot.long.hsl_enabled</label>
            <label><input type="checkbox" data-field="runtime-bot-short-hsl-enabled" :checked="!!runtimeOverrideValue('bot.short.hsl_enabled', false)" @change="setRuntimeOverride('bot.short.hsl_enabled', ($event.target as HTMLInputElement).checked)" /> bot.short.hsl_enabled</label>
            <label class="opt-form-label">bot.long.hsl_no_restart_drawdown_threshold<input class="opt-input" type="number" step="any" :value="runtimeOverrideValue('bot.long.hsl_no_restart_drawdown_threshold', 1)" @input="setRuntimeOverride('bot.long.hsl_no_restart_drawdown_threshold', Number(($event.target as HTMLInputElement).value))" /></label>
            <label class="opt-form-label">bot.short.hsl_no_restart_drawdown_threshold<input class="opt-input" type="number" step="any" :value="runtimeOverrideValue('bot.short.hsl_no_restart_drawdown_threshold', 1)" @input="setRuntimeOverride('bot.short.hsl_no_restart_drawdown_threshold', Number(($event.target as HTMLInputElement).value))" /></label>
          </div>
          <div class="opt-editor-grid cols-2">
            <label class="opt-form-label">runtime overrides<textarea v-model="runtimeJson" class="opt-json medium" /></label>
            <label class="opt-form-label">coin override configs<textarea v-model="overrideJson" class="opt-json medium" /></label>
          </div>
        </section>
        <section v-else class="opt-raw-editor"><textarea v-model="rawJson" class="opt-json" aria-label="Raw config JSON" /><button class="opt-btn" type="button" @click="applyRaw">{{ t('v7optimize.formatJson') }}</button></section>
        <p v-if="displayedError" class="opt-error">{{ displayedError }}</p>
      </div>
      <footer class="opt-modal-actions">
        <button class="opt-btn" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button class="opt-btn primary" data-save="config" @click="save(false)">{{ t('v7optimize.saveConfig') }}</button>
        <button class="opt-btn primary" data-save="queue" @click="save(true)">{{ t('v7optimize.saveConfigAndQueue') }}</button>
      </footer>
    </section>
  </div>
</template>
