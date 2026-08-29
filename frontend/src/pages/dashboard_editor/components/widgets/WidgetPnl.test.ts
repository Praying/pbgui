import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRECISION_PALETTE } from '@/shared/lib/precisionPalette';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { pickSelectOption } from '@/shared/testing/select';
import { resetSavedZoom } from '../../lib/savedZoom';
import { applyRangeZoom } from '../../lib/plotlyLayouts';
import type { PlotlyVendor } from '../../lib/plotlyVendor';
import PlotlyChart from './PlotlyChart.vue';
import WidgetPnl from './WidgetPnl.vue';

/* WidgetPnl — port of buildPnlInline (editor:1517-1609) + buildPnl/renderPnl
 * (render.js:1582-1760). */

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

const PNL_PAYLOAD = {
  bars: [
    { date: '2025-01-01', income: 1.5 },
    { date: '2025-01-02', income: -2 },
  ],
  mode: 'bar',
  from_date: '2025-01-01',
  to_date: '2025-01-02',
};

function mountPnl(options: {
  config?: Record<string, unknown>;
  payload?: unknown;
  fetchError?: boolean;
} = {}): { wrapper: ReturnType<typeof mount>; env: { store: ReturnType<typeof useDashboardStore>; fetch: ReturnType<typeof vi.fn> } } {
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: false,
    standalone: false,
  });
  store.loadConfig(options.config ?? { dashboard_type_1_2: 'PNL' });

  const fetchMock = vi.fn();
  if (options.fetchError) fetchMock.mockRejectedValue(new Error('network'));
  else {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => options.payload ?? PNL_PAYLOAD,
    });
  }
  vi.stubGlobal('fetch', fetchMock);

  const host = defineComponent({
    components: { WidgetPnl },
    provide() {
      return {
        [cellContextKey as symbol]: { row: 1, col: 2 },
        [widgetDragKey as symbol]: {
          onHeaderDragStart: () => {},
          onHeaderDragEnd: () => {},
        },
      };
    },
    template: '<div class="cell-wrap"><WidgetPnl /></div>',
  });
  return { wrapper: mount(host), env: { store, fetch: fetchMock } };
}

describe('WidgetPnl', () => {
  it('writes the legacy ensure-defaults block into state (editor:1522-1524)', async () => {
    const { env } = mountPnl();
    await flushPromises();
    expect(env.store.state['dashboard_pnl_users_1_2']).toEqual(['ALL']);
    expect(env.store.state['dashboard_pnl_period_1_2']).toBe('THIS_MONTH');
    expect(env.store.state['dashboard_pnl_mode_1_2']).toBe('bar');
  });

  it('fetches the legacy pnl_data URL (editor:1525-1527)', async () => {
    const { env } = mountPnl();
    await flushPromises();
    expect(env.fetch).toHaveBeenCalledWith('/api/dashboard/pnl_data?users=ALL&period=THIS_MONTH&mode=bar');
  });

  it('renders the legacy title/icon/daterange and bar traces', async () => {
    const { wrapper } = mountPnl();
    await flushPromises();
    expect(wrapper.get('.dt-title').text()).toBe('Daily PNL');
    expect(wrapper.get('.dt-icon').text()).toBe('📊');
    expect(wrapper.get('.dt-daterange').text()).toBe('From: 2025-01-01  To: 2025-01-02');
    expect(react.mock.calls[0]![1]).toEqual([
      {
        x: ['2025-01-01', '2025-01-02'],
        y: [1.5, -2],
        type: 'bar',
        marker: { color: [PRECISION_PALETTE.success.base, PRECISION_PALETTE.danger.base] },
        text: ['1.50', '-2.00'],
        textposition: 'auto',
        hovertemplate: '<b>%{x}</b><br>Income: %{y:.2f}<extra></extra>',
      },
    ]);
  });

  it('uses the server mode for the trace shape (render.js:1596 `(data && data.mode) || "bar"`)', async () => {
    mountPnl({ payload: { ...PNL_PAYLOAD, mode: 'line' } });
    await flushPromises();
    expect((react.mock.calls[0]![1] as Record<string, unknown>[])[0]!.type).toBe('scatter');
  });

  it('writes the mode state and refetches on the mode select (editor:1554-1557)', async () => {
    const { wrapper, env } = mountPnl();
    await flushPromises();
    await pickSelectOption(wrapper, '.dt-ctrl-sel', 'line');
    expect(env.store.state['dashboard_pnl_mode_1_2']).toBe('line');
    await flushPromises();
    expect(env.fetch).toHaveBeenLastCalledWith('/api/dashboard/pnl_data?users=ALL&period=THIS_MONTH&mode=line');
  });

  it('shows the no-data state for empty bars and clears the zoom memory (render.js:1734-1740)', async () => {
    const { wrapper } = mountPnl({ payload: { ...PNL_PAYLOAD, bars: [] } });
    await flushPromises();
    expect(wrapper.get('.dt-nodata').text()).toBe('No data for the selected period.');
    expect(react).not.toHaveBeenCalled();
  });

  it('wires zoom preservation: zoomPos + applyRangeZoom (render.js:1630-1637)', async () => {
    const { wrapper } = mountPnl();
    await flushPromises();
    const chart = wrapper.findComponent(PlotlyChart);
    expect(chart.props('zoomPos')).toBe('1_2');
    expect(chart.props('applyZoom')).toBe(applyRangeZoom);
  });

  it('shows the data-unavailable error when the fetch fails', async () => {
    const { wrapper } = mountPnl({ fetchError: true });
    await flushPromises();
    expect(wrapper.get('.dt-status').text()).toBe('⚠ Data unavailable');
  });
});
