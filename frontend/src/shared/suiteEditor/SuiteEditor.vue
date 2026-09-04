<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhChartLineUp, PhSparkle, PhSquaresFour, PhStack } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import DatePicker from '@/shared/datepicker/DatePicker.vue';
import KvCoinSources from '@/shared/kvCoinSources/KvCoinSources.vue';
import {
  SUITE_AGG_METRIC_FALLBACKS,
  addSuiteScenario,
  applySuiteTemplate,
  moveSuiteScenario,
  parseOverrideValue,
  removeSuiteScenario,
  resetSuiteToBase,
  splitOverrideKey,
  suiteAggregateMethods,
  suiteAggMetricOptions,
  type ScenarioGeneratorContext,
  type ScenarioGeneratorDraft,
  type ScenarioGeneratorPreview,
  type ScenarioGeneratorRequest,
  type SuiteScenario,
  type SuiteState,
} from './suiteModel';

/**
 * SuiteEditor — the shared Vue port of js/suite_editor.js (975 L), built
 * here (M-v7-9) and reused by the optimize page (M-v7-14). State lives in
 * the parent (v-model SuiteState); this component renders the expander,
 * templates, scenarios table, the scenario editor form (with a local
 * draft committed on Done — the _suiteSaveEditingScenario contract) and
 * the aggregate settings.
 */

const model = defineModel<SuiteState>({ required: true });
const props = withDefaults(
  defineProps<{
    /** suiteInit exchanges (:108-113). */
    exchanges: readonly string[];
    /** Coins from the page multiselects (_suiteAvailableCoins :218-233). */
    availableCoins: readonly string[];
    /** Override parameter keys (bot-params API). */
    botParams?: readonly string[];
    isV8?: boolean;
    /** Exchange options for the scenario coin_sources editor. */
    exchangeOptions?: readonly string[];
    loadSymbols?(exchange: string): Promise<{ symbols: string[]; catalog?: Record<string, string> }>;
    /** Show the PB8-only scenario generator panel. */
    scenarioGenerator?: boolean;
    /** Base dates and exchanges used to build preview requests. */
    scenarioContext?: ScenarioGeneratorContext;
    /** Alternative to scenarioContext for pages with derived form state. */
    getScenarioContext?(): ScenarioGeneratorContext;
    /** Page-owned API callback; the shared editor does not know its URL. */
    previewScenarioTemplate?(request: ScenarioGeneratorRequest): Promise<ScenarioGeneratorPreview>;
    /** Optional page callback for optimizer-specific generated-template effects. */
    onApplyScenarioPreview?(preview: ScenarioGeneratorPreview): void;
  }>(),
  {
    botParams: () => [],
    isV8: false,
    exchangeOptions: () => [],
    loadSymbols: undefined,
    scenarioGenerator: false,
    scenarioContext: undefined,
    getScenarioContext: undefined,
    previewScenarioTemplate: undefined,
    onApplyScenarioPreview: undefined,
  }
);

const emit = defineEmits<{
  'template-exchanges': [exchanges: string[]];
  'apply-scenario-preview': [preview: ScenarioGeneratorPreview];
}>();

const { t } = useI18n();

function openScenarioGeneratorGuide(): void {
  window.location.href = '/api/help/main_page?topic=43_pbv8_optimize#scenario-generator';
}

const TEMPLATE_NAMES = ['Exchange Comparison', 'Date Windows', 'TWE Sensitivity', 'n_positions Sensitivity'] as const;

interface ScenarioDraft {
  label: string;
  startDate: string;
  endDate: string;
  exchanges: string[];
  coins: string[];
  ignoredCoins: string[];
  coinSources: Record<string, string>;
  overrides: Record<string, unknown>;
}

const draft = ref<ScenarioDraft | null>(null);
let internalUpdate = false;

const DEFAULT_SCENARIO_GENERATOR_DRAFT: ScenarioGeneratorDraft = {
  template: 'rolling_windows',
  window_days: 90,
  stride_days: 30,
  training_windows: 4,
  holdout_windows: 0,
  exchange_mode: 'inherit',
  auto_windows: false,
};
const scenarioGeneratorDraft = ref<ScenarioGeneratorDraft>({ ...DEFAULT_SCENARIO_GENERATOR_DRAFT });
const scenarioPreview = ref<ScenarioGeneratorPreview | null>(null);
const scenarioPreviewContextSignature = ref('');
let scenarioRequestGeneration = 0;

/* The expander folds independently of the enabled flag: the toggle
   lives in the header, so unchecking keeps the card (and the toggle)
   visible instead of collapsing the whole editor away. */
const open = ref(model.value.enabled);

const editing = computed(() => model.value.enabled && model.value.editIdx >= 0 && draft.value !== null);

function emptyDraft(scenario: SuiteScenario): ScenarioDraft {
  return {
    label: String(scenario.label ?? ''),
    startDate: String(scenario.start_date ?? ''),
    endDate: String(scenario.end_date ?? ''),
    exchanges: Array.isArray(scenario.exchanges) ? scenario.exchanges.slice() : [],
    coins: Array.isArray(scenario.coins) ? scenario.coins.slice() : [],
    ignoredCoins: Array.isArray(scenario.ignored_coins) ? scenario.ignored_coins.slice() : [],
    coinSources: { ...(scenario.coin_sources ?? {}) },
    overrides: { ...(scenario.overrides ?? {}) },
  };
}

/**
 * Reloads the scenario draft. Takes the state explicitly on post-commit
 * paths: defineModel reads lag one write until the parent echoes the prop,
 * so `model.value` right after commit() would still hold the prior state
 * under a live v-model parent.
 */
function loadDraft(source: SuiteState = model.value): void {
  const idx = source.editIdx;
  draft.value = idx >= 0 && source.scenarios[idx] ? emptyDraft(source.scenarios[idx]!) : null;
}

function commit(next: SuiteState): void {
  internalUpdate = true;
  model.value = next;
  void Promise.resolve().then(() => {
    internalUpdate = false;
  });
}

/** _suiteSaveEditingScenario (:801-852) — fold the draft back in, dropping empties. */
function saveEditing(next: SuiteState): SuiteState {
  if (draft.value === null || next.editIdx < 0 || !next.scenarios[next.editIdx]) return next;
  const d = draft.value;
  const scenario: SuiteScenario = { label: d.label.trim() || 'unnamed' };
  if (d.startDate.trim()) scenario.start_date = d.startDate.trim();
  if (d.endDate.trim()) scenario.end_date = d.endDate.trim();
  if (d.exchanges.length > 0) scenario.exchanges = d.exchanges.slice();
  if (d.coins.length > 0) scenario.coins = d.coins.slice();
  if (d.ignoredCoins.length > 0) scenario.ignored_coins = d.ignoredCoins.slice();
  if (Object.keys(d.coinSources).length > 0) scenario.coin_sources = { ...d.coinSources };
  if (Object.keys(d.overrides).length > 0) scenario.overrides = { ...d.overrides };
  const scenarios = next.scenarios.slice();
  scenarios[next.editIdx] = scenario;
  const changed = { ...next, scenarios };
  delete changed.scenarioTemplate;
  return changed;
}

watch(
  () => model.value,
  () => {
    if (internalUpdate) return;
    loadDraft();
  },
  { immediate: true, deep: true }
);

/* ── enable toggle (:508-516) ── */
function toggleEnabled(on: boolean): void {
  let next = saveEditing(model.value);
  const scenarios = on && next.scenarios.length === 0 ? [{ label: 'base' }] : next.scenarios;
  const committed = { ...next, enabled: on, scenarios };
  if (!on) delete committed.scenarioTemplate;
  commit(committed);
  loadDraft(committed);
  if (on) open.value = true;
}

/* ── templates (:518-546) ── */
function applyTemplate(name: string): void {
  const next = applySuiteTemplate(saveEditing(model.value), name, props.isV8);
  const needed: string[] = [];
  for (const scenario of next.scenarios) {
    for (const exchange of scenario.exchanges ?? []) if (!needed.includes(exchange)) needed.push(exchange);
  }
  commit(next);
  loadDraft(next);
  emit('template-exchanges', needed);
}

function resetToBase(): void {
  const next = resetSuiteToBase(saveEditing(model.value));
  commit(next);
  loadDraft(next);
}

/* ── scenario CRUD (:611-647) ── */
function addScenario(): void {
  const next = addSuiteScenario(saveEditing(model.value));
  commit(next);
  loadDraft(next);
}

function editScenario(idx: number): void {
  const next = saveEditing(model.value);
  const committed = { ...next, editIdx: next.editIdx === idx ? -1 : idx };
  commit(committed);
  loadDraft(committed);
}

function removeScenario(idx: number): void {
  const next = removeSuiteScenario(saveEditing(model.value), idx);
  commit(next);
  loadDraft(next);
}

function moveScenario(idx: number, dir: number): void {
  const next = moveSuiteScenario(saveEditing(model.value), idx, dir);
  commit(next);
  loadDraft(next);
}

function done(): void {
  const folded = saveEditing(model.value);
  const closed = { ...folded, editIdx: -1 };
  commit(folded);
  commit(closed);
  loadDraft(closed);
}

/**
 * foldDraft — suiteCollect's auto-save (:183-184): the legacy collector
 * called _suiteSaveEditingScenario() whenever a scenario was open, so
 * Save/Save&Queue/raw-JSON sync always committed in-progress edits. The
 * page calls this hook right before collectConfig (:4769).
 */
function foldDraft(): void {
  if (model.value.editIdx < 0 || draft.value === null) return;
  commit(saveEditing(model.value));
}

defineExpose({ foldDraft });

/* ── override editing (:698-798) ── */
const overrideRowOpen = ref(false);
const overrideSide = ref('long');
const overrideParam = ref(props.botParams[0] ?? '');
const overrideValue = ref('');

function addOverride(): void {
  if (!overrideParam.value || overrideValue.value.trim() === '') {
    return;
  }
  if (draft.value === null) return;
  const key = 'bot.' + overrideSide.value + '.' + overrideParam.value;
  draft.value.overrides = { ...draft.value.overrides, [key]: parseOverrideValue(overrideValue.value.trim()) };
  overrideValue.value = '';
  overrideRowOpen.value = false;
  commit(saveEditing(model.value));
}

function removeOverride(key: string): void {
  if (draft.value === null) return;
  const overrides = { ...draft.value.overrides };
  delete overrides[key];
  draft.value.overrides = overrides;
  const next = { ...draft.value.overrides };
  const scenarioOverride = Object.keys(next).length > 0 ? next : undefined;
  const state = saveEditing(model.value);
  const scenarios = state.scenarios.slice();
  if (state.editIdx >= 0 && scenarios[state.editIdx]) {
    const scenario = { ...scenarios[state.editIdx]! };
    if (scenarioOverride) scenario.overrides = scenarioOverride;
    else delete scenario.overrides;
    scenarios[state.editIdx] = scenario;
  }
  commit({ ...state, scenarios });
}

function setOverrideValue(key: string, raw: string): void {
  if (draft.value === null) return;
  draft.value.overrides = { ...draft.value.overrides, [key]: parseOverrideValue(raw.trim()) };
}

const overrideEntries = computed(() => Object.entries(draft.value?.overrides ?? {}));

/* ── aggregate (:861-953) ── */
const aggregateKeys = computed(() => Object.keys(model.value.aggregate).filter((key) => key !== 'default'));
const aggregateMetricOptions = computed(() => suiteAggMetricOptions(SUITE_AGG_METRIC_FALLBACKS, aggregateKeys.value));
const aggregateMethods = computed(() => suiteAggregateMethods(props.isV8));
const aggregateAddOpen = ref(false);
const aggregateMetric = ref('');
const aggregateMethod = ref('max');

function setAggregateDefault(value: string): void {
  const next = { ...model.value, aggregate: { ...model.value.aggregate, default: value } };
  delete next.scenarioTemplate;
  commit(next);
}

function setAggregateMetric(key: string, value: string): void {
  const next = { ...model.value, aggregate: { ...model.value.aggregate, [key]: value } };
  delete next.scenarioTemplate;
  commit(next);
}

function removeAggregateMetric(key: string): void {
  const aggregate = { ...model.value.aggregate };
  delete aggregate[key];
  const next = { ...model.value, aggregate };
  delete next.scenarioTemplate;
  commit(next);
}

function addAggregateMetric(): void {
  if (!aggregateMetric.value) return;
  setAggregateMetric(aggregateMetric.value, aggregateMethod.value);
  aggregateAddOpen.value = false;
}

function currentScenarioContext(): ScenarioGeneratorContext {
  const context = props.getScenarioContext ? props.getScenarioContext() : props.scenarioContext;
  return {
    start_date: context?.start_date ?? null,
    end_date: context?.end_date ?? null,
    exchanges: Array.isArray(context?.exchanges) ? context.exchanges.map(String) : [],
    starting_balance: context?.starting_balance ?? null,
  };
}

watch(
  () => currentScenarioContext().starting_balance,
  (value) => {
    if (scenarioGeneratorDraft.value.starting_balance !== undefined) return;
    const balance = Number(value);
    scenarioGeneratorDraft.value.starting_balance = Number.isFinite(balance) && balance >= 1 ? balance : 1000;
  },
  { immediate: true }
);

function scenarioContextSignature(context: ScenarioGeneratorContext): string {
  return JSON.stringify({
    start_date: context.start_date ?? null,
    end_date: context.end_date ?? null,
    exchanges: Array.isArray(context.exchanges) ? context.exchanges : [],
    starting_balance: context.starting_balance ?? null,
  });
}

function scenarioGeneratorRequest(): ScenarioGeneratorRequest {
  const context = currentScenarioContext();
  const draftValue = scenarioGeneratorDraft.value;
  return {
    ...JSON.parse(JSON.stringify(draftValue)) as ScenarioGeneratorDraft,
    start_date: context.start_date ?? null,
    end_date: context.end_date ?? null,
    exchanges: [...(context.exchanges ?? [])],
    starting_balance: draftValue.starting_balance ?? context.starting_balance ?? null,
  };
}

function recalculateScenarioGenerator(): void {
  scenarioPreview.value = null;
  scenarioPreviewContextSignature.value = '';
  scenarioRequestGeneration += 1;
  const context = currentScenarioContext();
  const template = scenarioGeneratorDraft.value.template;
  const windowDays = Math.max(1, Number(scenarioGeneratorDraft.value.window_days) || 1);
  let strideDays = Math.max(1, Number(scenarioGeneratorDraft.value.stride_days) || 1);
  const holdoutWindows = template === 'rolling_windows'
    ? 0
    : Math.max(0, Number(scenarioGeneratorDraft.value.holdout_windows) || 0);

  scenarioGeneratorDraft.value.window_days = windowDays;
  scenarioGeneratorDraft.value.holdout_windows = holdoutWindows;
  if (template === 'sweep_cycles') {
    const contextBalance = Number(context.starting_balance);
    const defaultBalance = Number.isFinite(contextBalance) && contextBalance >= 1 ? contextBalance : 1000;
    const multiplier = Number(scenarioGeneratorDraft.value.balance_multiplier);
    const startingBalance = Number(scenarioGeneratorDraft.value.starting_balance);
    const refillCost = Number(scenarioGeneratorDraft.value.refill_cost);
    const cooldownDays = Number(scenarioGeneratorDraft.value.cooldown_days);
    scenarioGeneratorDraft.value.balance_multiplier = Number.isFinite(multiplier) && multiplier >= 1.01 && multiplier <= 100 ? multiplier : 2;
    scenarioGeneratorDraft.value.starting_balance = Number.isFinite(contextBalance) && contextBalance >= 1
      ? contextBalance
      : (Number.isFinite(startingBalance) && startingBalance >= 1 ? startingBalance : defaultBalance);
    scenarioGeneratorDraft.value.refill_cost = Number.isFinite(refillCost) && refillCost >= 0 ? refillCost : 0;
    scenarioGeneratorDraft.value.cooldown_days = Number.isFinite(cooldownDays) && cooldownDays >= 0 ? cooldownDays : 0;
    strideDays = windowDays + scenarioGeneratorDraft.value.cooldown_days;
  }
  scenarioGeneratorDraft.value.stride_days = strideDays;

  const start = Date.parse(`${context.start_date ?? ''}T00:00:00Z`);
  const end = Date.parse(`${context.end_date ?? ''}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    scenarioGeneratorError.value = t('editor.suite.generatorInvalidContext');
    return;
  }
  const availableDays = Math.floor((end - start) / 86400000) + 1;
  const totalWindows = availableDays < windowDays ? 0 : 1 + Math.floor((availableDays - windowDays) / strideDays);
  let trainingWindows = Math.max(0, totalWindows - holdoutWindows);
  if (template !== 'sweep_cycles') {
    trainingWindows = Math.min(48, trainingWindows);
    if (scenarioGeneratorDraft.value.exchange_mode === 'per_exchange') {
      const exchangeCount = Math.max(1, context.exchanges?.length ?? 0);
      trainingWindows = Math.min(trainingWindows, Math.max(0, Math.floor(64 / exchangeCount) - holdoutWindows));
    }
  }
  scenarioGeneratorDraft.value.training_windows = trainingWindows;
  if (trainingWindows < 1) scenarioGeneratorError.value = t('editor.suite.generatorNoTrainingWindow');
}

async function previewScenarioGenerator(): Promise<void> {
  if (!props.previewScenarioTemplate) return;
  recalculateScenarioGenerator();
  // Consume the watcher-triggered invalidation from internal Sweep
  // recalculation before capturing this request's generation token.
  await nextTick();
  const request = scenarioGeneratorRequest();
  const contextSignature = scenarioContextSignature(currentScenarioContext());
  const requestGeneration = ++scenarioRequestGeneration;
  try {
    const preview = await props.previewScenarioTemplate(request);
    if (requestGeneration !== scenarioRequestGeneration) return;
    scenarioPreview.value = JSON.parse(JSON.stringify(preview)) as ScenarioGeneratorPreview;
    scenarioPreviewContextSignature.value = contextSignature;
  } catch {
    if (requestGeneration !== scenarioRequestGeneration) return;
    scenarioPreview.value = null;
    scenarioPreviewContextSignature.value = '';
    scenarioGeneratorError.value = 'Scenario preview failed.';
  }
}

function applyScenarioPreview(): void {
  const preview = scenarioPreview.value;
  if (!preview || !Array.isArray(preview.training_scenarios)) return;
  if (scenarioContextSignature(currentScenarioContext()) !== scenarioPreviewContextSignature.value) {
    scenarioGeneratorError.value = t('editor.suite.generatorContextChanged');
    return;
  }
  const next: SuiteState = {
    ...model.value,
    enabled: true,
    scenarios: JSON.parse(JSON.stringify(preview.training_scenarios)) as SuiteScenario[],
    aggregate: JSON.parse(JSON.stringify(preview.reducer ?? { default: 'mean' })) as Record<string, string>,
    editIdx: -1,
    scenarioTemplate: preview.provenance ? JSON.parse(JSON.stringify(preview.provenance)) as Record<string, unknown> : undefined,
  };
  commit(next);
  emit('apply-scenario-preview', preview);
  props.onApplyScenarioPreview?.(preview);
}

const scenarioGeneratorError = ref('');

watch(
  () => scenarioGeneratorDraft.value,
  () => {
    scenarioPreview.value = null;
    scenarioPreviewContextSignature.value = '';
    scenarioGeneratorError.value = '';
    scenarioRequestGeneration += 1;
  },
  { deep: true }
);

watch(
  () => scenarioContextSignature(currentScenarioContext()),
  () => {
    scenarioGeneratorError.value = '';
    scenarioRequestGeneration += 1;
  }
);

onUnmounted(() => {
  scenarioRequestGeneration += 1;
});

/* ── scenario summary (:597-609) ── */
function summary(scenario: SuiteScenario): string {
  const parts: string[] = [];
  if (scenario.exchanges?.length) parts.push(t('editor.suite.summaryEx', { ex: scenario.exchanges.join(',') }));
  if (scenario.start_date || scenario.end_date) parts.push(`${scenario.start_date || '...'} → ${scenario.end_date || '...'}`);
  if (scenario.coins?.length) parts.push(t('editor.suite.summaryCoins', { n: scenario.coins.length }));
  if (scenario.ignored_coins?.length) parts.push(t('editor.suite.summaryIgnored', { n: scenario.ignored_coins.length }));
  if (scenario.coin_sources && Object.keys(scenario.coin_sources).length) parts.push(t('editor.suite.summaryCoinSrc', { n: Object.keys(scenario.coin_sources).length }));
  if (scenario.overrides && Object.keys(scenario.overrides).length) parts.push(t('editor.suite.summaryOverrides', { n: Object.keys(scenario.overrides).length }));
  return parts.length > 0 ? parts.join(' | ') : t('editor.suite.baseConfig');
}

function toggleDraftExchange(exchange: string, on: boolean): void {
  if (draft.value === null) return;
  draft.value.exchanges = on ? [...draft.value.exchanges, exchange] : draft.value.exchanges.filter((e) => e !== exchange);
}

function toggleDraftCoin(list: 'coins' | 'ignoredCoins', coin: string): void {
  if (draft.value === null) return;
  const current = draft.value[list];
  draft.value[list] = current.includes(coin) ? current.filter((c) => c !== coin) : [...current, coin];
}

function draftCoinOptions(list: 'coins' | 'ignoredCoins'): string[] {
  if (draft.value === null) return [];
  const options = [...props.availableCoins];
  for (const coin of draft.value[list]) if (!options.includes(coin)) options.push(coin);
  return options.sort();
}
</script>

<template>
  <div class="expander" :class="{ open }" data-test="suite-expander">
    <div class="expander-header" data-test="suite-header" @click="open = !open">
      <span class="arrow">▶</span> {{ t('editor.suite.mode') }}
      <span v-if="model.enabled" style="color: var(--green); font-size: var(--fs-xs); margin-left: 6px">
        {{ t('editor.suite.enabled') }} ({{ t('editor.suite.scenario', { n: model.scenarios.length, s: model.scenarios.length !== 1 ? 's' : '' }) }})
      </span>
      <div class="chk-row" style="margin-left: auto; min-height: 0; padding: 0; border: 0; background: none" @click.stop>
        <Checkbox id="suite-enabled" :model-value="model.enabled" :data-tip="t('editor.suite.enableModeTip')" @update:model-value="toggleEnabled($event === true)" />
        <label for="suite-enabled">{{ t('editor.suite.enableMode') }}</label>
      </div>
    </div>
    <div class="expander-body">
      <div v-if="!model.enabled" class="mb-4 flex flex-col gap-4 rounded-xl border border-border-default/80 bg-surface-deep/40 p-5 shadow-xs">
        <div class="flex items-start gap-3.5">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
            <PbIcon :icon="PhStack" class="h-5 w-5" />
          </div>
          <div class="flex flex-1 flex-col gap-1">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-semibold text-primary">{{ t('editor.suite.heroTitle') }}</h3>
              <span class="rounded bg-surface px-1.5 py-0.5 text-[10.5px] font-medium text-dim">{{ t('editor.suite.mode') }}</span>
            </div>
            <p class="text-xs leading-relaxed text-secondary">{{ t('editor.suite.heroSubtitle') }}</p>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3 max-[850px]:grid-cols-1">
          <div class="flex flex-col gap-1.5 rounded-lg border border-border-default/60 bg-surface-deep/50 p-3 transition-colors hover:border-border-default hover:bg-surface-deep/80">
            <div class="flex items-center gap-2">
              <div class="flex h-5 w-5 items-center justify-center rounded bg-info/10 text-info">
                <PbIcon :icon="PhSquaresFour" class="h-3 w-3" />
              </div>
              <span class="text-xs font-semibold text-primary">{{ t('editor.suite.featureExchanges') }}</span>
            </div>
            <p class="text-[11.5px] leading-relaxed text-secondary">{{ t('editor.suite.featureExchangesDesc') }}</p>
          </div>

          <div class="flex flex-col gap-1.5 rounded-lg border border-border-default/60 bg-surface-deep/50 p-3 transition-colors hover:border-border-default hover:bg-surface-deep/80">
            <div class="flex items-center gap-2">
              <div class="flex h-5 w-5 items-center justify-center rounded bg-success/10 text-success">
                <PbIcon :icon="PhChartLineUp" class="h-3 w-3" />
              </div>
              <span class="text-xs font-semibold text-primary">{{ t('editor.suite.featureWindows') }}</span>
            </div>
            <p class="text-[11.5px] leading-relaxed text-secondary">{{ t('editor.suite.featureWindowsDesc') }}</p>
          </div>

          <div class="flex flex-col gap-1.5 rounded-lg border border-border-default/60 bg-surface-deep/50 p-3 transition-colors hover:border-border-default hover:bg-surface-deep/80">
            <div class="flex items-center gap-2">
              <div class="flex h-5 w-5 items-center justify-center rounded bg-warning/10 text-warning">
                <PbIcon :icon="PhSparkle" class="h-3 w-3" />
              </div>
              <span class="text-xs font-semibold text-primary">{{ t('editor.suite.featureAggregates') }}</span>
            </div>
            <p class="text-[11.5px] leading-relaxed text-secondary">{{ t('editor.suite.featureAggregatesDesc') }}</p>
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-border-default/60 pt-3.5 max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-2.5">
          <span class="text-xs text-dim">{{ t('editor.suite.disabledHint') }}</span>
          <Button
            type="button"
            variant="info"
            size="sm"
            class="h-8 gap-1.5 px-3.5 text-xs font-medium"
            @click="toggleEnabled(true)"
          >
            <PbIcon :icon="PhStack" class="h-3.5 w-3.5" />
            <span>{{ t('editor.suite.enableMode') }}</span>
          </Button>
        </div>
      </div>

      <template>
        <div v-if="model.enabled" style="display: flex; gap: var(--sp-sm); flex-wrap: wrap; margin-bottom: var(--sp-md)">
          <span style="font-size: var(--fs-xs); color: var(--text-dim); align-self: center">{{ t('editor.suite.templates') }}:</span>
          <Button
            v-for="name in TEMPLATE_NAMES"
            :key="name"
            type="button"
            variant="outline"
            size="sm"
            class="act-btn"
            :data-test="'suite-template-' + name"
            @click="applyTemplate(name)"
          >
            {{ t('editor.suite.template' + (name === 'Exchange Comparison' ? 'ExchangeComparison' : name === 'Date Windows' ? 'DateWindows' : name === 'TWE Sensitivity' ? 'TweSensitivity' : 'NposSensitivity')) }}
          </Button>
          <Button type="button" variant="warning" size="sm" class="act-btn" data-test="suite-reset" :title="t('editor.suite.resetToBaseTitle')" @click="resetToBase">
            {{ t('editor.suite.resetToBase') }}
          </Button>
        </div>

        <section v-if="isV8 && scenarioGenerator" data-test="suite-scenario-generator" style="border: 1px solid var(--border); border-radius: 6px; padding: var(--sp-md); margin-bottom: var(--sp-md); background: rgb(var(--accent-rgb) / 0.035)">
          <div style="display: flex; align-items: start; justify-content: space-between; gap: var(--sp-md); margin-bottom: var(--sp-sm)">
            <div>
              <strong>{{ t('editor.suite.generatorTitle') }}</strong>
              <div style="font-size: var(--fs-xs); color: var(--text-dim); margin-top: 2px">
                {{ t('editor.suite.generatorBaseDates', { start: currentScenarioContext().start_date || t('editor.suite.generatorUnset'), end: currentScenarioContext().end_date || t('editor.suite.generatorUnset') }) }}
              </div>
            </div>
            <div style="display: flex; gap: var(--sp-xs)">
              <Button type="button" variant="outline" size="sm" class="act-btn" data-test="suite-generator-guide" @click="openScenarioGeneratorGuide">{{ t('editor.suite.generatorGuide') }}</Button>
              <Button type="button" variant="outline" size="sm" class="act-btn" data-test="suite-generator-recalculate" @click="recalculateScenarioGenerator">{{ t('editor.suite.generatorRecalculate') }}</Button>
              <Button type="button" variant="outline" size="sm" class="act-btn" data-test="suite-generator-preview" :disabled="!previewScenarioTemplate" @click="previewScenarioGenerator">{{ t('editor.suite.generatorPreview') }}</Button>
            </div>
          </div>

          <div class="form-row cols-4">
            <div class="form-group">
              <label>{{ t('editor.suite.generatorTemplate') }}</label>
              <select v-model="scenarioGeneratorDraft.template" data-test="suite-generator-template" class="form-input">
                <option value="rolling_windows">{{ t('editor.suite.generatorRollingWindows') }}</option>
                <option value="walk_forward">{{ t('editor.suite.generatorWalkForward') }}</option>
                <option value="sweep_cycles">{{ t('editor.suite.generatorSweepCycles') }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>{{ t('editor.suite.generatorWindowDays') }}</label>
              <Input v-model.number="scenarioGeneratorDraft.window_days" type="number" min="1" max="3650" data-test="suite-generator-window" />
            </div>
            <div class="form-group">
              <label>{{ t('editor.suite.generatorStrideDays') }}</label>
              <Input v-model.number="scenarioGeneratorDraft.stride_days" type="number" min="1" max="3650" :readonly="scenarioGeneratorDraft.template === 'sweep_cycles'" data-test="suite-generator-stride" />
            </div>
            <div class="form-group">
              <label>{{ t('editor.suite.generatorTrainingWindows') }}</label>
              <Input v-model.number="scenarioGeneratorDraft.training_windows" type="number" min="1" max="48" :readonly="scenarioGeneratorDraft.template === 'sweep_cycles'" data-test="suite-generator-training" />
            </div>
            <div v-if="scenarioGeneratorDraft.template !== 'rolling_windows'" class="form-group">
              <label>{{ t('editor.suite.generatorHoldoutWindows') }}</label>
              <Input v-model.number="scenarioGeneratorDraft.holdout_windows" type="number" min="0" max="16" data-test="suite-generator-holdout" />
            </div>
            <div class="form-group">
              <label>{{ t('editor.suite.generatorExchangeMode') }}</label>
              <select v-model="scenarioGeneratorDraft.exchange_mode" data-test="suite-generator-exchange-mode" class="form-input">
                <option value="inherit">{{ t('editor.suite.generatorInheritBase') }}</option>
                <option value="per_exchange">{{ t('editor.suite.generatorPerExchange') }}</option>
              </select>
            </div>
            <template v-if="scenarioGeneratorDraft.template === 'sweep_cycles'">
              <div class="form-group"><label>{{ t('editor.suite.generatorBalanceMultiplier') }}</label><Input v-model.number="scenarioGeneratorDraft.balance_multiplier" type="number" min="1.01" max="100" step="0.01" data-test="suite-generator-multiplier" /></div>
              <div class="form-group"><label>{{ t('editor.suite.generatorStartingBalance') }}</label><Input v-model.number="scenarioGeneratorDraft.starting_balance" type="number" min="1" data-test="suite-generator-balance" /></div>
              <div class="form-group"><label>{{ t('editor.suite.generatorRefillCost') }}</label><Input v-model.number="scenarioGeneratorDraft.refill_cost" type="number" min="0" data-test="suite-generator-refill" /></div>
              <div class="form-group"><label>{{ t('editor.suite.generatorCooldownDays') }}</label><Input v-model.number="scenarioGeneratorDraft.cooldown_days" type="number" min="0" max="3650" data-test="suite-generator-cooldown" /></div>
            </template>
          </div>

          <div v-if="scenarioGeneratorError" style="font-size: var(--fs-sm); color: var(--orange); margin-top: var(--sp-xs)" data-test="suite-generator-error">{{ scenarioGeneratorError }}</div>
          <div v-if="scenarioPreview" style="margin-top: var(--sp-md); padding-top: var(--sp-sm); border-top: 1px solid var(--border)" data-test="suite-generator-preview-result">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--sp-md); margin-bottom: var(--sp-sm)">
              <strong>{{ t('editor.suite.generatorPreviewSummary', { training: scenarioPreview.training_scenarios.length, holdout: scenarioPreview.holdout_scenarios.length }) }}</strong>
              <Button type="button" variant="outline" size="sm" class="act-btn" data-test="suite-generator-apply" @click="applyScenarioPreview">{{ t('editor.suite.generatorApply') }}</Button>
            </div>
            <div style="max-height: 190px; overflow: auto">
              <table class="tbl" style="font-size: var(--fs-sm)">
                <thead><tr><th>{{ t('editor.suite.generatorUse') }}</th><th>{{ t('editor.suite.label') }}</th><th>{{ t('editor.suite.generatorPeriod') }}</th></tr></thead>
                <tbody>
                  <tr v-for="scenario in scenarioPreview.training_scenarios" :key="'training-' + scenario.label"><td>{{ t('editor.suite.generatorTrain') }}</td><td>{{ scenario.label }}</td><td>{{ scenario.start_date }} {{ t('editor.suite.generatorTo') }} {{ scenario.end_date }}</td></tr>
                  <tr v-for="scenario in scenarioPreview.holdout_scenarios" :key="'holdout-' + scenario.label"><td>{{ t('editor.suite.generatorHoldout') }}</td><td>{{ scenario.label }}</td><td>{{ scenario.start_date }} {{ t('editor.suite.generatorTo') }} {{ scenario.end_date }}</td></tr>
                </tbody>
              </table>
            </div>
            <div v-for="warning in scenarioPreview.warnings || []" :key="warning" style="font-size: var(--fs-sm); line-height: 1.45; color: var(--orange); margin-top: 4px">{{ warning }}</div>
          </div>
        </section>

        <div v-if="model.enabled">
        <div style="margin-bottom: var(--sp-md)">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-sm)">
            <span style="font-size: var(--fs-sm); font-weight: 600">{{ t('editor.suite.scenariosCount', { n: model.scenarios.length }) }}</span>
            <Button type="button" variant="outline" size="sm" class="act-btn" data-test="suite-add-scenario" @click="addScenario">{{ t('editor.suite.addScenario') }}</Button>
          </div>

          <div v-if="model.scenarios.length === 0" style="color: var(--text-dim); font-size: var(--fs-sm); padding: var(--sp-sm)">
            {{ t('editor.suite.noScenarios') }}
          </div>
          <table v-else class="tbl" style="font-size: var(--fs-sm)">
            <thead>
              <tr>
                <th style="width: 30%">{{ t('editor.suite.label') }}</th>
                <th>{{ t('editor.suite.details') }}</th>
                <th style="width: 140px">{{ t('editor.suite.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(scenario, i) in model.scenarios" :key="i" :style="model.editIdx === i ? 'background: rgb(var(--accent-rgb) / .06)' : ''">
                <td style="font-weight: 600">{{ scenario.label || t('editor.suite.unnamed') }}</td>
                <td><span style="color: var(--text-dim); font-size: var(--fs-xs)">{{ summary(scenario) }}</span></td>
                <td>
                  <Button type="button" variant="outline" size="sm" class="act-btn" :data-test="'suite-edit-' + i" @click="editScenario(i)">{{ model.editIdx === i ? t('editor.suite.editing') : t('editor.suite.edit') }}</Button>
                  <Button type="button" variant="danger" size="sm" class="act-btn act-btn-danger" :data-test="'suite-remove'" @click="removeScenario(i)">×</Button>
                  <Button v-if="i > 0" type="button" variant="outline" size="sm" class="act-btn" :data-test="'suite-move-up-' + i" :title="t('editor.suite.moveUp')" @click="moveScenario(i, -1)">↑</Button>
                  <Button v-if="i < model.scenarios.length - 1" type="button" variant="outline" size="sm" class="act-btn" :data-test="'suite-move-down-' + i" :title="t('editor.suite.moveDown')" @click="moveScenario(i, 1)">↓</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="editing && draft" style="border: 1px solid var(--accent); border-radius: 6px; padding: var(--sp-md); margin-bottom: var(--sp-md); background: rgb(var(--accent-rgb) / 0.03)">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-sm)">
            <span style="font-size: var(--fs-sm); font-weight: 600; color: var(--accent)">{{ t('editor.suite.editScenario', { label: draft.label }) }}</span>
            <Button type="button" variant="outline" size="sm" class="act-btn" data-test="suite-done" @click="done">{{ t('editor.suite.done') }}</Button>
          </div>

          <div class="form-row cols-4">
            <div class="form-group">
              <label><span :data-tip="t('editor.suite.labelTip')">label</span></label>
              <Input v-model="draft.label" type="text" data-test="suite-sc-label" />
            </div>
            <div class="form-group">
              <label><span :data-tip="t('editor.suite.startDateTip')">start_date</span></label>
              <DatePicker v-model="draft.startDate" placeholder="e.g. 2023-01-01" :max="draft.endDate || undefined" />
            </div>
            <div class="form-group">
              <label><span :data-tip="t('editor.suite.endDateTip')">end_date</span></label>
              <DatePicker v-model="draft.endDate" placeholder="e.g. now" :min="draft.startDate || undefined" />
            </div>
          </div>

          <div class="form-group" style="margin-bottom: var(--sp-md)">
            <label><span :data-tip="t('editor.suite.exchangesTip')">exchanges</span></label>
            <div style="display: flex; gap: var(--sp-md); flex-wrap: wrap">
              <div v-for="exchange in exchanges" :key="exchange" class="chk-row">
                <Checkbox
                  :id="'suite-sc-ex-' + exchange"
                  :data-test="'suite-sc-ex-' + exchange"
                  :model-value="draft.exchanges.includes(exchange)"
                  @update:model-value="toggleDraftExchange(exchange, $event === true)"
                />
                <label :for="'suite-sc-ex-' + exchange">{{ exchange }}</label>
              </div>
            </div>
          </div>

          <div class="form-row cols-2">
            <div class="form-group">
              <label><span :data-tip="t('editor.suite.coinsTip')">coins</span></label>
              <div class="ms-wrap">
                <span v-for="coin in draft.coins" :key="coin" class="ms-tag">{{ coin }} <span class="ms-x" @click="toggleDraftCoin('coins', coin)">×</span></span>
                <!-- ui-migration: blocked — chrome-free chip-row filter input inside the custom
                     multi-select dropdown (same precedent as coin_data TagMultiselect). -->
                <input class="ms-input" :placeholder="t('editor.suite.typeToSearch')" @keydown.enter.prevent="draftCoinOptions('coins').length ? toggleDraftCoin('coins', draftCoinOptions('coins').find((c) => !draft!.coins.includes(c))!) : undefined" />
                <div class="ms-dropdown open" style="position: static; max-height: 160px">
                  <div v-for="coin in draftCoinOptions('coins')" :key="coin" class="ms-option" :class="{ selected: draft.coins.includes(coin) }" @mousedown.prevent="toggleDraftCoin('coins', coin)">{{ coin }}</div>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label><span :data-tip="t('editor.suite.ignoredCoinsTip')">ignored_coins</span></label>
              <div class="ms-wrap">
                <span v-for="coin in draft.ignoredCoins" :key="coin" class="ms-tag">{{ coin }} <span class="ms-x" @click="toggleDraftCoin('ignoredCoins', coin)">×</span></span>
                <!-- ui-migration: blocked — chrome-free chip-row filter input inside the custom
                     multi-select dropdown (same precedent as coin_data TagMultiselect). -->
                <input class="ms-input" :placeholder="t('editor.suite.typeToSearch')" />
                <div class="ms-dropdown open" style="position: static; max-height: 160px">
                  <div v-for="coin in draftCoinOptions('ignoredCoins')" :key="coin" class="ms-option" :class="{ selected: draft.ignoredCoins.includes(coin) }" @mousedown.prevent="toggleDraftCoin('ignoredCoins', coin)">{{ coin }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="expander open" style="margin-top: var(--sp-sm)">
            <div class="expander-header"><span class="arrow">▶</span> {{ t('editor.suite.coinSourcesCount', { n: Object.keys(draft.coinSources).length }) }}</div>
            <div class="expander-body">
              <KvCoinSources v-model="draft.coinSources" :exchange-options="exchangeOptions" :preserve-case="isV8" :load-symbols="loadSymbols" />
            </div>
          </div>

          <div style="margin-top: var(--sp-sm)">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-xs)">
              <label style="font-size: var(--fs-xs); color: var(--text-dim)" :data-tip="t('editor.suite.overridesTip')">{{ t('editor.suite.overridesCount', { n: overrideEntries.length }) }}</label>
              <button type="button" class="act-btn" data-test="suite-add-override" @click="overrideRowOpen = true">{{ t('editor.suite.addOverride') }}</button>
            </div>

            <table v-if="overrideEntries.length > 0" class="tbl" style="font-size: var(--fs-xs); margin-bottom: var(--sp-xs)">
              <thead>
                <tr>
                  <th>{{ t('editor.suite.side') }}</th>
                  <th>{{ t('editor.suite.parameter') }}</th>
                  <th>{{ t('editor.suite.value') }}</th>
                  <th style="width: 40px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="[key, value] in overrideEntries" :key="key">
                  <td>{{ splitOverrideKey(key).side }}</td>
                  <td>{{ splitOverrideKey(key).param }}</td>
                  <td><Input type="text" :model-value="String(value)" class="w-[100px]" @change="setOverrideValue(key, ($event.target as HTMLInputElement).value)" /></td>
                  <td><Button type="button" variant="danger" size="sm" class="act-btn act-btn-danger" data-test="suite-ov-remove" @click="removeOverride(key)">×</Button></td>
                </tr>
              </tbody>
            </table>

            <div v-if="overrideRowOpen" style="display: flex; gap: var(--sp-sm); align-items: end; margin-top: var(--sp-xs)">
              <div class="form-group">
                <label id="suite-ov-side-label">{{ t('editor.suite.side') }}</label>
                <SelectRoot v-model="overrideSide">
                  <SelectTrigger data-test="suite-ov-side" aria-labelledby="suite-ov-side-label">
                    <span>{{ overrideSide }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long">long</SelectItem>
                    <SelectItem value="short">short</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
              <div class="form-group">
                <label id="suite-ov-param-label">{{ t('editor.suite.parameter') }}</label>
                <SelectRoot v-model="overrideParam">
                  <SelectTrigger data-test="suite-ov-param" aria-labelledby="suite-ov-param-label">
                    <span>{{ overrideParam }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="param in botParams" :key="param" :value="param">{{ param }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
              <div class="form-group">
                <label>{{ t('editor.suite.value') }}</label>
                <Input v-model="overrideValue" type="text" placeholder="0.5" data-test="suite-ov-value" />
              </div>
              <div class="form-group">
                <Button type="button" variant="outline" size="sm" class="act-btn" data-test="suite-ov-confirm" @click="addOverride">{{ t('editor.suite.add') }}</Button>
              </div>
            </div>
          </div>
        </div>

        <div class="expander">
          <div class="expander-header"><span class="arrow">▶</span> {{ t('editor.suite.aggregateSettings') }}</div>
          <div class="expander-body">
            <div class="form-row cols-4" style="margin-bottom: var(--sp-sm)">
              <div class="form-group">
                <label id="suite-agg-default-label"><span :data-tip="t('editor.suite.defaultMethodTip')">{{ t('editor.suite.defaultMethod') }}</span></label>
                <SelectRoot :model-value="model.aggregate.default" @update:model-value="setAggregateDefault(String($event ?? ''))">
                  <SelectTrigger data-test="suite-agg-default" aria-labelledby="suite-agg-default-label">
                    <span>{{ model.aggregate.default }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="method in aggregateMethods" :key="method" :value="method">{{ method }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>

            <div style="margin-bottom: var(--sp-xs)">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-xs)">
                <label style="font-size: var(--fs-xs); color: var(--text-dim)">{{ t('editor.suite.metricOverrides', { n: aggregateKeys.length }) }}</label>
                <button type="button" class="act-btn" data-test="suite-agg-add" @click="aggregateAddOpen = true">{{ t('editor.suite.addMetric') }}</button>
              </div>
              <div v-for="key in aggregateKeys" :key="key" style="display: flex; gap: var(--sp-sm); align-items: center; margin-bottom: 2px">
                <span style="font-size: var(--fs-xs); flex: 1">{{ key }}</span>
                <SelectRoot :model-value="model.aggregate[key]" @update:model-value="setAggregateMetric(key, String($event ?? ''))">
                  <SelectTrigger class="w-[90px]">
                    <span>{{ model.aggregate[key] }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="method in aggregateMethods" :key="method" :value="method">{{ method }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
                <Button type="button" variant="danger" size="sm" class="act-btn act-btn-danger" data-test="suite-agg-remove" @click="removeAggregateMetric(key)">×</Button>
              </div>

              <div v-if="aggregateAddOpen" style="display: flex; gap: var(--sp-sm); align-items: end; margin-top: var(--sp-xs)">
                <div class="form-group" style="flex: 1">
                  <label id="suite-agg-sel-label">{{ t('editor.suite.metric') }}</label>
                  <SelectRoot v-model="aggregateMetric">
                    <SelectTrigger data-test="suite-agg-sel" aria-labelledby="suite-agg-sel-label">
                      <span>{{ aggregateMetric }}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="metric in aggregateMetricOptions" :key="metric" :value="metric">{{ metric }}</SelectItem>
                    </SelectContent>
                  </SelectRoot>
                </div>
                <div class="form-group">
                  <label id="suite-agg-method-label">{{ t('editor.suite.method') }}</label>
                  <SelectRoot v-model="aggregateMethod">
                    <SelectTrigger data-test="suite-agg-method" aria-labelledby="suite-agg-method-label">
                      <span>{{ aggregateMethod }}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="method in aggregateMethods" :key="method" :value="method">{{ method }}</SelectItem>
                    </SelectContent>
                  </SelectRoot>
                </div>
                <div class="form-group">
                  <Button type="button" variant="outline" size="sm" class="act-btn" data-test="suite-agg-confirm" @click="addAggregateMetric">{{ t('editor.suite.add') }}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </template>
    </div>
  </div>
</template>
