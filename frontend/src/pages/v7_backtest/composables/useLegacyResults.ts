import { computed, ref } from 'vue';
import { chartLayout, compareTraces } from '../lib/resultCharts';
import { sortResults } from '../lib/resultsModel';
import { filterLegacyResults, legacyConfigOptions, legacySuggestedName } from '../lib/archiveModel';
import { queueRebacktests } from '../lib/queueRebacktests';
import type { BacktestResultItem, BacktestVersion, RebacktestFields, ResultActionKind, SortSpec } from '../types';
import type { I18nT } from '../types.i18n';
import type { ResultDataApi, ResultsStore } from './useResults';
import type { ViewStateStore } from './useViewState';

/**
 * The legacy panel store — loadLegacyResults (:9034-9039),
 * renderLegacyResults (:9423-9463), the path-keyed selection
 * (:5932-5986, :6049-6061), deleteSelectedLegacyResults (:6364-6380),
 * rebacktestSelectedLegacy (:8169-8252 — the single-open path here, the
 * queue posts through queueRebacktests) and compareSelectedLegacy
 * (:7829-7862 — plain-path labels). v7-only: the adapter drops the
 * panel on v8, so every fetch goes to the v7 router.
 */

export interface UseLegacyOptions {
  apiBase: string;
  version: BacktestVersion;
  t: I18nT;
  notify(message: string, kind: 'ok' | 'err' | 'info' | 'warn'): void;
  getCurrentPanel(): string;
  view: ViewStateStore;
  /** The results store supplies the row-routed data API (charts + compare). */
  results: ResultsStore;
  wsRefresh(): void;
  selectPanel(panel: 'configs'): void;
  /** The editor opener for the single-result backtest path (:8176-8178). */
  openEditor?(name: string, cfg: Record<string, unknown>): void;
  /** Seeds the multi-backtest pbgui toggle (:8207 via :1478-1480). */
  getSettings?(): { use_pbgui_market_data?: boolean | string };
  /** apiFetch('/pbgui_data_path') (:8224). */
  getPbguiDataPath?(): Promise<string>;
  fetchFn?: typeof fetch;
  initialSort?: SortSpec;
}

export interface LegacyResultsStore {
  readonly view: ViewStateStore;
  rows: { value: BacktestResultItem[] };
  configFilter: { value: string };
  textFilter: { value: string };
  selectedPaths: { value: Set<string> };
  actionsByPath: { value: Readonly<Record<string, ReadonlySet<ResultActionKind>>> };
  compareOpen: { value: boolean };
  compareTraces: { value: unknown[] };
  compareLayout: { value: unknown };
  rebacktestOpen: { value: boolean };
  rebacktestDefaults: { value: RebacktestFields | null };
  visible: { value: BacktestResultItem[] };
  configOptions: { value: string[] };
  sort: { value: SortSpec };
  dataApi: ResultDataApi;
  notifyError(message: string): void;
  loadLegacyResults(): Promise<void>;
  loadIfEmpty(): Promise<void>;
  setSortColumn(column: string): void;
  toggleSelected(path: string): void;
  selectAll(paths: readonly string[]): void;
  deselectAll(): void;
  getSelected(): string[];
  toggleAction(path: string, kind: ResultActionKind): void;
  deleteSelected(): Promise<void>;
  startRebacktest(openEditor: (name: string, cfg: Record<string, unknown>) => void, selectPanel: () => void): Promise<void>;
  confirmRebacktest(fields: RebacktestFields): Promise<void>;
  compareSelected(): Promise<void>;
  dispose(): void;
}

export function useLegacyResults(options: UseLegacyOptions): LegacyResultsStore {
  const fetchFn = options.fetchFn ?? fetch;
  const t = options.t;
  const notify = options.notify;

  const rows = ref<BacktestResultItem[]>([]);
  const configFilter = ref('');
  const textFilter = ref('');
  const selectedPaths = ref<Set<string>>(new Set());
  const actionsByPath = ref<Record<string, Set<ResultActionKind>>>({});
  const compareOpen = ref(false);
  const compareTracesRef = ref<unknown[]>([]);
  const compareLayoutRef = ref<unknown>({});
  const rebacktestOpen = ref(false);
  const rebacktestDefaults = ref<RebacktestFields | null>(null);

  const sort = computed<SortSpec>(() => options.view.state.sorts.legacy);
  const visible = computed(() => sortResults(filterLegacyResults(rows.value, configFilter.value, textFilter.value), sort.value));
  const configOptions = computed(() => legacyConfigOptions(rows.value));

  async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetchFn(url, { credentials: 'same-origin', ...init });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = (data && typeof data === 'object' ? (data as { detail?: unknown }).detail : undefined) ?? response.statusText;
      throw new Error(String(detail));
    }
    return (data && typeof data === 'object' ? (data as Record<string, unknown>) : {});
  }

  /** loadLegacyResults (:9034-9039) — rows are inherently v7. */
  async function loadLegacyResults(): Promise<void> {
    try {
      const data = await requestJson(`${options.apiBase}/legacy/results`);
      const list = Array.isArray(data.results) ? (data.results as BacktestResultItem[]) : [];
      rows.value = list.map((row) => ({ ...row, backtest_version: 'v7' as const }));
      const rendered = new Set(rows.value.map((row) => row.path));
      selectedPaths.value = new Set([...selectedPaths.value].filter((path) => rendered.has(path)));
    } catch (error) {
      if (options.getCurrentPanel() === 'legacy') {
        notify(t('v7backtest.loadFailed', { msg: error instanceof Error ? error.message : String(error) }), 'err');
      }
    }
  }

  async function loadIfEmpty(): Promise<void> {
    if (rows.value.length === 0) await loadLegacyResults();
  }

  function setSortColumn(column: string): void {
    const current = sort.value;
    options.view.setSortSpec('legacy', current.col === column ? { col: column, asc: !current.asc } : { col: column, asc: false });
  }

  function toggleSelected(path: string): void {
    const next = new Set(selectedPaths.value);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    selectedPaths.value = next;
  }

  function selectAll(paths: readonly string[]): void {
    selectedPaths.value = new Set([...selectedPaths.value, ...paths]);
  }

  function deselectAll(): void {
    selectedPaths.value = new Set();
  }

  function getSelected(): string[] {
    return visible.value.map((row) => row.path).filter((path) => selectedPaths.value.has(path));
  }

  function toggleAction(path: string, kind: ResultActionKind): void {
    const next: Record<string, Set<ResultActionKind>> = { ...actionsByPath.value };
    const current = new Set(next[path] ?? []);
    if (current.has(kind)) current.delete(kind);
    else current.add(kind);
    if (current.size > 0) next[path] = current;
    else delete next[path];
    actionsByPath.value = next;
  }

  /** deleteSelectedLegacyResults (:6364-6380). */
  async function deleteSelected(): Promise<void> {
    const selected = getSelected();
    if (selected.length === 0) {
      notify(t('v7backtest.nothingSelected'), 'err');
      return;
    }
    try {
      // legacy :6371 posts through apiFetch, which THROWS on !ok — route
      // through the same requestJson so failures surface (:6377)
      await Promise.all(
        selected.map((path) => requestJson(`${options.apiBase}/legacy/results?path=${encodeURIComponent(path)}`, { method: 'DELETE' }))
      );
      notify(t('v7backtest.deleted'), 'ok');
      await loadLegacyResults();
    } catch (error) {
      notify(t('v7backtest.deleteFailed', { msg: error instanceof Error ? error.message : String(error) }), 'err');
    }
  }

  /** rebacktestSelectedLegacy (:8169-8252) — single opens the editor; multi opens the shared form. */
  async function startRebacktest(openEditor: (name: string, cfg: Record<string, unknown>) => void, selectPanel: () => void): Promise<void> {
    const selected = getSelected();
    if (selected.length === 0) {
      notify(t('v7backtest.nothingSelected'), 'err');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      const cfg = await requestJson(`${options.apiBase}/results/config?path=${encodeURIComponent(selected[0]!)}`);
      if (selected.length === 1) {
        selectPanel();
        openEditor(legacySuggestedName(rows.value, selected[0]!), cfg);
        return;
      }
      const backtest = (cfg.backtest as Record<string, unknown> | undefined) ?? {};
      const exchanges = Array.isArray(backtest.exchanges) ? (backtest.exchanges as string[]).map(String) : [];
      const settingsValue = options.getSettings?.().use_pbgui_market_data;
      rebacktestDefaults.value = {
        start: String(backtest.start_date || '2020-01-01'),
        end: today,
        balance: Number(backtest.starting_balance) || 1000,
        exchanges: exchanges.length > 0 ? exchanges : ['bybit'],
        // :8207 seeds the checkbox from settings like pbguiMarketDataDefaultCheckedAttr (:1478-1480)
        usePbguiData: settingsValue === true || String(settingsValue).toLowerCase() === 'true',
      };
      rebacktestOpen.value = true;
    } catch (error) {
      notify(t('v7backtest.failedLoadConfig', { msg: error instanceof Error ? error.message : String(error) }), 'err');
    }
  }

  /** The multi path's queue posts (:8224-8247). */
  async function confirmRebacktest(fields: RebacktestFields): Promise<void> {
    const selected = getSelected();
    let pbguiPath = '';
    if (fields.usePbguiData && options.getPbguiDataPath) {
      try {
        pbguiPath = await options.getPbguiDataPath();
      } catch (error) {
        notify(t('v7backtest.failedGetDataPath', { msg: error instanceof Error ? error.message : String(error) }), 'err');
        return;
      }
    }
    await queueRebacktests({
      apiBase: options.apiBase,
      paths: selected,
      fields,
      fetchConfig: (path) => requestJson(`${options.apiBase}/results/config?path=${encodeURIComponent(path)}`),
      nameFor: (path) => legacySuggestedName(rows.value, path),
      pbguiPath,
      t,
      notify,
      wsRefresh: options.wsRefresh,
      fetchFn,
    });
  }

  /** compareSelectedLegacy (:7829-7862) — plain-path labels. */
  async function compareSelected(): Promise<void> {
    if (compareOpen.value && compareTracesRef.value.length > 0) {
      compareOpen.value = false;
      compareTracesRef.value = [];
      return;
    }
    const selected = getSelected();
    if (selected.length < 2) {
      notify(t('v7backtest.selectAtLeast2Results'), 'err');
      return;
    }
    const items = await Promise.all(
      selected.map((path) => {
        const row = rows.value.find((entry) => entry.path === path) ?? { path, config_name: '', result_name: '', backtest_version: 'v7' as const };
        return options.results.dataApi.beForCompare(path, row);
      })
    );
    compareTracesRef.value = compareTraces(items, { plainLabel: true });
    compareLayoutRef.value = chartLayout('', 'Balance');
    compareOpen.value = true;
  }

  return {
    view: options.view,
    rows,
    configFilter,
    textFilter,
    selectedPaths,
    actionsByPath,
    compareOpen,
    compareTraces: compareTracesRef,
    compareLayout: compareLayoutRef,
    rebacktestOpen,
    rebacktestDefaults,
    visible,
    configOptions,
    sort,
    dataApi: options.results.dataApi,
    notifyError: (message) => notify(message, 'err'),
    loadLegacyResults,
    loadIfEmpty,
    setSortColumn,
    toggleSelected,
    selectAll,
    deselectAll,
    getSelected,
    toggleAction,
    deleteSelected,
    startRebacktest,
    confirmRebacktest,
    compareSelected,
    dispose(): void {
      /* no timers held */
    },
  };
}
