/**
 * Preset button specs and the local service map for the shared log viewer.
 *
 * The preset patterns are the legacy LogViewerPanel regexes, moved here so
 * both Vue hosts (Logging Monitor and API Keys) share one vocabulary. Hosts
 * pass the set that fits their page: `SYSTEM_PRESETS` for the logging page,
 * `APIKEYS_PRESETS` for the API-keys log panel.
 */

/** One toolbar preset: a label plus the regex applied to each line. */
export interface LogPreset {
  /** Stable id, also used for the `data-test="preset-<key>"` hook. */
  key: string;
  /** i18n key for the button label; falls back to `label` when absent. */
  labelKey?: string;
  /** Literal label (used where there is no dictionary key, e.g. "[ApiKeys]"). */
  label?: string;
  /** Regex source matched case-insensitively against each line. */
  pattern: string;
}

/** `presets: 'system'` — the Logging Monitor toolbar. */
export const SYSTEM_PRESETS: readonly LogPreset[] = [
  { key: 'errors', labelKey: 'shared.log.errors', pattern: 'error|traceback|exception' },
  { key: 'warnings', labelKey: 'shared.log.warnings', pattern: 'warning|warn' },
  { key: 'errorsWarnings', labelKey: 'shared.log.errorsWarnings', pattern: 'error|warning|traceback' },
  { key: 'connection', labelKey: 'shared.log.connection', pattern: 'connect|disconnect|timeout|reconnect' },
  { key: 'restartStop', labelKey: 'shared.log.restartStop', pattern: 'restart|kill|stop|shutdown' },
  { key: 'traceback', labelKey: 'shared.log.traceback', pattern: 'traceback|exception|raise' },
];

/** `presets: 'trading'` — available for bot-facing pages. */
export const TRADING_PRESETS: readonly LogPreset[] = [
  { key: 'errors', labelKey: 'shared.log.errors', pattern: 'error|traceback|exception' },
  { key: 'warnings', labelKey: 'shared.log.warnings', pattern: 'warning|warn' },
  { key: 'errorsWarnings', labelKey: 'shared.log.errorsWarnings', pattern: 'error|warning|traceback' },
  { key: 'ordersFills', labelKey: 'shared.log.ordersFills', pattern: 'order|fill|entry|close' },
  { key: 'balancePnl', labelKey: 'shared.log.balancePnl', pattern: 'balance|pnl|profit|loss|equity' },
  { key: 'positions', labelKey: 'shared.log.positions', pattern: 'position|pos_size|wallet' },
  { key: 'startup', labelKey: 'shared.log.startup', pattern: 'start|running|initialized|listening' },
  { key: 'connection', labelKey: 'shared.log.connection', pattern: 'connect|disconnect|timeout|reconnect' },
  { key: 'restartStop', labelKey: 'shared.log.restartStop', pattern: 'restart|kill|stop|shutdown' },
  { key: 'traceback', labelKey: 'shared.log.traceback', pattern: 'traceback|exception|raise' },
];

/** API-keys panel toolbar: the [ApiKeys] marker plus the shared error cuts. */
export const APIKEYS_PRESETS: readonly LogPreset[] = [
  { key: 'apikeys', label: '[ApiKeys]', pattern: '\\[ApiKeys\\]' },
  { key: 'errors', labelKey: 'shared.log.errors', pattern: 'error|traceback|exception' },
  { key: 'warnings', labelKey: 'shared.log.warnings', pattern: 'warning|warn' },
];

/**
 * Local log filename → PBGui service name (legacy `_LOCAL_SVC_MAP`). Files
 * outside the map that follow the `{name}.log` bot-instance convention map to
 * `Bot:{name}:7`.
 */
const LOCAL_SERVICE_BY_FILE: Readonly<Record<string, string>> = {
  'PBRun.log': 'PBRun',
  'PBRemote.log': 'PBRemote',
  'PBCoinData.log': 'PBCoinData',
  'PBData.log': 'PBData',
};

/** Resolve the restartable service for a local log file, or null if none. */
export function localServiceForFile(file: string): string | null {
  if (!file) return null;
  if (file.startsWith('Bot:')) return `${file}:7`;
  const known = LOCAL_SERVICE_BY_FILE[file];
  if (known) return known;
  if (file.endsWith('.log') && !file.includes('/')) {
    return `Bot:${file.replace(/\.log$/, '')}:7`;
  }
  return null;
}
