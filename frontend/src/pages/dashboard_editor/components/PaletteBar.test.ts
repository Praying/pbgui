import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { resetDashboardStore, useDashboardStore } from '../stores/dashboardStore';
import { resetCellDragState, useCellDrag } from '../composables/useCellDrag';
import PaletteBar from './PaletteBar.vue';

/* Port of buildPalette (editor:556-582). */

enableAutoUnmount(afterEach);

beforeEach(() => {
  resetDashboardStore();
  resetCellDragState();
  useDashboardStore({ apiBase: '/api', origName: '' });
});

describe('PaletteBar', () => {
  it('renders the 8 palette items in WIDGET_META order with icons', () => {
    const w = mount(PaletteBar);
    const items = w.findAll('.palette-item');
    expect(items).toHaveLength(8);
    expect(items.map((i) => i.attributes('data-widget-type'))).toEqual([
      'PNL', 'ADG', 'P+L', 'INCOME', 'TOP', 'BALANCE', 'POSITIONS', 'ORDERS',
    ]);
    expect(items[0]!.get('.pi-icon').text()).toBe('📊');
  });

  it('labels items: literals for PNL/ADG/P+L, dashT for the rest', () => {
    const w = mount(PaletteBar);
    const labels = w.findAll('.palette-item span:last-child').map((s) => s.text());
    expect(labels).toEqual([
      'PNL', 'ADG', 'P+L', 'Income', 'Top', 'Balance', 'Positions', 'Orders',
    ]);
  });

  it('shows the palette label (dash.widgets fallback)', () => {
    const w = mount(PaletteBar);
    expect(w.get('.palette-label').text()).toBe('Widgets');
  });

  it('dragstart sets copy effect + widget-type data channel + dragging class', async () => {
    const w = mount(PaletteBar);
    const item = w.findAll('.palette-item')[4]!; // TOP
    const dt = {
      effectAllowed: '',
      setData: vi.fn(),
    } as unknown as DataTransfer;
    await item.trigger('dragstart', { dataTransfer: dt });
    expect(dt.effectAllowed).toBe('copy');
    expect((dt.setData as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('widget-type', 'TOP');
    expect(item.classes()).toContain('dragging');
  });

  it('dragend removes the dragging class and clears every cell drag-over marker', async () => {
    const drag = useCellDrag();
    drag.markDragOver('2_1');
    const w = mount(PaletteBar);
    const item = w.findAll('.palette-item')[0]!;
    await item.trigger('dragstart', {
      dataTransfer: { effectAllowed: '', setData: vi.fn() },
    });
    expect(item.classes()).toContain('dragging');
    await item.trigger('dragend');
    expect(item.classes()).not.toContain('dragging');
    expect(drag.dragOverCells.size).toBe(0);
  });

  it('does not crash when dataTransfer is unavailable', async () => {
    const w = mount(PaletteBar);
    await w.findAll('.palette-item')[0]!.trigger('dragstart', { dataTransfer: null });
    await w.findAll('.palette-item')[0]!.trigger('dragend');
  });
});
