import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { isPositionsLive, resetLivePositionsRegistry } from '../../lib/livePositionsRegistry';
import { rememberedPosition, resetPositionsBus } from '../../lib/positionsBus';
import MultiSelectDropdown from '../MultiSelectDropdown.vue';
import PositionsManageModal from './PositionsManageModal.vue';
import WidgetPositions from './WidgetPositions.vue';

/*
 * WidgetPositions — port of buildPositionsInline (dashboard_editor.html:1922-1975)
 * + DashRender.buildPositions' table half (dashboard_render.js:2131-2260,
 * 3200-3281). The old code is the spec.
 */

enableAutoUnmount(afterEach);

interface Env {
  store: ReturnType<typeof useDashboardStore>;
  fetch: ReturnType<typeof vi.fn>;
}

const ROWS = [
  {
    user: 'alice', exchange: 'binance', symbol: 'BTCUSDT', side: 'long',
    size: 2, upnl: 12.5, entry: 100, price: 110, dca: 0, next_dca: 90, next_tp: 130, pos_value: 220,
  },
  {
    user: 'bob', exchange: 'binance', symbol: 'ETHUSDT', side: 'short',
    size: 3, upnl: -4, entry: 50, price: 45, dca: 1, next_dca: 40, next_tp: 60, pos_value: 135,
  },
];

const PAYLOAD = { positions: ROWS, source: 'db' };

function mountPositions(options: {
  config?: Record<string, unknown>;
  payload?: unknown;
  livePayload?: unknown;
  /** The live refresh only returns livePayload from this call on. */
  liveFromCall?: number;
  fetchError?: boolean;
  viewOnly?: boolean;
} = {}): { wrapper: ReturnType<typeof mount>; env: Env } {
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: options.viewOnly ?? false,
    standalone: false,
  });
  store.loadConfig(options.config ?? { dashboard_type_1_2: 'POSITIONS' });

  const fetchMock = vi.fn();
  if (options.fetchError) {
    fetchMock.mockRejectedValue(new Error('network'));
  } else if (options.livePayload !== undefined) {
    /* REST fetch first, then the live-poll refresh (per-call payloads) */
    const liveFrom = options.liveFromCall ?? 2;
    let call = 0;
    fetchMock.mockImplementation(async () => {
      call++;
      return {
        ok: true,
        status: 200,
        json: async () => (call < liveFrom ? (options.payload ?? PAYLOAD) : options.livePayload),
      };
    });
  } else {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => options.payload ?? PAYLOAD });
  }
  vi.stubGlobal('fetch', fetchMock);

  const attachTo = document.createElement('div');
  document.body.appendChild(attachTo);
  attached.push(attachTo);

  const host = defineComponent({
    components: { WidgetPositions },
    provide() {
      return {
        [cellContextKey as symbol]: { row: 1, col: 2 },
        [widgetDragKey as symbol]: {
          onHeaderDragStart: () => {},
          onHeaderDragEnd: () => {},
        },
      };
    },
    template: '<div class="cell-wrap"><WidgetPositions /></div>',
  });
  return { wrapper: mount(host, { attachTo }), env: { store, fetch: fetchMock } };
}

const attached: HTMLElement[] = [];

beforeEach(() => {
  resetDashboardStore();
  resetLivePositionsRegistry();
  resetPositionsBus();
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const el of attached.splice(0)) el.remove();
});

describe('WidgetPositions', () => {
  it('ensures the users default ["ALL"] in state without syncing (editor:1926)', async () => {
    const { env } = mountPositions();
    await flushPromises();
    expect(env.store.state['dashboard_positions_users_1_2']).toEqual(['ALL']);
    expect(env.fetch).toHaveBeenCalledWith('/api/dashboard/positions_data?users=ALL');
  });

  it('does not schedule a sync for the ensure-default write', async () => {
    const { env } = mountPositions();
    const syncSpy = vi.spyOn(env.store, 'scheduleSync');
    await flushPromises();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('shows the legacy loading status while the first fetch is in flight', () => {
    const { wrapper } = mountPositions();
    expect(wrapper.get('.dt-status').text()).toBe('Loading…');
  });

  it('shows the data-unavailable error when the fetch fails (editor:1966-1974)', async () => {
    const { wrapper } = mountPositions({ fetchError: true });
    await flushPromises();
    expect(wrapper.get('.dt-status').text()).toBe('⚠ Data unavailable');
  });

  it('renders the header chrome: icon, title, Manage button, users, trash (render.js:2151-2189)', async () => {
    const { wrapper } = mountPositions();
    await flushPromises();
    const header = wrapper.get('.dt-header');
    expect(header.find('.dt-icon svg').exists()).toBe(true);
    expect(header.find('.dt-title').text()).toBe('Positions');
    const manage = header.get('.dp-manage-btn');
    expect(manage.text()).toBe('Manage');
    expect(manage.attributes('title')).toBe('Manage selected position');
    expect(header.find('.dt-meta-lbl').text()).toBe('Users');
    expect(wrapper.findComponent(MultiSelectDropdown).exists()).toBe(true);
    expect(header.find('.dt-trash').exists()).toBe(true);
    expect(header.element.firstElementChild!.classList.contains('dt-icon')).toBe(true);
  });

  it('hides the trash in view mode', async () => {
    const { wrapper } = mountPositions({ viewOnly: true });
    await flushPromises();
    expect(wrapper.find('.dt-trash').exists()).toBe(false);
  });

  it('renders the 11 legacy columns with the legacy cell formats (render.js:2208-2220)', async () => {
    const { wrapper } = mountPositions();
    await flushPromises();
    expect(wrapper.findAll('.dp-table thead th').map((th) => th.text())).toEqual([
      'User', 'Symbol', 'Side', 'Size', 'uPnl', 'Entry', 'Price', 'DCA', 'Next DCA', 'Next TP', 'Pos Value',
    ]);
    const tds = wrapper.findAll('.dp-table tbody tr')[0]!.findAll('td');
    expect(tds.map((td) => td.text())).toEqual([
      'alice', 'BTCUSDT', 'long', '2.000', '12.5000', '100.00000', '110.00000', '0', '90.00000', '130.00000', '220.00',
    ]);
    expect(tds[4]!.classes()).toContain('dp-upnl-pos');
    expect(wrapper.findAll('.dp-table tbody tr')[1]!.findAll('td')[4]!.classes()).toContain('dp-upnl-neg');
  });

  it('shows the no-positions state (render.js:2198-2205)', async () => {
    const { wrapper } = mountPositions({ payload: { positions: [] } });
    await flushPromises();
    expect(wrapper.get('.dt-nodata').text()).toBe('No open positions.');
    expect(wrapper.find('.dp-table').exists()).toBe(false);
  });

  it('sorts by column click with the legacy arrow toggle (render.js:2237-2241, 3213-3222)', async () => {
    const { wrapper } = mountPositions();
    await flushPromises();
    const ths = wrapper.findAll('.dp-table thead th');
    await ths[0]!.trigger('click');
    expect((ths[0]!.find('.dp-sort').element as HTMLElement).textContent).toBe(' \u25B2');
    expect(wrapper.findAll('.dp-table tbody tr td')[0]!.text()).toBe('alice');
    await ths[0]!.trigger('click');
    expect((ths[0]!.find('.dp-sort').element as HTMLElement).textContent).toBe(' \u25BC');
    expect(wrapper.findAll('.dp-table tbody tr td')[0]!.text()).toBe('bob');
    /* other columns keep empty arrows */
    expect((ths[1]!.find('.dp-sort').element as HTMLElement).textContent).toBe('');
  });

  it('selects a row, highlights it and fires the positions-selected contract (render.js:3239-3251)', async () => {
    const { wrapper } = mountPositions();
    await flushPromises();
    const handler = vi.fn();
    document.addEventListener('dash-pos-selected', handler);
    const trs = wrapper.findAll('.dp-table tbody tr');
    await trs[1]!.trigger('click');
    expect(trs[1]!.classes()).toContain('dp-sel');
    expect(trs[0]!.classes()).not.toContain('dp-sel');
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]![0] as CustomEvent).detail).toEqual({ pos: '1_2', data: ROWS[1] });
    expect(rememberedPosition('1_2')).toEqual(ROWS[1]);
    document.removeEventListener('dash-pos-selected', handler);
  });

  it('preserves selection and sort across live updates (render.js:3258-3276)', async () => {
    vi.useFakeTimers();
    try {
      const livePayload = {
        positions: [
          { ...ROWS[1]!, upnl: -5 },
          { ...ROWS[0]!, upnl: 20 },
        ],
        source: 'live',
      };
      const { wrapper } = mountPositions({
        config: { dashboard_type_1_2: 'POSITIONS', dashboard_positions_users_1_2: ['alice', 'bob'] },
        /* the FIRST live refresh keeps the payload order; the next poll
           (after the 5 s min gap) delivers the reordered live rows */
        livePayload,
        liveFromCall: 3,
      });
      await vi.advanceTimersByTimeAsync(0);
      await wrapper.findAll('.dp-table tbody tr')[1]!.trigger('click'); /* bob */
      expect(wrapper.findAll('.dp-table tbody tr')[1]!.classes()).toContain('dp-sel');
      await vi.advanceTimersByTimeAsync(6000);
      const trs = wrapper.findAll('.dp-table tbody tr');
      expect(trs[0]!.findAll('td')[0]!.text()).toBe('bob'); /* live order kept (no sort) */
      expect(trs[0]!.classes()).toContain('dp-sel'); /* selection followed the row key */
      expect(wrapper.get('.dt-status').text()).toMatch(/^Live: /);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the cell auto-height when no height is stored (editor:1956-1962)', async () => {
    const { env } = mountPositions();
    await flushPromises();
    expect(env.store.autoHeightCells['1_2']).toBe(true);
  });

  it('does not mark auto-height when a height is stored', async () => {
    const { env } = mountPositions({ config: { dashboard_type_1_2: 'POSITIONS', dashboard_height_1_2: 300 } });
    await flushPromises();
    expect(env.store.autoHeightCells['1_2']).toBeUndefined();
  });

  it('commits the users multi-select to state, syncs and refetches (editor:1945-1948)', async () => {
    const { wrapper, env } = mountPositions();
    await flushPromises();
    const syncSpy = vi.spyOn(env.store, 'scheduleSync');
    wrapper.findComponent(MultiSelectDropdown).vm.$emit('update:modelValue', ['alice']);
    expect(env.store.state['dashboard_positions_users_1_2']).toEqual(['alice']);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(env.fetch).toHaveBeenLastCalledWith('/api/dashboard/positions_data?users=alice');
  });

  it('registers its live poll for the WS guard while eligible (editor:2807)', async () => {
    mountPositions({ config: { dashboard_type_1_2: 'POSITIONS', dashboard_positions_users_1_2: ['alice', 'bob'] } });
    await flushPromises();
    expect(isPositionsLive('1_2')).toBe(true);
  });

  it('does not register a live poll for ALL users', async () => {
    mountPositions();
    await flushPromises();
    expect(isPositionsLive('1_2')).toBe(false);
  });

  it('unregisters the live poll on unmount', async () => {
    const { wrapper } = mountPositions({
      config: { dashboard_type_1_2: 'POSITIONS', dashboard_positions_users_1_2: ['alice'] },
    });
    await flushPromises();
    expect(isPositionsLive('1_2')).toBe(true);
    wrapper.unmount();
    expect(isPositionsLive('1_2')).toBe(false);
  });

  it('opens the manage modal from the Manage button (render.js:2881)', async () => {
    const { wrapper } = mountPositions();
    await flushPromises();
    await wrapper.get('.dp-manage-btn').trigger('click');
    const modal = wrapper.findComponent(PositionsManageModal);
    expect(modal.exists()).toBe(true);
    expect(document.querySelector('#dp-manage-modal .dp-modal-title')?.textContent).toBe('Manage positions');
  });

  it('does not open the manage modal without positions (render.js:2882)', async () => {
    const { wrapper } = mountPositions({ payload: { positions: [] } });
    await flushPromises();
    await wrapper.get('.dp-manage-btn').trigger('click');
    expect(wrapper.findComponent(PositionsManageModal).exists()).toBe(false);
  });
});
