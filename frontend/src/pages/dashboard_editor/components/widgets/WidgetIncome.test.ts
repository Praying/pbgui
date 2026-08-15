import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { resetIncomeScroll } from '../../lib/incomeLogic';
import { resetSavedZoom } from '../../lib/savedZoom';
import type { PlotlyVendor } from '../../lib/plotlyVendor';
import PlotlyChart from './PlotlyChart.vue';
import IncomeChart from './IncomeChart.vue';
import IncomeTable from './IncomeTable.vue';
import WidgetIncome from './WidgetIncome.vue';

/* WidgetIncome — port of buildIncomeInline (dashboard_editor.html:1350-1515)
 * + the buildIncome dispatcher (dashboard_render.js:856-1027):
 * ensure-defaults, income_data fetch (generation-guarded), the
 * period/lastN/filter/users controls, the server-decided table/chart mode,
 * the cell pre-height freeze (editor:1474-1490) and the scroll preserve. */

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

const CHART_PAYLOAD = {
  mode: 'chart',
  rows: [],
  traces: [{ name: 'Total Income', x: ['2024-01-01 00:00:00'], y: [12.5] }],
  from_date: '2024-01-01',
  to_date: '2024-01-31',
};

const TABLE_PAYLOAD = {
  mode: 'table',
  rows: [
    { id: 3, date_ms: 1706230000000, date: '2024-01-25 23:13:20', symbol: 'BTC', income: 12.35, user: 'alice' },
    { id: 1, date_ms: 1706200000000, date: '2024-01-25 16:53:20', symbol: 'ETH', income: -4, user: 'bob' },
  ],
  traces: [],
  from_date: '2024-01-01',
  to_date: '2024-01-31',
};

interface MountOptions {
  config?: Record<string, unknown>;
  payload?: unknown;
  fetchError?: boolean;
  /** host wrapper element class — the freeze test needs .editor-cell */
  hostClass?: string;
}

function mountIncome(
  options: MountOptions = {}
): {
  wrapper: VueWrapper;
  env: {
    store: ReturnType<typeof useDashboardStore>;
    fetch: ReturnType<typeof vi.fn>;
  };
} {
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: false,
    standalone: false,
  });
  store.loadConfig(options.config ?? { dashboard_type_1_2: 'INCOME' });

  const fetchMock = vi.fn();
  if (options.fetchError) fetchMock.mockRejectedValue(new Error('network'));
  else {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => options.payload ?? CHART_PAYLOAD,
    });
  }
  vi.stubGlobal('fetch', fetchMock);

  const host = defineComponent({
    components: { WidgetIncome },
    provide() {
      return {
        [cellContextKey as symbol]: { row: 1, col: 2 },
        [widgetDragKey as symbol]: {
          onHeaderDragStart: () => {},
          onHeaderDragEnd: () => {},
        },
      };
    },
    template: `<div class="${options.hostClass ?? 'cell-wrap'}"><WidgetIncome /></div>`,
  });
  return { wrapper: mount(host, { attachTo: document.body }), env: { store, fetch: fetchMock } };
}

beforeEach(() => {
  react.mockClear();
  resetDashboardStore();
  resetSavedZoom();
  resetIncomeScroll();
  installPlotly();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { Plotly?: PlotlyVendor }).Plotly;
});

describe('WidgetIncome config + fetch (editor:1352-1389)', () => {
  it('writes the legacy ensure-defaults block into state (editor:1357-1361)', async () => {
    const { env } = mountIncome();
    await flushPromises();
    expect(env.store.state['dashboard_income_users_1_2']).toEqual(['ALL']);
    expect(env.store.state['dashboard_income_period_1_2']).toBe('THIS_MONTH');
    expect(env.store.state['dashboard_income_last_1_2']).toBe(0);
    expect(env.store.state['dashboard_income_filter_1_2']).toBe(0);
  });

  it('keeps existing config over the defaults', async () => {
    const { env } = mountIncome({
      config: {
        dashboard_type_1_2: 'INCOME',
        dashboard_income_users_1_2: ['alice'],
        dashboard_income_period_1_2: 'TODAY',
        dashboard_income_last_1_2: 50,
        dashboard_income_filter_1_2: 1.5,
      },
    });
    await flushPromises();
    expect(env.fetch).toHaveBeenCalledWith(
      '/api/dashboard/income_data?users=alice&period=TODAY&last_n=50&filter=1.5'
    );
  });

  it('fetches the legacy income_data URL with the ALL default (editor:1381-1385)', async () => {
    const { env } = mountIncome();
    await flushPromises();
    expect(env.fetch).toHaveBeenCalledWith('/api/dashboard/income_data?users=ALL&period=THIS_MONTH&last_n=0&filter=0');
  });

  it('shows the loading state first and the data-unavailable error on failure', async () => {
    const loading = mountIncome({ payload: undefined, fetchError: true });
    await flushPromises();
    expect(loading.wrapper.get('.dt-status').text()).toBe('⚠ Data unavailable');
  });
});

describe('WidgetIncome chrome (render.js:903-1009)', () => {
  it('renders the Income title, 💰 icon, controls and daterange', async () => {
    const { wrapper } = mountIncome();
    await flushPromises();
    expect(wrapper.get('.dt-title').text()).toBe('Income');
    expect(wrapper.get('.dt-icon').text()).toBe('💰');
    expect(wrapper.get('.dt-daterange').text()).toBe('From: 2024-01-01  To: 2024-01-31');
    expect(wrapper.find('input.dt-ctrl-num').exists()).toBe(true); /* Last N */
    expect(wrapper.find('.di-root').exists()).toBe(true);
  });

  it('renders the Last N + Filter + Users control labels in legacy order', async () => {
    const { wrapper } = mountIncome();
    await flushPromises();
    const labels = wrapper.findAll('.dt-meta-lbl').map((l) => l.text());
    expect(labels).toEqual(['Period', 'Last N', 'Filter', 'Users']);
  });
});

describe('WidgetIncome chart mode (server mode=chart, render.js:1016-1018)', () => {
  it('mounts IncomeChart (not the table) with the server traces', async () => {
    const { wrapper } = mountIncome();
    await flushPromises();
    expect(wrapper.findComponent(IncomeChart).exists()).toBe(true);
    expect(wrapper.findComponent(IncomeTable).exists()).toBe(false);
    expect(wrapper.getComponent(IncomeChart).props('traces')).toEqual(CHART_PAYLOAD.traces);
    expect(react).toHaveBeenCalled();
  });

  it('renders the no-data state when the chart payload has no traces', async () => {
    const { wrapper } = mountIncome({ payload: { ...CHART_PAYLOAD, traces: [] } });
    await flushPromises();
    expect(wrapper.get('.dt-nodata').text()).toBe('No data for the selected period.');
    expect(wrapper.findComponent(PlotlyChart).exists()).toBe(false);
  });
});

describe('WidgetIncome table mode (server mode=table, render.js:1014-1015)', () => {
  it('mounts IncomeTable with rows, users and the reload callback', async () => {
    const { wrapper } = mountIncome({
      config: { dashboard_type_1_2: 'INCOME', dashboard_income_last_1_2: 100 },
      payload: TABLE_PAYLOAD,
    });
    await flushPromises();
    expect(wrapper.findComponent(IncomeTable).exists()).toBe(true);
    expect(wrapper.findComponent(IncomeChart).exists()).toBe(false);
    const table = wrapper.getComponent(IncomeTable);
    expect(table.props('rows')).toEqual(TABLE_PAYLOAD.rows);
    expect(table.props('users')).toEqual(['ALL']);
    expect(table.props('apiBase')).toBe('/api');
    expect(table.props('pos')).toBe('1_2');
    expect(typeof table.props('onReload')).toBe('function');
    expect(wrapper.find('tbody tr[data-income-id="3"]').exists()).toBe(true);
  });

  it('defaults mode to chart when the payload omits it (render.js:860/1011)', async () => {
    const { wrapper } = mountIncome({ payload: { traces: CHART_PAYLOAD.traces } });
    await flushPromises();
    expect(wrapper.findComponent(IncomeChart).exists()).toBe(true);
  });
});

describe('WidgetIncome controls (editor:1391-1473)', () => {
  it('writes last_n and refetches on the Last N change (editor:1450-1458)', async () => {
    const { wrapper, env } = mountIncome({ payload: TABLE_PAYLOAD });
    await flushPromises();
    const input = wrapper.findAll('input.dt-ctrl-num')[0]!;
    await input.setValue('100');
    expect(env.store.state['dashboard_income_last_1_2']).toBe(100);
    await flushPromises();
    expect(env.fetch).toHaveBeenLastCalledWith(
      '/api/dashboard/income_data?users=ALL&period=THIS_MONTH&last_n=100&filter=0'
    );
  });

  it('coerces invalid Last N input to 0 (legacy parseInt || 0)', async () => {
    const { wrapper, env } = mountIncome({
      config: { dashboard_type_1_2: 'INCOME', dashboard_income_last_1_2: 40 },
    });
    await flushPromises();
    const input = wrapper.findAll('input.dt-ctrl-num')[0]!;
    await input.setValue('abc');
    expect(env.store.state['dashboard_income_last_1_2']).toBe(0);
  });

  it('writes the filter value and refetches (editor:1459-1468)', async () => {
    const { wrapper, env } = mountIncome();
    await flushPromises();
    const input = wrapper.findAll('input.dt-ctrl-num')[1]!;
    await input.setValue('2.5');
    expect(env.store.state['dashboard_income_filter_1_2']).toBe(2.5);
    await flushPromises();
    expect(env.fetch).toHaveBeenLastCalledWith(
      '/api/dashboard/income_data?users=ALL&period=THIS_MONTH&last_n=0&filter=2.5'
    );
  });

  it('writes the period through PeriodControls and refetches (editor:1391-1411)', async () => {
    const { wrapper, env } = mountIncome();
    await flushPromises();
    await wrapper.get('select.dt-ctrl-sel').setValue('TODAY');
    expect(env.store.state['dashboard_income_period_1_2']).toBe('TODAY');
    await flushPromises();
    expect(env.fetch).toHaveBeenLastCalledWith(
      '/api/dashboard/income_data?users=ALL&period=TODAY&last_n=0&filter=0'
    );
  });

  it('switching Last N>0 renders the table once table data arrives', async () => {
    const { wrapper } = mountIncome({ payload: TABLE_PAYLOAD });
    await flushPromises();
    const input = wrapper.findAll('input.dt-ctrl-num')[0]!;
    await input.setValue('50');
    await flushPromises();
    expect(wrapper.findComponent(IncomeTable).exists()).toBe(true);
  });
});

describe('WidgetIncome cell pre-height freeze (editor:1474-1490)', () => {
  let rectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const isCell = this.classList?.contains('editor-cell') === true;
      return {
        top: 0,
        bottom: 0,
        left: 0,
        right: 100,
        width: 100,
        height: isCell ? 420 : 20,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
  });

  afterEach(() => {
    rectSpy.mockRestore();
  });

  it('freezes the cell at its pre-table height when nothing is stored', async () => {
    const { wrapper } = mountIncome({ payload: TABLE_PAYLOAD, hostClass: 'editor-cell cell-wrap' });
    await flushPromises();
    const cell = wrapper.element as HTMLElement;
    expect(cell.classList.contains('editor-cell')).toBe(true);
    expect(cell.style.height).toBe('420px');
    expect(cell.style.overflow).toBe('hidden');
  });

  it('skips the freeze when a stored height exists (editor:1481)', async () => {
    const { wrapper } = mountIncome({
      config: { dashboard_type_1_2: 'INCOME', dashboard_height_1_2: 300 },
      payload: TABLE_PAYLOAD,
      hostClass: 'editor-cell cell-wrap',
    });
    await flushPromises();
    expect((wrapper.element as HTMLElement).style.height).toBe('');
  });

  it('skips the freeze for auto-height cells (editor:1483)', async () => {
    const store = useDashboardStore();
    const { wrapper } = mountIncome({ payload: TABLE_PAYLOAD, hostClass: 'editor-cell cell-wrap' });
    await flushPromises();
    expect((wrapper.element as HTMLElement).style.height).toBe('420px');
    store.resetCellHeight(1, 2); /* dblclick reset → auto-height flag */
    await flushPromises();
    /* the watcher must CLEAR the frozen inline height (legacy dblclick
       editor:2439-2441: cellEl.style.height = '') */
    expect((wrapper.element as HTMLElement).style.height).toBe('');
    expect((wrapper.element as HTMLElement).style.overflow).toBe('');
  });

  it('skips the freeze when the cell already has an inline height (rebuild parity, editor:1483)', async () => {
    const cellEl = document.createElement('div');
    cellEl.className = 'editor-cell';
    cellEl.style.height = '500px'; /* pre-frozen by an earlier build */
    document.body.appendChild(cellEl);
    const store = useDashboardStore({
      apiBase: '/api',
      origName: '',
      viewOnly: false,
      standalone: false,
    });
    store.loadConfig({ dashboard_type_1_2: 'INCOME' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => TABLE_PAYLOAD })
    );
    const host = defineComponent({
      components: { WidgetIncome },
      provide() {
        return {
          [cellContextKey as symbol]: { row: 1, col: 2 },
          [widgetDragKey as symbol]: { onHeaderDragStart: () => {}, onHeaderDragEnd: () => {} },
        };
      },
      template: '<div class="cell-wrap"><WidgetIncome /></div>',
    });
    mount(host, { attachTo: cellEl });
    await flushPromises();
    expect(cellEl.style.height).toBe('500px');
    cellEl.remove();
  });
});

describe('WidgetIncome reload (editor:1497 onReload)', () => {
  it('refetches through the IncomeTable onReload prop', async () => {
    const { wrapper, env } = mountIncome({ payload: TABLE_PAYLOAD });
    await flushPromises();
    env.fetch.mockClear();
    const reload = wrapper.getComponent(IncomeTable).props('onReload') as () => void;
    reload();
    await flushPromises();
    expect(env.fetch).toHaveBeenCalledTimes(1);
    expect(env.fetch).toHaveBeenCalledWith('/api/dashboard/income_data?users=ALL&period=THIS_MONTH&last_n=0&filter=0');
  });
});
