import { describe, expect, it, vi } from 'vitest';
import { createArchiveGitFlows } from './useArchiveGit';
import type { ArchivePullStreamEvent } from '../lib/archiveGitModel';

/*
 * The archive git-maintenance store (M-v7-12, the M-v7-11 DEFERRED
 * block :9483-9845): pull/pull-all streams with the 1 s elapsed timer
 * (:9484-9632), git push (:9640-9669), compact history (:9670-9746),
 * the setup modal + README config loader (:9747-9845) and the
 * archive sync log opener (:9633-9639).
 */

type Notify = { msg: string; kind: string };

interface NdjsonCall {
  path: string;
  init: RequestInit;
  feed(event: ArchivePullStreamEvent): void;
}

interface Harness {
  store: ReturnType<typeof createArchiveGitFlows>;
  notify: Notify[];
  ndjsonCalls: NdjsonCall[];
  finishNdjson(done: unknown): void;
  fetchCalls: { path: string; init?: RequestInit }[];
  failGet(path: string): void;
  failPost(path: string): void;
  viewArchive: ReturnType<typeof vi.fn>;
  loadArchives: ReturnType<typeof vi.fn>;
  openLog: ReturnType<typeof vi.fn>;
  tick(ms: number): void;
}

function harness(overrides: {
  selectedName?: string;
  own?: boolean;
  archiveNames?: string[];
  routes?: Record<string, unknown>;
} = {}): Harness {
  const notify: Notify[] = [];
  const ndjsonCalls: NdjsonCall[] = [];
  const fetchCalls: { path: string; init?: RequestInit }[] = [];
  const routes = new Map<string, unknown>(Object.entries(overrides.routes ?? {}));
  const failGet = new Set<string>();
  const failPost = new Set<string>();
  const viewArchive = vi.fn();
  const loadArchives = vi.fn();
  const openLog = vi.fn();
  let clock = 0;

  const intervalHandlers = new Set<() => void>();
  const timers = {
    setInterval: ((handler: () => void) => {
      intervalHandlers.add(handler);
      return 1;
    }) as unknown as typeof setInterval,
    clearInterval: (() => {
      intervalHandlers.clear();
    }) as unknown as typeof clearInterval,
  };

  const resolvers: Array<(done: unknown) => void> = [];

  const archiveFetch = (path: string, init?: RequestInit): Promise<Record<string, unknown>> => {
    fetchCalls.push({ path, init });
    const method = init?.method ?? 'GET';
    if (method === 'GET' && failGet.has(path)) return Promise.reject(new Error('HTTP 500'));
    if (method === 'POST' && failPost.has(path)) return Promise.reject(new Error('HTTP 500'));
    const data = routes.get(path);
    if (data === undefined) return Promise.reject(new Error('no route for ' + path));
    return Promise.resolve(data as Record<string, unknown>);
  };

  const fetchNdjson = (path: string, init: RequestInit, onEvent: (event: ArchivePullStreamEvent) => void): Promise<unknown> => {
    const call: NdjsonCall = { path, init, feed: (event) => onEvent(event) };
    ndjsonCalls.push(call);
    return new Promise((resolve) => {
      resolvers.push(resolve);
    });
  };

  const store = createArchiveGitFlows({
    archiveFetch,
    fetchNdjson,
    getSelectedName: () => overrides.selectedName ?? '',
    isOwn: () => overrides.own ?? true,
    getArchiveNames: () => overrides.archiveNames ?? ['mine', 'other'],
    viewArchive,
    loadArchives,
    openLog,
    t: (key: string, params?: Record<string, unknown>) => key + (params ? ':' + JSON.stringify(params) : ''),
    notify: (msg: string, kind: string) => notify.push({ msg, kind }),
    timers,
    now: () => clock,
  });

  return {
    store,
    notify,
    ndjsonCalls,
    finishNdjson: (done: unknown) => {
      resolvers.shift()?.(done);
    },
    fetchCalls,
    failGet: (path: string) => failGet.add(path),
    failPost: (path: string) => failPost.add(path),
    viewArchive,
    loadArchives,
    openLog,
    tick: (ms: number) => {
      clock += ms;
      for (const handler of [...intervalHandlers]) handler();
    },
  };
}

function lastPostBody(call: { init?: RequestInit } | undefined): Record<string, unknown> {
  return JSON.parse(String(call?.init?.body ?? '{}')) as Record<string, unknown>;
}

describe('pull streams (:9484-9632)', () => {
  it('pullSelected gates on a selected archive (:9611-9612)', async () => {
    const h = harness({ selectedName: '' });
    await h.store.pullSelected();
    expect(h.ndjsonCalls).toHaveLength(0);
    expect(h.notify).toEqual([{ msg: 'v7backtest.clickViewFirst', kind: 'err' }]);
  });

  it('streams one archive: events update status/log, done ok opens the results modal and reloads (:9611-9625)', async () => {
    const h = harness({ selectedName: 'mine' });
    const promise = h.store.pullSelected();
    expect(h.ndjsonCalls).toHaveLength(1);
    expect(h.ndjsonCalls[0]!.path).toBe('/archives/mine/pull/stream');
    expect(h.ndjsonCalls[0]!.init).toEqual({ method: 'POST' });
    expect(h.store.pullRunning.value).toBe(true);
    expect(h.store.pullOpen.value).toBe(true);
    expect(h.store.pullButtonLabel.value).toBe('Pulling... 0s');
    expect(h.store.pullElapsedText.value).toBe('Elapsed: 0s');

    h.ndjsonCalls[0]!.feed({ type: 'archive_start', archive: 'mine' });
    h.ndjsonCalls[0]!.feed({ type: 'output', message: 'Fetching origin' });
    expect(h.store.pullStatus.value).toBe('Pulling mine');
    expect(h.store.pullLog.value).toBe('\n### mine\nFetching origin');

    h.tick(61_000);
    expect(h.store.pullButtonLabel.value).toBe('Pulling... 1m 1s');
    expect(h.store.pullElapsedText.value).toBe('Elapsed: 1m 1s');

    h.finishNdjson({ type: 'done', ok: true, result: { name: 'mine', output: 'fast-forward' } });
    await promise;
    expect(h.store.pullRunning.value).toBe(false);
    expect(h.store.pullOpen.value).toBe(false);
    expect(h.store.pullResults.value).toEqual({
      title: 'v7backtest.pullPrefix:{"name":"mine"}',
      items: [{ name: 'mine', output: 'fast-forward' }],
    });
    expect(h.notify).toEqual([{ msg: 'v7backtest.pullComplete', kind: 'ok' }]);
    expect(h.viewArchive).toHaveBeenCalledWith('mine');
  });

  it('pullSelected defaults the result row when the done event has none (:9617)', async () => {
    const h = harness({ selectedName: 'mine' });
    const promise = h.store.pullSelected();
    h.finishNdjson({ type: 'done', ok: true });
    await promise;
    expect(h.store.pullResults.value?.items).toEqual([{ name: 'mine', output: 'ok' }]);
  });

  it('surfaces a failed done event as the pullFailed toast and keeps the progress modal (:9596-9609)', async () => {
    const h = harness({ selectedName: 'mine' });
    const promise = h.store.pullSelected();
    h.finishNdjson({ type: 'done', ok: false, error: 'git lock' });
    await promise;
    expect(h.store.pullRunning.value).toBe(false);
    expect(h.store.pullOpen.value).toBe(true); // legacy keeps the modal with the red status
    expect(h.store.pullStatus.value).toBe('Pull failed: git lock');
    expect(h.store.pullStatusError.value).toBe(true);
    expect(h.store.pullLog.value).toContain('\nPull failed: git lock\n');
    expect(h.notify).toEqual([{ msg: 'v7backtest.pullFailed:{"msg":"git lock"}', kind: 'err' }]);
  });

  it('treats a stream without a done event as a failure (:9597)', async () => {
    const h = harness({ selectedName: 'mine' });
    const promise = h.store.pullSelected();
    h.finishNdjson(null);
    await promise;
    expect(h.store.pullStatus.value).toBe('Pull failed: No completion status from server');
    expect(h.notify).toEqual([{ msg: 'v7backtest.pullFailed:{"msg":"No completion status from server"}', kind: 'err' }]);
  });

  it('rejects a second concurrent pull (:9590-9591)', async () => {
    const h = harness({ selectedName: 'mine' });
    const first = h.store.pullSelected();
    await h.store.pullAll();
    expect(h.ndjsonCalls).toHaveLength(1);
    expect(h.notify).toEqual([
      { msg: 'v7backtest.pullingAllArchives', kind: 'info' }, // legacy toasts first (:9627)
      { msg: 'v7backtest.pullAlreadyRunning', kind: 'info' },
    ]);
    h.finishNdjson({ type: 'done', ok: true });
    await first;
  });

  it('pullAll streams every archive result and reloads the list (:9627-9637)', async () => {
    const h = harness();
    const promise = h.store.pullAll();
    expect(h.notify[0]).toEqual({ msg: 'v7backtest.pullingAllArchives', kind: 'info' });
    expect(h.ndjsonCalls[0]!.path).toBe('/archives/pull-all/stream');
    h.finishNdjson({
      type: 'done',
      ok: true,
      results: [
        { name: 'mine', output: 'ok' },
        { name: 'other', error: 'boom' },
      ],
    });
    await promise;
    expect(h.store.pullResults.value).toEqual({
      title: 'v7backtest.pullAllResults',
      items: [
        { name: 'mine', output: 'ok' },
        { name: 'other', error: 'boom' },
      ],
    });
    expect(h.loadArchives).toHaveBeenCalledTimes(1);
    expect(h.viewArchive).not.toHaveBeenCalled();
  });

  it('hide keeps the pull running (:9522-9525)', async () => {
    const h = harness({ selectedName: 'mine' });
    const promise = h.store.pullSelected();
    h.store.hidePull();
    expect(h.store.pullOpen.value).toBe(false);
    expect(h.store.pullRunning.value).toBe(true);
    h.finishNdjson({ type: 'done', ok: true });
    await promise;
  });
});

describe('git push (:9640-9669)', () => {
  it('refuses without a configured own archive (:9643-9647)', async () => {
    const h = harness({ routes: { '/archives/settings': { my_archive: '' } } });
    await h.store.push();
    expect(h.notify).toEqual([{ msg: 'v7backtest.noOwnArchiveSetup', kind: 'err' }]);
    expect(h.fetchCalls.filter((c) => c.init?.method === 'POST')).toHaveLength(0);
  });

  it('pushes with stored credentials and shows the output modal (:9648-9666)', async () => {
    const h = harness({
      routes: {
        '/archives/settings': { my_archive: 'mine', username: 'u', email: 'e@x', access_token: 'unexpected-token' },
        '/archives/mine/push': { output: 'pushed 2 files' },
      },
    });
    await h.store.push();
    const post = h.fetchCalls.find((c) => c.path === '/archives/mine/push');
    expect(lastPostBody(post)).toEqual({ username: 'u', email: 'e@x' });
    expect(h.openLog).toHaveBeenCalledTimes(1); // showArchiveLog (:9652)
    expect(h.notify.some((n) => n.msg === 'v7backtest.pushingArchive:{"name":"mine"}' && n.kind === 'info')).toBe(true);
    expect(h.store.pushOutput.value).toEqual({ title: 'v7backtest.gitPushPrefix:{"name":"mine"}', output: 'pushed 2 files' });
  });

  it('toasts pushFailed on a rejected push (:9667-9668)', async () => {
    const h = harness({
      routes: {
        '/archives/settings': { my_archive: 'mine' },
        '/archives/mine/push': { output: 'should not matter' },
      },
    });
    h.failPost('/archives/mine/push');
    await h.store.push();
    expect(h.notify.some((n) => n.msg.startsWith('v7backtest.pushFailed'))).toBe(true);
    expect(h.store.pushOutput.value).toBeNull();
  });

  it('toasts couldNotLoadSettings when settings fail (:9669)', async () => {
    const h = harness({ routes: { '/archives/settings': {} } });
    h.failGet('/archives/settings');
    await h.store.push();
    expect(h.notify[0]?.msg.startsWith('v7backtest.couldNotLoadSettings')).toBe(true);
  });
});

describe('setup modal (:9747-9845)', () => {
  const settings = {
    my_archive: 'mine',
    username: 'u',
    email: 'e@x',
    access_token_configured: true,
    auto_pull_interval: 15,
    readme_title: 'My Title',
    readme_static_markdown: 'notes',
  };

  it('opens seeded from GET /archives/settings with the archive options (:9748-9812)', async () => {
    const h = harness({ routes: { '/archives/settings': settings } });
    await h.store.openSetup();
    expect(h.store.setupOpen.value).toBe(true);
    expect(h.store.setupForm.value).toEqual({
      my_archive: 'mine',
      username: 'u',
      email: 'e@x',
      access_token: '',
      auto_pull_interval: '15',
      readme_title: 'My Title',
      readme_static_markdown: 'notes',
    });
    expect(h.store.setupArchiveNames.value).toEqual(['mine', 'other']);
  });

  it('defaults the README title and interval (:9775-9781)', async () => {
    const h = harness({ routes: { '/archives/settings': {} } });
    await h.store.openSetup();
    expect(h.store.setupForm.value.readme_title).toBe('PBGui Config Archive');
    expect(h.store.setupForm.value.auto_pull_interval).toBe('0');
  });

  it('settings load failure toasts couldNotLoadSettings and never opens (:9813)', async () => {
    const h = harness({});
    h.failGet('/archives/settings');
    await h.store.openSetup();
    expect(h.store.setupOpen.value).toBe(false);
    expect(h.notify[0]?.msg.startsWith('v7backtest.couldNotLoadSettings')).toBe(true);
  });

  it('reloads the README config when the select changes (:9814-9824)', async () => {
    const h = harness({
      routes: {
        '/archives/settings': settings,
        '/archives/other/readme-config': { title: 'Other', static_markdown: 'other notes' },
      },
    });
    await h.store.openSetup();
    await h.store.loadReadmeSetup('other');
    expect(h.store.setupForm.value.readme_title).toBe('Other');
    expect(h.store.setupForm.value.readme_static_markdown).toBe('other notes');
  });

  it('falls back to the archive name when the config has no title (:9820)', async () => {
    const h = harness({
      routes: {
        '/archives/settings': settings,
        '/archives/other/readme-config': { static_markdown: '' },
      },
    });
    await h.store.openSetup();
    await h.store.loadReadmeSetup('other');
    expect(h.store.setupForm.value.readme_title).toBe('other');
  });

  it('README load failure toasts couldNotLoadReadme (:9823-9824)', async () => {
    const h = harness({ routes: { '/archives/settings': settings } });
    await h.store.openSetup();
    h.failGet('/archives/other/readme-config');
    await h.store.loadReadmeSetup('other');
    expect(h.notify[0]?.msg.startsWith('v7backtest.couldNotLoadReadme')).toBe(true);
  });

  it('test push posts dry_run and keeps the modal open (:9795-9805)', async () => {
    const h = harness({
      routes: {
        '/archives/settings': settings,
        '/archives/mine/push': { output: 'credentials ok' },
      },
    });
    await h.store.openSetup();
    h.store.setupForm.value.access_token = 'explicit-token';
    await h.store.testPush();
    const post = h.fetchCalls.find((c) => c.path === '/archives/mine/push');
    expect(lastPostBody(post)).toEqual({
      my_archive: 'mine',
      username: 'u',
      email: 'e@x',
      access_token: 'explicit-token',
      auto_pull_interval: 15,
      readme_title: 'My Title',
      readme_static_markdown: 'notes',
      dry_run: true,
    });
    expect(h.store.setupOpen.value).toBe(true);
    expect(h.notify[0]).toEqual({ msg: 'v7backtest.testOk:{"output":"credentials ok"}', kind: 'ok' });
  });

  it('test push failure toasts testFailed (:9805)', async () => {
    const h = harness({ routes: { '/archives/settings': settings } });
    await h.store.openSetup();
    h.failPost('/archives/mine/push');
    await h.store.testPush();
    expect(h.notify[0]?.msg.startsWith('v7backtest.testFailed')).toBe(true);
  });

  it('save posts the collected settings and closes (:9806-9816)', async () => {
    const h = harness({
      routes: {
        '/archives/settings': { ...settings, my_archive: '' },
      },
    });
    await h.store.openSetup();
    h.store.setupForm.value.my_archive = 'mine';
    h.store.setupForm.value.access_token = 'explicit-token';
    await h.store.saveSetup();
    const post = h.fetchCalls.filter((c) => c.path === '/archives/settings').find((c) => c.init?.method === 'POST');
    expect(lastPostBody(post)).toEqual({
      my_archive: 'mine',
      username: 'u',
      email: 'e@x',
      access_token: 'explicit-token',
      auto_pull_interval: 15,
      readme_title: 'My Title',
      readme_static_markdown: 'notes',
    });
    expect(h.store.setupOpen.value).toBe(false);
    expect(h.notify).toEqual([{ msg: 'v7backtest.archiveSettingsSaved', kind: 'ok' }]);
  });

  it('save without a new token preserves the configured token (:9806-9816)', async () => {
    const h = harness({
      routes: {
        '/archives/settings': { ...settings, my_archive: 'mine' },
      },
    });
    await h.store.openSetup();
    await h.store.saveSetup();
    const post = h.fetchCalls.filter((c) => c.path === '/archives/settings').find((c) => c.init?.method === 'POST');
    expect(lastPostBody(post)).not.toHaveProperty('access_token');
  });

  it('save without an own archive toasts selectOwnArchive and posts nothing (:9827-9829)', async () => {
    const h = harness({ routes: { '/archives/settings': {} } });
    await h.store.openSetup();
    await h.store.saveSetup();
    expect(h.notify).toEqual([{ msg: 'v7backtest.selectOwnArchive', kind: 'err' }]);
    expect(h.store.setupOpen.value).toBe(true);
    expect(h.fetchCalls.some((c) => c.init?.method === 'POST')).toBe(false);
  });

  it('save failure toasts saveFailed and keeps the modal (:9816-9817)', async () => {
    const h = harness({ routes: { '/archives/settings': settings } });
    h.failPost('/archives/settings');
    await h.store.openSetup();
    await h.store.saveSetup();
    expect(h.notify[0]?.msg.startsWith('v7backtest.saveFailed')).toBe(true);
    expect(h.store.setupOpen.value).toBe(true);
  });
});

describe('compact history (:9670-9746)', () => {
  it('is own-only (:9671-9674)', async () => {
    const foreign = harness({ selectedName: 'other', own: false });
    await foreign.store.compactHistory();
    expect(foreign.notify).toEqual([{ msg: 'v7backtest.compactOwnOnly', kind: 'err' }]);
    const none = harness({ selectedName: '', own: true });
    await none.store.compactHistory();
    expect(none.notify).toEqual([{ msg: 'v7backtest.compactOwnOnly', kind: 'err' }]);
    expect(none.fetchCalls).toHaveLength(0);
  });

  it('runs the dry run and opens the preview (:9676-9722)', async () => {
    const h = harness({
      selectedName: 'mine',
      routes: {
        '/archives/settings': { username: 'u', email: 'e@x', access_token_configured: true, access_token: 'unexpected-token' },
        '/archives/mine/compact': {
          status: [' M a.json'],
          storage_estimate: { available: true, saved_human: '1 MB', saved_percent: '10', current_human: '10 MB', after_human: '9 MB' },
          branch: 'main',
          commit_count: 5,
          manifest_items: 7,
          object_size: 'size',
        },
      },
    });
    await h.store.compactHistory();
    expect(h.notify[0]).toEqual({ msg: 'v7backtest.preparingCompactDryRun', kind: 'info' });
    const post = h.fetchCalls.find((c) => c.path === '/archives/mine/compact');
    expect(lastPostBody(post)).toEqual({ dry_run: true, username: 'u', email: 'e@x' });
    expect(h.store.compactPreview.value?.name).toBe('mine');
    expect(h.store.compactPreview.value?.view.savings).toEqual({ available: true, human: '1 MB', percent: '10' });
    expect(h.store.compactPreview.value?.view.branch).toBe('main');
  });

  it('confirm force-pushes without dry_run, reloads and re-views (:9724-9741)', async () => {
    const h = harness({
      selectedName: 'mine',
      routes: {
        '/archives/settings': {},
        '/archives/mine/compact': { output: 'rewritten' },
      },
    });
    await h.store.compactHistory();
    h.fetchCalls.length = 0;
    await h.store.confirmCompact();
    const post = h.fetchCalls.find((c) => c.path === '/archives/mine/compact');
    expect(lastPostBody(post).dry_run).toBe(false);
    expect(h.openLog).toHaveBeenCalledTimes(1);
    expect(h.notify.some((n) => n.msg === 'v7backtest.compactingArchive:{"name":"mine"}')).toBe(true);
    expect(h.store.compactOutput.value).toEqual({ title: 'v7backtest.compactArchiveHistoryPrefix:{"name":"mine"}', output: 'rewritten' });
    expect(h.loadArchives).toHaveBeenCalledTimes(1);
    expect(h.viewArchive).toHaveBeenCalledWith('mine');
  });

  it('dry-run failure toasts compactDryRunFailed (:9742-9743)', async () => {
    const h = harness({ selectedName: 'mine', routes: { '/archives/settings': {} } });
    await h.store.compactHistory();
    expect(h.notify[0]).toEqual({ msg: 'v7backtest.preparingCompactDryRun', kind: 'info' });
    expect(h.notify[1]?.msg.startsWith('v7backtest.compactDryRunFailed')).toBe(true);
  });

  it('confirm failure toasts compactFailed (:9741-9742)', async () => {
    const h = harness({ selectedName: 'mine', routes: { '/archives/settings': {}, '/archives/mine/compact': {} } });
    await h.store.compactHistory();
    h.failPost('/archives/mine/compact');
    await h.store.confirmCompact();
    expect(h.notify.some((n) => n.msg.startsWith('v7backtest.compactFailed'))).toBe(true);
  });
});
