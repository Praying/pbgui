<script setup lang="ts">
/*
 * M-data-6 — the sortable/selectable inventory table (legacy
 * renderInventoryTable :8004-8064, syncInventorySelectionFromDom
 * :7995-8002 and the row drag-select document handlers :9387-9423 /
 * :9457-9473 / :9498-9510 of market_data_main.html).
 *
 * Selection is committed from the DOM exactly like legacy: mousedown
 * anchors a row, a >5px sweep adds/removes the swept range live via class
 * mutations, mouseup reads every row's is-selected class and emits the
 * surviving ids (`commit`). Sort clicks bubble through the `sort` event
 * (toggleInventorySort :7967-7977 lives in the store).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Button } from '@/shared/components/ui/button';
import type { InventoryColumn } from '../../lib/inventoryColumns';
import { formatInventoryTableValue } from '../../lib/inventoryColumns';
import type { InventoryRow } from '../../lib/inventoryTypes';
import type { InventorySubsection } from '../../types';

/** Legacy sweep threshold (:9458). */
const DRAG_SELECT_THRESHOLD_PX = 5;

const props = defineProps<{
  columns: InventoryColumn[];
  rows: InventoryRow[];
  selectedIds: string[];
  sortKey: string;
  sortDirection: string;
  exchange: string;
  viewKey: InventorySubsection;
  emptyText?: string;
}>();

const emit = defineEmits<{
  /** Sort button click (:9382-9386) — the column key. */
  sort: [sortKey: string];
  /** Drag mouseup commit (:9502-9506) — ids read from the DOM. */
  commit: [rowIds: string[]];
}>();

const root = ref<HTMLElement | null>(null);

/* legacy module drag vars (:7827-7830) */
let dragRow: HTMLElement | null = null;
let dragY = 0;
let dragSelecting = false;
let dragMode: 'add' | 'remove' | null = null;

function tableRows(): HTMLElement[] {
  if (!root.value) return [];
  return Array.from(root.value.querySelectorAll('.inventory-table tbody tr[data-row-id]'));
}

/** Legacy getInventoryRowIndexAtY (:7987-7993). */
function rowIndexAtY(rows: HTMLElement[], y: number): number {
  let index = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row && y >= row.getBoundingClientRect().top) index = i;
  }
  return index;
}

function rowId(row: HTMLElement): string {
  return String(row.getAttribute('data-row-id') || '');
}

function onMousedown(event: MouseEvent): void {
  if (event.button !== 0) return; // :9388
  const target = event.target as HTMLElement | null;
  const row = target?.closest?.('.inventory-table tbody tr[data-row-id]') as HTMLElement | null;
  if (!row || !root.value?.contains(row)) return;
  event.preventDefault(); // :9419 — legacy suppressed native selection
  dragRow = row;
  dragY = event.clientY;
  dragSelecting = false;
  dragMode = null;
}

function onMousemove(event: MouseEvent): void {
  if (!dragRow) return;
  if (!dragSelecting && Math.abs(event.clientY - dragY) > DRAG_SELECT_THRESHOLD_PX) {
    dragSelecting = true; // :9458-9459
    dragMode = dragRow.classList.contains('is-selected') ? 'remove' : 'add'; // :9460
  }
  if (!dragSelecting || !dragMode) return;
  event.preventDefault();
  const rows = tableRows();
  const anchor = rows.indexOf(dragRow);
  const current = rowIndexAtY(rows, event.clientY);
  const low = Math.min(anchor, current);
  const high = Math.max(anchor, current);
  rows.forEach((row, index) => {
    if (index < low || index > high) return;
    if (dragMode === 'add') row.classList.add('is-selected');
    else row.classList.remove('is-selected');
  }); // :9464-9473
}

function onMouseup(): void {
  if (!dragRow) return;
  if (!dragSelecting) dragRow.classList.toggle('is-selected'); // :9499-9501
  emit('commit', tableRows().filter((row) => row.classList.contains('is-selected')).map(rowId).filter(Boolean)); // :9504
  dragRow = null;
  dragSelecting = false;
  dragMode = null;
}

onMounted(() => {
  document.addEventListener('mousedown', onMousedown);
  document.addEventListener('mousemove', onMousemove);
  document.addEventListener('mouseup', onMouseup);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onMousedown);
  document.removeEventListener('mousemove', onMousemove);
  document.removeEventListener('mouseup', onMouseup);
});

/** Cell text (:8056) — one accessor so td and its title never diverge. */
function cellText(columnKey: string, row: InventoryRow): string {
  return formatInventoryTableValue(props.viewKey, columnKey, row, props.exchange);
}
</script>

<template>
  <div ref="root" class="inventory-table-wrap max-h-[33vh] overflow-auto rounded-[10px] border border-border-default bg-page/42" id="inventory-table-wrap">
    <table v-if="rows.length" class="inventory-table w-full min-w-[1180px] border-separate border-spacing-0">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key" class="sticky top-0 z-[1] border-b-2 border-border-default bg-panel py-[0.55rem] px-[0.75rem] text-left align-top text-xs font-semibold uppercase tracking-label text-secondary">
            <Button
              variant="ghost"
              size="sm"
              class="inventory-sort-btn p-0"
              :class="{ 'is-active text-success-soft': column.key === sortKey }"
              type="button"
              :data-sort-key="column.key"
              @click="emit('sort', column.key)"
            >{{ column.label }}<span v-if="column.key === sortKey" class="inventory-sort-indicator text-xs tracking-normal text-accent">{{ sortDirection === 'desc' ? 'DESC' : 'ASC' }}</span></Button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="String(row.row_id ?? '')"
          :data-row-id="String(row.row_id ?? '')"
          class="cursor-pointer transition-[background-color] duration-[120ms]"
          :class="{ 'is-selected': selectedIds.includes(String(row.row_id ?? '')) }"
        >
          <td v-for="column in columns" :key="column.key" class="border-b border-secondary/12 py-[0.55rem] px-[0.75rem] text-left align-top text-sm whitespace-nowrap" :title="cellText(column.key, row)">
            {{ cellText(column.key, row) }}
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="inventory-empty p-5 text-base text-secondary">{{ emptyText }}</div>
  </div>
</template>

<style scoped>
/* Row-state rules (legacy :1714-1717) — the drag-select handlers mutate
   the rows' is-selected class directly at runtime (classList add/remove/
   toggle), so the cell paints must stay CSS-keyed on the row state; the
   hover rule keeps the is-selected paint on top exactly like the legacy
   cascade order. 'inventory-table' / 'is-selected' remain the JS/test
   hooks (useDragSelect reads them back at mouseup). */
.inventory-table tbody tr:hover {
  background: rgb(var(--accent-rgb) / 0.08);
}

.inventory-table tbody tr.is-selected td {
  background: rgb(var(--accent-rgb) / 0.12);
}

.inventory-table tbody tr.is-selected td:first-child {
  border-left: 3px solid var(--accent);
}
</style>
