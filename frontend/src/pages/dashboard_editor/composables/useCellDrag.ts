/**
 * Cell drag & drop state machine — port of the legacy editor's page-global
 * dragSrc + per-cell drag-over handling (dashboard_editor.html:2154-2155,
 * 2257-2286, 2327-2343).
 *
 * Legacy semantics:
 *  - `dragSrc` = {row, col} of the cell whose widget header is being dragged
 *    (set on dragstart, cleared on dragend/drop-after-swap).
 *  - `drag-over` class marks drop targets during dragover; legacy clears ALL
 *    of them on any dragend — the module-level Set reproduces that globally.
 *  - Drop dispatcher (editor:2269-2285): palette copy wins — a `widget-type`
 *    data channel with a known WIDGET_META type assigns the type to the
 *    target cell (overwriting); otherwise an active cell drag onto a
 *    DIFFERENT cell performs the key-suffix swap. dragSrc is cleared after.
 *  - dragover dropEffect: 'move' when a cell is being dragged, else 'copy'.
 */
import { reactive, readonly, shallowRef } from 'vue';
import { useDashboardStore } from '../stores/dashboardStore';
import { WIDGET_META, cellPos, type RenderableWidgetType } from '../lib/grid';

export interface DragSource {
  row: number;
  col: number;
}

const dragSource = shallowRef<DragSource | null>(null);
const dragOverCells = reactive(new Set<string>());

export interface CellDragApi {
  /** The active drag source ({row, col}), or null (plain value). */
  readonly dragSource: DragSource | null;
  /** Positions ('r_c') currently marked as drag-over (reactive Set). */
  readonly dragOverCells: ReadonlySet<string>;
  /** dragover dropEffect: 'move' while a cell drag is active, else 'copy'. */
  dropEffect(): 'move' | 'copy';
  /** Whether the given cell is the current drag source. */
  isCellDragging(row: number, col: number): boolean;
  /** dragstart: remember the source cell. */
  beginCellDrag(row: number, col: number): void;
  /** dragend (cell drag): clear source + every drag-over marker. */
  endCellDrag(): void;
  /** dragend (palette drag): clear markers only (editor:574-579). */
  clearDragOver(): void;
  /** dragover: mark a cell position ('r_c') as a drop target. */
  markDragOver(pos: string): void;
  /** dragleave: remove the cell's drop-target marker. */
  unmarkDragOver(pos: string): void;
  /**
   * Drop dispatcher (editor:2266-2285). `dataTransfer` may be null (tests /
   * synthetic events); unknown `widget-type` values fall through to move.
   */
  handleCellDrop(
    row: number,
    col: number,
    dataTransfer: { getData(kind: string): string } | null
  ): void;
}

export function useCellDrag(): CellDragApi {
  const store = useDashboardStore();

  function markDragOver(pos: string): void {
    dragOverCells.add(pos);
  }

  function unmarkDragOver(pos: string): void {
    dragOverCells.delete(pos);
  }

  function handleCellDrop(
    row: number,
    col: number,
    dataTransfer: { getData(kind: string): string } | null
  ): void {
    unmarkDragOver(cellPos(row, col));
    /* palette drop → assign type (wins over an active cell drag) */
    const wType = dataTransfer?.getData('widget-type') ?? '';
    if (wType && Object.prototype.hasOwnProperty.call(WIDGET_META, wType)) {
      store.assignCellType(row, col, wType as RenderableWidgetType);
      return;
    }
    /* cell-to-cell swap */
    const src = dragSource.value;
    if (src && (src.row !== row || src.col !== col)) {
      store.swapCells(src.row, src.col, row, col);
    }
    dragSource.value = null;
  }

  return {
    get dragSource() {
      return dragSource.value;
    },
    dragOverCells: readonly(dragOverCells),
    dropEffect() {
      return dragSource.value ? 'move' : 'copy';
    },
    isCellDragging(row, col) {
      const src = dragSource.value;
      return src !== null && src.row === row && src.col === col;
    },
    beginCellDrag(row, col) {
      dragSource.value = { row, col };
    },
    endCellDrag() {
      dragSource.value = null;
      dragOverCells.clear();
    },
    clearDragOver() {
      dragOverCells.clear();
    },
    markDragOver,
    unmarkDragOver,
    handleCellDrop,
  };
}

/** Tests only: reset the module-level drag state. */
export function resetCellDragState(): void {
  dragSource.value = null;
  dragOverCells.clear();
}
