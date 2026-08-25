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
import { Button } from '@/shared/components/ui/button';

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
  <div class="overflow-hidden rounded-[10px] border border-border-subtle bg-page">
    <div class="flex items-center justify-between gap-2 border-b border-border-subtle bg-card px-[0.8rem] py-[0.65rem]">
      <slot name="title"></slot>
      <div class="flex gap-1">
        <slot name="summary"></slot>
        <Button type="button" variant="secondary" size="sm" @click="emit('set-all', allValues())">{{ t('common.all') }}</Button>
        <Button type="button" variant="secondary" size="sm" @click="emit('set-all', [])">{{ t('common.none') }}</Button>
      </div>
    </div>
    <div class="block max-h-[300px] select-none overflow-auto p-0" :id="id">
      <div v-if="!rows.length" class="select-row w-full min-h-[34px] appearance-none cursor-pointer border-0 border-b border-border-subtle bg-transparent py-[7px] pl-2.5 pr-[10px] text-left text-primary hover:bg-white/3" aria-disabled="true">{{ t('misc.dbtools.noItemsFound') }}</div>
      <div v-if="rows.length === 1 && rows[0]!.loading" class="select-row w-full min-h-[34px] appearance-none cursor-wait border-0 border-b border-border-subtle bg-transparent py-[7px] pl-2.5 pr-[10px] text-left italic text-secondary" aria-disabled="true">{{ rows[0]!.loading }}</div>
      <template v-else>
        <!-- Rows keep `block` (not the Button inline-flex): the legacy row
             layout is inline text + an ml-auto total, and drag hit-testing
             forbids the press scale. -->
        <Button
          v-for="row in rows"
          :key="row.value"
          variant="ghost"
          class="select-row block w-full min-h-[34px] rounded-none border-0 border-b border-border-subtle bg-transparent py-[7px] pl-2.5 pr-[10px] text-left font-normal whitespace-normal text-primary hover:bg-white/3 active:scale-100"
          type="button"
          :class="isSelected(row.value) ? 'selected bg-accent/12 text-[#f2f5fb] shadow-[inset_3px_0_0_#72a0ee]' : ''"
          :data-value="row.value"
          :aria-pressed="isSelected(row.value) ? 'true' : 'false'"
          @mousedown="onRowMousedown($event, row.value)"
        >
          <span>{{ row.value }}</span>
          <span v-if="showTotals && row.total !== undefined" class="ml-auto text-xs text-muted">{{ t('misc.dbtools.rows', { count: row.total }) }}</span>
        </Button>
      </template>
    </div>
  </div>
</template>
