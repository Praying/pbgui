/**
 * Coin-overrides pure model — ports of the stateless halves of
 * frontend/js/coin_overrides_editor.js. Built once here (M-v7-2) and reused
 * by the backtest editor (M-v7-9) per the recon dependency matrix (§2 R11).
 * The legacy module is the spec; legacy line refs below are provenance.
 */

export type OverrideValue = unknown;
/** { COIN: { bot: { long, short }, live, override_config_path } } */
export type OverrideMap = Record<string, Record<string, OverrideValue>>;
/** Runtime metadata: { bot: { long: {...}, short: {...} }, live: {...} }. */
export type AllowedParams = Record<string, Record<string, unknown>>;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

/* ─── Coin name normalization (:599-621) ───────────────────────────────── */

export function normalizeCoin(symbol: unknown, preserveMarketIdentifiers: boolean): string {
  const raw = String(symbol ?? '');
  if (!raw) return raw;
  if (preserveMarketIdentifiers) return raw.trim();
  let s = raw.toUpperCase();
  const quotes = ['USDT', 'USDC', 'BUSD', 'USD'];
  for (const quote of quotes) {
    if (s.length > quote.length && s.endsWith(quote)) {
      s = s.slice(0, -quote.length);
      break;
    }
  }
  const prefix = s.match(/^(10+)([A-Z].*)/);
  if (prefix) s = prefix[2]!;
  if (s.length > 1 && s[0] === 'K' && s[1] !== 'K') {
    const tail = s.slice(1);
    if (/^[A-Z]+$/.test(tail)) s = tail;
  }
  return s;
}

/* ─── Nested + flatten helpers (:1634-1733) ────────────────────────────── */

export function getNested(obj: unknown, path: readonly string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function ensureNested(obj: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
  let current: Record<string, unknown> = obj;
  for (const key of path) {
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  return current;
}

export function flattenLeaves(
  value: unknown,
  prefix = '',
  result: Record<string, OverrideValue> = {}
): Record<string, OverrideValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? prefix + '.' + key : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flattenLeaves(entry, path, result);
    } else {
      result[path] = entry;
    }
  }
  return result;
}

export function flattenForAllowed(
  value: unknown,
  allowed: Record<string, unknown> | null,
  prefix = '',
  result: Record<string, OverrideValue> = {}
): Record<string, OverrideValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? prefix + '.' + key : key;
    if (allowed && Object.prototype.hasOwnProperty.call(allowed, path)) {
      result[path] = entry;
    } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flattenForAllowed(entry, allowed, path, result);
    } else {
      result[path] = entry;
    }
  }
  return result;
}

export function setDotted(obj: Record<string, unknown>, path: string, value: OverrideValue): void {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return;
  const target = ensureNested(obj, parts.slice(0, -1));
  target[parts[parts.length - 1]!] = value;
}

export function deleteDotted(obj: Record<string, unknown>, path: string): void {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return;
  const target = getNested(obj, parts.slice(0, -1));
  if (target && typeof target === 'object') delete (target as Record<string, unknown>)[parts[parts.length - 1]!];
}

/** _covCleanEmpty (:1715-1733). */
export function cleanEmpty(data: Record<string, unknown>): void {
  const clean = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      clean((value as Record<string, unknown>)[key]);
      const entry = (value as Record<string, unknown>)[key];
      if (entry && typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).length === 0) {
        delete (value as Record<string, unknown>)[key];
      }
    }
  };
  clean(data);
  const bot = object(data.bot);
  if (data.bot) {
    if (bot.long && Object.keys(bot.long).length === 0) delete bot.long;
    if (bot.short && Object.keys(bot.short).length === 0) delete bot.short;
    if (Object.keys(bot).length === 0) delete data.bot;
  }
  if (data.live && Object.keys(data.live).length === 0) delete data.live;
}

/* ─── Summary helpers (:1039-1102) ─────────────────────────────────────── */

const EMPTY_SUMMARY = '(empty)';

/** _covBadge — compact per-section counts + file marker. */
export function badgeSummary(data: Record<string, unknown>): string {
  const bot = object(data.bot);
  const parts: string[] = [];
  const longKeys = Object.keys(flattenLeaves(bot.long));
  const shortKeys = Object.keys(flattenLeaves(bot.short));
  if (longKeys.length) parts.push('long ' + longKeys.length);
  if (shortKeys.length) parts.push('short ' + shortKeys.length);
  const liveKeys = Object.keys(flattenLeaves(data.live));
  if (liveKeys.length) parts.push('live ' + liveKeys.length);
  if (data.override_config_path) parts.push('file');
  return parts.join(' · ') || EMPTY_SUMMARY;
}

/** _covDescribe — flattened parameter names per section. */
export function describeOverrides(data: Record<string, unknown>): string {
  const bot = object(data.bot);
  const parts: string[] = [];
  const longKeys = Object.keys(flattenLeaves(bot.long));
  if (longKeys.length) parts.push('long: ' + longKeys.join(', '));
  const shortKeys = Object.keys(flattenLeaves(bot.short));
  if (shortKeys.length) parts.push('short: ' + shortKeys.join(', '));
  const liveKeys = Object.keys(flattenLeaves(data.live));
  if (liveKeys.length) parts.push('live: ' + liveKeys.join(', '));
  if (data.override_config_path) parts.push('file: ' + String(data.override_config_path));
  return parts.join(' | ') || EMPTY_SUMMARY;
}

/* ─── Default file name (:1108-1118) ───────────────────────────────────── */

export function defaultOverrideFilename(coin: string, preserveMarketIdentifiers: boolean): string {
  if (!preserveMarketIdentifiers) return coin + '.json';
  const value = String(coin || 'market');
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'market';
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return safe + '-' + (hash >>> 0).toString(16).padStart(8, '0') + '.json';
}

/* ─── Parameter metadata + parsing (:1295-1340) ────────────────────────── */

export function paramIsAllowed(metadata: unknown): boolean {
  return metadata === true || !!(metadata && typeof metadata === 'object');
}

export function paramType(
  metadata: unknown,
  value: unknown
): 'boolean' | 'number' | 'json' | 'string' | 'null' | 'array' {
  if (metadata && typeof metadata === 'object' && (metadata as { type?: unknown }).type) {
    return String((metadata as { type: unknown }).type) as 'boolean' | 'number' | 'json' | 'string' | 'null' | 'array';
  }
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value && typeof value === 'object') return 'json';
  return 'string';
}

/** _covParseParamValue — throws on invalid input (legacy Error messages). */
export function parseParamValue(rawValue: unknown, metadata: unknown, key: string): OverrideValue {
  const meta = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : null;
  const type = paramType(meta, meta?.default);
  const raw = String(rawValue ?? '').trim();
  if (key === 'forced_mode_long' || key === 'forced_mode_short') return raw || 'normal';
  if (!raw && meta && Object.prototype.hasOwnProperty.call(meta, 'default')) return meta.default;
  if (!raw && key === 'leverage') return 7;
  if (type === 'boolean') {
    const boolRaw = raw.toLowerCase();
    if (boolRaw === 'true') return true;
    if (boolRaw === 'false') return false;
    throw new Error('must be true or false');
  }
  if (type === 'number') {
    if (!raw) throw new Error('must be a number');
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new Error('must be a number');
    return number;
  }
  if (type === 'null' && (!raw || raw === 'null')) return null;
  if (type === 'array' || type === 'json') {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('must be valid JSON');
    }
  }
  if (metadata === true && raw !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

/* ─── Load normalization (coinOvLoad :541-577) ─────────────────────────── */

export function normalizeOverridesForLoad(
  coinOverrides: unknown,
  preserveMarketIdentifiers: boolean
): OverrideMap {
  const overrides: OverrideMap = {};
  for (const [coin, rawValue] of Object.entries(object(coinOverrides))) {
    const norm = normalizeCoin(coin, preserveMarketIdentifiers);
    const existing = overrides[norm];
    if (existing) {
      if (preserveMarketIdentifiers) {
        throw new Error('Duplicate PB8 market identifier after trimming: ' + norm);
      }
      const incoming = object(rawValue);
      const incomingBot = object(incoming.bot);
      const existingBot = (existing.bot = object(existing.bot));
      for (const side of ['long', 'short'] as const) {
        if (object(incomingBot[side]) && !existingBot[side]) existingBot[side] = clone(incomingBot[side]);
      }
      if (incoming.live && !existing.live) existing.live = clone(incoming.live);
    } else {
      overrides[norm] = clone(object(rawValue));
    }
  }
  return overrides;
}

/* ─── Inline-support checks (:1643-1654) ───────────────────────────────── */

const INLINE_PATHS: readonly (readonly string[])[] = [['bot', 'long'], ['bot', 'short'], ['live']];

export function unsupportedInlineParams(data: Record<string, unknown>, allowed: AllowedParams | null): string[] {
  const unsupported: string[] = [];
  for (const path of INLINE_PATHS) {
    const prefix = path.join('.');
    const values = flattenLeaves(getNested(data, path) ?? {});
    const accepted = (getNested(allowed, path) ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(values)) {
      if (!Object.prototype.hasOwnProperty.call(accepted, key)) unsupported.push(prefix + '.' + key);
    }
  }
  return unsupported.sort();
}

/* ─── Override file filtering (:688-716) ───────────────────────────────── */

/** Filter an override config file to allowed bot.long/bot.short params. */
export function filterOverrideConfig(
  cfg: unknown,
  allowed: AllowedParams | null
): Record<string, unknown> {
  if (!cfg || !allowed || !(allowed as { bot?: unknown }).bot) return cfg as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const botAllowed = object(allowed.bot);
  for (const side of ['long', 'short'] as const) {
    let src = object(object(object(cfg).bot)[side]);
    if (!src || Object.keys(src).length === 0) continue;
    const wrapped = object(src.bot)[side];
    if (wrapped && Object.keys(wrapped).length > 0) src = object(wrapped); // unwrap full configs
    const keys = object(botAllowed[side]);
    const flatSource = flattenForAllowed(src, keys);
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(flatSource)) {
      if (Object.prototype.hasOwnProperty.call(keys, key)) setDotted(filtered, key, value);
    }
    if (Object.keys(filtered).length > 0) {
      if (!result.bot) result.bot = {};
      (result.bot as Record<string, unknown>)[side] = filtered;
    }
  }
  return result;
}
