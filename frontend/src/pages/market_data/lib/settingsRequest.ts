/*
 * collectSettingsRequest — the POST payload CONTRACT (legacy
 * market_data_main.html:8900-8928). Byte-level fidelity: property insertion
 * order must stay identical so JSON.stringify matches the legacy serializer
 * (the baseline dirty diff and the server both consume these bytes).
 *
 *   base object   :8904-8914  auto_enable_new_coins / enabled_coins / 5 fields
 *   coin expansion:8901-8903  auto-enable → all coins, default sort
 *   aws block     :8916-8925  appended AFTER the base five, hyperliquid only;
 *                              credential values are omitted when blank so
 *                              routine saves preserve stored credentials
 */

import {
  DEFAULT_AWS_PROFILE,
  SETTINGS_NUMBER_DEFAULTS,
  readNumberValue,
  readTextFieldValue,
  type SettingsFieldValues,
} from './settingsFields';

export interface SettingsRequestSettings {
  interval_seconds: number;
  coin_pause_seconds: number;
  api_timeout_seconds: number;
  min_lookback_days: number;
  max_lookback_days: number;
  aws_profile?: string;
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  aws_region?: string;
  l2book_scan_timeout_s?: number;
  l2book_scan_workers?: number;
  l2book_archive_enabled?: boolean;
  l2book_archive_dir?: string;
}

export interface SettingsRequest {
  auto_enable_new_coins: boolean;
  enabled_coins: string[];
  settings: SettingsRequestSettings;
}

export interface CollectSettingsRequestInput {
  /** settingsState.exchange (:8916 branch key). */
  exchange: string;
  autoEnableNewCoins: boolean;
  /** settingsState.selectedCoins (a Set in the store). */
  selectedCoins: Iterable<string>;
  /** getAllCoins() — payload.coin_options (:7015-7019). */
  allCoins: readonly string[];
  fields: SettingsFieldValues;
}

/** Legacy aws_profile fallback `|| 'pbgui-hyperliquid'` (:8917). */
function awsProfileOrDefault(raw: string): string {
  return readTextFieldValue(raw) || DEFAULT_AWS_PROFILE;
}

export function collectSettingsRequest(input: CollectSettingsRequestInput): SettingsRequest {
  const { fields } = input;
  // :8901-8903 — auto-enable expands to every coin; default sort is the
  // UTF-16 code-unit sort, deliberately NOT localeCompare.
  const enabledCoins = input.autoEnableNewCoins
    ? [...input.allCoins].sort()
    : [...input.selectedCoins].sort();

  const request: SettingsRequest = {
    auto_enable_new_coins: Boolean(input.autoEnableNewCoins), // :8905
    enabled_coins: enabledCoins, // :8906
    settings: {
      interval_seconds: readNumberValue(fields.intervalSeconds, SETTINGS_NUMBER_DEFAULTS.intervalSeconds, true),
      coin_pause_seconds: readNumberValue(fields.coinPauseSeconds, SETTINGS_NUMBER_DEFAULTS.coinPauseSeconds, false),
      api_timeout_seconds: readNumberValue(fields.apiTimeoutSeconds, SETTINGS_NUMBER_DEFAULTS.apiTimeoutSeconds, false),
      min_lookback_days: readNumberValue(fields.minLookbackDays, SETTINGS_NUMBER_DEFAULTS.minLookbackDays, true),
      max_lookback_days: readNumberValue(fields.maxLookbackDays, SETTINGS_NUMBER_DEFAULTS.maxLookbackDays, true),
    },
  };

  if (input.exchange === 'hyperliquid') {
    // :8916-8925 — appended in this exact order after the base five
    request.settings.aws_profile = awsProfileOrDefault(fields.awsProfile);
    const awsAccessKeyId = readTextFieldValue(fields.awsAccessKeyId);
    const awsSecretAccessKey = readTextFieldValue(fields.awsSecretAccessKey);
    if (awsAccessKeyId) request.settings.aws_access_key_id = awsAccessKeyId;
    if (awsSecretAccessKey) request.settings.aws_secret_access_key = awsSecretAccessKey;
    request.settings.aws_region = readTextFieldValue(fields.awsRegion);
    request.settings.l2book_scan_timeout_s = readNumberValue(
      fields.scanTimeout,
      SETTINGS_NUMBER_DEFAULTS.scanTimeout,
      false
    );
    request.settings.l2book_scan_workers = readNumberValue(
      fields.scanWorkers,
      SETTINGS_NUMBER_DEFAULTS.scanWorkers,
      true
    );
    request.settings.l2book_archive_enabled = Boolean(fields.archiveEnabled); // :8923
    request.settings.l2book_archive_dir = readTextFieldValue(fields.archiveDir);
  }

  return request;
}
