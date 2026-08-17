import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLegacyResults } from './useLegacyResults';
import { useViewState } from './useViewState';
import type { ResultsStore } from './useResults';
import type { BacktestResultItem, BeSeries } from '../types';

/*
 * The legacy panel store — loadLegacyResults (:9034-9039),
 * renderLegacyResults' filters (:9427-9460), the path-keyed selection
 * (:5932-5986, :6049-6061), deleteSelectedLegacyResults (:6364-6380),
 * rebacktestSelectedLegacy (:8169-8252 — the queue posts live in
 * useRebacktest) and compareSelectedLegacy (:7829-7862 — plain-path
 * labels, no PB version prefix).
 */

const fetchMock = vi.fn();
const notify = vi.fn();
const wsRefresh = vi.fn();
const selectPanel = vi.fn();

let nowPanel = 'legacy';
const stores: Array<{ dispose(): void }> = [];

function ok(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const emptyBe: BeSeries = { time: [], balance: [], equity: [], balance_btc: [], equity_btc: [] };

function fakeResults(): ResultsStore {
  return {
    version: 'v7',
    results: { value: [] },
    dataApi: {
      beForCompare: vi.fn(async (path: string, result: BacktestResultItem) => ({
        path,
        version: result.backtest_version || 'v7',
        be: { ...emptyBe, time: ['t'], equity: [1], balance: [1] },
      })),
    },
  } as unknown as ResultsStore;
}

function view() {
  return useViewState({
    version: 'v7',
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage,
    history: { replaceState: () => {} },
    initial: { panel: 'legacy', sorts: { configs: { col: 'modified', asc: false }, results: { col: 'modified', asc: false }, archive: { col: 'adg', asc: false }, legacy: { col: 'adg', asc: false } } },
  });
}

function store(overrides?: Partial<Parameters<typeof useLegacyResults>[0]>) {
  const created = useLegacyResults({
    apiBase: 'http://h:8000/api/backtest-v7',
    version: 'v7',
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    notify,
    getCurrentPanel: () => nowPanel,
    view: view(),
    results: fakeResults(),
    wsRefresh,
    selectPanel,
    fetchFn: fetchMock as unknown as typeof fetch,
    initialSort: { col: 'adg', asc: false },
    ...overrides,
  });
  stores.push(created);
  return created;
}

const legacyRow = (path: string, overrides: Partial<BacktestResultItem> = {}): BacktestResultItem => ({
  path,
  config_name: 'old',
  result_name: 'res',
  backtest_version: 'v7',
  adg: 2,
  suggested_name: 'legacy_old',
  ...overrides,
} as BacktestResultItem);

beforeEach(() => {
  nowPanel = 'legacy';
  fetchMock.mockReset().mockImplementation(() => ok({ results: [{ path: 'pb7/backtests/o/r1', config_name: 'o', result_name: 'r1' }] }));
  notify.mockClear();
  wsRefresh.mockClear();
  selectPanel.mockClear();
});

afterEach(() => {
  while (stores.length > 0) stores.pop()?.dispose();
});

describe('loadLegacyResults (:9034-9039)', () => {
  it('loads rows tagged v7 and renders only on the legacy panel', async () => {
    fetchMock.mockImplementationOnce(() => ok({ results: [{ path: 'pb7/backtests/o/r1', config_name: 'o', result_name: 'r1' }] }));
    const s = store();
    await s.loadLegacyResults();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://h:8000/api/backtest-v7/legacy/results');
    expect(s.rows.value[0]).toMatchObject({ path: 'pb7/backtests/o/r1', backtest_version: 'v7' });
  });

  it('toasts only when the legacy panel is active', async () => {
    fetchMock.mockImplementation(() => ok({ detail: 'nope' }, 500));
    nowPanel = 'results';
    const s = store();
    await s.loadLegacyResults();
    expect(notify).not.toHaveBeenCalled();
    nowPanel = 'legacy';
    await s.loadLegacyResults();
    expect(notify).toHaveBeenCalledWith('v7backtest.loadFailed:{"msg":"nope"}', 'err');
  });

  it('loadIfEmpty only fetches while empty (:1456)', async () => {
    const s = store();
    await s.loadIfEmpty();
    await s.loadIfEmpty();
    expect(fetchMock).toHaveBeenCalledTimes(1); // the loaded rows gate the second call
  });
});

describe('filters + sort (:9427-9460)', () => {
  it('filters by config + text and sorts by the persisted spec', () => {
    const s = store();
    s.rows.value = [
      legacyRow('p1', { config_name: 'a', adg: 1, display_name: 'pb7/a/x/r1' }),
      legacyRow('p2', { config_name: 'b', adg: 3 }),
      legacyRow('p3', { config_name: 'a', adg: 2, result_name: 'needle' }),
    ];
    s.configFilter.value = 'a';
    s.textFilter.value = '';
    expect(s.visible.value.map((r) => r.path)).toEqual(['p3', 'p1']); // adg desc
    s.configFilter.value = '';
    s.textFilter.value = 'needle';
    expect(s.visible.value.map((r) => r.path)).toEqual(['p3']);
    s.textFilter.value = 'pb7/a';
    expect(s.visible.value.map((r) => r.path)).toEqual(['p1']);
  });

  it('setSortColumn starts descending on a new column and toggles in place (:5481-5485)', () => {
    const s = store();
    s.setSortColumn('gain');
    expect(s.sort.value).toEqual({ col: 'gain', asc: false });
    s.setSortColumn('gain');
    expect(s.sort.value).toEqual({ col: 'gain', asc: true });
  });
});

describe('selection (:6049-6061)', () => {
  it('getSelected follows the sorted visible rows', () => {
    const s = store();
    s.rows.value = [legacyRow('p1', { adg: 1 }), legacyRow('p2', { adg: 5 })];
    s.selectedPaths.value = new Set(['p1', 'p2']);
    expect(s.getSelected()).toEqual(['p2', 'p1']);
    s.toggleSelected('p1');
    expect(s.getSelected()).toEqual(['p2']);
  });
});

describe('deleteSelectedLegacyResults (:6364-6380)', () => {
  it('deletes per path, toasts and reloads', async () => {
    fetchMock.mockImplementation(() => ok({}));
    const s = store();
    s.rows.value = [legacyRow('p1')];
    s.selectedPaths.value = new Set(['p1']);
    await s.deleteSelected();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://h:8000/api/backtest-v7/legacy/results?path=p1');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');
    expect(notify).toHaveBeenCalledWith('v7backtest.deleted', 'ok');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/legacy/results') && (c[1] as RequestInit).method !== 'DELETE')).toBe(true);
  });

  it('nothing selected toasts', async () => {
    const s = store();
    await s.deleteSelected();
    expect(notify).toHaveBeenCalledWith('v7backtest.nothingSelected', 'err');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces HTTP errors instead of toasting success (legacy :6371 apiFetch throws)', async () => {
    fetchMock.mockImplementation(() => ok({ detail: 'denied' }, 500));
    const s = store();
    s.rows.value = [legacyRow('p1')];
    s.selectedPaths.value = new Set(['p1']);
    await s.deleteSelected();
    expect(notify).toHaveBeenCalledWith('v7backtest.deleteFailed:{"msg":"denied"}', 'err');
    expect(notify).not.toHaveBeenCalledWith('v7backtest.deleted', 'ok');
    expect(fetchMock).toHaveBeenCalledTimes(1); // no reload after the failure
  });
});

describe('rebacktestSelectedLegacy single-open (:8173-8181)', () => {
  it('loads the config and opens the editor with the suggested name', async () => {
    fetchMock.mockImplementationOnce(() => ok({ bot: 1 }));
    const openEditor = vi.fn();
    const s = store({ openEditor });
    s.rows.value = [legacyRow('p1', { suggested_name: 'renamed' })];
    s.selectedPaths.value = new Set(['p1']);
    await s.startRebacktest(openEditor, () => selectPanel('configs'));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://h:8000/api/backtest-v7/results/config?path=p1');
    expect(selectPanel).toHaveBeenCalledWith('configs');
    expect(openEditor).toHaveBeenCalledWith('renamed', { bot: 1 });
  });

  it('gates on selection', async () => {
    const s = store();
    await s.startRebacktest(vi.fn(), selectPanel);
    expect(notify).toHaveBeenCalledWith('v7backtest.nothingSelected', 'err');
  });

  it('seeds the multi-backtest pbgui-data toggle from settings (:8207, :1478-1480)', async () => {
    fetchMock.mockImplementationOnce(() => ok({ backtest: { exchanges: ['bybit'], starting_balance: 900 } }));
    const s = store({ getSettings: () => ({ use_pbgui_market_data: 'True' }) });
    s.rows.value = [legacyRow('p1'), legacyRow('p2')];
    s.selectedPaths.value = new Set(['p1', 'p2']);
    await s.startRebacktest(vi.fn(), selectPanel);
    expect(s.rebacktestOpen.value).toBe(true);
    expect(s.rebacktestDefaults.value).toMatchObject({ usePbguiData: true, balance: 900 });
  });
});

describe('compareSelectedLegacy (:7829-7862)', () => {
  it('toggle-hides an open compare, then plots plain-path labels (no PB prefix)', async () => {
    const results = fakeResults();
    const s = store({ results });
    s.selectedPaths.value = new Set(['p1']);
    s.compareOpen.value = true;
    s.compareTraces.value = [{}] as never;
    await s.compareSelected();
    expect(s.compareOpen.value).toBe(false);
    expect(s.compareTraces.value).toEqual([]);

    s.rows.value = [legacyRow('pb7/a/r1'), legacyRow('pb7/b/r2')];
    s.selectedPaths.value = new Set(['pb7/a/r1', 'pb7/b/r2']);
    await s.compareSelected();
    expect(s.compareOpen.value).toBe(true);
    expect(results.dataApi.beForCompare).toHaveBeenCalledWith('pb7/a/r1', expect.objectContaining({ path: 'pb7/a/r1' }));
    const trace = (s.compareTraces.value as Array<{ name: string }>)[0];
    expect(trace?.name).toBe('eq pb7/a/r1');
    expect(trace?.name).not.toContain('PBV7');
  });

  it('requires two selected results', async () => {
    const s = store();
    s.selectedPaths.value = new Set(['p1']);
    await s.compareSelected();
    expect(notify).toHaveBeenCalledWith('v7backtest.selectAtLeast2Results', 'err');
  });
});
