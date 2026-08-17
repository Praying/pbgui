import { computed, inject, provide, reactive, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import type { EditAdapter } from '../config';
import type { ExtraLiveField, EditFormState } from '../lib/formModel';
import { clampExecutionSync, intVal, isExecutionSyncValid, numVal } from '../lib/formModel';
import { collectConfig } from '../lib/collectConfig';
import { populateForm } from '../lib/populateForm';
import {
  SHARED_LIVE_FIELDS,
  SHARED_LOGGING_FIELDS,
  SHARED_MONITOR_FIELDS,
  buildKnownLiveParams,
  resolveManagedKeys,
  type EditorMetadata,
  type ManagedKeys,
} from '../lib/liveParams';
import {
  applyStrategyKindChange,
  createEmptyStrategyCache,
  supportedStrategies,
  type ParamStatus,
  type StrategyCache,
} from '../lib/strategyKind';
import { loadInstanceConfig, loadUsers, type UserInfo } from './useInstanceConfig';
import { hostOptions, useHosts } from './useHosts';
import { useSymbolsTags } from './useSymbolsTags';
import { useJsonSync, type UseJsonSync } from './useJsonSync';
import { useCoinOverrides, type CoinOverridesStore } from '@/shared/coinOverrides/useCoinOverrides';
import { validateJsonText, type JsonValidationError } from '@/shared/jsonValidation';
import { serverMsg } from '@/shared/i18n';
import { dialogsAlert } from '../lib/dialogs';

/**
 * Page orchestration — the Vue port of init() (v7_edit.html:1797-1908) and
 * saveConfig (:2908-2982): load users → resolve the load mode (draft/new/
 * named instance) → populate the structured form (+ coin-overrides panel
 * load :2452) → host capabilities and symbols/tags; collect + PUT on save
 * with the 409 "Update your VPS first" alert (:2933-2945). The raw↔
 * structured JSON sync (createJsonSyncController) drives applyPopulated
 * through useJsonSync (:2619-2693).
 */

export type Translate = (key: string, params?: Record<string, unknown>) => string;

type ToastFn = (msg: string, kind?: 'ok' | 'err' | 'info') => void;

export interface UseEditPageOptions {
  readonly adapter: EditAdapter;
  readonly apiBase: string;
  readonly params: { name: string; isNew: boolean; draftId: string };
  readonly t: Translate;
  readonly toast: ToastFn;
  /** PBGuiDialogs.alert bridge (the 409 save/copy block, :2935-2940). */
  readonly alert?: (title: string, message: string) => void;
}

export interface RawJsonErrorState {
  readonly error: JsonValidationError | null;
  readonly label: string;
}

export interface UseEditPage {
  readonly state: EditFormState;
  readonly isV8: boolean;
  readonly extraLive: Ref<ExtraLiveField[]>;
  readonly cfg: Ref<Record<string, unknown>>;
  readonly paramStatus: Ref<ParamStatus>;
  readonly users: Ref<UserInfo[]>;
  readonly strategyKinds: Ref<string[]>;
  readonly activeStrategyKind: Ref<string>;
  readonly saving: Ref<boolean>;
  readonly loadError: Ref<string>;
  readonly instanceName: Ref<string>;
  readonly isNew: Ref<boolean>;
  readonly hosts: ReturnType<typeof useHosts>;
  readonly symbolsTags: ReturnType<typeof useSymbolsTags>;
  readonly managed: Ref<ManagedKeys>;
  readonly known: ComputedRef<Set<string>>;
  readonly renderedHostOptions: ComputedRef<string[]>;
  readonly paramLegendLong: ComputedRef<boolean>;
  readonly paramLegendShort: ComputedRef<boolean>;
  readonly fieldVisible: (key: string) => boolean;
  readonly coinOverrides: CoinOverridesStore;
  readonly jsonSync: UseJsonSync;
  readonly rawError: Ref<JsonValidationError | null>;
  /** Field keys whose JSON textareas are invalid (line-reveal validation). */
  readonly jsonFieldErrors: Ref<Record<string, JsonValidationError | null>>;
  /** f-price-dist label rename when the v8 runtime manages the limit key (:187-192). */
  readonly priceDistLabel: ComputedRef<string>;
  load(): Promise<void>;
  save(): Promise<void>;
  changeStrategyKind(next: string): void;
  collect(): Record<string, unknown>;
  validateForSave(): boolean;
  validateRawText(raw: string): { parsed: unknown; error: JsonValidationError | null };
  onUserChange(): void;
  onEnabledOnChange(): void;
  onExecutionSyncChange(changed: 'maxCancel' | 'maxCreate'): void;
  selectedUserExchange(): string;
  draftName(): string;
  /** syncEditorFromParsed (:2627-2633) — the raw→structured apply. */
  applyParsedFromRaw(parsed: Record<string, unknown>): Promise<void>;
  /** REST base for modal-driven fetches (copy/import). */
  apiBaseOf(): string;
  /** doImport's apply half (:3274-3277): repopulate from a prepared config. */
  applyImportedConfig(cfg: Record<string, unknown>, paramStatus: Record<string, Record<string, string>>): void;
  /** syncBotInputToJson (:3494-3503) — TWE/npos inputs overlay the side JSON. */
  syncBotInputs(side: 'long' | 'short'): void;
  /** bot JSON blur (:3516-3522) — JSON edits flow back into the inputs. */
  readBotInputsFromJson(side: 'long' | 'short'): void;
  /** f-hsl-signal-mode change → coinOvSetContext (:1896-1900). */
  onHslSignalModeChange(): void;
  /** The page toast (modal components). */
  notify(msg: string, kind?: 'ok' | 'err' | 'info'): void;
}

/** Provide/inject key so section components share the page store without prop drilling. */
export const EDIT_PAGE_KEY: InjectionKey<UseEditPage> = Symbol('edit-page');

export function provideEditPage(page: UseEditPage): void {
  provide(EDIT_PAGE_KEY, page);
}

export function useEditPageContext(): UseEditPage {
  const ctx = inject(EDIT_PAGE_KEY);
  if (!ctx) throw new Error('v7_edit page context missing — mount inside App.vue');
  return ctx;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const JSON_FIELDS: readonly { key: string; label: string; empty: string; expectObject: boolean }[] = [
  { key: 'longJson', label: '', empty: '', expectObject: true },
  { key: 'shortJson', label: '', empty: '', expectObject: true },
  // the two v8-only fields keep the legacy literal labels (:1585-1594)
  { key: 'startupPhaseBudgets', label: 'startup_phase_budgets JSON', empty: 'startup_phase_budgets cannot be empty', expectObject: true },
  { key: 'logDebugProfiles', label: 'logging.live_event_debug_profiles JSON', empty: 'logging.live_event_debug_profiles cannot be empty', expectObject: false },
];

export function useEditPage(options: UseEditPageOptions): UseEditPage {
  const { adapter, apiBase, t, toast } = options;
  const params = { ...options.params };
  const alert =
    options.alert ??
    ((title: string, message: string) => {
      if (!dialogsAlert({ title, message, confirmText: t('common.ok') })) toast(title + ': ' + message, 'err');
    });

  const state = reactive(
    populateForm({}, { adapter, known: buildKnownLiveParams(adapter.version, []) }).state
  ) as EditFormState;
  const extraLive = ref<ExtraLiveField[]>([]);
  const cfg = ref<Record<string, unknown>>({});
  const paramStatus = ref<ParamStatus>({ long: {}, short: {} });
  const users = ref<UserInfo[]>([]);
  const strategyKinds = ref<string[]>([]);
  const activeStrategyKind = ref('');
  const strategyCache = ref<StrategyCache>(createEmptyStrategyCache());
  const editorMetadata = ref<EditorMetadata>({});
  const saving = ref(false);
  const loadError = ref('');
  const instanceName = ref(params.name);
  const isNew = ref(params.isNew);
  const fromBacktestConfig = ref('');
  const overrideConfigs = ref<Record<string, unknown>>({});
  const managed = ref<ManagedKeys>({ live: [], logging: [], monitor: [] });
  const rawError = ref<JsonValidationError | null>(null);
  const jsonFieldErrors = ref<Record<string, JsonValidationError | null>>({});

  const hosts = useHosts(apiBase, adapter, instanceName.value);
  const symbolsTags = useSymbolsTags(apiBase);

  /** scheduleStructuredEditorSync hook for the coin-overrides panel (:60-64). */
  let scheduleStructuredSync: () => void = () => undefined;

  const coinOverrides = useCoinOverrides({
    apiBase,
    deferConfigFileWrites: adapter.isV8,
    preserveMarketIdentifiers: adapter.isV8,
    context: { hslSignalMode: '', strategyKind: '' },
    notifyStructuredSync: () => scheduleStructuredSync(),
    notify: (msg, kind) => toast(msg, kind),
    jsonInvalid: (side) => t('editor.overrides.jsonInvalid', { side }),
    invalidValue: (param, msg) => t('editor.overrides.invalidValue', { param, msg }),
    alreadyHas: (coin) => t('editor.overrides.alreadyHas', { coin }),
    invalidJsonInSide: (side) => t('editor.overrides.invalidJsonInSide', { side }),
  });

  const known = computed(() => buildKnownLiveParams(adapter.version, managed.value.live, adapter.knownLiveParams));
  /** Rendered host select options — 'disabled' first (populateHosts :1956-1967). */
  const renderedHostOptions = computed(() => hostOptions(hosts.allHosts.value));

  const paramLegendLong = computed(() => Object.keys(object(paramStatus.value.long)).length > 0);
  const paramLegendShort = computed(() => Object.keys(object(paramStatus.value.short)).length > 0);

  /**
   * v8 managed label rename — the runtime's limit_order_create_max_market_
   * dist_pct reuses the f-price-dist field (run_editor_adapter.js :187-192).
   */
  const priceDistLabel = computed(() =>
    managed.value.live.includes('limit_order_create_max_market_dist_pct')
      ? 'limit_order_create_max_market_dist_pct'
      : 'initial_entry_exec_max_market_dist_pct'
  );

  /**
   * Field visibility — legacy data-v7-only/data-v8-only marking
   * (run_editor_adapter.js configureUi :169-181) plus the v8 metadata gate
   * (configureFields :77-96): a shared field is visible on v8 only when the
   * runtime declares it.
   */
  function fieldVisible(key: string): boolean {
    if (!adapter.isV8) return !V8_ONLY_KEYS.has(key);
    if (key === 'advanced') {
      // exp-advanced shown when the v8 runtime declares any managed field (:195-201)
      return managed.value.live.length > 0 || managed.value.logging.length > 0 || managed.value.monitor.length > 0;
    }
    if (key in SHARED_LIVE_FIELDS) return managed.value.live.includes(key);
    if (key in SHARED_LOGGING_FIELDS) return managed.value.logging.includes(key);
    if (key in SHARED_MONITOR_FIELDS) return managed.value.monitor.includes(key);
    return !V7_ONLY_KEYS.has(key);
  }

  function applyPopulated(nextCfg: Record<string, unknown>, nextParamStatus: ParamStatus, opts: { skipRawUpdate?: boolean } = {}): void {
    const populated = populateForm(nextCfg, {
      adapter,
      known: known.value,
      editorMetadata: editorMetadata.value,
      paramStatus: nextParamStatus,
      strategyCache: strategyCache.value,
      skipRawUpdate: opts.skipRawUpdate,
      rawJson: state.rawJson,
    });
    Object.assign(state, populated.state);
    extraLive.value = populated.extraLive;
    cfg.value = populated.cfg;
    paramStatus.value = populated.paramStatus;
    activeStrategyKind.value = populated.activeStrategyKind;
    // configured host always selectable (populateHosts :2340-2344)
    const configuredHost = String(object(populated.cfg.pbgui).enabled_on ?? 'disabled') || 'disabled';
    if (configuredHost !== 'disabled' && !hosts.allHosts.value.includes(configuredHost)) {
      hosts.allHosts.value = ['disabled', configuredHost];
    }
    hosts.selected.value = configuredHost;
    // coinOvLoad(cfg) inside legacy populateForm (:2451-2452) + the v8
    // context refresh from the loaded live block (:2375-2377)
    void coinOverrides.setContext({
      hslSignalMode: String(object(object(populated.cfg).live).hsl_signal_mode ?? ''),
      strategyKind: String(object(object(populated.cfg).live).strategy_kind ?? ''),
    });
    coinOverrides.load(populated.cfg);
    validateJsonFields(false);
  }

  /** validateJsonFieldTextarea equivalents for the structured JSON fields. */
  function validateRawText(raw: string): { parsed: unknown; error: JsonValidationError | null } {
    const validation = validateJsonText(raw, {
      expectObject: true,
      emptyMessage: t('v7run.configCannotBeEmpty'),
      messages: { cannotBeEmpty: t('v7run.configCannotBeEmpty'), topLevelObject: t('editor.json.topLevelObject') },
    });
    return validation;
  }

  function validateJsonFields(toastFailures: boolean): boolean {
    let firstInvalid: { label: string; error: JsonValidationError } | null = null;
    const errors: Record<string, JsonValidationError | null> = {};
    for (const field of JSON_FIELDS) {
      const label = field.label || t(field.key === 'longJson' ? 'v7run.longConfigJsonLabel' : 'v7run.shortConfigJsonLabel');
      const empty = field.empty || t(field.key === 'longJson' ? 'v7run.longConfigCannotBeEmpty' : 'v7run.shortConfigCannotBeEmpty');
      const validation = validateJsonText(state[field.key as keyof EditFormState] as string, {
        expectObject: field.expectObject,
        emptyMessage: empty,
        messages: { cannotBeEmpty: empty, topLevelObject: t('editor.json.topLevelObject') },
      });
      errors[field.key] = validation.error;
      if (validation.error && !firstInvalid) {
        firstInvalid = { label, error: validation.error };
      }
    }
    for (const field of extraLive.value) {
      if (field.kind !== 'json') continue;
      const validation = validateJsonText(field.text, {
        messages: {
          cannotBeEmpty: t('v7run.jsonValueCannotBeEmpty'),
          topLevelObject: t('editor.json.topLevelObject'),
        },
      });
      errors['extra:' + field.key] = validation.error;
      if (validation.error && !firstInvalid) {
        firstInvalid = { label: field.key + ' JSON', error: validation.error };
      }
    }
    jsonFieldErrors.value = errors;
    if (firstInvalid && toastFailures) {
      toast(jsonFieldMessage(firstInvalid.label, firstInvalid.error) + t('v7run.fixBeforeSaving'), 'err');
    }
    return !firstInvalid;
  }

  function jsonFieldMessage(label: string, error: JsonValidationError): string {
    let message = t('v7run.fieldIsInvalid', { label });
    if (error.line != null && error.column != null) {
      message += t('v7run.atLineColumn', { line: error.line, column: error.column });
    }
    return message;
  }

  /** syncEditorFromParsed (:2627-2633) — anchor-preserving raw→structured. */
  async function applyParsedFromRaw(parsed: Record<string, unknown>): Promise<void> {
    applyPopulated(parsed, paramStatus.value, { skipRawUpdate: true });
    await queueSymbols(true);
    syncCovCoins();
  }

  const jsonSync = useJsonSync({
    rawId: 'cfg-raw-json',
    getRaw: () => state.rawJson,
    setRaw: (value) => {
      state.rawJson = value;
    },
    validateRaw: (raw) => validateRawText(raw),
    onError: (error) => {
      rawError.value = error;
    },
    applyParsed: applyParsedFromRaw,
    collectConfig: () => collect(),
  });
  scheduleStructuredSync = () => jsonSync.scheduleStructured();

  async function loadMetadata(): Promise<void> {
    if (!adapter.isV8) return;
    const resp = await fetch(apiBase + '/editor/metadata', {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) throw new Error('PB8 editor metadata: HTTP ' + resp.status);
    editorMetadata.value = (await resp.json()) as EditorMetadata;
    managed.value = resolveManagedKeys(editorMetadata.value, 'v8');
    strategyKinds.value = supportedStrategies(editorMetadata.value);
  }

  function queueSymbols(preferConfigValues: boolean): Promise<void> {
    const live = object(cfg.value.live);
    const pbgui = object(cfg.value.pbgui);
    const user = state.user;
    const exchange = String(users.value.find((u) => u.name === user)?.exchange ?? '').toLowerCase();
    const selections = {
      approvedLong: state.approvedLong,
      approvedShort: state.approvedShort,
      ignoredLong: state.ignoredLong,
      ignoredShort: state.ignoredShort,
      tags: Array.isArray(pbgui.tags) ? pbgui.tags.slice() : state.tags,
    };
    return symbolsTags.queue(exchange, selections, { preferConfigValues });
  }

  /** coinOvSetCoins after each symbols load (v8 only, :3762). */
  function syncCovCoins(): void {
    if (adapter.isV8) {
      coinOverrides.setCoins(symbolsTags.symbols.value, symbolsTags.marketLabels.value);
    }
  }

  async function load(): Promise<void> {
    try {
      await loadMetadata();
      await coinOverrides.init();
      users.value = await loadUsers(apiBase);
      const loaded = await loadInstanceConfig(apiBase, adapter, params, fetch, users.value);
      fromBacktestConfig.value = loaded.fromBacktestConfig;
      overrideConfigs.value = loaded.overrideConfigs;
      // coinOvSetConfigName (:1852/:1873/:1886) before the populate load
      coinOverrides.setConfigName(loaded.source === 'new' ? '' : params.name);
      applyPopulated(loaded.cfg, loaded.paramStatus as ParamStatus);
      // ensureSelectOption parity (:2336/:2338) — the loaded values stay
      // selectable even when the fetched lists miss them
      if (state.user && !users.value.some((u) => u.name === state.user)) {
        users.value = [...users.value, { name: state.user, exchange: '' }];
      }
      if (adapter.isV8 && state.strategyKind && !strategyKinds.value.includes(state.strategyKind)) {
        strategyKinds.value = [state.strategyKind, ...strategyKinds.value];
      }
      if (loaded.source !== 'new') {
        coinOverrides.setOverrideConfigs(loaded.overrideConfigs, { markPending: loaded.source === 'draft' && adapter.isV8 });
      }
      for (const warning of loaded.warnings) {
        if (warning.kind === 'draft-not-found') {
          toast(t('v7run.draftNotFoundUsingDefaults'), 'info');
        } else {
          toast(t('v7run.loadedBackupDraft', { name: warning.name, timestamp: warning.timestamp }), 'info');
        }
      }
      await queueSymbols(true);
      syncCovCoins();
      await hosts.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loadError.value = message;
      toast(t('v7run.failedToInitialize') + ': ' + message, 'err');
    }
  }

  /** collectConfig with the page context (:2696) — coin overrides from the panel. */
  function collect(): Record<string, unknown> {
    return collectConfig(state, {
      adapter,
      cfg: cfg.value,
      extraLive: extraLive.value,
      managed: managed.value,
      coinOverrides: coinOverrides.collect().coin_overrides ?? {},
      fromBacktestConfig: fromBacktestConfig.value,
    });
  }

  /** changeRunStrategyKind (:2240-2276). */
  function changeStrategyKind(next: string): void {
    if (!adapter.isV8) return;
    const cleanNext = String(next ?? '').trim();
    if (!cleanNext || !strategyKinds.value.includes(cleanNext)) return;
    const previous = activeStrategyKind.value || String(object(cfg.value.live).strategy_kind ?? '');
    let longParsed: Record<string, unknown>;
    let shortParsed: Record<string, unknown>;
    try {
      longParsed = JSON.parse(state.longJson || '{}') as Record<string, unknown>;
      shortParsed = JSON.parse(state.shortJson || '{}') as Record<string, unknown>;
    } catch {
      state.strategyKind = previous;
      toast(t('v7run.fixLongShortJsonBeforeStrategy'), 'err');
      return;
    }
    const result = applyStrategyKindChange({
      sideConfigs: { long: longParsed, short: shortParsed },
      nextStrategy: cleanNext,
      editorMetadata: editorMetadata.value,
      paramStatus: paramStatus.value,
      strategyCache: strategyCache.value,
    });
    state.strategyKind = cleanNext;
    state.longJson = JSON.stringify(result.long, null, 2);
    state.shortJson = JSON.stringify(result.short, null, 2);
    const bot = object(cfg.value.bot);
    cfg.value = { ...cfg.value, bot: { ...bot, long: result.long, short: result.short } };
    paramStatus.value = result.paramStatus;
    strategyCache.value = result.cache;
    activeStrategyKind.value = result.activeStrategyKind;
    void coinOverrides.setContext({ hslSignalMode: state.hslSignalMode, strategyKind: cleanNext });
  }

  /**
   * The three save gates (ensureRawJsonValidForSave :1677-1691,
   * ensureStructuredJsonFieldsValidForSave :1614-1644,
   * validateExecutionSyncFieldsForSave :1646-1658) — toast the first
   * failure with its line/column.
   */
  function validateForSave(): boolean {
    const rawValidation = validateRawText(state.rawJson);
    rawError.value = rawValidation.error;
    if (rawValidation.error) {
      let message = t('v7run.rawJsonInvalid');
      if (rawValidation.error.line != null && rawValidation.error.column != null) {
        message += t('v7run.atLineColumn', { line: rawValidation.error.line, column: rawValidation.error.column });
      }
      toast(message + t('v7run.fixBeforeSaving'), 'err');
      return false;
    }
    if (!validateJsonFields(true)) return false;
    if (!adapter.isV8 || (managed.value.live.includes('max_n_cancellations_per_batch') && managed.value.live.includes('max_n_creations_per_batch'))) {
      if (!isExecutionSyncValid(state)) {
        toast(t('v7run.maxCancelMustExceedCreate'), 'err');
        return false;
      }
    }
    return true;
  }

  async function save(): Promise<void> {
    if (saving.value) return;
    saving.value = true;
    try {
      await symbolsTags.whenSettled();
      if (!validateForSave()) return;
      const config = collect();
      const wasNew = isNew.value;
      const name = wasNew ? adapter.newInstanceName(config) : instanceName.value;
      if (!name) {
        toast(t('v7run.userRequired'), 'err');
        return;
      }
      const overrideSnapshot = adapter.isV8 ? coinOverrides.snapshotPendingFiles() : {};
      const body = adapter.saveBody(config, overrideSnapshot, intVal(state.version));
      const resp = await fetch(
        apiBase + '/instances/' + encodeURIComponent(name) + '/config' + adapter.saveQuery(wasNew),
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const data = (await resp.json().catch(() => ({}))) as {
        config?: Record<string, unknown>;
        version?: number;
        sync?: { ok?: number; failed?: number };
        detail?: unknown;
      };
      if (!resp.ok) {
        const rawDetail = typeof data.detail === 'string' ? data.detail : resp.statusText;
        // 409 "Update your VPS first" → PBGuiDialogs.alert (:2935-2940)
        if (resp.status === 409 && rawDetail.startsWith('Update your VPS first')) {
          alert(t('v7run.saveBlocked'), serverMsg(rawDetail));
        } else {
          toast(t('v7run.saveFailed') + ': ' + serverMsg(rawDetail), 'err');
        }
        return;
      }
      const baseCfg = data.config && typeof data.config === 'object' && !Array.isArray(data.config)
        ? data.config
        : config;
      const nextCfg = { ...baseCfg, pbgui: { ...object(baseCfg.pbgui), version: data.version } };
      applyPopulated(nextCfg, paramStatus.value);
      if (wasNew) {
        instanceName.value = name;
        isNew.value = false;
        coinOverrides.setConfigName(name); // coinOvSetConfigName (:2961)
      }
      if (adapter.isV8) {
        coinOverrides.acknowledgePendingFiles(overrideSnapshot); // :2963-2965
      }
      const syncOk = data.sync?.ok ?? 0;
      const syncFail = data.sync?.failed ?? 0;
      let syncMsg = '';
      if (syncOk > 0) syncMsg = t('v7run.sshSyncOk', { count: syncOk });
      else if (syncFail > 0) syncMsg = t('v7run.sshSyncFailed', { count: syncFail });
      toast(t('v7run.savedVersion', { label: adapter.label, version: data.version ?? '' }) + syncMsg, 'ok');
    } catch (error) {
      toast(t('v7run.saveError') + ': ' + (error instanceof Error ? error.message : String(error)), 'err');
    } finally {
      saving.value = false;
    }
  }

  /** f-user change → reload symbols/tags for the new exchange (:1893-1895). */
  function onUserChange(): void {
    void queueSymbols(false).then(syncCovCoins);
  }

  /** Keep the hosts composable's selection tracker in sync with the form. */
  function onEnabledOnChange(): void {
    hosts.selected.value = state.enabledOn;
  }

  /** syncExecutionSyncFieldBounds changed-half (:1670-1674). */
  function onExecutionSyncChange(changed: 'maxCancel' | 'maxCreate'): void {
    const clamped = clampExecutionSync(state, changed);
    state.maxCancel = clamped.maxCancel;
    state.maxCreate = clamped.maxCreate;
  }

  /** getSelectedUserExchange (:1767-1775). */
  function selectedUserExchange(): string {
    return String(users.value.find((u) => u.name === state.user)?.exchange ?? '').toLowerCase();
  }

  /** INSTANCE_NAME || config.live.user || 'draft' (:1724). */
  function draftName(): string {
    return instanceName.value || String(object(collect().live).user ?? '') || 'draft';
  }

  function apiBaseOf(): string {
    return apiBase;
  }

  /** doImport (:3274-3277): cfg = prepared; paramStatus; populate + reload symbols. */
  function applyImportedConfig(nextCfg: Record<string, unknown>, nextParamStatus: Record<string, Record<string, string>>): void {
    applyPopulated(nextCfg, nextParamStatus as ParamStatus);
    void queueSymbols(true).then(syncCovCoins);
  }

  /** coinOvSetContext on hsl-signal-mode change (:1896-1900). */
  function onHslSignalModeChange(): void {
    void coinOverrides.setContext({ hslSignalMode: state.hslSignalMode, strategyKind: state.strategyKind });
  }

  /** syncBotInputToJson (:3494-3503). */
  function syncBotInputs(side: 'long' | 'short'): void {
    const jsonKey = side === 'long' ? 'longJson' : 'shortJson';
    const tweKey = side === 'long' ? 'longTwe' : 'shortTwe';
    const nposKey = side === 'long' ? 'longNpos' : 'shortNpos';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(state[jsonKey] || '{}') as Record<string, unknown>;
    } catch {
      return; // invalid JSON while typing
    }
    adapter.setBotValue(parsed, 'total_wallet_exposure_limit', numVal(state[tweKey]));
    adapter.setBotValue(parsed, 'n_positions', numVal(state[nposKey]));
    state[jsonKey] = JSON.stringify(parsed, null, 2);
  }

  /** bot JSON blur (:3516-3522). */
  function readBotInputsFromJson(side: 'long' | 'short'): void {
    const jsonKey = side === 'long' ? 'longJson' : 'shortJson';
    const tweKey = side === 'long' ? 'longTwe' : 'shortTwe';
    const nposKey = side === 'long' ? 'longNpos' : 'shortNpos';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(state[jsonKey] || '{}') as Record<string, unknown>;
    } catch {
      return;
    }
    state[tweKey] = String(adapter.getBotValue(parsed, 'total_wallet_exposure_limit', state[tweKey]));
    state[nposKey] = String(adapter.getBotValue(parsed, 'n_positions', state[nposKey]));
  }

  return {
    state,
    isV8: adapter.isV8,
    extraLive,
    cfg,
    paramStatus,
    users,
    strategyKinds,
    activeStrategyKind,
    saving,
    loadError,
    instanceName,
    isNew,
    hosts,
    symbolsTags,
    managed,
    known,
    renderedHostOptions,
    paramLegendLong,
    paramLegendShort,
    coinOverrides,
    jsonSync,
    rawError,
    jsonFieldErrors,
    priceDistLabel,
    fieldVisible,
    load,
    save,
    changeStrategyKind,
    collect,
    validateForSave,
    validateRawText,
    onUserChange,
    onEnabledOnChange,
    onExecutionSyncChange,
    selectedUserExchange,
    draftName,
    applyParsedFromRaw,
    apiBaseOf,
    applyImportedConfig,
    syncBotInputs,
    readBotInputsFromJson,
    onHslSignalModeChange,
    notify: (msg, kind) => toast(msg, kind ?? 'info'),
  };
}

/**
 * data-v8-only field keys (v7_edit.html DOM) — hidden on v7. Config-param
 * vocabulary (the shared-field maps are keyed by live.* names); UI-only keys
 * stay camelCase.
 */
const V8_ONLY_KEYS = new Set([
  'strategyKind', 'hsl_accept_incomplete_history', 'force_cold_startup',
  'fee_conversion_max_age_ms', 'fee_pct_fallback', 'fee_pct_sanity_abs_max',
  'order_replacement_churn_gate_activation_count', 'order_replacement_churn_gate_market_dist_pct',
  'order_replacement_churn_gate_stability_minutes', 'order_replacement_churn_gate_window_minutes',
  'enable_forager_ws_candles', 'forager_ws_candle_rest_audit_minutes',
  'exchange_symbol_unavailable_cooldown_hours', 'custom_endpoints_path', 'startup_phase_budgets',
  'dir', 'max_bytes_mb', 'backup_count', 'persist_to_file', 'rotation', 'live_event_debug_profiles',
  'enabled', 'root_dir', 'snapshot_interval_seconds', 'checkpoint_interval_minutes', 'event_rotation_mb',
  'event_rotation_minutes', 'max_total_bytes', 'price_tick_min_interval_ms', 'retain_days',
  'compress_rotated_segments', 'emit_completed_candles', 'include_raw_fill_payloads',
  'retain_candles', 'retain_fills', 'retain_price_ticks',
]);

/** data-v7-only keys — hidden on v8 unless the runtime declares them (maps). */
const V7_ONLY_KEYS = new Set(['advanced', 'dynamicIgnore']);
