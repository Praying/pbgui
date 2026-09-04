import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import EmptyCell from './EmptyCell.vue';

/* EmptyCell = interim stub with the legacy widget-chrome contract:
   .dt-header as the cell drag source + edit-mode trash → clearCell. */

enableAutoUnmount(afterEach);

beforeEach(() => {
  resetDashboardStore();
});

function mountEmptyCell(options: { viewOnly?: boolean; type?: string; onStart?: (e: DragEvent) => void } = {}) {
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: options.viewOnly ?? false,
    standalone: false,
  });
  store.loadConfig({ dashboard_type_1_2: options.type ?? 'PNL' });

  const host = defineComponent({
    components: { EmptyCell },
    setup() {
      const cellRoot = ref<HTMLElement | null>(null);
      return { cellRoot };
    },
    provide() {
      return {
        [cellContextKey as symbol]: { row: 1, col: 2 },
        [widgetDragKey as symbol]: {
          onHeaderDragStart: (e: DragEvent) => options.onStart?.(e),
          onHeaderDragEnd: () => {},
        },
      };
    },
    template: '<div ref="cellRoot"><EmptyCell /></div>',
  });
  return mount(host);
}

describe('EmptyCell stub', () => {
  it('renders the legacy chrome bar: icon + label in a draggable .dt-header', () => {
    const w = mountEmptyCell();
    const hdr = w.get('.dt-header');
    expect(hdr.attributes('draggable')).toBe('true');
    expect(hdr.find('.dt-icon svg').exists()).toBe(true);
    expect(hdr.get('.dt-title').text()).toBe('PNL');
  });

  it('uses translated labels for translated widget types', () => {
    const w = mountEmptyCell({ type: 'BALANCE' });
    expect(w.get('.dt-title').text()).toBe('Balance'); // dash.widgetBalance fallback
  });

  it('shows the trash button in edit mode and clears the cell on click', async () => {
    const store = useDashboardStore();
    const w = mountEmptyCell({ type: 'ORDERS' });
    const trash = w.get('.dt-trash');
    expect(trash.attributes('title')).toBe('Remove widget');
    await trash.trigger('click');
    expect(store.cellType(1, 2)).toBe('NONE');
  });

  it('hides the trash button in view mode', () => {
    const w = mountEmptyCell({ viewOnly: true });
    expect(w.find('.dt-trash').exists()).toBe(false);
    expect(w.get('.dt-header').attributes('draggable')).toBe('true'); // swap still works
  });

  it('forwards the header dragstart/dragend to the cell drag handlers', async () => {
    const onStart = vi.fn();
    const w = mountEmptyCell({ onStart });
    const hdr = w.get('.dt-header');
    const dt = { effectAllowed: '', setData: vi.fn() } as unknown as DataTransfer;
    await hdr.trigger('dragstart', { dataTransfer: dt });
    expect(onStart).toHaveBeenCalledTimes(1);
    await hdr.trigger('dragend');
  });

  it('renders an empty icon for unknown persisted types (legacy meta lookup miss)', () => {
    const w = mountEmptyCell({ type: 'BOGUS' });
    expect(w.get('.dt-icon').text()).toBe('');
    expect(w.get('.dt-title').text()).toBe('EMPTY'); // dash.empty fallback
  });
});
