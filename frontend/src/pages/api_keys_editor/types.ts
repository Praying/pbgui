/* API shapes for the API Keys editor — mirrors api/api_keys.py response models. */

export interface ExchangeCatalog {
  exchanges: string[];
  passphrase_exchanges: string[];
  v7_exchanges: string[];
}

export interface UserSummary {
  name: string;
  exchange: string;
  in_use: boolean;
  has_key?: boolean;
  has_secret?: boolean;
  has_wallet?: boolean;
  has_private_key?: boolean;
  is_vault?: boolean;
  hl_expiry_status?: string | null;
  hl_days_remaining?: number | null;
  hl_valid_until_iso?: string | null;
  bybit_expiry_status?: string | null;
  bybit_days_remaining?: number | null;
  bybit_expires_at_iso?: string | null;
}

export interface UserDetail extends UserSummary {
  key_masked?: string;
  secret_masked?: string;
  passphrase_masked?: string;
  private_key_masked?: string;
  wallet_address?: string;
  quote?: string;
  options?: unknown;
  extra?: unknown;
}

export type ExpiryStatusKind =
  | 'ok'
  | 'expiring_soon'
  | 'critical'
  | 'expired'
  | 'no_expiry'
  | 'error'
  | 'unknown';

export interface ExpiryInfoBase {
  name: string;
  status: ExpiryStatusKind | null;
  days_remaining?: number | null;
  error?: string | null;
}

export interface HlExpiryInfo extends ExpiryInfoBase {
  is_vault?: boolean;
  valid_until_iso: string | null;
}

export interface BybitExpiryInfo extends ExpiryInfoBase {
  expires_at_iso: string | null;
  ips: string[] | null;
}

export interface ApiMeta {
  api_serial?: string;
  api_ts?: string | null;
  api_by?: string | null;
}

export interface CommentField {
  key: string;
  value: string;
}

export interface BackupEntry {
  filename: string;
  ts: string;
  size_kb: number;
  target: string;
}

export type DiffOpcode = [tag: string, i1: number, i2: number, j1: number, j2: number];

export interface DiffResponse {
  filename1: string;
  filename2: string;
  lines1: string[];
  lines2: string[];
  opcodes: DiffOpcode[];
}

export interface ConnectionTestResult {
  success: boolean;
  balance_futures?: number | null;
  error?: string | null;
}

export interface TradFiProjection {
  status?: string;
  desired_generation?: number;
  applied_generation?: number;
  attempts?: number;
  last_error?: string | null;
}

export interface TradFiProfile {
  id: string | null;
  provider: string;
  label: string;
  active: boolean;
  shared: boolean;
  generation: number;
  configured: boolean;
  has_api_key: boolean;
  has_api_secret: boolean;
  origin: string;
  pending: boolean;
  pending_delete: boolean;
  pending_stage: string;
  pending_operation_id: string;
  last_operation_id: string;
  replicated_active: boolean;
  activation_generation: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TradFiProfilesResponse {
  providers: string[];
  provider_notes: Record<string, string>;
  provider_links: Record<string, { url: string; label: string }>;
  needs_secret: string[];
  profiles: TradFiProfile[];
  replicated_active_profiles: Record<string, { profile_id?: string | null }>;
  projection: TradFiProjection;
}

export interface HlExpiryConfig {
  telegram_warning_days: number;
  configured: boolean;
}

export interface UserSaveData {
  exchange: string;
  key: string | null;
  secret: string | null;
  passphrase: string | null;
  wallet_address: string | null;
  private_key: string | null;
  is_vault: boolean;
  quote: string | null;
  options: unknown;
  extra: unknown;
}

/** Translator matching the legacy t(key, params) helper. */
export type Translator = (key: string, params?: Record<string, unknown>) => string;
