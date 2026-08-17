import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArchive } from './useArchive';
import { useViewState } from './useViewState';
import type { ResultsStore } from './useResults';
import type { BacktestResultItem, BeSeries } from '../types';

/*
 * The archive store — loadArchives/renderArchiveList (:8825-8888),
 * viewArchive/closeArchiveResults (:8890-8948), the inotify refresh
 * debounce (:8840-8862, WS :1308-1317), mode gating (:8999-9011),
 * schedules actions (:9202-9226), optimize-config import family
 * (:9269-9421), the retest-replace flow (:8044-8161), the archive
 * rebacktest flow (:7970-8042) and compareSelectedArchive (:7793-7827).
 */

const fetchMock = vi.fn();
const notify = vi.fn();
const wsRefresh = vi.fn();
const confirmMock = vi.fn(async () => true);
const chooseMock = vi.fn(async (): Promise<string | null> => 'copy');

let nowPanel = 'archive';
const stores: Array<{ dispose(): void }> = [];

function ok(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function fail(detail: string | Record<string, unknown>, status = 500): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify({ detail }), { status }));
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
    history: { replaceState: vi.fn() },
    initial: { panel: 'configs', sorts: { configs: { col: 'modified', asc: false }, results: { col: 'modified', asc: false }, archive: { col: 'adg', asc: false }, legacy: { col: 'adg', asc: false } } },
  });
}

function store(overrides?: Partial<Parameters<typeof useArchive>[0]>) {
  const created = useArchive({
    archiveBase: 'http://h:8000/api/backtest-v7',
    version: 'v7',
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    notify,
    getCurrentPanel: () => nowPanel,
    view: view(),
    results: fakeResults(),
    wsRefresh,
    getSettings: () => ({ use_pbgui_market_data: false }),
    getPbguiDataPath: async () => '/data/ohlcv',
    fetchFn: fetchMock as unknown as typeof fetch,
    timers: { setTimeout, clearTimeout },
    confirm: confirmMock,
    choose: chooseMock,
    ...overrides,
  });
  stores.push(created);
  return created;
}

const archiveRow = (path: string, overrides: Partial<BacktestResultItem> = {}): BacktestResultItem => ({
  path,
  config_name: 'cfg',
  result_name: 'res',
  backtest_version: 'v7',
  adg: 1,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  nowPanel = 'archive';
  fetchMock.mockReset().mockImplementation(() => ok({}));
  notify.mockClear();
  wsRefresh.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  while (stores.length > 0) stores.pop()?.dispose();
});

describe('loadArchives (:8825-8836)', () => {
  it('loads the list and resolves the own archive name', async () => {
    fetchMock.mockImplementationOnce(() =>
      ok({ archives: [{ name: 'remote', is_own: false, results: 2, optimize_configs: 1 }, { name: 'mine', is_own: true }] })
    );
    const s = store();
    await s.loadArchives();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://h:8000/api/backtest-v7/archives');
    expect(s.archives.value.map((a) => a.name)).toEqual(['remote', 'mine']);
    expect(s.ownArchiveName.value).toBe('mine');
  });

  it('keeps the previous own name when none is flagged', async () => {
    fetchMock.mockImplementationOnce(() => ok({ archives: [{ name: 'mine', is_own: true }] }));
    const s = store();
    await s.loadArchives();
    fetchMock.mockImplementationOnce(() => ok({ archives: [{ name: 'remote' }] }));
    await s.loadArchives();
    expect(s.ownArchiveName.value).toBe('mine');
  });

  it('toasts on failure', async () => {
    fetchMock.mockImplementationOnce(() => fail('boom'));
    const s = store();
    await s.loadArchives();
    expect(notify).toHaveBeenCalledWith('v7backtest.loadArchivesFailed:{"msg":"boom"}', 'err');
  });

  it('loadIfEmpty only fetches while the list is empty (:1455)', async () => {
    const s = store();
    await s.loadIfEmpty();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    s.archives.value = [{ name: 'x' }];
    await s.loadIfEmpty();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('viewArchive (:8890-8920)', () => {
  it('fetches results + optimize configs + schedules and applies the selection state', async () => {
    fetchMock.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.endsWith('/results')) return ok({ results: [archiveRow('/archives/mine/r1'), archiveRow('/archives/mine/r2')], migration_status: { label: 'layout-v2' } });
      if (u.endsWith('/optimize-configs')) return ok({ configs: [{ path: 'o1', name: 'opt' }] });
      if (u.endsWith('/retest-schedules')) return ok({ schedules: [{ id: 's1' }], runs: [{ id: 'run1' }] });
      return ok({});
    });
    const s = store();
    await s.viewArchive('mine');
    expect(s.results.value).toHaveLength(2);
    expect(s.optimizeConfigs.value).toHaveLength(1);
    expect(s.schedules.value).toHaveLength(1);
    expect(s.runs.value).toHaveLength(1);
    expect(s.migrationStatus.value).toEqual({ label: 'layout-v2' });
    expect(s.selectedName.value).toBe('mine');
  });

  it('viewArchive failure degrades optional endpoints and toasts only on the live panel', async () => {
    fetchMock.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.endsWith('/results')) return fail('nope');
      return Promise.reject(new Error('unreachable'));
    });
    const s = store();
    await s.viewArchive('mine');
    expect(s.optimizeConfigs.value).toEqual([]);
    expect(notify).toHaveBeenCalledWith('v7backtest.loadFailed:{"msg":"nope"}', 'err');
  });

  it('silent mode never toasts (:8919)', async () => {
    fetchMock.mockImplementation(() => fail('nope'));
    const s = store();
    await s.viewArchive('mine', { silent: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('closeArchive resets the selection state and mode (:8922-8948)', async () => {
    const s = store();
    s.setMode('optimize');
    s.closeArchive();
    expect(s.selectedName.value).toBe('');
    expect(s.mode.value).toBe('backtests');
    expect(s.optimizeConfigs.value).toEqual([]);
    expect(s.schedules.value).toEqual([]);
    expect(s.runs.value).toEqual([]);
    expect(s.migrationStatus.value).toBeNull();
    expect(s.selectedPaths.value.size).toBe(0);
    expect(s.actionsByPath.value).toEqual({});
    expect(s.compareOpen.value).toBe(false);
  });
});

describe('mode gating (:8999-9011, :9042)', () => {
  it('schedules mode is own-only and unknown modes fall back to backtests', async () => {
    const s = store();
    s.archives.value = [{ name: 'mine', is_own: false }];
    s.view.openArchive('mine');
    s.setMode('schedules');
    expect(s.mode.value).toBe('backtests');
    s.setMode('bogus' as 'schedules');
    expect(s.mode.value).toBe('backtests');
    s.setMode('optimize');
    expect(s.mode.value).toBe('optimize');
  });
});

describe('inotify refresh hooks (:8840-8862, :1308-1317)', () => {
  it('debounces a silent archive-results refresh by 750ms on the archive panel', async () => {
    fetchMock.mockImplementation((url: unknown) => (String(url).endsWith('/results') ? ok({ results: [archiveRow('/archives/mine/r1')] }) : ok({})));
    const s = store();
    await s.viewArchive('mine');
    fetchMock.mockClear();
    s.onArchiveUpdate('archive');
    s.onArchiveUpdate('archive');
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/archives/mine/results'))).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(700);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/archives/mine/results'))).toHaveLength(1);
    // silent: no toast even if it fails
    expect(notify).not.toHaveBeenCalled();
  });

  it('refreshes the archive LIST when no archive is selected', async () => {
    const s = store();
    s.onArchiveUpdate('archive');
    await vi.advanceTimersByTimeAsync(800);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/archives'))).toBe(true);
  });

  it('clears the cached list when the update arrives on another panel (:1315)', async () => {
    const s = store();
    s.archives.value = [{ name: 'x' }];
    s.onArchiveUpdate('results');
    await vi.advanceTimersByTimeAsync(900);
    expect(s.archives.value).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('archive list actions', () => {
  it('deleteArchive deletes, closes an open selection and reloads (:9013-9027)', async () => {
    fetchMock.mockImplementation(() => ok({}));
    const s = store();
    await s.viewArchive('mine');
    fetchMock.mockClear();
    await s.deleteArchive('mine');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/archives/mine') && (c[1] as RequestInit).method === 'DELETE')).toBe(true);
    expect(s.selectedName.value).toBe('');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/archives'))).toBe(true);
  });

  it('addArchive posts the clone request (:9465-9483)', async () => {
    const s = store();
    await s.addArchive('repo', 'https://github.com/o/r');
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/archives') && (c[1] as RequestInit).method === 'POST');
    expect(call).toBeTruthy();
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ name: 'repo', url: 'https://github.com/o/r' });
  });
});

describe('archive result actions', () => {
  function loaded(overrides: Partial<BacktestResultItem> = {}) {
    return archiveRow('/archives/mine/r1', { config_name: 'cfg', ...overrides });
  }

  it('deleteSelected gates on own + selection and deletes per path (:6063-6081)', async () => {
    const s = store();
    s.archives.value = [{ name: 'other', is_own: false }];
    s.view.openArchive('other');
    s.selectedPaths.value = new Set(['/archives/other/r1']);
    await s.deleteSelected();
    expect(notify).toHaveBeenCalledWith('v7backtest.deleteOwnOnly', 'err');

    s.archives.value = [{ name: 'mine', is_own: true }];
    s.view.openArchive('mine');
    s.results.value = [archiveRow('/archives/mine/r1')];
    s.selectedPaths.value = new Set(['/archives/mine/r1']);
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => ok({}));
    await s.deleteSelected();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/archives/mine/results?path=') && (c[1] as RequestInit).method === 'DELETE')).toBe(true);
  });

  it('renameConfig posts the rename and reselects the renamed path (:6087-6123)', async () => {
    const s = store();
    s.archives.value = [{ name: 'mine', is_own: true }];
    await s.viewArchive('mine');
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => ok({}));
    await s.renameConfig('/archives/mine/r1', 'new-name');
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/results/rename-config'));
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ path: '/archives/mine/r1', new_name: 'new-name' });
    expect(s.selectedPaths.value.has('/archives/mine/r1')).toBe(true);
  });

  it('removeLiquidated previews dry-run then applies (:6124-6157)', async () => {
    const s = store();
    s.archives.value = [{ name: 'mine', is_own: true }];
    await s.viewArchive('mine');
    fetchMock.mockClear();
    fetchMock.mockImplementationOnce(() => ok({ items: [{ path: '/archives/mine/r1', reason: 'drawdown_worst>=0.95' }] }));
    const preview = await s.previewRemoveLiquidated(['/archives/mine/r1'], 'selected_results');
    expect(preview).toHaveLength(1);
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      paths: ['/archives/mine/r1'],
      scope: 'selected_results',
      dry_run: true,
    });
    fetchMock.mockImplementationOnce(() => ok({ removed: 1 }));
    await s.applyRemoveLiquidated(['/archives/mine/r1'], 'selected_results');
    expect(JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body)).dry_run).toBe(false);
    expect(notify).toHaveBeenCalledWith('v7backtest.removedLiquidated:{"n":1}', 'ok');
  });
});

describe('scores (:6196-6214)', () => {
  it('previewScores stores the payload; rebuild toasts and reloads', async () => {
    const s = store();
    s.archives.value = [{ name: 'mine', is_own: true }];
    await s.viewArchive('mine');
    fetchMock.mockClear();
    fetchMock.mockImplementationOnce(() => ok({ score_version: 'v2', scored: 5, total: 6, readme_markdown: '# hi' }));
    await s.previewScores();
    expect(s.scorePreview.value?.payload.scored).toBe(5);
    expect(s.scorePreview.value?.rebuilt).toBe(false);
    fetchMock.mockImplementation(() => ok({ scored: 6, total: 6 }));
    await s.rebuildScores();
    expect(s.scorePreview.value?.rebuilt).toBe(true);
    expect(notify).toHaveBeenCalledWith('v7backtest.updatedScores:{"n":6}', 'ok');
  });
});

describe('retest schedules (:9202-9226)', () => {
  it('run/toggle/delete operate on the schedule id and reload', async () => {
    const s = store();
    s.archives.value = [{ name: 'mine', is_own: true }];
    await s.viewArchive('mine');
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => ok({ queued: 2 }));
    await s.runSchedule('s1');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/retest-schedules/s1/run') && (c[1] as RequestInit).method === 'POST')).toBe(true);
    expect(wsRefresh).toHaveBeenCalled();
    await s.toggleSchedule('s1');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/retest-schedules/s1/toggle') && (c[1] as RequestInit).method === 'POST')).toBe(true);
    await s.deleteSchedule('s1');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/retest-schedules/s1') && (c[1] as RequestInit).method === 'DELETE')).toBe(true);
  });

  it('schedule actions gate on own (:9203)', async () => {
    const s = store();
    s.archives.value = [{ name: 'other', is_own: false }];
    s.view.openArchive('other');
    await s.runSchedule('s1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('v7backtest.scheduleOwnOnly', 'err');
  });
});

describe('archive rebacktest (:7970-8042)', () => {
  it('opens with defaults derived from the first config + pbgui path', async () => {
    fetchMock.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/results/config')) return ok({ backtest: { exchanges: ['bybit', 'okx'], start_date: '2023-01-01', end_date: '2023-02-01', starting_balance: 500, ohlcv_source_dir: '/data/ohlcv' } });
      return ok({});
    });
    const s = store();
    s.archives.value = [{ name: 'mine', is_own: true }];
    await s.viewArchive('mine');
    s.results.value = [archiveRow('/archives/mine/r1')];
    s.selectedPaths.value = new Set(['/archives/mine/r1']);
    fetchMock.mockClear();
    await s.startRebacktest();
    expect(s.rebacktestOpen.value).toBe(true);
    expect(s.rebacktestDefaults.value).toMatchObject({ start: '2023-01-01', end: '2023-02-01', balance: 500, exchanges: ['bybit', 'okx'], usePbguiData: true });
  });

  it('nothing selected toasts (:7972)', async () => {
    const s = store();
    await s.startRebacktest();
    expect(notify).toHaveBeenCalledWith('v7backtest.nothingSelected', 'err');
    expect(s.rebacktestOpen.value).toBe(false);
  });

  it('confirmRebacktest posts the server-side overrides payload (:8021-8037)', async () => {
    fetchMock.mockImplementation(() => ok({ queued: 3 }));
    const s = store();
    s.view.openArchive('mine');
    s.results.value = [archiveRow('/archives/mine/r1'), archiveRow('/archives/mine/r2')];
    s.selectedPaths.value = new Set(['/archives/mine/r1', '/archives/mine/r2']);
    await s.confirmRebacktest({ start: '2024-01-01', end: '2024-01-31', balance: 2000, exchanges: ['bybit'], usePbguiData: true });
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/results/rebacktest'));
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({
      paths: ['/archives/mine/r1', '/archives/mine/r2'],
      overrides: { start_date: '2024-01-01', end_date: '2024-01-31', starting_balance: 2000, exchanges: ['bybit'], use_pbgui_market_data: true },
    });
    expect(notify).toHaveBeenCalledWith('v7backtest.queuedBacktests:{"n":3}', 'ok');
    expect(wsRefresh).toHaveBeenCalled();
  });
});

describe('retest & replace (:8083-8161)', () => {
  it('gates on own + selection and derives the day default', async () => {
    fetchMock.mockImplementation((url: unknown) => (String(url).includes('/results/config') ? ok({ backtest: { start_date: '2024-01-01', end_date: '2024-01-10', exchanges: ['bybit'], starting_balance: 750 } }) : ok({})));
    const s = store();
    s.archives.value = [{ name: 'other', is_own: false }];
    s.view.openArchive('other');
    s.selectedPaths.value = new Set(['/archives/other/r1']);
    await s.startRetestReplace();
    expect(notify).toHaveBeenCalledWith('v7backtest.retestReplaceOwnOnly', 'err');

    s.archives.value = [{ name: 'mine', is_own: true }];
    s.view.openArchive('mine');
    s.results.value = [archiveRow('/archives/mine/r1')];
    s.selectedPaths.value = new Set(['/archives/mine/r1']);
    fetchMock.mockClear();
    await s.startRetestReplace();
    expect(s.retestOpen.value).toBe(true);
    expect(s.retestDefaults.value).toMatchObject({ days: 10, balance: 750, exchanges: ['bybit'], usePbguiData: false });
  });

  it('confirmRetestReplace posts the payload and reloads (:8126-8139)', async () => {
    fetchMock.mockImplementation(() => ok({ queued: 2 }));
    const s = store();
    s.view.openArchive('mine');
    s.results.value = [archiveRow('/archives/mine/r1')];
    s.selectedPaths.value = new Set(['/archives/mine/r1']);
    await s.confirmRetestReplace({ dateMode: 'last_x_days', lastDays: 30, balance: 1000, exchanges: ['bybit'], usePbguiMarketData: true, skipLiquidated: true });
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/results/retest-replace'));
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({
      paths: ['/archives/mine/r1'],
      date_mode: 'last_x_days',
      last_days: 30,
      starting_balance: 1000,
      exchanges: ['bybit'],
      use_pbgui_market_data: true,
      skip_liquidated: true,
    });
  });

  it('confirmRetestSchedule adds cadence/time/weekday and switches to schedules (:8140-8156)', async () => {
    fetchMock.mockImplementation(() => ok({}));
    const s = store();
    s.archives.value = [{ name: 'mine', is_own: true }];
    s.view.openArchive('mine');
    s.results.value = [archiveRow('/archives/mine/r1')];
    s.selectedPaths.value = new Set(['/archives/mine/r1']);
    await s.confirmRetestSchedule(
      { dateMode: 'until_yesterday', lastDays: 365, balance: 1000, exchanges: ['bybit'], usePbguiMarketData: false, skipLiquidated: true },
      { cadence: 'weekly', time: '03:30', weekday: 4 }
    );
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/retest-schedules') && (c[1] as RequestInit).method === 'POST');
    const body = JSON.parse(String((call![1] as RequestInit).body));
    expect(body.cadence).toBe('weekly');
    expect(body.time).toBe('03:30');
    expect(body.weekday).toBe(4);
    expect(s.mode.value).toBe('schedules');
  });
});

describe('archive optimize-configs (:9269-9421)', () => {
  it('viewOptimizeConfig fetches the config JSON (:9269-9284)', async () => {
    fetchMock.mockImplementationOnce(() => ok({ bot: { long: {} } }));
    const s = store();
    s.view.openArchive('mine');
    await s.viewOptimizeConfig('p1', 'v7');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/archives/mine/optimize-configs/config?path=p1&version=v7');
    expect(s.optimizeConfigJson.value).toEqual({ bot: { long: {} } });
  });

  it('importOptimize retries through the collision chooser on 409 (:9327-9369)', async () => {
    fetchMock
      .mockImplementationOnce(() => fail({ code: 'optimize_config_exists', message: 'exists', suggested_copy_name: 'opt_copy' }, 409))
      .mockImplementationOnce(() => ok({}));
    const s = store();
    await s.importOptimizeConfig('p1', 'opt-name', 'v7');
    const bodies = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/optimize-configs/import')).map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    expect(bodies[0]).toMatchObject({ path: 'p1', name: 'opt-name', collision: 'error', optimize_version: 'v7' });
    expect(bodies[1]).toMatchObject({ collision: 'copy' });
    expect(chooseMock).toHaveBeenCalled();
  });

  it('import cancellation (null choice) stops quietly (:9364-9366)', async () => {
    chooseMock.mockImplementationOnce(async () => null);
    fetchMock.mockImplementationOnce(() => fail('exists', 409));
    const s = store();
    const result = await s.importOptimizeConfig('p1', 'opt-name', 'v7');
    expect(result).toBeNull();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/import'))).toHaveLength(1);
  });

  it('deleteOptimizeConfig deletes + reloads (:9407-9421)', async () => {
    fetchMock.mockImplementation(() => ok({}));
    const s = store();
    await s.deleteOptimizeConfig('p1', 'opt', 'v7');
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/optimize-configs/config?') && (c[1] as RequestInit).method === 'DELETE');
    expect(call?.[0]).toContain('path=p1');
  });

  it('optimizeFrom imports then navigates to the optimize editor (:9371-9385)', async () => {
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        set href(next: string) {
          hrefSetter(next);
        },
      },
    });
    fetchMock.mockImplementation(() => ok({ name: 'imported', optimize_version: 'v8' }));
    const s = store();
    await s.optimizeFromConfig('p1', 'opt', 'v8');
    expect(hrefSetter).toHaveBeenCalledWith('/api/optimize-v8/main_page?open_config=imported');
  });
});

describe('compareSelectedArchive (:7793-7827)', () => {
  it('requires two selected results', async () => {
    const s = store();
    s.selectedPaths.value = new Set(['/archives/mine/r1']);
    await s.compareSelected();
    expect(notify).toHaveBeenCalledWith('v7backtest.selectAtLeast2Results', 'err');
  });

  it('toggle-hides an open compare, then plots the versioned traces', async () => {
    const results = fakeResults();
    const s = store({ results });
    s.results.value = [archiveRow('/archives/mine/r1'), archiveRow('/archives/mine/r2')];
    s.selectedPaths.value = new Set(['/archives/mine/r1']);
    s.compareOpen.value = true;
    s.compareTraces.value = [{}] as never;
    await s.compareSelected();
    expect(s.compareOpen.value).toBe(false);
    expect(s.compareTraces.value).toEqual([]);

    s.selectedPaths.value = new Set(['/archives/mine/r1', '/archives/mine/r2']);
    await s.compareSelected();
    expect(s.compareOpen.value).toBe(true);
    expect(results.dataApi.beForCompare).toHaveBeenCalledWith('/archives/mine/r1', expect.objectContaining({ path: '/archives/mine/r1' }));
    const trace = (s.compareTraces.value as Array<{ name: string }>)[0];
    expect(trace?.name).toContain('PBV7 archives/mine/r1'); // slice(-3) drops the leading empty segment
  });
});
