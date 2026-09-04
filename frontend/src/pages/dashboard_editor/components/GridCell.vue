<script setup lang="ts">
/**
 * GridCell — port of buildGrid's per-cell markup and handlers
 * (dashboard_editor.html:2251-2356, 2372-2411):
 *
 *  - drop target (dragover/dragleave/drop): palette copy wins over cell move
 *    (the dispatcher lives in composables/useCellDrag.ts); dragover sets
 *    dropEffect move/copy and the drag-over class.
 *  - drop-hint overlay (visible via CSS on drag-over).
 *  - inline preview hosting the widget (registry component keyed by the
 *    cell's remount epoch — the reactive replacement for the legacy full
 *    buildGrid() rebuild); NONE/unknown types show the legacy
 *    dash.dragWidgetHere placeholder in edit mode (editor:982-989).
 *  - stored dashboard_height_<r>_<c> binds the cell height + overflow; the
 *    live drag height suppresses min-height like the legacy inline styles.
 *  - provides cell context + widget drag handlers + the `_resizePlots`
 *    equivalent to widget children (lib/cellContext.ts).
 *
 * Deviation: the legacy `.cell-header` (drag handle, row/col label, type
 * badge, trash) and `.cell-cfg` panels are display:none !important in the
 * legacy CSS (editor:308-310) — dead DOM. The Vue grid does not emit them;
 * the visible affordances (widget chrome, trash in edit mode) belong to the
 * widgets (D-4..7), exactly as legacy renders them. The badge-class quirk
 * (P+L → type-PPL) is preserved in lib/grid.badgeClassFor for parity.
 */
import { computed, provide, ref, type Component } from 'vue';
import { useDashboardStore } from '../stores/dashboardStore';
import { useCellDrag } from '../composables/useCellDrag';
import { cellContextKey, cellResizeKey, widgetDragKey } from '../lib/cellContext';
import { cellPos, isRenderableWidgetType } from '../lib/grid';
import { resizePlotsInCell } from '../lib/plotlyResize';
import { widgetComponent } from '../widgetRegistry';
import { dashT } from '../lib/i18n';
import ResizeHandle from './ResizeHandle.vue';

const props = defineProps<{
  row: number;
  col: number;
}>();

const store = useDashboardStore();
const drag = useCellDrag();

const cellRootEl = ref<HTMLElement | null>(null);
const liveHeight = ref<number | null>(null);

/* Function form: the ref update during mount is reactive (string-form
   template refs are not) — the child ResizeHandle receives the element as a
   prop, so the parent must re-render once the element exists. */
function setCellRoot(el: unknown): void {
  cellRootEl.value = (el as HTMLElement | null) ?? null;
}

const pos = cellPos(props.row, props.col);

const viewOnly = computed<boolean>(() => store.config.viewOnly);

const cellType = computed<string>(() => store.cellType(props.row, props.col));

const widgetComp = computed<Component | null>(() =>
  cellType.value !== 'NONE' && isRenderableWidgetType(cellType.value)
    ? widgetComponent(cellType.value)
    : null
);

const isOver = computed<boolean>(() => drag.dragOverCells.has(pos));
const isDragging = computed<boolean>(() => drag.isCellDragging(props.row, props.col));
const isAutoHeight = computed<boolean>(() => store.isAutoHeight(props.row, props.col));

/* ── Tailwind class sets (the former .editor-cell state rules of
   styles/editor.css, deleted at the Tailwind migration). Every branch
   returns the COMPLETE colour/border/size set — Tailwind emits
   same-property utilities in its own fixed order, so a state class
   must never be combined with a conflicting base one. The legacy
   state class names (drag-over/dragging/auto-height) ride along as
   inert anchors — the tests select them. */
const cellStateClass = computed<string>(() => {
  const over = isOver.value;
  const dragging = isDragging.value;
  const parts = [
    /* border-color: dragging and drag-over both paint the accent (editor:130-139) */
    over || dragging ? 'border-accent-soft' : 'border-border-default',
    dragging ? 'dragging opacity-40 cursor-grabbing' : 'cursor-default',
    /* min-height: the auto-height reset needs !important — it must beat
       the un-layered body.view-mode .editor-cell rule (editor:317-321) */
    isAutoHeight.value ? 'auto-height min-h-0!' : 'min-h-[360px]',
  ];
  if (over) parts.push('drag-over border-dashed [transform:scale(1.01)]');
  return parts.join(' ');
});

/* .cell-inline-preview min-height ladder (editor:297-303 + 313-322):
   edit mode 120px; view mode 320px unless auto-height forces 0. */
const previewMinHeightClass = computed<string>(() =>
  viewOnly.value
    ? isAutoHeight.value
      ? 'min-h-0!'
      : 'min-h-[320px]'
    : 'min-h-[120px]'
);

/* editor:2375-2376 (stored) + 2452-2459 (live drag suppression) */
const heightStyle = computed(
  (): { height: string; minHeight?: string; overflow?: string } | undefined => {
    if (liveHeight.value !== null) {
      return {
        height: liveHeight.value + 'px',
        minHeight: '0',
        overflow: 'hidden',
      };
    }
    const stored = store.cellHeight(props.row, props.col);
    if (stored !== null) {
      return { height: stored + 'px', overflow: 'hidden' };
    }
    return undefined;
  }
);

/* ── drop target handlers (editor:2257-2286) ── */

function onDragOver(e: DragEvent): void {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = drag.dropEffect();
  drag.markDragOver(pos);
}

function onDragLeave(): void {
  drag.unmarkDragOver(pos);
}

function onDrop(e: DragEvent): void {
  e.preventDefault();
  drag.handleCellDrop(props.row, props.col, e.dataTransfer);
}

/* ── cell context for widget children ── */

provide(cellContextKey, { row: props.row, col: props.col });

provide(cellResizeKey, () => {
  /* legacy cellEl._resizePlots (editor:2410-2411) */
  if (cellRootEl.value) resizePlotsInCell(cellRootEl.value);
});

provide(widgetDragKey, {
  /* legacy _attachViewDrag (editor:2160-2179): the widget header is the
     drag source — no NONE check (NONE cells have no widget). */
  onHeaderDragStart(e: DragEvent) {
    drag.beginCellDrag(props.row, props.col);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', pos);
    }
  },
  onHeaderDragEnd() {
    drag.endCellDrag();
  },
});
</script>

<template>
  <div
    :ref="setCellRoot"
    class="editor-cell relative flex min-w-0 flex-col gap-[0.5rem] overflow-x-auto rounded-md border bg-card p-[0.75rem] [transition:opacity_.2s,border-color_.2s,transform_.15s]"
    :class="cellStateClass"
    :data-row="row"
    :data-col="col"
    :style="heightStyle"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div
      class="drop-hint pointer-events-none absolute inset-0 z-10 items-center justify-center rounded-md border-2 border-dashed border-accent-soft bg-accent/8 text-sm text-accent-soft"
      :class="isOver ? 'flex' : 'hidden'"
    >
      {{ dashT('dash.dropWidgetHere', 'Drop widget here') }}
    </div>
    <div
      class="cell-inline-preview flex flex-1 flex-col overflow-hidden"
      :class="previewMinHeightClass"
    >
      <component :is="widgetComp" v-if="widgetComp" :key="store.epochOf(row, col)" />
      <div
        v-else-if="!viewOnly"
        class="dt-status min-h-[1.1em] p-[2rem] text-center text-[0.68rem] text-disabled"
      >
        {{ dashT('dash.dragWidgetHere', 'Drag a widget here') }}
      </div>
    </div>
    <ResizeHandle
      v-model:live-height="liveHeight"
      :row="row"
      :col="col"
      :cell-element="cellRootEl"
    />
  </div>
</template>

<style scoped>
/* ── Grid-engine structural rules (ported from styles/editor.css) ──
   Kept as CSS: descendant selectors reaching into the widget
   components' DOM — no utility form exists. :deep() because the
   .dt-root / .db-header / .di-root elements belong to child
   components. */

/* flex chain so Plotly charts fill the available cell height when
   resized (legacy editor.css:325-338) */
.cell-inline-preview > :deep(.dt-root),
.cell-inline-preview > :deep(.di-root) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0; /* allow shrinking below content size */
}
.cell-inline-preview :deep(.dt-chart),
.cell-inline-preview :deep(.di-chart) {
  flex: 1;
  min-height: 0; /* allow flex to shrink the chart below Plotly SVG height */
  overflow: hidden; /* clip SVG overflow during resize drag */
}

/* dt-header/db-header are always draggable for cell swap (legacy editor.css:307-309) */
:deep(.dt-header),
:deep(.db-header) {
  cursor: grab;
}
.editor-cell.dragging :deep(.dt-header),
.editor-cell.dragging :deep(.db-header) {
  cursor: grabbing;
}
</style>
