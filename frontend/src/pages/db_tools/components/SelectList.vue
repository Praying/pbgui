<script setup lang="ts">
/*
 * The generic select list — renderChecks (:356-364) + the All/None toolbar
 * (:1009-1022) + the vertical drag-range selection (:961-1008): mousedown
 * anchors a row with add/remove mode from its state, >5px vertical movement
 * enters range mode (the snapshot keeps prior selections outside the swept
 * range), mouseup without a sweep toggles the anchor. aria-pressed stays in
 * sync (:338-342).
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

interface Row {
  value: string;
  total?: number;
  loading?: string;
}

const props = defineProps<{
  id: string;
  rows: Row[];
  selected: ReadonlySet<string> | string[];
  showTotals?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', value: string, selected: boolean): void;
  (e: 'set-all', values: string[]): void;
}>();

const { t } = useI18n();

function isSelected(value: string): boolean {
  return Array.isArray(props.selected) ? props.selected.includes(value) : props.selected.has(value);
}

function allValues(): string[] {
  return props.rows.filter((row) => !row.loading).map((row) => row.value);
}

function toggle(value: string, selected: boolean): void {
  emit('toggle', value, selected);
}

interface DragState {
  listId: string;
  anchor: string;
  y: number;
  selecting: boolean;
  mode: 'add' | 'remove';
  snapshot: Set<string>;
}

let drag: DragState | null = null;

/** selectRowsInRange (:962-974). */
function selectRowsInRange(current: string): void {
  const values = allValues();
  const anchor = values.indexOf(drag!.anchor);
  const index = values.indexOf(current);
  if (anchor < 0 || index < 0) return;
  const lo = Math.min(anchor, index);
  const hi = Math.max(anchor, index);
  values.forEach((value, idx) => {
    const selected = drag!.snapshot.has(value) || (idx >= lo && idx <= hi && drag!.mode === 'add');
    const removed = idx >= lo && idx <= hi && drag!.mode === 'remove';
    toggle(value, selected && !removed);
  });
}

function rowFromPoint(x: number, y: number): string | null {
  const hit = document.elementFromPoint(x, y);
  const row = hit?.closest(`#${props.id} .select-row[data-value]`) ?? null;
  if (!row) return null;
  return row.getAttribute('data-value') ?? '';
}

function onRowMousedown(event: MouseEvent, value: string): void {
  if (event.button !== 0) return;
  event.preventDefault();
  const snapshot = new Set<string>();
  props.rows.forEach((row) => {
    if (!row.loading && isSelected(row.value)) snapshot.add(row.value);
  });
  drag = {
    listId: props.id,
    anchor: value,
    y: event.clientY,
    selecting: false,
    mode: isSelected(value) ? 'remove' : 'add',
    snapshot,
  };
}

function onDocumentMousemove(event: MouseEvent): void {
  if (!drag || drag.listId !== props.id) return;
  if (!drag.selecting && Math.abs(event.clientY - drag.y) > 5) drag.selecting = true; // :991
  if (!drag.selecting) return;
  event.preventDefault();
  const value = rowFromPoint(event.clientX, event.clientY);
  if (!value) return;
  selectRowsInRange(value);
}

function onDocumentMouseup(): void {
  if (!drag || drag.listId !== props.id) return;
  if (!drag.selecting) toggle(drag.anchor, !isSelected(drag.anchor)); // :1001
  drag = null;
}

onMounted(() => {
  document.addEventListener('mousemove', onDocumentMousemove);
  document.addEventListener('mouseup', onDocumentMouseup);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDocumentMousemove);
  document.removeEventListener('mouseup', onDocumentMouseup);
});
</script>

<template>
  <div class="list-card">
    <div class="list-head">
      <slot name="title"></slot>
      <div class="list-actions">
        <slot name="summary"></slot>
        <button class="btn pbgui-btn btn-secondary btn-sm secondary mini" type="button" @click="emit('set-all', allValues())">{{ t('common.all') }}</button>
        <button class="btn pbgui-btn btn-secondary btn-sm secondary mini" type="button" @click="emit('set-all', [])">{{ t('common.none') }}</button>
      </div>
    </div>
    <div class="select-list" :id="id">
      <div v-if="!rows.length" class="select-row" aria-disabled="true">{{ t('misc.dbtools.noItemsFound') }}</div>
      <div v-if="rows.length === 1 && rows[0]!.loading" class="select-row loading" aria-disabled="true">{{ rows[0]!.loading }}</div>
      <template v-else>
        <button
          v-for="row in rows"
          :key="row.value"
          class="select-row"
          type="button"
          :class="{ selected: isSelected(row.value) }"
          :data-value="row.value"
          :aria-pressed="isSelected(row.value) ? 'true' : 'false'"
          @mousedown="onRowMousedown($event, row.value)"
        >
          <span>{{ row.value }}</span>
          <span v-if="showTotals && row.total !== undefined" class="row-meta">{{ t('misc.dbtools.rows', { count: row.total }) }}</span>
        </button>
      </template>
    </div>
  </div>
</template>
