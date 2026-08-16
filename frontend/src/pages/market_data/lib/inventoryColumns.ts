import type { TranslateFn } from '../composables/useSettings';
import type { InventorySubsection } from '../types';
import type { InventoryRow } from './inventoryTypes';

/*
 * M-data-6 — inventory table columns and cell formatting
 * (legacy market_data_main.html):
 *
 *   getInventoryCoinDisplayName(s) :6248-6266
 *   getInventoryTableColumns       :7868-7892
 *   formatInventoryTableValue      :7894-7910
 */

export interface InventoryColumn {
  key: string;
  label: string;
}

/** Legacy getInventoryCoinDisplayName (:6248-6260). */
export function getInventoryCoinDisplayName(coin: unknown): string {
  const value = String(coin ?? '').trim();
  if (!value) return '';
  let shortName = value;
  if (shortName.indexOf('XYZ:') === 0 || shortName.indexOf('XYZ-') === 0) {
    shortName = shortName.slice(4); // :6252-6254
  }
  const underscoreIndex = shortName.indexOf('_');
  if (underscoreIndex !== -1) shortName = shortName.slice(0, underscoreIndex); // :6255-6256
  const colonIndex = shortName.indexOf(':');
  if (colonIndex !== -1) shortName = shortName.slice(0, colonIndex); // :6257-6258
  return shortName || value; // :6259
}

/** Legacy getInventoryCoinDisplayNames (:6262-6266). */
export function getInventoryCoinDisplayNames(coins: readonly unknown[] | null | undefined): string[] {
  return (coins ?? []).map((coin) => getInventoryCoinDisplayName(coin)).filter(Boolean);
}

/**
 * Legacy getInventoryTableColumns (:7868-7892). `exchangeKey` is the
 * normalized context exchange (legacy read uiState.contextExchange).
 */
export function getInventoryTableColumns(
  viewKey: InventorySubsection,
  exchangeKey: string,
  t: TranslateFn
): InventoryColumn[] {
  let columns: InventoryColumn[] = [];
  if (viewKey === 'pb7_cache') {
    columns.push({ key: 'timeframe', label: t('market.timeframe') }); // :7870
  }
  columns = columns.concat([
    { key: 'coin', label: t('market.coin') },
    { key: 'n_files', label: t('market.files') },
    { key: 'size', label: t('market.size') },
    { key: 'oldest_day', label: t('market.oldest') },
    { key: 'newest_day', label: t('market.newest') },
    { key: 'n_days', label: t('market.days') },
    { key: 'expected_hours', label: t('market.expectedHrs') },
    { key: 'coverage_pct', label: t('market.coveragePct') },
    { key: 'missing_days_count', label: t('market.missingDays') },
    { key: 'missing_days_sample', label: t('market.missingSample') },
  ]); // :7871-7882
  if (exchangeKey === 'hyperliquid') {
    columns.splice(viewKey === 'pb7_cache' ? 2 : 1, 0, { key: 'mapping_status', label: t('market.mapping') }); // :7883
  }
  if (viewKey === '1m') {
    columns = columns.concat([
      { key: 'hl_minutes', label: t('market.hlMinutes') },
      { key: 'other_minutes', label: t('market.otherMinutes') },
      { key: 'missing_minutes', label: t('market.missingMinutes') },
    ]); // :7884-7890
  }
  return columns;
}

/**
 * Legacy formatInventoryTableValue (:7894-7910) — one cell's text.
 */
export function formatInventoryTableValue(
  viewKey: InventorySubsection,
  key: string,
  row: InventoryRow,
  exchangeKey: string
): string {
  void viewKey; // legacy took viewKey but only read exchange + row fields
  if (key === 'coin') return getInventoryCoinDisplayName(row.coin); // :7895
  if (key === 'mapping_status') {
    if (exchangeKey !== 'hyperliquid' || !row.is_xyz) return ''; // :7897
    return String(row.mapping_status ?? 'missing').replace(/_/g, ' '); // :7898
  }
  if (key === 'size') return `${Number(row.size ?? 0).toFixed(2)} MB`; // :7900
  if (key === 'coverage_pct') {
    const coverage = Number(row.coverage_pct);
    return Number.isFinite(coverage) ? coverage.toFixed(2) : ''; // :7901-7904
  }
  if (
    (key === 'hl_minutes' || key === 'other_minutes' || key === 'missing_minutes') &&
    exchangeKey !== 'hyperliquid'
  ) {
    return ''; // :7905-7907
  }
  const value = row[key]; // :7908
  return value == null ? '' : String(value); // :7909
}
