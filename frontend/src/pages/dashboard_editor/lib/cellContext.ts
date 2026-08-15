/**
 * Grid cell injection keys — the Vue replacement for the legacy DOM-level
 * cell contracts (dashboard_editor.html:2252-2254, 2410-2411, 2160-2179):
 *
 *  - cellContextKey: the cell's {row, col} — legacy cellEl.dataset.row/col
 *    readers (widgets locate their own config keys through it).
 *  - cellResizeKey: `() => resizePlotsInCell(cellRoot)` — the legacy
 *    `cellEl._resizePlots` hook (editor:2410-2411) that widget builders call
 *    after async renders.
 *  - widgetDragKey: drag handlers widgets bind to their own `.dt-header` /
 *    `.db-header` — legacy `_attachViewDrag(container, row, col)`
 *    (editor:2160-2179) attached dragstart/dragend to the widget header
 *    element itself (the editor `.cell-header` is display:none).
 */
import type { InjectionKey } from 'vue';

export interface CellContext {
  row: number;
  col: number;
}

export const cellContextKey: InjectionKey<CellContext> =
  Symbol('dashboard-editor-cell-context');

export const cellResizeKey: InjectionKey<() => void> =
  Symbol('dashboard-editor-cell-resize');

export interface WidgetDragHandlers {
  onHeaderDragStart: (e: DragEvent) => void;
  onHeaderDragEnd: () => void;
}

export const widgetDragKey: InjectionKey<WidgetDragHandlers> =
  Symbol('dashboard-editor-widget-drag');
