import { computed, reactive, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import { DEFAULT_MAX_CONFIGS, buildLocationUrl } from '../config';
import type { RouteState } from '../config';
import { apiFetch } from '../lib/api';
import { buildLoadRequestBody } from '../lib/loadRequest';
import { backToOptimizeResultsUrl, backtestApiBase, optimizeApiBase, strategyExplorerApiBase } from '../lib/paretoUrls';
import { currentRangeMax, normalizeViewRange } from '../lib/viewRange';
import type {
  CommandCenterPayload,
  ConfigDetailPayload,
  DeepTab,
  LoadData,
  OptimizeVersion,
  ParetoSession,
  ParetoStage,
  PlaygroundSettings,
  StrategyCompareBaseline,
  Translate,
  ViewRange,
} from '../types';
import { useLoadProgress } from './useLoadProgress';

/**
 * Pareto Explorer session + load store — ports of the legacy `state` var
 * (:1656-1738), optimizeVersion() (:1765-1768), syncStrategyExplorerActions
 * (:1772-1780), renderSession's state layer (:3895-3984), applyLoadData
 * (:4502-4570), loadParetoData (:4588-4691), bootstrapSession (:4693-4726)
 * and the sidebar scan actions (:2838-2883).
 *
 * M-v7-6/7 extend this store with the render surfaces (command center,
 * detail, playground charts, deep intelligence) via `afterSessionApplied`
 * and the seq counters below.
 */

export interface ParetoSessionDeps {
  apiBase: string;
  origin: string;
  /** Legacy %%OPTIMIZE_VERSION%% — the seed only; results override it. */
  seedVersion: OptimizeVersion;
  resultPath: string;
  t: Translate;
  route?: RouteState;
  /** Post-session hook — M-v7-6's command-center refresh chain. */
  afterSessionApplied?: (data: ParetoSession) => void | Promise<void>;
}

export interface ParetoState {
  stage: ParetoStage;
  deepTab: DeepTab;
  /** The applied result path (state.resultPath, :1659/:4614). */
  resultPath: string;
  /** The settings-stage input value (el('result-path-input'), :4603). */
  resultPathInput: string;
  session: ParetoSession | null;
  /** Sidebar-scan transient mode-chip text (:2852-2853, :2878-2879). */
  modeChipOverride: string | null;
  loadStrategy: string[];
  maxConfigs: number;
  allResultsLoaded: boolean;
  fullLoadPending: boolean;
  fullLoadJobId: string;
  viewRange: ViewRange | null;
  pendingViewRange: ViewRange | null;
  loadPayload: LoadData | null;
  commandCenter: CommandCenterPayload | null;
  selectedConfigIndex: number | null;
  selectedDetail: ConfigDetailPayload | null;
  /** True while loadConfigDetail is in flight — lets ConfigDetail say
   *  "loading" instead of the misleading "select a champion" placeholder. */
  detailLoading: boolean;
  strategyCompareBaseline: StrategyCompareBaseline | null;
  persistDefaults: boolean;
  previewUseWeighted: boolean;
  previewShowAll: boolean;
  deepParametersTopN: number;
  deepScenariosMetric: string;
  deepEvolutionMetric: string;
  deepEvolutionShowAll: boolean;
  deepEvolutionHideOutliers: boolean;
  deepEvolutionUseWeighted: boolean;
  deepEvolutionUseBtc: boolean;
  deepEvolutionWindowPercent: number;
  deepEvolutionImprovementThresholdPct: number;
  deepCorrelationsStrategy: string;
  deepCorrelationsNumConfigs: number;
  deepCorrelationsUseWeighted: boolean;
  deepCorrelationsUseBtc: boolean;
  deepIntelligenceNeedsVisibleRender: boolean;
  messages: { level: string; text: string }[];
  playground: PlaygroundSettings;
}

/** Request-generation counters (:1672-1683, bumps at :4503-4506/:4593-4602). */
export interface ParetoGenerations {
  loadRequest: number;
  bootstrapRequest: number;
  resultContext: number;
  commandCenter: number;
  playground: number;
  detail: number;
  deepParameters: number;
  deepScenarios: number;
  deepEvolution: number;
  deepCorrelations: number;
  presetPreview: number;
}

export function useParetoSession(deps: ParetoSessionDeps) {
  const { apiBase, origin, t } = deps;

  const optimizeVersion = ref<OptimizeVersion>(deps.seedVersion);
  const isV8: ComputedRef<boolean> = computed(() => optimizeVersion.value === 'v8');

  const state = reactive<ParetoState>({
    stage: deps.route?.stage ?? 'command_center',
    deepTab: deps.route?.deepTab ?? 'parameters',
    resultPath: deps.resultPath,
    resultPathInput: deps.resultPath,
    session: null,
    modeChipOverride: null,
    loadStrategy: ['performance', 'robustness', 'sharpe', 'coverage'],
    maxConfigs: DEFAULT_MAX_CONFIGS,
    allResultsLoaded: false,
    fullLoadPending: false,
    fullLoadJobId: '',
    viewRange: null,
    pendingViewRange: null,
    loadPayload: null,
    commandCenter: null,
    selectedConfigIndex: null,
    selectedDetail: null,
    detailLoading: false,
    strategyCompareBaseline: null,
    persistDefaults: true,
    previewUseWeighted: true,
    previewShowAll: false,
    deepParametersTopN: 20,
    deepScenariosMetric: '',
    deepEvolutionMetric: '',
    deepEvolutionShowAll: false,
    deepEvolutionHideOutliers: true,
    deepEvolutionUseWeighted: true,
    deepEvolutionUseBtc: false,
    deepEvolutionWindowPercent: 5,
    deepEvolutionImprovementThresholdPct: 1,
    deepCorrelationsStrategy: 'Top Performers',
    deepCorrelationsNumConfigs: 5,
    deepCorrelationsUseWeighted: true,
    deepCorrelationsUseBtc: false,
    deepIntelligenceNeedsVisibleRender: false,
    messages: [],
    playground: {
      perfWeight: 80,
      riskWeight: 60,
      robustWeight: 70,
      showAll: false,
      useWeighted: true,
      useBtc: false,
      vizType: '2D Scatter',
      quickView: 'Profit vs Risk',
      allowMixedWeighted: false,
      allowMixedCurrency: false,
      customXMetric: '',
      customYMetric: '',
      customZMetric: '',
      projectionLayout: 'stacked',
      colorMetric: 'None',
      payload: null,
    },
  });

  const generations: ParetoGenerations = {
    loadRequest: 0,
    bootstrapRequest: 0,
    resultContext: 0,
    commandCenter: 0,
    playground: 0,
    detail: 0,
    deepParameters: 0,
    deepScenarios: 0,
    deepEvolution: 0,
    deepCorrelations: 0,
    presetPreview: 0,
  };

  /**
   * The max_configs request value — a cleared settings input would otherwise
   * send "" and 422 (:4616 parseInt || 2000; M-v7-5 handoff 1).
   */
  function effectiveMaxConfigs(): number {
    return state.maxConfigs || DEFAULT_MAX_CONFIGS;
  }

  function bumpResultContext(): void {
    generations.detail += 1;
    generations.playground += 1;
    generations.commandCenter += 1;
    generations.presetPreview += 1;
  }

  const progress = useLoadProgress({
    t,
    loadStatus: (path, init) => apiFetch<never>(apiBase, path, init),
    isFullLoadPending: () => state.fullLoadPending,
    ownsJob: (jobId) => state.fullLoadJobId === jobId,
    currentJobId: () => state.fullLoadJobId,
    releaseJob: () => {
      state.fullLoadPending = false;
      state.fullLoadJobId = '';
    },
  });

  /**
   * optimizeVersion() (:1765-1768): result > session > current > 'v7',
   * re-resolved on every session apply — the runtime flavor (R3).
   */
  function version(): OptimizeVersion {
    const session = state.session;
    const sessionVersion = session && session.optimize_version;
    const resultVersion = session && session.result && session.result.optimize_version;
    const raw = String(resultVersion || sessionVersion || optimizeVersion.value || 'v7');
    optimizeVersion.value = raw.trim().toLowerCase() === 'v8' ? 'v8' : 'v7';
    return optimizeVersion.value;
  }

  /** Cross-page bases read the resolved version at call time (:1783-1791). */
  const urlFor = {
    optimize: () => optimizeApiBase(version(), origin),
    backtest: () => backtestApiBase(version(), origin),
    strategyExplorer: () => strategyExplorerApiBase(version(), origin),
    backToOptimize: () => backToOptimizeResultsUrl(version(), origin),
  };

  /** syncStrategyExplorerActions (:1772-1780) — v8-only compare gate. */
  function syncStrategyExplorerActions(): void {
    const v8 = version() === 'v8';
    if (!v8) state.strategyCompareBaseline = null;
  }

  /** pushMessage (:1928-1933). */
  function pushMessage(level: string, text: string): void {
    const current = state.session && Array.isArray(state.session.messages) ? state.session.messages.slice() : [];
    current.unshift({ level, text });
    if (state.session) state.session.messages = current;
    state.messages = current;
  }

  /** syncViewRangeFromLoad (:2331-2345). */
  function syncViewRangeFromLoad(load: LoadData | null): void {
    if (!state.allResultsLoaded) {
      state.viewRange = null;
      state.pendingViewRange = null;
      return;
    }
    const total = currentRangeMax(load);
    if (load && load.view_range) {
      state.viewRange = normalizeViewRange(load.view_range, total, true);
      state.pendingViewRange = state.viewRange ? { ...state.viewRange } : null;
      return;
    }
    state.viewRange = normalizeViewRange(state.pendingViewRange || state.viewRange, total, true);
    state.pendingViewRange = state.viewRange ? { ...state.viewRange } : null;
  }

  /**
   * renderSession's state layer (:3895-3984): flavor resolution, defaults
   * absorption, load payload + view range, full-load status, messages.
   * Metric/chip text lives in App.vue computeds; the deep surfaces land in
   * M-v7-6/7.
   */
  function applySession(data: ParetoSession | null): void {
    state.session = data || null;
    state.modeChipOverride = null;
    syncStrategyExplorerActions();
    const load = data && data.load ? data.load : null;
    const defaults = data && data.defaults ? data.defaults : null;

    if (defaults) {
      if (Array.isArray(defaults.load_strategy)) state.loadStrategy = defaults.load_strategy.slice();
      state.maxConfigs = defaults.max_configs || state.maxConfigs;
      state.allResultsLoaded = !!defaults.all_results_loaded;
      if (Object.prototype.hasOwnProperty.call(defaults, 'preview_show_all')) {
        state.previewShowAll = !!defaults.preview_show_all;
      }
    }
    if (load) state.loadPayload = load;
    syncViewRangeFromLoad(load);
    // syncFormState (:1936): the settings input mirrors the applied path
    state.resultPathInput = state.resultPath;

    const result = data && data.result ? data.result : null;
    const valid = !!(data && data.result_valid);
    if (!valid) {
      progress.setFullLoadStatus('error', t('v7explore.noValidResultPath'), 0);
    } else if (state.fullLoadPending) {
      progress.setFullLoadStatus('loading', t('v7explore.scanningFullStream'), Math.max(0, progress.fullLoad.target || 0));
    } else if (load && load.mode === 'full') {
      progress.setFullLoadStatus('loaded', fullScanReadyText(load, result), 100);
    } else {
      progress.setFullLoadStatus('idle', t('v7explore.usingFastMode'), 0);
    }

    state.messages = data && data.messages ? data.messages : [];
  }

  /** The full-scan ready status text (:3970-3975). */
  function fullScanReadyText(load: LoadData, result: { pareto_count?: number | null } | null): string {
    const summary = load.summary || {};
    const stats = load.load_stats || {};
    const selectedResults = summary.selected_configs ?? null;
    const scannedResults = summary.scanned_configs ?? (stats.total_parsed ?? null);
    const totalParetos = summary.pareto_configs ?? (stats.pareto_configs ?? null);
    const visibleEnd = load.view_range && load.view_range.end != null ? load.view_range.end : null;
    const visibleSuffix =
      visibleEnd != null && selectedResults != null ? ' (' + String(visibleEnd) + '/' + String(selectedResults) + ' visible in the current window).' : '.';
    const cacheSummary = scanCacheSuffix(stats.scan_cache || '');
    void result;
    return (
      t('v7explore.fullScanReady', {
        selected: selectedResults == null ? '-' : selectedResults,
        scanned: scannedResults == null ? '-' : scannedResults,
        paretos: totalParetos == null ? '-' : totalParetos,
        visibleSuffix,
      }) + cacheSummary
    );
  }

  function scanCacheSuffix(scanCache: string): string {
    if (scanCache === 'hit') return ' ' + t('v7explore.scanCacheHit');
    if (scanCache === 'built') return ' ' + t('v7explore.scanCacheBuilt');
    return '';
  }

  /** updateLocationState (:4123-4130). */
  function updateLocation(): void {
    try {
      history.replaceState(null, '', buildLocationUrl(window.location.href, state.resultPath, state.stage, state.deepTab));
    } catch {
      // jsdom / blocked-history safety: location sync is best-effort
    }
  }

  /** selectStage (:4132-4160) — stage + deep render hooks land in M-v7-6/7. */
  function selectStage(stage: ParetoStage): void {
    state.stage = stage;
    updateLocation();
  }

  /** selectDeepTab (:4162-4164). */
  function selectDeepTab(tab: DeepTab): void {
    state.deepTab = tab;
    updateLocation();
  }

  /**
   * applyLoadData (:4502-4570) state layer: seq bumps, cache-restore status,
   * payload + view range, refresh-bundle extraction, session echo.
   */
  function applyLoadData(data: LoadData | null): LoadData | null {
    bumpResultContext();
    if (state.allResultsLoaded && data && data.cache_hit) {
      progress.setFullLoadStatus('loaded', t('v7explore.fullResultRestoredFromCache'), 100);
    }
    state.loadPayload = data || null;
    syncViewRangeFromLoad(data);
    const bundle = data && data.refresh_bundle ? data.refresh_bundle : null;
    state.commandCenter = bundle && bundle.command_center ? bundle.command_center : null;
    state.selectedConfigIndex = bundle && bundle.selected_config_index != null ? bundle.selected_config_index : null;
    state.selectedDetail = bundle && bundle.detail ? bundle.detail : null;
    state.playground.payload = bundle && bundle.playground ? bundle.playground : null;
    if (bundle && bundle.deep_intelligence && bundle.deep_intelligence.tab) {
      state.deepTab = (bundle.deep_intelligence.tab || state.deepTab) as DeepTab;
    }
    const sessionLike: ParetoSession = {
      ...(state.session || {}),
      result: data && data.result ? (data.result as ParetoSession['result']) : null,
      result_valid: !!(data && data.result),
      result_path: state.resultPath,
      load: data,
      defaults: {
        stage: state.stage,
        deep_tab: state.deepTab,
        all_results_loaded: state.allResultsLoaded,
        load_strategy: state.loadStrategy.slice(),
        max_configs: state.maxConfigs,
        preview_show_all: state.previewShowAll,
        show_timings: false,
      },
      messages: data && data.messages ? data.messages : [],
    };
    applySession(sessionLike);
    state.fullLoadPending = false;
    if (state.allResultsLoaded) progress.updateFullLoadPhase('complete');
    progress.stopFullLoadAnimation();
    return data;
  }

  /**
   * loadParetoData (:4588-4691): POST /load with the full settings body,
   * follow the background job when full mode is on, guard every apply with
   * the load-request seq. (The legacy `options.forceSynchronous` argument
   * was never read — dropped.)
   */
  async function loadParetoData(): Promise<LoadData | null> {
    const seq = ++generations.loadRequest;
    state.fullLoadJobId = '';
    generations.bootstrapRequest += 1;
    generations.resultContext += 1;
    bumpResultContext();
    generations.deepParameters += 1;
    generations.deepScenarios += 1;
    generations.deepEvolution += 1;
    generations.deepCorrelations += 1;

    // path-change reset (:4603-4613): the settings-stage input is the source
    // of truth; a changed path drops the selection and a stale baseline
    const nextResultPath = String(state.resultPathInput || '').trim();
    if (nextResultPath !== state.resultPath) {
      generations.detail += 1;
      state.selectedConfigIndex = null;
      state.detailLoading = false;
      if (state.strategyCompareBaseline && state.strategyCompareBaseline.result_path !== nextResultPath) {
        state.strategyCompareBaseline = null;
      }
    }
    state.resultPath = nextResultPath;
    if (!state.allResultsLoaded) {
      state.viewRange = null;
      state.pendingViewRange = null;
    }

    try {
      let data = await apiFetch<LoadData>(apiBase, '/load', {
        method: 'POST',
        body: JSON.stringify(buildLoadRequestBody(loadRequestSource())),
      });
      if (state.allResultsLoaded && data && data.status === 'loading' && data.job && data.job.job_id) {
        state.fullLoadJobId = data.job.job_id;
        progress.setFullLoadStatus(
          'loading',
          serverMsg(data.job.message || '') || t('v7explore.scanningFullStream'),
          data.job.progress || 0
        );
        const statusData = await progress.pollFullLoadStatus(data.job.job_id);
        if (seq !== generations.loadRequest) return null;
        const payload = statusData && statusData.payload ? statusData.payload : null;
        if (!payload) throw new Error(t('v7explore.fullLoadNoPayload'));
        data = payload;
      }
      if (seq !== generations.loadRequest) return data;
      return applyLoadData(data);
    } catch (err) {
      if (seq !== generations.loadRequest) return null;
      if (state.fullLoadPending || state.allResultsLoaded) {
        progress.setFullLoadStatus('error', t('v7explore.fullLoadFailedDetail', { error: serverMsg((err as Error).message) }), 0);
      }
      state.fullLoadPending = false;
      state.fullLoadJobId = '';
      progress.stopFullLoadAnimation();
      pushMessage('error', t('v7explore.loadFailed', { error: serverMsg((err as Error).message) }));
      throw err;
    }
  }

  /** The /load body source read from state (:4603-4617 form echo). */
  function loadRequestSource() {
    return {
      resultPath: state.resultPath,
      loadStrategy: state.loadStrategy,
      maxConfigs: effectiveMaxConfigs(),
      allResultsLoaded: state.allResultsLoaded,
      persistDefaults: state.persistDefaults,
      viewRange: state.viewRange,
      pendingViewRange: state.pendingViewRange,
      selectedConfigIndex: state.selectedConfigIndex,
      playground: state.playground,
      previewUseWeighted: state.previewUseWeighted,
      previewShowAll: state.previewShowAll,
      deepTab: state.deepTab,
      deepParametersTopN: state.deepParametersTopN,
      deepScenariosMetric: state.deepScenariosMetric,
      deepEvolutionMetric: state.deepEvolutionMetric,
      deepEvolutionShowAll: state.deepEvolutionShowAll,
      deepEvolutionHideOutliers: state.deepEvolutionHideOutliers,
      deepEvolutionUseWeighted: state.deepEvolutionUseWeighted,
      deepEvolutionUseBtc: state.deepEvolutionUseBtc,
      deepEvolutionWindowPercent: state.deepEvolutionWindowPercent,
      deepEvolutionImprovementThresholdPct: state.deepEvolutionImprovementThresholdPct,
      deepCorrelationsStrategy: state.deepCorrelationsStrategy,
      deepCorrelationsNumConfigs: state.deepCorrelationsNumConfigs,
      deepCorrelationsUseWeighted: state.deepCorrelationsUseWeighted,
      deepCorrelationsUseBtc: state.deepCorrelationsUseBtc,
    };
  }

  /**
   * bootstrapSession (:4693-4726): GET /session, guard with the bootstrap
   * seq + result context + path, apply, sync location, then hand off to the
   * command-center chain (M-v7-6 hook).
   */
  async function bootstrapSession(): Promise<ParetoSession | null> {
    const requestSeq = ++generations.bootstrapRequest;
    const contextGeneration = generations.resultContext;
    const resultPath = state.resultPath;
    const query = '?result_path=' + encodeURIComponent(resultPath || '') + '&optimize_version=' + encodeURIComponent(version());
    try {
      const data = await apiFetch<ParetoSession>(apiBase, '/session' + query);
      if (requestSeq !== generations.bootstrapRequest || contextGeneration !== generations.resultContext || resultPath !== state.resultPath) {
        return null;
      }
      applySession(data);
      selectStage(state.stage);
      updateLocation();
      await deps.afterSessionApplied?.(data);
      return data;
    } catch (err) {
      if (requestSeq !== generations.bootstrapRequest || contextGeneration !== generations.resultContext || resultPath !== state.resultPath) {
        return null;
      }
      applySession({
        result_valid: false,
        result: null,
        load: null,
        defaults: null,
        messages: [{ level: 'error', text: t('v7explore.bootstrapFailed', { error: serverMsg((err as Error).message) }) }],
      });
      return null;
    }
  }

  /** Scan all_results sidebar action (:2838-2857). */
  function loadAllResults(): void {
    if (!state.resultPath) {
      pushMessage('error', t('v7explore.noResultPathYet'));
      return;
    }
    state.fullLoadPending = true;
    state.fullLoadJobId = '';
    state.allResultsLoaded = true;
    state.modeChipOverride = t('v7explore.loadingFullResult');
    progress.setFullLoadStatus('loading', t('v7explore.startingFullLoad'), 0);
    pushMessage('info', t('v7explore.scanningAllResultsHint'));
    void loadParetoData().catch(() => {});
  }

  /** Show Passivbot Paretos sidebar action (:2859-2883). */
  function loadParetoOnly(): void {
    if (!state.resultPath) {
      pushMessage('error', t('v7explore.noResultPathYet'));
      return;
    }
    if (!state.allResultsLoaded && !state.fullLoadPending) {
      pushMessage('info', t('v7explore.alreadyParetoOnly'));
      return;
    }
    state.fullLoadPending = false;
    state.fullLoadJobId = '';
    generations.loadRequest += 1;
    progress.stopFullLoadAnimation();
    state.modeChipOverride = t('v7explore.switchingToFastMode');
    state.allResultsLoaded = false;
    state.viewRange = null;
    state.pendingViewRange = null;
    progress.setFullLoadStatus('idle', t('v7explore.switchingBackParetoOnly'), 0);
    pushMessage('info', t('v7explore.switchingBackParetoOnlyHint'));
    void loadParetoData().catch(() => {});
  }

  function dispose(): void {
    progress.dispose();
  }

  return {
    state,
    generations,
    progress,
    apiBase,
    effectiveMaxConfigs,
    optimizeVersion,
    isV8,
    version,
    urlFor,
    applySession,
    applyLoadData,
    bootstrapSession,
    loadParetoData,
    loadAllResults,
    loadParetoOnly,
    pushMessage,
    selectStage,
    selectDeepTab,
    updateLocation,
    fullScanReadyText,
    dispose,
  };
}

export type ParetoStore = ReturnType<typeof useParetoSession>;
