/*
 * Settings field IO — legacy setFieldValue/readFieldValue/readNumberValue
 * (market_data_main.html:5551-5573) over reactive field values instead of
 * DOM elements, plus the legacy input-id registry (:2986-3072). The rendered
 * inputs keep the ids verbatim for CSS parity and greppability.
 */

/** Legacy element ids for every settings input (hyperliquid-only included). */
export const SETTINGS_FIELD_IDS = {
  intervalSeconds: 'settings-interval-seconds',
  coinPauseSeconds: 'settings-coin-pause-seconds',
  apiTimeoutSeconds: 'settings-api-timeout-seconds',
  minLookbackDays: 'settings-min-lookback-days',
  maxLookbackDays: 'settings-max-lookback-days',
  awsProfile: 'settings-aws-profile',
  awsAccessKeyId: 'settings-aws-access-key-id',
  awsSecretAccessKey: 'settings-aws-secret-access-key',
  awsRegion: 'settings-aws-region',
  scanTimeout: 'settings-scan-timeout',
  scanWorkers: 'settings-scan-workers',
  archiveEnabled: 'settings-archive-enabled',
  archiveDir: 'settings-archive-dir',
} as const;

/** Text fields hold raw input strings; the checkbox holds a boolean. */
export interface SettingsFieldValues {
  intervalSeconds: string;
  coinPauseSeconds: string;
  apiTimeoutSeconds: string;
  minLookbackDays: string;
  maxLookbackDays: string;
  awsProfile: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsAccessKeyConfigured: boolean;
  awsSecretAccessKeyConfigured: boolean;
  awsRegion: string;
  scanTimeout: string;
  scanWorkers: string;
  archiveEnabled: boolean;
  archiveDir: string;
}

/** Legacy readNumberValue fallbacks (:8908-8912, :8921-8922). */
export const SETTINGS_NUMBER_DEFAULTS = {
  intervalSeconds: 1800,
  coinPauseSeconds: 0.5,
  apiTimeoutSeconds: 30.0,
  minLookbackDays: 2,
  maxLookbackDays: 4,
  scanTimeout: 5.0,
  scanWorkers: 8,
} as const;

/** Legacy aws_profile fallback (:8917). */
export const DEFAULT_AWS_PROFILE = 'pbgui-hyperliquid';

/** Empty form state — legacy inputs default to empty strings (:5558). */
export function createSettingsFieldValues(): SettingsFieldValues {
  return {
    intervalSeconds: '',
    coinPauseSeconds: '',
    apiTimeoutSeconds: '',
    minLookbackDays: '',
    maxLookbackDays: '',
    awsProfile: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsAccessKeyConfigured: false,
    awsSecretAccessKeyConfigured: false,
    awsRegion: '',
    scanTimeout: '',
    scanWorkers: '',
    archiveEnabled: false,
    archiveDir: '',
  };
}

/**
 * setFieldValue's text branch (:5558): null/undefined → '', else String().
 * (The checkbox branch maps straight onto the boolean field.)
 */
export function toFieldValue(value: unknown): string {
  return value == null ? '' : String(value);
}

/**
 * readFieldValue's text branch (:5565): String(value || '').trim() — note the
 * falsy coercion: an input can never hold null, so '' stays ''.
 */
export function readTextFieldValue(value: string): string {
  return String(value || '').trim();
}

/**
 * readNumberValue (:5568-5573): empty → fallback; parseInt/parseFloat keeps
 * the legacy lenient prefix semantics ('12abc' → 12); NaN → fallback.
 */
export function readNumberValue(raw: string, fallback: number, asInteger: boolean): number {
  const text = readTextFieldValue(raw);
  if (text === '') return fallback;
  const parsed = asInteger ? Number.parseInt(text, 10) : Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}
