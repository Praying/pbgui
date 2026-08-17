import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from '@/shared/i18n';
import ResultsTable from './ResultsTable.vue';
import type { BacktestResultItem, ResultActionKind } from '../types';

/*
 * ResultsTable — _renderResultsTableInto (:5514-5577) as a Vue table:
 * sortable headers with the results whitelist, liquidation tinting, the
 * five per-result icon toggles + optional V8 convert, click/drag row
 * selection.
 */

enableAutoUnmount(afterEach);

function row(partial: Partial<BacktestResultItem> & { path: string }): BacktestResultItem {
  return {
    config_name: 'cfg',
    result_name: 'r',
    exchange_dir: 'binance',
    backtest_version: 'v7',
    modified: '2024-01-02T03:04:05Z',
    adg: 0.0123,
    gain: 45.6,
    drawdown_worst: 0.1234,
    sharpe_ratio: 1.234,
    starting_balance: 1000,
    final_balance: 1456,
    twe_long: 1.5,
    twe_short: 0.5,
    pos_long: 3,
    pos_short: 1,
    ...partial,
  };
}

const i18n = createI18n('en');

function mountTable(
  props: Partial<InstanceType<typeof ResultsTable>['$props']> = {},
  activeActions: Record<string, ReadonlySet<ResultActionKind>> = {}
) {
  const rows = props.rows ?? [
    row({ path: 'p1', config_name: 'alpha', coins: ['BTC'] }),
    row({ path: 'p2', config_name: 'beta', backtest_version: 'v8', strategy: 'neat' }),
  ];
  return mount(ResultsTable, {
    props: {
      rows,
      selected: new Set<string>(props.selected ?? ['p2']),
      sort: props.sort ?? { col: 'modified', asc: false },
      activeActions,
      showVersion: props.showVersion ?? true,
      allowV8Convert: props.allowV8Convert ?? false,
    },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('headers (:5532-5539)', () => {
  it('renders the sortable header set with arrows on the active column', () => {
    const wrapper = mountTable();
    const headers = wrapper.findAll('thead th[data-col]');
    expect(headers.map((h) => h.attributes('data-col'))).toEqual([
      'backtest_version',
      'config_name',
      'strategy',
      'coins_text',
      'exchange_dir',
      'modified',
      'adg',
      'gain',
      'drawdown_worst',
      'sharpe_ratio',
      'starting_balance',
      'final_balance',
    ]);
    const modified = headers.find((h) => h.attributes('data-col') === 'modified')!;
    expect(modified.text()).toContain('▼'); // desc
    expect(modified.attributes('title')).toContain('Sort by');
  });

  it('hides the version column on demand (:5527)', () => {
    const wrapper = mountTable({ showVersion: false, rows: [row({ path: 'p1' })] });
    expect(wrapper.find('thead th[data-col="backtest_version"]').exists()).toBe(false);
  });

  it('the strategy column appears only when a v8 row is present (:5528-5530)', () => {
    const v7Only = mountTable({ rows: [row({ path: 'p1' })] });
    expect(v7Only.find('thead th[data-col="strategy"]').exists()).toBe(false);
  });

  it('the coins column appears only when a row carries coins (:5524-5526)', () => {
    const withCoins = mountTable({ rows: [row({ path: 'p1', coins: ['BTC'] })] });
    expect(withCoins.find('thead th[data-col="coins_text"]').exists()).toBe(true);
  });

  it('emits sort on header click', async () => {
    const wrapper = mountTable();
    await wrapper.find('thead th[data-col="adg"]').trigger('click');
    expect(wrapper.emitted('sort')).toEqual([['adg']]);
  });
});

describe('rows (:5541-5574)', () => {
  it('renders metric cells with legacy precision and the TWE/POS pairs', () => {
    const wrapper = mountTable();
    const cells = wrapper.findAll('tbody tr')[0]!.findAll('td');
    const text = cells.map((c) => c.text());
    expect(text).toContain('0.0123'); // adg :4
    expect(text).toContain('45.60'); // gain :2
    expect(text).toContain('1.50 / 0.50'); // twe :2
    expect(text).toContain('3 / 1'); // pos :0
    expect(text).toContain('1000'); // starting_balance :0 — legacy fmt is plain toFixed
    expect(text).toContain('1456');
  });

  it('null metrics render the em dash (:fmt)', () => {
    const wrapper = mountTable({ rows: [row({ path: 'p1', adg: null, gain: null })] });
    const text = wrapper.findAll('tbody tr')[0]!.findAll('td').map((c) => c.text());
    expect(text).toContain('—');
  });

  it('tints liquidated rows and prefixes the warning (:5545-5552)', () => {
    const wrapper = mountTable({ rows: [row({ path: 'p1', liquidated: true, drawdown_worst: 0.97 })] });
    const tr = wrapper.find('tbody tr');
    expect(tr.attributes('data-liquidated')).toBe('true');
    expect(tr.find('td[data-col="config_name"]').text()).toContain('⚠️');
  });

  it('marks the selected rows', () => {
    const wrapper = mountTable();
    const trs = wrapper.findAll('tbody tr');
    expect(trs[0]!.classes()).not.toContain('selected');
    expect(trs[1]!.classes()).toContain('selected');
  });

  it('empty rows render the no-results empty state (:5520-5522)', () => {
    const wrapper = mountTable({ rows: [] });
    expect(wrapper.find('.empty-state').text()).toContain('No results');
  });
});

describe('actions cell (:5565-5572)', () => {
  it('renders the five icon toggles with active state from activeActions', () => {
    const wrapper = mountTable(undefined, { p1: new Set<ResultActionKind>(['view', 'analysis']) });
    const view = wrapper.find('button[data-action="view"][data-path="p1"]');
    const analysis = wrapper.find('button[data-action="analysis"][data-path="p1"]');
    const config = wrapper.find('button[data-action="config"][data-path="p1"]');
    expect(view.classes()).toContain('active');
    expect(analysis.classes()).toContain('active');
    expect(config.classes()).not.toContain('active');
    expect(wrapper.find('button[data-action="plot"][data-path="p1"]').exists()).toBe(true);
    expect(wrapper.find('button[data-action="fills"][data-path="p1"]').exists()).toBe(true);
  });

  it('emits toggle-action on icon click', async () => {
    const wrapper = mountTable();
    await wrapper.find('button[data-action="view"][data-path="p1"]').trigger('click');
    expect(wrapper.emitted('toggle-action')).toEqual([['p1', 'view']]);
  });

  it('the V8 convert button renders only for v7 rows with allowV8Convert (:5547-5549)', async () => {
    const none = mountTable({ allowV8Convert: false, rows: [row({ path: 'p1' })] });
    expect(none.find('button[data-action="convert"]').exists()).toBe(false);
    const enabled = mountTable({ allowV8Convert: true, rows: [row({ path: 'p1' })] });
    expect(enabled.find('button[data-action="convert"][data-path="p1"]').exists()).toBe(true);
    await enabled.find('button[data-action="convert"][data-path="p1"]').trigger('click');
    expect(enabled.emitted('convert')).toEqual([['p1']]);
  });

  it('icon clicks do not toggle row selection (:5565 stopPropagation)', async () => {
    const wrapper = mountTable();
    await wrapper.find('button[data-action="view"][data-path="p1"]').trigger('click');
    expect(wrapper.emitted('toggle-select')).toBeUndefined();
  });
});

describe('row selection interactions (:5755-5785)', () => {
  it('a row click emits toggle-select with the path', async () => {
    const wrapper = mountTable();
    await wrapper.findAll('tbody tr')[0]!.trigger('click');
    expect(wrapper.emitted('toggle-select')).toEqual([['p1']]);
  });

  it('a drag across rows emits select-paths with the covered range', async () => {
    const wrapper = mountTable({
      rows: [row({ path: 'a' }), row({ path: 'b' }), row({ path: 'c' })],
    });
    const trs = wrapper.findAll('tbody tr');
    vi.spyOn(trs[0]!.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 20 } as DOMRect);
    vi.spyOn(trs[1]!.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 40 } as DOMRect);
    vi.spyOn(trs[2]!.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 40, bottom: 60 } as DOMRect);
    trs[0]!.element.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientY: 10, bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousemove', { clientY: 30, bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mouseup', { clientY: 30, bubbles: true }));
    await nextTick();
    const range = wrapper.emitted('select-paths')?.at(-1);
    expect(range).toEqual([['a', 'b'], true]);
  });
});

describe('auto-scroll targets the real scroll container (:5773)', () => {
  it('drag-selects inside #results-list-wrap and scrolls THAT wrap near its edge', async () => {
    const rows = [row({ path: 'a' }), row({ path: 'b' }), row({ path: 'c' })];
    const scrollWrap = document.createElement('div');
    scrollWrap.id = 'results-list-wrap';
    const list = document.createElement('div');
    list.id = 'results-list';
    scrollWrap.appendChild(list);
    document.body.appendChild(scrollWrap);
    const wrapper = mount(ResultsTable, {
      props: { rows, selected: new Set<string>(), sort: { col: 'modified', asc: false }, activeActions: {} },
      global: { plugins: [i18n] },
      attachTo: list,
    });
    const trs = wrapper.findAll('tbody tr');
    vi.spyOn(trs[0]!.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 20 } as DOMRect);
    vi.spyOn(trs[1]!.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 40 } as DOMRect);
    vi.spyOn(trs[2]!.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 40, bottom: 60 } as DOMRect);
    vi.spyOn(scrollWrap, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, height: 100 } as DOMRect);
    Object.defineProperty(scrollWrap, 'scrollTop', {
      configurable: true,
      get: () => (scrollWrap as unknown as { __st?: number }).__st ?? 0,
      set: (v: number) => ((scrollWrap as unknown as { __st?: number }).__st = v),
    });
    trs[0]!.element.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientY: 10, bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousemove', { clientY: 30, bubbles: true })); // drag armed
    document.body.dispatchEvent(new MouseEvent('mousemove', { clientY: 95, bubbles: true })); // inside the wrap's bottom edge
    await new Promise((resolve) => setTimeout(resolve, 40)); // let rAF ticks run
    expect((scrollWrap as unknown as { __st?: number }).__st ?? 0).toBeGreaterThan(0);
    document.body.dispatchEvent(new MouseEvent('mouseup', { clientY: 95, bubbles: true }));
    expect(wrapper.emitted('select-paths')?.at(-1)).toEqual([['a', 'b', 'c'], true]);
    wrapper.unmount();
    document.body.innerHTML = '';
  });
});
