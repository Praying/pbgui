<script setup lang="ts">
import { PhX } from '@phosphor-icons/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { isObject, type JsonObject } from '../lib/configModel';

type Row = JsonObject;
type OptimizeVersion = 'v7' | 'v8';
interface LimitsMeta {
  metrics_by_group: Record<string, string[]>;
  all_valid_metrics: string[];
  currency_metrics: string[];
  currency_options: string[];
  penalize_if_options: string[];
  stat_options: string[];
  goal_options: string[];
  scoring_basis_field: 'aggregate' | 'reducer';
  limit_basis_field: 'stat' | 'reducer';
}
const props = withDefaults(defineProps<{
  scoring: unknown[];
  limits: unknown[] | JsonObject;
  scenarioLabels: string[];
  version?: OptimizeVersion;
  metadata?: unknown;
}>(), { version: 'v7', metadata: undefined });
const { t } = useI18n();
const emit = defineEmits<{ 'update:scoring': [value: unknown[]]; 'update:limits': [value: unknown[]] }>();

function rowObject(entry: unknown, fallback: Row): Row {
  return entry && typeof entry === 'object' && !Array.isArray(entry) ? { ...(entry as Row) } : { ...fallback, metric: String(entry || '') };
}
const scoringRows = computed<Row[]>(() => props.scoring.map((entry) => rowObject(entry, { metric: '', goal: 'max' })));
const limitRows = computed<Row[]>(() => Array.isArray(props.limits) ? props.limits.map((entry) => rowObject(entry, { metric: '' })) : []);
const meta = computed<LimitsMeta>(() => {
  const raw = isObject(props.metadata) ? props.metadata : {};
  const nestedLimits = isObject(raw.limits) ? raw.limits : raw;
  const nestedScoring = isObject(raw.scoring) ? raw.scoring : raw;
  const metrics = Array.isArray(raw.all_valid_metrics)
    ? raw.all_valid_metrics.map(String)
    : Array.isArray(nestedLimits.metrics) ? nestedLimits.metrics.map(String) : [];
  const groups = isObject(raw.metrics_by_group)
    ? Object.fromEntries(Object.entries(raw.metrics_by_group).map(([key, values]) => [key, Array.isArray(values) ? values.map(String) : []]))
    : { all: metrics };
  if (!groups.all?.length) groups.all = metrics;
  return {
    metrics_by_group: groups,
    all_valid_metrics: metrics,
    currency_metrics: Array.isArray(raw.currency_metrics) ? raw.currency_metrics.map(String) : [],
    currency_options: Array.isArray(raw.currency_options) ? raw.currency_options.map(String) : ['usd', 'btc'],
    penalize_if_options: Array.isArray(raw.penalize_if_options)
      ? raw.penalize_if_options.map(String)
      : Array.isArray(nestedLimits.operators) ? nestedLimits.operators.map(String) : ['greater_than', 'less_than', 'outside_range', 'inside_range'],
    stat_options: Array.isArray(raw.stat_options)
      ? raw.stat_options.map(String)
      : Array.isArray(nestedLimits.statistics) ? ['', ...nestedLimits.statistics.map(String)] : ['', 'mean', 'min', 'max', 'median'],
    goal_options: Array.isArray(raw.goal_options)
      ? raw.goal_options.map(String)
      : Array.isArray(nestedScoring.goals) ? nestedScoring.goals.map(String) : ['min', 'max'],
    scoring_basis_field: raw.scoring_basis_field === 'reducer' || nestedScoring.scoring_basis_field === 'reducer' ? 'reducer' : 'aggregate',
    limit_basis_field: raw.limit_basis_field === 'reducer' || nestedLimits.basis_field === 'reducer' ? 'reducer' : 'stat',
  };
});
const hasMetadata = computed(() => meta.value.all_valid_metrics.length > 0 || Object.keys(meta.value.metrics_by_group).some((key) => (meta.value.metrics_by_group[key] || []).length > 0));
const metricOptions = computed(() => {
  const values = meta.value.all_valid_metrics.length ? [...meta.value.all_valid_metrics] : [...(meta.value.metrics_by_group.all || [])];
  [...scoringRows.value, ...limitRows.value].forEach((row) => { if (row.metric != null) values.push(String(row.metric)); });
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
});
function rowValue(row: Row, key: string): string { return row[key] === undefined || row[key] === null ? '' : String(row[key]); }
function canonicalGoal(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'maximize' || text === 'greater' || text === 'max') return 'max';
  return 'min';
}
function updateScoring(index: number, key: string, value: string): void {
  const next = scoringRows.value.map((row) => ({ ...row }));
  next[index]![key] = key === 'goal' ? canonicalGoal(value) : value;
  emit('update:scoring', next);
}
function updateScoringScenario(index: number, value: string): void {
  const next = scoringRows.value.map((row) => ({ ...row }));
  delete next[index]!.scenario;
  if (value === 'aggregate') next[index]!.scenario = null;
  else if (value !== 'inherit') next[index]!.scenario = value;
  emit('update:scoring', next);
}
function updateScoringAggregate(index: number, value: string): void {
  const next = scoringRows.value.map((row) => ({ ...row }));
  next[index]![meta.value.scoring_basis_field] = value;
  emit('update:scoring', next);
}
function updateLimit(index: number, key: string, value: unknown): void {
  const next = limitRows.value.map((row) => ({ ...row }));
  next[index]![key] = value;
  emit('update:limits', next);
}
function updateLimitNumber(index: number, key: string, raw: string): void {
  const value = Number(raw);
  updateLimit(index, key, Number.isFinite(value) ? value : raw);
}
function updateLimitScenario(index: number, value: string): void {
  const next = limitRows.value.map((row) => ({ ...row }));
  delete next[index]!.scenario;
  if (value === 'aggregate') next[index]!.scenario = null;
  else if (value !== 'inherit') next[index]!.scenario = value;
  emit('update:limits', next);
}
function addScoring(): void {
  emit('update:scoring', [...scoringRows.value, hasMetadata.value ? { metric: metricOptions.value[0] || '', goal: 'max' } : { metric: '', goal: 'maximize' }]);
}
function addLimit(): void {
  emit('update:limits', [...limitRows.value, hasMetadata.value ? { metric: metricOptions.value[0] || '', penalize_if: 'greater_than', value: 0, enabled: true } : { metric: '', min: '', max: '', goal: 'minimize' }]);
}
function removeScoring(index: number): void { emit('update:scoring', scoringRows.value.filter((_, rowIndex) => rowIndex !== index)); }
function removeLimit(index: number): void { emit('update:limits', limitRows.value.filter((_, rowIndex) => rowIndex !== index)); }
function scenarioMode(row: Row): string {
  if (!Object.prototype.hasOwnProperty.call(row, 'scenario')) return 'inherit';
  return row.scenario == null ? 'aggregate' : String(row.scenario);
}
function isRange(row: Row): boolean { return ['outside_range', 'inside_range'].includes(String(row.penalize_if || '')); }
function rangeValue(row: Row, index: number): string {
  const range = Array.isArray(row.range) ? row.range : [];
  return String(range[index] ?? (index === 0 ? 0 : 1));
}
function updateRange(index: number, rowIndex: number, bound: 0 | 1, raw: string): void {
  const row = limitRows.value[rowIndex];
  if (!row) return;
  const range = Array.isArray(row.range) ? [...row.range] : [0, 1];
  const number = Number(raw);
  range[bound] = Number.isFinite(number) ? number : raw;
  const next = limitRows.value.map((entry) => ({ ...entry }));
  next[index]!.range = range;
  emit('update:limits', next);
}
</script>

<template>
  <div class="opt-objective-editor">
    <section>
      <header class="opt-subhead"><strong>{{ t('v7optimize.scoring') }}</strong><button class="opt-btn small" type="button" @click="addScoring">{{ t('editor.suite.add') }}</button></header>
      <template v-if="hasMetadata">
        <div v-for="(row, index) in scoringRows" :key="`score-${index}`" class="opt-objective-row opt-objective-row-advanced">
          <select class="opt-input" data-field="scoring-metric" :value="rowValue(row, 'metric')" @change="updateScoring(index, 'metric', ($event.target as HTMLSelectElement).value)"><option value="">{{ t('v7optimize.selectMetricForScoring') }}</option><option v-for="metric in metricOptions" :key="metric" :value="metric">{{ metric }}</option></select>
          <select class="opt-input" data-field="scoring-goal" :value="canonicalGoal(row.goal)" @change="updateScoring(index, 'goal', ($event.target as HTMLSelectElement).value)"><option v-for="goal in meta.goal_options" :key="goal" :value="goal">{{ goal }}</option></select>
          <select v-if="scenarioLabels.length && version === 'v8'" class="opt-input" data-field="scoring-scenario" :value="scenarioMode(row)" @change="updateScoringScenario(index, ($event.target as HTMLSelectElement).value)"><option value="inherit">inherit objective scenario</option><option value="aggregate">Aggregated</option><option v-for="label in scenarioLabels" :key="label" :value="label">{{ label }}</option></select>
          <select v-if="meta.scoring_basis_field" class="opt-input" data-field="scoring-aggregate" :value="rowValue(row, meta.scoring_basis_field)" @change="updateScoringAggregate(index, ($event.target as HTMLSelectElement).value)"><option v-for="stat in meta.stat_options" :key="stat" :value="stat">{{ stat || 'default' }}</option></select>
          <button class="opt-btn danger small" type="button" :title="t('common.delete')" :aria-label="t('common.delete')" @click="removeScoring(index)"><PbIcon :icon="PhX" :size="18" /></button>
        </div>
      </template>
      <template v-else>
        <div v-for="(row, index) in scoringRows" :key="`score-${index}`" class="opt-objective-row">
          <input class="opt-input" :value="rowValue(row, 'metric')" placeholder="metric" @input="updateScoring(index, 'metric', ($event.target as HTMLInputElement).value)" />
          <select class="opt-input" :value="canonicalGoal(row.goal) === 'max' ? 'maximize' : 'minimize'" @change="updateScoring(index, 'goal', ($event.target as HTMLSelectElement).value)"><option value="maximize">maximize</option><option value="minimize">minimize</option></select>
          <select v-if="scenarioLabels.length" class="opt-input" :value="rowValue(row, 'scenario') || 'Aggregated'" @change="updateScoring(index, 'scenario', ($event.target as HTMLSelectElement).value)"><option value="Aggregated">Aggregated</option><option v-for="label in scenarioLabels" :key="label" :value="label">{{ label }}</option></select>
          <button class="opt-btn danger small" type="button" :title="t('common.delete')" :aria-label="t('common.delete')" @click="removeScoring(index)"><PbIcon :icon="PhX" :size="18" /></button>
        </div>
      </template>
      <p v-if="!scoringRows.length" class="opt-muted">{{ t('v7optimize.noEntries') }}</p>
    </section>
    <section>
      <header class="opt-subhead"><strong>{{ t('v7optimize.limits') }}</strong><button class="opt-btn small" type="button" @click="addLimit">{{ t('editor.suite.add') }}</button></header>
      <template v-if="hasMetadata && Array.isArray(limits)">
        <div v-for="(row, index) in limitRows" :key="`limit-${index}`" class="opt-objective-row opt-objective-row-advanced">
          <select class="opt-input" data-field="limit-metric" :value="rowValue(row, 'metric')" @change="updateLimit(index, 'metric', ($event.target as HTMLSelectElement).value)"><option value="">{{ t('v7optimize.selectMetricForLimit') }}</option><option v-for="metric in metricOptions" :key="metric" :value="metric">{{ metric }}</option></select>
          <select class="opt-input" data-field="limit-penalize-if" :value="rowValue(row, 'penalize_if') || 'greater_than'" @change="updateLimit(index, 'penalize_if', ($event.target as HTMLSelectElement).value)"><option v-for="operator in meta.penalize_if_options" :key="operator" :value="operator">{{ operator }}</option></select>
          <select class="opt-input" data-field="limit-stat" :value="rowValue(row, meta.limit_basis_field)" @change="updateLimit(index, meta.limit_basis_field, ($event.target as HTMLSelectElement).value)"><option v-for="stat in meta.stat_options" :key="stat" :value="stat">{{ stat || 'default' }}</option></select>
          <label class="opt-inline-field"><input type="checkbox" :checked="row.enabled !== false" @change="updateLimit(index, 'enabled', ($event.target as HTMLInputElement).checked)" /> enabled</label>
          <button class="opt-btn danger small" type="button" :title="t('common.delete')" :aria-label="t('common.delete')" @click="removeLimit(index)"><PbIcon :icon="PhX" :size="18" /></button>
          <template v-if="isRange(row)"><input class="opt-input" data-field="limit-range-low" type="number" step="any" :value="rangeValue(row, 0)" @input="updateRange(index, index, 0, ($event.target as HTMLInputElement).value)" /><input class="opt-input" data-field="limit-range-high" type="number" step="any" :value="rangeValue(row, 1)" @input="updateRange(index, index, 1, ($event.target as HTMLInputElement).value)" /></template>
          <input v-else class="opt-input" data-field="limit-value" type="number" step="any" :value="rowValue(row, 'value')" @input="updateLimitNumber(index, 'value', ($event.target as HTMLInputElement).value)" />
          <select v-if="scenarioLabels.length && version === 'v8'" class="opt-input" data-field="limit-scenario" :value="scenarioMode(row)" @change="updateLimitScenario(index, ($event.target as HTMLSelectElement).value)"><option value="inherit">inherit objective scenario</option><option value="aggregate">Aggregated</option><option v-for="label in scenarioLabels" :key="label" :value="label">{{ label }}</option></select>
        </div>
      </template>
      <template v-else-if="Array.isArray(limits)">
        <div v-for="(row, index) in limitRows" :key="`limit-${index}`" class="opt-objective-row">
          <input class="opt-input" :value="rowValue(row, 'metric')" placeholder="metric" @input="updateLimit(index, 'metric', ($event.target as HTMLInputElement).value)" />
          <input class="opt-input" :value="rowValue(row, 'min')" placeholder="min" @input="updateLimit(index, 'min', ($event.target as HTMLInputElement).value)" />
          <input class="opt-input" :value="rowValue(row, 'max')" placeholder="max" @input="updateLimit(index, 'max', ($event.target as HTMLInputElement).value)" />
          <button class="opt-btn danger small" type="button" :title="t('common.delete')" :aria-label="t('common.delete')" @click="removeLimit(index)"><PbIcon :icon="PhX" :size="18" /></button>
        </div>
      </template>
      <p v-if="!Array.isArray(limits)" class="opt-muted">{{ t('v7optimize.legacyLimitsRawJson') }}</p>
      <p v-else-if="!limitRows.length" class="opt-muted">{{ t('v7optimize.noEntries') }}</p>
    </section>
  </div>
</template>
