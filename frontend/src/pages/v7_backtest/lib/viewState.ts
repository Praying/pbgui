import {
  BACKTEST_PANELS,
  BACKTEST_SORT_COLUMNS,
  BACKTEST_SORT_DEFAULTS,
} from '../config';
import type { ArchiveMode, BacktestPanel, BacktestSorts, BacktestViewState, SortSpec } from '../types';

/**
 * Pure backtest view-state helpers — the schema-frozen localStorage +
 * URL-hash contract (v7_backtest.html:1339-1431, risk R2). Values are
 * written by the legacy page today and must keep round-tripping: key
 * names, the panel/mode vocabularies and the sort-column whitelists
 * are frozen.
 */

/** archiveModeFromValue (:1339-1341). */
export function archiveModeFromValue(value: unknown): ArchiveMode {
  return value === 'optimize' || value === 'schedules' ? value : 'backtests';
}

/** parseBacktestViewHash (:1343-1358). */
export function parseBacktestViewHash(
  hash: string
): { panel: 'archive'; archive: string; archiveMode: ArchiveMode } | { panel: BacktestPanel } | null {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts[0] === 'archive' && parts[1]) {
    try {
      return { panel: 'archive', archive: decodeURIComponent(parts[1]!), archiveMode: archiveModeFromValue(parts[2]) };
    } catch {
      return null;
    }
  }
  if ((BACKTEST_PANELS as readonly string[]).includes(raw)) {
    return { panel: raw as BacktestPanel };
  }
  return null;
}

/** normalizeBacktestSortState (:1360-1372) — whitelist-guarded defaults. */
export function normalizeBacktestSortState(value: unknown): BacktestSorts {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const normalized = {} as BacktestSorts;
  for (const table of Object.keys(BACKTEST_SORT_DEFAULTS) as (keyof BacktestSorts)[]) {
    const fallback: SortSpec = BACKTEST_SORT_DEFAULTS[table];
    const candidate =
      source[table] && typeof source[table] === 'object' ? (source[table] as Record<string, unknown>) : {};
    const validCol = (BACKTEST_SORT_COLUMNS[table] as readonly string[]).includes(String(candidate.col));
    normalized[table] = {
      col: validCol ? String(candidate.col) : fallback.col,
      asc: validCol && typeof candidate.asc === 'boolean' ? candidate.asc : fallback.asc,
    };
  }
  return normalized;
}

/** A fresh default sort set (a copy — callers may mutate). */
export function defaultSorts(): BacktestSorts {
  return normalizeBacktestSortState(null);
}

/**
 * loadStoredBacktestViewState (:1395-1411): URL hash wins, then a
 * stored panel inside the vocabulary; sorts always normalize through
 * the whitelists; corrupt storage degrades to defaults.
 */
export function loadStoredBacktestViewState(hash: string, storedRaw: string | null): BacktestViewState {
  const fromHash = parseBacktestViewHash(hash);
  let stored: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = storedRaw ? JSON.parse(storedRaw) : null;
    stored = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    stored = null;
  }
  const sorts = normalizeBacktestSortState(stored?.sorts);
  if (fromHash) {
    return { ...fromHash, sorts };
  }
  if (stored && (BACKTEST_PANELS as readonly string[]).includes(String(stored.panel))) {
    const panel = stored.panel as BacktestPanel;
    const state: BacktestViewState = { panel, sorts };
    if (panel === 'archive' && typeof stored.archive === 'string') {
      state.archive = stored.archive;
      state.archiveMode = archiveModeFromValue(stored.archiveMode);
    }
    return state;
  }
  return { panel: 'configs', sorts };
}

/** currentBacktestViewHash (:1413-1418). */
export function currentBacktestViewHash(panel: BacktestPanel, archiveName: string, archiveMode: ArchiveMode): string {
  if (panel === 'archive' && archiveName) {
    return 'archive:' + encodeURIComponent(archiveName) + ':' + archiveModeFromValue(archiveMode);
  }
  return panel || 'configs';
}

/** The exact persisted shape (:1420-1427). */
export function buildPersistedState(
  panel: BacktestPanel,
  archiveName: string,
  archiveMode: ArchiveMode,
  sorts: BacktestSorts
): { panel: BacktestPanel; archive: string; archiveMode: ArchiveMode; sorts: BacktestSorts } {
  return {
    panel,
    archive: archiveName || '',
    archiveMode: archiveModeFromValue(archiveMode),
    sorts,
  };
}
