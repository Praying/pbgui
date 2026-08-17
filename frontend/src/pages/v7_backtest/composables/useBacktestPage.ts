import { computed, ref } from 'vue';
import { createBacktestAdapter, backtestApiBaseFrom, detectBacktestVersion, navItems, viewStateKeyFor, wsUrl, type BacktestAdapter } from '../config';
import { createToastQueue, type ToastItem, type ToastQueue } from '../lib/toast';
import { loadStoredBacktestViewState } from '../lib/viewState';
import { compareSelected, compareSelectedQueue } from './useCompare';
import { useConfigEditor, type ConfigEditorStore } from './useConfigEditor';
import { useConfigs } from './useConfigs';
import { useLegacyResults, type LegacyResultsStore } from './useLegacyResults';
import { useQueueWs, type QueueWsController } from './useQueueWs';
import { useArchive, type ArchiveStore } from './useArchive';
import { useResults, type ResultsStore } from './useResults';
import { useSettings } from './useSettings';
import { useViewState, type ViewStateStore } from './useViewState';
import { queueRebacktests } from '../lib/queueRebacktests';
import type { BacktestPanel, BacktestResultItem, QueueItem, RebacktestFields } from '../types';
import type { I18nT } from '../types.i18n';

/**
 * The M-v7-8 page store: boot chain (:10012-10024), WS wiring
 * (:1267-1337), queue actions (:5190-5226, :5857-5871) and the
 * settings modal flow (:1467-1642). Later tasks extend this store —
 * results (M-v7-10), archive/legacy (M-v7-11), handoffs (M-v7-12).
 */

export type BannerState = 'ok' | 'lost' | 'waiting';

export interface BacktestPageOptions {
  origin: string;
  pathname?: string;
  hash?: string;
  search?: string;
  storage?: Storage;
  versionOverride?: 'v7' | 'v8';
  t: I18nT;
  /** SuiteEditor draft auto-fold (:4769) — wired to the editor panel ref by App. */
  foldSuiteDraft?(): void;
}

export interface BacktestPageStore {
  adapter: BacktestAdapter;
  apiBase: string;
  nav: ReturnType<typeof navItems>;
  view: ViewStateStore;
  settingsStore: ReturnType<typeof useSettings>;
  configsStore: ReturnType<typeof useConfigs>;
  ws: QueueWsController;
  toast: ToastQueue;
  toasts: { value: ToastItem[] };
  banner: { value: BannerState };
  queueItems: { value: QueueItem[] };
  queueBadge: { value: string };
  settingsOpen: { value: boolean };
  settingsCleaning: { value: boolean };
  editor: ConfigEditorStore;
  results: ResultsStore;
  /** The archive panel store (M-v7-11). */
  archive: ArchiveStore;
  /** The legacy panel store — null on v8 (adapter drops the panel). */
  legacy: LegacyResultsStore | null;
  /** rebacktestSelected's modal state (:7882-7956). */
  resultsRebacktestOpen: { value: boolean };
  resultsRebacktestDefaults: { value: RebacktestFields | null };
  /** rebacktestSelected (:7864-7958) — the results ctx Backtest button. */
  startResultsRebacktest(): Promise<void>;
  confirmResultsRebacktest(fields: RebacktestFields): Promise<void>;
  /** compareSelected (:7778-7791) — the results ctx Compare button. */
  compareResults(): Promise<void>;
  /** compareSelectedQueue (:7744-7776) — the queue ctx Compare button. */
  compareQueue(selectedFilenames: readonly string[], queueItems: readonly QueueItem[]): Promise<void>;
  /** viewConfigResults (:4983-5006) — configs/queue "view results". */
  viewConfigResults(name: string): void;
  addConfigToQueue(name: string): Promise<void>;
  deleteConfigs(names: readonly string[], removeResults: boolean): Promise<void>;
  setConfigsSort(column: string): void;
  selectPanel(panel: BacktestPanel, options?: { persist?: boolean }): void;
  startQueueItem(filename: string): Promise<void>;
  restartQueueItem(filename: string): Promise<void>;
  stopQueueItem(filename: string): Promise<void>;
  removeQueueItem(filename: string): Promise<void>;
  clearFinished(): Promise<void>;
  stopAllQueue(): void;
  deleteQueueItems(filenames: string[]): Promise<void>;
  openSettingsModal(): Promise<void>;
  saveSettings(patch: Parameters<ReturnType<typeof useSettings>['saveSettings']>[0]): Promise<void>;
  cleanNow(days: number): Promise<void>;
  notifyError(message: string): void;
  boot(): void;
}

export function useBacktestPage(options: BacktestPageOptions): BacktestPageStore {
  const version = options.versionOverride ?? detectBacktestVersion(options.pathname ?? window.location.pathname);
  const adapter = createBacktestAdapter(version);
  const apiBase = `${options.origin}/api/backtest-${version}`;
  const t = options.t;

  const banner = ref<BannerState>('waiting');
  const settingsOpen = ref(false);
  const settingsCleaning = ref(false);

  const toast = createToastQueue();
  const notifyError = (message: string): void => toast.show(message, 'err');

  /* ── view state: hash > storage > default (:1395-1411, R2) ── */
  const storage =
    options.storage ??
    (typeof localStorage !== 'undefined'
      ? localStorage
      : ({ getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage));
  // R2: read the exact frozen key the legacy page writes — viewStateKeyFor
  // maps v7/v8 → pbgui:v{7,8}_backtest:view_state (NOT `v${version}`, which
  // would double the v and silently never restore).
  const initial = loadStoredBacktestViewState(options.hash ?? window.location.hash, storage.getItem(viewStateKeyFor(version)));
  // :10023 — a stored panel the flavour does not serve (e.g. legacy on v8)
  // never reaches legacy's currentPanel, which keeps its 'configs' default;
  // sorts still apply. Clamp before seeding so the fallback persists.
  const initialPanel = adapter.initialPanels.includes(initial.panel) ? initial.panel : 'configs';
  const view = useViewState({
    version,
    storage,
    initial: { ...initial, panel: initialPanel },
  });
  view.applyViewState({ ...initial, panel: initialPanel });

  /* ── data stores ── */
  const settingsStore = useSettings({ apiBase });
  const configsStore = useConfigs({
    apiBase,
    onError: (message) => toast.show(t('v7backtest.loadConfigsFailed', { msg: message }), 'err'),
  });

  /* ── queue actions (:5190-5226) ── */
  async function post(path: string, okKey: string): Promise<void> {
    try {
      await fetch(apiBase + path, { method: 'POST', credentials: 'same-origin' });
      toast.show(t(okKey), 'ok');
      ws.wsRefresh();
    } catch (error) {
      notifyError(t('v7backtest.failedWithMsg', { msg: errorMessage(error) }));
    }
  }

  async function startQueueItem(filename: string): Promise<void> {
    await post(`/queue/${encodeURIComponent(filename)}/start`, 'v7backtest.started');
  }
  async function restartQueueItem(filename: string): Promise<void> {
    await post(`/queue/${encodeURIComponent(filename)}/restart`, 'v7backtest.restarted');
  }
  async function stopQueueItem(filename: string): Promise<void> {
    await post(`/queue/${encodeURIComponent(filename)}/stop`, 'v7backtest.stopped');
  }
  async function removeQueueItem(filename: string): Promise<void> {
    try {
      await fetch(apiBase + `/queue/${encodeURIComponent(filename)}`, { method: 'DELETE', credentials: 'same-origin' });
      toast.show(t('v7backtest.removed'), 'ok');
      ws.wsRefresh();
    } catch (error) {
      notifyError(t('v7backtest.failedWithMsg', { msg: errorMessage(error) }));
    }
  }

  async function clearFinished(): Promise<void> {
    try {
      const resp = await fetch(apiBase + '/queue/clear-finished', { method: 'POST', credentials: 'same-origin' });
      const data = (await resp.json().catch(() => ({}))) as { removed?: number };
      toast.show(t('v7backtest.clearedItems', { n: Number(data.removed) || 0 }), 'ok');
      ws.wsRefresh();
    } catch (error) {
      notifyError(t('v7backtest.failedWithMsg', { msg: errorMessage(error) }));
    }
  }

  /** stopAllQueue (:5220-5226): stop every running/backtesting item, no wsRefresh. */
  function stopAllQueue(): void {
    const running = ws.items.value.filter((q) => q.status === 'running' || q.status === 'backtesting');
    running.forEach((q) => {
      void fetch(apiBase + `/queue/${encodeURIComponent(q.filename)}/stop`, { method: 'POST', credentials: 'same-origin' }).catch(
        () => {}
      );
    });
    toast.show(t('v7backtest.stoppingItems', { n: running.length }), 'info');
  }

  /** deleteSelectedQueue's delete branch (:5862-5869). */
  async function deleteQueueItems(filenames: string[]): Promise<void> {
    try {
      await Promise.all(
        filenames.map((fn) =>
          fetch(apiBase + `/queue/${encodeURIComponent(fn)}`, { method: 'DELETE', credentials: 'same-origin' })
        )
      );
      toast.show(t('v7backtest.removedItems', { n: filenames.length }), 'ok');
      ws.wsRefresh();
    } catch (error) {
      notifyError(t('v7backtest.failedWithMsg', { msg: errorMessage(error) }));
    }
  }

  /* ── WS (:1267-1337) ── */
  const ws = useQueueWs({
    url: wsUrl(adapter, options.origin),
    getCurrentPanel: () => view.state.panel,
    onJustCompleted: () => {
      // :1289-1291 — refresh config result counts AND the results list
      void configsStore.loadConfigs();
      results.refresh();
    },
    onArchiveUpdate: (panel) => {
      archive.onArchiveUpdate(panel); // :1308-1317
    },
    onBanner: (state) => {
      banner.value = state;
    },
    onSettings: (partial) => {
      settingsStore.applyWs(partial);
    },
  });

  const queueItems = ws.items;
  const queueBadge = computed<string>(() => {
    const running = queueItems.value.filter((q) => q.status === 'running' || q.status === 'backtesting').length;
    const queued = queueItems.value.filter((q) => q.status === 'queued').length;
    return running + queued > 0 ? `${running}/${running + queued}` : '';
  });

  /* ── settings modal (:1560-1566) ── */
  async function openSettingsModal(): Promise<void> {
    settingsOpen.value = true;
    try {
      await settingsStore.loadSettings();
    } catch (error) {
      notifyError(t('v7backtest.failedToRefreshSettings', { msg: errorMessage(error) }));
    }
  }

  async function saveSettings(patch: Parameters<typeof settingsStore.saveSettings>[0]): Promise<void> {
    const saved = await settingsStore.saveSettings(patch);
    if (saved) {
      toast.show(t('v7backtest.settingsSaved'), 'ok');
      settingsOpen.value = false;
    } else {
      notifyError(t('v7backtest.failedWithMsg', { msg: '' }));
    }
  }

  async function cleanNow(days: number): Promise<void> {
    settingsCleaning.value = true;
    try {
      const result = await settingsStore.cleanHlcvsNow(days);
      const targetsText = result.targetLabels.length
        ? t('v7backtest.acrossTargets', { targets: result.targetLabels.join(' + ') })
        : '';
      const errorsText = result.errors > 0 ? t('v7backtest.errorsSuffix', { n: result.errors }) : '';
      const lockedText = result.skipped_locked > 0 ? t('v7backtest.locksSuffix', { n: result.skipped_locked }) : '';
      toast.show(
        t('v7backtest.cleanedDirsMsg', {
          dirs: result.removed,
          targets: targetsText,
          mb: result.freed_mb,
          locked: lockedText,
          errors: errorsText,
        }),
        'ok'
      );
    } catch (error) {
      notifyError(t('v7backtest.cleanupFailed', { msg: errorMessage(error) }));
    } finally {
      settingsCleaning.value = false;
    }
  }

  /* ── panel switching with lazy loads (:1434-1462) ── */
  function selectPanel(panel: BacktestPanel, selectOptions?: { persist?: boolean }): void {
    view.selectPanel(panel, selectOptions);
    if (panel === 'configs') void configsStore.loadIfEmpty();
    if (panel === 'results') results.loadIfEmpty();
    if (panel === 'archive') {
      // :1455 + :1459-1460 — lazy list load, fresh results on return
      void archive.loadIfEmpty();
      if (view.state.archive) void archive.viewArchive(view.state.archive);
    }
    if (panel === 'legacy' && legacy) void legacy.loadIfEmpty();
  }

  /** The metadata router base — /symbols, /tags, /coins/* (adapter :138-142). */
  function metadataApiBase(): string {
    return version === 'v8' ? `${options.origin}/api/v8` : `${options.origin}/api/v7`;
  }

  /* ── results store (M-v7-10) ── */
  const results = useResults({
    apiBase,
    version,
    t,
    notify: (message, kind) => toast.show(message, kind === 'warn' ? 'info' : kind),
    getCurrentPanel: () => view.state.panel,
    onSelectResultsPanel: () => selectPanel('results'),
    initialSort: { ...view.state.sorts.results },
    onSortChange: (spec) => view.setSortSpec('results', spec),
  });

  /* ── archive + legacy stores (M-v7-11) ── */
  const archive = useArchive({
    archiveBase: backtestApiBaseFrom(apiBase, 'v7'), // archives always live on the v7 router
    version,
    t,
    notify: (message, kind) => toast.show(message, kind === 'warn' ? 'info' : kind),
    getCurrentPanel: () => view.state.panel,
    view,
    results,
    wsRefresh: () => ws.wsRefresh(),
    getSettings: () => settingsStore.settings.value,
    getPbguiDataPath: () => editor.getPbguiDataPath(),
    fetchFn: undefined,
    choose: (chooseOptions) => {
      const dialogs = (window as typeof window & { PBGuiDialogs?: { choose?: (o: typeof chooseOptions) => Promise<string | null> } }).PBGuiDialogs;
      return dialogs?.choose ? dialogs.choose(chooseOptions) : Promise.resolve(null);
    },
  });

  const legacy = adapter.isV8
    ? null
    : useLegacyResults({
        apiBase,
        version,
        t,
        notify: (message, kind) => toast.show(message, kind === 'warn' ? 'info' : kind),
        getCurrentPanel: () => view.state.panel,
        view,
        results,
        wsRefresh: () => ws.wsRefresh(),
        selectPanel: () => selectPanel('configs'),
        getPbguiDataPath: () => editor.getPbguiDataPath(),
      });

  /* ── rebacktestSelected (:7864-7958) — the results ctx Backtest flow ── */
  const resultsRebacktestOpen = ref(false);
  const resultsRebacktestDefaults = ref<RebacktestFields | null>(null);

  async function requestJsonFrom(base: string, path: string): Promise<Record<string, unknown>> {
    const response = await fetch(base + path, { credentials: 'same-origin' });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data && typeof data === 'object' ? (data as { detail?: unknown }).detail : undefined;
      throw new Error(String(detail ?? response.statusText));
    }
    return (data && typeof data === 'object' ? (data as Record<string, unknown>) : {});
  }

  function resultsNameFor(path: string): string {
    const matched = results.results.value.find((entry) => entry.path === path);
    return matched?.config_name || path.split('/').slice(-3, -2)[0] || 'rebacktest'; // :7872
  }

  async function startResultsRebacktest(): Promise<void> {
    const selected = results.getSelected();
    if (selected.length === 0) {
      notifyError(t('v7backtest.nothingSelected'));
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      const cfg = await requestJsonFrom(apiBase, `/results/config?path=${encodeURIComponent(selected[0]!)}`);
      if (selected.length === 1) {
        // :7868-7878 — open the config editor with the result's config
        const name = resultsNameFor(selected[0]!);
        const hasSavedSource = !adapter.isV8 || configsStore.configs.value.some((item) => item.name === name);
        selectPanel('configs');
        editor.openEditor(hasSavedSource ? name : '', cfg, null, undefined, { isNew: !hasSavedSource });
        return;
      }
      const backtest = (cfg.backtest as Record<string, unknown> | undefined) ?? {};
      const exchanges = Array.isArray(backtest.exchanges) ? (backtest.exchanges as string[]).map(String) : [];
      const usePbgui = settingsStore.settings.value.use_pbgui_market_data === true || String(settingsStore.settings.value.use_pbgui_market_data).toLowerCase() === 'true';
      resultsRebacktestDefaults.value = {
        start: String(backtest.start_date || '2020-01-01'),
        end: today,
        balance: Number(backtest.starting_balance) || 1000,
        exchanges: exchanges.length > 0 ? exchanges : ['bybit'],
        usePbguiData: usePbgui,
      };
      resultsRebacktestOpen.value = true;
    } catch (error) {
      notifyError(t('v7backtest.failedLoadConfig', { msg: errorMessage(error) }));
    }
  }

  async function confirmResultsRebacktest(fields: RebacktestFields): Promise<void> {
    const selected = results.getSelected();
    let pbguiPath = '';
    if (fields.usePbguiData) {
      try {
        pbguiPath = await editor.getPbguiDataPath();
      } catch (error) {
        notifyError(t('v7backtest.failedGetDataPath', { msg: errorMessage(error) }));
        return;
      }
    }
    await queueRebacktests({
      apiBase,
      paths: selected,
      fields,
      fetchConfig: (path) => requestJsonFrom(apiBase, `/results/config?path=${encodeURIComponent(path)}`),
      nameFor: resultsNameFor,
      pbguiPath,
      t,
      notify: (message, kind) => toast.show(message, kind === 'warn' ? 'info' : kind),
      wsRefresh: () => ws.wsRefresh(),
    });
  }

  const compareResults = compareSelected({
    results,
    t,
    notify: (message, kind) => toast.show(message, kind === 'warn' ? 'info' : kind),
    selectPanel: () => selectPanel('results'),
  });

  const runCompareQueue = compareSelectedQueue({
    results,
    t,
    notify: (message, kind) => toast.show(message, kind === 'warn' ? 'info' : kind),
    selectPanel: () => selectPanel('results'),
  });

  function compareQueue(selectedFilenames: readonly string[], queueItems: readonly QueueItem[]): Promise<void> {
    return runCompareQueue(selectedFilenames, queueItems);
  }

  function viewConfigResults(name: string): void {
    results.viewConfigResults(name);
  }

  /* ── config editor + configs actions (M-v7-9) ── */
  const editor = useConfigEditor({
    apiBase,
    metadataApiBase: metadataApiBase(),
    version,
    getSettings: () => settingsStore.settings.value,
    t,
    notify: (message, kind) => toast.show(message, kind === 'warn' ? 'info' : kind),
    loadConfigs: () => configsStore.loadConfigs(),
    wsRefresh: () => ws.wsRefresh(),
    selectPanel,
    foldSuiteDraft: () => options.foldSuiteDraft?.(),
    confirm: async (confirmOptions) => {
      const dialogs = (window as typeof window & { PBGuiDialogs?: { confirm?: (o: typeof confirmOptions) => Promise<boolean> } }).PBGuiDialogs;
      if (dialogs?.confirm) return dialogs.confirm(confirmOptions);
      return typeof window !== 'undefined' ? window.confirm(confirmOptions.message) : false;
    },
  });

  /** addConfigToQueue (:4972-4981). */
  async function addConfigToQueue(name: string): Promise<void> {
    try {
      await fetch(apiBase + '/queue', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      toast.show(t('v7backtest.addedToQueue'), 'ok');
      ws.wsRefresh();
    } catch (error) {
      notifyError(t('v7backtest.failedWithMsg', { msg: errorMessage(error) }));
    }
  }

  /** deleteSelectedConfigs' delete branch (:5109-5123). */
  async function deleteConfigs(names: readonly string[], removeResults: boolean): Promise<void> {
    if (!names.length) {
      notifyError(t('v7backtest.nothingSelected'));
      return;
    }
    try {
      await Promise.all(
        names.map((name) =>
          fetch(apiBase + `/configs/${encodeURIComponent(name)}?remove_results=${removeResults}`, { method: 'DELETE', credentials: 'same-origin' })
        )
      );
      toast.show(t('v7backtest.deleted'), 'ok');
      await configsStore.loadConfigs();
    } catch (error) {
      notifyError(t('v7backtest.deleteFailed', { msg: errorMessage(error) }));
    }
  }

  function setConfigsSort(column: string): void {
    view.setSort('configs', column);
  }

  /* ── boot (:10012-10024) ── */
  function boot(): void {
    void settingsStore
      .loadSettings()
      .catch((error: unknown) => {
        console.error('Failed to load Backtest settings:', error);
      })
      .then(() => editor.consumeUrlDeepLinks(options.search ?? window.location.search));
    void configsStore.loadConfigs();
    ws.connect();
    if (adapter.initialPanels.includes(view.state.panel)) selectPanel(view.state.panel);
  }

  return {
    adapter,
    apiBase,
    nav: navItems(adapter),
    view,
    settingsStore,
    configsStore,
    editor,
    results,
    archive,
    legacy,
    resultsRebacktestOpen,
    resultsRebacktestDefaults,
    startResultsRebacktest,
    confirmResultsRebacktest,
    compareResults,
    compareQueue,
    viewConfigResults,
    ws,
    toast,
    toasts: toast.items,
    banner,
    queueItems,
    queueBadge,
    settingsOpen,
    settingsCleaning,
    addConfigToQueue,
    deleteConfigs,
    setConfigsSort,
    selectPanel,
    startQueueItem,
    restartQueueItem,
    stopQueueItem,
    removeQueueItem,
    clearFinished,
    stopAllQueue,
    deleteQueueItems,
    openSettingsModal,
    saveSettings,
    cleanNow,
    notifyError,
    boot,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
