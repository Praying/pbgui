import type { EditAdapter } from '../config';

/**
 * Instance config loading — ports of the init() load chain
 * (v7_edit.html:1834-1890), fetchTemplateConfig (:1987-2005),
 * buildDefaultConfig (:2007-2069) and editor_shared.js
 * normalizeEditorConfigPayload (:566-607) the draft path routes through.
 */

export interface EditorConfigPayload {
  readonly name: string;
  readonly config: Record<string, unknown>;
  readonly param_status: Record<string, Record<string, string>>;
  readonly migration_report?: Record<string, unknown>;
  readonly migration_review_values?: Record<string, unknown>;
  readonly migration_message?: string;
}

export interface UserInfo {
  readonly name: string;
  readonly exchange: string;
}

export type InstanceWarning =
  | { readonly kind: 'draft-not-found' }
  | { readonly kind: 'backup-loaded'; readonly name: string; readonly timestamp: string };

export interface LoadInstanceResult {
  readonly source: 'draft' | 'new' | 'instance';
  readonly cfg: Record<string, unknown>;
  readonly paramStatus: Record<string, Record<string, string>>;
  readonly overrideConfigs: Record<string, unknown>;
  readonly fromBacktestConfig: string;
  readonly warnings: readonly InstanceWarning[];
  readonly migrationReport: Record<string, unknown> | null;
  readonly migrationReviewValues: Record<string, unknown>;
  readonly migrationMessage: string;
}

type FetchFn = typeof fetch;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function apiFetch<T>(url: string, opts: RequestInit, fetchFn: FetchFn): Promise<T> {
  const resp = await fetchFn(url, { credentials: 'same-origin', ...opts });
  const body: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = typeof (body as { detail?: unknown }).detail === 'string'
      ? (body as { detail: string }).detail
      : resp.statusText || `HTTP ${resp.status}`;
    throw new Error(detail);
  }
  return body as T;
}

/** Port of editor_shared.js:566-607 (normalizeEditorConfigPayload). */
export function normalizeEditorConfigPayload(
  data: unknown,
  fallbackConfig?: Record<string, unknown>
): EditorConfigPayload {
  const fallback = fallbackConfig && typeof fallbackConfig === 'object' && !Array.isArray(fallbackConfig)
    ? fallbackConfig
    : null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    if (fallback) return { name: '', config: fallback, param_status: {} };
    throw new Error('Invalid editor config payload');
  }
  const raw = data as Record<string, unknown>;
  const hasWrappedConfig = raw.config && typeof raw.config === 'object' && !Array.isArray(raw.config);
  let cfg = (hasWrappedConfig ? raw.config : raw) as Record<string, unknown> | null;
  let paramStatus = raw.param_status && typeof raw.param_status === 'object' && !Array.isArray(raw.param_status)
    ? (raw.param_status as Record<string, Record<string, string>>)
    : {};
  if (!Object.keys(paramStatus).length && Object.keys(object(raw._pbgui_param_status)).length) {
    paramStatus = raw._pbgui_param_status as Record<string, Record<string, string>>;
  }
  if (!Object.keys(paramStatus).length && cfg && Object.keys(object(cfg._pbgui_param_status)).length) {
    paramStatus = cfg._pbgui_param_status as Record<string, Record<string, string>>;
  }
  if (cfg && cfg._pbgui_param_status) {
    cfg = { ...cfg };
    delete cfg._pbgui_param_status;
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    if (fallback) cfg = fallback;
    else throw new Error('Prepared config missing');
  }
  const normalized: EditorConfigPayload & {
    migration_report?: Record<string, unknown>;
    migration_review_values?: Record<string, unknown>;
    migration_message?: string;
  } = {
    name: typeof raw.name === 'string' ? raw.name : '',
    config: cfg,
    param_status: paramStatus || {},
  };
  if (raw.migration_report && typeof raw.migration_report === 'object' && !Array.isArray(raw.migration_report)) {
    normalized.migration_report = raw.migration_report as Record<string, unknown>;
  }
  if (raw.migration_review_values && typeof raw.migration_review_values === 'object' && !Array.isArray(raw.migration_review_values)) {
    normalized.migration_review_values = raw.migration_review_values as Record<string, unknown>;
  }
  if (typeof raw.migration_message === 'string') normalized.migration_message = raw.migration_message;
  return normalized;
}

/** fetchPreparedDraftConfig (:1346-1350). */
export async function fetchPreparedDraftConfig(
  apiBase: string,
  draftId: string,
  fetchFn: FetchFn = fetch
): Promise<EditorConfigPayload> {
  const body = await apiFetch<unknown>(
    `${apiBase}/draft/${encodeURIComponent(draftId)}`,
    { headers: { 'Content-Type': 'application/json' } },
    fetchFn
  );
  return normalizeEditorConfigPayload(body);
}

/** Legacy v7 built-in template (:2007-2069) — the v8 endpoint is mandatory. */
export function buildDefaultConfig(user: string): Record<string, unknown> {
  return {
    live: {
      user,
      leverage: 10,
      minimum_coin_age_days: 0,
      pnls_max_lookback_days: 30,
      warmup_ratio: 0,
      initial_entry_exec_max_market_dist_pct: 0.005,
      execution_delay_seconds: 2,
      market_order_near_touch_threshold: 0.001,
      filter_by_min_effective_cost: true,
      market_orders_allowed: true,
      auto_gs: true,
      hedge_mode: false,
      approved_coins: { long: [], short: [] },
      ignored_coins: { long: [], short: [] },
      max_n_cancellations_per_batch: 5,
      max_n_creations_per_batch: 3,
      fills_recent_overlap_minutes: 10,
      fills_confirmation_overlap_minutes: 60,
      forced_mode_long: '',
      forced_mode_short: '',
      hsl_signal_mode: 'unified',
      hsl_position_during_cooldown_policy: 'panic',
      max_n_restarts_per_day: 10,
      max_disk_candles_per_symbol_per_tf: 1000000,
      max_memory_candles_per_symbol: 200000,
      time_in_force: 'good_till_cancelled',
      inactive_coin_candle_ttl_minutes: 10,
      max_active_candle_tail_gap_minutes: 10,
      recv_window_ms: 10000,
      order_match_tolerance_pct: 0.0002,
      balance_override: null,
      balance_hysteresis_snap_pct: 0.02,
      warmup_jitter_seconds: 0,
      warmup_concurrency: 0,
      max_warmup_minutes: 0,
      max_concurrent_api_requests: 0,
      defer_broad_candle_warmup: true,
      enable_archive_candle_fetch: false,
      max_ohlcv_fetches_per_minute: 24,
      candle_lock_timeout_seconds: 10,
      market_snapshot_ticker_strategy: 'auto',
      max_forager_candle_staleness_minutes: null,
      max_forager_candle_refresh_seconds: 45,
      forager_score_hysteresis_pct: 0.02,
    },
    logging: { level: 1, memory_snapshot_interval_minutes: 30, volume_refresh_info_threshold_seconds: 30 },
    pbgui: {
      version: 0, enabled_on: 'disabled', note: '',
      market_cap: 0, vol_mcap: 10.0, tags: [],
      only_cpt: false, notices_ignore: false, dynamic_ignore: false,
    },
    bot: {
      long: { n_positions: 10, total_wallet_exposure_limit: 1.7 },
      short: { n_positions: 0, total_wallet_exposure_limit: 0 },
    },
    coin_overrides: {},
    backtest: {},
    optimize: {},
  };
}

/** fetchTemplateConfig (:1987-2005). */
export async function fetchTemplateConfig(
  apiBase: string,
  adapter: EditAdapter,
  user: string,
  fetchFn: FetchFn = fetch
): Promise<Record<string, unknown>> {
  try {
    const resp = await fetchFn(`${apiBase}/instances/new-config`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
    if (resp.ok) {
      const data = (await resp.json()) as { config?: Record<string, unknown> };
      const tmpl = object(data.config);
      if (!tmpl.live) tmpl.live = {};
      object(tmpl.live).user = user;
      if (!tmpl.pbgui) tmpl.pbgui = {};
      return tmpl;
    }
    if (adapter.isV8) throw new Error('PB8 template unavailable');
    return buildDefaultConfig(user);
  } catch (error) {
    if (adapter.isV8) throw error;
    return buildDefaultConfig(user);
  }
}

/** GET /users (:1819-1820). */
export async function loadUsers(apiBase: string, fetchFn: FetchFn = fetch): Promise<UserInfo[]> {
  const data = await apiFetch<{ users?: unknown }>(`${apiBase}/users`, {}, fetchFn);
  return Array.isArray(data.users) ? (data.users as UserInfo[]) : [];
}

/**
 * The three load modes of init (:1834-1890): draft (via the payload
 * normalizer), new (template + first user) and named instance (raw payload
 * keeps override_configs — the draft normalizer drops them, parity with the
 * legacy resolveEditorConfigPayload).
 */
export async function loadInstanceConfig(
  apiBase: string,
  adapter: EditAdapter,
  params: { name: string; isNew: boolean; draftId: string },
  fetchFn: FetchFn = fetch,
  users: readonly UserInfo[] = []
): Promise<LoadInstanceResult> {
  const warnings: InstanceWarning[] = [];
  if (params.draftId) {
    try {
      const draft = await fetchPreparedDraftConfig(apiBase, params.draftId, fetchFn);
      if (draft.config) {
        const cfg = draft.config;
        const backupInfo = object(cfg.pbgui).from_backup_config as { name?: string; timestamp?: string } | null;
        if (backupInfo && typeof backupInfo === 'object') {
          warnings.push({
            kind: 'backup-loaded',
            name: String(backupInfo.name ?? ''),
            timestamp: String(backupInfo.timestamp ?? ''),
          });
        }
        return {
          source: 'draft',
          cfg,
          paramStatus: draft.param_status,
          overrideConfigs: {},
          fromBacktestConfig: String(object(cfg.pbgui).from_backtest_config ?? ''),
          warnings,
          migrationReport: draft.migration_report ?? null,
          migrationReviewValues: draft.migration_review_values ?? {},
          migrationMessage: draft.migration_message ?? '',
        };
      }
    } catch {
      // fall through like the legacy try/catch (:1838-1840)
    }
  }
  if (params.isNew) {
    if (params.draftId) warnings.push({ kind: 'draft-not-found' });
    const user = users.length > 0 ? users[0]!.name : '';
    const cfg = await fetchTemplateConfig(apiBase, adapter, user, fetchFn);
    return {
      source: 'new',
      cfg,
      paramStatus: {},
      overrideConfigs: {},
      fromBacktestConfig: '',
      warnings,
      migrationReport: null,
      migrationReviewValues: {},
      migrationMessage: '',
    };
  }
  const data = await apiFetch<{
    config?: Record<string, unknown>;
    param_status?: Record<string, Record<string, string>>;
    override_configs?: Record<string, unknown>;
    migration_report?: Record<string, unknown>;
    migration_review_values?: Record<string, unknown>;
    migration_message?: string;
  }>(`${apiBase}/instances/${encodeURIComponent(params.name)}/config`, {}, fetchFn);
  const cfg = object(data.config);
  return {
    source: 'instance',
    cfg,
    paramStatus: data.param_status && typeof data.param_status === 'object' ? data.param_status : {},
    overrideConfigs: object(data.override_configs),
    fromBacktestConfig: String(object(cfg.pbgui).from_backtest_config ?? ''),
    warnings,
    migrationReport: data.migration_report ?? null,
    migrationReviewValues: data.migration_review_values ?? {},
    migrationMessage: data.migration_message ?? '',
  };
}
