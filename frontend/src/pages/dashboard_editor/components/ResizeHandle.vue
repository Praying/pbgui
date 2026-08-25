<script setup lang="ts">
/**
 * ResizeHandle — port of the cell resize handle (dashboard_editor.html:
 * 2358-2506): drag to resize (min 120 px, rAF-debounced Plotly relayout),
 * double-click reset to auto-height, Min (200 px) / Max (auto) buttons.
 *
 * Contract ported from legacy:
 *  - mousedown anchors the cell at its measured height, suppresses min-height
 *    via the live-height model, posts pbgui_resize_start to the parent and
 *    freezes table-wrapper scrolling.
 *  - mousemove drives `liveHeight` (clamped ≥120) with a rAF-debounced
 *    resizePlotsInCell (editor:2412-2419).
 *  - mouseup restores wrappers, posts pbgui_resize_end, persists
 *    dashboard_height_<r>_<c> through the store (sync/dirty by mode),
 *    removes auto-height, then resizes plots on the next DOM tick.
 *  - dblclick / Max reset (delete key + auto-height); Min stores 200.
 *
 * Deviation (leak fix, R4-style): listeners are removed on unmount mid-drag
 * (legacy never cleaned up its document-level handlers).
 */
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { Button } from '@/shared/components/ui/button';
import { useDashboardStore } from '../stores/dashboardStore';
import { RESIZE_MIN_BUTTON_HEIGHT, RESIZE_MIN_HEIGHT } from '../lib/grid';
import { resizePlotsInCell } from '../lib/plotlyResize';
import { dashT } from '../lib/i18n';

const props = defineProps<{
  row: number;
  col: number;
  /** The cell root element (GridCell's template ref). */
  cellElement: HTMLElement | null;
}>();

/** Live drag height (GridCell binds it to the cell style). */
const liveHeight = defineModel<number | null>('liveHeight', { default: null });

const store = useDashboardStore();
const isDragging = ref(false);

let startY = 0;
let startH = 0;
let rafId = 0;

const TABLE_WRAPS = '.di-table-wrap, .dp-table-wrap, .db-table-wrap';

function resizeCell(): void {
  const cell = props.cellElement;
  if (cell) resizePlotsInCell(cell);
}

function freezeTableWrappers(cell: HTMLElement): void {
  cell.querySelectorAll(TABLE_WRAPS).forEach((w) => {
    const el = w as HTMLElement & { _prevOverflowY?: string };
    el._prevOverflowY = el.style.overflowY;
    el.style.overflowY = 'hidden';
  });
}

function restoreTableWrappers(cell: HTMLElement): void {
  cell.querySelectorAll(TABLE_WRAPS).forEach((w) => {
    const el = w as HTMLElement & { _prevOverflowY?: string };
    el.style.overflowY = el._prevOverflowY || '';
    delete el._prevOverflowY;
  });
}

function onMouseMove(e: MouseEvent): void {
  const newH = Math.max(RESIZE_MIN_HEIGHT, startH + (e.clientY - startY));
  liveHeight.value = newH;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(resizeCell);
}

function finishResize(e: MouseEvent): void {
  document.removeEventListener('mousemove', onMouseMove);
  isDragging.value = false;
  const finalH = Math.max(RESIZE_MIN_HEIGHT, startH + (e.clientY - startY));
  liveHeight.value = null;
  store.setCellHeight(props.row, props.col, finalH); // persists + removes auto-height + sync
  void nextTick(resizeCell);
}

function onUp(e: MouseEvent): void {
  document.removeEventListener('mouseup', onUp);
  const cell = props.cellElement;
  if (cell) restoreTableWrappers(cell);
  store.postParentMessage('pbgui_resize_end');
  finishResize(e);
}

function onMouseDown(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  const cell = props.cellElement;
  if (!cell) return;
  isDragging.value = true;
  startH = Math.round(cell.getBoundingClientRect().height);
  startY = e.clientY;
  /* Anchor the cell at its current measured height and suppress the CSS
     min-height while dragging (editor:2452-2459). */
  liveHeight.value = startH;
  store.postParentMessage('pbgui_resize_start');
  freezeTableWrappers(cell);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onUp);
}

function onDblClick(e: MouseEvent): void {
  e.stopPropagation();
  store.resetCellHeight(props.row, props.col);
  void nextTick(resizeCell);
}

function onMin(e: MouseEvent): void {
  e.stopPropagation();
  store.setCellHeight(props.row, props.col, RESIZE_MIN_BUTTON_HEIGHT);
  void nextTick(resizeCell);
}

function onMax(e: MouseEvent): void {
  e.stopPropagation();
  store.resetCellHeight(props.row, props.col);
  void nextTick(resizeCell);
}

onBeforeUnmount(() => {
  if (!isDragging.value) return;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onUp);
  cancelAnimationFrame(rafId);
});
</script>

<template>
  <div
    class="resize-handle absolute inset-x-0 bottom-0 z-[5] h-4 cursor-ns-resize hover:bg-accent/30 [transition:background_.15s]"
    :class="isDragging ? 'active bg-accent/30' : 'bg-transparent'"
    :title="dashT('dash.dragToResize', 'Drag to resize')"
    @mousedown="onMouseDown"
    @dblclick="onDblClick"
  >
    <Button
      type="button"
      variant="outline"
      class="resize-btn resize-btn-min absolute left-1.5 top-px z-[6] h-[13px] select-none rounded-[3px] border-secondary bg-elevated px-[5px] py-0 text-[9px] leading-[13px] text-secondary opacity-0 [transition:opacity_.15s,color_.15s,background_.15s] hover:border-accent-soft hover:bg-accent/80 hover:text-[#f2f5fb]"
      :title="dashT('dash.collapseCompact', 'Collapse to compact (scrollable)')"
      @mousedown.stop
      @click="onMin"
    >
      {{ '⋖ ' + dashT('dash.min', 'min') }}
    </Button>
    <Button
      type="button"
      variant="outline"
      class="resize-btn resize-btn-max absolute right-1.5 top-px z-[6] h-[13px] select-none rounded-[3px] border-secondary bg-elevated px-[5px] py-0 text-[9px] leading-[13px] text-secondary opacity-0 [transition:opacity_.15s,color_.15s,background_.15s] hover:border-accent-soft hover:bg-accent/80 hover:text-[#f2f5fb]"
      :title="dashT('dash.expandAllRows', 'Expand to show all rows')"
      @mousedown.stop
      @click="onMax"
    >
      {{ dashT('dash.max', 'max') + ' ⋗' }}
    </Button>
  </div>
</template>

<style scoped>
/* ── Ported from styles/editor.css (deleted at the Tailwind migration) ──
   The ::after grip is a pseudo-element (no utility form), and the
   hover/active reveal of the Min/Max buttons is a parent-state rule —
   both stay CSS. */
.resize-handle::after {
  content: '';
  position: absolute;
  bottom: 5px;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 2px;
  border-radius: 1px;
  background: var(--text-secondary);
}
.resize-handle:hover::after,
.resize-handle.active::after {
  background: var(--accent-soft);
}
.resize-handle:hover .resize-btn,
.resize-handle.active .resize-btn {
  opacity: 1;
}
</style>
