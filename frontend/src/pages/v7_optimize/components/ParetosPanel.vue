<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import EmptyState from '@/shared/components/EmptyState.vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { PARETO_METRIC_PILL_LABELS } from '../lib/configModel';
import type { ParetoItem, ParetoMeta, ResultSummary } from '../types';

const props = defineProps<{
  rows: ParetoItem[];
  meta: ParetoMeta;
  resultName: string;
  selected: Set<string>;
  isV8: boolean;
  columns?: string[];
  availableMetrics?: string[];
  availableResults?: ResultSummary[];
  selectedResultPath?: string;
  holdoutValidationMode?: 'holdout_only' | 'holdout_and_full_timerange';
}>();
const emit = defineEmits<{
  toggle: [path: string];
  view: [row: ParetoItem];
  seed: [row: ParetoItem];
  migrate: [row: ParetoItem];
  'update:scenario': [value: string];
  'update:statistic': [value: string];
  sort: [key: string];
  selectAll: [];
  clearSelection: [];
  selectRange: [paths: string[], selected: boolean];
  toggleColumn: [metric: string, enabled: boolean];
  resetColumns: [];
  selectAllColumns: [];
  selectResultPath: [path: string];
  goToResults: [];
  'update:holdoutValidationMode': [value: 'holdout_only' | 'holdout_and_full_timerange'];
}>();
const { locale, t } = useI18n();
const picker = ref<HTMLDetailsElement | null>(null);
const columns = computed(() => (Array.isArray(props.columns) ? props.columns : []));
const availableMetrics = computed(() => (Array.isArray(props.availableMetrics) ? props.availableMetrics : []));
const validationModeLabel = computed(() => locale.value === 'zh' ? '验证模式' : 'Validation mode');
const holdoutOnlyLabel = computed(() => locale.value === 'zh' ? '仅留出验证' : 'Holdout only');
const holdoutAndFullTimerangeLabel = computed(() => locale.value === 'zh' ? '留出验证 + 完整时间范围' : 'Holdout + Full timerange');
function pillLabel(metric: string): string {
  const short = PARETO_METRIC_PILL_LABELS[metric];
  return short && short !== metric ? `${short} (${metric})` : metric;
}
const summaryKeys = computed(() => {
  if (columns.value.length) return columns.value;
  const advertised = Array.isArray(props.meta.summary_keys) ? props.meta.summary_keys : [];
  if (advertised.length) return advertised.map(String);
  const keys = new Set<string>();
  props.rows.forEach((row) => Object.keys(row.summary || {}).forEach((key) => keys.add(key)));
  return [...keys].sort();
});
const totalColumns = computed(() => (summaryKeys.value.length ? summaryKeys.value.length + 3 : 4));
function summaryValue(row: ParetoItem, key: string): string {
  const value = row.summary?.[key];
  return value === undefined || value === null ? '—' : typeof value === 'number' ? String(Number(value.toPrecision(6))) : String(value);
}
function inlineSummary(row: ParetoItem): string {
  return Object.entries(row.summary || {}).slice(0, 4).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') || '—';
}
function closePicker(): void {
  if (picker.value) picker.value.open = false;
}
const wrap = ref<HTMLElement | null>(null);
const tbody = ref<HTMLElement | null>(null);
const dragSelect = useRowDragSelect({
  getRows: () => tbody.value ? Array.from(tbody.value.querySelectorAll('tr[data-path]')) : [],
  getWrap: () => wrap.value,
  isSelected: (path) => props.selected.has(path),
  onToggle: (path) => emit('toggle', path),
  onSelectRange: (paths, selected) => emit('selectRange', paths, selected),
});
onBeforeUnmount(() => dragSelect.dispose());
</script>

<template>
  <div class="opt-panel-controls mb-2.5 flex flex-wrap items-center gap-2.5">
    <div v-if="availableResults && availableResults.length" class="inline-flex items-center gap-1.5 text-xs text-secondary">
      <span class="font-medium text-primary">{{ t('v7optimize.activeResultSet') }}:</span>
      <SelectRoot :model-value="selectedResultPath || ''" @update:model-value="emit('selectResultPath', String($event))">
        <SelectTrigger class="w-auto min-w-[160px] max-w-[280px]" :aria-label="t('v7optimize.activeResultSet')">
          <span class="truncate">{{ resultName || t('v7optimize.chooseResultSetFirst') }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="res in availableResults" :key="res.path" :value="res.path">
            {{ res.name || res.result || res.path }}
          </SelectItem>
        </SelectContent>
      </SelectRoot>
    </div>
    <span v-else class="opt-result-context font-medium">{{ resultName || t('v7optimize.chooseResultSetFirst') }}</span>

    <label v-if="isV8 && meta.sweep_cycles?.enabled === true" class="inline-flex items-center gap-1.5 text-xs text-secondary">
      {{ validationModeLabel }}
      <SelectRoot :model-value="holdoutValidationMode || 'holdout_only'" @update:model-value="emit('update:holdoutValidationMode', String($event) as 'holdout_only' | 'holdout_and_full_timerange')">
        <SelectTrigger class="w-auto min-w-[180px]" :aria-label="validationModeLabel">
          <span>{{ holdoutValidationMode === 'holdout_and_full_timerange' ? holdoutAndFullTimerangeLabel : holdoutOnlyLabel }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="holdout_only">{{ holdoutOnlyLabel }}</SelectItem>
          <SelectItem value="holdout_and_full_timerange">{{ holdoutAndFullTimerangeLabel }}</SelectItem>
        </SelectContent>
      </SelectRoot>
    </label>

    <label v-if="(meta.scenario_labels || []).length" class="inline-flex items-center gap-1.5 text-xs text-secondary">{{ t('v7optimize.scenario') }}<SelectRoot :model-value="meta.selected_scenario || 'Aggregated'" @update:model-value="emit('update:scenario', String($event))"><SelectTrigger class="w-auto min-w-[120px]" :aria-label="t('v7optimize.scenario')"><span>{{ meta.selected_scenario || 'Aggregated' }}</span></SelectTrigger><SelectContent><SelectItem v-for="scenario in meta.scenario_labels" :key="scenario" :value="scenario">{{ scenario }}</SelectItem></SelectContent></SelectRoot></label>
    <label class="inline-flex items-center gap-1.5 text-xs text-secondary">{{ t('v7optimize.statistic') }}<SelectRoot :model-value="meta.selected_statistic || 'mean'" @update:model-value="emit('update:statistic', String($event))"><SelectTrigger class="w-auto min-w-[120px]" :aria-label="t('v7optimize.statistic')"><span>{{ meta.selected_statistic || 'mean' }}</span></SelectTrigger><SelectContent><SelectItem v-for="stat in meta.available_statistics || ['mean']" :key="stat" :value="stat">{{ stat }}</SelectItem></SelectContent></SelectRoot></label>
    <details ref="picker" class="relative" data-test="pareto-columns-picker">
      <summary class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" :title="t('v7optimize.columns')">{{ t('v7optimize.columnsCount', { count: columns.length }) }}</summary>
      <div class="absolute top-[calc(100%+6px)] right-0 z-[80] max-h-[360px] w-[min(360px,calc(100vw-32px))] overflow-auto rounded-lg border border-border-default bg-panel p-2.5 shadow-[0_12px_28px_rgb(0_0_0/0.35)]">
        <div class="grid gap-1 mb-2">
          <label v-for="metric in availableMetrics" :key="metric" class="flex min-w-0 items-center gap-2 rounded-[5px] px-[7px] py-[5px] text-xs text-primary hover:bg-accent/10">
            <Checkbox :data-pareto-metric="metric" :model-value="columns.includes(metric)" @update:model-value="emit('toggleColumn', metric, ($event === true))" />
            <span>{{ pillLabel(metric) }}</span>
          </label>
        </div>
        <div class="flex justify-end gap-1.5">
          <Button variant="default" size="sm" type="button" data-test="pareto-columns-defaults" @click="emit('resetColumns')">{{ t('v7optimize.columnsDefaults') }}</Button>
          <Button variant="default" size="sm" type="button" :title="t('v7optimize.columnsAllTitle')" @click="emit('selectAllColumns')">{{ t('v7optimize.columnsAll') }}</Button>
          <Button variant="default" size="sm" type="button" @click="closePicker">{{ t('v7optimize.columnsDone') }}</Button>
        </div>
      </div>
    </details>
    <span class="flex-1"></span>
    <Button type="button" variant="default" size="sm" data-test="select-all-paretos" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</Button>
    <Button type="button" variant="default" size="sm" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</Button>
  </div>
  <div ref="wrap" class="opt-table-wrap min-h-0 flex-1 overflow-auto rounded-md border border-border-default">
    <table class="opt-table w-full border-separate border-spacing-0 text-sm max-[800px]:min-w-[720px]">
      <thead><tr><th @click="emit('sort', 'name')">{{ t('v7optimize.thName') }}</th><template v-if="summaryKeys.length"><th v-for="key in summaryKeys" :key="key" :data-sort-key="`summary:${key}`" @click="emit('sort', `summary:${key}`)">{{ key }}</th></template><th v-else>{{ t('v7optimize.thSummary') }}</th><th @click="emit('sort', 'modified')">{{ t('v7optimize.thModified') }}</th><th>{{ t('v7optimize.thActions') }}</th></tr></thead>
      <tbody ref="tbody">
        <tr v-for="row in rows" :key="row.path" :data-path="row.path" :class="{ selected: selected.has(row.path) }">
          <td class="font-mono font-medium">{{ row.name }}</td>
          <template v-if="summaryKeys.length"><td v-for="key in summaryKeys" :key="key" :data-metric="key" class="tabular-nums">{{ summaryValue(row, key) }}</td></template><td v-else class="max-w-[460px] tabular-nums">{{ inlineSummary(row) }}</td>
          <td class="tabular-nums text-xs text-secondary">{{ row.modified || '—' }}</td>
          <td class="whitespace-nowrap! overflow-visible!" @click.stop><Button type="button" variant="default" size="sm" @click="emit('view', row)">{{ t('v7optimize.viewJson') }}</Button><Button type="button" variant="default" size="sm" @click="emit('seed', row)">{{ t('v7optimize.useAsSeed') }}</Button><Button type="button" variant="default" size="sm" v-if="!isV8" @click="emit('migrate', row)">{{ t('v7optimize.convertParetoToPb8') }}</Button></td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="totalColumns" class="p-8! text-center">
            <EmptyState
              :title="resultName ? t('v7optimize.noParetoFilesFound') : t('v7optimize.chooseResultSetFirst')"
              :message="resultName ? undefined : t('v7optimize.emptyParetosHelp')"
              :action-label="resultName ? undefined : t('v7optimize.backToResults')"
              @action="emit('goToResults')"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
