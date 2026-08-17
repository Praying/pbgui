import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveQueueComparePaths } from './useCompare';
import { useResults } from './useResults';
import type { BacktestResultItem, QueueItem } from '../types';

/*
 * The compare flows — _resolveQueueComparePaths (:7646-7742),
 * compareSelected (:7778-7791) and compareSelectedQueue (:7744-7776):
 * queue entries map onto result groups per config, preferring the first
 * result modified at/after the queue item's created stamp.
 */

/* ── pure resolver ── */

function queueItem(partial: Partial<QueueItem> & { filename: string }): QueueItem {
  return { name: 'cfg', status: 'complete', created: '2024-01-10T00:00:00Z', ...partial };
}

function resultItem(partial: Partial<BacktestResultItem> & { path: string }): BacktestResultItem {
  return { config_name: 'cfg', result_name: 'res', backtest_version: 'v7', modified: '2024-01-12T00:00:00Z', ...partial };
}

describe('resolveQueueComparePaths (:7646-7742)', () => {
  it('maps each queue item to a distinct future result group and unions its paths in queue order', () => {
    const results = [
      resultItem({ path: 'p1', result_name: 'r1', modified: '2024-01-11T00:00:00Z' }),
      resultItem({ path: 'p1b', result_name: 'r1', modified: '2024-01-11T06:00:00Z' }),
      resultItem({ path: 'p2', result_name: 'r2', modified: '2024-01-12T00:00:00Z' }),
    ];
    const queue = [queueItem({ filename: 'f2', created: '2024-01-11T12:00:00Z' }), queueItem({ filename: 'f1', created: '2024-01-01T00:00:00Z' })];
    const matched = resolveQueueComparePaths(queue, results);
    // f2 (newer) takes r2 — the first group modified at/after its created
    // stamp; f1 falls back to r1 (nearest delta)
    expect(matched.paths).toEqual(['p2', 'p1', 'p1b']);
    expect(matched.unmatched).toEqual([]);
  });

  it('falls back to the closest modified group when nothing is in the future (:7707-7719)', () => {
    const results = [
      resultItem({ path: 'old1', result_name: 'r1', modified: '2024-01-02T00:00:00Z' }),
      resultItem({ path: 'old2', result_name: 'r2', modified: '2024-01-09T00:00:00Z' }),
    ];
    const queue = [queueItem({ filename: 'f1', created: '2024-01-10T00:00:00Z' })];
    expect(resolveQueueComparePaths(queue, results).paths).toEqual(['old2']);
  });

  it('reports queue items with no candidate groups as unmatched (:7720-7722)', () => {
    const queue = [queueItem({ filename: 'f1', name: 'other' })];
    const matched = resolveQueueComparePaths(queue, [resultItem({ path: 'p1' })]);
    expect(matched.paths).toEqual([]);
    expect(matched.unmatched.map((item) => item.filename)).toEqual(['f1']);
  });

  it('a used result group is never assigned twice (:7703, :7726)', () => {
    const results = [resultItem({ path: 'only', result_name: 'r1' })];
    const queue = [queueItem({ filename: 'f1' }), queueItem({ filename: 'f2' })];
    const matched = resolveQueueComparePaths(queue, results);
    expect(matched.paths).toEqual(['only']);
    expect(matched.unmatched.map((item) => item.filename)).toEqual(['f2']);
  });

  it('sorts queue groups by created (NaN last) and result groups by modified (:7672-7693)', () => {
    const results = [
      resultItem({ path: 'later', result_name: 'rl', modified: '2024-01-11T00:00:00Z' }),
      resultItem({ path: 'earlier', result_name: 're', modified: '2024-01-10T00:00:00Z' }),
    ];
    const queue = [queueItem({ filename: 'b', created: '2024-01-09T00:00:00Z' }), queueItem({ filename: 'a', created: '' })];
    // 'a' (no stamp) sorts last and only sees the leftover group
    const matched = resolveQueueComparePaths(queue, results);
    expect(matched.paths).toEqual(['earlier', 'later']);
    expect(matched.unmatched).toEqual([]);
  });

  it('skips result rows without path/config/result identity (:7654)', () => {
    const results = [resultItem({ path: '', result_name: '' }), resultItem({ path: 'ok' })];
    expect(resolveQueueComparePaths([queueItem({ filename: 'f' })], results).paths).toEqual(['ok']);
  });
});

/* ── flow composable (fetch-backed) ── */

const fetchMock = vi.fn();
const notify = vi.fn();
const selectResults = vi.fn();
const disposables: Array<() => void> = [];

function ok(body: unknown, init?: ResponseInit): Promise<Response> {
  return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), init));
}

beforeEach(() => {
  fetchMock.mockReset();
  notify.mockClear();
  selectResults.mockClear();
});

afterEach(() => {
  while (disposables.length > 0) disposables.pop()?.();
  vi.useRealTimers();
});

function t(key: string, params?: Record<string, unknown>): string {
  return params ? `${key} ${JSON.stringify(params)}` : key;
}

async function loadedResultsStore(panel = 'results'): Promise<ReturnType<typeof useResults>> {
  const results = useResults({
    apiBase: 'http://h:8000/api/backtest-v7',
    version: 'v7',
    t,
    notify,
    getCurrentPanel: () => panel,
    onSelectResultsPanel: () => selectResults(),
    fetchFn: fetchMock as unknown as typeof fetch,
  });
  disposables.push(() => results.dispose());
  fetchMock.mockImplementationOnce(() =>
    ok({ results: [{ path: 'p1', config_name: 'cfg', result_name: 'r1', modified: '2024-01-11T00:00:00Z' }] })
  );
  await results.loadResults();
  return results;
}

describe('compare flows (:7744-7791)', () => {
  it('compareSelectedQueue requires at least two selected queue rows (:7746)', async () => {
    const results = await loadedResultsStore();
    const { compareSelectedQueue } = await import('./useCompare');
    const compare = compareSelectedQueue({
      results,
      t,
      notify,
      selectPanel: () => selectResults(),
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    await compare(['f1'], [queueItem({ filename: 'f1' })]);
    expect(notify.mock.calls[0]?.[0]).toContain('v7backtest.selectAtLeast2Queue');
    expect(selectResults).not.toHaveBeenCalled();
  });

  it('requires at least two COMPLETED rows (:7751-7757)', async () => {
    const results = await loadedResultsStore();
    const { compareSelectedQueue } = await import('./useCompare');
    const compare = compareSelectedQueue({
      results,
      t,
      notify,
      selectPanel: () => selectResults(),
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    await compare(
      ['f1', 'f2'],
      [queueItem({ filename: 'f1', status: 'backtesting' }), queueItem({ filename: 'f2', status: 'complete' })]
    );
    expect(notify.mock.calls[0]?.[0]).toContain('v7backtest.selectAtLeast2CompletedQueue');
  });

  it('matches paths, clears filters, selects the rows and warns about skipped items (:7759-7774)', async () => {
    const results = await loadedResultsStore('queue');
    results.textFilter.value = 'junk';
    const queueItems: QueueItem[] = [
      queueItem({ filename: 'f1', created: '2024-01-01T00:00:00Z' }),
      queueItem({ filename: 'f2', created: '2024-01-02T00:00:00Z' }),
      queueItem({ filename: 'f3', name: 'other-config', created: '2024-01-03T00:00:00Z' }), // unmatched
    ];
    fetchMock
      .mockImplementationOnce(() =>
        ok({
          results: [
            { path: 'p1', config_name: 'cfg', result_name: 'r1', modified: '2024-01-11T00:00:00Z' },
            { path: 'p2', config_name: 'cfg', result_name: 'r2', modified: '2024-01-12T00:00:00Z' },
          ],
        })
      )
      .mockImplementation((url: unknown) => (String(url).includes('/results/equity') ? csvResponse() : ok({})));
    const { compareSelectedQueue } = await import('./useCompare');
    const compare = compareSelectedQueue({
      results,
      t,
      notify,
      selectPanel: () => selectResults(),
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    await compare(['f1', 'f2', 'f3'], queueItems);
    expect(results.textFilter.value).toBe('');
    // rows stay in table order (modified descending) — legacy reads the
    // DOM rows, which are the sorted ones
    expect(results.getSelected()).toEqual(['p2', 'p1']);
    expect(results.compareOpen.value).toBe(true);
    expect(selectResults).toHaveBeenCalled();
    expect(notify.mock.calls.some((call) => String(call[0]).includes('v7backtest.comparedSkipped'))).toBe(true);
  });

  it('bails when fewer than two paths match (:7761-7763)', async () => {
    const results = await loadedResultsStore('queue');
    const { compareSelectedQueue } = await import('./useCompare');
    fetchMock.mockImplementationOnce(() => ok({ results: [] }));
    const compare = compareSelectedQueue({
      results,
      t,
      notify,
      selectPanel: () => selectResults(),
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    await compare(
      ['f1', 'f2'],
      [queueItem({ filename: 'f1', name: 'x' }), queueItem({ filename: 'f2', name: 'y' })]
    );
    expect(notify.mock.calls.some((call) => String(call[0]).includes('v7backtest.couldNotMatchResults'))).toBe(true);
    expect(results.compareOpen.value).toBe(false);
  });
});

function csvResponse(): Promise<Response> {
  return Promise.resolve(
    new Response(
      ',usd_total_balance,usd_total_equity,btc_total_balance,btc_total_equity\n2024-01-01T00:00:00Z,100,101,0,0\n2024-01-02T00:00:00Z,110,109,0,0',
      { status: 200 }
    )
  );
}

describe('compareSelected (:7778-7791)', () => {
  it('requires at least two selected results', async () => {
    const results = await loadedResultsStore();
    const { compareSelected } = await import('./useCompare');
    const compare = compareSelected({ results, t, notify, selectPanel: () => selectResults(), fetchFn: fetchMock as unknown as typeof fetch });
    results.setSelected(['p1']);
    await compare();
    expect(notify.mock.calls[0]?.[0]).toContain('v7backtest.selectAtLeast2Results');
  });

  it('fetches equity CSVs per path and opens the compare plot (:7608-7643)', async () => {
    const results = await loadedResultsStore();
    fetchMock.mockImplementationOnce(() =>
      ok({
        results: [
          { path: 'p1', config_name: 'cfg', result_name: 'r1', modified: '2024-01-11T00:00:00Z' },
          { path: 'p2', config_name: 'cfg', result_name: 'r2', modified: '2024-01-12T00:00:00Z' },
        ],
      })
    );
    await results.loadResults();
    results.setSelected(['p1', 'p2']);
    fetchMock.mockImplementation((url: unknown) => (String(url).includes('/results/equity') ? csvResponse() : ok({})));
    const { compareSelected } = await import('./useCompare');
    const compare = compareSelected({ results, t, notify, selectPanel: () => selectResults(), fetchFn: fetchMock as unknown as typeof fetch });
    await compare();
    const equityUrls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/results/equity'));
    // paths iterate in table order: p2 (newest) then p1
    expect(equityUrls).toEqual([
      'http://h:8000/api/backtest-v7/results/equity?path=p2',
      'http://h:8000/api/backtest-v7/results/equity?path=p1',
    ]);
    expect(results.compareOpen.value).toBe(true);
    expect(results.compareTraces.value).toHaveLength(4); // eq + bal per result
    // second invocation toggles the plot away (:7781-7785)
    await compare();
    expect(results.compareOpen.value).toBe(false);
  });

  it('the equity cache is keyed by version:path so both flavors coexist (:7614-7620)', async () => {
    const results = await loadedResultsStore();
    // load through 'both' so p1 genuinely arrives via the v8 probe — the
    // loader tags the REQUESTED flavor (:5390), so a server-proclaimed tag
    // alone no longer survives a single-flavor load
    results.versionFilter.value = 'both';
    fetchMock.mockImplementation((url: unknown) =>
      ok({
        results: String(url).includes('backtest-v8')
          ? [{ path: 'p1', config_name: 'cfg', result_name: 'r1', modified: '2024-01-11T00:00:00Z' }]
          : [{ path: 'p2', config_name: 'cfg', result_name: 'r2', modified: '2024-01-12T00:00:00Z' }],
      })
    );
    await results.loadResults();
    results.setSelected(['p1', 'p2']);
    fetchMock.mockImplementation((url: unknown) => (String(url).includes('/results/equity') ? csvResponse() : ok({})));
    const { compareSelected } = await import('./useCompare');
    const compare = compareSelected({ results, t, notify, selectPanel: () => selectResults(), fetchFn: fetchMock as unknown as typeof fetch });
    await compare();
    const equityUrls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/results/equity'));
    // table order: p2 (v7, newest) first, then p1 (v8-tagged → v8 router)
    expect(equityUrls[0]).toBe('http://h:8000/api/backtest-v7/results/equity?path=p2');
    expect(equityUrls[1]).toBe('http://h:8000/api/backtest-v8/results/equity?path=p1');
  });
});
