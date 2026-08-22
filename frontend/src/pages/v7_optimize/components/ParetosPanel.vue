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
  <div class="opt-toolbar">
    <span class="opt-muted">{{ resultName || t('v7optimize.chooseResultSetFirst') }}</span>
    <label v-if="(meta.scenario_labels || []).length" class="opt-inline-field">{{ t('v7optimize.scenario') }}<select :value="meta.selected_scenario || 'Aggregated'" class="opt-input" @change="emit('update:scenario', ($event.target as HTMLSelectElement).value)"><option v-for="scenario in meta.scenario_labels" :key="scenario" :value="scenario">{{ scenario }}</option></select></label>
    <label class="opt-inline-field">{{ t('v7optimize.statistic') }}<select :value="meta.selected_statistic || 'mean'" class="opt-input" @change="emit('update:statistic', ($event.target as HTMLSelectElement).value)"><option v-for="stat in meta.available_statistics || ['mean']" :key="stat" :value="stat">{{ stat }}</option></select></label>
    <details ref="picker" class="pareto-columns-picker" data-test="pareto-columns-picker">
      <summary class="opt-btn pbgui-action small" :title="t('v7optimize.columns')">{{ t('v7optimize.columnsCount', { count: columns.length }) }}</summary>
      <div class="pareto-columns-menu">
        <div class="pareto-columns-options">
          <label v-for="metric in availableMetrics" :key="metric" class="pareto-columns-option">
            <input type="checkbox" :data-pareto-metric="metric" :checked="columns.includes(metric)" @change="emit('toggleColumn', metric, ($event.target as HTMLInputElement).checked)" />
            <span>{{ pillLabel(metric) }}</span>
          </label>
        </div>
        <div class="pareto-columns-actions">
          <button class="opt-btn pbgui-action small" type="button" data-test="pareto-columns-defaults" @click="emit('resetColumns')">{{ t('v7optimize.columnsDefaults') }}</button>
          <button class="opt-btn pbgui-action small" type="button" :title="t('v7optimize.columnsAllTitle')" @click="emit('selectAllColumns')">{{ t('v7optimize.columnsAll') }}</button>
          <button class="opt-btn pbgui-action small" type="button" @click="closePicker">{{ t('v7optimize.columnsDone') }}</button>
        </div>
      </div>
    </details>
    <span class="opt-grow"></span>
    <button class="opt-btn pbgui-action small" data-test="select-all-paretos" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</button>
    <button class="opt-btn pbgui-action small" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</button>
  </div>
  <div ref="wrap" class="opt-table-wrap">
    <table class="opt-table">
      <thead><tr><th @click="emit('sort', 'name')">{{ t('v7optimize.thName') }}</th><template v-if="summaryKeys.length"><th v-for="key in summaryKeys" :key="key" :data-sort-key="`summary:${key}`" @click="emit('sort', `summary:${key}`)">{{ key }}</th></template><th v-else>{{ t('v7optimize.thSummary') }}</th><th @click="emit('sort', 'modified')">{{ t('v7optimize.thModified') }}</th><th>{{ t('v7optimize.thActions') }}</th></tr></thead>
      <tbody ref="tbody">
        <tr v-for="row in rows" :key="row.path" :data-path="row.path" :class="{ selected: selected.has(row.path) }">
          <td class="opt-mono">{{ row.name }}</td>
          <template v-if="summaryKeys.length"><td v-for="key in summaryKeys" :key="key" :data-metric="key">{{ summaryValue(row, key) }}</td></template><td v-else class="opt-ellipsis">{{ inlineSummary(row) }}</td>
          <td>{{ row.modified || '—' }}</td>
          <td class="opt-actions actions-cell" @click.stop><button class="opt-btn pbgui-action small" @click="emit('view', row)">{{ t('v7optimize.viewJson') }}</button><button class="opt-btn pbgui-action small" @click="emit('seed', row)">{{ t('v7optimize.useAsSeed') }}</button><button v-if="!isV8" class="opt-btn pbgui-action small" @click="emit('migrate', row)">{{ t('v7optimize.convertParetoToPb8') }}</button></td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="summaryKeys.length + 3" class="opt-empty">{{ t('v7optimize.noParetoFilesFound') }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
