import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDashboardStore, useDashboardStore } from '../stores/dashboardStore';
import { resetCellDragState, useCellDrag } from './useCellDrag';

/* Port of the legacy drag & drop state machine (dashboard_editor.html:2154-2155,
   2257-2286, 2327-2343, 2160-2179): page-global dragSrc + per-cell drag-over
   classes + the drop dispatcher (palette copy vs cell move). */

function dataTransfer(get: Record<string, string>): { getData: (k: string) => string } {
  return { getData: (k: string) => get[k] ?? '' };
}

beforeEach(() => {
  resetDashboardStore();
  resetCellDragState();
  vi.useFakeTimers();
});

describe('drag source state', () => {
  it('tracks the cell being dragged and the drop effect', () => {
    const drag = useCellDrag();
    expect(drag.dropEffect()).toBe('copy'); // no cell drag → palette copy
    drag.beginCellDrag(2, 1);
    expect(drag.dragSource).toEqual({ row: 2, col: 1 });
    expect(drag.dropEffect()).toBe('move');
  });

  it('endCellDrag clears the source and every drag-over marker', () => {
    const drag = useCellDrag();
    drag.beginCellDrag(1, 1);
    drag.markDragOver('2_1');
    drag.markDragOver('3_1');
    drag.endCellDrag();
    expect(drag.dragSource).toBeNull();
    expect(drag.dragOverCells.has('2_1')).toBe(false);
    expect(drag.dragOverCells.has('3_1')).toBe(false);
  });

  it('isCellDragging reports whether the given cell is the drag source', () => {
    const drag = useCellDrag();
    expect(drag.isCellDragging(1, 1)).toBe(false);
    drag.beginCellDrag(1, 1);
    expect(drag.isCellDragging(1, 1)).toBe(true);
    expect(drag.isCellDragging(1, 2)).toBe(false);
  });
});

describe('drag-over markers', () => {
  it('markDragOver / unmarkDragOver toggle the per-cell marker', () => {
    const drag = useCellDrag();
    drag.markDragOver('1_1');
    expect(drag.dragOverCells.has('1_1')).toBe(true);
    drag.unmarkDragOver('1_1');
    expect(drag.dragOverCells.has('1_1')).toBe(false);
  });

  it('clearDragOver clears markers but keeps the drag source (palette dragend)', () => {
    const drag = useCellDrag();
    drag.beginCellDrag(1, 1);
    drag.markDragOver('2_1');
    drag.clearDragOver();
    expect(drag.dragOverCells.size).toBe(0);
    expect(drag.dragSource).toEqual({ row: 1, col: 1 });
  });
});

describe('handleCellDrop — palette copy (editor:2269-2279)', () => {
  it('assigns the widget type from the widget-type data channel', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    const drag = useCellDrag();
    drag.handleCellDrop(1, 1, dataTransfer({ 'widget-type': 'PNL' }));
    expect(store.cellType(1, 1)).toBe('PNL');
    vi.advanceTimersByTime(400);
    /* palette drop syncs (scheduleSync) — verified via store state + timer */
  });

  it('overwrites an existing cell type (legacy palette drop replaces)', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ dashboard_type_1_1: 'TOP' });
    const drag = useCellDrag();
    drag.handleCellDrop(1, 1, dataTransfer({ 'widget-type': 'ORDERS' }));
    expect(store.cellType(1, 1)).toBe('ORDERS');
  });

  it('wins over an active cell drag (palette data checked first)', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ dashboard_type_1_1: 'PNL', dashboard_type_1_2: 'TOP' });
    const drag = useCellDrag();
    drag.beginCellDrag(1, 1);
    drag.handleCellDrop(1, 2, dataTransfer({ 'widget-type': 'BALANCE' }));
    expect(store.cellType(1, 1)).toBe('PNL'); // no swap happened
    expect(store.cellType(1, 2)).toBe('BALANCE'); // palette copy won
  });

  it('removes the drag-over marker on the target', () => {
    const drag = useCellDrag();
    drag.markDragOver('1_1');
    drag.handleCellDrop(1, 1, dataTransfer({ 'widget-type': 'PNL' }));
    expect(drag.dragOverCells.has('1_1')).toBe(false);
  });
});

describe('handleCellDrop — cell move (editor:2280-2285)', () => {
  it('swaps the two cells when dropping on a different cell', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({
      rows: 1,
      cols: 2,
      dashboard_type_1_1: 'PNL',
      dashboard_type_1_2: 'TOP',
    });
    const drag = useCellDrag();
    drag.beginCellDrag(1, 1);
    drag.handleCellDrop(1, 2, dataTransfer({ 'text/plain': '1_1' }));
    expect(store.cellType(1, 1)).toBe('TOP');
    expect(store.cellType(1, 2)).toBe('PNL');
  });

  it('does nothing when dropped back onto the source cell', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ dashboard_type_1_1: 'PNL' });
    const drag = useCellDrag();
    drag.beginCellDrag(1, 1);
    drag.handleCellDrop(1, 1, dataTransfer({}));
    expect(store.cellType(1, 1)).toBe('PNL');
    expect(drag.dragSource).toBeNull(); // dragSrc reset after drop (editor:2284)
  });

  it('clears the drag source after a successful swap', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ rows: 1, cols: 2, dashboard_type_1_1: 'PNL', dashboard_type_1_2: 'TOP' });
    const drag = useCellDrag();
    drag.beginCellDrag(1, 1);
    drag.handleCellDrop(1, 2, dataTransfer({}));
    expect(drag.dragSource).toBeNull();
  });

  it('falls through to move when the widget-type data is unknown', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ rows: 1, cols: 2, dashboard_type_1_1: 'PNL', dashboard_type_1_2: 'TOP' });
    const drag = useCellDrag();
    drag.beginCellDrag(1, 1);
    drag.handleCellDrop(1, 2, dataTransfer({ 'widget-type': 'BOGUS' }));
    expect(store.cellType(1, 1)).toBe('TOP');
    expect(store.cellType(1, 2)).toBe('PNL');
  });

  it('handles a null dataTransfer (no data channels)', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ rows: 1, cols: 2, dashboard_type_1_1: 'PNL', dashboard_type_1_2: 'TOP' });
    const drag = useCellDrag();
    drag.beginCellDrag(1, 1);
    drag.handleCellDrop(1, 2, null);
    expect(store.cellType(1, 1)).toBe('TOP');
  });

  it('marks the view dirty instead of syncing when swapping in view mode', () => {
    const parent = { postMessage: vi.fn() };
    const store = useDashboardStore({
      apiBase: '/api',
      origName: '',
      viewOnly: true,
      standalone: false,
      parentWindow: () => parent as unknown as Window,
    });
    store.loadConfig({ rows: 1, cols: 2, dashboard_type_1_1: 'PNL', dashboard_type_1_2: 'TOP' });
    const drag = useCellDrag();
    drag.beginCellDrag(1, 1);
    drag.handleCellDrop(1, 2, dataTransfer({}));
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'pbgui_view_dirty' }, '*');
  });
});
