import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useParetoSession, type ParetoStore } from './useParetoSession';
import { useSurfaces } from './useSurfaces';
import { createI18n } from '@/shared/i18n';
import type { CommandCenterPayload, ConfigDetailPayload, LoadData, PlaygroundPayload, RefreshBundle } from '../types';

/*
 * The M-v7-6 render surfaces — ports of loadCommandCenterData
 * (:4028-4075), loadConfigDetail (:4077-4121) and loadPlayground
 * (:3395-3448) incl. resolveBackgroundLoadResponse (:4572-4586) and the
 * bootstrap hand-off (:4705-4715). Fetch order: command center → detail →
 * playground.
 */

const i18n = createI18n('en');
const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {});
const API_BASE = 'http://pbgui.test:8000/api/pareto-explorer';

const COMMAND_CENTER: CommandCenterPayload = {
  champions: [{ config_index: 4, style: 'momentum' }, { config_index: 9, style: 'revert' }],
  insights: [{ level: 'warning', text: 'near bounds' }],
};
const DETAIL: ConfigDetailPayload = { config_index: 4, full_config: { bot: {} } };
const PLAYGROUND: PlaygroundPayload = { counts: { configs: 40 }, viz_type: '2D Scatter', quick_view: 'Profit vs Risk' };

const fetchMock = vi.fn();

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

interface Call {
  url: string;
  body: Record<string, unknown>;
}

function calls(path: string): Call[] {
  return fetchMock.mock.calls
    .filter((c) => String(c[0]).includes(path))
    .map((c) => ({ url: String(c[0]), body: JSON.parse(String(c[1]?.body || '{}')) as Record<string, unknown> }));
}

function makeStore(): ParetoStore {
  const store = useParetoSession({ apiBase: API_BASE, origin: 'http://pbgui.test:8000', seedVersion: 'v7', resultPath: '/r', t });
  store.applySession({ result_valid: true, result: { name: 'run1' } });
  return store;
}

function makeSurfaces(store: ParetoStore) {
  return useSurfaces({ store, t });
}

function stubFetch(handlers: Record<string, (body: Record<string, unknown>) => unknown>): void {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    for (const [needle, handler] of Object.entries(handlers)) {
      if (u.includes(needle)) return ok(handler(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>));
    }
    return ok({});
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function flush(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/pareto-explorer/main_page?result_path=/r');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('bootstrap hand-off (:4705-4715)', () => {
  it('afterSession loads command center → first-champion detail → playground', async () => {
    stubFetch({
      '/command-center': () => COMMAND_CENTER,
      '/config-detail': () => ({ ok: true, detail: DETAIL }),
      '/playground': () => PLAYGROUND,
    });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    await surfaces.afterSession();
    await flush();
    expect(calls('/command-center')).toHaveLength(1);
    expect(calls('/config-detail')).toHaveLength(1);
    expect(calls('/config-detail')[0]!.body.config_index).toBe(4);
    expect(calls('/playground')).toHaveLength(1);
    expect(store.state.commandCenter).toEqual(COMMAND_CENTER);
    expect(store.state.selectedConfigIndex).toBe(4);
    expect(store.state.selectedDetail).toEqual(DETAIL);
    expect(store.state.playground.payload).toEqual(PLAYGROUND);
    expect(store.state.deepIntelligenceNeedsVisibleRender).toBe(true);
    surfaces.dispose();
  });

  it('re-selects the current config when one is already chosen (:4063-4066)', async () => {
    stubFetch({
      '/command-center': () => COMMAND_CENTER,
      '/config-detail': () => ({ ok: true, detail: DETAIL }),
      '/playground': () => PLAYGROUND,
    });
    const store = makeStore();
    store.state.selectedConfigIndex = 9;
    const surfaces = makeSurfaces(store);
    await surfaces.afterSession();
    await flush();
    expect(calls('/config-detail')[0]!.body.config_index).toBe(9);
    surfaces.dispose();
  });

  it('keeps champions loading even when the refresh bundle repeats them (:4538-4562)', async () => {
    const bundle: RefreshBundle = {
      command_center: COMMAND_CENTER,
      selected_config_index: 4,
      detail: DETAIL,
      playground: PLAYGROUND,
    };
    stubFetch({ '/load': () => ({ mode: 'fast', refresh_bundle: bundle }) });
    const store = makeStore();
    await store.loadParetoData();
    expect(store.state.commandCenter).toEqual(COMMAND_CENTER);
    expect(store.state.playground.payload).toEqual(PLAYGROUND);
    // no bundle → surfaces clear to their placeholders (:4513-4520)
    stubFetch({ '/load': () => ({ mode: 'fast' }) });
    await store.loadParetoData();
    expect(store.state.commandCenter).toBeNull();
    expect(store.state.selectedDetail).toBeNull();
    expect(store.state.playground.payload).toBeNull();
  });
});

describe('loadConfigDetail (:4077-4121)', () => {
  it('clears the visible detail while loading and chains the playground refresh', async () => {
    stubFetch({ '/config-detail': () => ({ ok: true, detail: DETAIL }), '/playground': () => PLAYGROUND });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    store.state.selectedDetail = { config_index: 1 } as ConfigDetailPayload;
    const pending = surfaces.loadConfigDetail(4);
    expect(store.state.selectedDetail).toBeNull(); // renderDetail(null) while loading
    expect(store.state.selectedConfigIndex).toBe(4);
    await pending;
    await flush();
    expect(store.state.selectedDetail).toEqual(DETAIL);
    expect(calls('/playground')).toHaveLength(1);
    expect(calls('/config-detail')[0]!.body).toMatchObject({ config_index: 4, perf_weight: 80, risk_weight: 60, robust_weight: 70 });
    surfaces.dispose();
  });

  it('skips the playground refresh when asked (:4114)', async () => {
    stubFetch({ '/config-detail': () => DETAIL });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    await surfaces.loadConfigDetail(4, { skipPlaygroundRefresh: true });
    await flush();
    expect(calls('/playground')).toHaveLength(0);
    surfaces.dispose();
  });

  it('does not fetch without a result path (:4082)', async () => {
    stubFetch({});
    const store = makeStore();
    store.state.resultPath = '';
    const surfaces = makeSurfaces(store);
    expect(await surfaces.loadConfigDetail(1)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    surfaces.dispose();
  });

  it('pushes an error message on failure and rethrows (:4116-4120)', async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string | URL) => {
      if (String(url).includes('/config-detail')) return Promise.resolve(new Response('nope', { status: 500 }));
      return ok({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    await expect(surfaces.loadConfigDetail(4)).rejects.toThrow('nope');
    expect(store.state.messages[0]!.text).toContain('Config detail load failed');
    surfaces.dispose();
  });
});

describe('loadPlayground (:3395-3448)', () => {
  it('echoes the payload selections into state (:3324-3329)', async () => {
    stubFetch({
      '/playground': () => ({
        viz_type: '3D Scatter',
        quick_view: 'Custom...',
        metrics: { x_metric: 'adg_w_usd', y_metric: 'sharpe', z_metric: 'cnc', color_metric: 'adg' },
        available_metrics: ['adg_w_usd', 'sharpe', 'cnc'],
      } as PlaygroundPayload),
    });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    await surfaces.loadPlayground();
    expect(store.state.playground.vizType).toBe('3D Scatter');
    expect(store.state.playground.quickView).toBe('Custom...');
    expect(store.state.playground.customXMetric).toBe('adg_w_usd');
    expect(store.state.playground.customZMetric).toBe('cnc');
    expect(store.state.playground.colorMetric).toBe('adg');
    surfaces.dispose();
  });

  it('follows the best match by selecting it and re-fetching the detail without a playground loop (:3358-3361)', async () => {
    stubFetch({
      '/playground': () => ({ best_match: { config_index: 21, score: 90 } }),
      '/config-detail': () => ({ ok: true, detail: DETAIL }),
    });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    await surfaces.loadPlayground({ followBestMatch: true });
    await flush();
    expect(store.state.selectedConfigIndex).toBe(21);
    expect(calls('/config-detail')).toHaveLength(1);
    expect(calls('/playground')).toHaveLength(1);
    surfaces.dispose();
  });

  it('loads the detail once when an unfollowed payload finds no selection (:3439-3442)', async () => {
    stubFetch({
      '/playground': () => ({ best_match: { config_index: 3 } }),
      '/config-detail': () => ({ ok: true, detail: DETAIL }),
    });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    await surfaces.loadPlayground();
    await flush();
    expect(calls('/config-detail')).toHaveLength(1);
    surfaces.dispose();
  });

  it('clears the payload when the server answers empty (:3314-3322)', async () => {
    stubFetch({ '/playground': () => null });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    store.state.playground.payload = PLAYGROUND;
    await surfaces.loadPlayground();
    expect(store.state.playground.payload).toBeNull();
    surfaces.dispose();
  });

  it('reports playground failures as messages (:3443-3447)', async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string | URL) => {
      if (String(url).includes('/playground')) return Promise.resolve(new Response('boom', { status: 500 }));
      return ok({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    await expect(surfaces.loadPlayground()).rejects.toThrow('boom');
    expect(store.state.messages[0]!.text).toContain('Playground load failed');
    surfaces.dispose();
  });
});

describe('background job responses (:4572-4586)', () => {
  it('polls the job, applies the bundle payload and returns the surface slice', async () => {
    let poll = 0;
    stubFetch({
      '/command-center': () => ({ status: 'loading', job: { job_id: 'job-1', progress: 10, message: 'scanning' } }),
      '/load-status': () => {
        poll += 1;
        if (poll < 2) return { status: 'loading', job: { job_id: 'job-1', progress: 60, message: 'still scanning' } };
        return {
          status: 'done',
          job: { job_id: 'job-1', progress: 100, message: 'ready' },
          payload: { mode: 'full', refresh_bundle: { command_center: COMMAND_CENTER } },
        };
      },
    });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    const data = await surfaces.loadCommandCenterData();
    expect(data).toEqual(COMMAND_CENTER);
    expect(store.state.loadPayload?.mode).toBe('full');
    expect(store.state.fullLoadPending).toBe(false);
    surfaces.dispose();
  });

  it('aborts a background follow when the request went stale (:4576, :4582)', async () => {
    stubFetch({
      '/playground': () => ({ status: 'loading', job: { job_id: 'job-2', progress: 10, message: 'scanning' } }),
      '/load-status': () => ({ status: 'done', job: { job_id: 'job-2', progress: 100 }, payload: { mode: 'full' } }),
    });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    const pending = surfaces.loadPlayground();
    store.generations.playground += 1; // a newer request supersedes mid-flight
    const data = await pending;
    expect(data).toBeNull();
    expect(store.state.loadPayload?.mode).toBeUndefined(); // applyLoadData never ran
    surfaces.dispose();
  });

  it('keeps polling (200ms) while a done status lacks its payload, then resolves (:2541-2546)', async () => {
    let poll = 0;
    stubFetch({
      '/command-center': () => ({ status: 'loading', job: { job_id: 'job-3', progress: 10, message: '' } }),
      '/load-status': () => {
        poll += 1;
        if (poll < 3) return { status: 'done', job: { job_id: 'job-3', progress: 100, message: 'finalizing' } };
        return { status: 'done', job: { job_id: 'job-3', progress: 100 }, payload: { mode: 'fast' } };
      },
    });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    const started = Date.now();
    const data = await surfaces.loadCommandCenterData();
    expect(data).toBeNull(); // refreshed bundle carries no command_center slice
    expect(poll).toBe(3);
    expect(Date.now() - started).toBeGreaterThanOrEqual(400); // two 200ms re-polls
    surfaces.dispose();
  });
});

describe('playground refresh scheduling (:2222-2231, :2833-2836, :2885-2888)', () => {
  it('debounces repeated settings changes into one follow-best-match load', async () => {
    vi.useFakeTimers();
    stubFetch({ '/playground': () => PLAYGROUND });
    const store = makeStore();
    const surfaces = makeSurfaces(store);
    surfaces.schedulePlaygroundRefresh();
    surfaces.schedulePlaygroundRefresh();
    surfaces.schedulePlaygroundRefresh();
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(130);
    expect(calls('/playground')).toHaveLength(1);
    expect(calls('/playground')[0]!.body.selected_config_index).toBeNull(); // followBestMatch
    surfaces.dispose();
    vi.useRealTimers();
  });

  it('refreshPlaygroundFromSettings / refreshPreviewFromSettings guard on the result path', async () => {
    stubFetch({});
    const store = makeStore();
    store.state.resultPath = '';
    const surfaces = makeSurfaces(store);
    surfaces.refreshPlaygroundFromSettings();
    surfaces.refreshPreviewFromSettings();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    surfaces.dispose();
  });
});

describe('max_configs fallback (M-v7-5 handoff 1)', () => {
  it('sends DEFAULT_MAX_CONFIGS when the settings input was cleared', async () => {
    stubFetch({ '/command-center': () => COMMAND_CENTER, '/config-detail': () => ({ ok: true, detail: DETAIL }), '/playground': () => PLAYGROUND });
    const store = makeStore();
    store.state.maxConfigs = '' as unknown as number;
    const surfaces = makeSurfaces(store);
    await surfaces.loadCommandCenterData();
    expect(calls('/command-center')[0]!.body.max_configs).toBe(2000);
    surfaces.dispose();
  });
});
