import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { resetDashboardStore, useDashboardStore } from '../stores/dashboardStore';
import LayoutPicker from './LayoutPicker.vue';

/* Port of buildLayoutPicker + updateActiveThumb (editor:2527-2631). */

enableAutoUnmount(afterEach);

beforeEach(() => {
  resetDashboardStore();
  useDashboardStore({ apiBase: '/api', origName: '', viewOnly: false, standalone: false });
});

describe('LayoutPicker', () => {
  it('renders 10 preset thumbs grouped 1-col / 2-col with labels', () => {
    const w = mount(LayoutPicker);
    expect(w.findAll('.lt-thumb')).toHaveLength(10);
    const labels = w.findAll('.lt-lbl').map((l) => l.text());
    expect(labels).toEqual(['1 COL', '2 COLS']);
    expect(w.find('.lt-sep').exists()).toBe(true);
  });

  it('renders thumb grid styles and titles like the legacy builder', () => {
    const w = mount(LayoutPicker);
    const first = w.findAll('.lt-thumb')[0]!;
    expect(first.attributes('data-rows')).toBe('1');
    expect(first.attributes('data-cols')).toBe('1');
    expect(first.attributes('title')).toBe('1×1');
    expect(first.attributes('style')).toContain('grid-template-columns: 1fr;');
    expect(first.attributes('style')).toContain('grid-template-rows: repeat(1, 1fr);');
    expect(first.findAll('.lt-cell')).toHaveLength(1);
    const twoCol3 = w.findAll('.lt-thumb')[7]!; // 2 cols × 3 rows
    expect(twoCol3.attributes('style')).toContain('grid-template-columns: 1fr 1fr;');
    expect(twoCol3.findAll('.lt-cell')).toHaveLength(6);
  });

  it('marks the active thumb for the current rows×cols', async () => {
    const store = useDashboardStore();
    store.setLayout(3, 1);
    const w = mount(LayoutPicker);
    const active = w.findAll('.lt-thumb.active');
    expect(active).toHaveLength(1);
    expect(active[0]!.attributes('data-rows')).toBe('3');
    expect(active[0]!.attributes('data-cols')).toBe('1');
  });

  it('clicking a thumb applies the layout through the store', async () => {
    const store = useDashboardStore();
    const w = mount(LayoutPicker);
    const twoCol4 = w.findAll('.lt-thumb')[8]!; // 2×4
    await twoCol4.trigger('click');
    expect(store.rows).toBe(4);
    expect(store.cols).toBe(2);
  });

  it('hides the dim badge when a preset matches', () => {
    const store = useDashboardStore();
    store.setLayout(2, 2);
    const w = mount(LayoutPicker);
    expect(w.get('.lt-dim').attributes('style')).toContain('display: none');
  });

  it('shows the cols×rows dim badge only for custom sizes (editor:2552-2559)', async () => {
    const store = useDashboardStore();
    store.setLayout(7, 2);
    const w = mount(LayoutPicker);
    const dim = w.get('.lt-dim');
    expect(dim.attributes('style')).toContain('inline-flex');
    expect(dim.text()).toBe('2×7');
    /* and the badge hides again once a preset is chosen */
    await w.findAll('.lt-thumb')[8]!.trigger('click'); // 2×4 preset
    expect(store.rows).toBe(4);
    expect(w.get('.lt-dim').attributes('style')).toContain('display: none');
  });
});
