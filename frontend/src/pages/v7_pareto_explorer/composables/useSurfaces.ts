import { serverMsg } from '@/shared/i18n';
import { apiFetch } from '../lib/api';
import {
  commandCenterRequestBody,
  configDetailRequestBody,
  playgroundRequestBody,
  type SurfaceRequestSource,
} from '../lib/surfaceRequests';
import type {
  CommandCenterPayload,
  ConfigDetailPayload,
  LoadData,
  PlaygroundPayload,
  RefreshBundle,
  Translate,
} from '../types';
import type { ParetoStore } from './useParetoSession';

/**
 * The M-v7-6 render surfaces — ports of loadCommandCenterData (:4028-4075),
 * loadConfigDetail (:4077-4121), loadPlayground (:3395-3448) incl.
 * renderPlayground's state layer (:3300-3330), resolveBackgroundLoadResponse
 * (:4572-4586), the refresh scheduling (:2222-2231, :2833-2836, :2885-2888)
 * and the bootstrap hand-off (:4705-4715). The deep-intelligence chain and
 * preset handoffs land in M-v7-7.
 *
 * Fetch order on boot: command center → config detail → playground (the
 * detail load chains the playground refresh unless skipped).
 */

export interface SurfacesDeps {
  store: ParetoStore;
  t: Translate;
}

interface SurfaceLoadOptions {
  skipPlaygroundRefresh?: boolean;
}

interface FollowBestMatchOptions {
  followBestMatch?: boolean;
}

/** /config-detail answers {ok, view_range, detail} (pareto_explorer.py:3521-3525). */
type DetailResponse = { ok: boolean; detail: ConfigDetailPayload | null };

const PLAYGROUND_REFRESH_DELAY_MS = 120;

export function useSurfaces(deps: SurfacesDeps) {
  const { store, t } = deps;
  const state = store.state;
  const generations = store.generations;
  const progress = store.progress;

  let playgroundRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  /** The shared request-source snapshot (max_configs fallback = handoff 1). */
  function surfaceSource(): SurfaceRequestSource {
    return {
      resultPath: state.resultPath,
      loadStrategy: state.loadStrategy,
      maxConfigs: store.effectiveMaxConfigs(),
      allResultsLoaded: state.allResultsLoaded,
      viewRange: state.viewRange,
      pendingViewRange: state.pendingViewRange,
    };
  }

  /**
   * resolveBackgroundLoadResponse (:4572-4586): a surface POST may answer
   * with a background job; polling refreshes the whole page state, then the
   * caller gets its slice of the refreshed bundle.
   */
  async function resolveBackgroundLoadResponse<T>(
    data: T,
    extract: (payload: LoadData) => T | null,
    isCurrent: () => boolean
  ): Promise<T | null> {
    const pending = data as { status?: string; job?: { job_id?: string; message?: string; progress?: number } | null };
    if (!(pending && pending.status === 'loading' && pending.job && pending.job.job_id)) {
      return data;
    }
    if (!isCurrent()) return null;
    state.fullLoadJobId = pending.job.job_id;
    progress.setFullLoadStatus(
      'loading',
      serverMsg(pending.job.message || '') || t('v7explore.scanningFullStream'),
      pending.job.progress || 0
    );
    const statusData = await progress.pollFullLoadStatus(pending.job.job_id);
    const payload = statusData && statusData.payload ? statusData.payload : null;
    if (!payload) throw new Error(t('v7explore.fullLoadNoPayload'));
    if (!isCurrent()) return null;
    store.applyLoadData(payload);
    return extract(payload);
  }

  /** loadCommandCenterData (:4028-4075). */
  async function loadCommandCenterData(options: SurfaceLoadOptions = {}): Promise<CommandCenterPayload | null> {
    if (!state.resultPath) return null;
    const requestSeq = ++generations.commandCenter;
    const contextGeneration = generations.resultContext;
    const resultPath = state.resultPath;
    const isCurrent = () => requestSeq === generations.commandCenter && contextGeneration === generations.resultContext && resultPath === state.resultPath;
    try {
      const data = await apiFetch<CommandCenterPayload>(store.apiBase, '/command-center', {
        method: 'POST',
        body: JSON.stringify(commandCenterRequestBody(surfaceSource())),
      });
      const resolved = await resolveBackgroundLoadResponse<CommandCenterPayload>(
        data,
        (payload) => (payload.refresh_bundle ? payload.refresh_bundle.command_center || null : null),
        isCurrent
      );
      if (!isCurrent()) return resolved;
      state.commandCenter = resolved || null;
      const champions = resolved && Array.isArray(resolved.champions) ? resolved.champions : [];
      if (champions.length && state.selectedConfigIndex == null) {
        if (state.fullLoadPending) progress.updateFullLoadPhase('command_center_detail');
        await loadConfigDetail(champions[0]!.config_index ?? 0, { skipPlaygroundRefresh: !!options.skipPlaygroundRefresh });
        return resolved;
      }
      if (champions.length && state.selectedConfigIndex != null) {
        if (state.fullLoadPending) progress.updateFullLoadPhase('command_center_detail');
        await loadConfigDetail(state.selectedConfigIndex, { skipPlaygroundRefresh: !!options.skipPlaygroundRefresh });
        return resolved;
      }
      state.selectedConfigIndex = null;
      return resolved;
    } catch (err) {
      if (!isCurrent()) return null;
      store.pushMessage('error', t('v7explore.commandCenterLoadFailed', { error: serverMsg((err as Error).message) }));
      throw err;
    }
  }

  /** loadConfigDetail (:4077-4121). */
  async function loadConfigDetail(configIndex: number, options: SurfaceLoadOptions = {}): Promise<DetailResponse | null> {
    const requestSeq = ++generations.detail;
    if (!state.resultPath) return null;
    generations.presetPreview += 1;
    const resultPath = state.resultPath;
    const contextGeneration = generations.resultContext;
    state.selectedConfigIndex = configIndex;
    state.selectedDetail = null; // renderDetail(null) while loading (:4087)
    const isCurrent = () => requestSeq === generations.detail && contextGeneration === generations.resultContext && resultPath === state.resultPath;
    try {
      const data = await apiFetch<DetailResponse>(store.apiBase, '/config-detail', {
        method: 'POST',
        body: JSON.stringify(
          configDetailRequestBody(surfaceSource(), {
            configIndex,
            perfWeight: state.playground.perfWeight,
            riskWeight: state.playground.riskWeight,
            robustWeight: state.playground.robustWeight,
          })
        ),
      });
      const resolved = await resolveBackgroundLoadResponse<DetailResponse>(
        data,
        (payload) => ({ ok: true, detail: payload.refresh_bundle ? payload.refresh_bundle.detail || null : null }),
        isCurrent
      );
      if (!isCurrent()) return resolved;
      state.selectedDetail = resolved && resolved.detail ? resolved.detail : null;
      if (options.skipPlaygroundRefresh) return resolved;
      await loadPlayground();
      return resolved;
    } catch (err) {
      if (!isCurrent()) return null;
      store.pushMessage('error', t('v7explore.configDetailLoadFailed', { error: serverMsg((err as Error).message) }));
      throw err;
    }
  }

  /** renderPlayground's state layer (:3300-3330) — components derive the rest. */
  function applyPlaygroundPayload(payload: PlaygroundPayload | null, options: FollowBestMatchOptions = {}): void {
    state.playground.payload = payload || null;
    if (!payload) return;
    state.playground.vizType = payload.viz_type || state.playground.vizType;
    state.playground.quickView = payload.quick_view || state.playground.quickView;
    const metrics = payload.metrics || {};
    state.playground.customXMetric = metrics.x_metric || state.playground.customXMetric || '';
    state.playground.customYMetric = metrics.y_metric || state.playground.customYMetric || '';
    state.playground.customZMetric = metrics.z_metric || state.playground.customZMetric || '';
    state.playground.colorMetric = metrics.color_metric || state.playground.colorMetric || 'None';
    const followBestMatch = !!options.followBestMatch;
    if (followBestMatch && payload.best_match && payload.best_match.config_index != null && state.selectedConfigIndex !== payload.best_match.config_index) {
      state.selectedConfigIndex = payload.best_match.config_index;
      void loadConfigDetail(payload.best_match.config_index, { skipPlaygroundRefresh: true }).catch(() => {});
    }
  }

  /** loadPlayground (:3395-3448). */
  async function loadPlayground(options: FollowBestMatchOptions = {}): Promise<PlaygroundPayload | null> {
    const followBestMatch = !!options.followBestMatch;
    const requestSeq = ++generations.playground;
    if (!state.resultPath) return null;
    const contextGeneration = generations.resultContext;
    const resultPath = state.resultPath;
    const isCurrent = () => requestSeq === generations.playground && contextGeneration === generations.resultContext && resultPath === state.resultPath;
    try {
      const data = await apiFetch<PlaygroundPayload>(store.apiBase, '/playground', {
        method: 'POST',
        body: JSON.stringify(
          playgroundRequestBody(
            surfaceSource(),
            {
            perfWeight: state.playground.perfWeight,
            riskWeight: state.playground.riskWeight,
            robustWeight: state.playground.robustWeight,
            showAll: state.playground.showAll,
            useWeighted: state.playground.useWeighted,
            useBtc: state.playground.useBtc,
            vizType: state.playground.vizType,
            quickView: state.playground.quickView,
            colorMetric: state.playground.colorMetric,
            customXMetric: state.playground.customXMetric,
            customYMetric: state.playground.customYMetric,
            customZMetric: state.playground.customZMetric,
            },
            {
              followBestMatch,
              selectedConfigIndex: state.selectedConfigIndex,
              previewUseWeighted: state.previewUseWeighted,
              previewShowAll: state.previewShowAll,
            }
          )
        ),
      });
      const resolved = await resolveBackgroundLoadResponse<PlaygroundPayload>(
        data,
        (payload) => (payload.refresh_bundle ? payload.refresh_bundle.playground || null : null),
        isCurrent
      );
      if (!isCurrent()) return resolved;
      applyPlaygroundPayload(resolved, { followBestMatch });
      if (!followBestMatch && resolved && resolved.best_match && resolved.best_match.config_index != null && state.selectedConfigIndex == null) {
        await loadConfigDetail(resolved.best_match.config_index);
        return resolved;
      }
      return resolved;
    } catch (err) {
      if (!isCurrent()) return null;
      store.pushMessage('error', t('v7explore.playgroundLoadFailed', { error: serverMsg((err as Error).message) }));
      throw err;
    }
  }

  /** schedulePlaygroundRefresh (:2222-2231) — 120 ms debounce. */
  function schedulePlaygroundRefresh(delayMs: number | null = null): void {
    if (playgroundRefreshTimer) {
      clearTimeout(playgroundRefreshTimer);
      playgroundRefreshTimer = null;
    }
    playgroundRefreshTimer = setTimeout(() => {
      playgroundRefreshTimer = null;
      void loadPlayground({ followBestMatch: true }).catch(() => {});
    }, delayMs == null ? PLAYGROUND_REFRESH_DELAY_MS : delayMs);
  }

  /** refreshPlaygroundFromSettings (:2833-2836). */
  function refreshPlaygroundFromSettings(): void {
    if (!state.resultPath) return;
    void loadPlayground({ followBestMatch: true }).catch(() => {});
  }

  /** refreshPreviewFromSettings (:2885-2888). */
  function refreshPreviewFromSettings(): void {
    if (!state.resultPath) return;
    void loadPlayground().catch(() => {});
  }

  /**
   * bootstrapSession's tail (:4705-4715): command center chain, then the
   * deep-intelligence refresh when its stage is open (M-v7-7) and the
   * deferred-render flag otherwise.
   */
  async function afterSession(): Promise<void> {
    const bootstrapSeq = generations.bootstrapRequest;
    await loadCommandCenterData();
    if (bootstrapSeq !== generations.bootstrapRequest) return;
    if (state.stage === 'deep_intelligence') {
      // M-v7-7 lands refreshDeepIntelligence() here; the deep tabs still
      // render their placeholders until then.
    }
    state.deepIntelligenceNeedsVisibleRender = !!state.resultPath;
  }

  function dispose(): void {
    if (playgroundRefreshTimer) {
      clearTimeout(playgroundRefreshTimer);
      playgroundRefreshTimer = null;
    }
  }

  return {
    loadCommandCenterData,
    loadConfigDetail,
    loadPlayground,
    applyPlaygroundPayload,
    schedulePlaygroundRefresh,
    refreshPlaygroundFromSettings,
    refreshPreviewFromSettings,
    afterSession,
    dispose,
  };
}

export type Surfaces = ReturnType<typeof useSurfaces>;

/** RefreshBundle re-export for consumers that read the bundle slice. */
export type { RefreshBundle };
