import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import { chartLayout, compareTraces } from '../lib/resultCharts';
import { sortResults } from '../lib/resultsModel';
import {
  archiveConfigOptions,
  archiveCoinOptions,
  archiveResultByPath,
  archiveRetestDefaultDays,
  archiveConfigUsesPbguiMarketData,
  archiveStatusLabel,
  archiveStatusLine,
  buildRetestPayload,
  filterArchiveResults,
  filterOptimizeConfigs,
  filterSchedules,
  isOwnArchive,
} from '../lib/archiveModel';
import { backtestApiBaseFrom } from '../config';
import type {
  ArchiveCleanupItem,
  ArchiveMigrationStatus,
  ArchiveMode,
  ArchiveOptimizeConfigItem,
  ArchiveRetestFields,
  ArchiveRetestPayload,
  ArchiveRetestScheduleItem,
  ArchiveSummary,
  BacktestResultItem,
  BacktestVersion,
  RebacktestFields,
  ResultActionKind,
  SortSpec,
} from '../types';
import type { I18nT } from '../types.i18n';
import { createArchiveOptimizeActions, type ArchiveOptimizeSelection } from './useArchiveOptimize';
import { createArchiveRetestFlows } from './useArchiveRetest';
import type { ResultDataApi, ResultsStore } from './useResults';
import type { ViewStateStore } from './useViewState';

/**
 * The archive store — the port of the archive panel's page logic
 * (v7_backtest.html :7793-8161 + :8822-9463): the archive list + view
 * switching (:8825-8978), the three results modes (:8999-9463), the
 * inotify-driven refresh debounce (:8840-8862 via WS :1308-1317), the
 * retest-replace flow (:8044-8161), the archive rebacktest flow
 * (:7970-8042), the optimize-configs import family (:9269-9421) and
 * compareSelectedArchive (:7793-7827). Archives always live on the v7
 * router (backtest_editor_adapter.js:146-148).
 */

export const ARCHIVE_REFRESH_DEBOUNCE_MS = 750;

export interface ArchiveScorePreview {
  payload: {
    score_version?: string;
    scored?: number;
    total?: number;
    generated_at?: string;
    readme_markdown?: string;
    markdown?: string;
    [key: string]: unknown;
  };
  rebuilt: boolean;
}

export interface UseArchiveOptions {
  /** origin + /api/backtest-v7 (archives always route here). */
  archiveBase: string;
  version: BacktestVersion;
  t: I18nT;
  notify(message: string, kind: 'ok' | 'err' | 'info' | 'warn'): void;
  getCurrentPanel(): string;
  view: ViewStateStore;
  /** The results store supplies the row-routed data API (charts + compare). */
  results: ResultsStore;
  wsRefresh(): void;
  getSettings(): { use_pbgui_market_data?: boolean | string };
  getPbguiDataPath(): Promise<string>;
  fetchFn?: typeof fetch;
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
  /** PBGuiDialogs.confirm — reserved for future confirm flows. */
  confirm?(options: { title: string; message: string }): Promise<boolean>;
  /** PBGuiDialogs.choose — the import-collision picker (:9350-9360). */
  choose?(options: {
    title: string;
    message: string;
    detail?: string;
    actions: Array<{ label: string; value: string | null; danger?: boolean; primary?: boolean }>;
  }): Promise<string | null>;
}

export interface ArchiveStore {
  /** The page view state (panel + archive selection + sorts, R2). */
  readonly view: ViewStateStore;
  archives: { value: ArchiveSummary[] };
  ownArchiveName: { value: string };
  selectedName: { value: string };
  mode: { value: ArchiveMode };
  results: { value: BacktestResultItem[] };
  optimizeConfigs: { value: ArchiveOptimizeConfigItem[] };
  schedules: { value: ArchiveRetestScheduleItem[] };
  runs: { value: ArchiveRetestScheduleItem[] };
  migrationStatus: { value: ArchiveMigrationStatus | null };
  configFilter: { value: string };
  coinFilter: { value: string };
  textFilter: { value: string };
  selectedPaths: { value: Set<string> };
  actionsByPath: { value: Readonly<Record<string, ReadonlySet<ResultActionKind>>> };
  compareOpen: { value: boolean };
  compareTraces: { value: unknown[] };
  compareLayout: { value: unknown };
  scorePreview: { value: ArchiveScorePreview | null };
  optimizeConfigJson: { value: unknown };
  optimizeViewOpen: { value: boolean };
  selectedOptimize: { value: ArchiveOptimizeSelection | null };
  rebacktestOpen: { value: boolean };
  rebacktestDefaults: { value: RebacktestFields | null };
  retestOpen: { value: boolean };
  retestDefaults: { value: { days: number; balance: number; exchanges: string[]; usePbguiData: boolean } | null };
  visible: { value: BacktestResultItem[] };
  visiblePaths: { value: string[] };
  isOwn: { value: boolean };
  statusLine: { value: string };
  schedulesVisible: { value: ArchiveRetestScheduleItem[] };
  optimizeVisible: { value: ArchiveOptimizeConfigItem[] };
  configOptions: { value: string[] };
  coinOptions: { value: string[] };
  sort: { value: SortSpec };
  dataApi: ResultDataApi;
  notifyError(message: string): void;
  notifyOk(message: string): void;
  loadArchives(): Promise<void>;
  loadIfEmpty(): Promise<void>;
  viewArchive(name: string, options?: { silent?: boolean }): Promise<void>;
  closeArchive(): void;
  setMode(mode: ArchiveMode): void;
  setSortColumn(column: string): void;
  toggleSelected(path: string): void;
  setSelected(paths: readonly string[]): void;
  selectAll(paths: readonly string[]): void;
  deselectAll(): void;
  getSelected(): string[];
  toggleAction(path: string, kind: ResultActionKind): void;
  deleteArchive(name: string): Promise<void>;
  addArchive(name: string, url: string): Promise<void>;
  deleteSelected(): Promise<void>;
  renameConfig(path: string, newName: string): Promise<void>;
  previewRemoveLiquidated(paths: readonly string[], scope: 'selected_results' | 'visible_results'): Promise<ArchiveCleanupItem[]>;
  applyRemoveLiquidated(paths: readonly string[], scope: 'selected_results' | 'visible_results'): Promise<void>;
  previewRemoveDuplicates(paths: readonly string[], scope: 'selected_results' | 'visible_results'): Promise<ArchiveCleanupItem[]>;
  applyRemoveDuplicates(paths: readonly string[], scope: 'selected_results' | 'visible_results'): Promise<void>;
  previewScores(): Promise<void>;
  rebuildScores(): Promise<void>;
  runSchedule(id: string): Promise<void>;
  toggleSchedule(id: string): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
  startRebacktest(): Promise<void>;
  confirmRebacktest(fields: RebacktestFields): Promise<void>;
  startRetestReplace(): Promise<void>;
  confirmRetestReplace(fields: ArchiveRetestFields): Promise<void>;
  confirmRetestSchedule(fields: ArchiveRetestFields, schedule: { cadence: string; time: string; weekday: number }): Promise<void>;
  viewOptimizeConfig(path: string, version: string, name?: string): Promise<void>;
  importOptimizeConfig(path: string, name: string, version: string): Promise<{ name?: string; optimize_version?: string } | null>;
  deleteOptimizeConfig(path: string, name: string, version: string): Promise<void>;
  optimizeFromConfig(path: string, name: string, version: string): Promise<void>;
  compareSelected(): Promise<void>;
  onArchiveUpdate(panel: string): void;
  dispose(): void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function useArchive(options: UseArchiveOptions): ArchiveStore {
  const fetchFn = options.fetchFn ?? fetch;
  const timers = options.timers ?? { setTimeout, clearTimeout };
  const t = options.t;
  const notify = options.notify;

  const archives = ref<ArchiveSummary[]>([]);
  const ownArchiveName = ref('');
  const results = ref<BacktestResultItem[]>([]);
  const optimizeConfigs = ref<ArchiveOptimizeConfigItem[]>([]);
  const schedules = ref<ArchiveRetestScheduleItem[]>([]);
  const runs = ref<ArchiveRetestScheduleItem[]>([]);
  const migrationStatus = ref<ArchiveMigrationStatus | null>(null);
  const configFilter = ref('');
  const coinFilter = ref('');
  const textFilter = ref('');
  const selectedPaths = ref<Set<string>>(new Set());
  const actionsByPath = ref<Record<string, Set<ResultActionKind>>>({});
  const compareOpen = ref(false);
  const compareTracesRef = ref<unknown[]>([]);
  const compareLayoutRef = ref<unknown>({});
  const scorePreview = ref<ArchiveScorePreview | null>(null);
  const rebacktestOpen = ref(false);
  const rebacktestDefaults = ref<RebacktestFields | null>(null);

  let listRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let listRefreshInFlight = false;
  let archiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let archiveRefreshInFlight = false;

  const selectedName = computed(() => options.view.state.archive);
  const mode = computed<ArchiveMode>(() => options.view.state.archiveMode);
  const isOwn = computed(() => isOwnArchive(archives.value, ownArchiveName.value, selectedName.value));
  const sort = computed<SortSpec>(() => options.view.state.sorts.archive);
  const visible = computed(() => sortResults(filterArchiveResults(results.value, configFilter.value, coinFilter.value, textFilter.value), sort.value));
  const visiblePaths = computed(() => visible.value.map((row) => row.path));
  const configOptions = computed(() => archiveConfigOptions(results.value));
  const coinOptions = computed(() => archiveCoinOptions(results.value));
  const schedulesVisible = computed(() => filterSchedules(schedules.value, textFilter.value));
  const optimizeVisible = computed(() => filterOptimizeConfigs(optimizeConfigs.value, textFilter.value));
  const statusLine = computed(() =>
    archiveStatusLine(
      archiveStatusLabel(migrationStatus.value, archives.value, selectedName.value),
      optimizeConfigs.value.length,
      schedules.value.length,
      t
    )
  );

  /* ── fetch helpers (apiFetchFrom semantics :1132-1149) ── */

  async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetchFn(url, { credentials: 'same-origin', ...init });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = objectOf(data).detail;
      throw new Error(String((detail && typeof detail === 'object' ? objectOf(detail).message : detail) ?? response.statusText));
    }
    return objectOf(data);
  }

  function archiveUrl(path: string): string {
    return options.archiveBase + path;
  }

  function archiveFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    return requestJson(archiveUrl(path), init);
  }

  /** archiveResultApiFetch (:1175-1177) — route by the archived row's version. */
  function archiveResultFetch(path: string, endpoint: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const row = archiveResultByPath(results.value, path);
    const base = backtestApiBaseFrom(options.archiveBase, row.backtest_version || 'v7');
    return requestJson(base + endpoint, init);
  }

  /* ── archive list (:8825-8888) ── */

  async function loadArchives(): Promise<void> {
    try {
      const data = await archiveFetch('/archives');
      archives.value = Array.isArray(data.archives) ? (data.archives as ArchiveSummary[]) : [];
      const own = archives.value.find((archive) => archive && archive.is_own);
      if (own) ownArchiveName.value = own.name; // :8829 — keep the last known own name
    } catch (error) {
      notify(t('v7backtest.loadArchivesFailed', { msg: messageOf(error) }), 'err');
    }
  }

  async function loadIfEmpty(): Promise<void> {
    if (archives.value.length === 0) await loadArchives();
  }

  /* ── view switching (:8890-8978) ── */

  async function viewArchive(name: string, viewOptions?: { silent?: boolean }): Promise<void> {
    options.view.openArchive(name, mode.value);
    try {
      const [resultPayload, optimizePayload, schedulePayload] = await Promise.all([
        archiveFetch(`/archives/${encodeURIComponent(name)}/results`),
        archiveFetch(`/archives/${encodeURIComponent(name)}/optimize-configs`).catch(() => ({ configs: [] }) as Record<string, unknown>),
        archiveFetch(`/archives/${encodeURIComponent(name)}/retest-schedules`).catch(() => ({ schedules: [], runs: [] }) as Record<string, unknown>),
      ]);
      results.value = Array.isArray(resultPayload.results) ? (resultPayload.results as BacktestResultItem[]) : [];
      optimizeConfigs.value = Array.isArray(optimizePayload.configs) ? (optimizePayload.configs as ArchiveOptimizeConfigItem[]) : [];
      schedules.value = Array.isArray(schedulePayload.schedules) ? (schedulePayload.schedules as ArchiveRetestScheduleItem[]) : [];
      runs.value = Array.isArray(schedulePayload.runs) ? (schedulePayload.runs as ArchiveRetestScheduleItem[]) : [];
      migrationStatus.value = (resultPayload.migration_status as ArchiveMigrationStatus | null) ?? null;
      selectedPaths.value = pruneToPaths(selectedPaths.value, results.value); // setSelectedArchiveResults (:9045-9047, :9128)
      // :9042 — schedules mode clamps to backtests for foreign archives
      if (mode.value === 'schedules' && !isOwn.value) options.view.setArchiveMode('backtests');
    } catch (error) {
      if (options.getCurrentPanel() === 'archive' && viewOptions?.silent !== true) {
        notify(t('v7backtest.loadFailed', { msg: messageOf(error) }), 'err');
      }
    }
  }

  function closeArchive(): void {
    options.view.clearArchive();
    optimizeConfigs.value = [];
    schedules.value = [];
    runs.value = [];
    migrationStatus.value = null;
    selectedPaths.value = new Set();
    actionsByPath.value = {};
    compareOpen.value = false;
    compareTracesRef.value = [];
    optimize.selectedOptimize.value = null;
    optimize.optimizeConfigJson.value = null;
    optimize.optimizeViewOpen.value = false;
  }

  /** setArchiveResultsMode (:8999-9011) — own-only schedules, unknown → backtests. */
  function setMode(next: ArchiveMode): void {
    let mode_ = next;
    if (mode_ === 'schedules' && !isOwn.value) mode_ = 'backtests';
    options.view.setArchiveMode(mode_ === 'optimize' || mode_ === 'schedules' ? mode_ : 'backtests');
  }

  /* ── inotify refresh debounce (:8840-8862, WS :1308-1317) ── */

  function scheduleArchivesListRefresh(): void {
    if (listRefreshTimer !== null || listRefreshInFlight) return;
    listRefreshTimer = timers.setTimeout(() => {
      listRefreshTimer = null;
      if (options.getCurrentPanel() !== 'archive' || selectedName.value) return;
      listRefreshInFlight = true;
      Promise.resolve(loadArchives())
        .catch(() => undefined)
        .then(() => {
          listRefreshInFlight = false;
        });
    }, ARCHIVE_REFRESH_DEBOUNCE_MS);
  }

  function scheduleArchiveRefresh(): void {
    if (archiveRefreshTimer !== null || archiveRefreshInFlight) return;
    archiveRefreshTimer = timers.setTimeout(() => {
      archiveRefreshTimer = null;
      if (options.getCurrentPanel() !== 'archive' || !selectedName.value) return;
      archiveRefreshInFlight = true;
      Promise.resolve(viewArchive(selectedName.value, { silent: true }))
        .catch(() => undefined)
        .then(() => {
          archiveRefreshInFlight = false;
        });
    }, ARCHIVE_REFRESH_DEBOUNCE_MS);
  }

  /** The WS archive_update delegation (:1308-1317). */
  function onArchiveUpdate(panel: string): void {
    if (panel === 'archive') {
      if (selectedName.value) scheduleArchiveRefresh();
      else scheduleArchivesListRefresh();
      return;
    }
    archives.value = []; // invalidate so the next visit fetches fresh (:1315)
  }

  /* ── selection + sort (:5465-5477, :6021-6047) ── */

  function pruneToPaths(current: ReadonlySet<string>, rows: readonly BacktestResultItem[]): Set<string> {
    const rendered = new Set(rows.map((row) => row.path));
    return new Set([...current].filter((path) => rendered.has(path)));
  }

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

  function setSortColumn(column: string): void {
    const current = sort.value;
    options.view.setSortSpec('archive', current.col === column ? { col: column, asc: !current.asc } : { col: column, asc: false });
  }

  /* ── archive list actions (:9013-9027, :9465-9483) ── */

  async function deleteArchive(name: string): Promise<void> {
    try {
      await archiveFetch(`/archives/${encodeURIComponent(name)}`, { method: 'DELETE' });
      notify(t('v7backtest.archiveDeleted'), 'ok');
      if (selectedName.value === name) closeArchive();
      await loadArchives();
    } catch (error) {
      notify(t('v7backtest.deleteFailed', { msg: messageOf(error) }), 'err');
    }
  }

  async function addArchive(name: string, url: string): Promise<void> {
    try {
      await archiveFetch('/archives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url }),
      });
      notify(t('v7backtest.archiveCloned'), 'ok');
      await loadArchives();
    } catch (error) {
      notify(t('v7backtest.failedWithMsg', { msg: messageOf(error) }), 'err');
    }
  }

  /* ── archive result actions (:6063-6214) ── */

  async function deleteSelected(): Promise<void> {
    if (!isOwn.value) {
      notify(t('v7backtest.deleteOwnOnly'), 'err');
      return;
    }
    const selected = getSelected();
    if (selected.length === 0) {
      notify(t('v7backtest.nothingSelected'), 'err');
      return;
    }
    const name = selectedName.value;
    try {
      await Promise.all(
        selected.map((path) => archiveFetch(`/archives/${encodeURIComponent(name)}/results?path=${encodeURIComponent(path)}`, { method: 'DELETE' }))
      );
      notify(t('v7backtest.deleted'), 'ok');
      await viewArchive(name);
    } catch (error) {
      notify(t('v7backtest.deleteFailed', { msg: messageOf(error) }), 'err');
    }
  }

  async function renameConfig(path: string, newName: string): Promise<void> {
    try {
      const response = await archiveFetch(`/archives/${encodeURIComponent(selectedName.value)}/results/rename-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, new_name: newName }),
      });
      const renamedPath = String(response.path || path);
      notify(response.changed === false ? 'Name unchanged' : `Archive config renamed to ${String(response.new_name || newName)}`, 'ok');
      await viewArchive(selectedName.value);
      setSelected([renamedPath]);
    } catch (error) {
      notify(t('v7backtest.renameFailed', { msg: messageOf(error) }), 'err');
    }
  }

  async function cleanupPreview(kind: 'remove-liquidated' | 'remove-duplicates', paths: readonly string[], scope: string): Promise<ArchiveCleanupItem[]> {
    const data = await archiveFetch(`/archives/${encodeURIComponent(selectedName.value)}/results/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, scope, dry_run: true }),
    });
    return Array.isArray(data.items) ? (data.items as ArchiveCleanupItem[]) : [];
  }

  async function cleanupApply(kind: 'remove-liquidated' | 'remove-duplicates', paths: readonly string[], scope: string): Promise<void> {
    try {
      const data = await archiveFetch(`/archives/${encodeURIComponent(selectedName.value)}/results/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, scope, dry_run: false }),
      });
      notify(t(kind === 'remove-liquidated' ? 'v7backtest.removedLiquidated' : 'v7backtest.removedDuplicates', { n: Number(data.removed) || 0 }), 'ok');
      await viewArchive(selectedName.value);
    } catch (error) {
      notify(t('v7backtest.cleanupFailed', { msg: messageOf(error) }), 'err');
    }
  }

  async function previewRemoveLiquidated(paths: readonly string[], scope: 'selected_results' | 'visible_results'): Promise<ArchiveCleanupItem[]> {
    try {
      const items = await cleanupPreview('remove-liquidated', paths, scope);
      if (items.length === 0) notify(t('v7backtest.noLiquidatedFound'), 'ok');
      return items;
    } catch (error) {
      notify(t('v7backtest.dryRunFailed', { msg: messageOf(error) }), 'err');
      return [];
    }
  }

  function applyRemoveLiquidated(paths: readonly string[], scope: 'selected_results' | 'visible_results'): Promise<void> {
    return cleanupApply('remove-liquidated', paths, scope);
  }

  async function previewRemoveDuplicates(paths: readonly string[], scope: 'selected_results' | 'visible_results'): Promise<ArchiveCleanupItem[]> {
    try {
      const items = await cleanupPreview('remove-duplicates', paths, scope);
      if (items.length === 0) notify(t('v7backtest.noDuplicatesFound'), 'ok');
      return items;
    } catch (error) {
      notify(t('v7backtest.dryRunFailed', { msg: messageOf(error) }), 'err');
      return [];
    }
  }

  function applyRemoveDuplicates(paths: readonly string[], scope: 'selected_results' | 'visible_results'): Promise<void> {
    return cleanupApply('remove-duplicates', paths, scope);
  }

  /* ── scores (:6196-6214) ── */

  async function previewScores(): Promise<void> {
    if (!selectedName.value) {
      notify(t('v7backtest.clickViewFirst'), 'err');
      return;
    }
    notify(t('v7backtest.calculatingScores'), 'info');
    try {
      const payload = await archiveFetch(`/archives/${encodeURIComponent(selectedName.value)}/scores/preview`);
      scorePreview.value = { payload, rebuilt: false };
    } catch (error) {
      notify(t('v7backtest.scorePreviewFailed', { msg: messageOf(error) }), 'err');
    }
  }

  async function rebuildScores(): Promise<void> {
    if (!selectedName.value || !isOwn.value) {
      notify(t('v7backtest.scoreRebuildOwnOnly'), 'err');
      return;
    }
    notify(t('v7backtest.updatingScores'), 'info');
    try {
      const payload = await archiveFetch(`/archives/${encodeURIComponent(selectedName.value)}/scores/rebuild`, { method: 'POST' });
      notify(t('v7backtest.updatedScores', { n: Number(payload.scored) || 0 }), 'ok');
      scorePreview.value = { payload, rebuilt: true };
      await viewArchive(selectedName.value);
    } catch (error) {
      notify(t('v7backtest.scoreRebuildFailed', { msg: messageOf(error) }), 'err');
    }
  }

  /* ── retest schedules (:9202-9226) ── */

  async function runSchedule(id: string): Promise<void> {
    if (!isOwn.value) {
      notify(t('v7backtest.scheduleOwnOnly'), 'err');
      return;
    }
    try {
      const data = await archiveFetch(`/archives/${encodeURIComponent(selectedName.value)}/retest-schedules/${encodeURIComponent(id)}/run`, { method: 'POST' });
      notify(t('v7backtest.queuedArchiveRetests', { n: Number(data.queued) || 0 }), 'ok');
      await viewArchive(selectedName.value);
      options.wsRefresh();
    } catch (error) {
      notify(t('v7backtest.runFailed', { msg: messageOf(error) }), 'err');
    }
  }

  async function toggleSchedule(id: string): Promise<void> {
    if (!isOwn.value) {
      notify(t('v7backtest.scheduleOwnOnly'), 'err');
      return;
    }
    try {
      await archiveFetch(`/archives/${encodeURIComponent(selectedName.value)}/retest-schedules/${encodeURIComponent(id)}/toggle`, { method: 'POST' });
      notify(t('v7backtest.scheduleUpdated'), 'ok');
      await viewArchive(selectedName.value);
    } catch (error) {
      notify(t('v7backtest.updateFailed', { msg: messageOf(error) }), 'err');
    }
  }

  async function deleteSchedule(id: string): Promise<void> {
    if (!isOwn.value) {
      notify(t('v7backtest.scheduleOwnOnly'), 'err');
      return;
    }
    try {
      await archiveFetch(`/archives/${encodeURIComponent(selectedName.value)}/retest-schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
      notify(t('v7backtest.scheduleDeleted'), 'ok');
      await viewArchive(selectedName.value);
    } catch (error) {
      notify(t('v7backtest.deleteFailed', { msg: messageOf(error) }), 'err');
    }
  }

  /* ── archive rebacktest (:7970-8042) ── */

  async function startRebacktest(): Promise<void> {
    const selected = getSelected();
    if (selected.length === 0) {
      notify(t('v7backtest.nothingSelected'), 'err');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      const [cfg, pbgui] = await Promise.all([
        archiveResultFetch(selected[0]!, `/results/config?path=${encodeURIComponent(selected[0]!)}`),
        options.getPbguiDataPath().catch(() => ''),
      ]);
      const backtest = objectOf(cfg.backtest);
      const exchanges = Array.isArray(backtest.exchanges) ? (backtest.exchanges as string[]).map(String) : [];
      rebacktestDefaults.value = {
        start: String(backtest.start_date || '2020-01-01'),
        end: String(backtest.end_date || today),
        balance: Number(backtest.starting_balance) || 1000,
        exchanges: exchanges.length > 0 ? exchanges : ['bybit'],
        usePbguiData: archiveConfigUsesPbguiMarketData(cfg, pbgui),
      };
      rebacktestOpen.value = true;
    } catch (error) {
      notify(t('v7backtest.failedLoadConfig', { msg: messageOf(error) }), 'err');
    }
  }

  async function confirmRebacktest(fields: RebacktestFields): Promise<void> {
    const selected = getSelected();
    try {
      const data = await archiveFetch(`/archives/${encodeURIComponent(selectedName.value)}/results/rebacktest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: selected,
          overrides: {
            start_date: fields.start,
            end_date: fields.end,
            starting_balance: fields.balance,
            exchanges: fields.exchanges,
            use_pbgui_market_data: fields.usePbguiData,
          },
        }),
      });
      notify(t('v7backtest.queuedBacktests', { n: Number(data.queued) || selected.length }), 'ok');
      options.wsRefresh();
    } catch (error) {
      notify(t('v7backtest.failedWithMsg', { msg: messageOf(error) }), 'err');
    }
  }

  const retest = createArchiveRetestFlows({
    archiveFetch,
    archiveResultFetch,
    getSelected,
    getSelectedName: () => selectedName.value,
    isOwn: () => isOwn.value,
    getSettings: options.getSettings,
    t,
    notify,
    viewArchive,
    setMode,
    wsRefresh: options.wsRefresh,
  });

  const optimize = createArchiveOptimizeActions({
    fetchFn,
    archiveFetch,
    archiveUrl,
    getSelectedName: () => selectedName.value,
    viewArchive,
    notify,
    t,
    choose: options.choose,
  });

  /* ── compareSelectedArchive (:7793-7827) ── */

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
      selected.map((path) => options.results.dataApi.beForCompare(path, archiveResultByPath(results.value, path)))
    );
    compareTracesRef.value = compareTraces(items);
    compareLayoutRef.value = chartLayout('', 'Balance');
    compareOpen.value = true;
  }

  function dispose(): void {
    if (listRefreshTimer !== null) {
      timers.clearTimeout(listRefreshTimer);
      listRefreshTimer = null;
    }
    if (archiveRefreshTimer !== null) {
      timers.clearTimeout(archiveRefreshTimer);
      archiveRefreshTimer = null;
    }
  }

  if (getCurrentScope()) onScopeDispose(dispose);

  return {
    view: options.view,
    archives,
    ownArchiveName,
    selectedName,
    mode,
    results,
    optimizeConfigs,
    schedules,
    runs,
    migrationStatus,
    configFilter,
    coinFilter,
    textFilter,
    selectedPaths,
    actionsByPath,
    compareOpen,
    compareTraces: compareTracesRef,
    compareLayout: compareLayoutRef,
    scorePreview,
    optimizeConfigJson: optimize.optimizeConfigJson,
    optimizeViewOpen: optimize.optimizeViewOpen,
    selectedOptimize: optimize.selectedOptimize,
    rebacktestOpen,
    rebacktestDefaults,
    retestOpen: retest.retestOpen,
    retestDefaults: retest.retestDefaults,
    visible,
    visiblePaths,
    isOwn,
    statusLine,
    schedulesVisible,
    optimizeVisible,
    configOptions,
    coinOptions,
    sort,
    dataApi: options.results.dataApi,
    notifyError: (message) => notify(message, 'err'),
    notifyOk: (message) => notify(message, 'ok'),
    loadArchives,
    loadIfEmpty,
    viewArchive,
    closeArchive,
    setMode,
    setSortColumn,
    toggleSelected,
    setSelected,
    selectAll,
    deselectAll,
    getSelected,
    toggleAction,
    deleteArchive,
    addArchive,
    deleteSelected,
    renameConfig,
    previewRemoveLiquidated,
    applyRemoveLiquidated,
    previewRemoveDuplicates,
    applyRemoveDuplicates,
    previewScores,
    rebuildScores,
    runSchedule,
    toggleSchedule,
    deleteSchedule,
    startRebacktest,
    confirmRebacktest,
    startRetestReplace: retest.startRetestReplace,
    confirmRetestReplace: retest.confirmRetestReplace,
    confirmRetestSchedule: retest.confirmRetestSchedule,
    viewOptimizeConfig: optimize.viewOptimizeConfig,
    importOptimizeConfig: optimize.importOptimizeConfig,
    deleteOptimizeConfig: optimize.deleteOptimizeConfig,
    optimizeFromConfig: optimize.optimizeFromConfig,
    compareSelected,
    onArchiveUpdate,
    dispose,
  };
}
