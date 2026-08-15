import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import IncomeTable from './IncomeTable.vue';
import { resetIncomeScroll } from '../../lib/incomeLogic';
import type { IncomeRow } from '../../types/widgets';

/* IncomeTable — the port of _buildIncomeTable (dashboard_render.js:1030-1470):
 * sortable columns, row drag-select range (5px threshold), jump-to-date with
 * the 600 ms debounced onJumpToDate branch, delete-selected/delete-older with
 * the confirm overlay, the backup/restore panel, status messages and the
 * buildIncome scroll-position preserve (render.js:894-898, 1022-1026). */

enableAutoUnmount(afterEach);

vi.useFakeTimers();

const ROWS: IncomeRow[] = [
  { id: 3, date_ms: 1706230000000, date: '2024-01-26 00:46:40', symbol: 'BTC', income: 12.345, user: 'alice' },
  { id: 1, date_ms: 1706200000000, date: '2024-01-25 16:26:40', symbol: 'ETH', income: -4, user: 'bob' },
  { id: 2, date_ms: 1706210000000, date: '2024-01-25 19:13:20', symbol: 'SOL', income: 7.5, user: 'alice' },
];

/** Visual tops for the row elements, keyed by data-income-id (render order). */
const TOPS: Record<string, number> = { '3': 100, '1': 120, '2': 140 };

const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
  this: Element
) {
  const id = this.getAttribute('data-income-id');
  const top = id !== null && id in TOPS ? TOPS[id]! : 0;
  return { top, bottom: top, left: 0, right: 100, width: 100, height: 20, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
});

let fetchMock: ReturnType<typeof vi.fn>;

interface MountOptions {
  rows?: IncomeRow[];
  users?: string[] | null;
  onJumpToDate?: ((date: string) => void) | null;
  onReload?: () => void;
}

function mountTable(options: MountOptions = {}): VueWrapper {
  return mount(IncomeTable, {
    props: {
      rows: options.rows ?? ROWS,
      users: options.users ?? ['ALL'],
      apiBase: '/api',
      pos: '1_1',
      onJumpToDate: options.onJumpToDate ?? null,
      onReload: options.onReload ?? vi.fn(),
    },
    attachTo: document.body,
  });
}

function row(wrapper: VueWrapper, id: number) {
  return wrapper.get(`tbody tr[data-income-id="${id}"]`);
}

function docMouseMove(clientY: number): MouseEvent {
  const ev = new MouseEvent('mousemove', { clientY, cancelable: true });
  document.dispatchEvent(ev);
  return ev;
}

function docMouseUp(): void {
  document.dispatchEvent(new MouseEvent('mouseup'));
}

/** mousedown+mouseup on a row without moving — the legacy toggle path. */
async function clickRow(wrapper: VueWrapper, id: number): Promise<void> {
  await row(wrapper, id).trigger('mousedown', { button: 0, clientY: TOPS[String(id)]! });
  docMouseUp();
  await flushPromises();
}

beforeEach(() => {
  rectSpy.mockClear();
  resetIncomeScroll();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: 2 }) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetIncomeScroll();
});

describe('IncomeTable rendering (render.js:1054-1167)', () => {
  it('renders the 4 sortable columns with the jump input in the Date header', () => {
    const wrapper = mountTable();
    const ths = wrapper.findAll('thead th');
    expect(ths.map((th) => th.text())).toEqual(['Date ▼', 'User', 'Symbol', 'Income']);
    expect(ths[0]!.find('input.di-jump-input').exists()).toBe(true);
    expect(ths[0]!.find('input.di-jump-input').attributes('type')).toBe('date');
  });

  it('renders rows in SERVER order initially (doSort only runs on header click)', () => {
    const wrapper = mountTable();
    expect(wrapper.findAll('tbody tr').map((tr) => tr.attributes('data-income-id'))).toEqual(['3', '1', '2']);
  });

  it('shows the ▼ arrow on Date before the first sort (legacy initial sortCol/sortAsc)', () => {
    const wrapper = mountTable();
    /* element.textContent — the raw " ▼" incl. leading space (test-utils text() trims).
       Every sortable column gets the span; only the text is conditional (render.js:1119-1121). */
    expect(wrapper.get('thead th .di-sort').element.textContent).toBe(' ▼');
    expect(wrapper.findAll('thead th')[1]!.get('.di-sort').element.textContent).toBe('');
  });

  it('formats income with toFixed(2) and the pos/neg classes (render.js:1159-1161)', () => {
    const wrapper = mountTable();
    const tds = row(wrapper, 3).findAll('td');
    expect(tds.map((td) => td.text())).toEqual([
      '2024-01-26 00:46:40',
      'alice',
      'BTC',
      '12.35',
    ]);
    expect(tds[3]!.classes()).toContain('di-inc-pos');
    expect(row(wrapper, 1).findAll('td')[3]!.classes()).toContain('di-inc-neg');
  });

  it('renders only the no-data div for empty rows (render.js:1032-1038 early return)', () => {
    const wrapper = mountTable({ rows: [] });
    expect(wrapper.get('.dt-nodata').text()).toBe('No data for the selected period.');
    expect(wrapper.find('.di-table-wrap').exists()).toBe(false);
    expect(wrapper.find('.di-actions').exists()).toBe(false);
  });

  it('gives rows tabindex and aria-selected (render.js:1142-1145)', () => {
    const wrapper = mountTable();
    const tr = row(wrapper, 3);
    expect(tr.attributes('tabindex')).toBe('0');
    expect(tr.attributes('aria-selected')).toBe('false');
  });
});

describe('IncomeTable selection (render.js:1173-1233, 1250-1268)', () => {
  it('toggles a row on mousedown+mouseup without movement', async () => {
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    expect(row(wrapper, 3).classes()).toContain('di-sel');
    expect(row(wrapper, 3).attributes('aria-selected')).toBe('true');
    await clickRow(wrapper, 3);
    expect(row(wrapper, 3).classes()).not.toContain('di-sel');
  });

  it('ignores non-left buttons and clicks outside tbody rows', async () => {
    const wrapper = mountTable();
    await row(wrapper, 3).trigger('mousedown', { button: 2 });
    expect(row(wrapper, 3).classes()).not.toContain('di-sel');
    await wrapper.get('thead th').trigger('mousedown', { button: 0 });
    docMouseUp();
    await flushPromises();
    expect(wrapper.findAll('tbody tr.di-sel')).toHaveLength(0);
  });

  it('drag-selects the range between anchor and pointer once moved >5px (add mode)', async () => {
    const wrapper = mountTable();
    await row(wrapper, 2).trigger('mousedown', { button: 0, clientY: 140 });
    /* ≤5px moves must NOT start the rubber band */
    docMouseMove(144);
    expect(wrapper.findAll('tbody tr.di-sel')).toHaveLength(0);
    docMouseMove(100);
    docMouseUp();
    await flushPromises();
    expect(wrapper.findAll('tbody tr.di-sel')).toHaveLength(3);
  });

  it('de-selects the range when the drag starts on a selected row (remove mode)', async () => {
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    await clickRow(wrapper, 1);
    expect(wrapper.findAll('tbody tr.di-sel')).toHaveLength(2);
    await row(wrapper, 3).trigger('mousedown', { button: 0, clientY: 100 });
    docMouseMove(120);
    docMouseUp();
    await flushPromises();
    expect(row(wrapper, 3).classes()).not.toContain('di-sel');
    expect(row(wrapper, 1).classes()).not.toContain('di-sel');
    expect(row(wrapper, 2).classes()).not.toContain('di-sel');
  });

  it('keeps unselected rows outside the range untouched', async () => {
    const wrapper = mountTable();
    await row(wrapper, 3).trigger('mousedown', { button: 0, clientY: 100 });
    docMouseMove(120); /* rows 3 and 1 */
    docMouseUp();
    await flushPromises();
    expect(row(wrapper, 3).classes()).toContain('di-sel');
    expect(row(wrapper, 1).classes()).toContain('di-sel');
    expect(row(wrapper, 2).classes()).not.toContain('di-sel');
  });

  it('toggles rows with Enter and Space (render.js:1262-1268)', async () => {
    const wrapper = mountTable();
    await row(wrapper, 1).trigger('keydown', { key: 'Enter' });
    expect(row(wrapper, 1).classes()).toContain('di-sel');
    await row(wrapper, 1).trigger('keydown', { key: ' ' });
    expect(row(wrapper, 1).classes()).not.toContain('di-sel');
    await row(wrapper, 1).trigger('keydown', { key: 'a' });
    expect(row(wrapper, 1).classes()).not.toContain('di-sel');
  });

  it('removes the document drag listeners on unmount (R4 leak fix)', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const wrapper = mountTable();
    await row(wrapper, 3).trigger('mousedown', { button: 0, clientY: 100 });
    removeSpy.mockClear();
    wrapper.unmount();
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    removeSpy.mockRestore();
  });
});

describe('IncomeTable sorting (render.js:1124-1131, 1235-1243)', () => {
  it('first click on a new column sorts ascending', async () => {
    const wrapper = mountTable();
    await wrapper.findAll('thead th')[1]!.trigger('click'); /* User: alice, alice, bob */
    expect(wrapper.findAll('tbody tr').map((tr) => tr.attributes('data-income-id'))).toEqual(['3', '2', '1']);
    expect(wrapper.findAll('thead th')[1]!.get('.di-sort').text()).toBe('▲');
  });

  it('clicking the same column flips the direction', async () => {
    const wrapper = mountTable();
    await wrapper.findAll('thead th')[1]!.trigger('click');
    await wrapper.findAll('thead th')[1]!.trigger('click');
    expect(wrapper.findAll('tbody tr').map((tr) => tr.attributes('data-income-id'))).toEqual(['1', '3', '2']);
    expect(wrapper.findAll('thead th')[1]!.get('.di-sort').text()).toBe('▼');
  });

  it('clicking Date first flips the initial false to ascending (server order is desc)', async () => {
    const wrapper = mountTable();
    await wrapper.findAll('thead th')[0]!.trigger('click');
    expect(wrapper.findAll('tbody tr').map((tr) => tr.attributes('data-income-id'))).toEqual(['1', '2', '3']);
  });
});

describe('IncomeTable action bar (render.js:1271-1349, 1343-1349 updateActions)', () => {
  it('is hidden without a selection and appears once rows are selected', async () => {
    const wrapper = mountTable();
    expect(wrapper.find('.di-actions').isVisible()).toBe(false);
    await clickRow(wrapper, 3);
    expect(wrapper.find('.di-actions').isVisible()).toBe(true);
    expect(wrapper.findAll('.di-actions .di-btn').map((b) => b.text())).toEqual([
      'Delete selected…',
      'Delete older than selected…',
      'Backup / Restore…',
    ]);
  });
});

describe('IncomeTable jump-to-date (render.js:1071-1115)', () => {
  it('scrolls the wrap to the exact matching row (top - wrapTop - theadH)', async () => {
    const wrapper = mountTable();
    await wrapper.get('input.di-jump-input').setValue('2024-01-25');
    /* first row whose date matches the day is row 1 (top 120) */
    expect(wrapper.get('.di-table-wrap').element.scrollTop).toBe(120);
  });

  it('debounces onJumpToDate at 600ms when no row matches (render.js:1097-1105)', async () => {
    const onJumpToDate = vi.fn();
    const wrapper = mountTable({ onJumpToDate });
    await wrapper.get('input.di-jump-input').setValue('2020-05-05');
    expect(onJumpToDate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(599);
    expect(onJumpToDate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onJumpToDate).toHaveBeenCalledWith('2020-05-05');
  });

  it('skips the debounced call when the input changed again meanwhile', async () => {
    const onJumpToDate = vi.fn();
    const wrapper = mountTable({ onJumpToDate });
    const input = wrapper.get('input.di-jump-input');
    await input.setValue('2020-05-05');
    await input.setValue('2020-06-06');
    vi.advanceTimersByTime(700);
    expect(onJumpToDate).toHaveBeenCalledTimes(1);
    expect(onJumpToDate).toHaveBeenCalledWith('2020-06-06');
  });

  it('falls back to the closest row scroll without onJumpToDate (render.js:1106-1113)', async () => {
    const wrapper = mountTable({ onJumpToDate: null });
    await wrapper.get('input.di-jump-input').setValue('2023-06-01');
    /* closest is row 1 (2024-01-25 16:53) at top 120 */
    expect(wrapper.get('.di-table-wrap').element.scrollTop).toBe(120);
  });
});

describe('IncomeTable delete flows (render.js:1275-1311, 1351-1401)', () => {
  it('deletes the selected ids after confirmation and reloads after 500ms', async () => {
    const onReload = vi.fn();
    const wrapper = mountTable({ onReload });
    await clickRow(wrapper, 3);
    await clickRow(wrapper, 2);
    await wrapper.findAll('.di-actions .di-btn')[0]!.trigger('click');
    expect(wrapper.get('.di-confirm-msg').text()).toBe('⚠️ Delete 2 selected income row(s)?');
    expect(fetchMock).not.toHaveBeenCalled();
    await wrapper.get('.di-btn-yes').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/income/delete_ids',
      expect.objectContaining({ body: JSON.stringify({ ids: [2, 3] }) }) /* JS integer keys iterate ascending — legacy Object.keys(selected) too */
    );
    expect(wrapper.get('.di-status').isVisible()).toBe(true);
    expect(wrapper.get('.di-status').text()).toBe('Deleted 2 row(s). Backup created.');
    expect(wrapper.findAll('tbody tr.di-sel')).toHaveLength(0);
    expect(onReload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('aborts on the No button', async () => {
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    await wrapper.findAll('.di-actions .di-btn')[0]!.trigger('click');
    await wrapper.get('.di-btn-no').trigger('click');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('.di-confirm').isVisible()).toBe(false);
  });

  it('deletes older rows with cutoff_ms and the ALL users collapse', async () => {
    const wrapper = mountTable({ users: ['ALL'] });
    await clickRow(wrapper, 1);
    await clickRow(wrapper, 2);
    await wrapper.findAll('.di-actions .di-btn')[1]!.trigger('click');
    expect(wrapper.get('.di-confirm-msg').text()).toBe(
      '⚠️ Delete all income for ALL users with timestamp ≤ 2024-01-25 16:26:40?'
    );
    await wrapper.get('.di-btn-yes').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/income/delete_older',
      expect.objectContaining({ body: JSON.stringify({ users: ['ALL'], cutoff_ms: 1706200000000 }) })
    );
  });

  it('passes the selected-row users (first-seen in row order) when the widget users are not ALL', async () => {
    const wrapper = mountTable({ users: ['alice', 'bob'] });
    await clickRow(wrapper, 1); /* bob */
    await clickRow(wrapper, 3); /* alice */
    await wrapper.findAll('.di-actions .di-btn')[1]!.trigger('click');
    /* scan order follows the row list [3,1] → alice first (render.js:1293) */
    expect(wrapper.get('.di-confirm-msg').text()).toBe(
      '⚠️ Delete all income for alice, bob with timestamp ≤ 2024-01-25 16:26:40?'
    );
    await wrapper.get('.di-btn-yes').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/income/delete_older',
      expect.objectContaining({ body: JSON.stringify({ users: ['alice', 'bob'], cutoff_ms: 1706200000000 }) })
    );
  });

  it('shows the error status when the delete fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    await wrapper.findAll('.di-actions .di-btn')[0]!.trigger('click');
    await wrapper.get('.di-btn-yes').trigger('click');
    await flushPromises();
    expect(wrapper.get('.di-status').text()).toBe('Error: boom');
  });

  it('hides the status line again after 4s (render.js:1378-1382)', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    await wrapper.findAll('.di-actions .di-btn')[0]!.trigger('click');
    await wrapper.get('.di-btn-yes').trigger('click');
    await flushPromises();
    expect(wrapper.get('.di-status').isVisible()).toBe(true);
    vi.advanceTimersByTime(4000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.di-status').isVisible()).toBe(false);
  });
});

describe('IncomeTable backup/restore panel (render.js:1314-1321, 1403-1469)', () => {
  it('loads and renders the backup picker, then restores after confirmation', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        backups: [
          { name: 'pbgui-a.db', path: '/db/pbgui-a.db', date: '2024-01-01 10:00:00' },
          { name: 'pbgui-b.db', path: '/db/pbgui-b.db', date: '2024-01-02 11:00:00' },
        ],
      }),
    });
    const onReload = vi.fn();
    const wrapper = mountTable({ onReload });
    await clickRow(wrapper, 3);
    await wrapper.get('.di-actions .di-btn:nth-of-type(3)').trigger('click');
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/income/backups');
    await flushPromises();
    const options = wrapper.findAll('.di-backup option');
    expect(options.map((o) => o.text())).toEqual([
      'pbgui-a.db — 2024-01-01 10:00:00',
      'pbgui-b.db — 2024-01-02 11:00:00',
    ]);
    await wrapper.get('.di-backup select').setValue('/db/pbgui-b.db');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await wrapper.get('.di-backup .di-btn:nth-of-type(1)').trigger('click');
    expect(wrapper.get('.di-confirm-msg').text()).toBe(
      '⚠️ Restore database from pbgui-b.db — 2024-01-02 11:00:00?'
    );
    await wrapper.get('.di-btn-yes').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/income/restore',
      expect.objectContaining({ body: JSON.stringify({ path: '/db/pbgui-b.db' }) })
    );
    expect(wrapper.get('.di-status').text()).toBe('Database restored successfully.');
    expect(wrapper.find('.di-backup').isVisible()).toBe(false);
    vi.advanceTimersByTime(500);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('shows the no-backups label for an empty list', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ backups: [] }) });
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    await wrapper.get('.di-actions .di-btn:nth-of-type(3)').trigger('click');
    await flushPromises();
    expect(wrapper.get('.di-backup').text()).toContain('No backups available.');
  });

  it('shows the fixed loading label while fetching', async () => {
    let resolveJson: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveJson = (v: unknown) => resolve({ ok: true, status: 200, json: async () => v });
      })
    );
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    await wrapper.get('.di-actions .di-btn:nth-of-type(3)').trigger('click');
    await flushPromises();
    expect(wrapper.get('.di-backup').text()).toContain('Loading backups…');
    resolveJson?.({ backups: [] });
    await flushPromises();
    expect(wrapper.get('.di-backup').text()).toContain('No backups available.');
  });

  it('shows the error label without a message when listing fails', async () => {
    fetchMock.mockRejectedValue(new Error('net'));
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    await wrapper.get('.di-actions .di-btn:nth-of-type(3)').trigger('click');
    await flushPromises();
    expect(wrapper.get('.di-backup').text()).toContain('Error loading backups');
  });

  it('shows Restore failed. when the server reports ok:false', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ backups: [{ name: 'a', path: '/a', date: 'd' }] }) });
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    await wrapper.get('.di-actions .di-btn:nth-of-type(3)').trigger('click');
    await flushPromises();
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: false }) });
    await wrapper.get('.di-backup .di-btn:nth-of-type(1)').trigger('click');
    await wrapper.get('.di-btn-yes').trigger('click');
    await flushPromises();
    expect(wrapper.get('.di-status').text()).toBe('Restore failed.');
  });

  it('closes the panel with the ✕ button and when the selection empties', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ backups: [{ name: 'a', path: '/a', date: 'd' }] }) });
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    await wrapper.get('.di-actions .di-btn:nth-of-type(3)').trigger('click');
    await flushPromises();
    expect(wrapper.get('.di-backup').isVisible()).toBe(true);
    await wrapper.get('.di-backup .di-btn:nth-of-type(2)').trigger('click');
    expect(wrapper.find('.di-backup').isVisible()).toBe(false);
    /* reopening then clearing the selection also hides it (updateActions) */
    await wrapper.get('.di-actions .di-btn:nth-of-type(3)').trigger('click');
    await flushPromises();
    await clickRow(wrapper, 3);
    expect(wrapper.find('.di-backup').isVisible()).toBe(false);
  });
});

describe('IncomeTable data-refresh resets (legacy full-rebuild semantics)', () => {
  it('clears selection and sort state when the rows prop is replaced', async () => {
    const wrapper = mountTable();
    await clickRow(wrapper, 3);
    await wrapper.findAll('thead th')[1]!.trigger('click'); /* user asc: 1,3,2 */
    const NEXT: IncomeRow[] = [
      { id: 9, date_ms: 1706300000000, date: '2024-01-26 18:46:40', symbol: 'XRP', income: 1, user: 'zoe' },
    ];
    await wrapper.setProps({ rows: NEXT });
    expect(wrapper.findAll('tbody tr.di-sel')).toHaveLength(0);
    expect(wrapper.find('.di-actions').isVisible()).toBe(false);
    /* unsorted again: raw server order of the new payload */
    expect(wrapper.findAll('tbody tr').map((tr) => tr.attributes('data-income-id'))).toEqual(['9']);
  });

  it('preserves the table scroll across a rows replacement (render.js:894-898, 1022-1026)', async () => {
    const wrapper = mountTable();
    const wrap = wrapper.get('.di-table-wrap').element;
    wrap.scrollTop = 250;
    await wrapper.setProps({ rows: [...ROWS] });
    await flushPromises();
    expect(wrap.scrollTop).toBe(250);
  });

  it('restores the scroll position across a remount of the same cell (epoch rebuild)', async () => {
    const first = mountTable();
    first.get('.di-table-wrap').element.scrollTop = 180;
    first.unmount();
    const second = mountTable();
    expect(second.get('.di-table-wrap').element.scrollTop).toBe(180);
  });
});
