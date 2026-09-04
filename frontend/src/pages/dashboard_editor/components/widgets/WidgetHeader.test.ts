import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import WidgetHeader from './WidgetHeader.vue';

/*
 * The shared widget chrome — the dedup of the 4× duplicated legacy header
 * markup + _decorateHeader (render.js:406-421, buildTop/buildPnl/buildAdg/
 * buildPpl header blocks) and the editor's _attachViewDrag/_makeDeleteCb
 * (editor:2160-2179, 1016-1024): icon before title, meta slot, trash last,
 * header as the cell's drag source, edit-mode delete → clearCell.
 */

enableAutoUnmount(afterEach);

beforeEach(() => {
  resetDashboardStore();
});

function mountHeader(options: {
  viewOnly?: boolean;
  title?: string;
  icon?: string | null;
  onStart?: (e: DragEvent) => void;
  meta?: string;
} = {}) {
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: options.viewOnly ?? false,
    standalone: false,
  });
  store.loadConfig({ dashboard_type_1_2: 'PNL' });

  const host = defineComponent({
    components: { WidgetHeader },
    setup: () => ({
      title: options.title ?? 'Daily PNL',
      icon: options.icon === undefined ? '📊' : options.icon,
      meta: options.meta ?? '<span class="dt-meta">META</span>',
    }),
    provide() {
      return {
        [cellContextKey as symbol]: { row: 1, col: 2 },
        [widgetDragKey as symbol]: {
          onHeaderDragStart: (e: DragEvent) => options.onStart?.(e),
          onHeaderDragEnd: () => {},
        },
      };
    },
    template: '<WidgetHeader :title="title" :icon="icon"><div v-html="meta" /></WidgetHeader>',
  });
  return { wrapper: mount(host), store };
}

describe('WidgetHeader', () => {
  it('renders icon, title and the meta slot inside a draggable .dt-header', () => {
    const { wrapper } = mountHeader();
    const hdr = wrapper.get('.dt-header');
    expect(hdr.attributes('draggable')).toBe('true');
    expect(hdr.find('.dt-icon svg').exists()).toBe(true);
    expect(hdr.get('.dt-title').text()).toBe('Daily PNL');
    expect(hdr.get('.dt-meta').text()).toBe('META');
  });

  it('shows the trash button in edit mode and clears the cell on click (legacy _makeDeleteCb)', async () => {
    const { wrapper, store } = mountHeader();
    const trash = wrapper.get('.dt-trash');
    expect(trash.attributes('title')).toBe('Remove widget');
    await trash.trigger('click');
    expect(store.cellType(1, 2)).toBe('NONE');
  });

  it('hides the trash button in view mode (legacy onDelete null)', () => {
    const { wrapper } = mountHeader({ viewOnly: true });
    expect(wrapper.find('.dt-trash').exists()).toBe(false);
    expect(wrapper.get('.dt-header').attributes('draggable')).toBe('true'); // swap still works
  });

  it('omits the icon span when there is no icon', () => {
    const { wrapper } = mountHeader({ icon: null });
    expect(wrapper.find('.dt-icon').exists()).toBe(false);
  });

  it('forwards header dragstart/dragend to the cell drag handlers (legacy _attachViewDrag)', async () => {
    const onStart = vi.fn();
    const { wrapper } = mountHeader({ onStart });
    const hdr = wrapper.get('.dt-header');
    const dt = { effectAllowed: '', setData: vi.fn() } as unknown as DataTransfer;
    await hdr.trigger('dragstart', { dataTransfer: dt });
    expect(onStart).toHaveBeenCalledTimes(1);
    await hdr.trigger('dragend');
  });
});
