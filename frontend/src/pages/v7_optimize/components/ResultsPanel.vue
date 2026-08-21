<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { useI18n } from 'vue-i18n';
import type { ResultSummary } from '../types';

const props = defineProps<{ rows: ResultSummary[]; selected: Set<string>; search: string; selectedPath: string; isV8: boolean }>();
const emit = defineEmits<{
  'update:search': [value: string];
  toggle: [path: string];
  open: [row: ResultSummary];
  action: [row: ResultSummary, action: 'config' | 'explorer' | 'plot3d' | 'dash' | 'continue' | 'resume'];
  sort: [key: string];
  selectAll: [];
  clearSelection: [];
  selectRange: [paths: string[], selected: boolean];
}>();
const { t } = useI18n();
const selectedCount = computed(() => props.selected.size);
function path(row: ResultSummary): string { return String(row.path || ''); }
function displayName(row: ResultSummary): string { return String(row.name || row.result || path(row)); }
function hasPareto(row: ResultSummary): boolean { return props.isV8 ? row.has_pareto === true : Number(row.pareto_count || 0) > 0; }
function hasConfig(row: ResultSummary): boolean { return props.isV8 ? row.has_config === true : true; }
function supports3d(row: ResultSummary): boolean { return props.isV8 ? row.supports_3d === true : hasPareto(row); }
function supportsDash(row: ResultSummary): boolean { return props.isV8 ? row.supports_dash === true : hasPareto(row); }
function resumable(row: ResultSummary): boolean { return props.isV8 && row.resumable === true; }
function mode(row: ResultSummary): string {
  const label = String(row.mode || 'single');
  const count = Number(row.scenario_count || 0);
  return count > 0 ? `${label} · ${count}` : label;
}
const wrap = ref<HTMLElement | null>(null);
const tbody = ref<HTMLElement | null>(null);
const dragSelect = useRowDragSelect({
  getRows: () => tbody.value ? Array.from(tbody.value.querySelectorAll('tr[data-path]')) : [],
  getWrap: () => wrap.value,
  isSelected: (rowPath) => props.selected.has(rowPath),
  onToggle: (rowPath) => emit('toggle', rowPath),
  onSelectRange: (paths, selected) => emit('selectRange', paths, selected),
});
onBeforeUnmount(() => dragSelect.dispose());
</script>

<template>
  <div class="opt-toolbar">
    <input class="opt-input opt-search" :value="search" :placeholder="t('v7optimize.searchOptimizeName')" @input="emit('update:search', ($event.target as HTMLInputElement).value)" />
    <span class="opt-muted">{{ t('v7optimize.resultSetCount', { count: rows.length }) }}</span>
    <span v-if="selectedCount" class="opt-muted">{{ t('v7optimize.resultsSelected', { count: selectedCount }) }}</span>
    <span class="opt-grow"></span>
    <button class="opt-btn pbgui-action small" data-test="select-all-results" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</button>
    <button class="opt-btn pbgui-action small" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</button>
  </div>
  <div ref="wrap" class="opt-table-wrap">
    <table class="opt-table">
      <thead><tr><th @click="emit('sort', 'name')">{{ t('v7optimize.thName') }}</th><th @click="emit('sort', 'result')">{{ t('v7optimize.thResult') }}</th><th v-if="isV8" @click="emit('sort', 'strategy')">{{ t('v7optimize.thStrategy') }}</th><th @click="emit('sort', 'pareto_count')">{{ t('v7optimize.thParetos') }}</th><th @click="emit('sort', 'mode')">{{ t('v7optimize.thMode') }}</th><th @click="emit('sort', 'modified')">{{ t('v7optimize.thModified') }}</th><th>{{ t('v7optimize.thActions') }}</th></tr></thead>
      <tbody ref="tbody">
        <tr v-for="row in rows" :key="path(row)" :data-path="path(row)" :class="{ selected: selected.has(path(row)), 'is-open': selectedPath === path(row) }" @dblclick="hasPareto(row) && emit('open', row)">
          <td class="opt-mono">{{ displayName(row) }}</td>
          <td class="opt-mono opt-ellipsis">{{ row.result || '—' }}</td>
          <td v-if="isV8" class="opt-mono">{{ row.strategy || '—' }}</td>
          <td>{{ row.pareto_count ?? 0 }}</td>
          <td>{{ mode(row) }}</td>
          <td>{{ row.modified || '—' }}</td>
          <td class="opt-actions actions-cell" @click.stop>
            <button v-if="hasPareto(row)" class="opt-btn pbgui-action small" data-action="paretos" @click="emit('open', row)">{{ t('v7optimize.paretos') }}</button>
            <button v-if="hasPareto(row)" class="opt-btn pbgui-action small" data-action="explorer" @click="emit('action', row, 'explorer')">{{ t('v7optimize.paretoExplorer') }}</button>
            <button v-if="supportsDash(row)" class="opt-btn pbgui-action small" data-action="dash" @click="emit('action', row, 'dash')">{{ t('v7optimize.pdParetoDash') }}</button>
            <button v-if="supports3d(row)" class="opt-btn pbgui-action small" data-action="plot3d" @click="emit('action', row, 'plot3d')">{{ t('v7optimize.plot3d') }}</button>
            <button v-if="hasPareto(row)" class="opt-btn pbgui-action small" data-action="continue" @click="emit('action', row, 'continue')">{{ t('v7optimize.continueOptimize') }}</button>
            <button v-if="resumable(row)" class="opt-btn pbgui-action small" data-action="resume" @click="emit('action', row, 'resume')">{{ t('v7optimize.resumeCheckpoint') }}</button>
            <button v-if="hasConfig(row)" class="opt-btn pbgui-action small" data-action="config" @click="emit('action', row, 'config')">{{ t('v7optimize.configDraft') }}</button>
          </td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="isV8 ? 7 : 6" class="opt-empty">{{ t('v7optimize.noOptimizeResultsFound') }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
