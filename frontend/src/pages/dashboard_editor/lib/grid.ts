/**
 * Pure grid helpers — the port of the legacy editor's grid-level constants and
 * state-suffix logic (dashboard_editor.html:501-537, 2181-2202, 2527-2560).
 *
 * All functions here are pure (immutable): they return new maps / values and
 * never mutate their inputs. The reactive store (stores/dashboardStore.ts)
 * applies their results to its single reactive state record.
 *
 * R5: key names below are the persisted dashboard JSON contract — do not
 * rename. R11: the cell type literal 'P+L' is stored on disk but its badge
 * CSS class is `type-PPL` — never "normalize" the value.
 */
import type { WidgetType } from '../types/widgets';
import { dashT } from './i18n';

/* ── constants (editor:501-510) ── */

/** Legacy TYPES list verbatim — 'NONE' is the persisted empty-cell value. */
export const WIDGET_TYPES: readonly WidgetType[] = [
  'NONE', 'PNL', 'ADG', 'P+L', 'INCOME', 'TOP', 'BALANCE', 'POSITIONS', 'ORDERS',
];

/** Types that render a widget (all of TYPES except NONE). */
export type RenderableWidgetType = Exclude<WidgetType, 'NONE'>;

/** Legacy grid bounds (editor:2535-2536, 2563-2564). */
export const GRID_MIN_ROWS = 1;
export const GRID_MAX_ROWS = 10;
export const GRID_MIN_COLS = 1;
export const GRID_MAX_COLS = 2;

/** Legacy resize constants (editor:2413, 2484) and sync debounce (editor:597). */
export const RESIZE_MIN_HEIGHT = 120;
export const RESIZE_MIN_BUTTON_HEIGHT = 200;
export const SYNC_DEBOUNCE_MS = 400;

/* ── widget metadata (editor:528-537) ── */

export interface WidgetMeta {
  icon: string;
  color: string;
  /** Literal label (PNL/ADG/P+L are not translated in legacy). */
  label?: string;
  /** i18n key for translated labels. */
  labelKey?: string;
  /** English fallback literal for dashT. */
  labelFallback?: string;
}

export const WIDGET_META: Record<RenderableWidgetType, WidgetMeta> = {
  PNL: { icon: '📊', color: '#a9c0d6', label: 'PNL' },
  ADG: { icon: '📈', color: '#accbab', label: 'ADG' },
  'P+L': { icon: '📉', color: '#a493c4', label: 'P+L' },
  INCOME: { icon: '💰', color: '#dbc4a2', labelKey: 'dash.widgetIncome', labelFallback: 'Income' },
  TOP: { icon: '🏆', color: '#dbc4a2', labelKey: 'dash.widgetTop', labelFallback: 'Top' },
  BALANCE: { icon: '⚖️', color: '#a9c0d6', labelKey: 'dash.widgetBalance', labelFallback: 'Balance' },
  POSITIONS: { icon: '📋', color: '#a9c0d6', labelKey: 'dash.widgetPositions', labelFallback: 'Positions' },
  ORDERS: { icon: '📝', color: '#a493c4', labelKey: 'dash.widgetOrders', labelFallback: 'Orders' },
};

/** Palette order = legacy WIDGET_META key insertion order (no NONE). */
export const PALETTE_TYPES: readonly RenderableWidgetType[] = Object.keys(
  WIDGET_META
) as RenderableWidgetType[];

export function isRenderableWidgetType(value: unknown): value is RenderableWidgetType {
  return typeof value === 'string' && (PALETTE_TYPES as readonly string[]).includes(value);
}

/** Legacy badge label (editor:2297-2308): meta label, else dash.empty. */
export function widgetLabel(type: WidgetType): string {
  const meta = WIDGET_META[type as RenderableWidgetType];
  if (!meta) return dashT('dash.empty', 'EMPTY');
  if (meta.label) return meta.label;
  return dashT(meta.labelKey ?? '', meta.labelFallback ?? '');
}

/** Legacy badge class (editor:2298) — R11: 'P+L' → `type-PPL`. */
export function badgeClassFor(type: string): string {
  return 'type-badge type-' + (type === 'P+L' ? 'PPL' : type);
}

/* ── layout presets (editor:2527-2530) ── */

export interface LayoutPreset {
  cols: 1 | 2;
  rows: number;
}

/** 10 presets: rows 1-5 × cols 1-2; extra rows via the grid footer (≤10). */
export const LAYOUTS: readonly LayoutPreset[] = [
  { cols: 1, rows: 1 }, { cols: 1, rows: 2 }, { cols: 1, rows: 3 }, { cols: 1, rows: 4 }, { cols: 1, rows: 5 },
  { cols: 2, rows: 1 }, { cols: 2, rows: 2 }, { cols: 2, rows: 3 }, { cols: 2, rows: 4 }, { cols: 2, rows: 5 },
];

/** Legacy setLayout clamps (editor:2535-2536) — verbatim Math.max/min chain. */
export function clampRows(rows: number): number {
  return Math.max(GRID_MIN_ROWS, Math.min(GRID_MAX_ROWS, rows));
}

export function clampCols(cols: number): number {
  return Math.max(GRID_MIN_COLS, Math.min(GRID_MAX_COLS, cols));
}

/** Whether rows×cols is one of the 10 presets (editor:2543-2551). */
export function isLayoutPreset(rows: number, cols: number): boolean {
  return LAYOUTS.some((l) => l.rows === rows && l.cols === cols);
}

/* ── persisted flat-key helpers (R5) ── */

export function cellPos(row: number, col: number): string {
  return row + '_' + col;
}

export function cellSuffix(row: number, col: number): string {
  return '_' + cellPos(row, col);
}

export function cellKey(base: string, row: number, col: number): string {
  return base + cellSuffix(row, col);
}

/** Legacy stored-height parse (editor:2375): `parseInt(...) > 0` else none. */
export function parseStoredHeight(value: unknown): number | null {
  const parsed = parseInt(String(value), 10);
  return parsed > 0 ? parsed : null;
}

/* ── flat-map cell operations (editor:585-593, 2181-2202) ── */

/**
 * Swap every key pair that belongs to either cell — port of legacy swapCells'
 * key loop. Collects the union of key "bases" (key minus suffix) on either
 * side, then exchanges values per base, deleting where a side is missing.
 * Legacy quirk preserved: an explicitly-`undefined` value counts as missing.
 */
export function swapCellKeys(
  map: Record<string, unknown>,
  suffix1: string,
  suffix2: string
): Record<string, unknown> {
  const bases = new Set<string>();
  for (const k of Object.keys(map)) {
    if (k.endsWith(suffix1)) bases.add(k.slice(0, k.length - suffix1.length));
    if (k.endsWith(suffix2)) bases.add(k.slice(0, k.length - suffix2.length));
  }
  const out: Record<string, unknown> = { ...map };
  for (const base of bases) {
    const k1 = base + suffix1;
    const k2 = base + suffix2;
    const tmp = Object.prototype.hasOwnProperty.call(out, k1) ? out[k1] : undefined;
    const v2 = Object.prototype.hasOwnProperty.call(out, k2) ? out[k2] : undefined;
    if (v2 === undefined) delete out[k1];
    else out[k1] = v2;
    if (tmp === undefined) delete out[k2];
    else out[k2] = tmp;
  }
  return out;
}

/**
 * Clear a cell: delete all its config keys, keep the type key set to 'NONE'
 * (editor:585-593). Other cells and shared keys (name/rows/cols) are kept.
 */
export function clearCellKeys(map: Record<string, unknown>, suffix: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...map };
  for (const k of Object.keys(out)) {
    if (k.endsWith(suffix) && k !== 'dashboard_type' + suffix) delete out[k];
  }
  out['dashboard_type' + suffix] = 'NONE';
  return out;
}
