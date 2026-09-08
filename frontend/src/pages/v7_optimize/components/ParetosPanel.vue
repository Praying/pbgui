<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhArrowRight, PhDna, PhFileText } from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { EmptyRow, ListFooter, ListWrap, SortTh, Table, TdActions, Th } from '@/shared/components/ui/table';
import PbIcon from '@/shared/components/PbIcon.vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { PARETO_METRIC_PILL_LABELS } from '../lib/configModel';
import type { ParetoItem, ParetoMeta, ResultSummary } from '../types';

const props = withDefaults(
  defineProps<{
    rows: ParetoItem[];
    meta: ParetoMeta;
    resultName: string;
    selected: Set<string>;
    isV8: boolean;
    columns?: string[];
    availableMetrics?: string[];
    availableResults?: ResultSummary[];
    selectedResultPath?: string;
    holdoutValidationMode?: 'holdout_only' | 'full_timerange' | 'holdout_and_full_timerange' | 'all_timeranges';
    sort?: { key: string; direction: 'asc' | 'desc' };
  }>(),
  { sort: () => ({ key: 'name', direction: 'asc' }) },
);
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
  'update:holdoutValidationMode': [value: 'holdout_only' | 'full_timerange' | 'holdout_and_full_timerange' | 'all_timeranges'];
}>();
const { locale, t } = useI18n();
const picker = ref<HTMLDetailsElement | null>(null);
const columns = computed(() => (Array.isArray(props.columns) ? props.columns : []));
const availableMetrics = computed(() => (Array.isArray(props.availableMetrics) ? props.availableMetrics : []));
const selectedCount = computed(() => props.selected.size);
const allSelected = computed(() => props.rows.length > 0 && props.rows.every((row) => props.selected.has(row.path)));
const validationModeLabel = computed(() => locale.value === 'zh' ? '验证模式' : 'Validation mode');
const holdoutValidationModeLabel = computed(() => {
  switch (props.holdoutValidationMode) {
    case 'full_timerange':
      return t('v7optimize.fullTimerangeOnly');
    case 'holdout_and_full_timerange':
      return t('v7optimize.holdoutAndFullTimerange');
    case 'all_timeranges':
      return t('v7optimize.allTimeranges');
    default:
      return t('v7optimize.holdoutOnly');
  }
});
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
/* name + checkbox + modified + actions (metrics add their own columns). */
const totalColumns = computed(() => (summaryKeys.value.length ? summaryKeys.value.length + 4 : 5));
function summaryValue(row: ParetoItem, key: string): string {
  const value = row.summary?.[key];
  return value === undefined || value === null ? '-' : typeof value === 'number' ? String(Number(value.toPrecision(6))) : String(value);
}
function inlineSummary(row: ParetoItem): string {
  return Object.entries(row.summary || {}).slice(0, 4).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') || '-';
}
/* Trim the noisy ISO microseconds (:47.207418) to YYYY-MM-DD HH:MM. */
function shortDateTime(input: unknown): string {
  const text = String(input ?? '');
  const withTime = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (withTime) return `${withTime[1]} ${withTime[2]}`;
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return dateOnly?.[1] ?? text;
}
const iconActionClass = 'size-7 shrink-0 rounded-md border border-border-default bg-elevated text-secondary shadow-none hover:border-accent/45 hover:bg-accent/10 hover:text-accent-soft';
function closePicker(): void {
  if (picker.value) picker.value.open = false;
}
const wrap = ref<InstanceType<typeof ListWrap> | null>(null);
const tbody = ref<HTMLElement | null>(null);
const dragSelect = useRowDragSelect({
  getRows: () => tbody.value ? Array.from(tbody.value.querySelectorAll('tr[data-path]')) : [],
  getWrap: () => wrap.value?.root ?? null,
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

    <label v-if="isV8" class="inline-flex items-center gap-1.5 text-xs text-secondary">
      {{ validationModeLabel }}
      <SelectRoot :model-value="holdoutValidationMode || 'holdout_only'" @update:model-value="emit('update:holdoutValidationMode', String($event) as 'holdout_only' | 'full_timerange' | 'holdout_and_full_timerange' | 'all_timeranges')">
        <SelectTrigger class="w-auto min-w-[180px]" :aria-label="validationModeLabel">
          <span>{{ holdoutValidationModeLabel }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="holdout_only">{{ t('v7optimize.holdoutOnly') }}</SelectItem>
          <SelectItem value="full_timerange">{{ t('v7optimize.fullTimerangeOnly') }}</SelectItem>
          <SelectItem value="holdout_and_full_timerange">{{ t('v7optimize.holdoutAndFullTimerange') }}</SelectItem>
          <SelectItem value="all_timeranges">{{ t('v7optimize.allTimeranges') }}</SelectItem>
        </SelectContent>
      </SelectRoot>
    </label>

    <label v-if="(meta.scenario_labels || []).length" class="inline-flex items-center gap-1.5 text-xs text-secondary">{{ t('v7optimize.scenario') }}<SelectRoot :model-value="meta.selected_scenario || 'Aggregated'" @update:model-value="emit('update:scenario', String($event))"><SelectTrigger class="w-auto min-w-[120px]" :aria-label="t('v7optimize.scenario')"><span>{{ meta.selected_scenario || 'Aggregated' }}</span></SelectTrigger><SelectContent><SelectItem v-for="scenario in meta.scenario_labels" :key="scenario" :value="scenario">{{ scenario }}</SelectItem></SelectContent></SelectRoot></label>
    <label class="inline-flex items-center gap-1.5 text-xs text-secondary">{{ t('v7optimize.statistic') }}<SelectRoot :model-value="meta.selected_statistic || 'mean'" @update:model-value="emit('update:statistic', String($event))"><SelectTrigger class="w-auto min-w-[120px]" :aria-label="t('v7optimize.statistic')"><span>{{ meta.selected_statistic || 'mean' }}</span></SelectTrigger><SelectContent><SelectItem v-for="statistic in meta.available_statistics || ['mean']" :key="statistic" :value="statistic">{{ statistic }}</SelectItem></SelectContent></SelectRoot></label>
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
    <span v-if="selectedCount" class="text-xs font-medium text-accent-soft" aria-live="polite">{{ t('v7optimize.paretosSelected', { count: selectedCount }) }}</span>
    <Button type="button" variant="default" size="sm" :disabled="!rows.length" data-test="select-all-paretos" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</Button>
    <Button type="button" variant="default" size="sm" :disabled="!selectedCount" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</Button>
  </div>
  <div class="opt-table-frame">
    <ListWrap ref="wrap" class="opt-table-wrap min-h-0 flex-1 overflow-auto">
      <Table class="opt-table opt-table--paretos max-[800px]:min-w-[720px]">
        <thead>
          <tr>
            <Th class="w-10 pr-1!"><Checkbox :model-value="allSelected" :disabled="!rows.length" :aria-label="t('v7optimize.selectAll')" data-test="paretos-select-all-check" @update:model-value="allSelected ? emit('clearSelection') : emit('selectAll')" /></Th>
            <SortTh sort-key="name" :label="t('v7optimize.thName')" :sort="sort.key === 'name' ? sort.direction : undefined" @sort="emit('sort', 'name')" />
            <template v-if="summaryKeys.length"><SortTh v-for="key in summaryKeys" :key="key" :sort-key="`summary:${key}`" :label="key" :data-sort-key="`summary:${key}`" :sort="sort.key === `summary:${key}` ? sort.direction : undefined" @sort="emit('sort', `summary:${key}`)" /></template>
            <Th v-else>{{ t('v7optimize.thSummary') }}</Th>
            <SortTh sort-key="modified" :label="t('v7optimize.thModified')" :sort="sort.key === 'modified' ? sort.direction : undefined" @sort="emit('sort', 'modified')" />
            <Th>{{ t('v7optimize.thActions') }}</Th>
          </tr>
        </thead>
        <tbody ref="tbody">
          <tr v-for="row in rows" :key="row.path" :data-path="row.path" :class="{ selected: selected.has(row.path) }">
            <td class="w-10 pr-1!" @click.stop>
              <Checkbox :model-value="selected.has(row.path)" :aria-label="row.name" @update:model-value="emit('toggle', row.path)" />
            </td>
            <td class="max-w-[280px] truncate font-mono font-medium" :title="row.name">{{ row.name }}</td>
            <template v-if="summaryKeys.length"><td v-for="key in summaryKeys" :key="key" :data-metric="key" class="tabular-nums">{{ summaryValue(row, key) }}</td></template>
            <td v-else class="max-w-[460px] tabular-nums">{{ inlineSummary(row) }}</td>
            <td class="tabular-nums text-xs text-secondary" :title="String(row.modified || '')">{{ shortDateTime(row.modified) || '-' }}</td>
            <TdActions>
              <Button type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.viewJson')" :aria-label="t('v7optimize.viewJson')" data-test="pareto-view" @click="emit('view', row)"><PbIcon :icon="PhFileText" :size="16" /></Button>
              <Button type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.useAsSeed')" :aria-label="t('v7optimize.useAsSeed')" data-test="pareto-seed" @click="emit('seed', row)"><PbIcon :icon="PhDna" :size="16" /></Button>
              <Button type="button" variant="default" size="icon" :class="iconActionClass" v-if="!isV8" :title="t('v7optimize.convertParetoToPb8')" :aria-label="t('v7optimize.convertParetoToPb8')" data-test="pareto-migrate" @click="emit('migrate', row)"><PbIcon :icon="PhArrowRight" :size="16" /></Button>
            </TdActions>
          </tr>
          <EmptyRow
            v-if="!rows.length"
            :colspan="totalColumns"
            :title="resultName ? t('v7optimize.noParetoFilesFound') : t('v7optimize.chooseResultSetFirst')"
            :message="resultName ? undefined : t('v7optimize.emptyParetosHelp')"
            :action-label="resultName ? undefined : t('v7optimize.backToResults')"
            @action="emit('goToResults')"
          />
        </tbody>
      </Table>
    </ListWrap>
    <ListFooter data-test="paretos-list-footer">
      <span class="tabular-nums">{{ t('v7optimize.paretosCount', { count: rows.length }) }}</span>
      <span v-if="selectedCount" class="font-medium text-accent-soft tabular-nums">{{ t('v7optimize.paretosSelected', { count: selectedCount }) }}</span>
    </ListFooter>
  </div>
</template>
