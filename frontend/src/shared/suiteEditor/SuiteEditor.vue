<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
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
  suiteAggMetricOptions,
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
  }>(),
  { botParams: () => [], isV8: false, exchangeOptions: () => [], loadSymbols: undefined }
);

const emit = defineEmits<{ 'template-exchanges': [exchanges: string[]] }>();

const { t } = useI18n();

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
  return { ...next, scenarios };
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
  commit(committed);
  loadDraft(committed);
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
const aggregateAddOpen = ref(false);
const aggregateMetric = ref('');
const aggregateMethod = ref('max');

function setAggregateDefault(value: string): void {
  commit({ ...model.value, aggregate: { ...model.value.aggregate, default: value } });
}

function setAggregateMetric(key: string, value: string): void {
  commit({ ...model.value, aggregate: { ...model.value.aggregate, [key]: value } });
}

function removeAggregateMetric(key: string): void {
  const aggregate = { ...model.value.aggregate };
  delete aggregate[key];
  commit({ ...model.value, aggregate });
}

function addAggregateMetric(): void {
  if (!aggregateMetric.value) return;
  setAggregateMetric(aggregateMetric.value, aggregateMethod.value);
  aggregateAddOpen.value = false;
}

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
  <div class="expander" :class="{ open: model.enabled }" data-test="suite-expander">
    <div class="expander-header" data-test="suite-header" @click="toggleEnabled(!model.enabled)">
      <span class="arrow">▶</span> {{ t('editor.suite.mode') }}
      <span v-if="model.enabled" style="color: var(--green); font-size: var(--fs-xs); margin-left: 6px">
        {{ t('editor.suite.enabled') }} ({{ t('editor.suite.scenario', { n: model.scenarios.length, s: model.scenarios.length !== 1 ? 's' : '' }) }})
      </span>
    </div>
    <div class="expander-body">
      <div style="display: flex; align-items: center; gap: var(--sp-md); margin-bottom: var(--sp-md)">
        <div class="chk-row">
          <input id="suite-enabled" type="checkbox" :checked="model.enabled" @change="toggleEnabled(($event.target as HTMLInputElement).checked)" />
          <label for="suite-enabled">{{ t('editor.suite.enableMode') }}</label>
        </div>
      </div>

      <template v-if="model.enabled">
        <div style="display: flex; gap: var(--sp-sm); flex-wrap: wrap; margin-bottom: var(--sp-md)">
          <span style="font-size: var(--fs-xs); color: var(--text-dim); align-self: center">{{ t('editor.suite.templates') }}:</span>
          <button
            v-for="name in TEMPLATE_NAMES"
            :key="name"
            type="button"
            class="act-btn"
            :data-test="'suite-template-' + name"
            @click="applyTemplate(name)"
          >
            {{ t('editor.suite.template' + (name === 'Exchange Comparison' ? 'ExchangeComparison' : name === 'Date Windows' ? 'DateWindows' : name === 'TWE Sensitivity' ? 'TweSensitivity' : 'NposSensitivity')) }}
          </button>
          <button type="button" class="act-btn" data-test="suite-reset" :title="t('editor.suite.resetToBaseTitle')" style="border-color: var(--orange); color: var(--orange)" @click="resetToBase">
            {{ t('editor.suite.resetToBase') }}
          </button>
        </div>

        <div style="margin-bottom: var(--sp-md)">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-sm)">
            <span style="font-size: var(--fs-sm); font-weight: 600">{{ t('editor.suite.scenariosCount', { n: model.scenarios.length }) }}</span>
            <button type="button" class="act-btn" data-test="suite-add-scenario" @click="addScenario">{{ t('editor.suite.addScenario') }}</button>
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
              <tr v-for="(scenario, i) in model.scenarios" :key="i" :style="model.editIdx === i ? 'background: rgba(77,166,255,.06)' : ''">
                <td style="font-weight: 600">{{ scenario.label || t('editor.suite.unnamed') }}</td>
                <td><span style="color: var(--text-dim); font-size: var(--fs-xs)">{{ summary(scenario) }}</span></td>
                <td>
                  <button type="button" class="act-btn" @click="editScenario(i)">{{ model.editIdx === i ? t('editor.suite.editing') : t('editor.suite.edit') }}</button>
                  <button type="button" class="act-btn act-btn-danger" :data-test="'suite-remove'" @click="removeScenario(i)">×</button>
                  <button v-if="i > 0" type="button" class="act-btn" :data-test="'suite-move-up-' + i" :title="t('editor.suite.moveUp')" @click="moveScenario(i, -1)">↑</button>
                  <button v-if="i < model.scenarios.length - 1" type="button" class="act-btn" :data-test="'suite-move-down-' + i" :title="t('editor.suite.moveDown')" @click="moveScenario(i, 1)">↓</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="editing && draft" style="border: 1px solid var(--accent); border-radius: 6px; padding: var(--sp-md); margin-bottom: var(--sp-md); background: rgba(77, 166, 255, 0.03)">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-sm)">
            <span style="font-size: var(--fs-sm); font-weight: 600; color: var(--accent)">{{ t('editor.suite.editScenario', { label: draft.label }) }}</span>
            <button type="button" class="act-btn" data-test="suite-done" @click="done">{{ t('editor.suite.done') }}</button>
          </div>

          <div class="form-row cols-4">
            <div class="form-group">
              <label>label</label>
              <input v-model="draft.label" type="text" data-test="suite-sc-label" />
            </div>
            <div class="form-group">
              <label>start_date</label>
              <DatePicker v-model="draft.startDate" placeholder="e.g. 2023-01-01" :max="draft.endDate || undefined" />
            </div>
            <div class="form-group">
              <label>end_date</label>
              <DatePicker v-model="draft.endDate" placeholder="e.g. now" :min="draft.startDate || undefined" />
            </div>
          </div>

          <div class="form-group" style="margin-bottom: var(--sp-md)">
            <label>exchanges</label>
            <div style="display: flex; gap: var(--sp-md); flex-wrap: wrap">
              <div v-for="exchange in exchanges" :key="exchange" class="chk-row">
                <input
                  :id="'suite-sc-ex-' + exchange"
                  type="checkbox"
                  :data-test="'suite-sc-ex-' + exchange"
                  :checked="draft.exchanges.includes(exchange)"
                  @change="toggleDraftExchange(exchange, ($event.target as HTMLInputElement).checked)"
                />
                <label :for="'suite-sc-ex-' + exchange">{{ exchange }}</label>
              </div>
            </div>
          </div>

          <div class="form-row cols-2">
            <div class="form-group">
              <label>coins</label>
              <div class="ms-wrap">
                <span v-for="coin in draft.coins" :key="coin" class="ms-tag">{{ coin }} <span class="ms-x" @click="toggleDraftCoin('coins', coin)">×</span></span>
                <input class="ms-input" :placeholder="t('editor.suite.typeToSearch')" @keydown.enter.prevent="draftCoinOptions('coins').length ? toggleDraftCoin('coins', draftCoinOptions('coins').find((c) => !draft!.coins.includes(c))!) : undefined" />
                <div class="ms-dropdown open" style="position: static; max-height: 160px">
                  <div v-for="coin in draftCoinOptions('coins')" :key="coin" class="ms-option" :class="{ selected: draft.coins.includes(coin) }" @mousedown.prevent="toggleDraftCoin('coins', coin)">{{ coin }}</div>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>ignored_coins</label>
              <div class="ms-wrap">
                <span v-for="coin in draft.ignoredCoins" :key="coin" class="ms-tag">{{ coin }} <span class="ms-x" @click="toggleDraftCoin('ignoredCoins', coin)">×</span></span>
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
              <label style="font-size: var(--fs-xs); color: var(--text-dim)">{{ t('editor.suite.overridesCount', { n: overrideEntries.length }) }}</label>
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
                  <td><input type="text" :value="String(value)" style="width: 100px" @change="setOverrideValue(key, ($event.target as HTMLInputElement).value)" /></td>
                  <td><button type="button" class="act-btn act-btn-danger" data-test="suite-ov-remove" @click="removeOverride(key)">×</button></td>
                </tr>
              </tbody>
            </table>

            <div v-if="overrideRowOpen" style="display: flex; gap: var(--sp-sm); align-items: end; margin-top: var(--sp-xs)">
              <div class="form-group">
                <label>{{ t('editor.suite.side') }}</label>
                <select v-model="overrideSide" data-test="suite-ov-side">
                  <option value="long">long</option>
                  <option value="short">short</option>
                </select>
              </div>
              <div class="form-group">
                <label>{{ t('editor.suite.parameter') }}</label>
                <select v-model="overrideParam" data-test="suite-ov-param">
                  <option v-for="param in botParams" :key="param" :value="param">{{ param }}</option>
                </select>
              </div>
              <div class="form-group">
                <label>{{ t('editor.suite.value') }}</label>
                <input v-model="overrideValue" type="text" placeholder="0.5" data-test="suite-ov-value" />
              </div>
              <div class="form-group">
                <button type="button" class="act-btn" data-test="suite-ov-confirm" @click="addOverride">{{ t('editor.suite.add') }}</button>
              </div>
            </div>
          </div>
        </div>

        <div class="expander">
          <div class="expander-header"><span class="arrow">▶</span> {{ t('editor.suite.aggregateSettings') }}</div>
          <div class="expander-body">
            <div class="form-row cols-4" style="margin-bottom: var(--sp-sm)">
              <div class="form-group">
                <label>{{ t('editor.suite.defaultMethod') }}</label>
                <select :value="model.aggregate.default" data-test="suite-agg-default" @change="setAggregateDefault(($event.target as HTMLSelectElement).value)">
                  <option value="mean">mean</option>
                  <option value="min">min</option>
                  <option value="max">max</option>
                </select>
              </div>
            </div>

            <div style="margin-bottom: var(--sp-xs)">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-xs)">
                <label style="font-size: var(--fs-xs); color: var(--text-dim)">{{ t('editor.suite.metricOverrides', { n: aggregateKeys.length }) }}</label>
                <button type="button" class="act-btn" data-test="suite-agg-add" @click="aggregateAddOpen = true">{{ t('editor.suite.addMetric') }}</button>
              </div>
              <div v-for="key in aggregateKeys" :key="key" style="display: flex; gap: var(--sp-sm); align-items: center; margin-bottom: 2px">
                <span style="font-size: var(--fs-xs); flex: 1">{{ key }}</span>
                <select style="width: 90px" :value="model.aggregate[key]" @change="setAggregateMetric(key, ($event.target as HTMLSelectElement).value)">
                  <option value="mean">mean</option>
                  <option value="min">min</option>
                  <option value="max">max</option>
                </select>
                <button type="button" class="act-btn act-btn-danger" data-test="suite-agg-remove" @click="removeAggregateMetric(key)">×</button>
              </div>

              <div v-if="aggregateAddOpen" style="display: flex; gap: var(--sp-sm); align-items: end; margin-top: var(--sp-xs)">
                <div class="form-group" style="flex: 1">
                  <label>{{ t('editor.suite.metric') }}</label>
                  <select v-model="aggregateMetric" data-test="suite-agg-sel">
                    <option v-for="metric in aggregateMetricOptions" :key="metric" :value="metric">{{ metric }}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>{{ t('editor.suite.method') }}</label>
                  <select v-model="aggregateMethod" data-test="suite-agg-method">
                    <option value="mean">mean</option>
                    <option value="min">min</option>
                    <option value="max">max</option>
                  </select>
                </div>
                <div class="form-group">
                  <button type="button" class="act-btn" data-test="suite-agg-confirm" @click="addAggregateMetric">{{ t('editor.suite.add') }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
