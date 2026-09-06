<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Component } from 'vue';
import { PhArrowsClockwise, PhCaretDown, PhCaretUp, PhChartBar, PhCube, PhFileText, PhPlant, PhSquaresFour, PhTarget } from '@phosphor-icons/vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import PbIcon from '@/shared/components/PbIcon.vue';
import EmptyState from '@/shared/components/EmptyState.vue';
import type { ResultSummary } from '../types';

const props = withDefaults(
  defineProps<{
    rows: ResultSummary[];
    selected: Set<string>;
    search: string;
    selectedPath: string;
    isV8: boolean;
    sort?: { key: string; direction: 'asc' | 'desc' };
  }>(),
  { sort: () => ({ key: 'modified', direction: 'desc' }) },
);
const emit = defineEmits<{
  'update:search': [value: string];
  toggle: [path: string];
  open: [row: ResultSummary];
  action: [row: ResultSummary, action: 'config' | 'explorer' | 'plot3d' | 'dash' | 'continue' | 'resume'];
  sort: [key: string];
  selectAll: [];
  clearSelection: [];
  selectRange: [paths: string[], selected: boolean];
  goToQueue: [];
}>();
const { t } = useI18n();
const selectedCount = computed(() => props.selected.size);
const allSelected = computed(() => props.rows.length > 0 && props.rows.every((row) => props.selected.has(path(row))));
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
/* Trim the noisy ISO microseconds (:47.207418) to YYYY-MM-DD HH:MM. */
function shortDateTime(input: unknown): string {
  const text = String(input ?? '');
  const withTime = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (withTime) return `${withTime[1]} ${withTime[2]}`;
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return dateOnly?.[1] ?? text;
}
function isSorted(key: string): boolean { return props.sort.key === key; }
function sortIcon(key: string): Component { return props.sort.key === key && props.sort.direction === 'desc' ? PhCaretDown : PhCaretUp; }
/* Conditionally rendered row actions (up to 7) are icon buttons aligned with
   the workbench rail icons for the same actions; data-action keys are a test contract. */
const iconActionClass = 'size-7 shrink-0 rounded-md border border-border-default bg-elevated text-secondary shadow-none hover:border-accent/45 hover:bg-accent/10 hover:text-accent-soft';
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
  <div class="opt-panel-controls opt-filter-bar pbgui-list-toolbar mb-2.5 flex flex-wrap items-center gap-2.5">
    <div class="opt-panel-search" role="search">
      <Input class="min-w-60" :model-value="search" :placeholder="t('v7optimize.searchOptimizeName')" @update:model-value="emit('update:search', String($event ?? ''))" />
    </div>
    <div class="opt-panel-counts flex items-center gap-2.5 text-xs text-secondary" aria-live="polite">
      <span>{{ t('v7optimize.resultSetCount', { count: rows.length }) }}</span>
      <span v-if="selectedCount" class="font-medium text-accent-soft">{{ t('v7optimize.resultsSelected', { count: selectedCount }) }}</span>
    </div>
    <span class="flex-1"></span>
    <Button type="button" variant="default" size="sm" :disabled="!rows.length" data-test="select-all-results" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</Button>
    <Button type="button" variant="default" size="sm" :disabled="!selectedCount" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</Button>
  </div>
  <div ref="wrap" class="opt-table-wrap opt-table-wrap--results pbgui-list-wrap min-h-0 flex-1 overflow-auto rounded-md border border-border-default">
    <table class="opt-table opt-table--results pbgui-list-table w-full border-separate border-spacing-0 text-sm max-[800px]:min-w-[720px]">
      <thead>
        <tr>
          <th class="w-10 pr-1!"><Checkbox :model-value="allSelected" :disabled="!rows.length" :aria-label="t('v7optimize.selectAll')" data-test="results-select-all-check" @update:model-value="allSelected ? emit('clearSelection') : emit('selectAll')" /></th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'name')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thName') }}<PbIcon v-if="isSorted('name')" :icon="sortIcon('name')" :size="12" class="text-accent-soft" /></span></th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'result')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thResult') }}<PbIcon v-if="isSorted('result')" :icon="sortIcon('result')" :size="12" class="text-accent-soft" /></span></th>
          <th v-if="isV8" class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'strategy')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thStrategy') }}<PbIcon v-if="isSorted('strategy')" :icon="sortIcon('strategy')" :size="12" class="text-accent-soft" /></span></th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'pareto_count')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thParetos') }}<PbIcon v-if="isSorted('pareto_count')" :icon="sortIcon('pareto_count')" :size="12" class="text-accent-soft" /></span></th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'mode')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thMode') }}<PbIcon v-if="isSorted('mode')" :icon="sortIcon('mode')" :size="12" class="text-accent-soft" /></span></th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'modified')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thModified') }}<PbIcon v-if="isSorted('modified')" :icon="sortIcon('modified')" :size="12" class="text-accent-soft" /></span></th>
          <th>{{ t('v7optimize.thActions') }}</th>
        </tr>
      </thead>
      <tbody ref="tbody">
        <tr v-for="row in rows" :key="path(row)" :data-path="path(row)" :class="{ selected: selected.has(path(row)), 'is-open': selectedPath === path(row) }" @dblclick="hasPareto(row) && emit('open', row)">
          <td class="w-10 pr-1!" @click.stop>
            <Checkbox :model-value="selected.has(path(row))" :aria-label="displayName(row)" @update:model-value="emit('toggle', path(row))" />
          </td>
          <td class="max-w-[280px] truncate font-mono" :title="displayName(row)">{{ displayName(row) }}</td>
          <td class="max-w-[360px] truncate font-mono text-xs" :title="String(row.result || '')">{{ row.result || '-' }}</td>
          <td v-if="isV8"><span v-if="row.strategy" class="font-mono text-xs text-secondary">{{ row.strategy }}</span><span v-else class="text-muted">-</span></td>
          <td class="tabular-nums" :class="Number(row.pareto_count ?? 0) ? 'font-semibold' : 'text-muted'">{{ row.pareto_count ?? 0 }}</td>
          <td class="text-xs text-secondary">{{ mode(row) }}</td>
          <td class="tabular-nums text-xs text-secondary" :title="String(row.modified || '')">{{ shortDateTime(row.modified) || '-' }}</td>
          <td class="pbgui-list-actions whitespace-nowrap! overflow-visible!" @click.stop>
            <div class="pbgui-list-actions__group">
              <Button v-if="hasPareto(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.paretos')" :aria-label="t('v7optimize.paretos')" data-action="paretos" @click="emit('open', row)"><PbIcon :icon="PhChartBar" :size="16" /></Button>
              <Button v-if="hasPareto(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.paretoExplorer')" :aria-label="t('v7optimize.paretoExplorer')" data-action="explorer" @click="emit('action', row, 'explorer')"><PbIcon :icon="PhTarget" :size="16" /></Button>
              <Button v-if="supportsDash(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.pdParetoDash')" :aria-label="t('v7optimize.pdParetoDash')" data-action="dash" @click="emit('action', row, 'dash')"><PbIcon :icon="PhSquaresFour" :size="16" /></Button>
              <Button v-if="supports3d(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.plot3d')" :aria-label="t('v7optimize.plot3d')" data-action="plot3d" @click="emit('action', row, 'plot3d')"><PbIcon :icon="PhCube" :size="16" /></Button>
              <Button v-if="hasPareto(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.continueOptimize')" :aria-label="t('v7optimize.continueOptimize')" data-action="continue" @click="emit('action', row, 'continue')"><PbIcon :icon="PhPlant" :size="16" /></Button>
              <Button v-if="resumable(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.resumeCheckpoint')" :aria-label="t('v7optimize.resumeCheckpoint')" data-action="resume" @click="emit('action', row, 'resume')"><PbIcon :icon="PhArrowsClockwise" :size="16" /></Button>
              <Button v-if="hasConfig(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.configDraft')" :aria-label="t('v7optimize.configDraft')" data-action="config" @click="emit('action', row, 'config')"><PbIcon :icon="PhFileText" :size="16" /></Button>
            </div>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="isV8 ? 8 : 7" class="p-8! text-center">
            <EmptyState
              :title="search ? t('v7optimize.noMatches') : t('v7optimize.noOptimizeResultsFound')"
              :message="search ? undefined : t('v7optimize.emptyResultsHelp')"
              :action-label="search ? undefined : t('v7optimize.openQueue')"
              @action="emit('goToQueue')"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
