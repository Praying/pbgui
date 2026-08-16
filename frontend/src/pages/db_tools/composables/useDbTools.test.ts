import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { useDbTools } from './useDbTools';
import type { SyncSafety } from './useDbTools';

/* The store port of db_tools.html :308-1237 — targets, list loads, backup
   sorting, the sync safety merge, confirm gating and operation polling. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();

function makeStore() {
  return useDbTools({ t: (key, params) => `${key}${params ? ':' + JSON.stringify(params) : ''}` });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const TARGETS = { targets: [{ id: 'local', label: 'Master' }, { id: 'replica', label: 'Replica' }] };

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL) => {
    const u = String(url);
    if (u.endsWith('/targets')) return Promise.resolve(jsonResponse(TARGETS));
    if (u.includes('/users?')) return Promise.resolve(jsonResponse({ users: [{ user: 'alice', total: 3 }, { user: 'bob', total: 5 }] }));
    if (u.includes('/sync/jobs')) return Promise.resolve(jsonResponse({ jobs: [] }));
    if (u.includes('/backups?')) return Promise.resolve(jsonResponse({ backups: [] }));
    if (u.includes('/dashboards?')) return Promise.resolve(jsonResponse({ dashboards: ['d1'], templates: ['t1'] }));
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('bootstrap (:1218-1236)', () => {
  it('loads targets and fans out the panel loads with distinct defaults', async () => {
    const store = makeStore();
    const bootstrap = store.bootstrap();
    await vi.advanceTimersByTimeAsync(1);
    await bootstrap;

    expect(store.targets.value).toHaveLength(2);
    expect(store.cleanupTarget.value).toBe('local');
    expect(store.usersTarget.value).toBe('replica'); // :502 — first different target
    expect(store.cleanupUserRows.value.map((row) => row.user)).toEqual(['alice', 'bob']);
    expect(store.dashboards.value).toEqual(['d1']);
    expect(store.statuses.value.cleanup?.kind).toBe('ok');
  });

  it('reports the failure on every panel when targets fail', async () => {
    fetchMock.mockRejectedValue(new Error('HTTP 500'));
    const store = makeStore();
    const bootstrap = store.bootstrap();
    await vi.advanceTimersByTimeAsync(1);
    await bootstrap;

    for (const id of ['cleanup', 'users', 'db', 'sync', 'backup', 'dash']) {
      expect(store.statuses.value[id]?.kind).toBe('err'); // :1224-1230
    }
  });
});

describe('target pair guard (:468-481)', () => {
  it('keeps source and target different on both change sides', async () => {
    const store = makeStore();
    const bootstrap = store.bootstrap();
    await vi.advanceTimersByTimeAsync(1);
    await bootstrap;

    store.usersTarget.value = 'local';
    store.syncTargetPair(store.usersSource, store.usersTarget, 'target');
    expect(store.usersSource.value).toBe('replica');

    store.usersSource.value = 'replica';
    store.syncTargetPair(store.usersSource, store.usersTarget, 'source');
    expect(store.usersTarget.value).toBe('local');
  });
});

describe('backup sorting (:413-438, :1023-1036)', () => {
  async function storeWithBackups(items: unknown[]) {
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/targets')) return Promise.resolve(jsonResponse(TARGETS));
      if (u.includes('/backups?')) return Promise.resolve(jsonResponse({ backups: items }));
      if (u.includes('/users?')) return Promise.resolve(jsonResponse({ users: [] }));
      if (u.includes('/dashboards?')) return Promise.resolve(jsonResponse({ dashboards: [], templates: [] }));
      return Promise.resolve(jsonResponse({}));
    });
    const store = makeStore();
    const bootstrap = store.bootstrap();
    await vi.advanceTimersByTimeAsync(1);
    await bootstrap;
    return store;
  }

  it('sorts by name pattern descending by default and toggles columns', async () => {
    const store = await storeWithBackups([
      { name: 'db-tools-20240101-000000-a', size: 10 },
      { name: 'db-tools-20240103-000000-c', size: 30 },
      { name: 'db-tools-20240102-000000-b', size: 20 },
    ]);
    expect(store.sortedBackups.value.map((item) => item.name.slice(9, 17))).toEqual([
      '20240103',
      '20240102',
      '20240101',
    ]);

    store.toggleBackupSort('created');
    expect(store.backupSort.value.dir).toBe('asc');

    store.toggleBackupSort('size');
    expect(store.backupSort.value).toEqual({ key: 'size', dir: 'asc' }); // non-created → asc
    expect(store.sortedBackups.value[0]?.size).toBe(10);
  });
});

describe('sync safety merge (:604-621)', () => {
  it('merges per-target results, dedupes conflicts and flips ok', () => {
    const store = makeStore();
    const results: SyncSafety[] = [
      { ok: true, targets: { local: { running: true } }, blocked: {}, conflicts: [] },
      {
        ok: false,
        targets: { replica: { running: false } },
        blocked: { replica: ['alice'] },
        conflicts: [{ job_id: 'j1', users: ['alice'] }],
      },
      {
        ok: true,
        targets: {},
        blocked: {},
        conflicts: [{ job_id: 'j1', users: ['alice'] }], // duplicate key
      },
    ];
    const merged = store.mergeSyncSafetyResults(results, { name: 'x' });
    expect(merged.ok).toBe(false);
    expect(merged.blocked).toEqual({ replica: ['alice'] });
    expect(merged.conflicts).toHaveLength(1);
    expect(merged.job).toEqual({ name: 'x' });
  });
});

describe('confirm gating (:880-900)', () => {
  it('blocks destructive runs until confirmed, then clears the preview', async () => {
    const store = makeStore();
    const bootstrap = store.bootstrap();
    await vi.advanceTimersByTimeAsync(1);
    await bootstrap;

    store.cleanupPreview.value = { target: 'local', users: ['alice'], cutoff_ms: null };
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse({ operation: { id: 'op1', status: 'running', percent: 0 } }));

    const run = store.runCleanup();
    expect(store.confirmState.value.active).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled(); // nothing fired before confirm

    store.resolveConfirm(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).not.toHaveBeenCalled();

    store.cleanupPreview.value = { target: 'local', users: ['alice'], cutoff_ms: null };
    const run2 = store.runCleanup();
    store.resolveConfirm(true);
    await vi.advanceTimersByTimeAsync(1);
    await run2;
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/cleanup/run');
    expect(store.cleanupPreview.value).toBeNull();
    void run;
  });
});

describe('operation polling (:922-951)', () => {
  it('polls every 700 ms until done and reports the result', async () => {
    const store = makeStore();
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/targets')) return Promise.resolve(jsonResponse(TARGETS));
      if (u.includes('/operations/')) {
        return Promise.resolve(jsonResponse({ operation: { id: 'op1', status: 'running', percent: 50, completed: 1, total: 2 } }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    const done = vi.fn();
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/cleanup/run')) {
        return Promise.resolve(jsonResponse({ operation: { id: 'op1', status: 'running', percent: 0, completed: 0, total: 2 } }));
      }
      if (u.includes('/operations/')) {
        return Promise.resolve(jsonResponse({ operation: { id: 'op1', status: 'running', percent: 50, completed: 1, total: 2 } }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    const promise = store.startOperation('/cleanup/run', { target: 'local' }, 'cleanup', 'cleanup', done);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(store.progress.value.cleanup?.visible).toBe(true);

    fetchMock.mockImplementation((url: string | URL) => {
      if (String(url).includes('/operations/')) {
        return Promise.resolve(jsonResponse({ operation: { id: 'op1', status: 'done', percent: 100, result: { removed: 4 } } }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    await vi.advanceTimersByTimeAsync(800);
    expect(done).toHaveBeenCalledWith({ removed: 4 });
    expect(store.statuses.value.cleanup?.kind).toBe('ok');
  });
});

describe('sync log fallback name (:763-767)', () => {
  it('slugifies the job name into the log path', () => {
    const store = makeStore();
    const info = store.logFileForJob('job-1');
    expect(info.file).toBe('jobs/db-tools-sync-sync-job.log'); // no name → fallback
    expect(info.title).toContain('job-1');
  });
});
