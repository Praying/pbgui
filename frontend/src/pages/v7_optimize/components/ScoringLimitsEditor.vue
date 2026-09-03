<script setup lang="ts">
/*
 * ui-migration deviations: the stat selects' empty-value option ("default")
 * and the metric selects' empty placeholder row have no listbox equivalent
 * (reka forbids value="") — the trigger renders 'default' / the placeholder
 * text for an empty model, but the list offers no reset row.
 */
import { PhPlus, PhSliders, PhTarget, PhX } from '@phosphor-icons/vue';
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
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
    <!-- Scoring section -->
    <section class="flex flex-col rounded-xl border border-border-default/80 bg-card/60 p-4 shadow-sm">
      <header class="mb-3.5 flex items-center justify-between border-b border-border-default/60 pb-3">
        <div class="flex items-center gap-2">
          <PbIcon :icon="PhTarget" class="text-accent" :size="18" />
          <strong class="text-[14.5px] font-bold text-primary" :data-tip="t('v7optimize.tip.scoringSection')">{{ t('v7optimize.scoringObjectives') }}</strong>
          <span class="inline-flex items-center rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent-soft">
            {{ scoringRows.length }}
          </span>
        </div>
        <Button type="button" variant="default" size="sm" class="h-8 gap-1 text-[13px] shadow-sm" @click="addScoring">
          <PbIcon :icon="PhPlus" :size="14" />
          {{ t('editor.suite.add') }}
        </Button>
      </header>

      <div class="flex flex-col gap-2.5">
        <template v-if="hasMetadata">
          <div
            v-for="(row, index) in scoringRows"
            :key="`score-${index}`"
            class="opt-objective-row-advanced group relative rounded-lg border border-border-default/70 bg-surface-deep/50 p-2.5 transition-all duration-150 hover:border-border-strong hover:bg-surface-deep/80"
          >
            <!-- Primary Row: Metric + Goal + Delete -->
            <div class="flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <SelectRoot :model-value="rowValue(row, 'metric')" @update:model-value="updateScoring(index, 'metric', String($event))">
                  <SelectTrigger data-field="scoring-metric" aria-label="metric" class="h-8.5 w-full truncate text-[13px]">
                    <span :class="rowValue(row, 'metric') ? 'font-mono text-[13px] font-medium text-primary truncate' : 'text-placeholder'">
                      {{ rowValue(row, 'metric') || t('v7optimize.selectMetricForScoring') }}
                    </span>
                  </SelectTrigger>
                  <SelectContent class="max-h-72">
                    <SelectItem v-for="metric in metricOptions" :key="metric" :value="metric" class="font-mono text-[13px]">
                      {{ metric }}
                    </SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>

              <div class="w-24 shrink-0">
                <SelectRoot :model-value="canonicalGoal(row.goal)" @update:model-value="updateScoring(index, 'goal', String($event))">
                  <SelectTrigger data-field="scoring-goal" aria-label="goal" class="h-8.5 w-full text-[13px]">
                    <span class="font-mono text-[13px] font-semibold" :class="canonicalGoal(row.goal) === 'max' ? 'text-success' : 'text-warning-soft'">
                      {{ canonicalGoal(row.goal) }}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="goal in meta.goal_options" :key="goal" :value="goal" class="font-mono text-[13px]">
                      {{ goal }}
                    </SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="size-8.5 shrink-0 rounded-md p-0 text-secondary hover:bg-danger/15 hover:text-danger-soft transition-colors"
                :title="t('common.delete')"
                :aria-label="t('common.delete')"
                @click="removeScoring(index)"
              >
                <PbIcon :icon="PhX" :size="16" />
              </Button>
            </div>

            <!-- Secondary Row: Scenario / Stat Basis -->
            <div
              v-if="(scenarioLabels.length && version === 'v8') || meta.scoring_basis_field"
              class="mt-2 flex flex-wrap items-center gap-2 border-t border-border-subtle/50 pt-2 text-xs"
            >
              <div v-if="scenarioLabels.length && version === 'v8'" class="flex min-w-[140px] flex-1 items-center gap-1.5">
                <span class="text-xs text-secondary shrink-0">{{ t('v7optimize.scenario') }}:</span>
                <SelectRoot :model-value="scenarioMode(row)" @update:model-value="updateScoringScenario(index, String($event))">
                  <SelectTrigger data-field="scoring-scenario" aria-label="scenario" class="h-7.5 w-full text-xs">
                    <span class="truncate">{{ scenarioMode(row) === 'inherit' ? t('v7optimize.inheritObjectiveScenario') : scenarioMode(row) === 'aggregate' ? t('v7optimize.aggregatedScenario') : scenarioMode(row) }}</span>
                  </SelectTrigger>
                  <SelectContent class="max-h-60">
                    <SelectItem value="inherit">{{ t('v7optimize.inheritObjectiveScenario') }}</SelectItem>
                    <SelectItem value="aggregate">{{ t('v7optimize.aggregatedScenario') }}</SelectItem>
                    <SelectItem v-for="label in scenarioLabels" :key="label" :value="label">{{ label }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>

              <div v-if="meta.scoring_basis_field" class="flex min-w-[120px] flex-1 items-center gap-1.5">
                <span class="text-xs text-secondary shrink-0">{{ t('v7optimize.statistic') }}:</span>
                <SelectRoot :model-value="rowValue(row, meta.scoring_basis_field)" @update:model-value="updateScoringAggregate(index, String($event))">
                  <SelectTrigger data-field="scoring-aggregate" aria-label="statistic" class="h-7.5 w-full text-xs">
                    <span class="truncate">{{ rowValue(row, meta.scoring_basis_field) || t('v7optimize.defaultStat') }}</span>
                  </SelectTrigger>
                  <SelectContent class="max-h-60">
                    <SelectItem v-for="stat in meta.stat_options.filter(Boolean)" :key="stat" :value="stat">{{ stat }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div
            v-for="(row, index) in scoringRows"
            :key="`score-${index}`"
            class="rounded-lg border border-border-default/70 bg-surface-deep/50 p-2.5 flex items-center gap-2"
          >
            <Input class="h-8.5 flex-1 font-mono text-[13px]" :model-value="rowValue(row, 'metric')" placeholder="metric" @update:model-value="updateScoring(index, 'metric', String($event ?? ''))" />
            <div class="w-28 shrink-0">
              <SelectRoot :model-value="canonicalGoal(row.goal) === 'max' ? 'maximize' : 'minimize'" @update:model-value="updateScoring(index, 'goal', String($event))">
                <SelectTrigger aria-label="goal" class="h-8.5 w-full text-[13px]">
                  <span>{{ canonicalGoal(row.goal) === 'max' ? 'maximize' : 'minimize' }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maximize">maximize</SelectItem>
                  <SelectItem value="minimize">minimize</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <div v-if="scenarioLabels.length" class="w-32 shrink-0">
              <SelectRoot :model-value="rowValue(row, 'scenario') || 'Aggregated'" @update:model-value="updateScoring(index, 'scenario', String($event))">
                <SelectTrigger aria-label="scenario" class="h-8.5 w-full text-[13px]">
                  <span class="truncate">{{ rowValue(row, 'scenario') || 'Aggregated' }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aggregated">Aggregated</SelectItem>
                  <SelectItem v-for="label in scenarioLabels" :key="label" :value="label">{{ label }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <Button type="button" variant="ghost" size="sm" class="size-8.5 shrink-0 p-0 text-secondary hover:bg-danger/15 hover:text-danger-soft" :title="t('common.delete')" :aria-label="t('common.delete')" @click="removeScoring(index)">
              <PbIcon :icon="PhX" :size="16" />
            </Button>
          </div>
        </template>

        <p v-if="!scoringRows.length" class="py-6 text-center text-xs text-secondary">
          {{ t('v7optimize.noEntries') }}
        </p>
      </div>
    </section>

    <!-- Limits section -->
    <section class="flex flex-col rounded-xl border border-border-default/80 bg-card/60 p-4 shadow-sm">
      <header class="mb-3.5 flex items-center justify-between border-b border-border-default/60 pb-3">
        <div class="flex items-center gap-2">
          <PbIcon :icon="PhSliders" class="text-accent" :size="18" />
          <strong class="text-[14.5px] font-bold text-primary" :data-tip="t('v7optimize.tip.limitsSection')">{{ t('v7optimize.constraintLimits') }}</strong>
          <span class="inline-flex items-center rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent-soft">
            {{ limitRows.length }}
          </span>
        </div>
        <Button type="button" variant="default" size="sm" class="h-8 gap-1 text-[13px] shadow-sm" @click="addLimit">
          <PbIcon :icon="PhPlus" :size="14" />
          {{ t('editor.suite.add') }}
        </Button>
      </header>

      <div class="flex flex-col gap-2.5">
        <template v-if="hasMetadata && Array.isArray(limits)">
          <div
            v-for="(row, index) in limitRows"
            :key="`limit-${index}`"
            class="opt-objective-row-advanced group relative rounded-lg border border-border-default/70 bg-surface-deep/50 p-2.5 transition-all duration-150 hover:border-border-strong hover:bg-surface-deep/80"
          >
            <!-- Primary Row: Enable toggle + Metric + Delete -->
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-1.5 cursor-pointer select-none text-xs text-secondary shrink-0 mr-1" :title="row.enabled !== false ? 'Enabled' : 'Disabled'">
                <Checkbox :model-value="row.enabled !== false" @update:model-value="updateLimit(index, 'enabled', ($event === true))" />
                <span class="text-xs font-medium" :class="row.enabled !== false ? 'text-primary' : 'text-secondary/60'">{{ row.enabled !== false ? 'ON' : 'OFF' }}</span>
              </label>

              <div class="min-w-0 flex-1">
                <SelectRoot :model-value="rowValue(row, 'metric')" @update:model-value="updateLimit(index, 'metric', String($event))">
                  <SelectTrigger data-field="limit-metric" aria-label="metric" class="h-8.5 w-full truncate text-[13px]">
                    <span :class="rowValue(row, 'metric') ? 'font-mono text-[13px] font-medium text-primary truncate' : 'text-placeholder'">
                      {{ rowValue(row, 'metric') || t('v7optimize.selectMetricForLimit') }}
                    </span>
                  </SelectTrigger>
                  <SelectContent class="max-h-72">
                    <SelectItem v-for="metric in metricOptions" :key="metric" :value="metric" class="font-mono text-[13px]">
                      {{ metric }}
                    </SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="size-8.5 shrink-0 rounded-md p-0 text-secondary hover:bg-danger/15 hover:text-danger-soft transition-colors"
                :title="t('common.delete')"
                :aria-label="t('common.delete')"
                @click="removeLimit(index)"
              >
                <PbIcon :icon="PhX" :size="16" />
              </Button>
            </div>

            <!-- Secondary Row: Operator + Value/Range + Stat + Scenario -->
            <div class="mt-2 flex flex-wrap items-center gap-2 border-t border-border-subtle/50 pt-2 text-xs">
              <!-- Operator (penalize_if) -->
              <div class="w-36 shrink-0">
                <SelectRoot :model-value="rowValue(row, 'penalize_if') || 'greater_than'" @update:model-value="updateLimit(index, 'penalize_if', String($event))">
                  <SelectTrigger data-field="limit-penalize-if" aria-label="penalize_if" class="h-7.5 w-full text-xs">
                    <span class="truncate">{{ rowValue(row, 'penalize_if') || 'greater_than' }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="operator in meta.penalize_if_options" :key="operator" :value="operator">{{ operator }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>

              <!-- Threshold value or range -->
              <div class="flex-1 min-w-[130px] flex items-center gap-1.5">
                <template v-if="isRange(row)">
                  <Input data-field="limit-range-low" type="number" step="any" class="h-7.5 text-xs font-mono w-full" placeholder="min" :model-value="rangeValue(row, 0)" @update:model-value="updateRange(index, index, 0, String($event ?? ''))" />
                  <span class="text-secondary text-xs">→</span>
                  <Input data-field="limit-range-high" type="number" step="any" class="h-7.5 text-xs font-mono w-full" placeholder="max" :model-value="rangeValue(row, 1)" @update:model-value="updateRange(index, index, 1, String($event ?? ''))" />
                </template>
                <template v-else>
                  <Input data-field="limit-value" type="number" step="any" class="h-7.5 text-xs font-mono w-full" placeholder="threshold" :model-value="rowValue(row, 'value')" @update:model-value="updateLimitNumber(index, 'value', String($event ?? ''))" />
                </template>
              </div>

              <!-- Stat Basis -->
              <div v-if="meta.limit_basis_field" class="w-28 shrink-0">
                <SelectRoot :model-value="rowValue(row, meta.limit_basis_field)" @update:model-value="updateLimit(index, meta.limit_basis_field, String($event))">
                  <SelectTrigger data-field="limit-stat" aria-label="statistic" class="h-7.5 w-full text-xs">
                    <span class="truncate">{{ rowValue(row, meta.limit_basis_field) || t('v7optimize.defaultStat') }}</span>
                  </SelectTrigger>
                  <SelectContent class="max-h-60">
                    <SelectItem v-for="stat in meta.stat_options.filter(Boolean)" :key="stat" :value="stat">{{ stat }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>

              <!-- Scenario (if v8) -->
              <div v-if="scenarioLabels.length && version === 'v8'" class="w-36 shrink-0">
                <SelectRoot :model-value="scenarioMode(row)" @update:model-value="updateLimitScenario(index, String($event))">
                  <SelectTrigger data-field="limit-scenario" aria-label="scenario" class="h-7.5 w-full text-xs">
                    <span class="truncate">{{ scenarioMode(row) === 'inherit' ? t('v7optimize.inheritObjectiveScenario') : scenarioMode(row) === 'aggregate' ? t('v7optimize.aggregatedScenario') : scenarioMode(row) }}</span>
                  </SelectTrigger>
                  <SelectContent class="max-h-60">
                    <SelectItem value="inherit">{{ t('v7optimize.inheritObjectiveScenario') }}</SelectItem>
                    <SelectItem value="aggregate">{{ t('v7optimize.aggregatedScenario') }}</SelectItem>
                    <SelectItem v-for="label in scenarioLabels" :key="label" :value="label">{{ label }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="Array.isArray(limits)">
          <div
            v-for="(row, index) in limitRows"
            :key="`limit-${index}`"
            class="rounded-lg border border-border-default/70 bg-surface-deep/50 p-2.5 flex items-center gap-2"
          >
            <Input class="h-8.5 flex-1 font-mono text-[13px]" :model-value="rowValue(row, 'metric')" placeholder="metric" @update:model-value="updateLimit(index, 'metric', String($event ?? ''))" />
            <Input class="h-8.5 w-24 font-mono text-[13px]" :model-value="rowValue(row, 'min')" placeholder="min" @update:model-value="updateLimit(index, 'min', String($event ?? ''))" />
            <Input class="h-8.5 w-24 font-mono text-[13px]" :model-value="rowValue(row, 'max')" placeholder="max" @update:model-value="updateLimit(index, 'max', String($event ?? ''))" />
            <Button type="button" variant="ghost" size="sm" class="size-8.5 shrink-0 p-0 text-secondary hover:bg-danger/15 hover:text-danger-soft" :title="t('common.delete')" :aria-label="t('common.delete')" @click="removeLimit(index)">
              <PbIcon :icon="PhX" :size="16" />
            </Button>
          </div>
        </template>

        <p v-if="!Array.isArray(limits)" class="py-4 text-xs text-secondary">{{ t('v7optimize.legacyLimitsRawJson') }}</p>
        <p v-else-if="!limitRows.length" class="py-6 text-center text-xs text-secondary">{{ t('v7optimize.noEntries') }}</p>
      </div>
    </section>
  </div>
</template>
