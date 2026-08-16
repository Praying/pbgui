/**
 * Pure value formatting ported verbatim from coin_data.html (:1683-1710):
 * formatCompact :1683-1692, formatPrice :1694-1701, formatRatio :1703-1707,
 * rowKey :1709-1710.
 */

export function formatCompact(value: unknown): string {
  const num = Number(value);
  if (!isFinite(num)) return '-';
  const abs = Math.abs(num);
  if (abs >= 1e12) return (num / 1e12).toFixed(abs >= 1e13 ? 0 : 2) + 'T';
  if (abs >= 1e9) return (num / 1e9).toFixed(abs >= 1e10 ? 0 : 2) + 'B';
  if (abs >= 1e6) return (num / 1e6).toFixed(abs >= 1e7 ? 0 : 2) + 'M';
  if (abs >= 1e3) return (num / 1e3).toFixed(abs >= 1e4 ? 0 : 2) + 'K';
  return num.toFixed(num >= 100 ? 0 : 2);
}

export function formatPrice(value: unknown): string {
  const num = Number(value);
  if (!isFinite(num)) return '-';
  if (num === 0) return '$0';
  if (Math.abs(num) >= 1000) return '$' + formatCompact(num);
  if (Math.abs(num) >= 1) return '$' + num.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return '$' + num.toPrecision(4);
}

export function formatRatio(value: unknown): string {
  const num = Number(value);
  if (!isFinite(num)) return '-';
  return num.toFixed(4) + 'x';
}

/** rowKey (:1709-1710) — table-scoped identity for row selection. */
export function rowKey(row: { ccxt_symbol?: string; symbol?: string; coin?: string }, tableName: string): string {
  return tableName + '::' + String(row.ccxt_symbol || row.symbol || row.coin || '');
}
