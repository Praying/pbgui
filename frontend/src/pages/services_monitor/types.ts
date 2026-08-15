/**
 * API response types for the Services Monitor page.
 *
 * Extracted field-by-field from the legacy `frontend/services_monitor.html`
 * fetch consumers — only fields the UI actually reads are typed. Optional
 * fields mirror the legacy defensive access (`item.x || fallback`).
 */

/** GET /status item — consumed by updateStatusUI, serviceStatus* helpers, renderServiceButtons. */
export interface ServiceStatus {
  running?: boolean;
  /** `expected === false && !running` renders as "skipped" instead of stopped. */
  expected?: boolean;
  enabled?: boolean;
  can_enable?: boolean;
  enable_blocked_reason?: string;
  reason?: string;
  unit?: string;
  systemd_state?: string;
  systemd_enabled_state?: string;
}

/** Actions POSTed to `/{svcId}/{action}` by the legacy svcAction flow. */
export type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable';

/** GET /status payload, keyed by service id (pbcluster, pbrun, …). */
export type ServiceStatusMap = Record<string, ServiceStatus | undefined>;

/** Worker stat pill — stat.label / stat.value in renderWorkers/renderWorkerDetail. */
export interface WorkerStat {
  label: string;
  value: string;
}

/** Worker card/detail item — fields read by renderWorker*, renderWorkerDetail, updateWorkerLog. */
export interface Worker {
  id: string;
  label?: string;
  type?: string;
  running?: boolean;
  summary?: string;
  description?: string;
  note?: string;
  stats?: WorkerStat[];
  available?: boolean;
  can_start?: boolean;
  can_stop?: boolean;
  log_file?: string;
  monitor_path?: string;
}

/** Worker list group in GET /workers/status. */
export interface WorkerGroup {
  id?: string;
  label?: string;
  items?: Worker[];
}

/** GET /workers/status payload — counts.total/running, groups. */
export interface WorkersStatus {
  counts?: { total?: number; running?: number };
  groups?: WorkerGroup[];
}

/** GET /cmc-pool keys row — renderCmcPool table + openCmcKeyModal/edit form. */
export interface CmcKey {
  id: string;
  label?: string;
  local_state?: string;
  active?: boolean;
  status?: string;
  desired_state?: string;
  materialized_generation?: number;
  desired_generation?: number;
  generation?: number;
  source?: string;
  shared?: boolean;
  imported?: boolean;
  used_credits?: number;
  provider_used?: number;
  provider_limit?: number;
  provider_remaining?: number | null;
  provider_reset_at?: number | string | null;
  provider_stale_age_seconds?: number | null;
  cooldown_remaining?: number | null;
  quota_domain_id?: string;
  authority_epoch?: number | null;
}

/** Node offered by the authority-transfer modal (label: name or node_id). */
export interface CmcAuthorityNode {
  node_id: string;
  name?: string;
}

/** GET /cmc-pool payload (also reused as the usage source: day/soft_credit_limit). */
export interface CmcPool {
  keys?: CmcKey[];
  ready?: boolean;
  active_credentials?: number;
  total_credentials?: number;
  health?: string;
  warnings?: string[];
  day?: string | number;
  soft_credit_limit?: number | null;
  eligible_authority_nodes?: CmcAuthorityNode[];
}

/** key_usage row in GET /cmc-pool/leases, matched to keys by credential_id. */
export interface CmcKeyUsage {
  credential_id: string;
  reserved_credits?: number;
  reserved_requests?: number;
}

/** domains row in GET /cmc-pool/leases — per-quota-domain authority/provider state. */
export interface CmcDomain {
  quota_domain_id: string;
  authority_node?: string;
  authority_node_id?: string;
  authority_epoch?: number | null;
  authority_reachable?: boolean;
  authority_updated_at?: number | string | null;
  authority_state_age_seconds?: number | null;
  uncertain_credits?: number;
  provider_remaining?: number | null;
  provider_reset_at?: number | string | null;
  provider_stale_age_seconds?: number | null;
}

/** Lease Details table row in GET /cmc-pool/leases. */
export interface CmcLease {
  lease_id?: string;
  credential_id?: string;
  generation?: number;
  quota_domain_id?: string;
  authority_epoch?: number;
  recipient?: string;
  credits?: number;
  request_count?: number;
  granted_at?: number | string | null;
  expires_at?: number | string | null;
  outcome?: string;
  terminal?: boolean;
}

/** GET /cmc-pool/leases payload. */
export interface CmcLeasesResponse {
  authority?: {
    available?: boolean;
    active_leases?: number;
    lease_count?: number;
  };
  key_usage?: CmcKeyUsage[];
  domains?: CmcDomain[];
  leases?: CmcLease[];
  warnings?: string[];
}

/** GET /settings/pbdata payload — renderPBDataSettings + savePBDataSettings. */
export interface PbDataSettingsData {
  all_users?: string[];
  fetch_users?: string[];
  trades_users?: string[];
  log_level?: string;
  ws_max?: number;
  pollers_delay_seconds?: number;
  poll_interval_combined_seconds?: number;
  poll_interval_balance_seconds?: number;
  poll_interval_positions_seconds?: number;
  poll_interval_orders_seconds?: number;
  poll_interval_history_seconds?: number;
  poll_interval_executions_seconds?: number;
  shared_rest_user_pause_seconds?: number;
  shared_rest_pause_by_exchange?: Record<string, number>;
  latest_1m_coin_pause_seconds?: number;
}

/** POST /settings/pbdata response — legacy _post reads ok/apply.message/detail. */
export interface PbDataSaveResponse {
  ok?: boolean;
  detail?: string;
  apply?: { message?: unknown };
}

/** systemd_units / missing_default_units / not_ready_default_units row. */
export interface MigrationUnit {
  service?: string;
  unit?: string;
  exists?: boolean;
  enabled?: boolean;
  state?: string;
}

/** Detected legacy process row (renderMigrationProcesses). */
export interface MigrationProcess {
  service?: string;
  pid?: number | string;
  username?: string;
  current?: boolean;
  cmdline?: string;
}

/** GET /migration/status payload — fields read by migrationStatusMeta/renderMigrationStatus. */
export interface MigrationStatus {
  _restart_pending?: boolean;
  _error?: string;
  migration_needed?: boolean;
  warnings?: string[];
  user?: string;
  uid?: number | string;
  pbgui_dir?: string;
  pbgui_python?: string;
  systemd_unit_dir?: string;
  pb7dir?: string;
  systemd_units?: MigrationUnit[];
  missing_default_units?: MigrationUnit[];
  not_ready_default_units?: MigrationUnit[];
  legacy_crontab?: { entries?: string[] };
  legacy_start_sh?: { exists?: boolean; path?: string };
  processes?: MigrationProcess[];
}
