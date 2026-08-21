<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { useI18n } from 'vue-i18n';
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
function statusClass(row: QueueItem): string { return `opt-status-${String(row.status || 'queued').toLowerCase()}`; }
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
  <div class="opt-toolbar">
    <input class="opt-input opt-search" :value="search" :placeholder="t('v7optimize.searchOptimizeName')" @input="emit('update:search', ($event.target as HTMLInputElement).value)" />
    <span class="opt-muted">{{ t('v7optimize.queuedCount', { count: rows.length }) }}</span>
    <span v-if="selectedCount" class="opt-muted">{{ t('v7optimize.queueItemsSelected', { count: selectedCount }) }}</span>
    <span class="opt-grow"></span>
    <button class="opt-btn pbgui-action small" data-test="select-all-queue" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</button>
    <button class="opt-btn pbgui-action small" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</button>
  </div>
  <div ref="wrap" class="opt-table-wrap">
    <table class="opt-table">
      <thead><tr><th @click="emit('sort', 'name')">{{ t('v7optimize.thName') }}</th><th @click="emit('sort', 'exchange')">{{ t('v7optimize.thExchange') }}</th><th @click="emit('sort', 'status')">{{ t('v7optimize.thStatus') }}</th><th @click="emit('sort', 'created')">{{ t('v7optimize.thCreated') }}</th><th>{{ t('v7optimize.thActions') }}</th></tr></thead>
      <tbody ref="tbody">
        <tr v-for="row in rows" :key="filename(row)" :data-path="filename(row)" draggable="true" :class="{ selected: selected.has(filename(row)) }" @dragstart="dragStart(row, $event)" @dragover.prevent @drop="dropRow(row, $event)">
          <td class="opt-mono">{{ row.name || filename(row) }}</td>
          <td>{{ Array.isArray(row.exchange) ? row.exchange.join(', ') : row.exchange || '—' }}</td>
          <td><span class="opt-status pbgui-badge" :class="statusClass(row)">{{ row.status || t('v7optimize.statusQueued') }}</span></td>
          <td>{{ row.created || row.modified || '—' }}</td>
          <td class="opt-actions actions-cell" @click.stop>
            <button v-if="row.status === 'running' || row.status === 'optimizing'" class="opt-btn pbgui-action small danger" @click="emit('action', filename(row), 'stop')">{{ t('v7optimize.stop') }}</button>
            <button v-else class="opt-btn pbgui-action small" @click="emit('action', filename(row), 'start')">{{ t('v7optimize.start') }}</button>
            <button class="opt-btn pbgui-action small" @click="emit('action', filename(row), 'requeue')">{{ t('v7optimize.requeue') }}</button>
            <button class="opt-btn pbgui-action small" @click="emit('edit', filename(row))">{{ t('v7optimize.editConfig') }}</button>
            <button class="opt-btn pbgui-action small" @click="emit('log', row)">Log</button><button class="opt-btn pbgui-action small" @click="emit('move', filename(row), -1)">↑</button><button class="opt-btn pbgui-action small" @click="emit('move', filename(row), 1)">↓</button>
          </td>
        </tr>
        <tr v-if="!rows.length"><td colspan="5" class="opt-empty">{{ t('v7optimize.queueIsEmpty') }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
