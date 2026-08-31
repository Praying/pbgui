<script setup lang="ts">
/*
 * ui-migration deviations: the stat selects' empty-value option ("default")
 * and the metric selects' empty placeholder row have no listbox equivalent
 * (reka forbids value="") — the trigger renders 'default' / the placeholder
 * text for an empty model, but the list offers no reset row.
 */
import { PhX } from '@phosphor-icons/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { isObject, metricAvailableForBackend, type JsonObject } from '../lib/configModel';

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
  backend?: string;
  backendContract?: unknown;
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
  const baseValues = meta.value.all_valid_metrics.length ? [...meta.value.all_valid_metrics] : [...(meta.value.metrics_by_group.all || [])];
  const selectedValues: string[] = [];
  [...scoringRows.value, ...limitRows.value].forEach((row) => { if (row.metric != null) selectedValues.push(String(row.metric)); });
  const availableBase = baseValues.filter((metric) => metricAvailableForBackend(metric, props.backend, props.backendContract));
  const merged = new Set([...availableBase, ...selectedValues].map((value) => String(value).trim()).filter(Boolean));
  return [...merged].sort();
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
  <div class="grid grid-cols-[1fr_1fr] gap-3.5 max-[600px]:grid-cols-1">
    <section>
      <header class="mb-2 flex items-center justify-between text-primary"><strong>{{ t('v7optimize.scoring') }}</strong><Button type="button" variant="default" size="sm" @click="addScoring">{{ t('editor.suite.add') }}</Button></header>
      <template v-if="hasMetadata">
        <div v-for="(row, index) in scoringRows" :key="`score-${index}`" class="opt-objective-row-advanced grid grid-cols-[minmax(0,1fr)_130px_130px_auto] gap-1.5 mb-1.5 max-[600px]:grid-cols-[1fr_1fr]">
          <SelectRoot :model-value="rowValue(row, 'metric')" @update:model-value="updateScoring(index, 'metric', String($event))"><SelectTrigger data-field="scoring-metric" aria-label="metric"><span :class="rowValue(row, 'metric') ? undefined : 'text-placeholder'">{{ rowValue(row, 'metric') || t('v7optimize.selectMetricForScoring') }}</span></SelectTrigger><SelectContent><SelectItem v-for="metric in metricOptions" :key="metric" :value="metric">{{ metric }}</SelectItem></SelectContent></SelectRoot>
          <SelectRoot :model-value="canonicalGoal(row.goal)" @update:model-value="updateScoring(index, 'goal', String($event))"><SelectTrigger data-field="scoring-goal" aria-label="goal"><span>{{ canonicalGoal(row.goal) }}</span></SelectTrigger><SelectContent><SelectItem v-for="goal in meta.goal_options" :key="goal" :value="goal">{{ goal }}</SelectItem></SelectContent></SelectRoot>
          <SelectRoot v-if="scenarioLabels.length && version === 'v8'" :model-value="scenarioMode(row)" @update:model-value="updateScoringScenario(index, String($event))"><SelectTrigger data-field="scoring-scenario" aria-label="scenario"><span>{{ scenarioMode(row) === 'inherit' ? 'inherit objective scenario' : scenarioMode(row) === 'aggregate' ? 'Aggregated' : scenarioMode(row) }}</span></SelectTrigger><SelectContent><SelectItem value="inherit">inherit objective scenario</SelectItem><SelectItem value="aggregate">Aggregated</SelectItem><SelectItem v-for="label in scenarioLabels" :key="label" :value="label">{{ label }}</SelectItem></SelectContent></SelectRoot>
          <SelectRoot v-if="meta.scoring_basis_field" :model-value="rowValue(row, meta.scoring_basis_field)" @update:model-value="updateScoringAggregate(index, String($event))"><SelectTrigger data-field="scoring-aggregate" aria-label="statistic"><span>{{ rowValue(row, meta.scoring_basis_field) || 'default' }}</span></SelectTrigger><SelectContent><SelectItem v-for="stat in meta.stat_options.filter(Boolean)" :key="stat" :value="stat">{{ stat }}</SelectItem></SelectContent></SelectRoot>
          <Button type="button" variant="danger" size="sm" :title="t('common.delete')" :aria-label="t('common.delete')" @click="removeScoring(index)"><PbIcon :icon="PhX" :size="18" /></Button>
        </div>
      </template>
      <template v-else>
        <div v-for="(row, index) in scoringRows" :key="`score-${index}`" class="grid grid-cols-[minmax(0,1fr)_130px_130px_auto] gap-1.5 mb-1.5 max-[600px]:grid-cols-[1fr_1fr]">
          <Input :model-value="rowValue(row, 'metric')" placeholder="metric" @update:model-value="updateScoring(index, 'metric', String($event ?? ''))" />
          <SelectRoot :model-value="canonicalGoal(row.goal) === 'max' ? 'maximize' : 'minimize'" @update:model-value="updateScoring(index, 'goal', String($event))"><SelectTrigger aria-label="goal"><span>{{ canonicalGoal(row.goal) === 'max' ? 'maximize' : 'minimize' }}</span></SelectTrigger><SelectContent><SelectItem value="maximize">maximize</SelectItem><SelectItem value="minimize">minimize</SelectItem></SelectContent></SelectRoot>
          <SelectRoot v-if="scenarioLabels.length" :model-value="rowValue(row, 'scenario') || 'Aggregated'" @update:model-value="updateScoring(index, 'scenario', String($event))"><SelectTrigger aria-label="scenario"><span>{{ rowValue(row, 'scenario') || 'Aggregated' }}</span></SelectTrigger><SelectContent><SelectItem value="Aggregated">Aggregated</SelectItem><SelectItem v-for="label in scenarioLabels" :key="label" :value="label">{{ label }}</SelectItem></SelectContent></SelectRoot>
          <Button type="button" variant="danger" size="sm" :title="t('common.delete')" :aria-label="t('common.delete')" @click="removeScoring(index)"><PbIcon :icon="PhX" :size="18" /></Button>
        </div>
      </template>
      <p v-if="!scoringRows.length" class="text-xs text-secondary">{{ t('v7optimize.noEntries') }}</p>
    </section>
    <section>
      <header class="mb-2 flex items-center justify-between text-primary"><strong>{{ t('v7optimize.limits') }}</strong><Button type="button" variant="default" size="sm" @click="addLimit">{{ t('editor.suite.add') }}</Button></header>
      <template v-if="hasMetadata && Array.isArray(limits)">
        <div v-for="(row, index) in limitRows" :key="`limit-${index}`" class="opt-objective-row-advanced grid grid-cols-[minmax(0,1fr)_130px_130px_auto] gap-1.5 mb-1.5 max-[600px]:grid-cols-[1fr_1fr]">
          <SelectRoot :model-value="rowValue(row, 'metric')" @update:model-value="updateLimit(index, 'metric', String($event))"><SelectTrigger data-field="limit-metric" aria-label="metric"><span :class="rowValue(row, 'metric') ? undefined : 'text-placeholder'">{{ rowValue(row, 'metric') || t('v7optimize.selectMetricForLimit') }}</span></SelectTrigger><SelectContent><SelectItem v-for="metric in metricOptions" :key="metric" :value="metric">{{ metric }}</SelectItem></SelectContent></SelectRoot>
          <SelectRoot :model-value="rowValue(row, 'penalize_if') || 'greater_than'" @update:model-value="updateLimit(index, 'penalize_if', String($event))"><SelectTrigger data-field="limit-penalize-if" aria-label="penalize_if"><span>{{ rowValue(row, 'penalize_if') || 'greater_than' }}</span></SelectTrigger><SelectContent><SelectItem v-for="operator in meta.penalize_if_options" :key="operator" :value="operator">{{ operator }}</SelectItem></SelectContent></SelectRoot>
          <SelectRoot :model-value="rowValue(row, meta.limit_basis_field)" @update:model-value="updateLimit(index, meta.limit_basis_field, String($event))"><SelectTrigger data-field="limit-stat" aria-label="statistic"><span>{{ rowValue(row, meta.limit_basis_field) || 'default' }}</span></SelectTrigger><SelectContent><SelectItem v-for="stat in meta.stat_options.filter(Boolean)" :key="stat" :value="stat">{{ stat }}</SelectItem></SelectContent></SelectRoot>
          <label class="inline-flex items-center gap-1.5 text-xs text-secondary"><Checkbox :model-value="row.enabled !== false" @update:model-value="updateLimit(index, 'enabled', ($event === true))" /> enabled</label>
          <Button type="button" variant="danger" size="sm" :title="t('common.delete')" :aria-label="t('common.delete')" @click="removeLimit(index)"><PbIcon :icon="PhX" :size="18" /></Button>
          <template v-if="isRange(row)"><Input data-field="limit-range-low" type="number" step="any" :model-value="rangeValue(row, 0)" @update:model-value="updateRange(index, index, 0, String($event ?? ''))" /><Input data-field="limit-range-high" type="number" step="any" :model-value="rangeValue(row, 1)" @update:model-value="updateRange(index, index, 1, String($event ?? ''))" /></template>
          <Input v-else data-field="limit-value" type="number" step="any" :model-value="rowValue(row, 'value')" @update:model-value="updateLimitNumber(index, 'value', String($event ?? ''))" />
          <SelectRoot v-if="scenarioLabels.length && version === 'v8'" :model-value="scenarioMode(row)" @update:model-value="updateLimitScenario(index, String($event))"><SelectTrigger data-field="limit-scenario" aria-label="scenario"><span>{{ scenarioMode(row) === 'inherit' ? 'inherit objective scenario' : scenarioMode(row) === 'aggregate' ? 'Aggregated' : scenarioMode(row) }}</span></SelectTrigger><SelectContent><SelectItem value="inherit">inherit objective scenario</SelectItem><SelectItem value="aggregate">Aggregated</SelectItem><SelectItem v-for="label in scenarioLabels" :key="label" :value="label">{{ label }}</SelectItem></SelectContent></SelectRoot>
        </div>
      </template>
      <template v-else-if="Array.isArray(limits)">
        <div v-for="(row, index) in limitRows" :key="`limit-${index}`" class="grid grid-cols-[minmax(0,1fr)_130px_130px_auto] gap-1.5 mb-1.5 max-[600px]:grid-cols-[1fr_1fr]">
          <Input :model-value="rowValue(row, 'metric')" placeholder="metric" @update:model-value="updateLimit(index, 'metric', String($event ?? ''))" />
          <Input :model-value="rowValue(row, 'min')" placeholder="min" @update:model-value="updateLimit(index, 'min', String($event ?? ''))" />
          <Input :model-value="rowValue(row, 'max')" placeholder="max" @update:model-value="updateLimit(index, 'max', String($event ?? ''))" />
          <Button type="button" variant="danger" size="sm" :title="t('common.delete')" :aria-label="t('common.delete')" @click="removeLimit(index)"><PbIcon :icon="PhX" :size="18" /></Button>
        </div>
      </template>
      <p v-if="!Array.isArray(limits)" class="text-xs text-secondary">{{ t('v7optimize.legacyLimitsRawJson') }}</p>
      <p v-else-if="!limitRows.length" class="text-xs text-secondary">{{ t('v7optimize.noEntries') }}</p>
    </section>
  </div>
</template>
