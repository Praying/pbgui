/**
 * Log-line parsing shared by the PBGui log viewers.
 *
 * Extracted from the Vue port of the API-keys LogPanel (which itself mirrored
 * the legacy LogViewerPanel's level precedence). The level ladder is the
 * PBGui contract: DEBUG < INFO < WARNING < ERROR < CRITICAL, and a line with
 * no explicit marker defaults to INFO.
 */

export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Three-letter toolbar shorthand for each level. */
export const LEVEL_SHORT: Record<LogLevel, string> = {
  DEBUG: 'DBG',
  INFO: 'INF',
  WARNING: 'WRN',
  ERROR: 'ERR',
  CRITICAL: 'CRT',
};

/** One search-highlighted slice of a rendered line. */
export interface LinePart {
  text: string;
  hit: boolean;
}

/** ANSI SGR/CSI escapes emitted by the Python `logging` console handlers. */
const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripAnsi(line: string): string {
  return line.replace(ANSI_PATTERN, '');
}

/**
 * Extract the log level with the PBGui precedence (explicit failure markers
 * beat bracket level, which beats a bare level word). Kept byte-compatible
 * with the legacy LogViewerPanel so filtering behaves the same on both pages.
 */
export function extractLevel(clean: string): LogLevel {
  if (/\b(fatal|failed)\s*:/i.test(clean) || /\b(unreachable|failed)=\s*[1-9]\d*\b/i.test(clean)) {
    return 'ERROR';
  }
  if (/\[WARNING\]:/i.test(clean) || /\bWARNING\b/i.test(clean)) {
    return 'WARNING';
  }
  if (/\bchanged\s*:/i.test(clean) || /\bchanged=\s*[1-9]\d*\b/i.test(clean)) {
    return 'WARNING';
  }
  const bracket = clean.match(/\[(DEBUG|INFO|WARNING|ERROR|CRITICAL)\]/i);
  if (bracket) return bracket[1]!.toUpperCase() as LogLevel;
  const word = clean.match(/\b(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL)\b/i);
  if (word) {
    const level = word[1]!.toUpperCase();
    return (level === 'WARN' ? 'WARNING' : level) as LogLevel;
  }
  return 'INFO';
}

/** Normalize a WS batch into displayable single lines. */
export function normalizeIncoming(raw: unknown[]): string[] {
  return raw.map((line) => String(line ?? '').replace(/\r\n?/g, '\n'));
}

/** Build a case-insensitive matcher for a preset/plain/regex search term. */
export function buildSearchRegex(term: string, isRegex: boolean): RegExp | null {
  if (!term) return null;
  try {
    return new RegExp(isRegex ? term : escapeRegExp(term), 'i');
  } catch {
    return null;
  }
}

/** Build the capturing variant used to split a line into hit/non-hit parts. */
export function buildSplitRegex(term: string, isRegex: boolean): RegExp | null {
  if (!term) return null;
  try {
    return new RegExp(`(${isRegex ? term : escapeRegExp(term)})`, 'gi');
  } catch {
    return null;
  }
}

export function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split a line into highlighted and plain parts for `<mark>` rendering. */
export function splitLineParts(clean: string, term: string, isRegex: boolean, matcher: RegExp | null): LinePart[] {
  const splitRegex = buildSplitRegex(term, isRegex);
  if (!splitRegex || !matcher) return [{ text: clean, hit: false }];
  return clean
    .split(splitRegex)
    .filter(Boolean)
    .map((text) => ({ text, hit: matcher.test(text) }));
}
