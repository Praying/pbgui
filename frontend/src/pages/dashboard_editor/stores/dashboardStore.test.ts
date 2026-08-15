import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetDashboardStore,
  useDashboardStore,
  type StoreFetchFn,
} from './dashboardStore';

/* Port of the legacy editor state + sync layer (dashboard_editor.html:512-626):
   the flat `_<row>_<col>` state map, clearCell/scheduleSync/doSync,
   markViewDirty/saveViewLayout, and the mutation surface used by the grid. */

function parentMock(): { postMessage: ReturnType<typeof vi.fn> } {
  return { postMessage: vi.fn() };
}

interface TestEnv {
  fetchFn: ReturnType<typeof vi.fn<StoreFetchFn>>;
  parent: { postMessage: ReturnType<typeof vi.fn> };
}

function setup(overrides: { viewOnly?: boolean; apiBase?: string } = {}): TestEnv {
  const fetchFn = vi.fn<StoreFetchFn>();
  const parent = parentMock();
  const store = useDashboardStore({
    apiBase: overrides.apiBase ?? '/api',
    origName: 'MyDash',
    viewOnly: overrides.viewOnly ?? false,
    standalone: false,
    fetchFn,
    parentWindow: () => parent as unknown as Window,
  });
  return { fetchFn, parent };
}

beforeEach(() => {
  resetDashboardStore();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('initial state (editor:512)', () => {
  it('starts with name/rows/cols defaults', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: 'MyDash' });
    expect(store.state.name).toBe('MyDash');
    expect(store.rows).toBe(1);
    expect(store.cols).toBe(1);
    expect(store.cellType(1, 1)).toBe('NONE');
  });

  it('reports empty-cell values for an untouched grid', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    expect(store.cellHeight(1, 1)).toBeNull();
    expect(store.hasStoredHeight(1, 1)).toBe(false);
    expect(store.isAutoHeight(1, 1)).toBe(false);
    expect(store.epochOf(1, 1)).toBe(0);
  });
});

describe('loadConfig (editor:2679-2694)', () => {
  it('applies a persisted config verbatim and clamps rows/cols', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: 'MyDash' });
    store.loadConfig({
      name: 'Saved',
      rows: 12,
      cols: 3,
      dashboard_type_1_1: 'PNL',
      dashboard_pnl_mode_1_1: 'bar',
    });
    expect(store.rows).toBe(10);
    expect(store.cols).toBe(2);
    expect(store.cellType(1, 1)).toBe('PNL');
    expect(store.state['dashboard_pnl_mode_1_1']).toBe('bar');
    expect(store.state.name).toBe('Saved');
  });

  it('falls back to origName when the config has no name (editor:2684)', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: 'MyDash' });
    store.loadConfig({ rows: 2, cols: 1 });
    expect(store.state.name).toBe('MyDash');
  });

  it('parses junk rows/cols with parseInt-||-1 (editor:2682-2683)', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ rows: 'abc', cols: '5x' });
    expect(store.rows).toBe(1);
    expect(store.cols).toBe(2); // parseInt('5x') = 5 → clamped to 2
  });

  it('resets to a fresh 1×1 grid for an empty config', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: 'MyDash' });
    store.loadConfig({});
    expect(store.rows).toBe(1);
    expect(store.cols).toBe(1);
    expect(store.state.name).toBe('MyDash');
  });

  it('replaces the previous state entirely', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ dashboard_type_1_1: 'PNL' });
    store.loadConfig({ dashboard_type_2_1: 'ADG' });
    expect(store.state['dashboard_type_1_1']).toBeUndefined();
    expect(store.cellType(2, 1)).toBe('ADG');
  });

  it('keeps junk persisted type values un-normalized (R11)', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ dashboard_type_1_1: 'BOGUS' });
    expect(store.cellType(1, 1)).toBe('BOGUS');
  });

  it('bumps cell epochs so mounted widgets remount on config load', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ rows: 2, cols: 2 });
    expect(store.epochOf(2, 2)).toBe(1);
  });
});

describe('assignCellType — palette drop (editor:2269-2279)', () => {
  it('writes the persisted type key and schedules a sync (unconditional)', () => {
    const { fetchFn } = setup();
    const store = useDashboardStore();
    store.assignCellType(1, 2, 'TOP');
    expect(store.cellType(1, 2)).toBe('TOP');
    expect(store.state['dashboard_type_1_2']).toBe('TOP');

    vi.advanceTimersByTime(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('overwrites an existing cell type (legacy palette drop replaces)', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.assignCellType(1, 1, 'PNL');
    store.assignCellType(1, 1, 'ORDERS');
    expect(store.cellType(1, 1)).toBe('ORDERS');
  });

  it('bumps the cell epoch for widget remount', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.assignCellType(1, 1, 'PNL');
    expect(store.epochOf(1, 1)).toBe(1);
    store.assignCellType(1, 1, 'TOP');
    expect(store.epochOf(1, 1)).toBe(2);
  });
});

describe('clearCell (editor:585-593 + _makeDeleteCb 1021-1024)', () => {
  it('removes every config key of the cell and keeps the type key as NONE', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({
      rows: 2,
      cols: 2,
      dashboard_type_1_1: 'PNL',
      dashboard_pnl_mode_1_1: 'line',
      dashboard_pnl_users_1_1: ['u1'],
      dashboard_height_1_1: 300,
      dashboard_type_1_2: 'TOP',
    });
    store.clearCell(1, 1);
    expect(store.cellType(1, 1)).toBe('NONE');
    expect(store.state['dashboard_pnl_mode_1_1']).toBeUndefined();
    expect(store.state['dashboard_pnl_users_1_1']).toBeUndefined();
    expect(store.state['dashboard_height_1_1']).toBeUndefined();
    expect(store.cellType(1, 2)).toBe('TOP'); // other cells untouched
  });

  it('schedules a sync in edit mode and bumps the epoch', () => {
    const { fetchFn } = setup();
    const store = useDashboardStore();
    store.assignCellType(1, 1, 'PNL');
    const epoch = store.epochOf(1, 1);
    store.clearCell(1, 1);
    expect(store.epochOf(1, 1)).toBe(epoch + 1);
    vi.advanceTimersByTime(400);
    expect(fetchFn).toHaveBeenCalled();
  });

  it('marks the view dirty instead of syncing in view mode', () => {
    /* legacy never calls clearCell in view mode (onDelete is null there) —
       the dirty-vs-sync branch is ported for symmetry with swapCells */
    const { fetchFn, parent } = setup({ viewOnly: true });
    const store = useDashboardStore();
    store.loadConfig({ dashboard_type_1_1: 'PNL', dashboard_pnl_mode_1_1: 'bar' });
    store.clearCell(1, 1);
    vi.advanceTimersByTime(1000);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'pbgui_view_dirty' }, '*');
  });
});

describe('swapCells (editor:2181-2209)', () => {
  it('swaps every key pair that belongs to either cell (union of bases)', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({
      rows: 1,
      cols: 2,
      dashboard_type_1_1: 'PNL',
      dashboard_pnl_mode_1_1: 'bar',
      dashboard_type_1_2: 'TOP',
      dashboard_top_symbols_top_1_2: 5,
    });
    store.swapCells(1, 1, 1, 2);
    expect(store.cellType(1, 1)).toBe('TOP');
    expect(store.cellType(1, 2)).toBe('PNL');
    expect(store.state['dashboard_pnl_mode_1_1']).toBeUndefined();
    expect(store.state['dashboard_pnl_mode_1_2']).toBe('bar');
    expect(store.state['dashboard_top_symbols_top_1_1']).toBe(5);
    expect(store.state['dashboard_top_symbols_top_1_2']).toBeUndefined();
  });

  it('keeps name/rows/cols untouched', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: 'MyDash' });
    store.loadConfig({ rows: 2, cols: 2, dashboard_type_1_1: 'PNL', dashboard_type_1_2: 'TOP' });
    store.swapCells(1, 1, 1, 2);
    expect(store.state.name).toBe('MyDash');
    expect(store.rows).toBe(2);
    expect(store.cols).toBe(2);
  });

  it('schedules a sync in edit mode and bumps both epochs', () => {
    const { fetchFn } = setup();
    const store = useDashboardStore();
    store.loadConfig({ dashboard_type_1_1: 'PNL', dashboard_type_1_2: 'TOP' });
    const e1 = store.epochOf(1, 1);
    const e2 = store.epochOf(1, 2);
    store.swapCells(1, 1, 1, 2);
    expect(store.epochOf(1, 1)).toBe(e1 + 1);
    expect(store.epochOf(1, 2)).toBe(e2 + 1);
    vi.advanceTimersByTime(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('marks the view dirty instead of syncing in view mode (editor:2204-2208)', () => {
    const { fetchFn, parent } = setup({ viewOnly: true });
    const store = useDashboardStore();
    store.loadConfig({ dashboard_type_1_1: 'PNL', dashboard_type_1_2: 'TOP' });
    store.swapCells(1, 1, 1, 2);
    vi.advanceTimersByTime(1000);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'pbgui_view_dirty' }, '*');
  });
});

describe('setLayout (editor:2534-2541)', () => {
  it('clamps rows to 1..10 and cols to 1..2', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.setLayout(0, 0);
    expect(store.rows).toBe(1);
    expect(store.cols).toBe(1);
    store.setLayout(11, 3);
    expect(store.rows).toBe(10);
    expect(store.cols).toBe(2);
  });

  it('always schedules a sync — even in view mode (legacy parity)', () => {
    const { fetchFn } = setup({ viewOnly: true });
    const store = useDashboardStore();
    store.setLayout(2, 2);
    vi.advanceTimersByTime(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('preserves out-of-range cell keys when shrinking (legacy quirk)', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ rows: 2, cols: 1, dashboard_type_2_1: 'PNL' });
    store.setLayout(1, 1);
    expect(store.rows).toBe(1);
    expect(store.state['dashboard_type_2_1']).toBe('PNL'); // still persisted
    store.setLayout(2, 1); // grow back → config reappears
    expect(store.cellType(2, 1)).toBe('PNL');
  });

  it('bumps every in-bounds cell epoch (grid rebuild parity)', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.setLayout(2, 2);
    expect(store.epochOf(1, 1)).toBe(1);
    expect(store.epochOf(1, 2)).toBe(1);
    expect(store.epochOf(2, 2)).toBe(1);
  });
});

describe('setName (editor:2518-2523)', () => {
  it('trims the name and schedules a sync', () => {
    const { fetchFn } = setup();
    const store = useDashboardStore();
    store.setName('  Fresh  ');
    expect(store.state.name).toBe('Fresh');
    vi.advanceTimersByTime(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('cell height persistence (editor:2373-2505)', () => {
  it('setCellHeight writes the persisted height key and clears auto-height', () => {
    const { fetchFn } = setup();
    const store = useDashboardStore();
    store.resetCellHeight(1, 1); // dblclick first
    expect(store.isAutoHeight(1, 1)).toBe(true);
    store.setCellHeight(1, 1, 480);
    expect(store.state['dashboard_height_1_1']).toBe(480);
    expect(store.cellHeight(1, 1)).toBe(480);
    expect(store.hasStoredHeight(1, 1)).toBe(true);
    expect(store.isAutoHeight(1, 1)).toBe(false);
    vi.advanceTimersByTime(400);
    expect(fetchFn).toHaveBeenCalledTimes(1); // debounced into one POST
  });

  it('resetCellHeight deletes the key and adds auto-height', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.setCellHeight(1, 1, 480);
    store.resetCellHeight(1, 1);
    expect(store.state['dashboard_height_1_1']).toBeUndefined();
    expect(store.cellHeight(1, 1)).toBeNull();
    expect(store.isAutoHeight(1, 1)).toBe(true);
  });

  it('marks the view dirty instead of syncing in view mode', () => {
    const { fetchFn, parent } = setup({ viewOnly: true });
    const store = useDashboardStore();
    store.setCellHeight(1, 1, 500);
    store.resetCellHeight(1, 1);
    vi.advanceTimersByTime(1000);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'pbgui_view_dirty' }, '*');
  });
});

describe('scheduleSync / doSync (editor:595-610)', () => {
  it('debounces mutations into one POST after 400 ms', () => {
    const { fetchFn } = setup();
    const store = useDashboardStore();
    store.assignCellType(1, 1, 'PNL');
    store.setCellHeight(1, 1, 300);
    store.assignCellType(1, 2, 'TOP');
    expect(fetchFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('POSTs the whole flat map (name/rows/cols included) to pending_full with the ORIGINAL name', () => {
    const { fetchFn } = setup();
    const store = useDashboardStore();
    store.assignCellType(1, 2, 'TOP');
    store.setName('Renamed');
    vi.advanceTimersByTime(400);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/dashboard/pending_full?name=MyDash'); // ORIG_NAME, not state.name
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body['dashboard_type_1_2']).toBe('TOP');
    expect(body.name).toBe('Renamed');
    expect(body.rows).toBe(1);
    expect(body.cols).toBe(1);
  });

  it('reports saved on ok, error on !ok, offline on throw', async () => {
    const env = setup();
    const store = useDashboardStore();

    env.fetchFn.mockResolvedValueOnce({ ok: true });
    store.scheduleSync();
    vi.advanceTimersByTime(400);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.syncStatus).toBe('saved');

    env.fetchFn.mockResolvedValueOnce({ ok: false });
    store.scheduleSync();
    vi.advanceTimersByTime(400);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.syncStatus).toBe('error');

    env.fetchFn.mockRejectedValueOnce(new Error('net down'));
    store.scheduleSync();
    vi.advanceTimersByTime(400);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.syncStatus).toBe('offline');
  });

  it('sets the status to saving immediately when doSync runs', () => {
    const { fetchFn } = setup();
    const store = useDashboardStore();
    let resolve: (v: { ok: boolean }) => void = () => {};
    fetchFn.mockImplementationOnce(
      () => new Promise((r) => { resolve = r; })
    );
    store.scheduleSync();
    vi.advanceTimersByTime(400);
    expect(store.syncStatus).toBe('saving');
    resolve({ ok: true });
  });
});

describe('markViewDirty (editor:612-615)', () => {
  it('is a no-op in edit mode', () => {
    const { parent } = setup();
    const store = useDashboardStore();
    store.markViewDirty();
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it('posts pbgui_view_dirty to the parent in view mode', () => {
    const { parent } = setup({ viewOnly: true });
    const store = useDashboardStore();
    store.markViewDirty();
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'pbgui_view_dirty' }, '*');
  });

  it('swallows parent postMessage failures', () => {
    const env = setup({ viewOnly: true });
    env.parent.postMessage.mockImplementation(() => {
      throw new Error('cross-origin');
    });
    const store = useDashboardStore();
    expect(() => store.markViewDirty()).not.toThrow();
  });
});

describe('saveViewLayout (editor:617-626)', () => {
  it('POSTs the whole map to /dashboards/<origName> and posts pbgui_view_saved', async () => {
    const { fetchFn, parent } = setup({ viewOnly: true });
    fetchFn.mockResolvedValueOnce({ ok: true });
    const store = useDashboardStore();
    store.loadConfig({ dashboard_type_1_1: 'PNL', dashboard_height_1_1: 420 });
    await store.saveViewLayout();

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/dashboards/MyDash');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body['dashboard_height_1_1']).toBe(420);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'pbgui_view_saved' }, '*');
  });

  it('stays dirty on failure — no message posted', async () => {
    const { fetchFn, parent } = setup({ viewOnly: true });
    fetchFn.mockRejectedValueOnce(new Error('boom'));
    const store = useDashboardStore();
    await store.saveViewLayout();
    expect(parent.postMessage).not.toHaveBeenCalled();
  });
});

describe('serialize', () => {
  it('returns a copy of the whole flat state', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.loadConfig({ dashboard_type_1_1: 'PNL' });
    const snap = store.serialize();
    expect(snap['dashboard_type_1_1']).toBe('PNL');
    snap['dashboard_type_1_1'] = 'HACK';
    expect(store.cellType(1, 1)).toBe('PNL');
  });
});

describe('singleton behavior', () => {
  it('returns the same store instance across callers', () => {
    const a = useDashboardStore({ apiBase: '/api', origName: 'A' });
    const b = useDashboardStore();
    expect(a).toBe(b);
  });

  it('resetDashboardStore detaches the previous instance', () => {
    const a = useDashboardStore({ apiBase: '/api', origName: 'A' });
    resetDashboardStore();
    const b = useDashboardStore({ apiBase: '/api', origName: 'B' });
    expect(a).not.toBe(b);
  });
});
