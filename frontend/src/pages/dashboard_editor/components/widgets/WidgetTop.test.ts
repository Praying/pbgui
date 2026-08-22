import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { resetSavedZoom } from '../../lib/savedZoom';
import type { PlotlyVendor } from '../../lib/plotlyVendor';
import MultiSelectDropdown from '../MultiSelectDropdown.vue';
import PlotlyChart from './PlotlyChart.vue';
import WidgetTop from './WidgetTop.vue';

/*
 * WidgetTop — port of buildTopInline (dashboard_editor.html:1218-1347) +
 * DashRender.buildTop/renderTop (dashboard_render.js:588-835). The old code
 * is the spec; every URL/state/dom assertion below mirrors it.
 */

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

interface Env {
  store: ReturnType<typeof useDashboardStore>;
  fetch: ReturnType<typeof vi.fn>;
}

function mountTop(options: {
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
  store.loadConfig(options.config ?? { dashboard_type_1_2: 'TOP' });

  const fetchMock = vi.fn();
  if (options.fetchError) {
    fetchMock.mockRejectedValue(new Error('network'));
  } else {
    const payload =
      options.payload ??
      {
        rows: [['1', 'BTC', '1.5'], ['2', 'ETH', -2]],
        from_date: '2025-01-01',
        to_date: '2025-01-31',
      };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => payload });
  }
  vi.stubGlobal('fetch', fetchMock);

  const host = defineComponent({
    components: { WidgetTop },
    provide() {
      return {
        [cellContextKey as symbol]: { row: 1, col: 2 },
        [widgetDragKey as symbol]: {
          onHeaderDragStart: () => {},
          onHeaderDragEnd: () => {},
        },
      };
    },
    template: '<div class="cell-wrap"><WidgetTop /></div>',
  });
  return { wrapper: mount(host), env: { store, fetch: fetchMock } };
}

const TOP_DATA_URL = '/api/dashboard/top_data?users=ALL&period=THIS_MONTH&top=10';

describe('WidgetTop', () => {
  it('fetches the legacy top_data URL with default config on mount (editor:1244-1247)', async () => {
    const { env } = mountTop();
    await flushPromises();
    expect(env.fetch).toHaveBeenCalledWith(TOP_DATA_URL);
  });

  it('shows the legacy loading status while the first fetch is in flight', () => {
    const { wrapper } = mountTop();
    expect(wrapper.get('.dt-status').text()).toBe('Loading…');
  });

  it('renders the legacy chrome: title, icon, daterange and the chart traces', async () => {
    const { wrapper } = mountTop();
    await flushPromises();
    expect(wrapper.get('.dt-title').text()).toBe('Top Symbols');
    expect(wrapper.get('.dt-icon').text()).toBe('🏆');
    expect(wrapper.get('.dt-daterange').text()).toBe('From: 2025-01-01  To: 2025-01-31');
    expect(react).toHaveBeenCalledTimes(1);
    const traces = react.mock.calls[0]![1] as Record<string, unknown>[];
    expect(traces).toEqual([
      {
        x: ['BTC', 'ETH'],
        y: [1.5, -2],
        type: 'bar',
        marker: { color: ['#8fb593', '#c58e8a'] },
        hovertemplate: '<b>%{x}</b><br>Income: %{y:.4f}<extra></extra>',
      },
    ]);
  });

  it('renders the topN/period/users controls with the legacy values', async () => {
    const { wrapper } = mountTop();
    await flushPromises();
    const num = wrapper.get('input.dt-ctrl-num');
    expect(num.attributes('min')).toBe('1');
    expect(num.attributes('max')).toBe('500');
    expect(num.attributes('step')).toBe('1');
    expect((num.element as HTMLInputElement).value).toBe('10');
    const select = wrapper.get('select.dt-ctrl-sel');
    expect(select.findAll('option').map((o) => o.text())).toEqual([
      'TODAY', 'YESTERDAY', 'THIS_WEEK', 'LAST_WEEK', 'LAST_WEEK_NOW',
      'THIS_MONTH', 'LAST_MONTH', 'LAST_MONTH_NOW',
      'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'LAST_180_DAYS', 'LAST_365_DAYS',
      'THIS_QUARTER', 'LAST_QUARTER', 'LAST_QUARTER_NOW',
      'THIS_YEAR', 'LAST_YEAR', 'LAST_YEAR_NOW', 'ALL_TIME', 'CUSTOM',
    ]);
    expect(wrapper.findComponent(MultiSelectDropdown).exists()).toBe(true);
  });

  it('shows the no-data state for empty rows (render.js:766-772)', async () => {
    const { wrapper } = mountTop({ payload: { rows: [], from_date: '', to_date: '' } });
    await flushPromises();
    expect(wrapper.get('.dt-nodata').text()).toBe('No data for the selected period.');
    expect(wrapper.find('.dt-chart').exists()).toBe(false);
    expect(react).not.toHaveBeenCalled();
  });

  it('shows the data-unavailable error when the fetch fails (editor:1340-1346)', async () => {
    const { wrapper } = mountTop({ fetchError: true });
    await flushPromises();
    expect(wrapper.get('.dt-status').text()).toBe('⚠ Data unavailable');
  });

  it('writes the topN state, schedules a sync and refetches on the number control (editor:1256-1260)', async () => {
    const { wrapper, env } = mountTop();
    await flushPromises();
    const syncSpy = vi.spyOn(env.store, 'scheduleSync');
    await wrapper.get('input.dt-ctrl-num').setValue('25');
    expect(env.store.state['dashboard_top_symbols_top_1_2']).toBe(25);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(env.fetch).toHaveBeenLastCalledWith(
      '/api/dashboard/top_data?users=ALL&period=THIS_MONTH&top=25'
    );
  });

  it('writes the legacy default CUSTOM range when the period select picks CUSTOM (editor:1267-1276)', async () => {
    const { wrapper, env } = mountTop();
    await flushPromises();
    await wrapper.get('select.dt-ctrl-sel').setValue('CUSTOM');
    const period = env.store.state['dashboard_top_symbols_period_1_2'];
    expect(period).toMatch(/^CUSTOM:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/);
    await flushPromises();
    expect(env.fetch).toHaveBeenLastCalledWith(
      '/api/dashboard/top_data?users=ALL&period=' + encodeURIComponent(String(period)) + '&top=10'
    );
  });

  it('passes plain period values through on the period select (editor:1274-1276)', async () => {
    const { wrapper, env } = mountTop();
    await flushPromises();
    await wrapper.get('select.dt-ctrl-sel').setValue('TODAY');
    expect(env.store.state['dashboard_top_symbols_period_1_2']).toBe('TODAY');
  });

  it('renders the CUSTOM from/to/Now controls only for CUSTOM periods (editor:1278-1330)', async () => {
    const { wrapper } = mountTop({
      config: {
        dashboard_type_1_2: 'TOP',
        dashboard_top_symbols_period_1_2: 'CUSTOM:2025-01-01:2025-01-31',
      },
    });
    await flushPromises();
    const dates = wrapper.findAll('input.dt-ctrl-date');
    expect(dates).toHaveLength(2);
    expect((dates[0]!.element as HTMLInputElement).value).toBe('2025-01-01');
    expect((dates[1]!.element as HTMLInputElement).value).toBe('2025-01-31');
    expect((dates[1]!.element as HTMLInputElement).disabled).toBe(false);
    const now = wrapper.get('.dt-ctrl-now-wrap input');
    expect((now.element as HTMLInputElement).checked).toBe(false);
    /* non-custom: no date inputs */
    expect(mountTop().wrapper.findAll('input.dt-ctrl-date')).toHaveLength(0);
  });

  it('toggles the Now checkbox between NOW and today (editor:1304-1325)', async () => {
    const { wrapper, env } = mountTop({
      config: {
        dashboard_type_1_2: 'TOP',
        dashboard_top_symbols_period_1_2: 'CUSTOM:2025-01-01:NOW',
      },
    });
    await flushPromises();
    const now = wrapper.get('.dt-ctrl-now-wrap input');
    expect((now.element as HTMLInputElement).checked).toBe(true);
    const dates = wrapper.findAll('input.dt-ctrl-date');
    expect(dates[1]!.attributes('disabled')).toBeDefined();
    await now.setValue(false);
    expect(env.store.state['dashboard_top_symbols_period_1_2']).toBe('CUSTOM:2025-01-01:' + new Date().toISOString().slice(0, 10));
    await now.setValue(true);
    expect(env.store.state['dashboard_top_symbols_period_1_2']).toBe('CUSTOM:2025-01-01:NOW');
  });

  it('commits the users multi-select to state and refetches (editor:1332-1335)', async () => {
    const { wrapper, env } = mountTop();
    await flushPromises();
    wrapper.findComponent(MultiSelectDropdown).vm.$emit('update:modelValue', ['alice']);
    expect(env.store.state['dashboard_top_symbols_users_1_2']).toEqual(['alice']);
    await flushPromises();
    expect(env.fetch).toHaveBeenLastCalledWith(
      '/api/dashboard/top_data?users=alice&period=THIS_MONTH&top=10'
    );
  });

  it('does not write default config keys to state (legacy TOP has no ensure-defaults block)', async () => {
    const { env } = mountTop();
    await flushPromises();
    expect(env.store.state['dashboard_top_symbols_users_1_2']).toBeUndefined();
    expect(env.store.state['dashboard_top_symbols_period_1_2']).toBeUndefined();
    expect(env.store.state['dashboard_top_symbols_top_1_2']).toBeUndefined();
  });

  it('passes the stored cell height (280 default) to the chart (editor:1330-1331)', async () => {
    const { wrapper } = mountTop({
      config: {
        dashboard_type_1_2: 'TOP',
        dashboard_height_1_2: 300,
      },
    });
    await flushPromises();
    const chart = wrapper.findComponent(PlotlyChart);
    expect(chart.props('height')).toBe(300);
    expect(chart.props('zoomPos')).toBeNull(); // TOP never preserves zoom
    expect(chart.props('displayModeBar')).toBe(true);
    expect(chart.props('responsive')).toBe(true);
  });
});
