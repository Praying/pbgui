import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { resetSavedZoom } from '../../lib/savedZoom';
import type { PlotlyVendor } from '../../lib/plotlyVendor';
import WidgetAdg from './WidgetAdg.vue';

/* WidgetAdg — port of buildAdgInline (editor:1611-1703) + buildAdg/renderAdg
 * (render.js:3860-4130), including the balance summary line (render.js:4024-4031). */

enableAutoUnmount(afterEach);

const react = vi.fn();

function installPlotly(): void {
  (window as unknown as { Plotly: PlotlyVendor }).Plotly = {
    react: react.mockImplementation((el: unknown, traces: unknown, layout: unknown) => {
      const gd = el as { layout?: unknown; data?: unknown; on?: unknown };
      gd.layout = layout as Record<string, unknown>;
      gd.data = traces as unknown[];
      gd.on = gd.on ?? vi.fn();
    }),
    relayout: vi.fn(),
    purge: vi.fn(),
    Plots: { resize: vi.fn() },
  };
}

beforeEach(() => {
  react.mockClear();
  resetDashboardStore();
  resetSavedZoom();
  installPlotly();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { Plotly?: PlotlyVendor }).Plotly;
});

const ADG_PAYLOAD = {
  bars: [{ date: '2025-01-01', adg: 1.5 }, { date: '2025-01-02', adg: -2 }],
  mode: 'bar',
  starting_balance: 1000,
  total_pnl: 50,
  current_balance: 1050,
  from_date: '2025-01-01',
  to_date: '2025-01-02',
};

function mountAdg(options: {
  config?: Record<string, unknown>;
  payload?: unknown;
} = {}): { wrapper: ReturnType<typeof mount>; env: { store: ReturnType<typeof useDashboardStore>; fetch: ReturnType<typeof vi.fn> } } {
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: false,
    standalone: false,
  });
  store.loadConfig(options.config ?? { dashboard_type_1_2: 'ADG' });

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => options.payload ?? ADG_PAYLOAD,
  });
  vi.stubGlobal('fetch', fetchMock);

  const host = defineComponent({
    components: { WidgetAdg },
    provide() {
      return {
        [cellContextKey as symbol]: { row: 1, col: 2 },
        [widgetDragKey as symbol]: {
          onHeaderDragStart: () => {},
          onHeaderDragEnd: () => {},
        },
      };
    },
    template: '<div class="cell-wrap"><WidgetAdg /></div>',
  });
  return { wrapper: mount(host), env: { store, fetch: fetchMock } };
}

describe('WidgetAdg', () => {
  it('writes the legacy ensure-defaults block and fetches adg_data', async () => {
    const { env } = mountAdg();
    await flushPromises();
    expect(env.store.state['dashboard_adg_users_1_2']).toEqual(['ALL']);
    expect(env.store.state['dashboard_adg_period_1_2']).toBe('THIS_MONTH');
    expect(env.store.state['dashboard_adg_mode_1_2']).toBe('bar');
    expect(env.fetch).toHaveBeenCalledWith('/api/dashboard/adg_data?users=ALL&period=THIS_MONTH&mode=bar');
  });

  it('renders the literal ADG title (untranslated in legacy, render.js:4015) and ADG traces', async () => {
    const { wrapper } = mountAdg();
    await flushPromises();
    expect(wrapper.get('.dt-title').text()).toBe('ADG');
    expect(wrapper.get('.dt-icon').text()).toBe('📈');
    expect(react.mock.calls[0]![1]).toEqual([
      {
        x: ['2025-01-01', '2025-01-02'],
        y: [1.5, -2],
        type: 'bar',
        marker: { color: ['#8fb593', '#c58e8a'] },
        text: ['1.50', '-2.00'],
        textposition: 'auto',
        hovertemplate: '<b>%{x}</b><br>ADG: %{y:.2f}%<extra></extra>',
      },
    ]);
  });

  it('renders the balance summary line before the daterange (render.js:4024-4031)', async () => {
    const { wrapper } = mountAdg();
    await flushPromises();
    const ranges = wrapper.findAll('.dt-daterange');
    expect(ranges).toHaveLength(2);
    expect(ranges[0]!.text()).toBe(
      'Starting Balance: 1000.00 · Total PNL: 50.00 · Current Balance: 1050.00'
    );
    expect(ranges[1]!.text()).toBe('From: 2025-01-01  To: 2025-01-02');
  });

  it('omits the summary line without a starting_balance (legacy !== undefined check)', async () => {
    const { wrapper } = mountAdg({
      payload: { ...ADG_PAYLOAD, starting_balance: undefined },
    });
    await flushPromises();
    expect(wrapper.findAll('.dt-daterange')).toHaveLength(1);
  });

  it('shows the no-data state for empty bars', async () => {
    const { wrapper } = mountAdg({ payload: { ...ADG_PAYLOAD, bars: [] } });
    await flushPromises();
    expect(wrapper.get('.dt-nodata').text()).toBe('No data for the selected period.');
    expect(react).not.toHaveBeenCalled();
  });
});
