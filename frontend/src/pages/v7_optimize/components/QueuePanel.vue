<script setup lang="ts">
import { PhArrowDown, PhArrowUp, PhArrowsClockwise, PhFileText, PhPencilSimple } from '@phosphor-icons/vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { EmptyRow, ListFooter, ListWrap, SortTh, Table, TdActions, Th } from '@/shared/components/ui/table';
import PbIcon from '@/shared/components/PbIcon.vue';
import type { QueueItem } from '../types';

const props = withDefaults(
  defineProps<{
    rows: QueueItem[];
    selected: Set<string>;
    search: string;
    sort?: { key: string; direction: 'asc' | 'desc' };
  }>(),
  { sort: () => ({ key: 'order', direction: 'asc' }) },
);
const emit = defineEmits<{
  'update:search': [value: string];
  toggle: [filename: string];
  action: [filename: string, action: 'start' | 'stop' | 'restart' | 'requeue'];
  edit: [filename: string];
  log: [row: QueueItem];
  move: [filename: string, delta: -1 | 1];
  sort: [key: string];
  selectAll: [];
  clearSelection: [];
  selectRange: [paths: string[], selected: boolean];
  reorder: [filenames: string[]];
  goToConfigs: [];
}>();
const { t } = useI18n();
const selectedCount = computed(() => props.selected.size);
const allSelected = computed(() => props.rows.length > 0 && props.rows.every((row) => props.selected.has(filename(row))));
function filename(row: QueueItem): string { return String(row.filename || ''); }
function exchangeText(row: QueueItem): string { return Array.isArray(row.exchange) ? row.exchange.join(', ') : String(row.exchange || ''); }
function isRunning(row: QueueItem): boolean { return row.status === 'running' || row.status === 'optimizing'; }
/* Status → Tailwind utility mapping (the former optimize.css .opt-status-*
   tints; Tailwind's scanner cannot see dynamically concatenated class
   names, so the branches spell them out). */
function statusClass(row: QueueItem): string {
  const status = String(row.status || 'queued').toLowerCase();
  if (status === 'complete') return 'bg-success/15 text-success';
  if (status === 'error') return 'bg-danger/15 text-danger';
  if (status === 'running' || status === 'optimizing') return 'bg-warning/15 text-warning-soft';
  return 'bg-secondary/15 text-secondary';
}
function progressPercent(row: QueueItem): number {
  const progress = row.progress;
  const evaluations = Number(progress?.eval);
  const target = Number(progress?.target_iters);
  if (Number.isFinite(evaluations) && Number.isFinite(target) && target > 0) {
    return Math.min(100, Math.max(0, Math.round((evaluations / target) * 100)));
  }
  const scan = progress?.evaluation_scan;
  if (scan && Number.isFinite(Number(scan.percent))) {
    return Math.min(100, Math.max(0, Math.round(Number(scan.percent))));
  }
  return 0;
}
function progressLabel(row: QueueItem): string {
  const progress = row.progress;
  const evaluations = Number(progress?.eval);
  if (!progress || !Number.isFinite(evaluations)) return '';
  const prefix = progress.estimated ? '≥ ' : '';
  const target = Number(progress.target_iters);
  const value = Number.isFinite(target) && target > 0
    ? `${prefix}${evaluations.toLocaleString()} / ${target.toLocaleString()} evals`
    : `${prefix}${evaluations.toLocaleString()} evals`;
  const scan = progress.evaluation_scan;
  if (scan && scan.complete === false && Number.isFinite(Number(scan.percent))) {
    return `${value} · history ${Number(scan.percent).toFixed(1)}%`;
  }
  return value;
}
/* Trim the noisy ISO microseconds (:47.207418) to YYYY-MM-DD HH:MM. */
function shortDateTime(input: unknown): string {
  const text = String(input ?? '');
  const withTime = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (withTime) return `${withTime[1]} ${withTime[2]}`;
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return dateOnly?.[1] ?? text;
}
/* Secondary row actions are icon buttons (Start/Stop keeps its label because
   it is the state-dependent primary action with danger/success semantics). */
const iconActionClass = 'size-7 shrink-0 rounded-md border border-border-default bg-elevated text-secondary shadow-none hover:border-accent/45 hover:bg-accent/10 hover:text-accent-soft';
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
function dragStart(row: QueueItem, event: DragEvent): void {
  const filenameValue = filename(row);
  if (!filenameValue || !event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', filenameValue);
}
function dropRow(row: QueueItem, event: DragEvent): void {
  event.preventDefault();
  const source = event.dataTransfer?.getData('text/plain') || '';
  const target = filename(row);
  if (!source || !target || source === target) return;
  const order = props.rows.map(filename).filter((value) => value !== source);
  const index = order.indexOf(target);
  order.splice(index < 0 ? order.length : index + 1, 0, source);
  emit('reorder', order);
}
</script>

<template>
  <div class="opt-panel-controls opt-filter-bar pbgui-list-toolbar mb-2.5 flex flex-wrap items-center gap-2.5">
    <div class="opt-panel-search" role="search">
      <Input class="min-w-60" :model-value="search" :placeholder="t('v7optimize.searchOptimizeName')" @update:model-value="emit('update:search', String($event ?? ''))" />
    </div>
    <div class="opt-panel-counts flex items-center gap-2.5 text-xs text-secondary" aria-live="polite">
      <span>{{ t('v7optimize.queuedCount', { count: rows.length }) }}</span>
      <span v-if="selectedCount" class="font-medium text-accent-soft">{{ t('v7optimize.queueItemsSelected', { count: selectedCount }) }}</span>
    </div>
    <span class="flex-1"></span>
    <Button type="button" variant="default" size="sm" :disabled="!rows.length" data-test="select-all-queue" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</Button>
    <Button type="button" variant="default" size="sm" :disabled="!selectedCount" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</Button>
  </div>
  <div class="opt-table-frame">
    <ListWrap ref="wrap" class="opt-table-wrap min-h-0 flex-1 overflow-auto">
      <Table class="opt-table opt-table--queue max-[800px]:min-w-[720px]">
        <thead>
          <tr>
            <Th :sticky="false" class="w-10 pr-1!"><Checkbox :model-value="allSelected" :disabled="!rows.length" :aria-label="t('v7optimize.selectAll')" data-test="queue-select-all-check" @update:model-value="allSelected ? emit('clearSelection') : emit('selectAll')" /></Th>
            <SortTh sort-key="name" :label="t('v7optimize.thName')" :sort="sort.key === 'name' ? sort.direction : undefined" @sort="emit('sort', 'name')" />
            <SortTh sort-key="exchange" :label="t('v7optimize.thExchange')" :sort="sort.key === 'exchange' ? sort.direction : undefined" @sort="emit('sort', 'exchange')" />
            <SortTh sort-key="status" :label="t('v7optimize.thStatus')" :sort="sort.key === 'status' ? sort.direction : undefined" @sort="emit('sort', 'status')" />
            <SortTh sort-key="created" :label="t('v7optimize.thCreated')" :sort="sort.key === 'created' ? sort.direction : undefined" @sort="emit('sort', 'created')" />
            <Th>{{ t('v7optimize.thActions') }}</Th>
          </tr>
        </thead>
        <tbody ref="tbody">
          <tr v-for="row in rows" :key="filename(row)" :data-path="filename(row)" draggable="true" :class="{ selected: selected.has(filename(row)) }" @dragstart="dragStart(row, $event)" @dragover.prevent @drop="dropRow(row, $event)">
            <td class="w-10 pr-1!" @click.stop>
              <Checkbox :model-value="selected.has(filename(row))" :aria-label="row.name || filename(row)" @update:model-value="emit('toggle', filename(row))" />
            </td>
            <td class="max-w-[280px]">
              <div class="flex min-w-0 flex-col">
                <span class="truncate font-medium" :title="row.name || filename(row)">{{ row.name || filename(row) }}</span>
                <span class="truncate font-mono text-xs text-muted" :title="filename(row)">{{ filename(row) }}</span>
              </div>
            </td>
            <td>
              <span v-if="exchangeText(row)" class="inline-flex max-w-[180px] items-center truncate rounded-md border border-border-default/70 bg-elevated/40 px-1.5 py-0.5 font-mono text-xs text-secondary" :title="exchangeText(row)">{{ exchangeText(row) }}</span>
              <span v-else class="text-muted">-</span>
            </td>
            <td>
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <span class="pbgui-badge opt-status-badge inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-xs font-semibold" :class="statusClass(row)">
                    <span class="h-1.5 w-1.5 rounded-full bg-current opacity-80"></span>
                    {{ row.status || t('v7optimize.statusQueued') }}
                  </span>
                </div>
                <div v-if="progressLabel(row)" class="mt-0.5 max-w-[240px]">
                  <div v-if="progressPercent(row) > 0" class="h-1.5 w-full overflow-hidden rounded-full bg-border-default">
                    <div class="h-full bg-accent rounded-full transition-all duration-300" :style="{ width: `${progressPercent(row)}%` }"></div>
                  </div>
                  <div class="mt-1 text-xs tabular-nums text-muted flex items-center justify-between gap-1" data-test="queue-progress">
                    <span>{{ progressLabel(row) }}</span>
                    <span v-if="progressPercent(row) > 0" class="font-mono font-medium text-primary">{{ progressPercent(row) }}%</span>
                  </div>
                </div>
              </div>
            </td>
            <td class="tabular-nums text-xs text-secondary" :title="String(row.created || row.modified || '')">{{ shortDateTime(row.created || row.modified) || '-' }}</td>
            <TdActions>
              <Button type="button" :variant="isRunning(row) ? 'danger' : 'success'" size="sm" @click="emit('action', filename(row), isRunning(row) ? 'stop' : 'start')">{{ isRunning(row) ? t('v7optimize.stop') : t('v7optimize.start') }}</Button>
              <Button type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.requeue')" :aria-label="t('v7optimize.requeue')" data-test="queue-requeue" @click="emit('action', filename(row), 'requeue')"><PbIcon :icon="PhArrowsClockwise" :size="16" /></Button>
              <Button type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.editConfig')" :aria-label="t('v7optimize.editConfig')" data-test="queue-edit" @click="emit('edit', filename(row))"><PbIcon :icon="PhPencilSimple" :size="16" /></Button>
              <Button type="button" variant="default" size="icon" :class="iconActionClass" :title="t('v7optimize.openLog')" :aria-label="t('v7optimize.openLog')" data-test="queue-log" @click="emit('log', row)"><PbIcon :icon="PhFileText" :size="16" /></Button>
              <Button type="button" variant="default" size="icon" :class="iconActionClass" data-test="queue-move-up" :title="t('editor.suite.moveUp')" :aria-label="t('editor.suite.moveUp')" @click="emit('move', filename(row), -1)"><PbIcon :icon="PhArrowUp" :size="16" /></Button>
              <Button type="button" variant="default" size="icon" :class="iconActionClass" data-test="queue-move-down" :title="t('editor.suite.moveDown')" :aria-label="t('editor.suite.moveDown')" @click="emit('move', filename(row), 1)"><PbIcon :icon="PhArrowDown" :size="16" /></Button>
            </TdActions>
          </tr>
          <EmptyRow
            v-if="!rows.length"
            :colspan="6"
            :title="search ? t('v7optimize.noMatches') : t('v7optimize.queueIsEmpty')"
            :message="search ? undefined : t('v7optimize.emptyQueueHelp')"
            :action-label="search ? undefined : t('v7optimize.backToConfigList')"
            @action="emit('goToConfigs')"
          />
        </tbody>
      </Table>
    </ListWrap>
    <ListFooter data-test="queue-list-footer">
      <span class="tabular-nums">{{ t('v7optimize.queuedCount', { count: rows.length }) }}</span>
      <span v-if="selectedCount" class="font-medium text-accent-soft tabular-nums">{{ t('v7optimize.queueItemsSelected', { count: selectedCount }) }}</span>
    </ListFooter>
  </div>
</template>
