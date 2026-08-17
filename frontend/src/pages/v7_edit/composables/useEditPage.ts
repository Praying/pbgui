import { computed, inject, provide, reactive, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import type { EditAdapter } from '../config';
import type { ExtraLiveField, EditFormState } from '../lib/formModel';
import { clampExecutionSync, intVal, isExecutionSyncValid } from '../lib/formModel';
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

/**
 * Page orchestration — the Vue port of init() (v7_edit.html:1797-1908) and
 * saveConfig (:2908-2982): load users → resolve the load mode (draft/new/
 * named instance) → populate the structured form → host capabilities and
 * symbols/tags; collect + PUT on save. The M-v7-2 surfaces (handoffs, raw
 * JSON bidirectional sync, coin-override panel, import/copy modals, log
 * panel) extend this store.
 */

export type Translate = (key: string, params?: Record<string, unknown>) => string;

type ToastFn = (msg: string, kind?: 'ok' | 'err' | 'info') => void;

export interface UseEditPageOptions {
  readonly adapter: EditAdapter;
  readonly apiBase: string;
  readonly params: { name: string; isNew: boolean; draftId: string };
  readonly t: Translate;
  readonly toast: ToastFn;
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
  load(): Promise<void>;
  save(): Promise<void>;
  changeStrategyKind(next: string): void;
  collect(): Record<string, unknown>;
  onUserChange(): void;
  onEnabledOnChange(): void;
  onExecutionSyncChange(changed: 'maxCancel' | 'maxCreate'): void;
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

function parseOk(raw: string): boolean {
  if (!raw.trim()) return false;
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

export function useEditPage(options: UseEditPageOptions): UseEditPage {
  const { adapter, apiBase, t, toast } = options;
  const params = { ...options.params };

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

  const hosts = useHosts(apiBase, adapter, instanceName.value);
  const symbolsTags = useSymbolsTags(apiBase);

  const known = computed(() => buildKnownLiveParams(adapter.version, managed.value.live, adapter.knownLiveParams));
  /** Rendered host select options — 'disabled' first (populateHosts :1956-1967). */
  const renderedHostOptions = computed(() => hostOptions(hosts.allHosts.value));

  const paramLegendLong = computed(() => Object.keys(object(paramStatus.value.long)).length > 0);
  const paramLegendShort = computed(() => Object.keys(object(paramStatus.value.short)).length > 0);

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
  }

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

  async function load(): Promise<void> {
    try {
      await loadMetadata();
      users.value = await loadUsers(apiBase);
      if (state.user && !users.value.some((u) => u.name === state.user)) {
        users.value = [...users.value, { name: state.user, exchange: '' }];
      }
      const loaded = await loadInstanceConfig(apiBase, adapter, params, fetch, users.value);
      fromBacktestConfig.value = loaded.fromBacktestConfig;
      overrideConfigs.value = loaded.overrideConfigs;
      if (adapter.isV8 && state.strategyKind && !strategyKinds.value.includes(state.strategyKind)) {
        strategyKinds.value = [state.strategyKind, ...strategyKinds.value];
      }
      applyPopulated(loaded.cfg, loaded.paramStatus as ParamStatus);
      for (const warning of loaded.warnings) {
        if (warning.kind === 'draft-not-found') {
          toast(t('v7run.draftNotFoundUsingDefaults'), 'info');
        } else {
          toast(t('v7run.loadedBackupDraft', { name: warning.name, timestamp: warning.timestamp }), 'info');
        }
      }
      await queueSymbols(true);
      await hosts.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loadError.value = message;
      toast(t('v7run.failedToInitialize') + ': ' + message, 'err');
    }
  }

  /** collectConfig with the page context (:2696). */
  function collect(): Record<string, unknown> {
    return collectConfig(state, {
      adapter,
      cfg: cfg.value,
      extraLive: extraLive.value,
      managed: managed.value,
      coinOverrides: object(cfg.value.coin_overrides),
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
  }

  /** Save gates kept from saveConfig (:2914-2916) with simple toasts — the
   * full line-reveal validation UI lands with M-v7-2's JSON validation port. */
  function validateForSave(): boolean {
    if (!parseOk(state.rawJson)) {
      toast(t('v7run.rawJsonInvalid') + t('v7run.fixBeforeSaving'), 'err');
      return false;
    }
    if (!parseOk(state.longJson) || !parseOk(state.shortJson)) {
      toast(t('v7run.fieldIsInvalid', { label: t('v7run.longConfigJsonLabel') }) + t('v7run.fixBeforeSaving'), 'err');
      return false;
    }
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
      if (!validateForSave()) return;
      const config = collect();
      const wasNew = isNew.value;
      const name = wasNew ? adapter.newInstanceName(config) : instanceName.value;
      if (!name) {
        toast(t('v7run.userRequired'), 'err');
        return;
      }
      const body = adapter.saveBody(config, overrideConfigs.value, intVal(state.version));
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
        const detail = typeof data.detail === 'string' ? data.detail : resp.statusText;
        toast(t('v7run.saveFailed') + ': ' + detail, 'err');
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
    void queueSymbols(false);
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
    fieldVisible,
    load,
    save,
    changeStrategyKind,
    collect,
    onUserChange,
    onEnabledOnChange,
    onExecutionSyncChange,
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
