import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRECISION_PALETTE } from '@/shared/lib/precisionPalette';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { resetLivePositionsRegistry } from '../../lib/livePositionsRegistry';
import MultiSelectDropdown from '../MultiSelectDropdown.vue';
import WidgetBalance from './WidgetBalance.vue';

/*
 * WidgetBalance — port of buildBalanceInline (dashboard_editor.html:1161-1216)
 * + DashRender.buildBalance/renderBalanceRows (dashboard_render.js:428-586).
 * The old code is the spec; assertions mirror it.
 */

enableAutoUnmount(afterEach);

interface Env {
  store: ReturnType<typeof useDashboardStore>;
  fetch: ReturnType<typeof vi.fn>;
}

const PAYLOAD = {
  rows: [
    { user: 'alice', date: '2025-01-01 10:00:00', balance: 1000, upnl: 12.5, we: 95 },
    { user: 'bob', date: '2025-01-01 09:00:00', balance: 250.555, upnl: -3, we: 250 },
  ],
  totals: { balance: 1250.5, upnl: 9.5, we: 120 },
  source: 'db',
};

const attached: HTMLElement[] = [];

function rgbColorFromHex(hexColor: string): string {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  return `rgb(${red}, ${green}, ${blue})`;
}

function mountBalance(options: {
  config?: Record<string, unknown>;
  payload?: unknown;
  fetchError?: boolean;
  viewOnly?: boolean;
} = {}): { wrapper: ReturnType<typeof mount>; env: Env } {
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: options.viewOnly ?? false,
    standalone: false,
  });
  store.loadConfig(options.config ?? { dashboard_type_1_2: 'BALANCE' });

  const fetchMock = vi.fn();
  if (options.fetchError) {
    fetchMock.mockRejectedValue(new Error('network'));
  } else {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => options.payload ?? PAYLOAD });
  }
  vi.stubGlobal('fetch', fetchMock);

  /* attached to the document: the live poll's isConnected guard reads
     rootEl.isConnected of the rendered widget (legacy container.isConnected) */
  const attachTo = document.createElement('div');
  document.body.appendChild(attachTo);
  attached.push(attachTo);

  const host = defineComponent({
    components: { WidgetBalance },
    provide() {
      return {
        [cellContextKey as symbol]: { row: 1, col: 2 },
        [widgetDragKey as symbol]: {
          onHeaderDragStart: () => {},
          onHeaderDragEnd: () => {},
        },
      };
    },
    template: '<div class="cell-wrap"><WidgetBalance /></div>',
  });
  return { wrapper: mount(host, { attachTo }), env: { store, fetch: fetchMock } };
}

beforeEach(() => {
  resetDashboardStore();
  resetLivePositionsRegistry();
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const el of attached.splice(0)) el.remove();
});

describe('WidgetBalance', () => {
  it('fetches the legacy balance URL with ALL users on mount (editor:1176-1177)', async () => {
    const { env } = mountBalance();
    await flushPromises();
    expect(env.fetch).toHaveBeenCalledWith('/api/dashboard/balance?users=ALL');
  });

  it('shows the legacy loading status while the first fetch is in flight', () => {
    const { wrapper } = mountBalance();
    expect(wrapper.get('.db-status').text()).toBe('Loading…');
  });

  it('shows the data-unavailable error when the fetch fails (editor:1207-1215)', async () => {
    const { wrapper } = mountBalance({ fetchError: true });
    await flushPromises();
    expect(wrapper.get('.db-status').text()).toBe('⚠ Data unavailable');
  });

  it('renders the totals header with the legacy formatting (render.js:502-508)', async () => {
    const { wrapper } = mountBalance();
    await flushPromises();
    const items = wrapper.findAll('.db-total-item');
    expect(items).toHaveLength(3);
    expect(items[0]!.find('label').text()).toBe('Total Balance');
    expect(items[0]!.find('span').text()).toBe('$1250.50 USDT');
    expect(items[1]!.find('label').text()).toBe('Total uPnl');
    expect(items[1]!.find('span').text()).toBe('+9.50');
    expect(items[2]!.find('label').text()).toBe('Total TWE');
    expect(items[2]!.find('span').text()).toBe('120.00 %');
  });

  it('renders the icon, users control and edit-mode trash in the header order', async () => {
    const { wrapper } = mountBalance();
    await flushPromises();
    const header = wrapper.get('.db-header');
    expect(header.find('.dt-icon').text()).toBe('⚖️');
    expect(header.find('.db-user-sel label').text()).toBe('Users:');
    expect(wrapper.findComponent(MultiSelectDropdown).exists()).toBe(true);
    expect(header.find('.dt-trash').exists()).toBe(true);
    /* icon precedes the totals (render.js:511-516 insertBefore) */
    expect(header.element.firstElementChild!.classList.contains('dt-icon')).toBe(true);
  });

  it('hides the trash in view mode', async () => {
    const { wrapper } = mountBalance({ viewOnly: true });
    await flushPromises();
    expect(wrapper.find('.dt-trash').exists()).toBe(false);
  });

  it('renders the table headers and rows (renderBalanceRows, render.js:428-449)', async () => {
    const { wrapper } = mountBalance();
    await flushPromises();
    expect(wrapper.findAll('.db-table thead th').map((th) => th.text())).toEqual([
      'User', 'Date', 'Balance USDT', 'uPnl', 'TWE %',
    ]);
    const trs = wrapper.findAll('.db-table tbody tr');
    expect(trs).toHaveLength(2);
    const tds = trs[0]!.findAll('td');
    expect(tds[0]!.text()).toBe('alice');
    expect(tds[1]!.classes()).toContain('db-muted');
    expect(tds[1]!.text()).toBe('2025-01-01 10:00:00');
    expect(tds[2]!.text()).toBe('1000.00');
    expect(tds[3]!.text()).toBe('+12.50');
    expect(tds[3]!.attributes('style')).toContain(rgbColorFromHex(PRECISION_PALETTE.success.base));
    expect(tds[4]!.find('.db-twe-lbl').text()).toBe('95.00');
    expect(tds[4]!.find('.db-twe-fill').attributes('style')).toContain('scaleX(0.317)');
    /* we 250 → 83.3% bar in red (tweBarPct cap only at 300; tweColor <100/<200) */
    const tds2 = trs[1]!.findAll('td');
    expect(tds2[4]!.find('.db-twe-fill').attributes('style')).toContain('scaleX(0.833)');
    expect(tds2[4]!.find('.db-twe-lbl').attributes('style')).toContain(
      rgbColorFromHex(PRECISION_PALETTE.danger.base)
    );
  });

  it('shows the no-data state for empty rows (render.js:557-564)', async () => {
    const { wrapper } = mountBalance({ payload: { rows: [], totals: { balance: 0, upnl: 0, we: 0 } } });
    await flushPromises();
    expect(wrapper.get('.db-nodata').text()).toBe('No balance data.');
    expect(wrapper.find('.db-table').exists()).toBe(false);
  });

  it('shows the source status line aged from the fetch (render.js:551-555)', async () => {
    const { wrapper } = mountBalance();
    await flushPromises();
    expect(wrapper.get('.db-status').text()).toBe('DB fallback: now');
  });

  it('marks the cell auto-height when no height is stored (editor:1198-1203)', async () => {
    const { env } = mountBalance();
    await flushPromises();
    expect(env.store.autoHeightCells['1_2']).toBe(true);
  });

  it('does not mark auto-height when a height is stored', async () => {
    const { env } = mountBalance({ config: { dashboard_type_1_2: 'BALANCE', dashboard_height_1_2: 300 } });
    await flushPromises();
    expect(env.store.autoHeightCells['1_2']).toBeUndefined();
  });

  it('commits the users multi-select to state, syncs and refetches (editor:1185-1188)', async () => {
    const { wrapper, env } = mountBalance();
    await flushPromises();
    const syncSpy = vi.spyOn(env.store, 'scheduleSync');
    wrapper.findComponent(MultiSelectDropdown).vm.$emit('update:modelValue', ['alice']);
    expect(env.store.state['dashboard_balance_users_1_2']).toEqual(['alice']);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(env.fetch).toHaveBeenLastCalledWith('/api/dashboard/balance?users=alice');
  });

  it('starts the live poll for eligible users and applies live payloads (editor:1121-1159)', async () => {
    const { wrapper, env } = mountBalance({
      config: { dashboard_type_1_2: 'BALANCE', dashboard_balance_users_1_2: ['alice'] },
    });
    await flushPromises();
    /* REST fetch first, then the immediate live refresh (editor:1154) */
    expect(env.fetch).toHaveBeenNthCalledWith(1, '/api/dashboard/balance?users=alice');
    expect(env.fetch).toHaveBeenNthCalledWith(2, '/api/dashboard/balance?users=alice&live=1');
  });

  it('updates rows in place when the live poll delivers a live payload', async () => {
    const livePayload = {
      rows: [{ user: 'alice', date: '2025-01-02 10:00:00', balance: 2000, upnl: 5, we: 50 }],
      totals: { balance: 2000, upnl: 5, we: 50 },
      source: 'live',
    };
    const { wrapper, env } = mountBalance({
      config: { dashboard_type_1_2: 'BALANCE', dashboard_balance_users_1_2: ['alice'] },
      payload: PAYLOAD,
    });
    /* first REST response, then the live refresh response */
    env.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => livePayload });
    await flushPromises();
    const trs = wrapper.findAll('.db-table tbody tr');
    expect(trs).toHaveLength(1);
    expect(trs[0]!.findAll('td')[2]!.text()).toBe('2000.00');
    /* live source colors the status line green (editor:1149, _setSourceStatus) */
    const status = wrapper.get('.db-status');
    expect(status.text()).toBe('Live: now');
    expect(status.attributes('style')).toContain(rgbColorFromHex(PRECISION_PALETTE.success.base));
  });

  it('does not poll for ALL users (editor:1128)', async () => {
    const { env } = mountBalance();
    await flushPromises();
    expect(env.fetch).toHaveBeenCalledTimes(1);
  });
});
