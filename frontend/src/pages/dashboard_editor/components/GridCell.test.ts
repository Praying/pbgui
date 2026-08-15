import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { resetDashboardStore, useDashboardStore } from '../stores/dashboardStore';
import { resetCellDragState } from '../composables/useCellDrag';
import GridCell from './GridCell.vue';

/* Port of buildGrid's cell markup/handlers (editor:2251-2356, 2372-2411). */

enableAutoUnmount(afterEach);

function dt(get: Record<string, string>): { getData: (k: string) => string } {
  return { getData: (k: string) => get[k] ?? '' };
}

interface Env {
  store: ReturnType<typeof useDashboardStore>;
  parent: { postMessage: ReturnType<typeof vi.fn> };
}

function setup(options: { viewOnly?: boolean; config?: Record<string, unknown> } = {}): Env {
  const parent = { postMessage: vi.fn() };
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: options.viewOnly ?? false,
    standalone: false,
    parentWindow: () => parent as unknown as Window,
  });
  store.loadConfig(options.config ?? {});
  return { store, parent };
}

beforeEach(() => {
  resetDashboardStore();
  resetCellDragState();
});

describe('GridCell', () => {
  it('renders the legacy cell shell: drop hint + inline preview + resize handle', () => {
    setup();
    const w = mount(GridCell, { props: { row: 1, col: 2 }, attachTo: document.body });
    const cell = w.get('.editor-cell');
    expect(cell.attributes('data-row')).toBe('1');
    expect(cell.attributes('data-col')).toBe('2');
    expect(w.get('.drop-hint').text()).toBe('Drop widget here');
    expect(w.find('.cell-inline-preview').exists()).toBe(true);
    expect(w.find('.resize-handle').exists()).toBe(true);
  });

  it('shows the dash.dragWidgetHere placeholder for NONE cells in edit mode', () => {
    setup();
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    expect(w.get('.dt-status').text()).toBe('Drag a widget here');
  });

  it('renders nothing in the preview for NONE cells in view mode', () => {
    setup({ viewOnly: true });
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    expect(w.find('.dt-status').exists()).toBe(false);
  });

  it('renders the EmptyCell stub for a typed cell', () => {
    setup({ config: { dashboard_type_1_1: 'PNL' } });
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    expect(w.get('.dt-title').text()).toBe('PNL');
  });

  it('shows the placeholder for unknown persisted types (legacy else branch)', () => {
    setup({ config: { dashboard_type_1_1: 'BOGUS' } });
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    expect(w.find('.dt-title').exists()).toBe(false);
    expect(w.get('.dt-status').text()).toBe('Drag a widget here');
  });

  it('applies the stored cell height + overflow (editor:2375-2376)', () => {
    setup({ config: { dashboard_height_1_1: 300 } });
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    const style = w.get('.editor-cell').attributes('style');
    expect(style).toContain('height: 300px');
    expect(style).toContain('overflow: hidden');
  });

  it('leaves the height unset without a stored height', () => {
    setup();
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    expect(w.get('.editor-cell').attributes('style')).toBeUndefined();
  });

  it('binds the auto-height class from the store', async () => {
    const env = setup({ config: { dashboard_type_1_1: 'PNL' } });
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    expect(w.get('.editor-cell').classes()).not.toContain('auto-height');
    env.store.resetCellHeight(1, 1);
    await w.vm.$nextTick();
    expect(w.get('.editor-cell').classes()).toContain('auto-height');
  });

  it('marks drag-over on dragover with the legacy dropEffect and unmarks on dragleave', async () => {
    setup();
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    const fakeDt = { dropEffect: '' } as unknown as DataTransfer;
    await w.get('.editor-cell').trigger('dragover', { dataTransfer: fakeDt });
    expect(w.get('.editor-cell').classes()).toContain('drag-over');
    expect(fakeDt.dropEffect).toBe('copy'); // no cell drag active
    await w.get('.editor-cell').trigger('dragleave');
    expect(w.get('.editor-cell').classes()).not.toContain('drag-over');
  });

  it('palette drop assigns the type to the cell (editor:2269-2279)', async () => {
    const env = setup();
    const w = mount(GridCell, { props: { row: 2, col: 1 }, attachTo: document.body });
    await w.get('.editor-cell').trigger('drop', {
      dataTransfer: dt({ 'widget-type': 'BALANCE' }),
    });
    expect(env.store.cellType(2, 1)).toBe('BALANCE');
    expect(w.get('.dt-title').text()).toBe('Balance');
  });

  it('cell move drop swaps with the drag source (editor:2280-2285)', async () => {
    const env = setup({
      config: {
        rows: 1,
        cols: 2,
        dashboard_type_1_1: 'PNL',
        dashboard_type_1_2: 'TOP',
      },
    });
    /* drag source = cell (1,1) */
    const a = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    await a.get('.dt-header').trigger('dragstart', {
      dataTransfer: { effectAllowed: '', setData: vi.fn() },
    });
    /* drop on cell (1,2) */
    const b = mount(GridCell, { props: { row: 1, col: 2 }, attachTo: document.body });
    await b.get('.editor-cell').trigger('drop', { dataTransfer: dt({}) });
    expect(env.store.cellType(1, 1)).toBe('TOP');
    expect(env.store.cellType(1, 2)).toBe('PNL');
    /* the swapping cell loses its dragging class */
    expect(a.get('.editor-cell').classes()).not.toContain('dragging');
  });

  it('widget header dragstart sets move effect + text/plain data (view drag port)', async () => {
    setup({ config: { dashboard_type_1_1: 'PNL' } });
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    const fakeDt = {
      effectAllowed: '',
      setData: vi.fn(),
    } as unknown as DataTransfer;
    await w.get('.dt-header').trigger('dragstart', { dataTransfer: fakeDt });
    expect(fakeDt.effectAllowed).toBe('move');
    expect(fakeDt.setData).toHaveBeenCalledWith('text/plain', '1_1');
    expect(w.get('.editor-cell').classes()).toContain('dragging');
  });

  it('remounts the widget when the cell epoch bumps (legacy buildGrid rebuild)', async () => {
    setup({ config: { dashboard_type_1_1: 'PNL' } });
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    const hdrBefore = w.get('.dt-header').element;
    const env = setup;
    useDashboardStore().assignCellType(1, 1, 'TOP');
    await w.vm.$nextTick();
    const hdrAfter = w.get('.dt-header').element;
    expect(hdrAfter).not.toBe(hdrBefore); // remounted (new component instance)
  });

  it('suppresses min-height while a live drag height is bound', async () => {
    setup({ config: { dashboard_height_1_1: 400 } });
    const w = mount(GridCell, { props: { row: 1, col: 1 }, attachTo: document.body });
    await w.vm.$nextTick(); // flush the cellElement prop to the handle
    /* drive the resize through the handle: mousedown anchors the height */
    const cell = w.get('.editor-cell').element as HTMLElement;
    Object.defineProperty(cell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ height: 400 }),
    });
    await w.get('.resize-handle').trigger('mousedown', { clientY: 200 });
    const style = w.get('.editor-cell').attributes('style');
    expect(style).toContain('min-height: 0');
    expect(style).toContain('height: 400px');
    document.dispatchEvent(new MouseEvent('mouseup', { clientY: 200 }));
    await w.vm.$nextTick();
    const after = w.get('.editor-cell').attributes('style');
    expect(after).not.toContain('min-height');
  });
});
