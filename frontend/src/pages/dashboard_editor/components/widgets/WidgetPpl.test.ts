import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { getSavedZoom, resetSavedZoom } from '../../lib/savedZoom';
import type { PlotlyVendor } from '../../lib/plotlyVendor';
import WidgetPpl from './WidgetPpl.vue';

/* WidgetPpl — port of buildPplInline (editor:1785-1919) + buildPpl/renderPpl
 * (render.js:1873-2127), including the fractional zoom remap on sum-period
 * switches (dashboard_ppl.html _getFracZoom + render.js:1901-1913). */

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

const PPL_PAYLOAD = {
  bars: [
    { period: '2025-W01', profits: 10.5, losses: 0 },
    { period: '2025-W02', profits: 0, losses: 3.25 },
  ],
  sum_period: 'WEEK',
  from_date: '2025-01-01',
  to_date: '2025-01-14',
};

interface Env {
  store: ReturnType<typeof useDashboardStore>;
  fetch: ReturnType<typeof vi.fn>;
}

function mountPpl(options: {
  config?: Record<string, unknown>;
  payload?: unknown;
} = {}): { wrapper: ReturnType<typeof mount>; env: Env } {
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: false,
    standalone: false,
  });
  store.loadConfig(options.config ?? { dashboard_type_1_2: 'P+L' });

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => options.payload ?? PPL_PAYLOAD,
  });
  vi.stubGlobal('fetch', fetchMock);

  const host = defineComponent({
    components: { WidgetPpl },
    provide() {
      return {
        [cellContextKey as symbol]: { row: 1, col: 2 },
        [widgetDragKey as symbol]: {
          onHeaderDragStart: () => {},
          onHeaderDragEnd: () => {},
        },
      };
    },
    template: '<div class="cell-wrap"><WidgetPpl /></div>',
  });
  return { wrapper: mount(host), env: { store, fetch: fetchMock } };
}

describe('WidgetPpl', () => {
  it('writes the legacy ensure-defaults block and fetches ppl_data (editor:1790-1801)', async () => {
    const { env } = mountPpl();
    await flushPromises();
    expect(env.store.state['dashboard_ppl_users_1_2']).toEqual(['ALL']);
    expect(env.store.state['dashboard_ppl_period_1_2']).toBe('THIS_MONTH');
    expect(env.store.state['dashboard_ppl_sum_period_1_2']).toBe('MONTH');
    expect(env.fetch).toHaveBeenCalledWith(
      '/api/dashboard/ppl_data?users=ALL&period=THIS_MONTH&sum_period=MONTH'
    );
  });

  it('renders the legacy title/icon and the profit + loss traces', async () => {
    const { wrapper } = mountPpl();
    await flushPromises();
    expect(wrapper.get('.dt-title').text()).toBe('Profits and Losses');
    expect(wrapper.get('.dt-icon').text()).toBe('📉');
    expect(react.mock.calls[0]![1]).toEqual([
      {
        x: ['2025-W01', '2025-W02'],
        y: [10.5, 0],
        type: 'bar',
        name: 'Profits',
        marker: { color: '#48bb78' },
        text: ['10.50', ''],
        textposition: 'outside',
        hovertemplate: '<b>%{x}</b><br>Profits: %{y:.2f}<extra></extra>',
      },
      {
        x: ['2025-W01', '2025-W02'],
        y: [0, 3.25],
        type: 'bar',
        name: 'Losses',
        marker: { color: '#f56565' },
        text: ['', '3.25'],
        textposition: 'outside',
        hovertemplate: '<b>%{x}</b><br>Losses: %{y:.2f}<extra></extra>',
      },
    ]);
  });

  it('renders the sum-period select with DAY/WEEK/MONTH (editor:1807-1817)', async () => {
    const { wrapper } = mountPpl();
    await flushPromises();
    const select = wrapper.get('select.dt-ctrl-sel');
    expect(select.findAll('option').map((o) => o.text())).toEqual(['DAY', 'WEEK', 'MONTH']);
    expect((select.element as HTMLSelectElement).value).toBe('MONTH');
  });

  it('captures the fractional zoom, writes the state and refetches on a sum-period switch', async () => {
    const { wrapper, env } = mountPpl();
    await flushPromises();
    /* simulate a user zoom: 4 bars, x-range [1, 3] → frac [0.25, 0.75] */
    const gd = wrapper.get('.dt-chart').element as HTMLElement & {
      layout?: Record<string, unknown>;
      data?: unknown[];
    };
    gd.layout = {
      xaxis: { autorange: false, range: [1, 3] },
      yaxis: { autorange: false, range: [9, 10] },
    };
    gd.data = [{ x: [0, 1, 2, 3] }];

    await wrapper.get('select.dt-ctrl-sel').setValue('WEEK');
    expect(env.store.state['dashboard_ppl_sum_period_1_2']).toBe('WEEK');
    expect(getSavedZoom('1_2')).toEqual({
      xrange: null, yrange: [9, 10], fracRange: [0.25, 0.75],
    });
    await flushPromises();
    expect(env.fetch).toHaveBeenLastCalledWith(
      '/api/dashboard/ppl_data?users=ALL&period=THIS_MONTH&sum_period=WEEK'
    );
  });

  it('remaps the fractional zoom onto the new bar count after the sum-period switch', async () => {
    const { wrapper, env } = mountPpl();
    await flushPromises();
    const gd = wrapper.get('.dt-chart').element as HTMLElement & {
      layout?: Record<string, unknown>;
      data?: unknown[];
    };
    gd.layout = {
      xaxis: { autorange: false, range: [1, 3] },
      yaxis: { autorange: false, range: [9, 10] },
    };
    gd.data = [{ x: [0, 1, 2, 3] }];
    /* the refetch returns 8 bars */
    env.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        bars: Array.from({ length: 8 }, (_, i) => ({
          period: 'p' + i, profits: 1, losses: 0,
        })),
        sum_period: 'WEEK',
      }),
    });
    await wrapper.get('select.dt-ctrl-sel').setValue('WEEK');
    await flushPromises();
    const layout = react.mock.calls[1]![2] as Record<string, unknown>;
    expect((layout.xaxis as Record<string, unknown>).range).toEqual([2, 6]);
    expect((layout.xaxis as Record<string, unknown>).autorange).toBe(false);
    expect(getSavedZoom('1_2')?.fracRange).toBeUndefined(); // one-shot consumed
  });

  it('shows the no-data state for empty bars', async () => {
    const { wrapper } = mountPpl({ payload: { ...PPL_PAYLOAD, bars: [] } });
    await flushPromises();
    expect(wrapper.get('.dt-nodata').text()).toBe('No data for the selected period.');
    expect(react).not.toHaveBeenCalled();
  });
});
