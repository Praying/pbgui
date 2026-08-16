import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import DataTable from './DataTable.vue';
import type { InventoryColumn } from '../../lib/inventoryColumns';
import type { InventoryRow } from '../../lib/inventoryTypes';
import type { InventorySubsection } from '../../types';

/* M-data-6 — the sortable/selectable table (legacy renderInventoryTable
   :8004-8064, toggleInventorySort :7967-7977, row drag-select :9387-9423/
   :9457-9473/:9498-9510, syncInventorySelectionFromDom :7995-8002). */

const COLUMNS: InventoryColumn[] = [
  { key: 'coin', label: 'Coin' },
  { key: 'n_files', label: 'Files' },
];

const ROWS: InventoryRow[] = [
  { row_id: 'btc', coin: 'BTC', n_files: 10 },
  { row_id: 'eth', coin: 'ETH', n_files: 5 },
  { row_id: 'sol', coin: 'SOL', n_files: 1 },
];

function makeTable(overrides: Partial<{ selectedIds: string[]; sortKey: string; sortDirection: string }> = {}) {
  return mount(DataTable, {
    props: {
      columns: COLUMNS,
      rows: ROWS,
      selectedIds: overrides.selectedIds ?? [],
      sortKey: overrides.sortKey ?? 'coin',
      sortDirection: overrides.sortDirection ?? 'asc',
      exchange: 'hyperliquid',
      viewKey: '1m' as InventorySubsection,
    },
    attachTo: document.body,
  });
}

function rowIds(wrapper: VueWrapper): string[] {
  return wrapper.findAll('tbody tr').map((row) => row.attributes('data-row-id') ?? '');
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('rendering (:8034-8062)', () => {
  it('renders the column headers with sort buttons and indicators', () => {
    const table = makeTable({ sortKey: 'coin' });
    const buttons = table.findAll('.inventory-sort-btn');
    expect(buttons.map((b) => b.text())).toEqual(['CoinASC', 'Files']);
  });

  it('marks the active sort button (:8042)', () => {
    const table = makeTable({ sortKey: 'n_files', sortDirection: 'desc' });
    const active = table.findAll('.inventory-sort-btn').filter((b) => b.classes('is-active'));
    expect(active).toHaveLength(1);
    expect(active[0]?.text()).toBe('FilesDESC');
  });

  it('renders the cells through the legacy formatter (:8056-8057)', () => {
    const table = makeTable();
    expect(table.find('tbody tr td').attributes('title')).toBe('BTC');
  });

  it('marks selected rows (:8054)', () => {
    const table = makeTable({ selectedIds: ['eth'] });
    const selected = table.findAll('tbody tr').filter((r) => r.classes('is-selected'));
    expect(selected.map((r) => r.attributes('data-row-id'))).toEqual(['eth']);
  });
});

describe('sort clicks (:9382-9386)', () => {
  it('emits sort with the column key', async () => {
    const table = makeTable();
    await table.findAll('.inventory-sort-btn')[1]!.trigger('click');
    expect(table.emitted('sort')).toEqual([['n_files']]);
  });
});

describe('row selection (:9417-9423, :9498-9510)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const index = rows.indexOf(this);
      const top = index === -1 ? 0 : index * 30;
      return { top, bottom: top + 30 } as DOMRect;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles a single row on a plain click and commits the ids (:9499-9505)', async () => {
    const table = makeTable();
    const row = table.findAll('tbody tr')[1]!;
    await row.trigger('mousedown', { button: 0, clientY: 40 });
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(table.emitted('commit')).toEqual([[['eth']]]);
  });

  it('sweeps a range when dragged more than 5px (:9457-9473)', async () => {
    const table = makeTable();
    const row = table.findAll('tbody tr')[0]!;
    await row.trigger('mousedown', { button: 0, clientY: 5 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 40, bubbles: true, cancelable: true }));
    // rows 0..1 are in the 5..40 sweep → both get the add class
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(table.emitted('commit')).toEqual([[['btc', 'eth']]]);
  });

  it('sweeps a removal range from an already-selected anchor (:9460)', async () => {
    const table = makeTable({ selectedIds: ['btc'] });
    const row = table.findAll('tbody tr')[0]!;
    await row.trigger('mousedown', { button: 0, clientY: 5 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 40, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    // mode=remove from the selected anchor → btc unselected, eth never selected
    expect(table.emitted('commit')).toEqual([[[]]]);
  });

  it('ignores non-left buttons (:9388)', async () => {
    const table = makeTable();
    await table.findAll('tbody tr')[0]!.trigger('mousedown', { button: 2, clientY: 5 });
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(table.emitted('commit')).toBeUndefined();
  });

  it('keeps the committed ids within the rendered rows (:7995-8002)', async () => {
    const table = makeTable({ selectedIds: ['btc'] });
    const row = table.findAll('tbody tr')[2]!;
    await row.trigger('mousedown', { button: 0, clientY: 65 });
    document.dispatchEvent(new MouseEvent('mouseup'));
    // the DOM now holds btc (kept) + sol (toggled)
    expect(table.emitted('commit')).toEqual([[['btc', 'sol']]]);
  });
});

describe('empty state (:8016-8023)', () => {
  it('shows the empty message instead of a table', () => {
    const table = makeTable();
    const empty = mount(DataTable, {
      props: {
        columns: COLUMNS,
        rows: [],
        selectedIds: [],
        sortKey: 'coin',
        sortDirection: 'asc',
        exchange: 'bybit',
        viewKey: '1m',
        emptyText: 'No rows match filters.',
      },
    });
    expect(table.find('table').exists()).toBe(true);
    expect(empty.find('table').exists()).toBe(false);
    expect(empty.find('.inventory-empty').text()).toBe('No rows match filters.');
  });
});
