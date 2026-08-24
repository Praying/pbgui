<script setup lang="ts">
import { PhArrowDown, PhArrowUp } from '@phosphor-icons/vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import type { QueueItem } from '../types';

const props = defineProps<{ rows: QueueItem[]; selected: Set<string>; search: string }>();
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
}>();
const { t } = useI18n();
const selectedCount = computed(() => props.selected.size);
function filename(row: QueueItem): string { return String(row.filename || ''); }
/* Status → Tailwind utility mapping (the former optimize.css .opt-status-*
   tints; Tailwind's scanner cannot see dynamically concatenated class
   names, so the branches spell them out). */
function statusClass(row: QueueItem): string {
  const status = String(row.status || 'queued').toLowerCase();
  if (status === 'complete') return 'bg-success/15 text-success';
  if (status === 'error') return 'bg-danger/15 text-danger';
  if (status === 'running' || status === 'optimizing') return 'bg-warning/15 text-[#d0a36f]';
  return 'bg-secondary/15 text-secondary';
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
  <div class="mb-2.5 flex flex-wrap items-center gap-2.5">
    <input class="min-h-8 rounded-sm border border-border-default bg-panel px-[9px] py-1.5 text-primary min-w-60" :value="search" :placeholder="t('v7optimize.searchOptimizeName')" @input="emit('update:search', ($event.target as HTMLInputElement).value)" />
    <span class="text-xs text-secondary">{{ t('v7optimize.queuedCount', { count: rows.length }) }}</span>
    <span v-if="selectedCount" class="text-xs text-secondary">{{ t('v7optimize.queueItemsSelected', { count: selectedCount }) }}</span>
    <span class="flex-1"></span>
    <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" data-test="select-all-queue" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</button>
    <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</button>
  </div>
  <div ref="wrap" class="min-h-0 flex-1 overflow-auto rounded-md border border-border-default">
    <table class="opt-table w-full border-separate border-spacing-0 text-sm max-[800px]:min-w-[720px]">
      <thead><tr><th @click="emit('sort', 'name')">{{ t('v7optimize.thName') }}</th><th @click="emit('sort', 'exchange')">{{ t('v7optimize.thExchange') }}</th><th @click="emit('sort', 'status')">{{ t('v7optimize.thStatus') }}</th><th @click="emit('sort', 'created')">{{ t('v7optimize.thCreated') }}</th><th>{{ t('v7optimize.thActions') }}</th></tr></thead>
      <tbody ref="tbody">
        <tr v-for="row in rows" :key="filename(row)" :data-path="filename(row)" draggable="true" :class="{ selected: selected.has(filename(row)) }" @dragstart="dragStart(row, $event)" @dragover.prevent @drop="dropRow(row, $event)">
          <td class="font-mono">{{ row.name || filename(row) }}</td>
          <td>{{ Array.isArray(row.exchange) ? row.exchange.join(', ') : row.exchange || '—' }}</td>
          <td><span class="pbgui-badge inline-flex rounded-full px-2 py-[3px] text-xs font-bold" :class="statusClass(row)">{{ row.status || t('v7optimize.statusQueued') }}</span></td>
          <td>{{ row.created || row.modified || '—' }}</td>
          <td class="whitespace-nowrap! overflow-visible!" @click.stop>
            <button v-if="row.status === 'running' || row.status === 'optimizing'" class="min-h-[26px] cursor-pointer rounded-sm border border-danger/45 bg-white/4 px-[7px] py-[3px] text-xs text-danger" @click="emit('action', filename(row), 'stop')">{{ t('v7optimize.stop') }}</button>
            <button v-else class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" @click="emit('action', filename(row), 'start')">{{ t('v7optimize.start') }}</button>
            <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" @click="emit('action', filename(row), 'requeue')">{{ t('v7optimize.requeue') }}</button>
            <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" @click="emit('edit', filename(row))">{{ t('v7optimize.editConfig') }}</button>
            <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" @click="emit('log', row)">Log</button>
            <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" data-test="queue-move-up" :title="t('editor.suite.moveUp')" :aria-label="t('editor.suite.moveUp')" @click="emit('move', filename(row), -1)"><PbIcon :icon="PhArrowUp" :size="18" /></button>
            <button class="min-h-[26px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-[7px] py-[3px] text-xs text-primary hover:border-accent" data-test="queue-move-down" :title="t('editor.suite.moveDown')" :aria-label="t('editor.suite.moveDown')" @click="emit('move', filename(row), 1)"><PbIcon :icon="PhArrowDown" :size="18" /></button>
          </td>
        </tr>
        <tr v-if="!rows.length"><td colspan="5" class="p-[30px]! text-center text-secondary">{{ t('v7optimize.queueIsEmpty') }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
