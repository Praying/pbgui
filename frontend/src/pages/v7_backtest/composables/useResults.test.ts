import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResults } from './useResults';
import type { BacktestResultItem } from '../types';

/*
 * The results store — the port of loadResults + the empty-retry ladder
 * (:5357-5416), the version/config/text filters (:5579-5610), the
 * path-keyed selection that survives filter changes and reloads, the
 * per-result chart action toggles (:6426-6429) and viewConfigResults
 * (:4983-5006).
 */

const fetchMock = vi.fn();
let nowPanel = 'results';
const notify = vi.fn();
const selectResults = vi.fn();
const stores: Array<{ dispose(): void }> = [];

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function store(overrides?: Partial<Parameters<typeof useResults>[0]>) {
  const created = useResults({
    apiBase: 'http://h:8000/api/backtest-v7',
    version: 'v7',
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    notify,
    getCurrentPanel: () => nowPanel,
    onSelectResultsPanel: selectResults,
    fetchFn: fetchMock as unknown as typeof fetch,
    ...overrides,
  });
  stores.push(created);
  return created;
}

/** Server rows arrive WITHOUT the version tag — loadResults adds it (:5390). */
function resultPayload(paths: string[]): { results: Array<Omit<BacktestResultItem, 'backtest_version'>> } {
  return { results: paths.map((path, i) => ({ path, config_name: 'c' + i, result_name: 'r' + i, modified: `2024-01-0${i + 1}T00:00:00Z` })) };
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset().mockImplementation(() => ok(resultPayload([])));
  nowPanel = 'results';
  notify.mockClear();
  selectResults.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  while (stores.length > 0) stores.pop()?.dispose();
});

describe('loadResults (:5375-5416)', () => {
  it('fetches the flavor base, tags rows with the version and applies them', async () => {
    fetchMock.mockImplementationOnce(() => ok(resultPayload(['backtests/c1/x/r1'])));
    const s = store();
    const promise = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await promise;
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://h:8000/api/backtest-v7/results');
    expect(s.results.value).toHaveLength(1);
    expect(s.results.value[0]).toMatchObject({ path: 'backtests/c1/x/r1', backtest_version: 'v7' });
    expect(s.checking.value).toBe(false);
  });

  it("'both' fans out to both flavor bases and concatenates v7 before v8 (:5386-5392)", async () => {
    fetchMock.mockImplementation((url: unknown) =>
      ok(resultPayload([String(url).includes('backtest-v8') ? 'v8path' : 'v7path']))
    );
    const s = store();
    s.versionFilter.value = 'both';
    const promise = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await promise;
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(expect.arrayContaining(['http://h:8000/api/backtest-v7/results', 'http://h:8000/api/backtest-v8/results']));
    expect(s.results.value.map((r) => r.backtest_version)).toEqual(['v7', 'v8']);
  });

  it('a v8 result keeps its own version tag through the v7 base (:5390)', async () => {
    fetchMock.mockImplementationOnce(() =>
      ok({ results: [{ path: 'p', config_name: 'c', result_name: 'r', backtest_version: 'v8' }] })
    );
    const s = store();
    const promise = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await promise;
    expect(s.results.value[0]?.backtest_version).toBe('v8');
  });

  it('rejects a stale generation: the newer load wins (:5394, :5413)', async () => {
    let resolveFirst: (value: Response) => void = () => undefined;
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => ok(resultPayload(['fresh'])));
    const s = store();
    const first = s.loadResults();
    const second = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await second;
    resolveFirst(new Response(JSON.stringify(resultPayload(['stale']))));
    await vi.advanceTimersByTimeAsync(0);
    await first.catch(() => undefined);
    expect(s.results.value.map((r) => r.path)).toEqual(['fresh']);
  });

  it('a failed load toasts and rejects (:5412-5416)', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ detail: 'boom' }), { status: 500 })));
    const s = store();
    await expect(s.loadResults()).rejects.toBeInstanceOf(Error);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(String(notify.mock.calls[0]?.[0])).toContain('v7backtest.loadResultsFailed');
  });
});

describe('empty retry ladder (:5397-5410)', () => {
  it('retries empty results while the results panel is open, 400ms × count, max 3', async () => {
    fetchMock.mockImplementation(() => ok(resultPayload([])));
    const s = store();
    void s.loadResults().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.checking.value).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(800);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(4); // capped at 3 retries
  });

  it('a retry that returns data clears the checking state (:5408-5409)', async () => {
    let empty = true;
    fetchMock.mockImplementation(() => ok(empty ? resultPayload([]) : resultPayload(['got-one'])));
    const s = store();
    void s.loadResults().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(400); // retry 1 fired (delay 400ms)
    empty = false;
    await vi.advanceTimersByTimeAsync(800); // retry 2's delay doubles to 800ms
    expect(s.results.value.map((r) => r.path)).toEqual(['got-one']);
    expect(s.checking.value).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry while a different panel is open (:5397)', async () => {
    fetchMock.mockImplementation(() => ok(resultPayload([])));
    nowPanel = 'configs';
    const s = store();
    void s.loadResults().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(s.checking.value).toBe(false);
  });

  it('a manual (non-retry) load resets the retry counter (:5379)', async () => {
    let empty = true;
    fetchMock.mockImplementation(() => ok(empty ? resultPayload([]) : resultPayload(['x'])));
    const s = store();
    void s.loadResults().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(400); // retry 1 fired
    empty = false;
    void s.loadResults().catch(() => undefined); // manual reload mid-ladder
    await vi.advanceTimersByTimeAsync(0);
    expect(s.results.value.map((r) => r.path)).toEqual(['x']);
    expect(s.checking.value).toBe(false);
  });
});

describe('filters + config names (:5357-5373, :5579-5610)', () => {
  it('configNames lists the version-filtered configs sorted', async () => {
    fetchMock.mockImplementationOnce(() =>
      ok({
        results: [
          { path: 'a', config_name: 'zeta', result_name: 'r', modified: '2024-01-01T00:00:00Z' },
          { path: 'b', config_name: 'alpha', result_name: 'r', modified: '2024-01-02T00:00:00Z' },
        ],
      })
    );
    const s = store();
    const p = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(s.configNames.value).toEqual(['alpha', 'zeta']);
  });

  it('a stale config filter resets to all after a reload that drops it (:5361-5368)', async () => {
    fetchMock.mockImplementationOnce(() => ok(resultPayload(['a', 'b'])));
    const s = store();
    const p1 = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await p1;
    s.configFilter.value = 'c0';
    fetchMock.mockImplementationOnce(() => ok(resultPayload(['a'])));
    const p2 = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await p2;
    expect(s.configFilter.value).toBe('');
  });

  it('visible applies version + config + text filters and the persisted sort', async () => {
    fetchMock.mockImplementationOnce(() =>
      ok({
        results: [
          { path: 'v7a', config_name: 'alpha', result_name: 'r1', modified: '2024-01-01T00:00:00Z' },
          { path: 'v7b', config_name: 'beta', result_name: 'r2', modified: '2024-01-02T00:00:00Z' },
          { path: 'v8a', config_name: 'alpha', result_name: 'r3', modified: '2024-01-03T00:00:00Z', backtest_version: 'v8' },
        ],
      })
    );
    const s = store();
    s.versionFilter.value = 'both'; // direct set — no reload, just the view
    const p = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    // default sort: modified descending (setResSort :5451)
    expect(s.visible.value.map((r) => r.path)).toEqual(['v8a', 'v7b', 'v7a']);
    s.textFilter.value = 'r2';
    expect(s.visible.value.map((r) => r.path)).toEqual(['v7b']);
    s.textFilter.value = '';
    s.configFilter.value = 'alpha';
    expect(s.visible.value.map((r) => r.path)).toEqual(['v8a', 'v7a']);
    s.versionFilter.value = 'v7';
    expect(s.visible.value.map((r) => r.path)).toEqual(['v7a']);
  });
});

describe('sort toggle (:5452-5457)', () => {
  it('toggles in place and starts a new column descending', async () => {
    fetchMock.mockImplementationOnce(() =>
      ok({
        results: [
          { path: 'a', config_name: 'b', result_name: 'r', modified: '2024-01-01T00:00:00Z' },
          { path: 'c', config_name: 'a', result_name: 'r', modified: '2024-01-02T00:00:00Z' },
        ],
      })
    );
    const s = store();
    const p = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    s.setSortColumn('config_name'); // new column → descending
    expect(s.sort.value).toEqual({ col: 'config_name', asc: false });
    expect(s.visible.value.map((r) => r.path)).toEqual(['a', 'c']);
    s.setSortColumn('config_name'); // same column → toggle to ascending
    expect(s.sort.value).toEqual({ col: 'config_name', asc: true });
    expect(s.visible.value.map((r) => r.path)).toEqual(['c', 'a']);
  });
});

describe('selection (:5999-6019)', () => {
  async function loadedStore(): Promise<ReturnType<typeof store>> {
    fetchMock.mockImplementationOnce(() => ok(resultPayload(['a', 'b', 'c'])));
    const s = store();
    const p = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    return s;
  }

  it('persists selection across filter changes (path-keyed, not row-keyed)', async () => {
    const s = await loadedStore();
    s.toggleSelected('a');
    s.textFilter.value = 'r1'; // hides rows b and c
    expect(s.selectedPaths.value.has('a')).toBe(true);
    s.textFilter.value = '';
    expect(s.getSelected()).toEqual(['a']);
  });

  it('prunes selection to paths still present after a reload', async () => {
    const s = await loadedStore();
    s.setSelected(['a', 'b']);
    fetchMock.mockImplementationOnce(() => ok(resultPayload(['b', 'c'])));
    const p = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(s.getSelected()).toEqual(['b']);
  });

  it('select-all only selects the given (visible) paths; deselect clears', async () => {
    const s = await loadedStore();
    s.textFilter.value = 'r1';
    s.selectAll(s.visible.value.map((r) => r.path));
    expect(s.getSelected()).toEqual(['b']);
    s.deselectAll();
    expect(s.getSelected()).toEqual([]);
  });
});

describe('per-result chart actions (:6426-6429, :6576-6596)', () => {
  it('toggles view/analysis/config/plot/fills per result path', async () => {
    fetchMock.mockImplementationOnce(() => ok(resultPayload(['a'])));
    const s = store();
    const p = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(s.activeResults.value).toHaveLength(0);
    s.toggleAction('a', 'view');
    expect(s.activeResults.value.map((entry) => entry.result.path)).toEqual(['a']);
    expect([...s.activeResults.value[0]!.actions]).toEqual(['view']);
    s.toggleAction('a', 'analysis');
    expect([...s.activeResults.value[0]!.actions]).toEqual(['view', 'analysis']);
    s.toggleAction('a', 'view'); // off
    expect([...s.activeResults.value[0]!.actions]).toEqual(['analysis']);
    s.toggleAction('a', 'analysis');
    expect(s.activeResults.value).toHaveLength(0);
  });

  it('clearActionsForPaths drops open sections for deleted rows (:8526)', async () => {
    fetchMock.mockImplementationOnce(() => ok(resultPayload(['a', 'b'])));
    const s = store();
    const p = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    s.toggleAction('a', 'view');
    s.toggleAction('b', 'plot');
    s.clearActionsForPaths(['a']);
    expect(s.activeResults.value.map((entry) => entry.result.path)).toEqual(['b']);
  });
});

describe('viewConfigResults (:4983-5006)', () => {
  it('with cached results: applies the filter immediately and selects the results panel', async () => {
    fetchMock.mockImplementationOnce(() => ok(resultPayload(['a', 'b'])));
    const s = store();
    const p = s.loadResults();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    s.textFilter.value = 'junk';
    s.viewConfigResults('c0');
    expect(s.configFilter.value).toBe('c0');
    expect(s.textFilter.value).toBe('');
    expect(selectResults).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no reload
  });

  it('with no cache: defers the filter to the auto load (:4984-4990)', async () => {
    const s = store();
    fetchMock.mockImplementationOnce(() => ok({ results: [{ path: 'x', config_name: 'c9', result_name: 'r', modified: '2024-01-01T00:00:00Z' }] }));
    s.viewConfigResults('c9');
    expect(selectResults).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    // the pending filter was consumed as the load's selectedFilter (:5377)
    expect(s.configFilter.value).toBe('c9');
    expect(s.visible.value.map((r) => r.path)).toEqual(['x']);
  });
});

describe('dispose', () => {
  it('cancels a pending retry timer', async () => {
    fetchMock.mockImplementation(() => ok(resultPayload([])));
    const s = store();
    void s.loadResults().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    s.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
