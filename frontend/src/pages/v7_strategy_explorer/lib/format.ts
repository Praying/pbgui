/**
 * Pure value helpers — verbatim ports of the formatting/inspection
 * utilities of v7_strategy_explorer.html (line refs in the test file).
 */

/** HTML-escape for interpolating server data into attributes/markup (:581). */
export function esc(value: unknown): string {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>'"]/g, (ch) => {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch] as string;
  });
}

/** Locale number with a maximum fraction digit count (:586). */
export function fmt(value: unknown, digits?: number): string {
  const n = Number(value);
  if (!isFinite(n)) return '-';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits === undefined ? 8 : digits });
}

/** Locale number with exact fraction digits (:591). */
export function fmtFixed(value: unknown, digits: number): string {
  const n = Number(value);
  if (!isFinite(n)) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Byte-size ladder B→KB→MB→GB (:596). */
export function humanSize(bytes: unknown): string {
  let n = Number(bytes || 0);
  if (!isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  return n.toFixed(idx === 0 ? 0 : 1) + ' ' + units[idx];
}

/** Numeric-first timestamp coercion for plot x values (:604). */
export function parsePlotTime(value: unknown): number {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number') return value;
  const n = Number(value);
  if (isFinite(n) && String(value).trim() !== '') return n;
  return Date.parse(String(value));
}

/** Path lookup with fallback (:1004). */
export function deepGet<T>(obj: unknown, path: (string | number)[], fallback: T): T {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return fallback;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return (cur === undefined ? fallback : cur) as T;
}

/** Ensure nested object path exists; returns the leaf object for mutation (:1012). */
export function deepEnsure(obj: Record<string, unknown>, path: (string | number)[]): Record<string, unknown> {
  let cur: Record<string, unknown> = obj;
  for (const key of path) {
    const existing = cur[key];
    if (!existing || typeof existing !== 'object') cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  return cur;
}

/** First `backtest.exchanges` entry (:1021). */
export function firstConfigExchange(cfg: Record<string, unknown>): string {
  const exchanges = deepGet<unknown[]>(cfg || {}, ['backtest', 'exchanges'], []);
  return Array.isArray(exchanges) && exchanges.length ? String(exchanges[0] || '').trim() : '';
}

/** First approved coin, long side first (:1026). */
export function firstConfigCoin(cfg: Record<string, unknown>): string {
  const approved = deepGet<unknown>(cfg || {}, ['live', 'approved_coins'], {});
  const sides = ['long', 'short'];
  for (const side of sides) {
    const coins = Array.isArray(approved) ? approved : deepGet<unknown[]>(approved || {}, [side], []);
    if (Array.isArray(coins) && coins.length) return String(coins[0] || '').trim();
  }
  return '';
}

/** Config date literal → ms; "now" means today's local midnight (:862). */
export function cfgDateValueToMs(value: unknown): number | null {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'now') {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}
