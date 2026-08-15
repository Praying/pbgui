/**
 * Income-table pure helpers — the logic half of the legacy `_buildIncomeTable`
 * closure (dashboard_render.js:1030-1470) lifted as pure functions so the
 * IncomeTable component only owns DOM wiring:
 *
 *  - the doSort comparator (render.js:1235-1243): strings localeCompare,
 *    numbers subtract, direction by flag;
 *  - the drag-select geometry (render.js:1189-1209): rowIndexAtY over row
 *    bounding-rect tops + the anchor/current low-high bounds;
 *  - the jump-to-date resolution (render.js:1071-1115): exact date match,
 *    debounced onJumpToDate branch, closest-date fallback;
 *  - the delete-older scan (render.js:1290-1301): min date_ms of the selected
 *    rows, their distinct users, the cutoff text and the ALL users collapse;
 *  - the table scroll memory (render.js:894-898, 1022-1026): buildIncome saved
 *    `.di-table-wrap`.scrollTop before the rebuild and restored it after — a
 *    module-level map keyed by `row_col` reproduces that across the
 *    D-editor-2 epoch remounts (the savedZoom pattern).
 */
import type { IncomeRow } from '../types/widgets';

/* ── constants (legacy literals) ── */

/** Drag-select activation threshold in px (render.js:1221 `> 5`). */
export const DRAG_THRESHOLD_PX = 5;
/** Jump-to-date reload debounce (render.js:1103). */
export const JUMP_DEBOUNCE_MS = 600;
/** Status-line auto-hide (render.js:1381). */
export const STATUS_HIDE_MS = 4000;
/** onReload delay after a destructive action (render.js:1396, 1446). */
export const RELOAD_DELAY_MS = 500;

/* ── table columns (render.js:1055-1060) ── */

export type IncomeSortKey = 'date' | 'user' | 'symbol' | 'income';

export interface IncomeColumn {
  key: IncomeSortKey;
  labelKey: string;
  fallback: string;
}

export const INCOME_COLUMNS: readonly IncomeColumn[] = [
  { key: 'date', labelKey: 'dash.date', fallback: 'Date' },
  { key: 'user', labelKey: 'dash.user', fallback: 'User' },
  { key: 'symbol', labelKey: 'dash.symbol', fallback: 'Symbol' },
  { key: 'income', labelKey: 'dash.income', fallback: 'Income' },
];

/* ── sorting (render.js:1235-1243) ── */

/** The doSort comparator: string columns localeCompare, income subtracts. */
export function compareIncomeRows(
  a: IncomeRow,
  b: IncomeRow,
  col: IncomeSortKey,
  asc: boolean
): number {
  const va: string | number = a[col];
  const vb: string | number = b[col];
  if (typeof va === 'string') {
    return asc ? va.localeCompare(String(vb)) : String(vb).localeCompare(va);
  }
  return asc ? va - Number(vb) : Number(vb) - va;
}

/** doSort on a copy — the working `sortedRows` never mutates the payload. */
export function sortIncomeRows(rows: IncomeRow[], col: IncomeSortKey, asc: boolean): IncomeRow[] {
  return [...rows].sort((a, b) => compareIncomeRows(a, b, col, asc));
}

/* ── drag-select geometry (render.js:1189-1209) ── */

/** rowIndexAtY: the last row whose rect top is at or above y. */
export function rowIndexAtTops(tops: number[], y: number): number {
  let idx = 0;
  for (let i = 0; i < tops.length; i++) {
    if (y >= (tops[i] as number)) idx = i;
  }
  return idx;
}

/** The setIncomeSelectionRange low/high bounds. */
export function selectionBounds(anchor: number, current: number): { low: number; high: number } {
  return { low: Math.min(anchor, current), high: Math.max(anchor, current) };
}

/* ── jump-to-date resolution (render.js:1089-1113) ── */

/** Exact match on date.slice(0, 10) — first hit wins, -1 when none. */
export function findExactDateIndex(rows: IncomeRow[], target: string): number {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r && r.date.slice(0, 10) === target) return i;
  }
  return -1;
}

/** Closest row by |date - target| in ms (0 for an empty list, legacy bestIdx). */
export function findClosestDateIndex(rows: IncomeRow[], target: string): number {
  const targetMs = new Date(target).getTime();
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    if (!r) continue;
    const diff = Math.abs(new Date(r.date.slice(0, 10)).getTime() - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = j;
    }
  }
  return bestIdx;
}

/* ── delete-older payload (render.js:1289-1310) ── */

/** A backup entry of GET /dashboard/income/backups (dashboard.py:2470). */
export interface IncomeBackup {
  name: string;
  path: string;
  date: string;
}

/** apiPost result: success carries the deleted count (legacy `d.deleted || 0`). */
export type IncomeActionResult =
  | { ok: true; deleted: number }
  | { ok: false; message: string };

/** loadBackups result: failures carry no message (fixed error label). */
export type IncomeBackupsResult =
  | { ok: true; backups: IncomeBackup[] }
  | { ok: false };

/** restore result: the server's ok flag decides the follow-up status text. */
export type IncomeRestoreResult =
  | { ok: true; restored: boolean }
  | { ok: false; message: string };

export interface DeleteOlderSelection {
  /** Min date_ms across the selected rows (the cutoff). */
  cutoffMs: number;
  /** Distinct users of the selected rows, in first-seen order. */
  selectedUsers: string[];
}

/** The min/cutoff + distinct-users scan over the selected rows. */
export function scanDeleteOlderSelection(
  rows: IncomeRow[],
  selected: Record<string, boolean>
): DeleteOlderSelection | null {
  let minMs = Infinity;
  const users: Record<string, boolean> = {};
  let any = false;
  for (const r of rows) {
    if (!selected[String(r.id)]) continue;
    any = true;
    if (r.date_ms < minMs) minMs = r.date_ms;
    users[r.user] = true;
  }
  if (!any) return null;
  return { cutoffMs: minMs, selectedUsers: Object.keys(users) };
}

/** cutoffDate: ISO with 'T' → ' ', second precision (render.js:1299). */
export function cutoffDateText(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

/** usersParam: ['ALL'] when the widget users contain ALL, else the row users. */
export function deleteOlderUsersParam(
  widgetUsers: string[] | null | undefined,
  selectedUsers: string[]
): string[] {
  return widgetUsers && widgetUsers.indexOf('ALL') >= 0 ? ['ALL'] : selectedUsers;
}

/* ── scroll memory (render.js:894-898, 1022-1026) ── */

const scrollByPos = new Map<string, number>();

/** Save the wrap scrollTop for a cell position (before the rebuild). */
export function saveIncomeScroll(pos: string, top: number): void {
  scrollByPos.set(pos, top);
}

/** The saved scrollTop for a cell (0 when never saved — the legacy guard). */
export function takeIncomeScroll(pos: string): number {
  return scrollByPos.get(pos) ?? 0;
}

/** Tests only: detach the map. */
export function resetIncomeScroll(): void {
  scrollByPos.clear();
}
