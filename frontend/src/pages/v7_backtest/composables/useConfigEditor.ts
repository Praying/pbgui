import { reactive, ref, watch } from 'vue';
import { validateJsonText } from '@/shared/jsonValidation';
import { useCoinOverrides } from '@/shared/coinOverrides/useCoinOverrides';
import { suiteLoad, type SuiteState } from '@/shared/suiteEditor/suiteModel';
import {
  flattenMarketSettings,
  marketSettingsExtras,
  validatePb8AdvancedFields,
  visibleMetricsState,
  type MarketSettingsState,
  type ResultMetricsState,
} from '../lib/advancedFields';
import { collectBacktestConfig, finalizeBacktestConfigForSave, validateBacktestDateRanges } from '../lib/backtestCollect';
import { backtestExchangeOptions, populateBacktestForm, type BacktestFormState } from '../lib/backtestFormModel';
import type { BacktestSettings, BacktestVersion } from '../types';
import type { I18nT } from '../types.i18n';

/**
 * useConfigEditor — the editor lifecycle of v7_backtest.html: the
 * editConfig/newConfig open paths (:1739-1983), showConfigEditor's
 * populate + embeds (:2563-2946), the raw↔structured JSON sync
 * (:3429-3463), loadCfgSymbols (:3710-3806), saveEditor/saveAndQueue
 * (:4855-4958) with putEditorConfig's flavor split (:4823-4853) and the
 * URL deep links draft_id/opt_draft_id/queue_draft_id/config
 * (:2023-2172).
 */

export interface ConfigEditorOptions {
  readonly apiBase: string;
  /** adapter.metadataApiBase — /symbols, /tags, /coins/* live here (:138-142). */
  readonly metadataApiBase: string;
  readonly version: BacktestVersion;
  /** Live settings accessor — hsl_signal_modes/exchange_options read at open time (:4475, :4495). */
  getSettings(): Pick<BacktestSettings, 'hsl_signal_modes' | 'exchange_options' | 'use_pbgui_market_data'>;
  readonly t: I18nT;
  readonly notify: (message: string, kind: 'ok' | 'err' | 'info' | 'warn') => void;
  readonly fetchFn?: typeof fetch;
  loadConfigs(): void | Promise<void>;
  wsRefresh(): void;
  selectPanel(panel: 'configs' | 'queue' | 'results' | 'archive' | 'legacy'): void;
  /** PBGuiConfirm equivalent — the v8 409 replace flow (:4840-4852). */
  confirm(options: { title: string; message: string; confirmText: string }): Promise<boolean>;
  /**
   * suiteCollect's auto-save hook (:183-184, called at :4769): folds the
   * suite editor's open scenario draft into the state before collect
   * reads it — Save, Save&Queue and the raw-JSON structured sync all go
   * through collect(), so every path commits in-progress scenario edits.
   */
  foldSuiteDraft?(): void;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function requestJson(fetchFn: typeof fetch, url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const resp = await fetchFn(url, { credentials: 'same-origin', ...init });
  const data: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = object(data).detail;
    const error = new Error(typeof detail === 'string' ? detail : resp.statusText || 'HTTP ' + resp.status);
    (error as Error & { status?: number }).status = resp.status;
    throw error;
  }
  return object(data);
}

const EMPTY_FORM: BacktestFormState = populateBacktestForm('', {}, { isV8: false, hslModes: [], exchangeOptions: [] });

export function useConfigEditor(options: ConfigEditorOptions) {
  const fetchFn = options.fetchFn ?? fetch;
  const isV8 = options.version === 'v8';
  const t = options.t;
  const notify = options.notify;
  const settings = options.getSettings;

  const editingName = ref<string | null>(null);
  const state = reactive<BacktestFormState>({ ...EMPTY_FORM, extraBt: [], coinSources: {}, marketSettingsSources: {} });
  const suite = ref<SuiteState>({ enabled: false, scenarios: [], editIdx: -1, aggregate: { default: 'mean' } });
  const paramStatus = ref<{ long: Record<string, string>; short: Record<string, string> }>({ long: {}, short: {} });
  const marketSettings = ref<MarketSettingsState>({ rows: [], extras: {}, error: '' });
  const resultMetrics = ref<ResultMetricsState>({ mode: 'default', selected: [], available: [], error: '' });
  const rawError = ref<{ line: number | null; message: string } | null>(null);
  const longErrorLine = ref<number | null>(null);
  const shortErrorLine = ref<number | null>(null);

  const queueDraftOpen = ref(false);
  const queueDraftItems = ref<{ name?: string; config?: Record<string, unknown>; override_configs?: Record<string, unknown> }[]>([]);

  const coinOptions = ref<string[]>([]);
  const coinLabels = ref<Record<string, string>>({});
  const tagOptions = ref<string[]>([]);
  const marketCoins = ref<string[]>([]);

  const botParams = ref<string[]>([]);

  const coinOv = useCoinOverrides({
    apiBase: options.apiBase,
    deferConfigFileWrites: true,
    preserveMarketIdentifiers: isV8,
    request: (path, init) => requestJson(fetchFn, options.apiBase + path, init as RequestInit | undefined),
    notify: (message, kind) => notify(message, kind === 'err' ? 'err' : 'info'),
  });

  let symbolsSeq = 0;
  let syncing = false;

  function resetEditorUiState(): void {
    suite.value = { enabled: false, scenarios: [], editIdx: -1, aggregate: { default: 'mean' } };
    paramStatus.value = { long: {}, short: {} };
    marketSettings.value = { rows: [], extras: {}, error: '' };
    resultMetrics.value = { mode: 'default', selected: [], available: [], error: '' };
    coinOptions.value = [];
    coinLabels.value = {};
    tagOptions.value = [];
    marketCoins.value = [];
    rawError.value = null;
    longErrorLine.value = null;
    shortErrorLine.value = null;
    symbolsSeq += 1;
  }

  function exchangeOptions(): string[] {
    return backtestExchangeOptions(state.exchanges, { isV8, exchangeOptions: settings().exchange_options.map(String) });
  }

  /** showConfigEditor (:2563-2946). */
  function openEditor(name: string, cfg: Record<string, unknown>, rawOverride?: string | null, statusOverride?: Record<string, unknown>, openOptions?: { isNew?: boolean }): void {
    resetEditorUiState();
    const populated = populateBacktestForm(name, cfg, {
      isV8,
      hslModes: settings().hsl_signal_modes.map(String),
      exchangeOptions: settings().exchange_options.map(String),
    });
    Object.assign(state, populated, { rawJson: rawOverride != null ? String(rawOverride) : populated.rawJson });
    const status = object(statusOverride ?? cfg._pbgui_param_status);
    paramStatus.value = { long: object(status.long) as Record<string, string>, short: object(status.short) as Record<string, string> };
    if (isV8) {
      try {
        marketSettings.value = { rows: flattenMarketSettings(object(object(cfg.backtest).market_settings)), extras: marketSettingsExtras(object(object(cfg.backtest).market_settings)), error: '' };
      } catch (error) {
        marketSettings.value = { rows: [], extras: {}, error: error instanceof Error ? error.message : String(error) };
      }
      try {
        const normalized = visibleMetricsState(object(cfg.backtest).visible_metrics);
        resultMetrics.value = { ...resultMetrics.value, mode: normalized.mode, selected: normalized.selected, error: '' };
      } catch (error) {
        resultMetrics.value = { ...resultMetrics.value, mode: 'custom', selected: [], error: error instanceof Error ? error.message : String(error) };
      }
      void loadResultMetrics();
    }
    suite.value = suiteLoad(cfg, suite.value);
    coinOv.setConfigName(name === '' ? '__new__' : name);
    void coinOv.load(cfg);
    editingName.value = openOptions?.isNew || name === '' ? '__new__' : name;
    void loadCfgSymbols();
    void loadBotParams();
  }

  /** editConfig (:1739-1745). */
  async function editConfig(name: string): Promise<void> {
    try {
      const data = await requestJson(fetchFn, `${options.apiBase}/configs/${encodeURIComponent(name)}`);
      openEditor(String(data.name || name), object(data.config), null, object(data.param_status));
    } catch (error) {
      notify(t('v7backtest.loadFailed', { msg: message(error) }), 'err');
    }
  }

  /** newConfig (:1970-1983). */
  async function newConfig(): Promise<void> {
    let template: Record<string, unknown> = {};
    let status: Record<string, unknown> = {};
    try {
      const data = await requestJson(fetchFn, `${options.apiBase}/configs/new-config`);
      template = object(data.config);
      status = object(data.param_status);
    } catch {
      /* legacy warned and used empty defaults (:1977-1979) */
    }
    openEditor('', template, null, status);
  }

  function closeEditor(): void {
    editingName.value = null;
    resetEditorUiState();
  }

  /* ── loadCfgSymbols (:3710-3806) ── */
  async function loadCfgSymbols(): Promise<void> {
    const requestSeq = ++symbolsSeq;
    const exchanges = state.exchanges.filter((exchange) => exchange !== 'combined');
    const live = object(JSON.parse(state.rawJson || '{}').live);
    const pbgui = object(JSON.parse(state.rawJson || '{}').pbgui);
    const emptyMeansAll = !!live.empty_means_all_approved;
    const approvedLong = listOr(object(live.approved_coins).long);
    const approvedShort = listOr(object(live.approved_coins).short);
    const ignoredLong = listOr(object(live.ignored_coins).long);
    const ignoredShort = listOr(object(live.ignored_coins).short);
    const seededCoins = [...new Set([...(emptyMeansAll && approvedLong.length === 0 ? ['all'] : []), ...approvedLong, ...(emptyMeansAll && approvedShort.length === 0 ? ['all'] : []), ...approvedShort, ...ignoredLong, ...ignoredShort])]
      .filter((coin) => coin !== 'all')
      .sort();
    marketCoins.value = seededCoins.slice();
    state.approvedLong = emptyMeansAll && approvedLong.length === 0 ? ['all'] : approvedLong;
    state.approvedShort = emptyMeansAll && approvedShort.length === 0 ? ['all'] : approvedShort;
    state.ignoredLong = ignoredLong;
    state.ignoredShort = ignoredShort;
    state.tags = Array.isArray(pbgui.tags) ? (pbgui.tags as unknown[]).map(String) : state.tags;
    seedOptions(seededCoins, state.approvedLong, state.approvedShort, state.ignoredLong, state.ignoredShort, state.tags);
    coinOv.setCoins(seededCoins, {});
    if (exchanges.length === 0) return;
    try {
      const symbolsResponses = isV8
        ? [await requestJson(fetchFn, `${options.metadataApiBase}/coins/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exchanges, coins: seededCoins }) })]
        : await Promise.all(exchanges.map((exchange) => requestJson(fetchFn, `${options.metadataApiBase}/symbols?exchange=${encodeURIComponent(exchange)}`)));
      const tagResponses = await Promise.all(exchanges.map((exchange) => requestJson(fetchFn, `${options.metadataApiBase}/tags?exchange=${encodeURIComponent(exchange)}`)));
      if (requestSeq !== symbolsSeq) return;
      const symbolSet = new Set<string>();
      const labelMap: Record<string, string> = {};
      for (const response of symbolsResponses) {
        for (const symbol of listOr(response.symbols)) symbolSet.add(symbol);
        for (const entry of (response.catalog as { config_id?: string; display?: string; coin?: string }[] | undefined) ?? []) {
          if (entry?.config_id) labelMap[entry.config_id] = entry.display || entry.coin || entry.config_id;
        }
      }
      const tagSet = new Set<string>();
      for (const response of tagResponses) for (const tag of listOr(response.tags)) tagSet.add(tag);
      const symbols = [...symbolSet].sort();
      marketCoins.value = symbols.slice();
      const allTags = [...tagSet].sort();
      seedOptions(symbols, state.approvedLong, state.approvedShort, state.ignoredLong, state.ignoredShort, state.tags);
      coinOptions.value = ['all', ...symbols];
      coinLabels.value = labelMap;
      tagOptions.value = allTags;
      coinOv.setCoins(symbols, labelMap);
      if (isV8) {
        const statuses = object(symbolsResponses[0]?.statuses);
        void statuses;
      }
    } catch {
      /* fall back to the seeded values (:3800-3805) */
    }
  }

  function seedOptions(symbols: string[], approvedLong: string[], approvedShort: string[], ignoredLong: string[], ignoredShort: string[], tags: string[]): void {
    const selectedCoins = [...new Set([...approvedLong, ...approvedShort, ...ignoredLong, ...ignoredShort])].filter((coin) => coin && coin !== 'all').sort();
    coinOptions.value = [...new Set(['all', ...symbols, ...selectedCoins])];
    tagOptions.value = [...new Set([...tags, ...(tagOptions.value ?? [])])];
  }

  function listOr(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : typeof value === 'string' && value ? [value] : [];
  }

  /* ── bot params (suite overrides select, suite_editor :194-209) ── */
  async function loadBotParams(): Promise<void> {
    if (botParams.value.length > 0) return;
    try {
      const data = await requestJson(fetchFn, `${options.apiBase}/bot-params`);
      const params = Array.isArray(data.params) ? data.params : [];
      botParams.value = params.map((entry) => String(object(entry).key ?? entry)).filter(Boolean);
    } catch {
      botParams.value = ['total_wallet_exposure_limit', 'n_positions', 'entry_initial_qty_pct', 'entry_initial_ema_dist', 'entry_grid_spacing_pct'];
    }
  }

  async function loadResultMetrics(): Promise<void> {
    if (!isV8 || resultMetrics.value.available.length > 0) return;
    try {
      const data = await requestJson(fetchFn, `${options.apiBase}/result-metrics`);
      const metrics = Array.isArray(data.metrics) ? (data.metrics as unknown[]).filter((item) => typeof item === 'string') : [];
      for (const metric of resultMetrics.value.selected) if (!metrics.includes(metric)) metrics.push(metric);
      resultMetrics.value = { ...resultMetrics.value, available: [...new Set(metrics)].sort(), error: '' };
    } catch (error) {
      resultMetrics.value = { ...resultMetrics.value, available: resultMetrics.value.selected.slice().sort(), error: 'Could not load installed PB8 metrics: ' + message(error) };
    }
  }

  /* ── raw↔structured sync (:3429-3463) ── */
  function collect(): Record<string, unknown> {
    options.foldSuiteDraft?.();
    return collectBacktestConfig(state, {
      isV8,
      suite: { suite_enabled: suite.value.enabled, ...(suite.value.enabled ? { scenarios: suite.value.scenarios, aggregate: suite.value.aggregate } : {}) },
      coinOverrides: Object.keys(coinOv.overrides).length > 0 ? (coinOv.collect() as Record<string, unknown>) : undefined,
      marketSettings: isV8 ? marketSettings.value : null,
      resultMetrics: isV8 ? resultMetrics.value : null,
    });
  }

  let rawTimer: ReturnType<typeof setTimeout> | null = null;
  let structuredTimer: ReturnType<typeof setTimeout> | null = null;

  watch(
    () => state.rawJson,
    (raw) => {
      if (syncing) return;
      if (rawTimer !== null) clearTimeout(rawTimer);
      rawTimer = setTimeout(() => {
        rawTimer = null;
        const validation = validateJsonText(raw, { expectObject: true, messages: { cannotBeEmpty: 'Config cannot be empty', topLevelObject: 'Config must be a JSON object' } });
        rawError.value = validation.error ? { line: validation.error.line ?? null, message: validation.error.message } : null;
        if (validation.error || !validation.parsed) return;
        syncing = true;
        try {
          const parsed = validation.parsed as Record<string, unknown>;
          const populated = populateBacktestForm(state.name, parsed, {
            isV8,
            hslModes: settings().hsl_signal_modes.map(String),
            exchangeOptions: settings().exchange_options.map(String),
          });
          const { rawJson: _ignored, ...fields } = populated;
          Object.assign(state, fields);
          suite.value = suiteLoad(parsed, suite.value, { preserveEdit: true });
        } finally {
          syncing = false;
        }
      }, 250);
    }
  );

  watch(
    () => ({ ...state }),
    () => {
      if (syncing) return;
      const el = typeof document !== 'undefined' ? document.getElementById('cfg-raw-json') : null;
      if (el && document.activeElement === el) return;
      if (structuredTimer !== null) clearTimeout(structuredTimer);
      structuredTimer = setTimeout(() => {
        structuredTimer = null;
        const nextRaw = JSON.stringify(collect(), null, 2);
        if (nextRaw === state.rawJson) return;
        syncing = true;
        state.rawJson = nextRaw;
        syncing = false;
      }, 150);
    },
    { deep: true }
  );

  /* ── validations (:3255-3277, :3225-3253, :2544-2561) ── */
  function botJsonError(raw: string): string | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'must be an object';
      return null;
    } catch (error) {
      return message(error);
    }
  }

  function ensureValidForSave(): boolean {
    const name = state.name.trim();
    if (!name) {
      notify(t('v7backtest.configNameRequired'), 'err');
      return false;
    }
    const longError = botJsonError(state.botLongJson);
    const shortError = botJsonError(state.botShortJson);
    longErrorLine.value = null;
    shortErrorLine.value = null;
    if (longError || shortError) {
      notify(t('v7backtest.failedWithMsg', { msg: longError ?? shortError! }), 'err');
      return false;
    }
    const rawValidation = validateJsonText(state.rawJson, { expectObject: true, messages: { cannotBeEmpty: 'Config cannot be empty', topLevelObject: 'Config must be a JSON object' } });
    if (rawValidation.error) {
      rawError.value = { line: rawValidation.error.line ?? null, message: rawValidation.error.message };
      notify(t('v7backtest.failedWithMsg', { msg: 'Raw JSON is invalid' }), 'err');
      return false;
    }
    const advancedError = validatePb8AdvancedFields(isV8, marketSettings.value, resultMetrics.value);
    if (advancedError) {
      notify(advancedError, 'err');
      return false;
    }
    return true;
  }

  /** putEditorConfig (:4823-4853). */
  async function putEditorConfig(name: string, cfg: Record<string, unknown>, oldName: string | null, overrideSnapshot: ReturnType<typeof coinOv.snapshotPendingFiles> | null): Promise<unknown | null> {
    const query: string[] = [];
    if (oldName && oldName !== name) query.push('source_name=' + encodeURIComponent(oldName));
    const creatingV8 = isV8 && (!oldName || oldName !== name);
    if (creatingV8) query.push('create_only=true');
    if (isV8 && !oldName) query.push('inherit_existing_overrides=false');
    const path = `/configs/${encodeURIComponent(name)}${query.length ? '?' + query.join('&') : ''}`;
    const init: RequestInit = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isV8 ? { config: cfg, override_configs: overrideSnapshot?.files ?? {} } : cfg),
    };
    try {
      return await requestJson(fetchFn, options.apiBase + path, init);
    } catch (error) {
      if (!creatingV8 || (error as Error & { status?: number }).status !== 409) throw error;
      const confirmed = await options.confirm({
        title: t('v7backtest.replaceV8Config'),
        message: t('v7backtest.configExistsWithName', { name }),
        confirmText: t('v7backtest.replace'),
      });
      if (!confirmed) return null;
      const replaceParts: string[] = [];
      if (oldName && oldName !== name) replaceParts.push('source_name=' + encodeURIComponent(oldName));
      if (!oldName) replaceParts.push('inherit_existing_overrides=false');
      return requestJson(fetchFn, options.apiBase + `/configs/${encodeURIComponent(name)}${replaceParts.length ? '?' + replaceParts.join('&') : ''}`, init);
    }
  }

  /** saveEditor (:4855-4899). */
  async function save(): Promise<void> {
    if (!ensureValidForSave()) return;
    let cfg: Record<string, unknown>;
    try {
      coinOv.setConfigName(state.name.trim());
      cfg = finalizeBacktestConfigForSave(state.name.trim(), collect());
    } catch (error) {
      notify(t('v7backtest.saveFailed', { msg: message(error) }), 'err');
      return;
    }
    const dateError = validateBacktestDateRanges(cfg);
    if (dateError) {
      notify(dateError, 'err');
      return;
    }
    const name = state.name.trim();
    const oldName = editingName.value && editingName.value !== '__new__' ? editingName.value : null;
    let overrideSnapshot: ReturnType<typeof coinOv.snapshotPendingFiles> | null = null;
    try {
      overrideSnapshot = isV8 ? coinOv.snapshotPendingFiles() : null;
    } catch (error) {
      notify(t('v7backtest.cannotSaveOverrides', { msg: message(error) }), 'err');
      return;
    }
    try {
      const saved = await putEditorConfig(name, cfg, oldName, overrideSnapshot);
      if (!saved) return;
      if (isV8 && overrideSnapshot) coinOv.acknowledgePendingFiles(overrideSnapshot);
      else await coinOv.flushPendingFiles(name);
      notify(oldName && oldName !== name ? t('v7backtest.savedAsNewConfig', { name }) : t('v7backtest.configSaved'), 'ok');
      editingName.value = name;
      await options.loadConfigs();
      closeEditor();
    } catch (error) {
      notify(t('v7backtest.saveFailed', { msg: message(error) }), 'err');
    }
  }

  /** saveAndQueue (:4901-4958). */
  async function saveAndQueue(): Promise<void> {
    if (!ensureValidForSave()) return;
    let cfg: Record<string, unknown>;
    try {
      coinOv.setConfigName(state.name.trim());
      cfg = finalizeBacktestConfigForSave(state.name.trim(), collect());
    } catch (error) {
      notify(t('v7backtest.failedWithMsg', { msg: message(error) }), 'err');
      return;
    }
    const dateError = validateBacktestDateRanges(cfg);
    if (dateError) {
      notify(dateError, 'err');
      return;
    }
    const name = state.name.trim();
    const oldName = editingName.value && editingName.value !== '__new__' ? editingName.value : null;
    let overrideSnapshot: ReturnType<typeof coinOv.snapshotPendingFiles> | null = null;
    try {
      overrideSnapshot = isV8 ? coinOv.snapshotPendingFiles() : null;
    } catch (error) {
      notify(t('v7backtest.cannotSaveOverrides', { msg: message(error) }), 'err');
      return;
    }
    try {
      const saved = await putEditorConfig(name, cfg, oldName, overrideSnapshot);
      if (!saved) return;
      editingName.value = name;
      coinOv.setConfigName(name);
      if (isV8 && overrideSnapshot) coinOv.acknowledgePendingFiles(overrideSnapshot);
      else await coinOv.flushPendingFiles(name);
      await requestJson(fetchFn, options.apiBase + '/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      notify(t('v7backtest.savedAndQueued'), 'ok');
      await options.loadConfigs();
      closeEditor();
      options.selectPanel('queue');
    } catch (error) {
      notify(t('v7backtest.failedWithMsg', { msg: message(error) }), 'err');
    }
  }

  /* ── URL deep links (:2023-2172) ── */
  function clearUrlParams(keys: string[]): void {
    const url = new URL(window.location.href);
    for (const key of keys) url.searchParams.delete(key);
    const nextSearch = url.searchParams.toString();
    window.history.replaceState({}, document.title, url.pathname + (nextSearch ? '?' + nextSearch : '') + url.hash);
  }

  /** getInitialBacktestDraftName (:1985-1992). */
  function draftName(cfg: Record<string, unknown>, params: URLSearchParams): string {
    const qpName = params.get('draft_name') || params.get('name') || '';
    if (qpName) return qpName;
    const baseDir = String(object(cfg.backtest).base_dir ?? '').trim();
    if (!baseDir) return '';
    const parts = baseDir.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1]! : '';
  }

  async function prepareImported(cfg: Record<string, unknown>): Promise<{ config: Record<string, unknown>; param_status: Record<string, unknown> }> {
    const data = await requestJson(fetchFn, options.apiBase + '/configs/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: cfg }),
    });
    return { config: object(data.config).config ? object(object(data.config).config) : object(data.config) || cfg, param_status: object(data.param_status) };
  }

  async function consumeUrlDeepLinks(search: string = window.location.search): Promise<boolean> {
    const params = new URLSearchParams(search);
    const requestedConfig = params.get('config');
    if (requestedConfig) {
      options.selectPanel('configs');
      await editConfig(requestedConfig);
      return true;
    }
    const runDraftId = params.get('draft_id');
    const optimizeDraftId = params.get('opt_draft_id');
    if (runDraftId || optimizeDraftId) {
      try {
        const draft = runDraftId
          ? await requestJson(fetchFn, `${location.origin}/api/v7/draft/${encodeURIComponent(runDraftId)}`)
          : await requestJson(fetchFn, options.apiBase + '/optimize-draft/' + encodeURIComponent(optimizeDraftId!));
        const cfg = object(draft.config);
        const prepared = optimizeDraftId && isV8 ? { config: cfg, param_status: object(draft.param_status) } : await prepareImported(cfg);
        const name = draftName(prepared.config, params);
        options.selectPanel('configs');
        openEditor(name, prepared.config, JSON.stringify(prepared.config), prepared.param_status, { isNew: true });
        clearUrlParams(runDraftId ? ['draft_id', 'draft_name'] : ['opt_draft_id', 'draft_name']);
      } catch (error) {
        notify(t(runDraftId ? 'v7backtest.failedOpenRunDraft' : 'v7backtest.failedOpenOptimizerDraft', { msg: message(error) }), 'err');
      }
      return true;
    }
    const queueDraftId = params.get('queue_draft_id');
    if (queueDraftId) {
      try {
        const draft = await requestJson(fetchFn, options.apiBase + '/queue-draft/' + encodeURIComponent(queueDraftId));
        const items = Array.isArray(draft.items) ? (draft.items as { name?: string; config?: Record<string, unknown>; override_configs?: Record<string, unknown> }[]) : [];
        if (!items.length) {
          notify(t('v7backtest.noBacktestsInDraft'), 'err');
          return true;
        }
        options.selectPanel('configs');
        queueDraftItems.value = items;
        queueDraftOpen.value = true;
      } catch (error) {
        notify(t('v7backtest.failedOpenQueueDraft', { msg: message(error) }), 'err');
      }
      return true;
    }
    return false;
  }

  function onQueueDraftQueued(count: number): void {
    notify(t('v7backtest.queuedBacktests', { n: count }), 'ok');
    queueDraftOpen.value = false;
    options.selectPanel('queue');
    options.wsRefresh();
  }

  function postQueue(body: unknown): Promise<unknown> {
    return requestJson(fetchFn, options.apiBase + '/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  function getPbguiDataPath(): Promise<string> {
    return requestJson(fetchFn, options.apiBase + '/pbgui_data_path').then((data) => String(data.path ?? ''));
  }

  /** fillPbguiDataPath (:5008-5015). */
  async function fillPbguiDataPath(): Promise<void> {
    try {
      state.ohlcvSourceDir = await getPbguiDataPath();
    } catch (error) {
      notify(t('v7backtest.failedGetDataPath', { msg: message(error) }), 'err');
    }
  }

  /** cfgApplyFilters (:4015-4061). */
  async function applyFilters(): Promise<void> {
    const exchanges = state.exchanges;
    if (!exchanges.length) {
      notify(t('v7backtest.selectAtLeastOneExchange'), 'err');
      return;
    }
    const allApproved = new Set<string>();
    const allIgnored = new Set<string>();
    for (const exchange of exchanges) {
      if (exchange === 'combined') continue;
      try {
        const url =
          `${options.metadataApiBase}/coins/filter?exchange=${encodeURIComponent(exchange)}` +
          `&market_cap=${parseFloat(state.marketCap) || 0}&vol_mcap=${parseFloat(state.volMcap) || 10}` +
          `&only_cpt=${state.onlyCpt}&notices_ignore=${state.noticesIgnore}`;
        const tagsQuery = state.tags.length ? '&tags=' + encodeURIComponent(state.tags.join(',')) : '';
        const data = await requestJson(fetchFn, url + tagsQuery);
        for (const coin of listOr(data.approved)) allApproved.add(coin);
        for (const coin of listOr(data.ignored)) allIgnored.add(coin);
      } catch (error) {
        notify(t('v7backtest.filterErrorFor', { exchange, msg: message(error) }), 'err');
        return;
      }
    }
    for (const coin of allApproved) allIgnored.delete(coin);
    const approved = [...allApproved].sort();
    const ignored = [...allIgnored].sort();
    state.approvedLong = approved;
    state.approvedShort = approved;
    state.ignoredLong = ignored;
    state.ignoredShort = ignored;
    notify(t('v7backtest.filtersApplied', { approved: approved.length, ignored: ignored.length }), 'ok');
  }

  return {
    editingName,
    state,
    suite,
    paramStatus,
    marketSettings,
    resultMetrics,
    rawError,
    longErrorLine,
    shortErrorLine,
    queueDraftOpen,
    queueDraftItems,
    coinOptions,
    coinLabels,
    tagOptions,
    marketCoins,
    botParams,
    coinOv,
    exchangeOptions,
    openEditor,
    editConfig,
    newConfig,
    closeEditor,
    loadCfgSymbols,
    save,
    saveAndQueue,
    consumeUrlDeepLinks,
    onQueueDraftQueued,
    postQueue,
    getPbguiDataPath,
    fillPbguiDataPath,
    applyFilters,
    collect,
  };
}

export type ConfigEditorStore = ReturnType<typeof useConfigEditor>;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
