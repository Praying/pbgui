/** Reactive data and action layer for the shared PBv7/PBv8 Optimize workbench. */
import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue';
import { apiFetch, ApiError } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import type { OptimizeAdapter, OptimizePanel } from '../config';
import { optimizeWsUrl, readInitialPanel, readOpenConfig } from '../config';
import {
  buildEditorDraft,
  collectEditorConfig,
  getPath,
  isObject,
  normalizeParetoColumns,
  orderParetoMetrics,
  readStoredParetoColumns,
  type OptimizeEditorDraft,
} from '../lib/configModel';
import type {
  ConfigPayload,
  ConfigSummary,
  OptimizeSettings,
  ParetoItem,
  ParetoMeta,
  QueueItem,
  ResultSummary,
} from '../types';

export interface OptimizePageOptions {
  adapter: OptimizeAdapter;
  notify?: (message: string, kind?: 'info' | 'success' | 'error') => void;
  search?: string;
}

export interface QueueConfigCandidate {
  name: string;
  path: string;
}

export interface QueueConfigChoice {
  queueFilename: string;
  configPath: string;
  message: string;
  candidates: QueueConfigCandidate[];
  intent: 'edit' | 'start' | 'stop' | 'restart' | 'requeue';
}

function detailOf(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return error instanceof Error ? error.message : String(error);
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export function useOptimizePage(options: OptimizePageOptions) {
  const { adapter } = options;
  const panel = ref<OptimizePanel>(readInitialPanel(options.search));
  const settings = ref<OptimizeSettings>({
    autostart: false,
    cpu: 1,
    cpu_override: true,
    use_pbgui_market_data: false,
    cpu_max: 1,
    host_cpu_count: 1,
  });
  const configs = ref<ConfigSummary[]>([]);
  const queue = ref<QueueItem[]>([]);
  const results = ref<ResultSummary[]>([]);
  const paretos = ref<ParetoItem[]>([]);
  const paretoMeta = ref<ParetoMeta>({});
  const paretoMetricColumns = ref<string[]>([]);
  const paretoColumnsLoaded = ref(false);
  let paretoMetricReloadTimer: ReturnType<typeof setTimeout> | null = null;
  const configSearch = ref('');
  const resultSearch = ref('');
  const configSort = ref<{ key: string; direction: 'asc' | 'desc' }>({ key: 'modified', direction: 'desc' });
  const queueSort = ref<{ key: string; direction: 'asc' | 'desc' }>({ key: 'order', direction: 'asc' });
  const resultSort = ref<{ key: string; direction: 'asc' | 'desc' }>({ key: 'modified', direction: 'desc' });
  const paretoSort = ref<{ key: string; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const selectedConfigs = ref(new Set<string>());
  const selectedQueue = ref(new Set<string>());
  const selectedResults = ref(new Set<string>());
  const selectedParetos = ref(new Set<string>());
  const selectedResultPath = ref('');
  const selectedResultName = ref('');
  const editingName = ref('');
  const editorSourceName = ref('');
  const editorQueueFilename = ref('');
  const editorReturnPanel = ref<OptimizePanel>('configs');
  const editorName = ref('');
  const editorJson = ref('');
  const editorDraft = ref<OptimizeEditorDraft | null>(null);
  const editorParamStatus = ref<Record<string, unknown>>({});
  const editorError = ref('');
  const editorOpen = ref(false);
  const settingsOpen = ref(false);
  const queueConfigChoice = ref<QueueConfigChoice | null>(null);
  const loading = ref(false);
  const resultsLoading = ref(false);
  const error = ref('');
  const runtimeWarning = ref('');
  const connected = ref(false);
  const ws = ref<WebSocket | null>(null);
  let wsGeneration = 0;
  let disposed = false;

  const filteredConfigs = computed(() => sortRows(filterRows(configs.value, configSearch.value, ['name', 'strategy', 'exchange', 'coins_text']), configSort.value));
  const filteredQueue = computed(() => sortRows(filterRows(queue.value, configSearch.value, ['name', 'filename', 'status', 'exchange']), queueSort.value));
  const filteredResults = computed(() => sortRows(filterRows(results.value, resultSearch.value, ['name', 'result', 'path', 'strategy', 'mode']), resultSort.value));
  const filteredParetos = computed(() => sortRows(filterRows(paretos.value, resultSearch.value, ['name', 'path']), paretoSort.value));

  function sortRows<T extends Record<string, unknown>>(rows: T[], sort: { key: string; direction: 'asc' | 'desc' }): T[] {
    const direction = sort.direction === 'desc' ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const av = sort.key.startsWith('summary:') ? getPath(a.summary, sort.key.slice(8)) : a[sort.key];
      const bv = sort.key.startsWith('summary:') ? getPath(b.summary, sort.key.slice(8)) : b[sort.key];
      const an = Number(av); const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * direction;
      return String(av ?? '').localeCompare(String(bv ?? '')) * direction;
    });
  }

  function filterRows<T extends Record<string, unknown>>(rows: T[], term: string, fields: string[]): T[] {
    const normalized = term.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => fields.some((field) => String(row[field] ?? '').toLowerCase().includes(normalized)));
  }

  function notify(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
    options.notify?.(message, kind);
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    return apiFetch<T>(`${adapter.apiBase}${path}`, init);
  }

  async function requestQueueConfig(filename: string): Promise<ConfigPayload> {
    const headers = new Headers();
    const token = getBoot().token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${adapter.apiBase}/queue/${encodeURIComponent(filename)}/config`, { headers });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = isObject(data) ? data.detail : undefined;
      const message = isObject(detail) && typeof detail.message === 'string'
        ? detail.message
        : typeof detail === 'string' ? detail : response.statusText;
      throw Object.assign(new Error(message || `HTTP ${response.status}`), { status: response.status, detail });
    }
    return data as ConfigPayload;
  }

  function queueChoiceFromError(error: unknown, filename: string, intent: QueueConfigChoice['intent'] = 'edit'): QueueConfigChoice | null {
    const detail = (error as { detail?: unknown } | null)?.detail;
    if (!isObject(detail) || !Array.isArray(detail.candidates)) return null;
    const candidates = detail.candidates
      .filter(isObject)
      .map((item) => ({ name: String(item.name || ''), path: String(item.path || '') }))
      .filter((item) => item.name && item.path);
    if (!candidates.length) return null;
    return {
      queueFilename: String(detail.queue_filename || filename),
      configPath: String(detail.config_path || ''),
      message: String(detail.message || ''),
      candidates,
      intent,
    };
  }

  let settingsGeneration = 0;
  let queueGeneration = 0;
  let resultsGeneration = 0;
  let paretoGeneration = 0;
  async function loadSettings(): Promise<void> {
    const generation = ++settingsGeneration;
    runtimeWarning.value = '';
    try {
      const data = await request<OptimizeSettings>('/settings');
      if (generation !== settingsGeneration) return;
      settings.value = { ...settings.value, ...data };
      const metadata = await request<Record<string, unknown>>('/metadata');
      if (generation !== settingsGeneration) return;
      let limitsMeta: unknown = metadata;
      if (isObject(metadata.limits_meta)) {
        limitsMeta = metadata.limits_meta;
      } else if (isObject(metadata.limits)) {
        const limits = metadata.limits;
        const scoring = isObject(metadata.scoring) ? metadata.scoring : {};
        limitsMeta = {
          metrics_by_group: { all: Array.isArray(limits.metrics) ? limits.metrics : [] },
          all_valid_metrics: Array.isArray(limits.metrics) ? limits.metrics : [],
          penalize_if_options: Array.isArray(limits.operators) ? limits.operators : [],
          stat_options: ['', ...(Array.isArray(limits.statistics) ? limits.statistics : [])],
          limit_basis_field: limits.basis_field || 'stat',
          scoring_basis_field: scoring.basis_field || limits.scoring_basis_field || 'aggregate',
          goal_options: Array.isArray(scoring.goals) ? scoring.goals : ['min', 'max'],
          default_goal_map: isObject(scoring.default_goals) ? scoring.default_goals : {},
        };
      }
      settings.value = { ...settings.value, ...metadata, limitsMeta };
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 503) {
        runtimeWarning.value = caught.detail;
        return;
      }
      throw caught;
    }
  }

  async function loadConfigs(): Promise<void> {
    const data = await request<{ configs?: ConfigSummary[] }>('/configs');
    configs.value = data.configs ?? [];
  }

  async function loadQueue(): Promise<void> {
    const generation = ++queueGeneration;
    const data = await request<{ items?: QueueItem[] }>('/queue');
    const items = data.items ?? [];
    if (!adapter.isV8) {
      queue.value = items;
      return;
    }
    const activeItems = items.filter((item) => item.status === 'running' || item.status === 'optimizing');
    const progressByFilename = new Map<string, QueueItem['progress']>();
    await Promise.all(activeItems.map(async (item) => {
      try {
        const status = await request<QueueItem>(`/queue/${encodeURIComponent(item.filename)}/status`);
        if (status.progress) progressByFilename.set(item.filename, status.progress);
      } catch {
        // Queue listing remains useful when a process exits during polling.
      }
    }));
    if (generation !== queueGeneration) return;
    queue.value = items.map((item) => {
      const progress = progressByFilename.get(item.filename);
      return progress ? { ...item, progress } : item;
    });
  }

  async function loadResults(): Promise<void> {
    const generation = ++resultsGeneration;
    resultsLoading.value = true;
    try {
      const data = await request<{ results?: ResultSummary[] }>('/results');
      if (generation !== resultsGeneration) return;
      results.value = data.results ?? [];
    } finally {
      if (generation === resultsGeneration) resultsLoading.value = false;
    }
  }

  /* ── Pareto metric column selection (legacy v7_optimize.html:2864-2903) ── */

  const paretoColumnsStorageKey = `pbgui.optimize.${adapter.version}.pareto_columns`;

  /** Full metric catalog: server-advertised (PB8) or collected from loaded rows (PB7). */
  const paretoAvailableMetrics = computed(() => {
    const advertised = Array.isArray(paretoMeta.value.available_metrics) ? paretoMeta.value.available_metrics : [];
    const available = advertised.length
      ? advertised
      : paretos.value.flatMap((row) => Object.keys(row.summary || {}));
    return orderParetoMetrics(available);
  });

  const paretoDefaultMetrics = computed(() => {
    const advertised = Array.isArray(paretoMeta.value.default_metrics) ? paretoMeta.value.default_metrics : [];
    const defaults = orderParetoMetrics(advertised).filter((metric) => paretoAvailableMetrics.value.includes(metric));
    if (defaults.length) return defaults;
    return paretoAvailableMetrics.value.slice(0, 1);
  });

  function storedParetoColumns(): string[] {
    return readStoredParetoColumns(localStorage.getItem(paretoColumnsStorageKey))
      .filter((metric) => paretoAvailableMetrics.value.includes(metric));
  }

  function persistParetoColumns(): void {
    try {
      localStorage.setItem(paretoColumnsStorageKey, JSON.stringify(paretoMetricColumns.value));
    } catch {
      /* storage unavailable — selection stays in-memory only */
    }
  }

  function setParetoMetricColumns(metrics: string[], persist = true): void {
    const selected = normalizeParetoColumns(metrics, paretoAvailableMetrics.value, paretoDefaultMetrics.value);
    paretoMetricColumns.value = selected;
    if (persist) persistParetoColumns();
    if (paretoSort.value.key.startsWith('summary:') && !selected.includes(paretoSort.value.key.slice(8))) {
      paretoSort.value = { key: 'name', direction: 'asc' };
    }
  }

  /** Enabled: debounce a server reload; disabled: local-only (server returns a superset). */
  function toggleParetoMetricColumn(metric: string, enabled: boolean): void {
    const selected = paretoMetricColumns.value.slice();
    const index = selected.indexOf(metric);
    if (enabled && index < 0) selected.push(metric);
    if (!enabled && index >= 0 && selected.length > 1) selected.splice(index, 1);
    setParetoMetricColumns(selected);
    if (enabled) scheduleParetoMetricReload();
  }

  function scheduleParetoMetricReload(): void {
    if (paretoMetricReloadTimer !== null) clearTimeout(paretoMetricReloadTimer);
    paretoMetricReloadTimer = setTimeout(() => {
      paretoMetricReloadTimer = null;
      loadParetos().catch((caught) => { error.value = detailOf(caught); });
    }, 250);
  }

  function applyParetoColumns(): void {
    if (!paretoColumnsLoaded.value) {
      const stored = storedParetoColumns();
      setParetoMetricColumns(stored.length ? stored : paretoDefaultMetrics.value, false);
      paretoColumnsLoaded.value = true;
    } else {
      setParetoMetricColumns(paretoMetricColumns.value, false);
    }
  }

  async function loadParetos(resultPath = selectedResultPath.value): Promise<void> {
    const generation = ++paretoGeneration;
    if (paretoMetricReloadTimer !== null) {
      clearTimeout(paretoMetricReloadTimer);
      paretoMetricReloadTimer = null;
    }
    if (!resultPath) {
      paretos.value = [];
      paretoMeta.value = {};
      return;
    }
    const params = new URLSearchParams({
      result_path: resultPath,
      scenario: paretoMeta.value.selected_scenario || 'Aggregated',
      statistic: paretoMeta.value.selected_statistic || 'mean',
    });
    // PB8 lazily projects only the selected metrics; PB7 ignores the parameter.
    if (paretoColumnsLoaded.value && paretoMetricColumns.value.length) {
      params.set('metrics', paretoMetricColumns.value.join(','));
    }
    const data = await request<{ paretos?: ParetoItem[]; meta?: ParetoMeta }>(`/paretos?${params.toString()}`);
    if (generation !== paretoGeneration || resultPath !== selectedResultPath.value) return;
    paretos.value = data.paretos ?? [];
    paretoMeta.value = data.meta ?? {};
    applyParetoColumns();
  }

  function selectedResultStorageKey(): string {
    return `pbgui.optimize.selected-result.${adapter.version}`;
  }

  function persistSelectedResult(): void {
    const selected = results.value.find((item) => item.path === selectedResultPath.value);
    if (!selected) return;
    const result = selected.result;
    if (result === undefined || result === null || result === '') return;
    try {
      window.sessionStorage.setItem(
        selectedResultStorageKey(),
        JSON.stringify({ version: adapter.version, result: String(result) }),
      );
    } catch {
      // Storage may be unavailable (private mode); selection stays in memory.
    }
  }

  function clearSelectedResultStorage(): void {
    try {
      window.sessionStorage.removeItem(selectedResultStorageKey());
    } catch {
      // Ignore storage failures.
    }
  }

  async function restoreSelectedResult(): Promise<boolean> {
    if (!results.value.length) {
      try {
        await loadResults();
      } catch {
        return false;
      }
    }
    let stored: { version?: string; result?: string } | null = null;
    try {
      stored = JSON.parse(window.sessionStorage.getItem(selectedResultStorageKey()) || 'null') as { version?: string; result?: string } | null;
    } catch {
      stored = null;
    }
    if (!stored || stored.version !== adapter.version || !stored.result) return false;
    const selected = results.value.find((item) => String(item.result ?? '') === String(stored!.result));
    if (!selected) {
      clearSelectedResultStorage();
      return false;
    }
    selectedResultPath.value = selected.path;
    selectedResultName.value = String(selected.name || selected.result || selected.path || '');
    await loadParetos();
    return true;
  }

  async function loadAll(): Promise<void> {
    loading.value = true;
    error.value = '';
    runtimeWarning.value = '';
    try {
      const tasks: Array<Promise<void>> = [loadSettings(), loadConfigs(), loadQueue()];
      if (panel.value === 'results') tasks.push(loadResults());
      await Promise.all(tasks);
      const openConfig = readOpenConfig(options.search);
      if (openConfig) await openEditor(openConfig);
    } catch (caught) {
      error.value = detailOf(caught);
    } finally {
      loading.value = false;
    }
  }

  function setPanel(next: OptimizePanel): void {
    panel.value = next;
    if (next === 'results' && results.value.length === 0) {
      void loadResults().catch((caught) => {
        if (panel.value === 'results') error.value = detailOf(caught);
      });
    }
  }

  function clearSelection(kind: 'configs' | 'queue' | 'results' | 'paretos', keys?: string[]): void {
    const selection = selectionFor(kind).value;
    if (keys) keys.forEach((key) => selection.delete(key));
    else selection.clear();
    if (kind === 'results' && !selection.size) {
      selectedResultPath.value = '';
      selectedResultName.value = '';
      paretos.value = [];
      paretoMeta.value = {};
      clearSelectedResultStorage();
    }
  }

  function selectionFor(kind: 'configs' | 'queue' | 'results' | 'paretos') {
    if (kind === 'configs') return selectedConfigs;
    if (kind === 'queue') return selectedQueue;
    if (kind === 'results') return selectedResults;
    return selectedParetos;
  }

  function toggleSelection(kind: 'configs' | 'queue' | 'results' | 'paretos', key: string): void {
    const selection = selectionFor(kind).value;
    if (selection.has(key)) selection.delete(key);
    else selection.add(key);
    if (kind === 'results') {
      if (selection.size === 1) {
        const row = results.value.find((item) => item.path === key);
        selectedResultPath.value = key;
        selectedResultName.value = String(row?.name || row?.result || key);
        persistSelectedResult();
      } else if (!selection.size) {
        selectedResultPath.value = '';
        selectedResultName.value = '';
        paretos.value = [];
        paretoMeta.value = {};
        clearSelectedResultStorage();
      }
    }
  }

  function selectAll(kind: 'configs' | 'queue' | 'results' | 'paretos', keys: string[]): void {
    const selection = selectionFor(kind).value;
    keys.forEach((key) => selection.add(key));
  }

  function setSelection(kind: 'configs' | 'queue' | 'results' | 'paretos', keys: string[], selected: boolean): void {
    const selection = selectionFor(kind).value;
    keys.forEach((key) => { if (selected) selection.add(key); else selection.delete(key); });
    if (kind === 'results') {
      if (selection.size === 1) {
        const key = [...selection][0]!;
        const row = results.value.find((item) => item.path === key);
        selectedResultPath.value = key;
        selectedResultName.value = String(row?.name || row?.result || key);
        persistSelectedResult();
      } else if (!selection.size) {
        selectedResultPath.value = '';
        selectedResultName.value = '';
        paretos.value = [];
        paretoMeta.value = {};
        clearSelectedResultStorage();
      }
    }
  }

  function openEditorPayload(data: ConfigPayload, name = '', sourceName = '', queueFilename = '', returnPanel: OptimizePanel = 'configs'): void {
    const resolvedName = name || data.name || '';
    editingName.value = resolvedName;
    editorName.value = resolvedName;
    editorSourceName.value = sourceName || resolvedName;
    editorQueueFilename.value = queueFilename;
    editorReturnPanel.value = returnPanel;
    editorDraft.value = buildEditorDraft(data.config, adapter.version, resolvedName, data.override_configs);
    const rawParamStatus = data.param_status ?? getPath(data.config, '_pbgui_param_status', {});
    editorParamStatus.value = isObject(rawParamStatus) ? rawParamStatus : {};
    editorJson.value = prettyJson(data.config);
    editorOpen.value = true;
  }

  async function openEditor(name = ''): Promise<void> {
    editorError.value = '';
    try {
      const data = await request<ConfigPayload>(name ? `/configs/${encodeURIComponent(name)}` : '/configs/new-config');
      openEditorPayload(data, name || data.name || '', name || data.name || '');
    } catch (caught) {
      editorError.value = detailOf(caught);
      notify(editorError.value, 'error');
    }
  }

  async function openQueueConfig(filename: string): Promise<void> {
    editorError.value = '';
    queueConfigChoice.value = null;
    try {
      const data = await requestQueueConfig(filename);
      const name = String(data.name || '');
      openEditorPayload(data, name, name, filename, 'queue');
    } catch (caught) {
      const choice = queueChoiceFromError(caught, filename, 'edit');
      if (choice) {
        queueConfigChoice.value = choice;
        return;
      }
      editorError.value = detailOf(caught);
      notify(editorError.value, 'error');
    }
  }

  function closeQueueConfigChoice(): void {
    queueConfigChoice.value = null;
  }

  async function openQueueConfigCandidate(name: string): Promise<void> {
    closeQueueConfigChoice();
    await openEditor(name);
  }

  async function repairQueueConfigCandidate(name: string): Promise<void> {
    const choice = queueConfigChoice.value;
    if (!choice) return;
    await request(`/queue/${encodeURIComponent(choice.queueFilename)}/repair-config`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    closeQueueConfigChoice();
    if (choice.intent === 'edit') {
      await loadQueue();
      await openQueueConfig(choice.queueFilename);
      return;
    }
    await request(`/queue/${encodeURIComponent(choice.queueFilename)}/${choice.intent}`, { method: 'POST' });
    await loadQueue();
  }

  async function openResultConfig(path: string, suggestedName = ''): Promise<void> {
    editorError.value = '';
    try {
      const data = await request<ConfigPayload>(`/results/config?path=${encodeURIComponent(path)}`);
      openEditorPayload(data, suggestedName, '', '', 'results');
    } catch (caught) {
      editorError.value = detailOf(caught);
      notify(editorError.value, 'error');
    }
  }

  function closeEditor(): void {
    editorOpen.value = false;
    editorDraft.value = null;
    editorParamStatus.value = {};
    editorQueueFilename.value = '';
    editorSourceName.value = '';
    editorError.value = '';
  }

  async function saveEditor(queueAfterSave = false, submittedDraft: OptimizeEditorDraft | null = editorDraft.value): Promise<void> {
    const draft = submittedDraft ? JSON.parse(JSON.stringify(submittedDraft)) as OptimizeEditorDraft : null;
    const name = String(draft?.name || editorName.value).trim();
    if (!name || !draft) {
      editorError.value = 'Config name is required';
      return;
    }
    try {
      draft.name = name;
      const config = collectEditorConfig(draft, adapter.version);
      const encoded = encodeURIComponent(name);
      const saveBody = adapter.isV8 ? { config, override_configs: draft.overrideConfigs } : config;
      await request(`/configs/${encoded}`, { method: 'PUT', body: JSON.stringify(saveBody) });
      if (queueAfterSave) {
        const queueBody = adapter.isV8
          ? { name, config, override_configs: draft.overrideConfigs }
          : { name, config };
        await request('/queue', { method: 'POST', body: JSON.stringify(queueBody) });
      }
      editorName.value = name;
      editorDraft.value = draft;
      editorJson.value = prettyJson(config);
      if (editorQueueFilename.value && name === editorSourceName.value) {
        await request(`/queue/${encodeURIComponent(editorQueueFilename.value)}/repair-config`, {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
      }
      await Promise.all([loadConfigs(), loadQueue()]);
      notify(queueAfterSave ? 'Config saved and queued' : 'Config saved', 'success');
      closeEditor();
    } catch (caught) {
      editorError.value = detailOf(caught);
      notify(editorError.value, 'error');
    }
  }

  async function duplicateConfig(name: string, copyName: string): Promise<void> {
    if (!copyName.trim()) return;
    try {
      await request(`/configs/${encodeURIComponent(name)}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ new_name: copyName.trim() }),
      });
      await loadConfigs();
      notify('Config duplicated', 'success');
    } catch (caught) {
      notify(detailOf(caught), 'error');
    }
  }

  async function deleteConfigs(names = [...selectedConfigs.value]): Promise<void> {
    await Promise.all(names.map((name) => request(`/configs/${encodeURIComponent(name)}`, { method: 'DELETE' })));
    names.forEach((name) => selectedConfigs.value.delete(name));
    await loadConfigs();
    notify('Selected configs deleted', 'success');
  }

  async function queueConfigs(names = [...selectedConfigs.value]): Promise<void> {
    await Promise.all(names.map((name) => request('/queue', { method: 'POST', body: JSON.stringify({ name }) })));
    await loadQueue();
    notify('Configs added to queue', 'success');
  }

  async function deleteQueueItems(filenames = [...selectedQueue.value]): Promise<void> {
    await request('/queue/delete', { method: 'POST', body: JSON.stringify({ filenames }) });
    filenames.forEach((filename) => selectedQueue.value.delete(filename));
    await loadQueue();
    notify('Selected queue items deleted', 'success');
  }

  async function reorderQueue(filenames: string[]): Promise<void> {
    await request('/queue/reorder', { method: 'POST', body: JSON.stringify({ filenames }) });
    await loadQueue();
  }

  async function moveQueue(filename: string, delta: -1 | 1): Promise<void> {
    const current = queue.value.map((item) => String(item.filename || ''));
    const index = current.indexOf(filename); const next = index + delta;
    if (index < 0 || next < 0 || next >= current.length) return;
    [current[index], current[next]] = [current[next]!, current[index]!];
    await reorderQueue(current);
  }

  async function clearFinished(): Promise<void> {
    await request('/queue/clear-finished', { method: 'POST' });
    await loadQueue();
  }

  async function queueAction(filename: string, action: 'start' | 'stop' | 'restart' | 'requeue'): Promise<void> {
    try {
      await request(`/queue/${encodeURIComponent(filename)}/${action}`, { method: 'POST' });
      await loadQueue();
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 409) throw caught;
      try {
        await requestQueueConfig(filename);
      } catch (choiceError) {
        const choice = queueChoiceFromError(choiceError, filename, action);
        if (choice) { queueConfigChoice.value = choice; return; }
      }
      throw caught;
    }
  }

  async function deleteResults(paths = [...selectedResults.value]): Promise<void> {
    await request('/results/delete', { method: 'POST', body: JSON.stringify({ paths }) });
    paths.forEach((path) => selectedResults.value.delete(path));
    await loadResults();
    if (paths.includes(selectedResultPath.value)) {
      selectedResultPath.value = '';
      paretos.value = [];
      clearSelectedResultStorage();
    }
    notify('Selected results deleted', 'success');
  }

  async function selectResult(result: ResultSummary): Promise<void> {
    selectedResultPath.value = String(result.path || '');
    selectedResultName.value = String(result.name || result.result || result.path || '');
    persistSelectedResult();
    setPanel('paretos');
    await loadParetos();
  }

  async function saveSettings(next: Partial<OptimizeSettings>): Promise<void> {
    await request('/settings', { method: 'POST', body: JSON.stringify(next) });
    settings.value = { ...settings.value, ...next };
    settingsOpen.value = false;
    notify('Queue settings updated', 'success');
  }

  function connect(): void {
    const generation = ++wsGeneration;
    const socket = new WebSocket(optimizeWsUrl((globalThis as { __BOOT__?: { origin?: string } }).__BOOT__?.origin || window.location.origin, adapter.version));
    ws.value = socket;
    socket.onopen = () => {
      if (generation !== wsGeneration || disposed) return;
      connected.value = true;
      socket.send(JSON.stringify({ type: 'refresh' }));
    };
    socket.onmessage = (event) => {
      if (generation !== wsGeneration || disposed) return;
      try {
        const data = JSON.parse(String(event.data)) as { type?: string; items?: QueueItem[]; queue?: QueueItem[] };
        if (Array.isArray(data.items)) queue.value = data.items;
        else if (Array.isArray(data.queue)) queue.value = data.queue;
      } catch {
        // Ignore malformed pushes; the next REST refresh remains authoritative.
      }
    };
    socket.onclose = () => {
      if (generation !== wsGeneration || disposed) return;
      connected.value = false;
    };
    socket.onerror = () => {
      if (generation === wsGeneration) connected.value = false;
    };
  }

  function disconnect(): void {
    wsGeneration += 1;
    ws.value?.close();
    ws.value = null;
    connected.value = false;
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      disposed = true;
      if (paretoMetricReloadTimer !== null) {
        clearTimeout(paretoMetricReloadTimer);
        paretoMetricReloadTimer = null;
      }
      disconnect();
    });
  }

  return {
    adapter,
    panel,
    settings,
    configs,
    queue,
    results,
    paretos,
    paretoMeta,
    paretoMetricColumns,
    paretoAvailableMetrics,
    paretoDefaultMetrics,
    setParetoMetricColumns,
    toggleParetoMetricColumn,
    configSearch,
    resultSearch,
    configSort,
    queueSort,
    resultSort,
    paretoSort,
    selectedConfigs,
    selectedQueue,
    selectedResults,
    selectedParetos,
    selectedResultPath,
    selectedResultName,
    editingName,
    editorSourceName,
    editorQueueFilename,
    editorReturnPanel,
    editorName,
    editorJson,
    editorDraft,
    editorParamStatus,
    editorError,
    editorOpen,
    settingsOpen,
    queueConfigChoice,
    loading,
    resultsLoading,
    error,
    runtimeWarning,
    connected,
    filteredConfigs,
    filteredQueue,
    filteredResults,
    filteredParetos,
    loadAll,
    loadSettings,
    loadConfigs,
    loadQueue,
    loadResults,
    loadParetos,
    reorderQueue,
    moveQueue,
    clearFinished,
    setPanel,
    clearSelection,
    toggleSelection,
    selectAll,
    setSelection,
    openEditorPayload,
    openEditor,
    openQueueConfig,
    closeQueueConfigChoice,
    openQueueConfigCandidate,
    repairQueueConfigCandidate,
    openResultConfig,
    closeEditor,
    saveEditor,
    duplicateConfig,
    deleteConfigs,
    queueConfigs,
    deleteQueueItems,
    queueAction,
    deleteResults,
    selectResult,
    restoreSelectedResult,
    saveSettings,
    connect,
    disconnect,
  };
}
