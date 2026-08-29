<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
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
  <div class="opt-panel-controls mb-2.5 flex flex-wrap items-center gap-2.5">
    <div class="opt-panel-search">
      <Input class="min-w-60" :model-value="search" :placeholder="t('v7optimize.searchOptimizeName')" @update:model-value="emit('update:search', String($event ?? ''))" />
    </div>
    <div class="opt-panel-counts">
      <span class="opt-panel-count">{{ t('v7optimize.resultSetCount', { count: rows.length }) }}</span>
      <span v-if="selectedCount" class="opt-panel-count opt-panel-count--selected">{{ t('v7optimize.resultsSelected', { count: selectedCount }) }}</span>
    </div>
    <span class="flex-1"></span>
    <Button type="button" variant="default" size="sm" data-test="select-all-results" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</Button>
    <Button type="button" variant="default" size="sm" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</Button>
  </div>
  <div ref="wrap" class="opt-table-wrap min-h-0 flex-1 overflow-auto rounded-md border border-border-default">
    <table class="opt-table w-full border-separate border-spacing-0 text-sm max-[800px]:min-w-[720px]">
      <thead><tr><th @click="emit('sort', 'name')">{{ t('v7optimize.thName') }}</th><th @click="emit('sort', 'result')">{{ t('v7optimize.thResult') }}</th><th v-if="isV8" @click="emit('sort', 'strategy')">{{ t('v7optimize.thStrategy') }}</th><th @click="emit('sort', 'pareto_count')">{{ t('v7optimize.thParetos') }}</th><th @click="emit('sort', 'mode')">{{ t('v7optimize.thMode') }}</th><th @click="emit('sort', 'modified')">{{ t('v7optimize.thModified') }}</th><th>{{ t('v7optimize.thActions') }}</th></tr></thead>
      <tbody ref="tbody">
        <tr v-for="row in rows" :key="path(row)" :data-path="path(row)" :class="{ selected: selected.has(path(row)), 'is-open': selectedPath === path(row) }" @dblclick="hasPareto(row) && emit('open', row)">
          <td class="font-mono">{{ displayName(row) }}</td>
          <td class="max-w-[460px] font-mono">{{ row.result || '—' }}</td>
          <td v-if="isV8" class="font-mono">{{ row.strategy || '—' }}</td>
          <td>{{ row.pareto_count ?? 0 }}</td>
          <td>{{ mode(row) }}</td>
          <td>{{ row.modified || '—' }}</td>
          <td class="whitespace-nowrap! overflow-visible!" @click.stop>
            <Button type="button" variant="default" size="sm" v-if="hasPareto(row)" data-action="paretos" @click="emit('open', row)">{{ t('v7optimize.paretos') }}</Button>
            <Button type="button" variant="default" size="sm" v-if="hasPareto(row)" data-action="explorer" @click="emit('action', row, 'explorer')">{{ t('v7optimize.paretoExplorer') }}</Button>
            <Button type="button" variant="default" size="sm" v-if="supportsDash(row)" data-action="dash" @click="emit('action', row, 'dash')">{{ t('v7optimize.pdParetoDash') }}</Button>
            <Button type="button" variant="default" size="sm" v-if="supports3d(row)" data-action="plot3d" @click="emit('action', row, 'plot3d')">{{ t('v7optimize.plot3d') }}</Button>
            <Button type="button" variant="default" size="sm" v-if="hasPareto(row)" data-action="continue" @click="emit('action', row, 'continue')">{{ t('v7optimize.continueOptimize') }}</Button>
            <Button type="button" variant="default" size="sm" v-if="resumable(row)" data-action="resume" @click="emit('action', row, 'resume')">{{ t('v7optimize.resumeCheckpoint') }}</Button>
            <Button type="button" variant="default" size="sm" v-if="hasConfig(row)" data-action="config" @click="emit('action', row, 'config')">{{ t('v7optimize.configDraft') }}</Button>
          </td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="isV8 ? 7 : 6" class="p-[30px]! text-center text-secondary">{{ t('v7optimize.noOptimizeResultsFound') }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
