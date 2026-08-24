<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { PARETO_METRIC_PILL_LABELS } from '../lib/configModel';
import type { ParetoItem, ParetoMeta } from '../types';

const props = defineProps<{ rows: ParetoItem[]; meta: ParetoMeta; resultName: string; selected: Set<string>; isV8: boolean; columns?: string[]; availableMetrics?: string[] }>();
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
}>();
const { t } = useI18n();
const picker = ref<HTMLDetailsElement | null>(null);
const columns = computed(() => (Array.isArray(props.columns) ? props.columns : []));
const availableMetrics = computed(() => (Array.isArray(props.availableMetrics) ? props.availableMetrics : []));
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
  <div class="mb-2.5 flex flex-wrap items-center gap-2.5">
    <span class="text-xs text-secondary">{{ resultName || t('v7optimize.chooseResultSetFirst') }}</span>
    <label v-if="(meta.scenario_labels || []).length" class="inline-flex items-center gap-1.5 text-xs text-secondary">{{ t('v7optimize.scenario') }}<select :value="meta.selected_scenario || 'Aggregated'" class="min-h-8 rounded-sm border border-border-default bg-panel px-[9px] py-1.5 text-primary" @change="emit('update:scenario', ($event.target as HTMLSelectElement).value)"><option v-for="scenario in meta.scenario_labels" :key="scenario" :value="scenario">{{ scenario }}</option></select></label>
    <label class="inline-flex items-center gap-1.5 text-xs text-secondary">{{ t('v7optimize.statistic') }}<select :value="meta.selected_statistic || 'mean'" class="min-h-8 rounded-sm border border-border-default bg-panel px-[9px] py-1.5 text-primary" @change="emit('update:statistic', ($event.target as HTMLSelectElement).value)"><option v-for="stat in meta.available_statistics || ['mean']" :key="stat" :value="stat">{{ stat }}</option></select></label>
    <details ref="picker" class="relative" data-test="pareto-columns-picker">
      <summary class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" :title="t('v7optimize.columns')">{{ t('v7optimize.columnsCount', { count: columns.length }) }}</summary>
      <div class="absolute top-[calc(100%+6px)] right-0 z-[80] max-h-[360px] w-[min(360px,calc(100vw-32px))] overflow-auto rounded-lg border border-border-default bg-panel p-2.5 shadow-[0_12px_28px_rgb(0_0_0/0.35)]">
        <div class="grid gap-1 mb-2">
          <label v-for="metric in availableMetrics" :key="metric" class="flex min-w-0 items-center gap-2 rounded-[5px] px-[7px] py-[5px] text-xs text-primary hover:bg-accent/10">
            <input type="checkbox" :data-pareto-metric="metric" :checked="columns.includes(metric)" @change="emit('toggleColumn', metric, ($event.target as HTMLInputElement).checked)" />
            <span>{{ pillLabel(metric) }}</span>
          </label>
        </div>
        <div class="flex justify-end gap-1.5">
          <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" type="button" data-test="pareto-columns-defaults" @click="emit('resetColumns')">{{ t('v7optimize.columnsDefaults') }}</button>
          <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" type="button" :title="t('v7optimize.columnsAllTitle')" @click="emit('selectAllColumns')">{{ t('v7optimize.columnsAll') }}</button>
          <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" type="button" @click="closePicker">{{ t('v7optimize.columnsDone') }}</button>
        </div>
      </div>
    </details>
    <span class="flex-1"></span>
    <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" data-test="select-all-paretos" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</button>
    <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</button>
  </div>
  <div ref="wrap" class="min-h-0 flex-1 overflow-auto rounded-md border border-border-default">
    <table class="opt-table w-full border-separate border-spacing-0 text-sm max-[800px]:min-w-[720px]">
      <thead><tr><th @click="emit('sort', 'name')">{{ t('v7optimize.thName') }}</th><template v-if="summaryKeys.length"><th v-for="key in summaryKeys" :key="key" :data-sort-key="`summary:${key}`" @click="emit('sort', `summary:${key}`)">{{ key }}</th></template><th v-else>{{ t('v7optimize.thSummary') }}</th><th @click="emit('sort', 'modified')">{{ t('v7optimize.thModified') }}</th><th>{{ t('v7optimize.thActions') }}</th></tr></thead>
      <tbody ref="tbody">
        <tr v-for="row in rows" :key="row.path" :data-path="row.path" :class="{ selected: selected.has(row.path) }">
          <td class="font-mono">{{ row.name }}</td>
          <template v-if="summaryKeys.length"><td v-for="key in summaryKeys" :key="key" :data-metric="key">{{ summaryValue(row, key) }}</td></template><td v-else class="max-w-[460px]">{{ inlineSummary(row) }}</td>
          <td>{{ row.modified || '—' }}</td>
          <td class="whitespace-nowrap! overflow-visible!" @click.stop><button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" @click="emit('view', row)">{{ t('v7optimize.viewJson') }}</button><button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" @click="emit('seed', row)">{{ t('v7optimize.useAsSeed') }}</button><button v-if="!isV8" class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" @click="emit('migrate', row)">{{ t('v7optimize.convertParetoToPb8') }}</button></td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="summaryKeys.length + 3" class="p-[30px]! text-center text-secondary">{{ t('v7optimize.noParetoFilesFound') }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
