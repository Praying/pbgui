<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { PhArrowsClockwise, PhChartBar, PhCube, PhFileText, PhPlant, PhSquaresFour, PhTarget } from '@phosphor-icons/vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { EmptyRow, ListFooter, ListWrap, SortTh, Table, TdActions, Th } from '@/shared/components/ui/table';
import PbIcon from '@/shared/components/PbIcon.vue';
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

function onResultRowKeydown(event: KeyboardEvent, resultPath: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  emit('toggle', resultPath);
}
/* Trim the noisy ISO microseconds (:47.207418) to YYYY-MM-DD HH:MM. */
function shortDateTime(input: unknown): string {
  const text = String(input ?? '');
  const withTime = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (withTime) return `${withTime[1]} ${withTime[2]}`;
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return dateOnly?.[1] ?? text;
}
/* Conditionally rendered row actions (up to 7) are icon buttons aligned with
   the workbench rail icons for the same actions; data-action keys are a test contract. */
const iconActionClass = 'size-7 shrink-0 rounded-md border border-border-default bg-elevated text-secondary shadow-none hover:border-accent/45 hover:bg-accent/10 hover:text-accent-soft';
const wrap = ref<InstanceType<typeof ListWrap> | null>(null);
const tbody = ref<HTMLElement | null>(null);
const dragSelect = useRowDragSelect({
  getRows: () => tbody.value ? Array.from(tbody.value.querySelectorAll('tr[data-path]')) : [],
  getWrap: () => wrap.value?.root ?? null,
  isSelected: (rowPath) => props.selected.has(rowPath),
  onToggle: (rowPath) => emit('toggle', rowPath),
  onSelectRange: (paths, selected) => emit('selectRange', paths, selected),
});
onBeforeUnmount(() => dragSelect.dispose());
</script>

<template>
  <div class="opt-panel flex min-h-0 flex-1 flex-col">
    <div class="opt-panel-controls opt-filter-bar pbgui-list-toolbar mb-2.5 flex flex-wrap items-center gap-2.5">
      <div class="opt-panel-search" role="search">
        <Input class="min-w-60" :model-value="search" :placeholder="t('v7optimize.searchOptimizeName')" @update:model-value="emit('update:search', String($event ?? ''))" />
      </div>
      <span class="flex-1"></span>
      <Button type="button" variant="default" size="sm" :disabled="!rows.length" data-test="select-all-results" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</Button>
      <Button type="button" variant="default" size="sm" :disabled="!selectedCount" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</Button>
    </div>
    <div class="opt-table-frame flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-panel shadow-panel">
      <ListWrap ref="wrap" class="opt-table-wrap min-h-0 flex-1 overflow-auto bg-panel">
        <Table class="opt-table opt-table--results max-[800px]:min-w-[720px] select-none bg-transparent">
          <thead>
            <tr>
              <SortTh sort-key="name" :label="t('v7optimize.thName')" :sort="sort.key === 'name' ? sort.direction : undefined" @sort="emit('sort', 'name')" />
              <SortTh sort-key="result" :label="t('v7optimize.thResult')" :sort="sort.key === 'result' ? sort.direction : undefined" @sort="emit('sort', 'result')" />
              <SortTh v-if="isV8" sort-key="strategy" :label="t('v7optimize.thStrategy')" :sort="sort.key === 'strategy' ? sort.direction : undefined" @sort="emit('sort', 'strategy')" />
              <SortTh sort-key="pareto_count" :label="t('v7optimize.thParetos')" :sort="sort.key === 'pareto_count' ? sort.direction : undefined" @sort="emit('sort', 'pareto_count')" />
              <SortTh sort-key="mode" :label="t('v7optimize.thMode')" :sort="sort.key === 'mode' ? sort.direction : undefined" @sort="emit('sort', 'mode')" />
              <SortTh sort-key="modified" :label="t('v7optimize.thModified')" :sort="sort.key === 'modified' ? sort.direction : undefined" @sort="emit('sort', 'modified')" />
              <Th>{{ t('v7optimize.thActions') }}</Th>
            </tr>
          </thead>
          <tbody ref="tbody">
            <tr
              v-for="row in rows"
              :key="path(row)"
              :data-path="path(row)"
              class="result-row cursor-pointer outline-none"
              :class="{ selected: selected.has(path(row)), 'is-open': selectedPath === path(row) }"
              :aria-selected="selected.has(path(row)) ? 'true' : 'false'"
              tabindex="0"
              @click="emit('toggle', path(row))"
              @dblclick="hasPareto(row) && emit('open', row)"
              @keydown="onResultRowKeydown($event, path(row))"
            >
              <td class="max-w-[280px] truncate font-mono" :title="displayName(row)">{{ displayName(row) }}</td>
              <td class="max-w-[360px] truncate font-mono text-xs" :title="String(row.result || '')">{{ row.result || '-' }}</td>
              <td v-if="isV8"><span v-if="row.strategy" class="font-mono text-xs text-secondary">{{ row.strategy }}</span><span v-else class="text-muted">-</span></td>
              <td class="tabular-nums" :class="Number(row.pareto_count ?? 0) ? 'font-semibold' : 'text-muted'">{{ row.pareto_count ?? 0 }}</td>
              <td class="text-xs text-secondary">{{ mode(row) }}</td>
              <td class="tabular-nums text-xs text-secondary" :title="String(row.modified || '')">{{ shortDateTime(row.modified) || '-' }}</td>
              <TdActions>
                <Button v-if="hasPareto(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.paretos')" :aria-label="t('v7optimize.paretos')" data-action="paretos" @click.stop="emit('open', row)"><PbIcon :icon="PhChartBar" :size="16" /></Button>
                <Button v-if="hasPareto(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.paretoExplorer')" :aria-label="t('v7optimize.paretoExplorer')" data-action="explorer" @click.stop="emit('action', row, 'explorer')"><PbIcon :icon="PhTarget" :size="16" /></Button>
                <Button v-if="supportsDash(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.pdParetoDash')" :aria-label="t('v7optimize.pdParetoDash')" data-action="dash" @click.stop="emit('action', row, 'dash')"><PbIcon :icon="PhSquaresFour" :size="16" /></Button>
                <Button v-if="supports3d(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.plot3d')" :aria-label="t('v7optimize.plot3d')" data-action="plot3d" @click.stop="emit('action', row, 'plot3d')"><PbIcon :icon="PhCube" :size="16" /></Button>
                <Button v-if="hasPareto(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.continueOptimize')" :aria-label="t('v7optimize.continueOptimize')" data-action="continue" @click.stop="emit('action', row, 'continue')"><PbIcon :icon="PhPlant" :size="16" /></Button>
                <Button v-if="resumable(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.resumeCheckpoint')" :aria-label="t('v7optimize.resumeCheckpoint')" data-action="resume" @click.stop="emit('action', row, 'resume')"><PbIcon :icon="PhArrowsClockwise" :size="16" /></Button>
                <Button v-if="hasConfig(row)" type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.configDraft')" :aria-label="t('v7optimize.configDraft')" data-action="config" @click.stop="emit('action', row, 'config')"><PbIcon :icon="PhFileText" :size="16" /></Button>
              </TdActions>
            </tr>
            <EmptyRow
              v-if="!rows.length"
              :colspan="isV8 ? 7 : 6"
              :title="search ? t('v7optimize.noMatches') : t('v7optimize.noOptimizeResultsFound')"
              :message="search ? undefined : t('v7optimize.emptyResultsHelp')"
              :action-label="search ? undefined : t('v7optimize.openQueue')"
              @action="emit('goToQueue')"
            />
          </tbody>
        </Table>
      </ListWrap>
      <ListFooter data-test="results-list-footer">
        <span class="tabular-nums">{{ t('v7optimize.resultSetCount', { count: rows.length }) }}</span>
        <span v-if="selectedCount" class="font-medium text-accent-soft tabular-nums">{{ t('v7optimize.resultsSelected', { count: selectedCount }) }}</span>
      </ListFooter>
    </div>
  </div>
</template>
