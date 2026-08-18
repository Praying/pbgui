<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { useI18n } from 'vue-i18n';
import type { ConfigSummary } from '../types';

const props = defineProps<{
  rows: ConfigSummary[];
  selected: Set<string>;
  search: string;
  isV8: boolean;
}>();
const emit = defineEmits<{
  'update:search': [value: string];
  toggle: [name: string];
  edit: [name: string];
  duplicate: [name: string];
  sort: [key: string];
  selectAll: [];
  clearSelection: [];
  selectRange: [paths: string[], selected: boolean];
}>();
const { t } = useI18n();
const selectedCount = computed(() => props.selected.size);
function rowName(row: ConfigSummary): string { return String(row.name || ''); }
function exchange(row: ConfigSummary): string {
  const value = row.exchanges ?? row.exchange;
  return Array.isArray(value) ? value.join(', ') : String(value || '');
}
function value(row: ConfigSummary, ...keys: string[]): string { for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== '') return String(row[key]); return '—'; }
function flags(row: ConfigSummary): string { const raw = row.flags; return Array.isArray(raw) ? raw.map(String).join(', ') : String(raw || '—'); }
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
    <input
      class="opt-input opt-search"
      :value="search"
      :placeholder="t('v7optimize.searchOptimizeName')"
      @input="emit('update:search', ($event.target as HTMLInputElement).value)"
    />
    <span class="opt-muted">{{ t('v7optimize.configCount', { count: rows.length }) }}</span>
    <span v-if="selectedCount" class="opt-muted">{{ t('v7optimize.configsSelected', { count: selectedCount }) }}</span>
    <span class="opt-grow"></span>
    <button class="opt-btn small" data-test="select-all-configs" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</button>
    <button class="opt-btn small" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</button>
  </div>
  <div ref="wrap" class="opt-table-wrap">
    <table class="opt-table">
      <thead><tr><th @click="emit('sort', 'name')">{{ t('v7optimize.thName') }}</th><th @click="emit('sort', 'exchange')">{{ t('v7optimize.thExchange') }}</th><th v-if="isV8" @click="emit('sort', 'strategy')">{{ t('v7optimize.thStrategy') }}</th><th @click="emit('sort', 'backtest_count')">{{ t('v7optimize.thBacktests') }}</th><th @click="emit('sort', 'start')">{{ t('v7optimize.thStart') }}</th><th @click="emit('sort', 'end')">{{ t('v7optimize.thEnd') }}</th><th>{{ t('v7optimize.thFlags') }}</th><th @click="emit('sort', 'modified')">{{ t('v7optimize.thModified') }}</th><th>{{ t('v7optimize.thActions') }}</th></tr></thead>
      <tbody ref="tbody">
        <tr
          v-for="row in rows"
          :key="rowName(row)"
          :data-path="rowName(row)"
          :class="{ selected: selected.has(rowName(row)) }"
          @dblclick="emit('edit', rowName(row))"
        >
          <td class="opt-mono">{{ rowName(row) }}</td>
          <td>{{ exchange(row) }}</td>
          <td v-if="isV8">{{ row.strategy || '—' }}</td>
          <td>{{ row.backtest_count ?? 0 }}</td>
          <td>{{ value(row, 'start', 'start_date') }}</td>
          <td>{{ value(row, 'end', 'end_date') }}</td>
          <td>{{ flags(row) }}</td>
          <td>{{ row.modified || '—' }}</td>
          <td class="opt-actions actions-cell" @click.stop>
            <button class="opt-btn small" @click="emit('edit', rowName(row))">{{ t('v7optimize.editConfig') }}</button>
            <button class="opt-btn small" @click="emit('duplicate', rowName(row))">{{ t('v7optimize.duplicate') }}</button>
          </td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="isV8 ? 9 : 8" class="opt-empty">{{ t('v7optimize.noOptimizeConfigsFound') }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
