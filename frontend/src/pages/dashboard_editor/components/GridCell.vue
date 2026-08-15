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

const cellType = computed<string>(() => store.cellType(props.row, props.col));

const widgetComp = computed<Component | null>(() =>
  cellType.value !== 'NONE' && isRenderableWidgetType(cellType.value)
    ? widgetComponent(cellType.value)
    : null
);

const isOver = computed<boolean>(() => drag.dragOverCells.has(pos));
const isDragging = computed<boolean>(() => drag.isCellDragging(props.row, props.col));
const isAutoHeight = computed<boolean>(() => store.isAutoHeight(props.row, props.col));

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
    class="editor-cell"
    :class="{ 'drag-over': isOver, dragging: isDragging, 'auto-height': isAutoHeight }"
    :data-row="row"
    :data-col="col"
    :style="heightStyle"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="drop-hint">{{ dashT('dash.dropWidgetHere', 'Drop widget here') }}</div>
    <div class="cell-inline-preview">
      <component :is="widgetComp" v-if="widgetComp" :key="store.epochOf(row, col)" />
      <div
        v-else-if="!store.config.viewOnly"
        class="dt-status"
        style="text-align:center;padding:2rem;color:#4a5568;"
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
