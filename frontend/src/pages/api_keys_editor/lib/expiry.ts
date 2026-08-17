import type { BybitExpiryInfo, ExpiryInfoBase, HlExpiryInfo, UserSummary } from '../types';

/* Expiry badge + sort logic ported from api_keys_editor.html:
   renderExpiryBadge :1475-1491, user-table sort keys :1331-1347,
   panel status orders :1752-1753 (bybit) and :2095 (HL). */

export interface ExpiryBadgeLike {
  status: string | null;
  days_remaining?: number | null;
  error?: string | null;
}

/** Badge CSS modifier — 'ok' … 'error', or 'unknown' for null/unexpected. */
export function expiryBadgeClass(exp: ExpiryBadgeLike | null | undefined): string {
  const status = exp?.status;
  if (status === 'ok' || status === 'expiring_soon' || status === 'critical' || status === 'expired' || status === 'no_expiry' || status === 'error') {
    return status;
  }
  return 'unknown';
}

/** Days label for ok/expiring_soon/critical badges ('30d'). */
export function expiryDaysLabel(exp: ExpiryBadgeLike): string {
  return `${exp.days_remaining ?? '?'}d`;
}

/** Badge needs the ⚠ prefix for expiring_soon/critical (:1480-1482). */
export function expiryWarns(status: string | null): boolean {
  return status === 'expiring_soon' || status === 'critical';
}

/** HL panel order: expired first … unknown last (:2095). */
export const hlPanelOrder: Record<string, number> = {
  expired: 0,
  expiring_soon: 1,
  ok: 2,
  no_expiry: 3,
  error: 4,
  unknown: 5,
};

/** Bybit panel order: expired first … unknown last (:1752-1753). */
export const bybitPanelOrder: Record<string, number> = {
  expired: 0,
  critical: 1,
  expiring_soon: 2,
  ok: 3,
  no_expiry: 4,
  error: 5,
  unknown: 6,
};

export function sortByPanelOrder<T extends ExpiryInfoBase>(items: T[], order: Record<string, number>): T[] {
  return [...items].sort((a, b) => (order[a.status ?? 'unknown'] ?? 5) - (order[b.status ?? 'unknown'] ?? 5));
}

/** Sort key for the hl_expiry table column (:1331-1347). */
export function userExpirySortValue(
  user: UserSummary,
  hlData: Record<string, HlExpiryInfo>,
  bybitData: Record<string, BybitExpiryInfo>
): number {
  if (user.exchange === 'hyperliquid') {
    const live = hlData[user.name];
    const days = live ? live.days_remaining : user.hl_days_remaining;
    if (days == null) return 9998;
    return Number(days);
  }
  if (user.exchange === 'bybit') {
    const live = bybitData[user.name];
    const days = live ? live.days_remaining : user.bybit_days_remaining;
    if (days == null) return 9997;
    return Number(days);
  }
  return 99999;
}
