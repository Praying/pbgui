import { computed, reactive, ref } from 'vue';
import type { Ref } from 'vue';
import { apiFetch } from '../lib/api';
import { plotCandleInfo } from '../lib/candles';
import { deepEnsure, deepGet, firstConfigCoin, firstConfigExchange, fmt } from '../lib/format';
import { DEFAULT_PARAM_FIELD_META, DEFAULT_SEGMENTS, normalizeParamGroups, paramFieldPath, paramValue as paramValueOf, setParamValue } from '../lib/params';
import { chooseMovieHandoffWindow, durationOptions, resolveDuration, framesForDuration, applyMovieDurationAnchor, movieStepLabelToMinutes } from '../lib/movieOptions';
import { refreshCacheConfig, refreshCacheMovieData, readStrategyRefreshState, cachedSnapshotOptions } from '../lib/refreshCache';
import { REFRESH_CACHE_MAX_BYTES, refreshCacheKey } from '../config';
import type { ExplorerAdapter } from '../config';
import type {
  CompareData,
  ExplorerOptions,
  FillEvent,
  MarketsData,
  MovieData,
  PageMessage,
  ParamFieldMeta,
  RefreshCachePayload,
  RefreshControls,
  SessionData,
  SimulationData,
  SnapshotMarket,
  StrategyConfig,
  StrategySnapshot,
} from '../types';

/** Legacy `state` var (:386) plus the form controls the DOM used to hold. */
export interface ExplorerState {
  config: StrategyConfig | null;
  snapshot: StrategySnapshot | null;
  markets: MarketsData | null;
  simulations: Record<string, SimulationData>;
  activeSimulationMode: string;
  longSegment: string;
  shortSegment: string;
  source: string;
  exchangeParamOverrides: Record<string, number>;
  stateParamOverrides: Record<string, number>;
  autoExchangeParams: boolean;
  hslSignalModes: string[];
  compareBaselineAvailable: boolean;
}

export interface Segment {
  key: string;
  labelKey?: string;
  label?: string;
  fields: string[];
}

export interface ExplorerControls {
  stage: string;
  ohlcvSource: string;
  exchange: string;
  coin: string;
  startDate: string;
  startTime: string;
  referencePrice: number;
  balance: number;
  contextDays: number;
  simMaxCandles: number;
  simMaxOrders: number;
  simStartState: string;
  simStartBalance: number;
  simStartLongSize: number;
  simStartLongPrice: number;
  simStartShortSize: number;
  simStartShortPrice: number;
  compareMode: string;
  compareMaxCandles: number;
  comparePb7Folder: string;
  compareUseFillsRange: boolean;
  compareMismatchesOnly: boolean;
  movieEngine: string;
  movieSide: string;
  movieStartDate: string;
  movieStartTime: string;
  movieStep: string;
  movieDuration: string;
  movieFrames: number;
  movieVisible: number;
  moviePb7Folder: string;
  exportPreset: string;
  exportCodec: string;
  exportWidth: number;
  exportHeight: number;
  exportScale: number;
  exportCrf: number;
  exportFfmpegPreset: string;
}

export type Translate = (key: string, params?: Record<string, unknown>) => string;

export interface StoreDeps {
  adapter: ExplorerAdapter;
  apiBase: string;
  draftId: string;
  resultPath: string;
  t: Translate;
}

/** Request-generation counters (:387-393) + polling stop hooks. */
export class Generations {
  session = 0;
  snapshot = 0;
  market = 0;
  compare = 0;
  simulation = 0;
  movie = 0;
  configRevision = 0;
  private stoppers: Array<() => void> = [];
  onStop(fn: () => void): void {
    this.stoppers.push(fn);
  }
  stopAll(): void {
    this.stoppers.forEach((fn) => fn());
  }
}

export function makeProgressId(): string {
  return window.crypto && window.crypto.randomUUID
    ? window.crypto.randomUUID()
    : String(Date.now()) + '-' + String(Math.random()).slice(2);
}

export function useStrategyExplorer(deps: StoreDeps) {
  const { adapter, apiBase, t } = deps;

  const state = reactive<ExplorerState>({
    config: null,
    snapshot: null,
    markets: null,
    simulations: {},
    activeSimulationMode: adapter.defaultSimulationModes[0]?.key ?? 'local_simulation',
    longSegment: 'entry_grid',
    shortSegment: 'entry_grid',
    source: 'default',
    exchangeParamOverrides: {},
    stateParamOverrides: {},
    autoExchangeParams: true,
    hslSignalModes: ['pside', 'unified'],
    compareBaselineAvailable: false,
  });

  const controls = reactive<ExplorerControls>({
    stage: 'analysis',
    ohlcvSource: 'PB7 cache/historical',
    exchange: '',
    coin: '',
    startDate: '',
    startTime: '00:00',
    referencePrice: 100,
    balance: 1000,
    contextDays: 5,
    simMaxCandles: 2000,
    simMaxOrders: 200,
    simStartState: 'flat',
    simStartBalance: 1000,
    simStartLongSize: 0,
    simStartLongPrice: 0,
    simStartShortSize: 0,
    simStartShortPrice: 0,
    compareMode: 'pb7_b_c',
    compareMaxCandles: 10000,
    comparePb7Folder: '',
    compareUseFillsRange: true,
    compareMismatchesOnly: true,
    movieEngine: 'local_simulation',
    movieSide: 'auto',
    movieStartDate: '',
    movieStartTime: '00:00',
    movieStep: '240',
    movieDuration: 'Custom (Frames)',
    movieFrames: 200,
    movieVisible: 60,
    moviePb7Folder: '',
    exportPreset: 'Balanced',
    exportCodec: 'auto',
    exportWidth: 1600,
    exportHeight: 800,
    exportScale: 1,
    exportCrf: 18,
    exportFfmpegPreset: 'veryfast',
  });

  const messages = ref<PageMessage[]>([]);
  /** True while the initial session load or a /snapshot recalculate is in
   *  flight — drives the analysis-area skeleton (legacy showed a blank
   *  chart region with no feedback). */
  const snapshotLoading = ref(false);
  const segments = ref<Segment[]>(DEFAULT_SEGMENTS);
  const paramFieldMeta = ref<Record<string, ParamFieldMeta>>(DEFAULT_PARAM_FIELD_META);
  const lastMovieData = ref<MovieData | null>(null);
  const draftId = ref(deps.draftId);
  const strategyLabel = ref(adapter.strategyLabel);
  const generations = new Generations();

  /* -------------------------------------------------- messages (:993-1003) */
  function setMessages(list: PageMessage[] | null | undefined): void {
    const filtered = Array.isArray(list)
      ? list.filter((msg) => {
          const text = String((msg && (msg.text || msg.message)) || '');
          return !(/^Loaded [\d,]+ OHLCV candles for chart context\.$/.test(text) && (!msg.level || msg.level === 'info'));
        })
      : [];
    messages.value = filtered;
  }

  /* ---------------------------------------------- invalidate (:1072-1100) */
  function invalidateConfigRequests(): void {
    generations.configRevision += 1;
    generations.market += 1;
    generations.snapshot += 1;
    generations.compare += 1;
    generations.simulation += 1;
    generations.movie += 1;
    generations.stopAll();
  }
  function invalidateSimulationRequest(): void {
    generations.simulation += 1;
    generations.stopAll();
  }
  function invalidateCompareRequest(): void {
    generations.compare += 1;
    generations.stopAll();
  }
  function invalidateMovieRequest(): void {
    generations.movie += 1;
    generations.stopAll();
  }

  /* ---------------------------------------------- options builders (:1055+) */
  function selectedOptions(): ExplorerOptions {
    return {
      draft_id: adapter.isV8 ? draftId.value : '',
      ohlcv_source: controls.ohlcvSource || 'PB7 cache/historical',
      exchange: controls.exchange || '',
      coin: controls.coin || '',
      start_date: controls.startDate || '',
      start_time: controls.startTime || '00:00',
      reference_price: Number(controls.referencePrice || 100),
      balance: Number(controls.balance || 1000),
      auto_fill_exchange_params: state.autoExchangeParams !== false,
      exchange_params: { ...(state.exchangeParamOverrides || {}) },
      state_params: { ...(state.stateParamOverrides || {}), balance: Number(controls.balance || 1000) },
      load_candles: true,
      context_days: Number(controls.contextDays || 5),
    };
  }

  function simulationOptions(): ExplorerOptions {
    const opts = selectedOptions();
    opts.load_candles = true;
    opts.sim_max_candles = Number(controls.simMaxCandles || 2000);
    opts.sim_max_orders = Number(controls.simMaxOrders || 200);
    opts.sim_start_state = controls.simStartState || 'flat';
    if (opts.sim_start_state === 'manual') {
      opts.sim_start_balance = Number(controls.simStartBalance || controls.balance || 1000);
      opts.sim_start_long_size = Number(controls.simStartLongSize || 0);
      opts.sim_start_long_price = Number(controls.simStartLongPrice || 0);
      opts.sim_start_short_size = Number(controls.simStartShortSize || 0);
      opts.sim_start_short_price = Number(controls.simStartShortPrice || 0);
    }
    return opts;
  }

  function compareOptions(): ExplorerOptions {
    return {
      ...selectedOptions(),
      compare_mode: controls.compareMode || 'pb7_b_c',
      compare_max_candles: Number(controls.compareMaxCandles || 2000),
      compare_max_orders: 20000,
      pb7_backtest_dir: adapter.isV8 ? '' : controls.comparePb7Folder || '',
      use_fills_range: controls.compareUseFillsRange,
      mismatches_only: controls.compareMismatchesOnly,
    };
  }

  function selectedMovieSideKey(events?: { long?: unknown[]; short?: unknown[] }): 'long' | 'short' {
    const raw = controls.movieSide || 'auto';
    if (raw === 'short') return 'short';
    if (raw === 'long') return 'long';
    const ev = events || (lastMovieData.value && lastMovieData.value.events) || {};
    if (!(ev.long || []).length && (ev.short || []).length) return 'short';
    if (state.snapshot && deepGet<boolean>(state.snapshot, ['sides', 'long', 'active'], true) === false && deepGet<boolean>(state.snapshot, ['sides', 'short', 'active'], false) === true)
      return 'short';
    return 'long';
  }

  const movieDurationOptionList = computed(() => durationOptions(movieStepLabel(), adapter.isV8));
  function movieStepLabel(): string {
    const map: Record<string, string> = { '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h', '1440': '1d' };
    return map[controls.movieStep] || '4h';
  }
  function resolvedMovieDuration() {
    return resolveDuration(movieDurationOptionList.value, controls.movieDuration);
  }
  function updateMovieDurationFrames(): void {
    const duration = resolvedMovieDuration();
    if (duration.custom || !duration.minutes) return;
    const step = Math.max(1, Number(controls.movieStep || 1));
    controls.movieFrames = framesForDuration(duration.minutes, step);
  }
  function syncMovieDurationOptions(): void {
    // keep the current value if it still exists, else fall back to Custom
    const values = movieDurationOptionList.value.map((o) => o.value);
    if (!values.includes(controls.movieDuration)) controls.movieDuration = 'Custom (Frames)';
  }

  function selectedMovieOptions(): ExplorerOptions {
    const opts = selectedOptions();
    const movieDate = controls.movieStartDate || controls.startDate || '';
    const movieTime = controls.movieStartTime || controls.startTime || '00:00';
    opts.start_date = movieDate;
    opts.start_time = movieTime;
    return applyMovieDurationAnchor(resolvedMovieDuration(), opts);
  }

  function selectedMovieFrameOptions(progressId: string): ExplorerOptions {
    const opts = selectedMovieOptions();
    opts.load_candles = true;
    updateMovieDurationFrames();
    opts.frames = Number(controls.movieFrames || 200);
    opts.step_mins = Number(controls.movieStep || 240);
    opts.visible_candles = Number(controls.movieVisible || 60);
    opts.movie_engine = controls.movieEngine || 'local_simulation';
    opts.movie_side = selectedMovieSideKey();
    opts.pb7_backtest_dir = adapter.isV8 ? '' : controls.moviePb7Folder || controls.comparePb7Folder || '';
    opts.sim_max_candles = Math.max(10, Number(opts.frames) * Number(opts.step_mins) + 5);
    opts.sim_max_orders = 20000;
    opts.progress_id = progressId;
    return opts;
  }

  function movieFrameOptionsKey(opts: ExplorerOptions): string {
    opts = opts || ({} as ExplorerOptions);
    return JSON.stringify({
      config: JSON.stringify(state.config || {}),
      exchange: opts.exchange || '',
      coin: opts.coin || '',
      ohlcv_source: opts.ohlcv_source || '',
      start_date: opts.start_date || '',
      start_time: opts.start_time || '',
      frames: Number(opts.frames || 0),
      step_mins: Number(opts.step_mins || 0),
      visible_candles: Number(opts.visible_candles || 0),
      movie_engine: opts.movie_engine || '',
      movie_side: selectedMovieSideKey(),
      pb7_backtest_dir: opts.pb7_backtest_dir || '',
    });
  }

  /* ----------------------------------------------------- param editing */
  function fieldMeta(name: string): ParamFieldMeta {
    return paramFieldMeta.value[name] ?? DEFAULT_PARAM_FIELD_META[name] ?? {};
  }
  function setParam(sideKey: string, name: string, value: unknown): void {
    if (state.config) {
      setParamValue(state.config, sideKey, name, value, fieldMeta(name));
      invalidateConfigRequests();
    }
  }
  function paramValueFor(name: string, sideKey: string): unknown {
    if (!state.config) return undefined;
    return paramValueOf(state.config, name, sideKey, fieldMeta(name));
  }

  /* -------------------------------------------------- markets (:1121-1147) */
  async function populateMarkets(): Promise<MarketsData | null> {
    const generation = ++generations.market;
    try {
      const data = await apiFetch<MarketsData>(apiBase, '/markets', {
        method: 'POST',
        body: JSON.stringify({ config: state.config || {}, options: selectedOptions() }),
      });
      if (generation !== generations.market) return null;
      state.markets = data;
      updateCoinSelect();
      return data;
    } catch (err) {
      if (generation !== generations.market) return null;
      setMessages([{ level: 'warning', text: 'Failed to load market selectors: ' + (err as Error).message }]);
      return null;
    }
  }

  function coinsForExchange(exchange: string): string[] {
    return deepGet<string[]>(state.markets || {}, ['coins_by_exchange', exchange], []);
  }
  function updateCoinSelect(preferredCoin = ''): void {
    const exchange = controls.exchange || '';
    const coins = coinsForExchange(exchange);
    const current = controls.coin;
    if (preferredCoin && coins.includes(preferredCoin)) controls.coin = preferredCoin;
    else if (current && coins.includes(current)) controls.coin = current;
    else if (coins.length) controls.coin = coins[0]!;
    else controls.coin = '';
  }
  function optionExists(values: string[], value: string): boolean {
    return !!value && values.includes(value);
  }
  const exchangeOptions = computed(() => state.markets?.exchanges || []);
  const coinOptions = computed(() => coinsForExchange(controls.exchange));

  /* ---------------------------------------------- config sync (:1034-1054) */
  function syncControlsFromConfig(cfg: StrategyConfig | null): void {
    cfg = cfg || ({} as StrategyConfig);
    const balance = deepGet<number | null>(cfg, ['backtest', 'starting_balance'], null);
    if (balance !== null && balance !== undefined) {
      controls.balance = Number(balance);
      if (!controls.simStartBalance || Number(controls.simStartBalance) <= 0) controls.simStartBalance = Number(balance);
    }
    const configuredSourceDir = String(deepGet<string>(cfg, ['backtest', 'ohlcv_source_dir'], '') || '').trim();
    if (configuredSourceDir && controls.ohlcvSource === 'PB7 cache/historical') controls.ohlcvSource = 'Backtest ohlcv_source_dir';
    const exchange = firstConfigExchange(cfg);
    const coin = firstConfigCoin(cfg);
    if (exchange && optionExists(exchangeOptions.value, exchange)) {
      controls.exchange = exchange;
      updateCoinSelect(coin);
    } else if (coin) {
      updateCoinSelect(coin);
    }
  }

  function syncOptionsFromConfig(snapshot: StrategySnapshot | null): void {
    const cfg = snapshot?.config || {};
    const market = snapshot?.market || {};
    const metaSourceMode = String(deepGet<string>(market as SnapshotMarket, ['metadata', 'ohlcv_source'], '') || '').trim();
    if (metaSourceMode && metaSourceMode !== controls.ohlcvSource && metaSourceMode !== 'Backtest ohlcv_source_dir') controls.ohlcvSource = metaSourceMode;
    else if (!metaSourceMode) {
      const configuredSourceDir = String(deepGet<string>(cfg, ['backtest', 'ohlcv_source_dir'], '') || '').trim();
      if (configuredSourceDir) controls.ohlcvSource = 'Backtest ohlcv_source_dir';
    }
    const selectedStart = deepGet<string>(market, ['metadata', 'ohlcv', 'selected_start'], '');
    if (selectedStart && !controls.startDate) {
      controls.startDate = String(selectedStart).slice(0, 10);
      controls.startTime = String(selectedStart).slice(11, 16) || '00:00';
    }
    if (selectedStart && !controls.movieStartDate) {
      controls.movieStartDate = String(selectedStart).slice(0, 10);
      controls.movieStartTime = String(selectedStart).slice(11, 16) || '00:00';
    }
    controls.referencePrice = Number(deepGet<number>(market, ['reference_price'], 100) || 100);
    controls.balance = Number(deepGet<number>(cfg, ['backtest', 'starting_balance'], 1000) || 1000);
  }

  function inferInitialSelectors(snapshot: StrategySnapshot | null): void {
    const market = snapshot?.market || {};
    const exchange = String(market.exchange || '');
    if (exchange && optionExists(exchangeOptions.value, exchange)) controls.exchange = exchange;
    updateCoinSelect(String(market.coin || ''));
  }

  /* ------------------------------------------- result handoff (:1210-1222, :2327-2360) */
  function applyInitialResultPath(resultPath: string): void {
    if (!resultPath) return;
    if (adapter.isV8) {
      controls.comparePb7Folder = 'Loaded from selected PB8 result';
      controls.moviePb7Folder = 'Loaded from selected PB8 result';
      return;
    }
    const raw = String(resultPath);
    if (!/^(\/|~\/|[A-Za-z]:[\\/])/.test(raw) && raw.indexOf('/') < 0 && raw.indexOf('\\') < 0) return;
    if (!controls.comparePb7Folder) controls.comparePb7Folder = raw;
    if (!controls.moviePb7Folder) controls.moviePb7Folder = raw;
  }

  function applyBacktestHandoff(handoff: NonNullable<SessionData['handoff']>, resultPath: string): void {
    handoff = handoff || {};
    if (adapter.isV8 && handoff.provenance_available) {
      applyInitialResultPath('opaque-provenance');
      compareModePrimaryText.value = 'Stored PB8 Result vs Fresh PB8 Replay';
    }
    if (adapter.isV8 && handoff.compare_available) {
      state.compareBaselineAvailable = true;
      controls.comparePb7Folder = t('v7explore.pinnedParetoBaseline');
      compareModePrimaryText.value = 'Current PB8 Config vs Pinned PB8 Baseline';
    }
    if (resultPath) applyInitialResultPath(resultPath);
    if (!handoff.fill_start || !handoff.fill_end) return;
    controls.movieEngine = adapter.isV8 ? 'pb8_engine' : 'pb7_fills';
    const fillStart = String(handoff.fill_start || '').replace(' ', 'T');
    const fillEnd = String(handoff.fill_end || '').replace(' ', 'T');
    if (fillStart.length >= 16) {
      controls.movieStartDate = fillStart.slice(0, 10);
      controls.movieStartTime = fillStart.slice(11, 16);
    }
    const startMs = new Date(fillStart).getTime();
    const endMs = new Date(fillEnd).getTime();
    const spanMinutes = isFinite(startMs) && isFinite(endMs) ? Math.max(1, Math.floor((endMs - startMs) / 60000)) : 1;
    const choice = chooseMovieHandoffWindow(spanMinutes);
    controls.movieStep = String(choice.stepMin);
    syncMovieDurationOptions();
    if (movieDurationOptionList.value.some((o) => o.value === choice.durationLabel)) controls.movieDuration = choice.durationLabel;
    else controls.movieDuration = 'Custom (Frames)';
    controls.movieFrames = choice.frames;
  }

  /** v8 handoff can rewrite the primary compare-mode label (:2331, :2337). */
  const compareModePrimaryText = ref<string | null>(null);

  /* ------------------------------------------------------- snapshot apply (:2006-2038) */
  function applySnapshot(snapshot: StrategySnapshot): void {
    const dynamicGroups = normalizeParamGroups(snapshot.param_groups);
    segments.value = adapter.isV8 && dynamicGroups ? dynamicGroups : DEFAULT_SEGMENTS;
    paramFieldMeta.value =
      adapter.isV8 && snapshot.param_field_meta && typeof snapshot.param_field_meta === 'object' && !Array.isArray(snapshot.param_field_meta)
        ? snapshot.param_field_meta
        : DEFAULT_PARAM_FIELD_META;
    if (!segments.value.some((segment) => segment.key === state.longSegment)) state.longSegment = segments.value[0]?.key ?? 'entry_grid';
    if (!segments.value.some((segment) => segment.key === state.shortSegment)) state.shortSegment = segments.value[0]?.key ?? 'entry_grid';
    state.snapshot = snapshot;
    state.config = JSON.parse(JSON.stringify(snapshot.config || {})) as StrategyConfig;
    controls.referencePrice = Number(deepGet<number>(snapshot, ['market', 'reference_price'], 100) || 100);
  }

  /* ------------------------------------------------------------ chips (:2020-2033) */
  const configName = computed(() => {
    const snapshot = state.snapshot;
    return (
      snapshot?.title ||
      deepGet<string>(snapshot, ['config', 'pbgui', 'note'], '') ||
      deepGet<string>(snapshot, ['market', 'coin'], '') ||
      'default'
    );
  });
  const sourceChip = computed(() => ({
    text: t('v7explore.sourceChip', { name: configName.value }),
    title: t('v7explore.loadedFrom', { source: state.snapshot?.source || 'default' }),
    cls: 'chip ' + (state.snapshot?.source === 'draft' ? 'ok' : 'warn'),
  }));
  const ohlcvChip = computed(() => {
    const snapshot = state.snapshot;
    const loadedRows = Number(deepGet<number>(snapshot, ['market', 'metadata', 'ohlcv', 'rows'], 0) || 0);
    const displayedRows = snapshot?.candles?.length || 0;
    // aggregated display rows (:2018) — differs from the window candle count
    // when the snapshot exceeds MAX_PLOT_CANDLES (common on 1m data)
    const plotRows = plotCandleInfo(snapshot?.candles || []).rows;
    const ohlcvStatus = deepGet<string>(snapshot, ['market', 'ohlcv_status'], 'Candles disabled');
    const title =
      ohlcvStatus +
      (loadedRows ? ' - ' + t('v7explore.loadedCandles', { count: fmt(loadedRows, 0) }) : '') +
      (displayedRows ? ', ' + t('v7explore.windowCandles', { count: fmt(displayedRows, 0) }) : '') +
      (plotRows && plotRows !== displayedRows ? ', ' + t('v7explore.plottingAggregatedCandles', { count: fmt(plotRows, 0) }) : '');
    return {
      text: t('v7explore.ohlcvChip', { loaded: loadedRows ? fmt(loadedRows, 0) : '-', displaying: displayedRows ? fmt(displayedRows, 0) : null }),
      title,
      cls: 'chip ' + (loadedRows ? 'ok' : 'warn'),
    };
  });
  const engineChip = computed(() => {
    const engineStatus = deepGet<string>(state.snapshot, ['market', 'engine_status'], '-');
    return { text: engineStatus, cls: 'chip ' + (String(engineStatus).indexOf('failed') >= 0 ? 'err' : 'ok') };
  });
  const marketChip = computed(() =>
    t('v7explore.marketChip', {
      exchange: deepGet<string>(state.snapshot, ['market', 'exchange'], '-'),
      coin: deepGet<string>(state.snapshot, ['market', 'coin'], '-'),
      price: fmt(deepGet<number>(state.snapshot, ['market', 'reference_price'], 0), 8),
    })
  );

  /* --------------------------------------------------------- recalc (:2039-2055) */
  async function recalculate(options: { preserveConfig?: boolean; reportError?: boolean } = {}): Promise<void> {
    if (!options.preserveConfig) {
      generations.configRevision += 1;
      if (state.config) {
        const bt = deepEnsure(state.config, ['backtest']);
        bt.starting_balance = Number(controls.balance || 1000);
      }
    }
    const generation = ++generations.snapshot;
    snapshotLoading.value = true;
    try {
      const snapshot = await apiFetch<StrategySnapshot>(apiBase, '/snapshot', {
        method: 'POST',
        body: JSON.stringify({ config: state.config, options: selectedOptions() }),
      });
      if (generation !== generations.snapshot) return;
      applySnapshot(snapshot);
      setMessages(snapshot.messages || []);
    } catch (err) {
      if (generation !== generations.snapshot) return;
      setMessages([{ level: 'error', text: t('v7explore.snapshotFailed', { error: (err as Error).message }) }]);
      if (options.reportError) throw err;
    } finally {
      if (generation === generations.snapshot) snapshotLoading.value = false;
    }
  }

  /* --------------------------------------------------- refresh cache (:749-816) */
  function refreshCacheControls(): RefreshControls {
    return {
      stage: controls.stage,
      exchange: controls.exchange,
      coin: controls.coin,
      start_date: controls.startDate,
      start_time: controls.startTime,
      balance: String(controls.balance),
      reference_price: String(controls.referencePrice),
      context_days: String(controls.contextDays),
      movie_start_date: controls.movieStartDate,
      movie_start_time: controls.movieStartTime,
      movie_step: controls.movieStep,
      movie_duration: controls.movieDuration,
      movie_frames: String(controls.movieFrames),
      movie_visible: String(controls.movieVisible),
      movie_side: controls.movieSide,
      movie_generated: !!(lastMovieData.value && (lastMovieData.value.frames || []).length),
    };
  }
  function persistStrategyRefreshState(): void {
    const config = refreshCacheConfig(adapter.flavor, state.config);
    if (!config) return;
    const payload: RefreshCachePayload = {
      saved_at: Date.now(),
      config,
      controls: refreshCacheControls(),
      movie_data: refreshCacheMovieData(adapter.flavor, lastMovieData.value),
    };
    try {
      let serialized = JSON.stringify(payload);
      if (serialized.length > REFRESH_CACHE_MAX_BYTES) {
        payload.movie_data = null;
        serialized = JSON.stringify(payload);
      }
      window.sessionStorage.setItem(refreshCacheKey(adapter, draftId.value), serialized);
    } catch {
      try {
        payload.movie_data = null;
        window.sessionStorage.setItem(refreshCacheKey(adapter, draftId.value), JSON.stringify(payload));
      } catch {
        /* storage unavailable — legacy swallowed (:810-814) */
      }
    }
  }
  function readRefreshState(): RefreshCachePayload | null {
    return readStrategyRefreshState(refreshCacheKey(adapter, draftId.value));
  }
  function cachedOptions(cached: RefreshCachePayload): ExplorerOptions {
    return cachedSnapshotOptions(cached);
  }
  function restoreControlsFromCache(cached: RefreshCachePayload): void {
    const c = cached.controls || {};
    if (c.exchange && optionExists(exchangeOptions.value, c.exchange)) controls.exchange = c.exchange;
    updateCoinSelect(c.coin || '');
    if (c.start_date !== undefined) controls.startDate = c.start_date;
    if (c.start_time) controls.startTime = c.start_time;
    if (c.balance !== undefined && c.balance !== '') controls.balance = Number(c.balance);
    if (c.reference_price !== undefined && c.reference_price !== '') controls.referencePrice = Number(c.reference_price);
    if (c.context_days !== undefined && c.context_days !== '') controls.contextDays = Number(c.context_days);
    if (c.movie_start_date !== undefined) controls.movieStartDate = c.movie_start_date;
    if (c.movie_start_time) controls.movieStartTime = c.movie_start_time;
    if (c.movie_step) controls.movieStep = c.movie_step;
    syncMovieDurationOptions();
    if (c.movie_duration && movieDurationOptionList.value.some((o) => o.value === c.movie_duration)) controls.movieDuration = c.movie_duration;
    if (c.movie_frames !== undefined && c.movie_frames !== '') controls.movieFrames = Number(c.movie_frames);
    if (c.movie_visible !== undefined && c.movie_visible !== '') controls.movieVisible = Number(c.movie_visible);
    if (c.movie_side) controls.movieSide = c.movie_side;
  }

  /* --------------------------------------------- simulation events access (:2071-2083) */
  function simulationEventsFor(mode: string): { long: FillEvent[]; short: FillEvent[] } {
    const data = state.simulations[mode];
    return { long: deepGet<FillEvent[]>(data, ['events', 'long'], []), short: deepGet<FillEvent[]>(data, ['events', 'short'], []) };
  }
  function simulationSnapshotForPlot(data: SimulationData): StrategySnapshot {
    const snapshot = JSON.parse(JSON.stringify(state.snapshot || {})) as StrategySnapshot;
    if (adapter.isV8 && Array.isArray(data?.candles) && data.candles.length) {
      snapshot.candles = data.candles;
      const metadata = data.metadata || {};
      const market = snapshot.market || (snapshot.market = {});
      const marketMetadata = market.metadata || (market.metadata = {});
      const ohlcv = marketMetadata.ohlcv || (marketMetadata.ohlcv = {});
      if (metadata.start_timestamp_ms) ohlcv.selected_start = new Date(Number(metadata.start_timestamp_ms)).toISOString();
      if (metadata.end_timestamp_ms) ohlcv.grid_time = new Date(Number(metadata.end_timestamp_ms)).toISOString();
    }
    return snapshot;
  }

  return {
    adapter,
    apiBase,
    t,
    resultPath: deps.resultPath,
    state,
    controls,
    messages,
    segments,
    paramFieldMeta,
    lastMovieData,
    draftId,
    strategyLabel,
    compareModePrimaryText,
    generations,
    setMessages,
    invalidateConfigRequests,
    invalidateSimulationRequest,
    invalidateCompareRequest,
    invalidateMovieRequest,
    selectedOptions,
    simulationOptions,
    compareOptions,
    selectedMovieOptions,
    selectedMovieFrameOptions,
    movieFrameOptionsKey,
    selectedMovieSideKey,
    movieStepLabel,
    movieStepLabelToMinutes: () => movieStepLabelToMinutes(movieStepLabel()),
    syncMovieDurationOptions,
    updateMovieDurationFrames,
    movieDurationOptionList,
    fieldMeta,
    setParam,
    paramValueFor,
    paramFieldPathFor: (side: string, name: string) => paramFieldPath(side, name, fieldMeta(name)),
    populateMarkets,
    updateCoinSelect,
    optionExists,
    exchangeOptions,
    coinOptions,
    syncControlsFromConfig,
    syncOptionsFromConfig,
    inferInitialSelectors,
    applyInitialResultPath,
    applyBacktestHandoff,
    applySnapshot,
    sourceChip,
    ohlcvChip,
    engineChip,
    marketChip,
    recalculate,
    snapshotLoading,
    refreshCacheControls,
    persistStrategyRefreshState,
    readRefreshState,
    cachedOptions,
    restoreControlsFromCache,
    simulationEventsFor,
    simulationSnapshotForPlot,
  };
}

export type ExplorerStore = ReturnType<typeof useStrategyExplorer>;
export type { CompareData };
