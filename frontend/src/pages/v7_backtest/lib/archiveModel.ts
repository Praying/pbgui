import type {
  ArchiveMigrationStatus,
  ArchiveOptimizeConfigItem,
  ArchiveRetestFields,
  ArchiveRetestPayload,
  ArchiveRetestScheduleItem,
  ArchiveSummary,
  BacktestResultItem,
} from '../types';
import type { I18nT } from '../types.i18n';

/**
 * Pure archive/legacy helpers — the port of the archive panel's
 * non-DOM logic: updateArchiveStatusLine (:8959-8967),
 * updateResultsCountLabel (:5493-5503), renderArchiveResults' dropdown
 * + filter code (:9072-9108), the schedules renderer's labels
 * (:9153-9187), renderArchiveOptimizeConfigs' filter (:9232-9238),
 * renderLegacyResults (:9427-9460), archiveRetestDefaultDays
 * (:8044-8052), collectArchiveRetestPayload (:8060-8081),
 * archiveResultByPath (:1168-1173), _legacySuggestedName (:8163-8167)
 * and the archive market-data default (:7960-7968).
 */

/** updateArchiveStatusLine (:8959-8967) — label + ' · ' counters. */
export function archiveStatusLine(label: string, optimizeCount: number, scheduleCount: number, t: I18nT): string {
  const opt = optimizeCount > 0 ? t('v7backtest.optimizeSettingsCount', { n: optimizeCount }) : '';
  const sched = scheduleCount > 0 ? t('v7backtest.retestSchedulesCount', { n: scheduleCount }) : '';
  return label ? label + opt + sched : (opt + sched).replace(/^ · /, '');
}

/** updateResultsCountLabel (:5493-5503) — keeps the legacy double-count quirk. */
export function resultsCountLabel(shown: number, total: number, t: I18nT): string {
  const safeShown = Math.max(0, Number(shown) || 0);
  const safeTotal = Math.max(0, Number(total) || 0);
  return safeShown === safeTotal
    ? `${safeShown} ${t('v7backtest.resultsCount', { n: safeShown })}`
    : `${t('v7backtest.showingResultsOf', { shown: safeShown, total: safeTotal })} ${t('v7backtest.resultsCount', { n: safeTotal })}`;
}

function haystackIncludes(hay: string, text: string): boolean {
  if (!text) return true;
  return hay.toLowerCase().includes(text.toLowerCase());
}

/** renderArchiveResults' filter (:9097-9108). */
export function filterArchiveResults(
  rows: readonly BacktestResultItem[],
  configFilter: string,
  coinFilter: string,
  text: string
): BacktestResultItem[] {
  return rows.filter((row) => {
    if (configFilter && row.config_name !== configFilter) return false;
    if (coinFilter && (!Array.isArray(row.coins) || !row.coins.includes(coinFilter))) return false;
    if (!text) return true;
    const hay = [
      row.backtest_version ?? '',
      row.config_version ?? row.pb7_config_version ?? '',
      row.config_name ?? '',
      row.strategy ?? '',
      row.result_name ?? '',
      row.display_name ?? '',
      row.coins_text ?? '',
    ].join(' ');
    return haystackIncludes(hay, text);
  });
}

/** The config dropdown options (:9073-9081). */
export function archiveConfigOptions(rows: readonly BacktestResultItem[]): string[] {
  return [...new Set(rows.map((row) => row.config_name).filter((name): name is string => Boolean(name)))].sort();
}

/** The coin dropdown options (:9083-9095) — array coins only. */
export function archiveCoinOptions(rows: readonly BacktestResultItem[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row.coins)) continue;
    for (const coin of row.coins) if (coin) names.add(coin);
  }
  return [...names].sort();
}

/** renderArchiveRetestSchedules' filter (:9153-9158). */
export function filterSchedules(rows: readonly ArchiveRetestScheduleItem[], text: string): ArchiveRetestScheduleItem[] {
  return rows.filter((item) => {
    if (!text) return true;
    const hay = [item.id ?? '', item.cadence ?? '', item.last_status ?? '', item.last_message ?? ''].join(' ');
    return haystackIncludes(hay, text);
  });
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** The cadence cell (:9170). */
export function scheduleCadenceLabel(item: ArchiveRetestScheduleItem, t: I18nT): string {
  const time = item.time ?? '';
  if (item.cadence === 'weekly') {
    return t('v7backtest.weeklyCadence', { weekday: WEEKDAY_LABELS[item.weekday ?? 0] ?? 'Mon', time });
  }
  return t('v7backtest.dailyCadence', { time });
}

/** The date-mode cell (:9172). */
export function scheduleModeLabel(item: ArchiveRetestScheduleItem, t: I18nT): string {
  const options = item.options ?? {};
  if (options.date_mode === 'last_x_days') return t('v7backtest.lastXDays', { n: options.last_days ?? '' });
  return t('v7backtest.sameLengthYesterday');
}

/** The enabled/disabled cell (:9173). */
export function scheduleStatusLabel(item: ArchiveRetestScheduleItem, t: I18nT): string {
  return item.enabled === false ? t('common.disabled') : t('common.enabled');
}

/** renderArchiveOptimizeConfigs' filter (:9232-9238). */
export function filterOptimizeConfigs(rows: readonly ArchiveOptimizeConfigItem[], text: string): ArchiveOptimizeConfigItem[] {
  return rows.filter((item) => {
    if (!text) return true;
    const hay = [
      item.name ?? '',
      item.optimize_version ?? '',
      item.config_version ?? item.pb7_config_version ?? '',
      item.relative_path ?? '',
    ].join(' ');
    return haystackIncludes(hay, text);
  });
}

/** renderLegacyResults' filter (:9437-9444). */
export function filterLegacyResults(rows: readonly BacktestResultItem[], configFilter: string, text: string): BacktestResultItem[] {
  return rows.filter((row) => {
    if (configFilter && row.config_name !== configFilter) return false;
    if (!text) return true;
    const hay = [row.display_name ?? '', row.config_name ?? '', row.result_name ?? ''].join(' ');
    return haystackIncludes(hay, text);
  });
}

/** The legacy config dropdown (:9427-9435). */
export function legacyConfigOptions(rows: readonly BacktestResultItem[]): string[] {
  return [...new Set(rows.map((row) => row.config_name).filter((name): name is string => Boolean(name)))].sort();
}

/** archiveRetestDefaultDays (:8044-8052). */
export function archiveRetestDefaultDays(cfg: Record<string, unknown>): number {
  const backtest = (cfg && typeof cfg === 'object' ? (cfg.backtest as Record<string, unknown> | undefined) : undefined) ?? {};
  const startRaw = backtest.start_date ? String(backtest.start_date).slice(0, 10) : '';
  const endRaw = backtest.end_date ? String(backtest.end_date).slice(0, 10) : '';
  if (!startRaw || !endRaw) return 365;
  const start = new Date(startRaw + 'T00:00:00Z');
  const end = new Date(endRaw + 'T00:00:00Z');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 365;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

/** normalizeArchiveMarketDataPath (:7960-7962). */
export function normalizeArchiveMarketDataPath(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/[\\/]+$/, '');
}

/** archiveConfigUsesPbguiMarketData (:7964-7968). */
export function archiveConfigUsesPbguiMarketData(cfg: Record<string, unknown> | undefined, pbguiPath: string): boolean {
  const sourceDir = normalizeArchiveMarketDataPath(String(((cfg as { backtest?: { ohlcv_source_dir?: string } } | undefined)?.backtest ?? {}).ohlcv_source_dir ?? ''));
  const marketDataDir = normalizeArchiveMarketDataPath(pbguiPath);
  return Boolean(sourceDir) && Boolean(marketDataDir) && sourceDir === marketDataDir;
}

/** collectArchiveRetestPayload (:8060-8081) — null when no exchange is selected. */
export function buildRetestPayload(fields: ArchiveRetestFields, paths: readonly string[]): ArchiveRetestPayload | null {
  if (fields.exchanges.length === 0) return null;
  const lastDays = Number.parseInt(String(fields.lastDays), 10) || 365;
  return {
    paths: paths.slice(),
    date_mode: fields.dateMode === 'last_x_days' ? 'last_x_days' : 'until_yesterday',
    last_days: Math.max(1, Math.min(3650, lastDays)),
    starting_balance: Number.parseFloat(String(fields.balance)) || 1000,
    exchanges: fields.exchanges.slice(),
    use_pbgui_market_data: fields.usePbguiMarketData === true,
    skip_liquidated: fields.skipLiquidated === true,
  };
}

/** archiveResultByPath (:1168-1173) — v7 fallback keeps fetches routable. */
export function archiveResultByPath(rows: readonly BacktestResultItem[], path: string): BacktestResultItem {
  return rows.find((row) => row.path === path) ?? { path, config_name: '', result_name: '', backtest_version: 'v7' };
}

/** _legacySuggestedName (:8163-8167). */
export function legacySuggestedName(rows: readonly BacktestResultItem[], path: string): string {
  const matched = rows.find((row) => row.path === path);
  if (!matched) return 'legacy_rebacktest';
  return matched.suggested_name || matched.config_name || matched.result_name || 'legacy_rebacktest';
}

/**
 * The empty-archives key ships legacy html (`<br>`, `<b>`) — flatten it
 * to plain text for the v-html-free render (:8868).
 */
export function plainLegacyHtml(value: string): string {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?b>/gi, '');
}

/** The archive list's own-archive resolution (:8828-8829, :8954-8957). */
export function findArchiveByName(archives: readonly ArchiveSummary[], name: string): ArchiveSummary | null {
  return archives.find((archive) => archive.name === name) ?? null;
}

export function isOwnArchive(archives: readonly ArchiveSummary[], ownName: string, selectedName: string): boolean {
  const archive = findArchiveByName(archives, selectedName);
  return Boolean(archive?.is_own) || (Boolean(ownName) && selectedName === ownName);
}

/** The migration-status label fallback (:8962-8963). */
export function archiveStatusLabel(loaded: ArchiveMigrationStatus | null, archives: readonly ArchiveSummary[], selectedName: string): string {
  const status = loaded ?? findArchiveByName(archives, selectedName)?.migration_status ?? null;
  return status?.label ?? '';
}
