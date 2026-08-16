/**
 * Pure helpers ported from db_tools.html: formatBytes :393-399,
 * backupCreatedLabel :429-433, backupCreatedSort :434-438,
 * shortSyncTime :677-681, cutoffMs :872-879.
 */

export function formatBytes(bytes: unknown): string {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024 * 1024) return (value / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (value >= 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + ' MB';
  if (value >= 1024) return (value / 1024).toFixed(1) + ' KB';
  return String(Math.round(value)) + ' B';
}

const BACKUP_NAME_RE = /^db-tools-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/;

/** 'db-tools-20240102-030405-x' → '2024-01-02 03:04:05 UTC' (:429-433). */
export function backupCreatedLabel(name: unknown, fallback: unknown, unknownLabel: string): string {
  const match = String(name || '').match(BACKUP_NAME_RE);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]} UTC`;
  }
  return fallback
    ? String(fallback).replace('T', ' ').replace(/\.\d+\+00:00$/, ' UTC')
    : unknownLabel;
}

/** Sort key derived from the same name pattern (:434-438). */
export function backupCreatedSort(name: unknown, fallback: unknown): string {
  const match = String(name || '').match(BACKUP_NAME_RE);
  if (match) return match.slice(1).join('');
  return fallback ? String(fallback) : '';
}

/** shortSyncTime (:677-681) — ISO-ish → 22 chars max. */
export function shortSyncTime(value: unknown): string {
  if (!value) return '-';
  const text = String(value)
    .replace('T', ' ')
    .replace(/\.\d+\+00:00$/, ' UTC')
    .replace(/\+00:00$/, ' UTC');
  return text.length > 22 ? text.slice(0, 22) : text;
}

/** cutoffMs (:872-879) — yyyy-mm-dd → end-of-day epoch ms, null when invalid. */
export function cutoffMs(value: unknown): number | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(raw + 'T00:00:00Z');
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) return null;
  return new Date(raw + 'T23:59:59.999Z').getTime();
}
