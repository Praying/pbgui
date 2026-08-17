import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import { BACKTEST_SORT_DEFAULTS } from '../config';
import { parseCsv } from '../lib/parseCsv';
import { normalizeBe, pruneSelection, resultConfigNames, resultsForVersion, filterResults, sortResults } from '../lib/resultsModel';
import type {
  BacktestResultItem,
  BacktestVersion,
  BeSeries,
  ParsedCsv,
  PricePayload,
  ResultActionKind,
  ResultsVersionFilter,
  SortSpec,
} from '../types';
import type { I18nT } from '../types.i18n';

/**
 * The results store — the port of loadResults + the empty-retry ladder
 * (:5357-5416), the version/config/text filters (:5579-5610), the
 * path-keyed row selection (:5999-6019), the per-result chart action
 * toggles (:6426-6429) and viewConfigResults (:4983-5006). Selection is
 * path-keyed state (not DOM classes), so it survives filter changes and
 * WS-driven reloads; rows whose path disappears fall out via pruning.
 */

export const RESULTS_EMPTY_RETRY_LIMIT = 3;
export const RESULTS_RETRY_BASE_MS = 400;

export interface ResultDataApi {
  /** resultApiBase (:1160-1163) — the row's flavor router. */
  resultApiBaseFor(result: Pick<BacktestResultItem, 'backtest_version'>): string;
  /** fetchCSV (:5440-5448). */
  fetchCsv(file: 'equity' | 'fills', path: string, result: BacktestResultItem): Promise<ParsedCsv>;
  /** loadAndRenderBEChart's cache (:6789-6791). */
  loadBe(path: string, result: BacktestResultItem): Promise<BeSeries>;
  /** loadAndRenderPnlChart's cache (:7227-7241). */
  loadFills(path: string, result: BacktestResultItem): Promise<ParsedCsv>;
  /** loadPricePayload's bounded cache (:6789-6823) — routed by the row's
   * version like legacy resultApiFetch(cd.result, …) (:6815-6817). */
  loadPrice(path: string, market: { exchange: string; coin: string }, result: BacktestResultItem): Promise<PricePayload>;
  /** /results/analysis (result.analysis short-circuits, :7531-7545). */
  loadAnalysis(path: string, result: BacktestResultItem): Promise<unknown>;
  /** /results/config (:7547-7557). */
  loadConfig(path: string, result: BacktestResultItem): Promise<unknown>;
  /** /results/files → filtered PNG list (:7560-7574). */
  loadFiles(path: string, result: BacktestResultItem, kind: 'plot' | 'fills'): Promise<string[]>;
  /** /results/image URL (:7568-7570). */
  imageUrl(path: string, result: BacktestResultItem, filename: string): string;
  /** The compare cache — keyed version:path (:7614-7620). */
  beForCompare(path: string, result: BacktestResultItem): Promise<{ path: string; version: BacktestVersion; be: BeSeries }>;
  /** closeAllSectionsForPaths' cache eviction (:8526). */
  clearCachesFor(paths: readonly string[]): void;
}

export interface ResultsSection {
  result: BacktestResultItem;
  actions: ReadonlySet<ResultActionKind>;
}

export interface UseResultsOptions {
  apiBase: string;
  version: BacktestVersion;
  t: I18nT;
  notify(message: string, kind: 'ok' | 'err' | 'info' | 'warn'): void;
  getCurrentPanel(): string;
  onSelectResultsPanel?(): void;
  fetchFn?: typeof fetch;
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
  /** Seed the sort (App passes the persisted sorts.results, R2). */
  initialSort?: SortSpec;
  /** View-state persistence hook for sort changes. */
  onSortChange?(sort: SortSpec): void;
}

export interface ResultsStore {
  /** The page flavor — the version fallback for untagged rows (:7614). */
  readonly version: BacktestVersion;
  results: { value: BacktestResultItem[] };
  versionFilter: { value: ResultsVersionFilter };
  configFilter: { value: string };
  textFilter: { value: string };
  checking: { value: boolean };
  configNames: { value: string[] };
  visible: { value: BacktestResultItem[] };
  sort: { value: SortSpec };
  selectedPaths: { value: Set<string> };
  activeResults: { value: ResultsSection[] };
  /** The raw path → open-action-set map (the table's icon active state). */
  actionsByPath: { value: Readonly<Record<string, ReadonlySet<ResultActionKind>>> };
  /** Surface the panel's toasts through the page toast queue. */
  notifyError(message: string): void;
  compareOpen: { value: boolean };
  compareTraces: { value: unknown[] };
  compareLayout: { value: unknown };
  dataApi: ResultDataApi;
  setVersionFilter(filter: ResultsVersionFilter): void;
  loadResults(filterName?: string, loadOptions?: { emptyRetry?: boolean }): Promise<BacktestResultItem[]>;
  refresh(): void;
  /** Lazy-load on panel switch — only while the list is empty (:1452). */
  loadIfEmpty(): void;
  setSortColumn(column: string): void;
  applySort(sort: SortSpec): void;
  toggleSelected(path: string): void;
  setSelected(paths: readonly string[]): void;
  selectAll(paths: readonly string[]): void;
  deselectAll(): void;
  getSelected(): string[];
  toggleAction(path: string, kind: ResultActionKind): void;
  clearActionsForPaths(paths: readonly string[]): void;
  /** deleteSelectedResults (:8509-8532) — DELETE per row + reload. */
  deleteResults(paths: readonly string[]): Promise<void>;
  viewConfigResults(name: string): void;
  dispose(): void;
}

export function useResults(options: UseResultsOptions): ResultsStore {
  const fetchFn = options.fetchFn ?? fetch;
  const timers = options.timers ?? { setTimeout, clearTimeout };
  const version = options.version;

  const results = ref<BacktestResultItem[]>([]);
  const versionFilter = ref<ResultsVersionFilter>(version); // :10010
  const configFilter = ref('');
  const textFilter = ref('');
  const checking = ref(false);
  const sort = ref<SortSpec>(options.initialSort ?? { ...BACKTEST_SORT_DEFAULTS.results });
  const selectedPaths = ref<Set<string>>(new Set());
  const actionsByPath = ref<Record<string, Set<ResultActionKind>>>({});
  const compareOpen = ref(false);
  const compareTraces = ref<unknown[]>([]);
  const compareLayout = ref<unknown>({});

  let pendingFilter = '';
  let emptyRetryCount = 0;
  let emptyRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let loadGeneration = 0;
  const resultsByVersion: Record<string, BacktestResultItem[]> = {};

  /* ── data API (fetch + caches, :5440-5448 + :6789-6823 + :7614-7620) ── */

  function baseFor(targetVersion: BacktestVersion): string {
    return options.apiBase.replace(/\/backtest-v[78]$/, `/backtest-${targetVersion}`);
  }

  function resultApiBaseFor(result: Pick<BacktestResultItem, 'backtest_version'>): string {
    return baseFor(result.backtest_version || version);
  }

  async function fetchCsv(file: 'equity' | 'fills', path: string, result: BacktestResultItem): Promise<ParsedCsv> {
    const url = `${resultApiBaseFor(result)}/results/${file}?path=${encodeURIComponent(path)}`;
    const response = await fetchFn(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(response.statusText);
    return parseCsv(await response.text());
  }

  const beCache = new Map<string, BeSeries>();
  const fillsCache = new Map<string, ParsedCsv>();
  const priceCache = new Map<string, PricePayload>();

  function loadBe(path: string, result: BacktestResultItem): Promise<BeSeries> {
    const cached = beCache.get(path);
    if (cached) return Promise.resolve(cached);
    return fetchCsv('equity', path, result).then((csv) => {
      const be = normalizeBe(csv, result);
      beCache.set(path, be);
      return be;
    });
  }

  function loadFills(path: string, result: BacktestResultItem): Promise<ParsedCsv> {
    const cached = fillsCache.get(path);
    if (cached) return Promise.resolve(cached);
    return fetchCsv('fills', path, result).then((csv) => {
      fillsCache.set(path, csv);
      return csv;
    });
  }

  async function loadPrice(path: string, market: { exchange: string; coin: string }, result: BacktestResultItem): Promise<PricePayload> {
    const cacheKey = `${path}|${market.exchange}|${market.coin}`;
    const cached = priceCache.get(cacheKey);
    if (cached) return cached;
    const url = `${resultApiBaseFor(result)}/results/price?path=${encodeURIComponent(path)}&exchange=${encodeURIComponent(market.exchange)}&coin=${encodeURIComponent(market.coin)}&max_points=6000`;
    const response = await fetchFn(url, { credentials: 'same-origin' });
    const payload = (await response.json().catch(() => ({}))) as PricePayload;
    priceCache.set(cacheKey, payload);
    return payload;
  }

  async function requestJson(url: string): Promise<unknown> {
    const response = await fetchFn(url, { credentials: 'same-origin' });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data && typeof data === 'object' ? (data as { detail?: unknown }).detail : undefined;
      throw new Error(String(detail ?? response.statusText));
    }
    return data;
  }

  function loadAnalysis(path: string, result: BacktestResultItem): Promise<unknown> {
    if (result.analysis !== undefined) return Promise.resolve(result.analysis);
    return requestJson(`${resultApiBaseFor(result)}/results/analysis?path=${encodeURIComponent(path)}`);
  }

  function loadConfig(path: string, result: BacktestResultItem): Promise<unknown> {
    return requestJson(`${resultApiBaseFor(result)}/results/config?path=${encodeURIComponent(path)}`);
  }

  async function loadFiles(path: string, result: BacktestResultItem, kind: 'plot' | 'fills'): Promise<string[]> {
    const data = (await requestJson(`${resultApiBaseFor(result)}/results/files?path=${encodeURIComponent(path)}`)) as { files?: string[] };
    const files = Array.isArray(data.files) ? data.files : [];
    return kind === 'fills'
      ? files.filter((file) => file.startsWith('fills_plots/') && file.endsWith('.png'))
      : files.filter((file) => file.toLowerCase().endsWith('.png'));
  }

  function imageUrl(path: string, result: BacktestResultItem, filename: string): string {
    return `${resultApiBaseFor(result)}/results/image?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(filename)}`;
  }

  function beForCompare(path: string, result: BacktestResultItem): Promise<{ path: string; version: BacktestVersion; be: BeSeries }> {
    const resolvedVersion = result.backtest_version || version;
    const cacheKey = `${resolvedVersion}:${path}`;
    const cached = beCache.get(cacheKey);
    if (cached) return Promise.resolve({ path, version: resolvedVersion, be: cached });
    return fetchCsv('equity', path, result)
      .then((csv) => {
        const be = normalizeBe(csv, result);
        beCache.set(cacheKey, be);
        return { path, version: resolvedVersion, be };
      })
      .catch(() => ({ path, version: resolvedVersion, be: { time: [], balance: [], equity: [], balance_btc: [], equity_btc: [] } }));
  }

  function clearCachesFor(paths: readonly string[]): void {
    const dead = new Set(paths);
    for (const key of [...beCache.keys()]) {
      // plain path keys (view charts) and `version:path` keys (compare)
      if (dead.has(key) || dead.has(key.split(':').at(-1) ?? '')) beCache.delete(key);
    }
    for (const key of [...fillsCache.keys()]) if (dead.has(key)) fillsCache.delete(key);
    for (const key of [...priceCache.keys()]) if (dead.has(key.split('|')[0] ?? '')) priceCache.delete(key);
  }

  const dataApi: ResultDataApi = {
    resultApiBaseFor,
    fetchCsv,
    loadBe,
    loadFills,
    loadPrice,
    loadAnalysis,
    loadConfig,
    loadFiles,
    imageUrl,
    beForCompare,
    clearCachesFor,
  };

  /* ── derived views ── */

  const versioned = computed(() => resultsForVersion(results.value, versionFilter.value));
  const visible = computed(() => sortResults(filterResults(versioned.value, configFilter.value, textFilter.value), sort.value));
  const configNames = computed(() => resultConfigNames(versioned.value));
  const activeResults = computed<ResultsSection[]>(() => {
    const sections: ResultsSection[] = [];
    for (const result of visible.value) {
      const actions = actionsByPath.value[result.path];
      if (actions && actions.size > 0) sections.push({ result, actions });
    }
    return sections;
  });

  /* ── loadResults (:5375-5416) ── */

  function applyResultsData(items: readonly BacktestResultItem[], filterName?: string): BacktestResultItem[] {
    results.value = items.slice();
    const saved = typeof filterName === 'string' ? filterName : configFilter.value;
    configFilter.value = saved && resultConfigNames(versioned.value).includes(saved) ? saved : '';
    selectedPaths.value = pruneSelection(selectedPaths.value, results.value);
    return results.value;
  }

  async function loadResults(filterName?: string, loadOptions?: { emptyRetry?: boolean }): Promise<BacktestResultItem[]> {
    const retry = loadOptions?.emptyRetry === true;
    const selectedFilter = typeof filterName === 'string' ? filterName : pendingFilter;
    pendingFilter = '';
    if (!retry) emptyRetryCount = 0;
    if (emptyRetryTimer !== null) {
      timers.clearTimeout(emptyRetryTimer);
      emptyRetryTimer = null;
    }
    const generation = ++loadGeneration;
    const versions: BacktestVersion[] = versionFilter.value === 'both' ? ['v7', 'v8'] : [versionFilter.value as BacktestVersion];

    let loaded: BacktestResultItem[][];
    try {
      loaded = await Promise.all(
        versions.map(async (targetVersion) => {
          const response = await fetchFn(`${baseFor(targetVersion)}/results`, { credentials: 'same-origin' });
          const data = (await response.json().catch(() => ({}))) as { results?: BacktestResultItem[]; detail?: unknown };
          if (!response.ok) throw new Error(String(data.detail ?? response.statusText));
          // legacy :5390 tags the REQUESTED flavor unconditionally — the
          // server list carries no version of its own
          resultsByVersion[targetVersion] = (data.results ?? []).map((result) => ({
            ...result,
            backtest_version: targetVersion,
          }));
          return resultsByVersion[targetVersion]!;
        })
      );
    } catch (error) {
      // :5412-5416 — stale loads fall through silently; fresh ones toast
      if (generation === loadGeneration) {
        options.notify(options.t('v7backtest.loadResultsFailed', { msg: error instanceof Error ? error.message : String(error) }), 'err');
      }
      throw error instanceof Error ? error : new Error(String(error));
    }

    if (generation !== loadGeneration) return results.value;
    const applied = applyResultsData(loaded.flat(), selectedFilter);

    const selectedItems = resultsForVersion(applied, versionFilter.value);
    if (options.getCurrentPanel() === 'results' && selectedItems.length === 0 && emptyRetryCount < RESULTS_EMPTY_RETRY_LIMIT) {
      emptyRetryCount += 1;
      checking.value = true;
      const retryDelay = RESULTS_RETRY_BASE_MS * emptyRetryCount;
      const consumedFilter = selectedFilter;
      emptyRetryTimer = timers.setTimeout(() => {
        emptyRetryTimer = null;
        if (options.getCurrentPanel() === 'results' && generation === loadGeneration) {
          void loadResults(consumedFilter, { emptyRetry: true }).catch(() => undefined);
        }
      }, retryDelay);
    } else {
      emptyRetryCount = 0;
      checking.value = false;
    }
    return applied;
  }

  function refresh(): void {
    void loadResults().catch(() => undefined);
  }

  function loadIfEmpty(): void {
    if (results.value.length === 0) refresh();
  }

  function setVersionFilter(filter: ResultsVersionFilter): void {
    versionFilter.value = filter;
    refresh();
  }

  /* ── sort (setResSort :5452-5457 — new columns start DESCENDING) ── */

  function applySort(next: SortSpec): void {
    sort.value = { ...next };
    options.onSortChange?.(sort.value);
  }

  function setSortColumn(column: string): void {
    applySort(sort.value.col === column ? { col: column, asc: !sort.value.asc } : { col: column, asc: false });
  }

  /* ── selection (:5999-6019) ── */

  function toggleSelected(path: string): void {
    const next = new Set(selectedPaths.value);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    selectedPaths.value = next;
  }

  function setSelected(paths: readonly string[]): void {
    selectedPaths.value = new Set(paths);
  }

  function selectAll(paths: readonly string[]): void {
    selectedPaths.value = new Set([...selectedPaths.value, ...paths]);
  }

  function deselectAll(): void {
    selectedPaths.value = new Set();
  }

  function getSelected(): string[] {
    return visible.value.map((result) => result.path).filter((path) => selectedPaths.value.has(path));
  }

  /* ── per-result actions (:6426-6429) ── */

  function toggleAction(path: string, kind: ResultActionKind): void {
    const next: Record<string, Set<ResultActionKind>> = { ...actionsByPath.value };
    const current = new Set(next[path] ?? []);
    if (current.has(kind)) current.delete(kind);
    else current.add(kind);
    if (current.size > 0) next[path] = current;
    else delete next[path];
    actionsByPath.value = next;
  }

  function clearActionsForPaths(paths: readonly string[]): void {
    const dead = new Set(paths);
    const next: Record<string, Set<ResultActionKind>> = {};
    for (const [path, kinds] of Object.entries(actionsByPath.value)) {
      if (!dead.has(path)) next[path] = kinds;
    }
    actionsByPath.value = next;
    clearCachesFor(paths);
  }

  /** deleteSelectedResults' delete branch (:8526-8532) — errors surface. */
  async function deleteResults(paths: readonly string[]): Promise<void> {
    const rows = paths.map(
      (path) =>
        results.value.find((entry) => entry.path === path) ??
        ({ path, config_name: '', result_name: '', backtest_version: version } as BacktestResultItem)
    );
    try {
      await Promise.all(
        rows.map(async (row) => {
          // legacy used apiFetchFrom, which throws the detail on !ok (:8531-8532)
          const response = await fetchFn(`${resultApiBaseFor(row)}/results?path=${encodeURIComponent(row.path)}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          });
          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { detail?: unknown };
            throw new Error(String(data.detail ?? response.statusText ?? `HTTP ${response.status}`));
          }
        })
      );
      clearActionsForPaths(paths); // closeAllSectionsForPaths (:8526)
      selectedPaths.value = new Set();
      refresh();
    } catch (error) {
      options.notify(options.t('v7backtest.deleteFailed', { msg: error instanceof Error ? error.message : String(error) }), 'err');
    }
  }

  /* ── viewConfigResults (:4983-5006) ── */

  function viewConfigResults(name: string): void {
    pendingFilter = name;
    textFilter.value = '';
    options.onSelectResultsPanel?.();
    if (results.value.length > 0) {
      // cached: apply the filter immediately — no empty-table flash
      // (:4987-4998) … and refresh in the background so newly finished
      // jobs appear (:5001-5002)
      configFilter.value = resultConfigNames(versioned.value).includes(name) ? name : '';
      pendingFilter = '';
      void loadResults().catch(() => undefined);
      return;
    }
    // legacy fires the panel lazy-load AND its own loadResults — the
    // explicit one carries the filter so the last write wins (:5001-5006)
    void loadResults(name).catch(() => undefined);
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (emptyRetryTimer !== null) {
        timers.clearTimeout(emptyRetryTimer);
        emptyRetryTimer = null;
      }
    });
  }

  const store: ResultsStore = {
    version,
    results,
    versionFilter,
    configFilter,
    textFilter,
    checking,
    configNames,
    visible,
    sort,
    selectedPaths,
    activeResults,
    actionsByPath,
    notifyError: (message: string) => options.notify(message, 'err'),
    compareOpen,
    compareTraces,
    compareLayout,
    dataApi,
    setVersionFilter,
    loadResults,
    refresh,
    loadIfEmpty,
    setSortColumn,
    applySort,
    toggleSelected,
    setSelected,
    selectAll,
    deselectAll,
    getSelected,
    toggleAction,
    clearActionsForPaths,
    deleteResults,
    viewConfigResults,
    dispose(): void {
      if (emptyRetryTimer !== null) {
        timers.clearTimeout(emptyRetryTimer);
        emptyRetryTimer = null;
      }
    },
  };
  return store;
}
