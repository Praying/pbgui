import type { InventoryRow } from './inventoryTypes';

/*
 * M-data-6 — inventory row filtering and sorting
 * (legacy market_data_main.html):
 *
 *   getInventoryFilteredRows :7832-7849
 *   getInventorySortValue    :7912-7932
 *   sortInventoryRows        :7934-7965
 */

export interface InventoryFilterState {
  coinFilter: string;
  kindFilter: string;
  timeframeFilter: string;
}

const NUMERIC_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Legacy getInventoryFilteredRows (:7832-7849). */
export function filterInventoryRows(
  rows: readonly InventoryRow[],
  filters: InventoryFilterState
): InventoryRow[] {
  const coinFilter = String(filters.coinFilter ?? '').trim().toUpperCase();
  const kindFilter = String(filters.kindFilter ?? 'all').trim().toLowerCase();
  const timeframeFilter = String(filters.timeframeFilter ?? 'all').trim().toLowerCase();
  return rows.filter((row) => {
    const coin = String(row.coin ?? '').toUpperCase();
    const timeframe = String(row.timeframe ?? '').trim().toLowerCase();
    const isStock = Boolean(row.is_xyz) || coin.indexOf('XYZ:') === 0 || coin.indexOf('XYZ-') === 0;
    const mappingStatus = String(row.mapping_status ?? '').trim().toLowerCase();
    if (coinFilter && coin.indexOf(coinFilter) === -1) return false; // :7841
    if ((kindFilter === 'stocks (xyz)' || kindFilter === 'xyz only') && !isStock) return false; // :7842
    if (kindFilter === 'xyz mapped' && (!isStock || mappingStatus !== 'mapped')) return false; // :7843
    if ((kindFilter === 'xyz missing' || kindFilter === 'xyz not mapped') && (!isStock || mappingStatus === 'mapped')) {
      return false; // :7844
    }
    if (kindFilter === 'crypto' && isStock) return false; // :7845
    if (timeframeFilter !== 'all' && timeframe !== timeframeFilter) return false; // :7846
    return true;
  });
}

/** Legacy getInventorySortValue (:7912-7932). */
export function getInventorySortValue(row: InventoryRow, sortKey: string): string | number {
  if (sortKey === 'size') return Number(row.total_bytes || row.size || 0); // :7913
  if (
    sortKey === 'n_files' ||
    sortKey === 'n_days' ||
    sortKey === 'expected_hours' ||
    sortKey === 'coverage_pct' ||
    sortKey === 'missing_days_count' ||
    sortKey === 'hl_minutes' ||
    sortKey === 'other_minutes' ||
    sortKey === 'missing_minutes'
  ) {
    return Number(row[sortKey] || 0); // :7924
  }
  if (sortKey === 'oldest_day' || sortKey === 'newest_day') {
    return String(row[sortKey] ?? ''); // :7927
  }
  const value = row[sortKey]; // :7929
  if (value == null) return '';
  return typeof value === 'number' ? value : String(value).toUpperCase(); // :7931
}

/** Legacy sortInventoryRows (:7934-7965) — immutable copy sort. */
export function sortInventoryRows(
  rows: readonly InventoryRow[],
  sortKey: string,
  sortDirection: string
): InventoryRow[] {
  const direction = sortDirection === 'desc' ? -1 : 1; // :7935
  return rows.slice().sort((left, right) => {
    const leftValue = getInventorySortValue(left, sortKey);
    const rightValue = getInventorySortValue(right, sortKey);
    let result = 0;

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      result = leftValue - rightValue; // :7942
      if (!Number.isFinite(result)) result = 0; // :7943
    } else {
      result = NUMERIC_COLLATOR.compare(String(leftValue), String(rightValue)); // :7945-7948
    }

    if (result === 0) {
      result = NUMERIC_COLLATOR.compare(String(left.coin ?? ''), String(right.coin ?? '')); // :7952-7955
    }
    if (result === 0) {
      result = NUMERIC_COLLATOR.compare(String(left.row_id ?? ''), String(right.row_id ?? '')); // :7958-7961
    }
    return result * direction; // :7963
  });
}
