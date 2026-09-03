<script setup lang="ts">
import { PhCheck, PhCode, PhCopy, PhGear, PhMagnifyingGlass, PhPlus, PhShieldCheck, PhSliders, PhSparkle, PhX } from '@phosphor-icons/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTipTooltip from '@/shared/components/DataTipTooltip.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import SuiteEditor from '@/shared/suiteEditor/SuiteEditor.vue';
import ScoringLimitsEditor from './ScoringLimitsEditor.vue';
import BotJsonEditor from './BotJsonEditor.vue';
import GpuSettingsEditor from './GpuSettingsEditor.vue';
import type { OptimizeVersion } from '../config';
import {
  buildEditorDraft,
  applyScenarioTemplatePreview,
  cloneValue,
  cleanupOptimizeBackendFields,
  collectEditorConfig,
  filterOptimizeEnableOverridesForStrategy,
  getPath,
  gpuContractItem,
  gpuDefaults,
  isObject,
  migrateOptimizeBackend,
  normalizeGpuSettings,
  normalizeScenarioEndDate,
  parseJsonObject,
  scenarioLabels,
  setPath,
  validatePb8ScenarioBases,
  type BoundPair,
  type JsonObject,
  type OptimizeEditorDraft,
} from '../lib/configModel';
import type { OhlcvStartDateJob } from '../types';
import type { ScenarioGeneratorContext, ScenarioGeneratorPreview, ScenarioGeneratorRequest } from '@/shared/suiteEditor/suiteModel';

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
  backendContract?: unknown;
  optimizeDefaults?: Record<string, unknown>;
  pymooAlgorithmOptions?: string[];
  pymooRefDirMethodOptions?: string[];
  strategyOptions?: string[];
  pbguiDataPath?: string;
  loadSymbols?: (exchange: string) => Promise<{ symbols: string[]; catalog?: Record<string, string> }>;
  previewScenarioTemplate?: (payload: ScenarioGeneratorRequest) => Promise<ScenarioGeneratorPreview>;
  startOhlcvLookup?: (config: Record<string, unknown>) => Promise<OhlcvStartDateJob>;
  loadOhlcvLookup?: (jobId: string) => Promise<OhlcvStartDateJob>;
  stopOhlcvLookup?: (jobId: string) => Promise<OhlcvStartDateJob>;
}>();
const emit = defineEmits<{ close: []; save: [draft: OptimizeEditorDraft, queueAfterSave: boolean]; preflight: [draft: OptimizeEditorDraft] }>();
const { t, te } = useI18n();

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
const contentEl = ref<HTMLElement | null>(null);
const local = ref<OptimizeEditorDraft | null>(null);
const suiteEditor = ref<InstanceType<typeof SuiteEditor> | null>(null);
const localError = ref('');

watch(tab, () => {
  if (contentEl.value) {
    contentEl.value.scrollTop = 0;
  }
});
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
const ohlcvJob = ref<OhlcvStartDateJob | null>(null);
const ohlcvError = ref('');
const ohlcvSignature = ref('');
let ohlcvGeneration = 0;
let ohlcvPollTimer: number | undefined;

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
  if (local.value.optimize.backend === 'gpu' && props.version === 'v8') {
    const existingGpu = isObject(local.value.optimize.gpu) ? local.value.optimize.gpu : {};
    local.value.optimize.gpu = { ...gpuDefaults(props.optimizeDefaults), ...existingGpu };
  }
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
  // v1.98.36: drop overrides the current strategy cannot apply on load
  local.value.optimize.enable_overrides = filterOptimizeEnableOverridesForStrategy(local.value.optimize.enable_overrides, local.value.live.strategy_kind);
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

function clearOhlcvPolling(): void {
  if (ohlcvPollTimer !== undefined) window.clearTimeout(ohlcvPollTimer);
  ohlcvPollTimer = undefined;
}

function stopOhlcvJob(): void {
  const currentJobId = String(ohlcvJob.value?.job_id || '');
  ohlcvGeneration += 1;
  clearOhlcvPolling();
  ohlcvJob.value = null;
  ohlcvError.value = '';
  if (currentJobId && props.stopOhlcvLookup) void props.stopOhlcvLookup(currentJobId).catch(() => undefined);
}

function isOhlcvJobActive(status: string): boolean {
  return status === 'queued' || status === 'running' || status === 'stopping';
}

function currentEditorConfig(): JsonObject {
  if (!local.value) throw new Error('Optimize editor is not open');
  applyTextSections();
  return collectEditorConfig(local.value, props.version);
}

function applyOhlcvResult(job: OhlcvStartDateJob, mode: 'earliest' | 'all_markets', signature: string): void {
  if (!local.value || signature !== ohlcvSignature.value) return;
  let currentSignature = '';
  try { currentSignature = JSON.stringify(currentEditorConfig()); } catch { return; }
  if (currentSignature !== signature) {
    ohlcvError.value = t('v7optimize.ohlcvStartDateStale');
    return;
  }
  const option = job.result?.start_date_options?.[mode];
  if (!option?.available || !option.start_date) {
    ohlcvError.value = option?.detail || t('v7optimize.ohlcvStartDateUnavailable');
    return;
  }
  local.value.backtest.start_date = option.start_date;
  ohlcvError.value = '';
  emit('preflight', cloneValue(local.value));
}

async function refreshOhlcvJob(generation: number, mode: 'earliest' | 'all_markets', signature: string): Promise<void> {
  const jobId = String(ohlcvJob.value?.job_id || '');
  if (!jobId || !props.loadOhlcvLookup || generation !== ohlcvGeneration) return;
  try {
    const nextJob = await props.loadOhlcvLookup(jobId);
    if (generation !== ohlcvGeneration || String(ohlcvJob.value?.job_id || '') !== jobId) return;
    ohlcvJob.value = nextJob;
    if (nextJob.status === 'completed') applyOhlcvResult(nextJob, mode, signature);
    if (isOhlcvJobActive(nextJob.status)) {
      ohlcvPollTimer = window.setTimeout(() => { void refreshOhlcvJob(generation, mode, signature); }, 500);
    } else {
      clearOhlcvPolling();
      if (nextJob.status === 'error') ohlcvError.value = nextJob.error || t('v7optimize.ohlcvStartDateUnavailable');
      ohlcvJob.value = null;
    }
  } catch (error) {
    if (generation === ohlcvGeneration) ohlcvError.value = error instanceof Error ? error.message : String(error);
  }
}

async function startOhlcvDateLookup(mode: 'earliest' | 'all_markets'): Promise<void> {
  if (props.version !== 'v8' || !props.startOhlcvLookup || ohlcvJob.value) return;
  try {
    const config = currentEditorConfig();
    const generation = ++ohlcvGeneration;
    const signature = JSON.stringify(config);
    ohlcvSignature.value = signature;
    ohlcvError.value = '';
    clearOhlcvPolling();
    ohlcvJob.value = { status: 'queued', progress: { percent: 0, message: t('v7optimize.ohlcvStartDateStarting') } };
    const created = await props.startOhlcvLookup(config);
    if (generation !== ohlcvGeneration || !props.open || !local.value) {
      if (created.job_id && props.stopOhlcvLookup) void props.stopOhlcvLookup(created.job_id).catch(() => undefined);
      return;
    }
    ohlcvJob.value = created;
    void refreshOhlcvJob(generation, mode, signature);
  } catch (error) {
    ohlcvJob.value = null;
    ohlcvError.value = error instanceof Error ? error.message : String(error);
  }
}

function currentScenarioContext(): ScenarioGeneratorContext {
  return {
    start_date: String(local.value?.backtest.start_date || '').trim() || null,
    end_date: normalizeScenarioEndDate(local.value?.backtest.end_date) || null,
    exchanges: local.value?.exchanges.slice() || [],
    starting_balance: Number(local.value?.backtest.starting_balance) || null,
  };
}

function applyGeneratedScenarioPreview(preview: ScenarioGeneratorPreview): void {
  if (!local.value) return;
  const applied = applyScenarioTemplatePreview(local.value, preview);
  const config = collectEditorConfig(applied, props.version);
  const reloaded = buildEditorDraft(config, props.version, applied.name, applied.overrideConfigs);
  load(reloaded);
  tab.value = 'suite';
}

watch(() => [props.open, props.draft] as const, ([open, nextDraft], previous) => {
  if (!open) { stopOhlcvJob(); return; }
  if (previous?.[1] !== nextDraft) stopOhlcvJob();
  load(nextDraft);
  void loadMarkets(nextDraft?.exchanges || []);
}, { immediate: true, deep: true });
onBeforeUnmount(() => {
  if (copiedTimeout) clearTimeout(copiedTimeout);
  stopOhlcvJob();
});

const displayedError = computed(() => localError.value || props.error);
const boundRows = computed(() => Object.entries(local.value?.bounds ?? {}).sort(([a], [b]) => a.localeCompare(b)));
const boundSearchText = ref('');
const boundCategoryFilter = ref<'all' | 'long' | 'short' | 'fixed'>('all');

const filteredBoundRows = computed(() => {
  const query = boundSearchText.value.trim().toLowerCase();
  const filter = boundCategoryFilter.value;
  return boundRows.value.filter(([key]) => {
    if (filter === 'long' && !key.startsWith('long') && !key.startsWith('bot.long')) return false;
    if (filter === 'short' && !key.startsWith('short') && !key.startsWith('bot.short')) return false;
    if (filter === 'fixed' && !boundFixed(key)) return false;
    if (query && !key.toLowerCase().includes(query)) return false;
    return true;
  });
});

const boundCounts = computed(() => {
  let longCount = 0;
  let shortCount = 0;
  let fixedCount = 0;
  for (const [key] of boundRows.value) {
    if (key.startsWith('long') || key.startsWith('bot.long')) longCount++;
    if (key.startsWith('short') || key.startsWith('bot.short')) shortCount++;
    if (boundFixed(key)) fixedCount++;
  }
  return { all: boundRows.value.length, long: longCount, short: shortCount, fixed: fixedCount };
});

function splitBoundKey(key: string): { prefix: string; name: string } {
  const parts = key.split('.');
  if (parts.length > 1) {
    return {
      prefix: parts.slice(0, -1).join('.'),
      name: parts[parts.length - 1]!,
    };
  }
  return { prefix: '', name: key };
}

/**
 * Normalize a bounds key to its side-agnostic parameter path so one tip
 * covers long/short and both bound key shapes: PB7 flat `long_<param>`
 * (`short_entry_grid_spacing_pct`) and PB8 nested `long.<path>`
 * (`bot.long.risk.n_positions` after a migration import).
 */
function boundTipBase(key: string): string {
  let k = key.startsWith('bot.') ? key.slice(4) : key;
  if (k.startsWith('long.') || k.startsWith('short.')) return k.slice(k.indexOf('.') + 1);
  if (k.startsWith('long_') || k.startsWith('short_')) return k.slice(k.indexOf('_') + 1);
  return '';
}
function boundTip(key: string): string {
  const base = boundTipBase(key);
  if (!base) return '';
  const tipKey = `v7optimize.tip.bound.${base}`;
  return te(tipKey) ? t(tipKey) : '';
}
const DEFAULT_EXCHANGES = ['binance', 'bitget', 'bybit', 'gateio', 'hyperliquid', 'kucoin', 'okx'] as const;

const availableExchanges = computed(() => {
  const base = props.exchangeOptions && props.exchangeOptions.length > 0
    ? props.exchangeOptions
    : DEFAULT_EXCHANGES;
  const values = new Set([...base, ...(local.value?.exchanges ?? [])]);
  return [...values].map((v) => String(v).trim().toLowerCase()).filter(Boolean).sort();
});
const availableBackends = computed(() => {
  const selected = String(local.value?.optimize.backend || '').trim().toLowerCase();
  const values = new Set([...(props.backendOptions ?? []), selected, 'pymoo', 'deap']
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean));
  return [...values].map((value) => {
    const capability = gpuContractItem(props.backendContract, value);
    const unavailable = !!(capability && capability.available === false);
    return { value, label: value + (unavailable ? ' (unavailable on this host)' : '') };
  });
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
  if (nextBackend === 'gpu') {
    const existingGpu = isObject(local.value.optimize.gpu) ? local.value.optimize.gpu : {};
    local.value.optimize.gpu = { ...gpuDefaults(props.optimizeDefaults), ...existingGpu };
  }
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
/**
 * changeOptimizeStrategyKind (v1.98.36 syncOptimizeOverrideStrategyCompatibility):
 * switching the strategy drops overrides the new kind cannot apply and
 * mirrors the filtered list back into the enable_overrides textarea.
 */
function onStrategyKindChange(value: string): void {
  setText('live', 'strategy_kind', value);
  if (!local.value) return;
  local.value.optimize.enable_overrides = filterOptimizeEnableOverridesForStrategy(local.value.optimize.enable_overrides, value);
  enableOverridesJson.value = json(local.value.optimize.enable_overrides);
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

function isExchangeSelected(exchange: string): boolean {
  if (!local.value?.exchanges) return false;
  const target = exchange.trim().toLowerCase();
  return local.value.exchanges.some((e) => String(e).trim().toLowerCase() === target);
}
function toggleExchange(exchange: string, checked: boolean): void {
  if (!local.value) return;
  const target = exchange.trim().toLowerCase();
  const current = local.value.exchanges.map((e) => String(e).trim().toLowerCase());
  const next = new Set(current);
  if (checked) next.add(target); else next.delete(target);
  local.value.exchanges = [...next];
  exchangeText.value = local.value.exchanges.join(', ');
}
function selectAllExchanges(): void {
  if (!local.value) return;
  local.value.exchanges = [...availableExchanges.value];
  exchangeText.value = local.value.exchanges.join(', ');
}
function clearExchanges(): void {
  if (!local.value) return;
  local.value.exchanges = [];
  exchangeText.value = '';
}
function applyExchangeText(): void {
  if (!local.value) return;
  local.value.exchanges = parseCsv(exchangeText.value);
}

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
  // v1.98.36: apply the strategy filter before save/queue/launch
  local.value.optimize.enable_overrides = filterOptimizeEnableOverridesForStrategy(cloneValue(parsedEnableOverrides), local.value.live.strategy_kind);
  local.value.backtest.coin_sources = parseJsonObject(coinSourcesJson.value, 'Coin sources');
  local.value.runtimeOverrides = parseJsonObject(runtimeJson.value, 'Runtime overrides');
  local.value.overrideConfigs = parseJsonObject(overrideJson.value, 'Override configs');
  applySeedState();
  applyAdditionalJsonParams();
  if (props.version === 'v8') {
    local.value.optimize.objective_scenario = objectiveScenarioMode.value === 'named' ? objectiveScenarioName.value.trim() : null;
  }
  cleanupOptimizeBackendFields(local.value.optimize);
  if (props.version === 'v8') {
    local.value.optimize.gpu = normalizeGpuSettings(local.value.optimize.gpu, gpuDefaults(props.optimizeDefaults), true);
  }
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

const copiedRaw = ref(false);
let copiedTimeout: ReturnType<typeof setTimeout> | null = null;
async function copyRawJson(): Promise<void> {
  if (!rawJson.value) return;
  try {
    await navigator.clipboard.writeText(rawJson.value);
    copiedRaw.value = true;
    if (copiedTimeout) clearTimeout(copiedTimeout);
    copiedTimeout = setTimeout(() => {
      copiedRaw.value = false;
    }, 2000);
  } catch {}
}
const rawLineCount = computed(() => {
  if (!rawJson.value) return 0;
  return rawJson.value.split('\n').length;
});
const rawByteSize = computed(() => {
  if (!rawJson.value) return '0 B';
  const bytes = new Blob([rawJson.value]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
});

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
    suiteEditor.value?.foldDraft();
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
    suiteEditor.value?.foldDraft();
    applyTextSections();
    emit('preflight', cloneValue(local.value));
  } catch (error) {
    localError.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<template>
  <div v-if="open && local" class="fixed inset-0 z-[1000] grid place-items-center bg-backdrop p-4 max-[600px]:p-0">
    <section class="opt-editor-modal flex w-[min(1240px,96vw)] h-[min(88vh,860px)] h-[min(88dvh,860px)] flex-col overflow-hidden rounded-xl border border-border-default bg-panel shadow-[var(--shadow-modal)] max-[600px]:h-full max-[600px]:max-h-full max-[600px]:rounded-none" role="dialog" aria-modal="true" aria-labelledby="opt-editor-title">
      <header class="opt-editor-header flex shrink-0 items-center justify-between gap-4 border-b border-border-default bg-surface-deep/40 px-5 py-2.5 max-[600px]:px-3.5">
        <div class="flex min-w-0 items-center gap-3">
          <div class="opt-editor-header__icon" aria-hidden="true"><PbIcon :icon="PhGear" :size="17" /></div>
          <div class="min-w-0 flex items-center gap-2.5">
            <h2 id="opt-editor-title" class="m-0 truncate text-[15px] font-bold tracking-tight text-primary">{{ t('v7optimize.editOptimize') }}</h2>
            <span class="opt-editor-version">{{ version.toUpperCase() }}</span>
            <span class="hidden md:inline-block text-[13px] text-secondary/80 border-l border-border-default/60 pl-2.5 ml-0.5 truncate">{{ t('v7optimize.editorDescription') }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Button type="button" variant="default" size="sm" class="h-8.5 gap-1.5 text-[13px] font-medium shrink-0" data-action="preflight" @click="preflight">{{ t('v7optimize.ohlcvReadiness') }}</Button>
          <Button type="button" variant="ghost" size="sm" class="size-8 p-0 text-secondary hover:text-primary transition-colors" :title="t('common.close')" :aria-label="t('common.close')" @click="emit('close')"><PbIcon :icon="PhX" :size="17" /></Button>
        </div>
      </header>
      <nav class="opt-editor-tabs flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border-default/80 bg-surface-deep/50 px-5 py-2 max-[600px]:px-3" :aria-label="t('v7optimize.editorNavigation')">
        <button v-for="item in tabs" :key="item.id" type="button" :data-tab="item.id" :class="{ active: tab === item.id }" @click="tab = item.id">{{ t(item.label) }}</button>
      </nav>
      <div ref="contentEl" class="opt-editor-content flex flex-1 min-h-0 flex-col overflow-y-auto p-5 max-[600px]:p-4">
        <section v-if="tab === 'general'" class="opt-tab-panel opt-editor-general grid gap-4">
          <div class="opt-editor-section">
            <div class="opt-editor-section__heading">
              <div class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5 min-w-0">
                <h3>{{ t('v7optimize.editorIdentitySection') }}</h3>
                <p>{{ t('v7optimize.editorIdentityHint') }}</p>
              </div>
            </div>
            <div class="opt-editor-fields opt-editor-fields--identity grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-12">
              <label class="opt-editor-field sm:col-span-5">
                <span :data-tip="t('v7optimize.tip.configName')">{{ t('v7optimize.configName') }}</span>
                <Input v-model="local.name" class="h-9 text-[13.5px]" />
              </label>
              <label class="opt-editor-field sm:col-span-4 max-[600px]:col-span-full">
                <span :data-tip="t('v7optimize.tip.start_date')">start_date</span>
                <template v-if="version === 'v8'">
                  <div class="flex min-w-0 items-center gap-1.5" data-test="ohlcv-start-date-controls">
                    <Input type="date" class="min-w-0 flex-1 h-9 text-[13.5px] tabular-nums" :model-value="String(local.backtest.start_date || '')" @update:model-value="setText('backtest', 'start_date', String($event ?? ''))" />
                    <Button type="button" variant="default" size="sm" class="h-9 px-2.5 text-xs font-semibold" data-test="ohlcv-start-first" :disabled="!!ohlcvJob" @click="startOhlcvDateLookup('earliest')">1st</Button>
                    <Button type="button" variant="default" size="sm" class="h-9 px-2.5 text-xs font-semibold" data-test="ohlcv-start-all" :disabled="!!ohlcvJob" @click="startOhlcvDateLookup('all_markets')">All</Button>
                  </div>
                  <div v-if="ohlcvJob" class="mt-1.5 grid gap-1" data-test="ohlcv-start-progress" role="status" aria-live="polite">
                    <div class="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div class="h-full bg-accent transition-[width]" :style="{ width: `${Math.max(0, Math.min(100, Number(ohlcvJob.progress?.percent || 0)))}%` }"></div>
                    </div>
                    <div class="flex items-center justify-between gap-2 text-xs text-secondary">
                      <span>{{ ohlcvJob.progress?.message || t('v7optimize.ohlcvStartDateWorking') }}</span>
                      <Button type="button" variant="danger" size="sm" class="h-7 px-2 text-xs" data-test="ohlcv-start-stop" :disabled="ohlcvJob.status === 'stopping'" @click="stopOhlcvJob">{{ t('v7optimize.ohlcvStartDateStop') }}</Button>
                    </div>
                  </div>
                  <small v-if="ohlcvError" class="text-xs text-danger-soft" data-test="ohlcv-start-error">{{ ohlcvError }}</small>
                </template>
                <Input v-else type="date" class="h-9 text-[13.5px] tabular-nums" :model-value="String(local.backtest.start_date || '')" @update:model-value="setText('backtest', 'start_date', String($event ?? ''))" />
              </label>
              <label class="opt-editor-field sm:col-span-3 max-[600px]:col-span-full">
                <span :data-tip="t('v7optimize.tip.end_date')">end_date</span>
                <div class="flex min-w-0 items-center gap-1.5">
                  <Input type="date" class="min-w-0 flex-1 h-9 text-[13.5px] tabular-nums" :model-value="String(local.backtest.end_date || '')" @update:model-value="setText('backtest', 'end_date', String($event ?? ''))" />
                  <Button type="button" variant="default" size="sm" class="h-9 px-2.5 text-xs font-semibold" :title="t('v7optimize.nowDate')" @click="setText('backtest', 'end_date', new Date().toISOString().slice(0, 10))">Now</Button>
                </div>
              </label>
            </div>
          </div>

          <div class="opt-editor-section">
            <div class="opt-editor-section__heading">
              <div class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5 min-w-0">
                <h3>{{ t('v7optimize.editorDataSection') }}</h3>
                <p>{{ t('v7optimize.editorDataHint') }}</p>
              </div>
            </div>
            <div class="opt-editor-fields">
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.starting_balance')">starting_balance</span>
                <Input type="number" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('backtest', 'starting_balance', 1000)" @update:model-value="setNumber('backtest', 'starting_balance', String($event ?? ''))" />
              </label>
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.candle_interval_minutes')">candle_interval_minutes</span>
                <Input type="number" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('backtest', 'candle_interval_minutes', 60)" @update:model-value="setNumber('backtest', 'candle_interval_minutes', String($event ?? ''))" />
              </label>
              <label class="opt-editor-field" data-field="btc-collateral-cap">
                <span :data-tip="t('v7optimize.tip.btc_collateral_cap')">btc_collateral_cap</span>
                <Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('backtest', 'btc_collateral_cap', 0)" @update:model-value="setNumber('backtest', 'btc_collateral_cap', String($event ?? ''))" />
              </label>
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.btc_collateral_ltv_cap')">btc_collateral_ltv_cap</span>
                <Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('backtest', 'btc_collateral_ltv_cap', 0)" @update:model-value="setNumber('backtest', 'btc_collateral_ltv_cap', String($event ?? ''))" />
              </label>
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.hsl_signal_mode')">hsl_signal_mode</span>
                <SelectRoot :model-value="String(local.live.hsl_signal_mode || '')" @update:model-value="setText('live', 'hsl_signal_mode', String($event))">
                  <SelectTrigger aria-label="hsl_signal_mode" class="h-9 text-[13.5px]">
                    <span>{{ String(local.live.hsl_signal_mode || '') }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="mode in availableHslModes" :key="mode" :value="mode">{{ mode }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </label>
              <label v-if="version === 'v8'" class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.strategy_kind')">strategy_kind</span>
                <SelectRoot :model-value="String(local.live.strategy_kind || '')" @update:model-value="onStrategyKindChange(String($event))">
                  <SelectTrigger aria-label="strategy_kind" class="h-9 text-[13.5px]">
                    <span>{{ String(local.live.strategy_kind || '') }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="strategy in availableStrategies" :key="strategy" :value="strategy">{{ strategy }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </label>
              <label class="opt-editor-field" :class="version === 'v8' ? 'opt-editor-field--wide col-span-2' : 'opt-editor-field--wide col-span-3'">
                <span :data-tip="t('v7optimize.tip.ohlcv_source_dir')">ohlcv_source_dir</span>
                <div class="flex min-w-0 items-center gap-2">
                  <Input class="min-w-0 flex-1 h-9 text-[13px] font-mono" :model-value="String(local.backtest.ohlcv_source_dir || '')" @update:model-value="setText('backtest', 'ohlcv_source_dir', String($event ?? ''))" />
                  <Button type="button" variant="default" size="sm" class="size-9 p-0 text-secondary hover:text-primary shrink-0" :title="t('v7optimize.clearPath')" :aria-label="t('v7optimize.clearPath')" @click="setText('backtest', 'ohlcv_source_dir', '')"><PbIcon :icon="PhX" :size="16" /></Button>
                  <Button type="button" variant="default" size="sm" class="h-9 shrink-0 text-xs font-medium" v-if="pbguiDataPath" @click="setText('backtest', 'ohlcv_source_dir', pbguiDataPath)">{{ t('v7optimize.pbguiData') }}</Button>
                </div>
              </label>
            </div>
          </div>

          <div class="opt-editor-section">
            <div class="opt-editor-section__heading">
              <div class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5 min-w-0">
                <h3>{{ t('v7optimize.editorMarketsSection') }}</h3>
                <p>{{ t('v7optimize.editorMarketsHint') }}</p>
              </div>
            </div>
            <div class="opt-editor-fields">
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.market_cap')">market_cap</span>
                <Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('pbgui', 'market_cap', 0)" @update:model-value="setNumber('pbgui', 'market_cap', String($event ?? ''))" />
              </label>
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.vol_mcap')">vol_mcap</span>
                <Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('pbgui', 'vol_mcap', 0)" @update:model-value="setNumber('pbgui', 'vol_mcap', String($event ?? ''))" />
              </label>
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.minimum_coin_age_days')">minimum_coin_age_days</span>
                <Input type="number" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('live', 'minimum_coin_age_days', 0)" @update:model-value="setNumber('live', 'minimum_coin_age_days', String($event ?? ''))" />
              </label>
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.tags')">tags</span>
                <Input v-model="tagsText" class="h-9 text-[13.5px]" placeholder="e.g. layer1, defi" />
              </label>
              <div class="col-span-2 max-[600px]:col-span-full">
                <label class="flex h-9 items-center gap-2.5 rounded-lg border border-border-default/70 bg-surface-deep/40 px-3 cursor-pointer select-none transition-colors hover:border-border-default hover:bg-surface-deep">
                  <Checkbox :model-value="booleanField('pbgui', 'only_cpt')" @update:model-value="setBoolean('pbgui', 'only_cpt', ($event === true))" />
                  <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.only_cpt')">only_cpt</span>
                </label>
              </div>
              <div class="col-span-2 max-[600px]:col-span-full">
                <label class="flex h-9 items-center gap-2.5 rounded-lg border border-border-default/70 bg-surface-deep/40 px-3 cursor-pointer select-none transition-colors hover:border-border-default hover:bg-surface-deep">
                  <Checkbox :model-value="booleanField('pbgui', 'notices_ignore')" @update:model-value="setBoolean('pbgui', 'notices_ignore', ($event === true))" />
                  <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.notices_ignore')">notices_ignore</span>
                </label>
              </div>
              <div class="col-span-4 max-[900px]:col-span-2 max-[600px]:col-span-1 flex flex-col gap-2.5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-[13px] font-semibold text-primary" :data-tip="t('v7optimize.tip.exchanges')">exchanges</span>
                    <span class="rounded bg-accent/10 px-2 py-0.5 text-xs font-mono font-medium text-accent">
                      {{ local.exchanges.length }} / {{ availableExchanges.length }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <button type="button" class="text-[13px] text-accent hover:underline cursor-pointer font-medium" @click="selectAllExchanges">{{ t('v7optimize.selectAll') }}</button>
                    <span class="text-secondary/40">•</span>
                    <button type="button" class="text-[13px] text-secondary hover:text-primary cursor-pointer font-medium" @click="clearExchanges">{{ t('v7optimize.deselectAll') }}</button>
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-2 rounded-lg border border-border-default/70 bg-surface-deep/40 p-3 w-full">
                  <label
                    v-for="exchange in availableExchanges"
                    :key="exchange"
                    class="flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] cursor-pointer select-none transition-all border shadow-2xs"
                    :class="isExchangeSelected(exchange) ? 'bg-accent/15 border-accent/40 text-accent-soft font-semibold' : 'bg-surface-deep/60 border-border-default/60 text-secondary hover:text-primary hover:border-border-default'"
                  >
                    <Checkbox
                      :model-value="isExchangeSelected(exchange)"
                      @update:model-value="toggleExchange(exchange, ($event === true))"
                    />
                    <span>{{ exchange }}</span>
                  </label>
                </div>
                <Input
                  v-model="exchangeText"
                  class="h-9 w-full text-[13px] font-mono"
                  @blur="applyExchangeText"
                  @change="applyExchangeText"
                  @keydown.enter="applyExchangeText"
                  placeholder="binance, bybit, bitget..."
                />
              </div>
            </div>
          </div>

          <div class="opt-editor-section">
            <div class="opt-editor-section__heading">
              <div class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5 min-w-0">
                <h3>{{ t('v7optimize.editorCoinsSection') }}</h3>
                <p>{{ t('v7optimize.editorCoinsHint') }}</p>
              </div>
            </div>
            <div class="opt-editor-fields">
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.approved_coins.long')">approved_coins.long</span>
                <Input v-model="approvedLongText" class="h-9 text-[13px] font-mono" placeholder="BTC, ETH, SOL..." />
              </label>
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.approved_coins.short')">approved_coins.short</span>
                <Input v-model="approvedShortText" class="h-9 text-[13px] font-mono" placeholder="BTC, ETH, SOL..." />
              </label>
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.ignored_coins.long')">ignored_coins.long</span>
                <Input v-model="ignoredLongText" class="h-9 text-[13px] font-mono" placeholder="DOGE, SHIB..." />
              </label>
              <label class="opt-editor-field">
                <span :data-tip="t('v7optimize.tip.ignored_coins.short')">ignored_coins.short</span>
                <Input v-model="ignoredShortText" class="h-9 text-[13px] font-mono" placeholder="DOGE, SHIB..." />
              </label>
              <label class="opt-editor-field col-span-4 max-[900px]:col-span-2 max-[600px]:col-span-1">
                <span :data-tip="t('v7optimize.tip.coin_sources')">coin_sources</span>
                <Textarea v-model="coinSourcesJson" class="min-h-[100px] text-[13px] font-mono" placeholder="{}" />
              </label>
            </div>
          </div>
        </section>

        <section v-else-if="tab === 'bot-long'" class="opt-tab-panel flex min-h-0 flex-col gap-3">
          <div class="rounded-xl border border-border-default/80 bg-card/60 p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between border-b border-border-default/60 pb-2">
              <span class="text-[13.5px] font-semibold text-primary">{{ t('v7optimize.botCoreSettings') }}</span>
              <span class="rounded bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-soft">Long Side</span>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3 items-end">
              <label class="grid gap-1.5 text-xs text-secondary">
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.total_wallet_exposure_limit')">total_wallet_exposure_limit</span>
                <Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="botNumber('long', 'twe', 1)" @update:model-value="setBotNumber('long', 'twe', String($event ?? ''))" />
              </label>
              <label class="grid gap-1.5 text-xs text-secondary">
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.n_positions')">n_positions</span>
                <Input type="number" step="1" class="h-9 text-[13.5px] tabular-nums" :model-value="botNumber('long', 'npos', 1)" @update:model-value="setBotNumber('long', 'npos', String($event ?? ''))" />
              </label>
              <label class="flex h-9 items-center gap-2 rounded-lg border border-border-default/70 bg-surface-deep/40 px-3 cursor-pointer select-none transition-colors hover:border-border-default hover:bg-surface-deep">
                <Checkbox :model-value="botBoolean('long', 'hsl')" @update:model-value="setBotBoolean('long', 'hsl', ($event === true))" />
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.hsl_enabled')">hsl_enabled</span>
              </label>
            </div>
          </div>
          <BotJsonEditor v-model="botLongJson" label="Bot long JSON" :status="(paramStatus?.long as Record<string, unknown> | undefined) || {}" />
        </section>

        <section v-else-if="tab === 'bot-short'" class="opt-tab-panel flex min-h-0 flex-col gap-3">
          <div class="rounded-xl border border-border-default/80 bg-card/60 p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between border-b border-border-default/60 pb-2">
              <span class="text-[13.5px] font-semibold text-primary">{{ t('v7optimize.botCoreSettings') }}</span>
              <span class="rounded bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-soft">Short Side</span>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3 items-end">
              <label class="grid gap-1.5 text-xs text-secondary">
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.total_wallet_exposure_limit')">total_wallet_exposure_limit</span>
                <Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="botNumber('short', 'twe', 0)" @update:model-value="setBotNumber('short', 'twe', String($event ?? ''))" />
              </label>
              <label class="grid gap-1.5 text-xs text-secondary">
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.n_positions')">n_positions</span>
                <Input type="number" step="1" class="h-9 text-[13.5px] tabular-nums" :model-value="botNumber('short', 'npos', 0)" @update:model-value="setBotNumber('short', 'npos', String($event ?? ''))" />
              </label>
              <label class="flex h-9 items-center gap-2 rounded-lg border border-border-default/70 bg-surface-deep/40 px-3 cursor-pointer select-none transition-colors hover:border-border-default hover:bg-surface-deep">
                <Checkbox :model-value="botBoolean('short', 'hsl')" @update:model-value="setBotBoolean('short', 'hsl', ($event === true))" />
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.hsl_enabled')">hsl_enabled</span>
              </label>
            </div>
          </div>
          <BotJsonEditor v-model="botShortJson" label="Bot short JSON" :status="(paramStatus?.short as Record<string, unknown> | undefined) || {}" />
        </section>

        <section v-else-if="tab === 'bounds'" class="opt-tab-panel flex flex-col gap-3">
          <!-- Toolbar: Search + Category Filters + Add Bound -->
          <div class="flex flex-col gap-2.5 rounded-xl border border-border-default/80 bg-card/60 p-3 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-2.5">
              <!-- Search Input -->
              <div class="relative min-w-[200px] flex-1">
                <PbIcon :icon="PhMagnifyingGlass" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" :size="15" />
                <Input
                  v-model="boundSearchText"
                  class="h-8.5 pl-8.5 text-[13px] placeholder:text-placeholder"
                  :placeholder="t('v7optimize.searchBoundsPlaceholder')"
                />
                <button
                  v-if="boundSearchText"
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-secondary hover:text-primary"
                  @click="boundSearchText = ''"
                >
                  <PbIcon :icon="PhX" :size="13" />
                </button>
              </div>

              <!-- Add Bound Quick Input -->
              <div class="flex items-center gap-1.5 min-w-[260px] flex-1">
                <Input
                  v-model="newBoundKey"
                  list="bot-params-datalist"
                  class="h-8.5 flex-1 text-[13px] font-mono placeholder:text-placeholder"
                  placeholder="e.g. long.total_wallet_exposure_limit"
                  @keydown.enter.prevent="addBound"
                />
                <datalist id="bot-params-datalist">
                  <option v-for="param in (props.botParams || [])" :key="param" :value="param" />
                </datalist>
                <Button
                  type="button"
                  variant="info"
                  size="sm"
                  class="h-8.5 gap-1 shrink-0 text-[13px] font-medium"
                  data-test="add-bound"
                  @click="addBound"
                >
                  <PbIcon :icon="PhPlus" :size="14" />
                  {{ t('editor.suite.add') }}
                </Button>
              </div>
            </div>

            <!-- Filter Pills / Badges -->
            <div class="flex flex-wrap items-center gap-1.5 border-t border-border-default/50 pt-2 text-[12.5px]">
              <span class="text-xs font-medium text-secondary mr-1">Filter:</span>
              <button
                type="button"
                data-test="bound-filter-all"
                class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors cursor-pointer"
                :class="boundCategoryFilter === 'all' ? 'border-accent/45 bg-accent/15 text-accent-soft font-semibold shadow-2xs' : 'border-border-default/40 bg-surface-deep/50 text-secondary hover:border-accent/40 hover:text-accent-soft hover:bg-surface-deep'"
                @click="boundCategoryFilter = 'all'"
              >
                <span>{{ t('v7optimize.filterAll') }}</span>
                <span class="rounded bg-elevated/90 px-1.5 py-0.2 text-[11px] font-mono tabular-nums leading-none">{{ boundCounts.all }}</span>
              </button>

              <button
                type="button"
                data-test="bound-filter-long"
                class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors cursor-pointer"
                :class="boundCategoryFilter === 'long' ? 'border-success/45 bg-success/15 text-success-soft font-semibold shadow-2xs' : 'border-border-default/40 bg-surface-deep/50 text-secondary hover:border-success/40 hover:text-success-soft hover:bg-surface-deep'"
                @click="boundCategoryFilter = 'long'"
              >
                <span>{{ t('v7optimize.filterLong') }}</span>
                <span class="rounded bg-elevated/90 px-1.5 py-0.2 text-[11px] font-mono tabular-nums leading-none">{{ boundCounts.long }}</span>
              </button>

              <button
                type="button"
                data-test="bound-filter-short"
                class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors cursor-pointer"
                :class="boundCategoryFilter === 'short' ? 'border-danger/45 bg-danger/15 text-danger-soft font-semibold shadow-2xs' : 'border-border-default/40 bg-surface-deep/50 text-secondary hover:border-danger/40 hover:text-danger-soft hover:bg-surface-deep'"
                @click="boundCategoryFilter = 'short'"
              >
                <span>{{ t('v7optimize.filterShort') }}</span>
                <span class="rounded bg-elevated/90 px-1.5 py-0.2 text-[11px] font-mono tabular-nums leading-none">{{ boundCounts.short }}</span>
              </button>

              <button
                type="button"
                data-test="bound-filter-fixed"
                class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors cursor-pointer"
                :class="boundCategoryFilter === 'fixed' ? 'border-warning/45 bg-warning/15 text-warning-soft font-semibold shadow-2xs' : 'border-border-default/40 bg-surface-deep/50 text-secondary hover:border-warning/40 hover:text-warning-soft hover:bg-surface-deep'"
                @click="boundCategoryFilter = 'fixed'"
              >
                <span>{{ t('v7optimize.filterFixed') }}</span>
                <span class="rounded bg-elevated/90 px-1.5 py-0.2 text-[11px] font-mono tabular-nums leading-none">{{ boundCounts.fixed }}</span>
              </button>

              <span v-if="filteredBoundRows.length !== boundRows.length" class="ml-auto text-xs text-secondary">
                Showing {{ filteredBoundRows.length }} / {{ boundRows.length }}
              </span>
            </div>
          </div>

          <!-- Table Container -->
          <div class="overflow-hidden rounded-xl border border-border-default/80 bg-card/40 shadow-sm">
            <!-- Sticky Table Header -->
            <div class="grid grid-cols-[minmax(180px,1.5fr)_minmax(140px,1fr)_minmax(80px,0.6fr)_80px_48px] items-center gap-3 border-b border-border-default bg-surface-deep/80 px-3.5 py-2 text-xs font-semibold text-secondary">
              <div :data-tip="t('v7optimize.tip.boundsParam')">{{ t('v7optimize.boundsTableHeaderParam') }}</div>
              <div :data-tip="t('v7optimize.tip.boundsRange')">{{ t('v7optimize.boundsTableHeaderRange') }}</div>
              <div :data-tip="t('v7optimize.tip.boundsStep')">{{ t('v7optimize.boundsTableHeaderStep') }}</div>
              <div class="text-center" :data-tip="t('v7optimize.tip.boundsFixed')">{{ t('v7optimize.boundsTableHeaderFixed') }}</div>
              <div class="text-right">{{ t('v7optimize.boundsTableHeaderActions') }}</div>
            </div>

            <!-- Table Rows -->
            <div class="max-h-[500px] overflow-y-auto divide-y divide-border-default/40">
              <div
                v-for="[key, pair] in filteredBoundRows"
                :key="key"
                class="grid grid-cols-[minmax(180px,1.5fr)_minmax(140px,1fr)_minmax(80px,0.6fr)_80px_48px] items-center gap-3 px-3.5 py-2 transition-colors hover:bg-surface-deep/50"
              >
                <!-- Parameter Column -->
                <div class="min-w-0 flex flex-col justify-center">
                  <div v-if="splitBoundKey(key).prefix" class="truncate text-[11px] font-mono text-secondary">
                    {{ splitBoundKey(key).prefix }}.
                  </div>
                  <code class="truncate text-[13px] font-mono font-medium text-primary" :data-tip="boundTip(key) || undefined" :title="boundTip(key) ? undefined : key">
                    {{ splitBoundKey(key).name }}
                  </code>
                </div>

                <!-- Range Column (Min → Max) -->
                <div class="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="any"
                    class="h-8 text-[13px] font-mono tabular-nums w-full"
                    placeholder="min"
                    :model-value="pairValue(pair, 0)"
                    @update:model-value="setBoundValue(key, 0, String($event ?? ''))"
                  />
                  <span class="text-secondary text-xs select-none">→</span>
                  <Input
                    type="number"
                    step="any"
                    class="h-8 text-[13px] font-mono tabular-nums w-full"
                    placeholder="max"
                    :model-value="pairValue(pair, 1)"
                    @update:model-value="setBoundValue(key, 1, String($event ?? ''))"
                  />
                </div>

                <!-- Step Column -->
                <div>
                  <Input
                    type="number"
                    step="any"
                    class="h-8 text-[13px] font-mono tabular-nums w-full"
                    :data-field="`bound-step-${key}`"
                    :model-value="pairValue(pair, 2)"
                    placeholder="step"
                    @update:model-value="setBoundValue(key, 2, String($event ?? ''))"
                  />
                </div>

                <!-- Fixed Column -->
                <div class="flex justify-center">
                  <label class="flex items-center justify-center p-1 cursor-pointer select-none">
                    <Checkbox
                      :data-field="`bound-fixed-${key}`"
                      :model-value="boundFixed(key)"
                      @update:model-value="setBoundFixed(key, ($event === true))"
                    />
                  </label>
                </div>

                <!-- Action Column -->
                <div class="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="size-8 p-0 text-secondary hover:bg-danger/15 hover:text-danger-soft transition-colors"
                    :title="t('common.delete')"
                    :aria-label="t('common.delete')"
                    @click="deleteBound(key)"
                  >
                    <PbIcon :icon="PhX" :size="15" />
                  </Button>
                </div>
              </div>

              <div v-if="!filteredBoundRows.length" class="py-10 text-center text-xs text-secondary">
                {{ boundSearchText ? t('v7optimize.noMatchingBounds') : t('v7optimize.noEntries') }}
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="tab === 'optimizer'" class="opt-tab-panel grid grid-cols-[repeat(4,minmax(0,1fr))] gap-3.5 max-[600px]:grid-cols-1 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))]">
          <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.backend')">backend</span><SelectRoot :model-value="currentBackend" @update:model-value="switchOptimizeBackend(String($event))"><SelectTrigger data-field="optimizer-backend" aria-label="backend" class="h-9 text-[13.5px]"><span>{{ currentBackend }}</span></SelectTrigger><SelectContent><SelectItem v-for="item in availableBackends" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent></SelectRoot></label>
          <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.iters')">iters</span><Input type="number" min="1" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'iters', 100000)" @update:model-value="setNumber('optimize', 'iters', String($event ?? ''))" /></label>
          <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.n_cpus')">n_cpus</span><Input type="number" min="1" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'n_cpus', 1)" @update:model-value="setNumber('optimize', 'n_cpus', String($event ?? ''))" /></label>
          <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pareto_max_size')">pareto_max_size</span><Input type="number" min="1" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'pareto_max_size', 100)" @update:model-value="setNumber('optimize', 'pareto_max_size', String($event ?? ''))" /></label>
          <label v-if="version === 'v7'" class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.max_pending_starting_evals_per_cpu')">max_pending_starting_evals_per_cpu</span><Input type="number" min="1" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'max_pending_starting_evals_per_cpu', 1)" @update:model-value="setNumber('optimize', 'max_pending_starting_evals_per_cpu', String($event ?? ''))" /></label>
          <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.round_to_n_significant_digits')">round_to_n_significant_digits</span><Input type="number" min="1" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'round_to_n_significant_digits', 5)" @update:model-value="setNumber('optimize', 'round_to_n_significant_digits', String($event ?? ''))" /></label>
          <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.logging_level')">logging_level</span><Input type="number" min="0" max="3" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('logging', 'level', 1)" @update:model-value="setNumber('logging', 'level', String($event ?? ''))" /></label>
          <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.memory_snapshot_interval_minutes')">memory_snapshot_interval_minutes</span><Input type="number" min="0" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('logging', 'memory_snapshot_interval_minutes', 30)" @update:model-value="setNumber('logging', 'memory_snapshot_interval_minutes', String($event ?? ''))" /></label>
          <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.volume_refresh_info_threshold_seconds')">volume_refresh_info_threshold_seconds</span><Input type="number" min="0" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('logging', 'volume_refresh_info_threshold_seconds', 30)" @update:model-value="setNumber('logging', 'volume_refresh_info_threshold_seconds', String($event ?? ''))" /></label>
          <div class="flex items-center gap-2.5 col-span-2">
            <label class="flex h-9 flex-1 items-center gap-2.5 rounded-lg border border-border-default/70 bg-surface-deep/40 px-3 cursor-pointer select-none transition-colors hover:border-border-default hover:bg-surface-deep">
              <Checkbox :model-value="booleanField('optimize', 'compress_results_file')" @update:model-value="setBoolean('optimize', 'compress_results_file', ($event === true))" />
              <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.compress_results_file')">compress_results_file</span>
            </label>
            <label class="flex h-9 flex-1 items-center gap-2.5 rounded-lg border border-border-default/70 bg-surface-deep/40 px-3 cursor-pointer select-none transition-colors hover:border-border-default hover:bg-surface-deep">
              <Checkbox :model-value="booleanField('optimize', 'write_all_results')" @update:model-value="setBoolean('optimize', 'write_all_results', ($event === true))" />
              <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.write_all_results')">write_all_results</span>
            </label>
          </div>
          <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.seed_mode')">seed_mode</span><SelectRoot v-model="seedMode"><SelectTrigger aria-label="seed_mode" class="h-9 text-[13.5px]"><span>{{ seedMode }}</span></SelectTrigger><SelectContent><SelectItem value="none">none</SelectItem><SelectItem value="self">self</SelectItem><SelectItem value="path">path</SelectItem></SelectContent></SelectRoot></label>
          <label v-if="seedMode === 'path'" class="grid gap-1.5 text-xs text-secondary col-span-3 max-[600px]:col-span-1 max-[900px]:col-span-2" data-field="seed-path"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.seed_path')">seed_path</span><Input v-model="seedPath" class="h-9 text-[13px] font-mono" /></label>
          <label v-if="version === 'v8'" class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.rng_seed')">rng_seed</span><Input type="number" min="0" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'seed', 0)" @update:model-value="setNumber('optimize', 'seed', String($event ?? ''))" /></label>
          <GpuSettingsEditor v-if="currentBackend === 'gpu' && version === 'v8'" :gpu="(local.optimize.gpu as JsonObject) || {}" :optimize-defaults="optimizeDefaults || {}" :contract="backendContract" @update:gpu="local.optimize.gpu = $event" />
          <template v-if="currentBackend === 'pymoo'">
            <div class="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-3 max-[600px]:grid-cols-1 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))] col-span-4 max-[600px]:col-span-1 max-[900px]:col-span-2">
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.algorithm')">algorithm</span><SelectRoot :model-value="pymooText('algorithm', 'auto')" @update:model-value="setPymooAlgorithm(String($event))"><SelectTrigger data-field="pymoo-algorithm" aria-label="algorithm" class="h-9 text-[13.5px]"><span>{{ pymooText('algorithm', 'auto') }}</span></SelectTrigger><SelectContent><SelectItem v-for="algorithm in availablePymooAlgorithms" :key="algorithm" :value="algorithm">{{ algorithm }}</SelectItem></SelectContent></SelectRoot></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.effectiveAlgorithm')">{{ t('v7optimize.effectiveAlgorithm') }}</span><Input data-field="pymoo-effective-algorithm" readonly class="h-9 text-[13px] font-mono bg-surface-deep/60" :model-value="effectivePymooAlgorithm" /></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.populationMode')">population mode</span><SelectRoot :model-value="pymooPopulationMode()" @update:model-value="setPymooPopulationMode(String($event))"><SelectTrigger data-field="pymoo-population-mode" aria-label="population mode" class="h-9 text-[13.5px]"><span>{{ pymooPopulationMode() === 'auto' ? 'auto' : 'explicit' }}</span></SelectTrigger><SelectContent><SelectItem value="auto">auto</SelectItem><SelectItem value="value">explicit</SelectItem></SelectContent></SelectRoot></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.populationSize')">population size</span><Input data-field="pymoo-population-size" type="number" min="1" class="h-9 text-[13.5px] tabular-nums" :disabled="pymooPopulationMode() === 'auto'" :model-value="pymooPopulationMode() === 'auto' ? 500 : numberField('optimize', 'population_size', 500)" @update:model-value="setPymooPopulationSize(String($event ?? ''))" /></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.eliminate_duplicates')">eliminate_duplicates</span><SelectRoot :model-value="String(!!getPath(pymooShared(), 'eliminate_duplicates', false))" @update:model-value="setPymooValue('shared.eliminate_duplicates', $event === 'true')"><SelectTrigger data-field="pymoo-eliminate-duplicates" aria-label="eliminate_duplicates" class="h-9 text-[13.5px]"><span>{{ String(!!getPath(pymooShared(), 'eliminate_duplicates', false)) }}</span></SelectTrigger><SelectContent><SelectItem value="false">false</SelectItem><SelectItem value="true">true</SelectItem></SelectContent></SelectRoot></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.crossover_eta')">crossover_eta</span><Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="pymooNumber('shared.crossover_eta', 20)" @update:model-value="setPymooNumber('shared.crossover_eta', String($event ?? ''))" /></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.crossover_prob_var')">crossover_prob_var</span><Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="pymooNumber('shared.crossover_prob_var', 0.5)" @update:model-value="setPymooNumber('shared.crossover_prob_var', String($event ?? ''))" /></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.mutation_eta')">mutation_eta</span><Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="pymooNumber('shared.mutation_eta', 20)" @update:model-value="setPymooNumber('shared.mutation_eta', String($event ?? ''))" /></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.mutationProbMode')">mutation probability mode</span><SelectRoot :model-value="mutationProbabilityMode()" @update:model-value="setMutationProbabilityMode(String($event))"><SelectTrigger data-field="pymoo-mutation-prob-mode" aria-label="mutation probability mode" class="h-9 text-[13.5px]"><span>{{ mutationProbabilityMode() === 'auto' ? 'auto' : 'explicit' }}</span></SelectTrigger><SelectContent><SelectItem value="auto">auto</SelectItem><SelectItem value="value">explicit</SelectItem></SelectContent></SelectRoot></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.mutation_prob_var')">mutation_prob_var</span><Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :disabled="mutationProbabilityMode() === 'auto'" :model-value="mutationProbabilityMode() === 'auto' ? 0 : pymooNumber('shared.mutation_prob_var', 0.1)" @update:model-value="setMutationProbability(String($event ?? ''))" /></label>
            </div>
            <div v-if="effectivePymooAlgorithm === 'nsga3'" class="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-3 max-[600px]:grid-cols-1 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))] col-span-4 max-[600px]:col-span-1 max-[900px]:col-span-2">
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.refDirMethod')">reference direction method</span><SelectRoot :model-value="pymooText('algorithms.nsga3.ref_dirs.method', 'das_dennis')" @update:model-value="setPymooText('algorithms.nsga3.ref_dirs.method', String($event))"><SelectTrigger data-field="pymoo-ref-dir-method" aria-label="reference direction method" class="h-9 text-[13.5px]"><span>{{ pymooText('algorithms.nsga3.ref_dirs.method', 'das_dennis') }}</span></SelectTrigger><SelectContent><SelectItem v-for="method in availablePymooRefDirMethods" :key="method" :value="method">{{ method }}</SelectItem></SelectContent></SelectRoot></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.partitionsMode')">partitions mode</span><SelectRoot :model-value="refDirPartitionsMode()" @update:model-value="setRefDirPartitionsMode(String($event))"><SelectTrigger data-field="pymoo-ref-dir-partitions-mode" aria-label="partitions mode" class="h-9 text-[13.5px]"><span>{{ refDirPartitionsMode() === 'auto' ? 'auto' : 'explicit' }}</span></SelectTrigger><SelectContent><SelectItem value="auto">auto</SelectItem><SelectItem value="value">explicit</SelectItem></SelectContent></SelectRoot></label>
              <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.refPartitions')">reference partitions</span><Input data-field="pymoo-ref-dir-partitions" type="number" min="1" class="h-9 text-[13.5px] tabular-nums" :disabled="refDirPartitionsMode() === 'auto'" :model-value="refDirPartitionsMode() === 'auto' ? 1 : pymooNumber('algorithms.nsga3.ref_dirs.n_partitions', 1)" @update:model-value="setPymooNumber('algorithms.nsga3.ref_dirs.n_partitions', String($event ?? ''))" /></label>
              <span class="text-xs text-secondary flex items-center">{{ t('v7optimize.nsga3ReferenceDirections') }}</span>
            </div>
            <label class="grid gap-1.5 text-xs text-secondary col-span-4 max-[600px]:col-span-1 max-[900px]:col-span-2" data-field="pymoo-json"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.pymoo.json')">pymoo JSON</span><Textarea v-model="pymooJson" class="min-h-[120px] text-[13px] font-mono" /></label>
          </template>
          <template v-if="currentBackend === 'deap'">
            <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.deap.population_size')">population_size</span><Input type="number" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'population_size', 500)" @update:model-value="setNumber('optimize', 'population_size', String($event ?? ''))" /></label>
            <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.deap.crossover_probability')">crossover_probability</span><Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'crossover_probability', 0.7)" @update:model-value="setNumber('optimize', 'crossover_probability', String($event ?? ''))" /></label>
            <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.deap.mutation_probability')">mutation_probability</span><Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'mutation_probability', 0.2)" @update:model-value="setNumber('optimize', 'mutation_probability', String($event ?? ''))" /></label>
            <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.deap.offspring_multiplier')">offspring_multiplier</span><Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'offspring_multiplier', 1)" @update:model-value="setNumber('optimize', 'offspring_multiplier', String($event ?? ''))" /></label>
            <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.deap.crossover_eta')">crossover_eta</span><Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'crossover_eta', 20)" @update:model-value="setNumber('optimize', 'crossover_eta', String($event ?? ''))" /></label>
            <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.deap.mutation_eta')">mutation_eta</span><Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'mutation_eta', 20)" @update:model-value="setNumber('optimize', 'mutation_eta', String($event ?? ''))" /></label>
            <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.deap.mutation_indpb')">mutation_indpb</span><Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="numberField('optimize', 'mutation_indpb', 0.1)" @update:model-value="setNumber('optimize', 'mutation_indpb', String($event ?? ''))" /></label>
          </template>
          <label class="grid gap-1.5 text-xs text-secondary col-span-4 max-[600px]:col-span-1 max-[900px]:col-span-2"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.enable_overrides')">enable_overrides</span><Textarea v-model="enableOverridesJson" class="min-h-[120px] text-[13px] font-mono" data-field="enable-overrides" /></label>
          <div class="flex min-h-0 flex-col gap-2.5 col-span-4 max-[600px]:col-span-1 max-[900px]:col-span-2">
            <div>
              <strong class="text-[13.5px] font-semibold text-primary">{{ t('v7optimize.additionalParameters') }}</strong>
              <p class="text-[12.5px] text-secondary mt-0.5">{{ t('v7optimize.additionalParametersHint') }}</p>
            </div>
            <p v-if="!additionalOptimizeEntries.length" class="text-xs text-secondary">{{ t('v7optimize.noAdditionalParameters') }}</p>
            <div v-else class="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 max-[600px]:grid-cols-1 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))]">
              <label v-for="entry in additionalOptimizeEntries" :key="entry.key" class="grid gap-1.5 text-xs text-secondary" :class="{ 'span-3': entry.type === 'json' }">
                <span class="text-[13px] font-medium text-primary">{{ entry.key }}</span>
                <Checkbox v-if="entry.type === 'boolean'" :data-extra-param="entry.key" :model-value="!!entry.value" @update:model-value="setAdditionalBoolean(entry.key, ($event === true))" />
                <Input v-else-if="entry.type === 'number'" type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :data-extra-param="entry.key" :model-value="(entry.value as number)" @update:model-value="setAdditionalValue(entry.key, String($event ?? ''), entry.type)" />
                <Textarea v-else-if="entry.type === 'json'" class="min-h-[120px] text-[13px] font-mono" :data-extra-param="entry.key" :model-value="additionalParamJson[entry.key]" @update:model-value="setAdditionalJson(entry.key, String($event ?? ''))" />
                <Input v-else type="text" class="h-9 text-[13px] font-mono" :data-extra-param="entry.key" :placeholder="entry.type === 'null' ? 'null' : ''" :model-value="entry.value === null ? '' : String(entry.value)" @update:model-value="setAdditionalValue(entry.key, String($event ?? ''), entry.type)" />
              </label>
            </div>
          </div>
        </section>

        <section v-else-if="tab === 'objectives'" class="opt-tab-panel flex flex-col gap-3.5">
          <div v-if="version === 'v8'" class="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 max-[600px]:grid-cols-1 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))]">
            <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.objectiveScenario')">objective scenario</span><SelectRoot :model-value="objectiveScenarioMode" @update:model-value="setObjectiveScenario(String($event))"><SelectTrigger data-field="objective-scenario" aria-label="objective scenario" class="h-9 text-[13.5px]"><span>{{ objectiveScenarioMode === 'aggregate' ? 'suite aggregate' : 'named scenario' }}</span></SelectTrigger><SelectContent><SelectItem value="aggregate">suite aggregate</SelectItem><SelectItem value="named">named scenario</SelectItem></SelectContent></SelectRoot></label>
            <label v-if="objectiveScenarioMode === 'named'" class="grid gap-1.5 text-xs text-secondary col-span-2 max-[600px]:col-span-1 max-[900px]:col-span-2"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.scenarioLabel')">scenario label</span><Input :model-value="objectiveScenarioName" class="h-9 text-[13.5px]" @update:model-value="setObjectiveScenarioName(String($event ?? ''))" /></label>
          </div>
          <ScoringLimitsEditor :scoring="local.scoring" :limits="local.limits" :scenario-labels="scenarioLabels(local.suite)" :version="version" :metadata="limitsMeta" :backend="currentBackend" :backend-contract="backendContract" @update:scoring="local.scoring = $event; scoringJson = json($event)" @update:limits="local.limits = $event; limitsJson = json($event)" />
          <div class="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 max-[600px]:grid-cols-1 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))]">
            <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.scoringJson')">scoring JSON</span><Textarea v-model="scoringJson" class="min-h-[220px] text-[13px] font-mono" /></label>
            <label class="grid gap-1.5 text-xs text-secondary"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.limitsJson')">limits JSON</span><Textarea v-model="limitsJson" class="min-h-[220px] text-[13px] font-mono" /></label>
            <label class="grid gap-1.5 text-xs text-secondary col-span-2 max-[600px]:col-span-1 max-[900px]:col-span-2"><span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.fixed_params')">fixed_params</span><Input :model-value="local.fixedParams.join(', ')" class="h-9 text-[13px] font-mono" @update:model-value="local.fixedParams = String($event ?? '').split(',').map((v) => v.trim()).filter(Boolean)" /></label>
          </div>
        </section>
        <section v-else-if="tab === 'suite'" class="opt-tab-panel flex min-h-0 flex-1 flex-col gap-3.5">
          <SuiteEditor
            ref="suiteEditor"
            v-model="local.suite"
            :exchanges="availableExchanges"
            :available-coins="availableCoins"
            :bot-params="botParams || []"
            :is-v8="version === 'v8'"
            :exchange-options="availableExchanges"
            :load-symbols="loadSymbols"
            :scenario-generator="version === 'v8'"
            :get-scenario-context="() => currentScenarioContext()"
            :preview-scenario-template="previewScenarioTemplate"
            :on-apply-scenario-preview="(preview) => applyGeneratedScenarioPreview(preview)"
          />
        </section>
        <section v-else-if="tab === 'runtime'" class="opt-tab-panel flex min-h-0 flex-1 flex-col gap-4">
          <!-- Card 1: Fine Tune & Polish (v8 only) -->
          <div v-if="version === 'v8'" class="rounded-xl border border-border-default/80 bg-surface-deep/30 p-4 shadow-xs">
            <div class="mb-3 flex items-center gap-2">
              <div class="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
                <PbIcon :icon="PhSliders" class="h-3.5 w-3.5" />
              </div>
              <h4 class="text-[13px] font-semibold text-primary uppercase tracking-wider">{{ t('v7optimize.fineTunePolishTitle') }}</h4>
              <span class="text-xs text-dim ml-1">{{ t('v7optimize.fineTunePolishDesc') }}</span>
            </div>
            <div class="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3.5 max-[900px]:grid-cols-1">
              <label class="grid gap-1.5 text-xs text-secondary">
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.fine_tune_params')">fine_tune_params</span>
                <Input data-field="fine-tune-params" class="h-9 text-[13px] font-mono" :model-value="fineTuneText" placeholder="long.risk, short.strategy" @update:model-value="setFineTuneText(String($event ?? ''))" />
              </label>
              <label class="grid gap-1.5 text-xs text-secondary">
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.polish_percentage')">polish_percentage (%)</span>
                <Input data-field="polish-percentage" type="number" min="0" max="100" step="0.01" class="h-9 text-[13.5px] tabular-nums" :model-value="polishPercentageText" @update:model-value="setPolishPercentage(String($event ?? ''))" />
              </label>
              <label class="grid gap-1.5 text-xs text-secondary">
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.polish_bounds_mode')">polish_bounds_mode</span>
                <SelectRoot :model-value="polishBoundsMode" @update:model-value="setPolishBoundsMode(String($event))">
                  <SelectTrigger data-field="polish-bounds-mode" aria-label="polish_bounds_mode" class="h-9 text-[13.5px]">
                    <span>{{ polishBoundsMode }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clamp">clamp</SelectItem>
                    <SelectItem value="override-tunable">override-tunable</SelectItem>
                    <SelectItem value="override-all">override-all</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </label>
            </div>
          </div>

          <!-- Card 2: Runtime HSL Settings -->
          <div class="rounded-xl border border-border-default/80 bg-surface-deep/30 p-4 shadow-xs">
            <div class="mb-3 flex items-center gap-2">
              <div class="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
                <PbIcon :icon="PhShieldCheck" class="h-3.5 w-3.5" />
              </div>
              <h4 class="text-[13px] font-semibold text-primary uppercase tracking-wider">{{ t('v7optimize.runtimeHslTitle') }}</h4>
              <span class="text-xs text-dim ml-1">{{ t('v7optimize.runtimeHslDesc') }}</span>
            </div>
            <div class="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
              <!-- Long Side -->
              <div class="flex flex-col gap-2.5 rounded-lg border border-border-default/60 bg-surface-deep/50 p-3">
                <label class="flex h-9 items-center gap-2.5 rounded-lg border border-border-default/70 bg-surface-deep/60 px-3 cursor-pointer select-none transition-colors hover:border-border-default hover:bg-surface">
                  <Checkbox data-field="runtime-bot-long-hsl-enabled" :model-value="!!runtimeOverrideValue('bot.long.hsl_enabled', false)" @update:model-value="setRuntimeOverride('bot.long.hsl_enabled', ($event === true))" />
                  <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.runtime.longHslEnabled')">bot.long.hsl_enabled</span>
                </label>
                <label class="grid gap-1.5 text-xs text-secondary">
                  <span class="text-[12.5px] font-medium text-secondary" :data-tip="t('v7optimize.tip.runtime.longHslThreshold')">bot.long.hsl_no_restart_drawdown_threshold</span>
                  <Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="(runtimeOverrideValue('bot.long.hsl_no_restart_drawdown_threshold', 1) as number)" @update:model-value="setRuntimeOverride('bot.long.hsl_no_restart_drawdown_threshold', Number(String($event ?? '')))" />
                </label>
              </div>
              <!-- Short Side -->
              <div class="flex flex-col gap-2.5 rounded-lg border border-border-default/60 bg-surface-deep/50 p-3">
                <label class="flex h-9 items-center gap-2.5 rounded-lg border border-border-default/70 bg-surface-deep/60 px-3 cursor-pointer select-none transition-colors hover:border-border-default hover:bg-surface">
                  <Checkbox data-field="runtime-bot-short-hsl-enabled" :model-value="!!runtimeOverrideValue('bot.short.hsl_enabled', false)" @update:model-value="setRuntimeOverride('bot.short.hsl_enabled', ($event === true))" />
                  <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.runtime.shortHslEnabled')">bot.short.hsl_enabled</span>
                </label>
                <label class="grid gap-1.5 text-xs text-secondary">
                  <span class="text-[12.5px] font-medium text-secondary" :data-tip="t('v7optimize.tip.runtime.shortHslThreshold')">bot.short.hsl_no_restart_drawdown_threshold</span>
                  <Input type="number" step="any" class="h-9 text-[13.5px] tabular-nums" :model-value="(runtimeOverrideValue('bot.short.hsl_no_restart_drawdown_threshold', 1) as number)" @update:model-value="setRuntimeOverride('bot.short.hsl_no_restart_drawdown_threshold', Number(String($event ?? '')))" />
                </label>
              </div>
            </div>
          </div>

          <!-- Card 3: Runtime & Coin Overrides JSON -->
          <div class="flex flex-1 min-h-[280px] flex-col rounded-xl border border-border-default/80 bg-surface-deep/30 p-4 shadow-xs">
            <div class="mb-3 flex items-center gap-2">
              <div class="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
                <PbIcon :icon="PhCode" class="h-3.5 w-3.5" />
              </div>
              <h4 class="text-[13px] font-semibold text-primary uppercase tracking-wider">{{ t('v7optimize.runtimeOverridesTitle') }}</h4>
              <span class="text-xs text-dim ml-1">{{ t('v7optimize.runtimeOverridesDesc') }}</span>
            </div>
            <div class="grid grid-cols-2 gap-4 flex-1 min-h-0 max-[700px]:grid-cols-1">
              <label class="flex flex-col gap-1.5 text-xs text-secondary flex-1 min-h-0">
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.runtimeOverrides')">runtime overrides</span>
                <Textarea v-model="runtimeJson" class="flex-1 min-h-[180px] w-full text-[13px] font-mono leading-relaxed bg-surface-deep/80 border-border-default/80 focus:border-accent p-3" />
              </label>
              <label class="flex flex-col gap-1.5 text-xs text-secondary flex-1 min-h-0">
                <span class="text-[13px] font-medium text-primary" :data-tip="t('v7optimize.tip.coinOverrideConfigs')">coin override configs</span>
                <Textarea v-model="overrideJson" class="flex-1 min-h-[180px] w-full text-[13px] font-mono leading-relaxed bg-surface-deep/80 border-border-default/80 focus:border-accent p-3" />
              </label>
            </div>
          </div>
        </section>
        <section v-else class="opt-tab-panel flex flex-1 min-h-0 flex-col gap-3">
          <div class="flex flex-1 min-h-0 flex-col rounded-xl border border-border-default/80 bg-surface-deep/40 shadow-xs overflow-hidden">
            <!-- Editor Header Toolbar -->
            <div class="flex shrink-0 items-center justify-between border-b border-border-default/80 bg-surface-deep/80 px-4 py-2.5">
              <div class="flex items-center gap-2.5">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <PbIcon :icon="PhCode" class="h-4 w-4" />
                </div>
                <div class="flex items-baseline gap-2">
                  <span class="text-[14.5px] font-semibold text-primary" :data-tip="t('v7optimize.tip.rawConfigJson')">{{ t('v7optimize.rawConfigJson') }}</span>
                  <span class="rounded bg-surface px-1.5 py-0.5 text-xs font-mono text-secondary">{{ t('v7optimize.rawConfigLines', { count: rawLineCount }) }}</span>
                  <span class="text-xs font-mono text-dim">{{ rawByteSize }}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-8.5 gap-1.5 px-3 text-[13px]"
                  @click="copyRawJson"
                >
                  <PbIcon :icon="copiedRaw ? PhCheck : PhCopy" class="h-3.5 w-3.5" :class="{ 'text-success': copiedRaw }" />
                  <span>{{ copiedRaw ? t('v7optimize.copied') : t('v7optimize.copyJson') }}</span>
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  class="h-8.5 gap-1.5 px-3 text-[13px]"
                  @click="applyRaw"
                >
                  <PbIcon :icon="PhSparkle" class="h-3.5 w-3.5 text-accent" />
                  <span>{{ t('v7optimize.formatJson') }}</span>
                </Button>
              </div>
            </div>
            <!-- Editor Content Area -->
            <div class="flex-1 min-h-0 p-3 flex flex-col">
              <Textarea
                v-model="rawJson"
                class="opt-json flex-1 min-h-0 w-full resize-none font-mono text-[13px] leading-relaxed border-0 bg-surface-deep/60 p-3.5 text-primary placeholder:text-dim focus-visible:ring-1 focus-visible:ring-accent"
                aria-label="Raw config JSON"
                spellcheck="false"
              />
            </div>
            <!-- Editor Footer Tip -->
            <div class="border-t border-border-default/60 bg-surface-deep/40 px-4 py-2 text-xs text-secondary">
              {{ t('v7optimize.rawConfigTip') }}
            </div>
          </div>
        </section>
        <p v-if="displayedError" class="text-danger-soft">{{ displayedError }}</p>
      </div>
      <footer class="opt-editor-footer flex shrink-0 items-center justify-end gap-2.5 border-t border-border-default px-5 py-3.5 max-[600px]:flex-wrap max-[600px]:px-4">
        <Button type="button" variant="default" class="h-9.5 min-w-[104px] text-[13.5px] font-medium" @click="emit('close')">{{ t('common.cancel') }}</Button>
        <Button type="button" variant="info" class="h-9.5 min-w-[104px] text-[13.5px] font-medium" data-save="config" @click="save(false)">{{ t('v7optimize.saveConfig') }}</Button>
        <Button type="button" variant="info" class="h-9.5 min-w-[104px] text-[13.5px] font-medium" data-save="queue" @click="save(true)">{{ t('v7optimize.saveConfigAndQueue') }}</Button>
      </footer>
      <DataTipTooltip />
    </section>
  </div>
</template>

<style scoped>
/* Tab panel fade transition */
.opt-tab-panel {
  animation: tab-fade-in 140ms ease-out;
}

@keyframes tab-fade-in {
  from {
    opacity: 0.82;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* The editor uses a quiet surface ladder so the modal reads as a workspace,
   while the controls remain dense enough for advanced configuration work. */
.opt-editor-header__icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border: 1px solid rgb(var(--accent-rgb) / 0.25);
  border-radius: 8px;
  background: rgb(var(--accent-rgb) / 0.12);
  color: var(--accent);
}

.opt-editor-version {
  border: 1px solid rgb(var(--accent-rgb) / 0.28);
  border-radius: var(--radius-full);
  background: rgb(var(--accent-rgb) / 0.1);
  color: var(--accent-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  white-space: nowrap;
}

.opt-editor-section {
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  background: rgb(var(--bg-panel-rgb) / 0.55);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
}

.opt-editor-section__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgb(var(--text-secondary-rgb) / 0.035);
}

.opt-editor-section__heading h3 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.opt-editor-section__heading h3::before {
  content: '';
  display: inline-block;
  width: 3.5px;
  height: 15px;
  border-radius: var(--radius-full);
  background: var(--accent);
}

.opt-editor-section__heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.4;
}

.opt-editor-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px 14px;
  padding: 18px;
}

.opt-editor-field {
  display: grid;
  min-width: 0;
  gap: 7px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
}

.opt-editor-field span:first-child {
  color: var(--text-primary);
  font-size: 13.5px;
  font-weight: 500;
}

.opt-editor-field--wide { grid-column: span 2; }

.opt-editor-checks {
  display: flex;
  min-height: var(--control-height-md);
  align-items: center;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 13px;
}

.opt-editor-options {
  min-height: var(--control-height-md);
}

.opt-editor-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 500;
  padding: 0 14px;
  white-space: nowrap;
  transition: all var(--motion-fast) var(--ease-standard);
}

.opt-editor-tabs button:hover {
  background: rgb(255 255 255 / 0.05);
  color: var(--text-primary);
}

.opt-editor-tabs button.active {
  background: rgb(var(--accent-rgb) / 0.16);
  border-color: rgb(var(--accent-rgb) / 0.35);
  color: var(--accent-soft);
  font-weight: 600;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
}

.opt-editor-footer :deep(button) { min-width: 104px; }

@media (max-width: 900px) {
  .opt-editor-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 600px) {
  .opt-editor-fields { grid-template-columns: minmax(0, 1fr); padding: 14px; }
  .opt-editor-field--wide,
  .opt-editor-checks { grid-column: auto; }
  .opt-editor-checks { align-items: flex-start; flex-direction: column; gap: 8px; }
  .opt-editor-section__heading { padding: 12px 14px; }
  .opt-editor-footer :deep(button) { flex: 1 1 auto; min-width: 0; }
}
</style>

<style>
/* Document-delegated tooltip layer (DataTipTooltip.vue) for the parameter
   [data-tip] labels — namespaced under .opt-editor-modal so the unscoped
   rules only style the editor's own tip layer. */
.opt-editor-modal #data-tip-tooltip {
  display: none;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 3000;
  max-width: 480px;
  padding: 6px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  background: var(--bg-card);
  box-shadow: var(--shadow-elevated);
  color: var(--text-primary);
  font-size: var(--fs-xs);
  font-weight: normal;
  line-height: 1.5;
  white-space: pre-wrap;
  pointer-events: none;
  will-change: transform;
}

/* Affordance: tipped labels read as help text (same idiom as v7_edit). */
.opt-editor-modal [data-tip] {
  cursor: help;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--text-muted);
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}
</style>
