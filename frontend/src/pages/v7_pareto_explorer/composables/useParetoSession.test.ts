import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useParetoSession, type ParetoSessionDeps } from './useParetoSession';
import { createI18n, serverMsg } from '@/shared/i18n';
import type { LoadData, ParetoSession, RefreshBundle } from '../types';

/*
 * The runtime-flavor core (R3): pareto is the only v7/v8 page whose version
 * can flip after load — optimizeVersion() re-resolves per result
 * (:1765-1768), the v8-only compare gate follows (:1772-1780), and every
 * cross-page URL builder reads the resolved value at call time (:1783-1791).
 */

const i18n = createI18n('en');
const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {});
const API_BASE = 'http://pbgui.test:8000/api/pareto-explorer';
const ORIGIN = 'http://pbgui.test:8000';

function makeDeps(overrides: Partial<ParetoSessionDeps> = {}): ParetoSessionDeps {
  return { apiBase: API_BASE, origin: ORIGIN, seedVersion: 'v7', resultPath: '', t, ...overrides };
}

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function bad(text: string): Promise<Response> {
  return Promise.resolve(new Response(text, { status: 500 }));
}

const FULL_LOAD: LoadData = {
  mode: 'full',
  result: { name: 'run1', optimize_version: 'v7' },
  view_range: { start: 0, end: 500, max: 1200 },
  summary: { visible_configs: 500, selected_configs: 1200, scanned_configs: 9000, pareto_configs: 40 },
  refresh_bundle: {
    command_center: { champions: [{ config_index: 0 }] },
    selected_config_index: 0,
    detail: { config_index: 0, full_config: { bot: {} } },
    playground: { counts: { configs: 40 } },
  } satisfies RefreshBundle,
};

beforeEach(() => {
  window.history.replaceState({}, '', '/api/pareto-explorer/main_page');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('optimizeVersion resolution order (:1765-1768)', () => {
  it('result.optimize_version beats session.optimize_version', () => {
    const store = useParetoSession(makeDeps());
    store.applySession({ result: { optimize_version: 'v8' }, optimize_version: 'v7', result_valid: true });
    expect(store.version()).toBe('v8');
  });

  it('session.optimize_version beats the injected seed', () => {
    const store = useParetoSession(makeDeps());
    store.applySession({ optimize_version: 'v8' });
    expect(store.version()).toBe('v8');
  });

  it('keeps the injected seed when the session carries no version', () => {
    const store = useParetoSession(makeDeps({ seedVersion: 'v8' }));
    store.applySession({ result_valid: false });
    expect(store.version()).toBe('v8');
  });

  it('normalises junk to v7 (:1768)', () => {
    const store = useParetoSession(makeDeps());
    store.applySession({ optimize_version: 'v9' });
    expect(store.version()).toBe('v7');
    store.applySession({ result: { optimize_version: 'V8' } });
    expect(store.version()).toBe('v8');
  });

  it('defaults to v7 with no session at all (:1768 fallback)', () => {
    const store = useParetoSession(makeDeps());
    expect(store.version()).toBe('v7');
  });
});

describe('v8-only strategy-compare gating (:1772-1780)', () => {
  it('hides the baseline pin while the resolved version is v7', () => {
    const store = useParetoSession(makeDeps({ seedVersion: 'v8' }));
    store.applySession({ result: { optimize_version: 'v7' } });
    expect(store.isV8.value).toBe(false);
  });

  it('clears a pinned baseline when the version flips to v7', () => {
    const store = useParetoSession(makeDeps({ seedVersion: 'v8' }));
    store.applySession({ optimize_version: 'v8' });
    store.state.strategyCompareBaseline = {
      result_path: '/r',
      config_index: 1,
      config: {},
      override_configs: {},
    };
    store.applySession({ result: { optimize_version: 'v7' } });
    expect(store.state.strategyCompareBaseline).toBeNull();
  });

  it('keeps the baseline while the version stays v8', () => {
    const store = useParetoSession(makeDeps({ seedVersion: 'v8' }));
    store.applySession({ optimize_version: 'v8' });
    store.state.strategyCompareBaseline = { result_path: '/r', config_index: 1, config: {}, override_configs: {} };
    store.applySession({ result: { optimize_version: 'v8' } });
    expect(store.state.strategyCompareBaseline).not.toBeNull();
  });
});

describe('runtime flip updates URL builders (:1783-1791)', () => {
  it('a v8 result on a v7-seeded page flips every handoff base', () => {
    const store = useParetoSession(makeDeps({ seedVersion: 'v7' }));
    expect(store.urlFor.optimize()).toBe(ORIGIN + '/api/optimize-v7');
    store.applySession({ result: { optimize_version: 'v8' } });
    expect(store.urlFor.optimize()).toBe(ORIGIN + '/api/optimize-v8');
    expect(store.urlFor.backtest()).toBe(ORIGIN + '/api/backtest-v8');
    expect(store.urlFor.strategyExplorer()).toBe(ORIGIN + '/api/strategy-explorer-v8');
    expect(store.urlFor.backToOptimize()).toBe(ORIGIN + '/api/optimize-v8/main_page?panel=results#results');
  });

  it('a v7 result on a v8-seeded page flips back', () => {
    const store = useParetoSession(makeDeps({ seedVersion: 'v8' }));
    store.applySession({ result: { optimize_version: 'v7' } });
    expect(store.urlFor.backtest()).toBe(ORIGIN + '/api/backtest-v7');
    expect(store.urlFor.strategyExplorer()).toBe(ORIGIN + '/api/strategy-explorer');
  });
});

describe('applySession (renderSession state layer :3895-3984)', () => {
  it('absorbs persisted defaults (:3902-3909)', () => {
    const store = useParetoSession(makeDeps({ resultPath: '/r' }));
    store.applySession({
      result_valid: true,
      result: { name: 'run1' },
      defaults: { load_strategy: ['sharpe'], max_configs: 800, all_results_loaded: true, preview_show_all: true },
      load: FULL_LOAD,
    });
    expect(store.state.loadStrategy).toEqual(['sharpe']);
    expect(store.state.maxConfigs).toBe(800);
    expect(store.state.allResultsLoaded).toBe(true);
    expect(store.state.previewShowAll).toBe(true);
    expect(store.state.loadPayload).toEqual(FULL_LOAD);
    // full-mode view range absorbed (:2331-2345)
    expect(store.state.viewRange).toEqual({ start: 0, end: 500, max: 1200 });
    expect(store.state.pendingViewRange).toEqual({ start: 0, end: 500, max: 1200 });
  });

  it('leaves preview_show_all alone when the server omits the key (:3906-3908)', () => {
    const store = useParetoSession(makeDeps());
    store.state.previewShowAll = true;
    store.applySession({ defaults: { max_configs: 100 } });
    expect(store.state.previewShowAll).toBe(true);
  });

  it('replaces messages and flips the mode chip state (:3983)', () => {
    const store = useParetoSession(makeDeps());
    store.applySession({ result_valid: true, messages: [{ level: 'info', text: 'hi' }] });
    expect(store.state.messages).toEqual([{ level: 'info', text: 'hi' }]);
  });

  it('marks fast-mode status idle and full-mode loaded (:3966-3978)', () => {
    const store = useParetoSession(makeDeps());
    store.applySession({ result_valid: true, load: { mode: 'fast' } });
    expect(store.progress.fullLoad.stage).toBe('idle');
    store.applySession({ result_valid: true, load: FULL_LOAD });
    expect(store.progress.fullLoad.stage).toBe('loaded');
    expect(store.progress.fullLoad.target).toBe(100);
    store.applySession({ result_valid: false });
    expect(store.progress.fullLoad.stage).toBe('error');
  });
});

describe('bootstrapSession (:4693-4726)', () => {
  it('fetches /session with the current result path and resolved version', async () => {
    const fetchMock = vi.fn(async () => ok({ result_valid: true, result: { name: 'run1' } }));
    vi.stubGlobal('fetch', fetchMock);
    const store = useParetoSession(makeDeps({ resultPath: '/opt/results/run1' }));
    await store.bootstrapSession();
    expect(fetchMock).toHaveBeenCalledWith(
      API_BASE + '/session?result_path=' + encodeURIComponent('/opt/results/run1') + '&optimize_version=v7',
      expect.anything()
    );
    expect(store.state.session?.result?.name).toBe('run1');
  });

  it('renders the bootstrap-failure session shape on error (:4716-4725)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => bad('boom')));
    const store = useParetoSession(makeDeps({ resultPath: '/r' }));
    await store.bootstrapSession();
    expect(store.state.session?.result_valid).toBe(false);
    expect(store.state.session?.messages?.[0]?.text).toBe(t('v7explore.bootstrapFailed', { error: serverMsg('boom') }));
  });

  it('ignores a superseded bootstrap (requestSeq guard :4700)', async () => {
    let resolveFirst: (v: Response) => void = () => {};
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(ok({ result_valid: true, result: { name: 'second' } }));
    vi.stubGlobal('fetch', fetchMock);
    const store = useParetoSession(makeDeps({ resultPath: '/r' }));
    const p1 = store.bootstrapSession();
    const p2 = store.bootstrapSession();
    resolveFirst(new Response(JSON.stringify({ result_valid: true, result: { name: 'first' } }), { status: 200 }));
    const [r1] = await Promise.all([p1, p2]);
    expect(r1).toBeNull();
    expect(store.state.session?.result?.name).toBe('second');
  });

  it('re-runs location state and the after-session hook (:4702-4704)', async () => {
    const afterSessionApplied = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ok({ result_valid: true })));
    const store = useParetoSession(makeDeps({ resultPath: '/r', afterSessionApplied }));
    await store.bootstrapSession();
    expect(afterSessionApplied).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain('result_path=' + encodeURIComponent('/r'));
    expect(window.location.search).toContain('stage=command_center');
  });
});

describe('loadParetoData (:4588-4691)', () => {
  it('POSTs the settings body to /load and applies the payload', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => ok(FULL_LOAD));
    vi.stubGlobal('fetch', fetchMock);
    const store = useParetoSession(makeDeps({ resultPath: '/r' }));
    const data = await store.loadParetoData();
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(API_BASE + '/load');
    expect(String(init?.method)).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body.result_path).toBe('/r');
    expect(body.all_results_loaded).toBe(false);
    expect(body.view_range).toBeNull();
    expect(data).toEqual(FULL_LOAD);
    // applyLoadData (:4502-4570 state layer)
    expect(store.state.loadPayload).toEqual(FULL_LOAD);
    expect(store.state.commandCenter).toEqual(FULL_LOAD.refresh_bundle?.command_center);
    expect(store.state.selectedConfigIndex).toBe(0);
    expect(store.state.selectedDetail).toEqual(FULL_LOAD.refresh_bundle?.detail);
    expect(store.state.playground.payload).toEqual(FULL_LOAD.refresh_bundle?.playground);
    expect(store.state.session?.result_valid).toBe(true);
  });

  it('reports a cache restore when the server reuses the scan (:4507-4509)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ ...FULL_LOAD, cache_hit: true })));
    const store = useParetoSession(makeDeps({ resultPath: '/r' }));
    store.state.allResultsLoaded = true;
    await store.loadParetoData();
    // the cache-restore status flashes, then the pipeline-complete phase
    // settles the card (:4507 → :4567) — legacy final state
    expect(store.progress.fullLoad.stage).toBe('loaded');
    expect(store.progress.fullLoad.target).toBe(100);
    expect(store.progress.fullLoad.text).toBe('Full result load completed.');
  });

  it('polls the background job to completion (:4663-4671)', async () => {
    vi.useFakeTimers();
    try {
      const responses: Array<() => Promise<Response>> = [
        () => ok({ status: 'loading', job: { job_id: 'j9', progress: 20, message: 'scanning' } }),
        () => ok({ status: 'done', job: { job_id: 'j9', progress: 100 }, payload: FULL_LOAD }),
      ];
      const fetchMock = vi.fn(async () => responses.shift()!());
      vi.stubGlobal('fetch', fetchMock);
      const store = useParetoSession(makeDeps({ resultPath: '/r' }));
      store.state.allResultsLoaded = true;
      const promise = store.loadParetoData();
      await vi.advanceTimersByTimeAsync(400);
      const data = await promise;
      expect(data).toEqual(FULL_LOAD);
      expect(fetchMock).toHaveBeenNthCalledWith(2, API_BASE + '/load-status?job_id=j9', expect.anything());
      expect(store.state.loadPayload).toEqual(FULL_LOAD);
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards a stale load response (seq guard :4674-4676)', async () => {
    let resolveFirst: (v: Response) => void = () => {};
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(ok(FULL_LOAD));
    vi.stubGlobal('fetch', fetchMock);
    const store = useParetoSession(makeDeps({ resultPath: '/r' }));
    const p1 = store.loadParetoData();
    const p2 = store.loadParetoData();
    resolveFirst(new Response(JSON.stringify({ mode: 'fast', stale: true }), { status: 200 }));
    const [r1] = await Promise.all([p1, p2]);
    // legacy returns the stale data but never applies it (:4675)
    expect(r1).toEqual({ mode: 'fast', stale: true });
    expect(store.state.loadPayload).toEqual(FULL_LOAD);
    expect((store.state.loadPayload as { stale?: boolean }).stale).toBeUndefined();
  });

  it('resets selection + baseline when the result path changes (:4603-4613)', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => ok({ mode: 'fast' }));
    vi.stubGlobal('fetch', fetchMock);
    const store = useParetoSession(makeDeps({ resultPath: '/a', seedVersion: 'v8' }));
    store.applySession({ optimize_version: 'v8' });
    store.state.selectedConfigIndex = 4;
    store.state.strategyCompareBaseline = { result_path: '/a', config_index: 4, config: {}, override_configs: {} };
    store.state.resultPathInput = '/b';
    await store.loadParetoData();
    expect(store.state.selectedConfigIndex).toBeNull();
    expect(store.state.strategyCompareBaseline).toBeNull();
    const init = (vi.mocked(fetch).mock.calls[0] as unknown[])[1] as { body?: string } | undefined;
    expect(JSON.parse(String(init?.body)).result_path).toBe('/b');
  });

  it('surfaces load errors and re-enables the scan button (:4677-4690)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => bad('cannot read')));
    const store = useParetoSession(makeDeps({ resultPath: '/r' }));
    store.state.fullLoadPending = true;
    await expect(store.loadParetoData()).rejects.toThrow('cannot read');
    expect(store.progress.fullLoad.stage).toBe('error');
    expect(store.state.fullLoadPending).toBe(false);
    const last = store.state.messages[0];
    expect(last?.level).toBe('error');
    expect(last?.text).toBe(t('v7explore.loadFailed', { error: serverMsg('cannot read') }));
  });
});

describe('sidebar scan actions (:2838-2883)', () => {
  it('scan all_results refuses without a result path (:2839-2842)', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const store = useParetoSession(makeDeps({ resultPath: '' }));
    store.loadAllResults();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.state.messages[0]?.text).toBe('No result path is available yet.');
    expect(store.state.fullLoadPending).toBe(false);
  });

  it('scan all_results arms the full-load pipeline (:2843-2856)', async () => {
    const fetchMock = vi.fn(async () => ok({ mode: 'full' }));
    vi.stubGlobal('fetch', fetchMock);
    const store = useParetoSession(makeDeps({ resultPath: '/r' }));
    store.state.maxConfigs = 700;
    store.state.loadStrategy = ['sharpe'];
    store.loadAllResults();
    expect(store.state.fullLoadPending).toBe(true);
    expect(store.state.allResultsLoaded).toBe(true);
    await Promise.resolve();
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body?: string } | undefined;
    const body = JSON.parse(String(init?.body));
    expect(body.all_results_loaded).toBe(true);
    expect(body.max_configs).toBe(700);
    expect(body.load_strategy).toEqual(['sharpe']);
  });

  it('pareto-only mode resets ranges and state (:2859-2883)', async () => {
    const fetchMock = vi.fn(async () => ok({ mode: 'fast' }));
    vi.stubGlobal('fetch', fetchMock);
    const store = useParetoSession(makeDeps({ resultPath: '/r' }));
    store.state.allResultsLoaded = true;
    store.state.fullLoadPending = true;
    store.state.viewRange = { start: 0, end: 10, max: 10 };
    store.state.pendingViewRange = { start: 0, end: 10, max: 10 };
    store.loadParetoOnly();
    expect(store.state.allResultsLoaded).toBe(false);
    expect(store.state.fullLoadPending).toBe(false);
    expect(store.state.viewRange).toBeNull();
    expect(store.state.pendingViewRange).toBeNull();
    await Promise.resolve();
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body?: string } | undefined;
    const body = JSON.parse(String(init?.body));
    expect(body.all_results_loaded).toBe(false);
    expect(body.view_range).toBeNull();
  });

  it('pareto-only mode is a no-op when already fast (:2864-2867)', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const store = useParetoSession(makeDeps({ resultPath: '/r' }));
    store.loadParetoOnly();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.state.messages[0]?.text).toBe('Already using Passivbot pareto-only mode.');
  });
});

describe('route state (:1794-1804, :4123-4130, :4132-4164)', () => {
  it('selectStage updates the location query', () => {
    const store = useParetoSession(makeDeps());
    store.selectStage('settings');
    expect(store.state.stage).toBe('settings');
    expect(window.location.search).toContain('stage=settings');
    expect(window.location.search).toContain('deep_tab=parameters');
  });

  it('selectDeepTab updates deep_tab and keeps the stage', () => {
    const store = useParetoSession(makeDeps());
    store.selectStage('deep_intelligence');
    store.selectDeepTab('evolution');
    expect(store.state.deepTab).toBe('evolution');
    expect(window.location.search).toContain('stage=deep_intelligence');
    expect(window.location.search).toContain('deep_tab=evolution');
  });

  it('pushMessage prepends to the visible message list (:1928-1933)', () => {
    const store = useParetoSession(makeDeps());
    store.applySession({ result_valid: true, messages: [{ level: 'info', text: 'old' }] });
    store.pushMessage('error', 'new');
    expect(store.state.messages.map((m) => m.text)).toEqual(['new', 'old']);
  });
});

describe('session payload typing edge cases', () => {
  it('tolerates a null refresh_bundle and null load (:4512-4520)', () => {
    const store = useParetoSession(makeDeps());
    store.applyLoadData({ mode: 'fast', refresh_bundle: null });
    expect(store.state.commandCenter).toBeNull();
    expect(store.state.selectedConfigIndex).toBeNull();
    expect(store.state.selectedDetail).toBeNull();
    expect(store.state.playground.payload).toBeNull();
  });

  it('null load data clears the payload (:4510)', () => {
    const store = useParetoSession(makeDeps());
    store.applyLoadData(null);
    expect(store.state.loadPayload).toBeNull();
    expect(store.state.fullLoadPending).toBe(false);
  });
});

// keep the session type import referenced for the compiler
export type _SessionShape = ParetoSession;
