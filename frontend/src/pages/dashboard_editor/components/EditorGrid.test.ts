import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { resetDashboardStore, useDashboardStore } from '../stores/dashboardStore';
import { resetCellDragState } from '../composables/useCellDrag';
import EditorGrid from './EditorGrid.vue';

/* The grid container: one column wrapper per column, rows 1..rows each
   (editor:2231-2251). */

enableAutoUnmount(afterEach);

beforeEach(() => {
  resetDashboardStore();
  resetCellDragState();
});

function setup(rows = 2, cols = 2): ReturnType<typeof useDashboardStore> {
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: false,
    standalone: false,
  });
  store.loadConfig({ rows, cols, dashboard_type_1_1: 'PNL' });
  return store;
}

describe('EditorGrid', () => {
  it('renders one column wrapper per column with the cols-N class', () => {
    setup(2, 2);
    const w = mount(EditorGrid, { attachTo: document.body });
    expect(w.attributes('id')).toBe('editor-grid');
    expect(w.classes()).toContain('editor-grid');
    expect(w.classes()).toContain('cols-2');
    expect(w.findAll('.editor-grid-col')).toHaveLength(2);
  });

  it('renders rows×cols cells with their legacy data attributes', () => {
    setup(3, 1);
    const w = mount(EditorGrid, { attachTo: document.body });
    const cells = w.findAll('.editor-cell');
    expect(cells).toHaveLength(3);
    expect(cells[0]!.attributes('data-row')).toBe('1');
    expect(cells[1]!.attributes('data-row')).toBe('2');
    expect(cells[2]!.attributes('data-row')).toBe('3');
    expect(cells[0]!.attributes('data-col')).toBe('1');
  });

  it('reacts to layout changes (setLayout rebuild parity)', async () => {
    const store = setup(1, 1);
    const w = mount(EditorGrid, { attachTo: document.body });
    expect(w.findAll('.editor-cell')).toHaveLength(1);
    store.setLayout(4, 2);
    await w.vm.$nextTick();
    expect(w.findAll('.editor-grid-col')).toHaveLength(2);
    expect(w.findAll('.editor-cell')).toHaveLength(8);
    expect(w.classes()).toContain('cols-2');
  });

  it('renders the widget stub inside a typed cell and the placeholder for NONE', () => {
    setup(1, 2);
    const w = mount(EditorGrid, { attachTo: document.body });
    const cols = w.findAll('.editor-grid-col');
    expect(cols[0]!.get('.dt-title').text()).toBe('PNL'); // typed cell
    expect(cols[1]!.get('.dt-status').text()).toBe('Drag a widget here'); // NONE
  });
});
