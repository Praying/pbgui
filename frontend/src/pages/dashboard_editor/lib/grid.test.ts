import { afterEach, describe, expect, it } from 'vitest';
import { setDashTranslator } from './i18n';
import {
  GRID_MAX_COLS,
  GRID_MAX_ROWS,
  LAYOUTS,
  PALETTE_TYPES,
  RESIZE_MIN_BUTTON_HEIGHT,
  RESIZE_MIN_HEIGHT,
  SYNC_DEBOUNCE_MS,
  WIDGET_META,
  WIDGET_TYPES,
  badgeClassFor,
  cellKey,
  cellPos,
  cellSuffix,
  clampCols,
  clampRows,
  clearCellKeys,
  isLayoutPreset,
  isRenderableWidgetType,
  parseStoredHeight,
  swapCellKeys,
  widgetLabel,
} from './grid';

afterEach(() => {
  setDashTranslator(null);
});

describe('cell position helpers', () => {
  it('builds the legacy `r_c` position string', () => {
    expect(cellPos(1, 2)).toBe('1_2');
    expect(cellPos(10, 2)).toBe('10_2');
  });

  it('builds the `_r_c` key suffix', () => {
    expect(cellSuffix(1, 2)).toBe('_1_2');
  });

  it('builds a persisted key from a base name', () => {
    expect(cellKey('dashboard_type', 3, 1)).toBe('dashboard_type_3_1');
  });

  it('does not collide two-digit rows with one-digit suffixes', () => {
    /* legacy relies on `endsWith('_1_1')` — '_11_1' must NOT match suffix '_1_1' */
    expect('dashboard_type_11_1'.endsWith(cellSuffix(1, 1))).toBe(false);
  });
});

describe('constants (legacy editor:501-510, 2373-2505)', () => {
  it('keeps the legacy TYPES list verbatim (NONE included, P+L literal)', () => {
    expect([...WIDGET_TYPES]).toEqual([
      'NONE', 'PNL', 'ADG', 'P+L', 'INCOME', 'TOP', 'BALANCE', 'POSITIONS', 'ORDERS',
    ]);
  });

  it('keeps palette order = WIDGET_META insertion order (no NONE)', () => {
    expect([...PALETTE_TYPES]).toEqual([
      'PNL', 'ADG', 'P+L', 'INCOME', 'TOP', 'BALANCE', 'POSITIONS', 'ORDERS',
    ]);
  });

  it('keeps the legacy resize constants', () => {
    expect(RESIZE_MIN_HEIGHT).toBe(120);
    expect(RESIZE_MIN_BUTTON_HEIGHT).toBe(200);
    expect(SYNC_DEBOUNCE_MS).toBe(400);
    expect(GRID_MAX_ROWS).toBe(10);
    expect(GRID_MAX_COLS).toBe(2);
  });

  it('keeps the 10 layout presets in legacy order (editor:2527-2530)', () => {
    expect(LAYOUTS).toEqual([
      { cols: 1, rows: 1 }, { cols: 1, rows: 2 }, { cols: 1, rows: 3 }, { cols: 1, rows: 4 }, { cols: 1, rows: 5 },
      { cols: 2, rows: 1 }, { cols: 2, rows: 2 }, { cols: 2, rows: 3 }, { cols: 2, rows: 4 }, { cols: 2, rows: 5 },
    ]);
  });
});

describe('widget metadata (editor:528-537)', () => {
  it('keeps legacy icons and colors byte-identical', () => {
    expect(WIDGET_META.PNL).toEqual({ icon: '📊', color: '#96b9f4', label: 'PNL' });
    expect(WIDGET_META.ADG).toEqual({ icon: '📈', color: '#76d9ad', label: 'ADG' });
    expect(WIDGET_META['P+L']).toEqual({ icon: '📉', color: '#9b8ede', label: 'P+L' });
    expect(WIDGET_META.INCOME.icon).toBe('💰');
    expect(WIDGET_META.TOP.icon).toBe('🏆');
    expect(WIDGET_META.BALANCE.icon).toBe('⚖️');
    expect(WIDGET_META.POSITIONS.icon).toBe('📋');
    expect(WIDGET_META.ORDERS.icon).toBe('📝');
  });

  it('labels PNL/ADG/P+L with literals and the rest via dashT', () => {
    expect(widgetLabel('PNL')).toBe('PNL');
    expect(widgetLabel('ADG')).toBe('ADG');
    expect(widgetLabel('P+L')).toBe('P+L');
    expect(widgetLabel('INCOME')).toBe('Income');   // dash.widgetIncome fallback
    expect(widgetLabel('TOP')).toBe('Top');         // dash.widgetTop fallback
    expect(widgetLabel('BALANCE')).toBe('Balance'); // dash.widgetBalance fallback
    expect(widgetLabel('POSITIONS')).toBe('Positions');
    expect(widgetLabel('ORDERS')).toBe('Orders');
  });

  it('translates non-literal labels through the wired translator', () => {
    setDashTranslator((key) => (key === 'dash.widgetTop' ? '热门' : key));
    expect(widgetLabel('TOP')).toBe('热门');
    expect(widgetLabel('PNL')).toBe('PNL'); // literal unaffected
  });

  it('labels unknown types with dash.empty', () => {
    setDashTranslator((key) => (key === 'dash.empty' ? 'EMPTY' : key));
    expect(widgetLabel('BOGUS' as never)).toBe('EMPTY');
  });
});

describe('badgeClassFor (R11 quirk: P+L stored, PPL class)', () => {
  it('maps P+L to type-PPL', () => {
    expect(badgeClassFor('P+L')).toBe('type-badge type-PPL');
  });

  it('maps every other type to its own class', () => {
    expect(badgeClassFor('PNL')).toBe('type-badge type-PNL');
    expect(badgeClassFor('NONE')).toBe('type-badge type-NONE');
  });

  it('passes unknown persisted values through un-normalized (legacy badge)', () => {
    expect(badgeClassFor('BOGUS')).toBe('type-badge type-BOGUS');
  });
});

describe('isRenderableWidgetType', () => {
  it('accepts the 8 renderable types and rejects NONE', () => {
    for (const t of PALETTE_TYPES) expect(isRenderableWidgetType(t)).toBe(true);
    expect(isRenderableWidgetType('NONE')).toBe(false);
  });

  it('rejects junk, empty strings and non-strings', () => {
    expect(isRenderableWidgetType('')).toBe(false);
    expect(isRenderableWidgetType('pnl')).toBe(false);
    expect(isRenderableWidgetType(5)).toBe(false);
    expect(isRenderableWidgetType(null)).toBe(false);
  });
});

describe('layout clamping (editor:2535-2536)', () => {
  it('clamps rows into 1..10 and cols into 1..2', () => {
    expect(clampRows(0)).toBe(1);
    expect(clampRows(-3)).toBe(1);
    expect(clampRows(7)).toBe(7);
    expect(clampRows(10)).toBe(10);
    expect(clampRows(11)).toBe(10);
    expect(clampCols(0)).toBe(1);
    expect(clampCols(3)).toBe(2);
  });

  it('propagates NaN verbatim (legacy Math.max/min quirk)', () => {
    expect(clampRows(Number.NaN)).toBeNaN();
  });
});

describe('isLayoutPreset (editor:2543-2560)', () => {
  it('matches all 10 presets', () => {
    for (const l of LAYOUTS) expect(isLayoutPreset(l.rows, l.cols)).toBe(true);
  });

  it('rejects custom sizes beyond the presets', () => {
    expect(isLayoutPreset(6, 1)).toBe(false);
    expect(isLayoutPreset(7, 2)).toBe(false);
    expect(isLayoutPreset(2, 3)).toBe(false);
  });
});

describe('parseStoredHeight (editor:2375-2376)', () => {
  it('accepts positive heights (number or numeric string)', () => {
    expect(parseStoredHeight(300)).toBe(300);
    expect(parseStoredHeight('300')).toBe(300);
    expect(parseStoredHeight('200px')).toBe(200); // parseInt prefix quirk
  });

  it('rejects zero, negatives, junk and missing values', () => {
    expect(parseStoredHeight(0)).toBeNull();
    expect(parseStoredHeight(-5)).toBeNull();
    expect(parseStoredHeight('abc')).toBeNull();
    expect(parseStoredHeight('')).toBeNull();
    expect(parseStoredHeight(undefined)).toBeNull();
    expect(parseStoredHeight(null)).toBeNull();
  });

  it('truncates floats (parseInt semantics)', () => {
    expect(parseStoredHeight(12.7)).toBe(12);
  });
});

describe('swapCellKeys (editor:2181-2202)', () => {
  const s1 = '_1_1';
  const s2 = '_1_2';

  it('swaps every key pair that belongs to either cell', () => {
    const map = {
      name: 'D',
      rows: 1,
      cols: 2,
      dashboard_type_1_1: 'PNL',
      dashboard_pnl_mode_1_1: 'bar',
      dashboard_type_1_2: 'TOP',
      dashboard_top_symbols_top_1_2: 5,
    };
    const out = swapCellKeys(map, s1, s2);
    expect(out['dashboard_type_1_1']).toBe('TOP');
    expect(out['dashboard_type_1_2']).toBe('PNL');
    expect(out['dashboard_pnl_mode_1_1']).toBeUndefined();
    expect(out['dashboard_pnl_mode_1_2']).toBe('bar');
    expect(out['dashboard_top_symbols_top_1_1']).toBe(5);
    expect(out['dashboard_top_symbols_top_1_2']).toBeUndefined();
  });

  it('keeps shared keys (name/rows/cols) untouched', () => {
    const map = { name: 'D', rows: 2, cols: 2, dashboard_type_1_1: 'PNL', dashboard_type_1_2: 'TOP' };
    const out = swapCellKeys(map, s1, s2);
    expect(out.name).toBe('D');
    expect(out.rows).toBe(2);
    expect(out.cols).toBe(2);
  });

  it('deletes the counterpart when only one side has a key', () => {
    const map = { dashboard_type_1_1: 'PNL', dashboard_height_1_2: 300 };
    const out = swapCellKeys(map, s1, s2);
    expect(out['dashboard_type_1_1']).toBeUndefined();
    expect(out['dashboard_type_1_2']).toBe('PNL');
    expect(out['dashboard_height_1_1']).toBe(300);
    expect(out['dashboard_height_1_2']).toBeUndefined();
  });

  it('returns a new map and never mutates the input', () => {
    const map = { dashboard_type_1_1: 'PNL', dashboard_type_1_2: 'TOP' };
    const out = swapCellKeys(map, s1, s2);
    expect(out).not.toBe(map);
    expect(map['dashboard_type_1_1']).toBe('PNL');
  });

  it('treats an explicitly-undefined value as a missing key (legacy quirk)', () => {
    const map: Record<string, unknown> = { dashboard_type_1_1: undefined, dashboard_type_1_2: 'TOP' };
    const out = swapCellKeys(map, s1, s2);
    expect(out['dashboard_type_1_2']).toBeUndefined(); // undefined "value" → delete
    expect(out['dashboard_type_1_1']).toBe('TOP');
  });

  it('leaves cells without matching keys untouched', () => {
    const map = { dashboard_type_1_1: 'PNL', dashboard_type_2_1: 'ADG' };
    const out = swapCellKeys(map, s1, s2);
    expect(out['dashboard_type_2_1']).toBe('ADG');
  });

  it('handles a suffix-only key (base = empty string) like legacy', () => {
    const map: Record<string, unknown> = { _1_1: 'a', dashboard_type_1_2: 'b' };
    const out = swapCellKeys(map, s1, s2);
    expect(out['_1_2']).toBe('a');
    expect(out['dashboard_type_1_1']).toBe('b');
  });
});

describe('clearCellKeys (editor:585-593)', () => {
  const suffix = '_2_1';

  it('removes every cell config key except the type key, which becomes NONE', () => {
    const map = {
      name: 'D',
      dashboard_type_2_1: 'PNL',
      dashboard_pnl_mode_2_1: 'line',
      dashboard_pnl_users_2_1: ['u1'],
      dashboard_height_2_1: 300,
      dashboard_type_1_1: 'TOP',
    };
    const out = clearCellKeys(map, suffix);
    expect(out['dashboard_type_2_1']).toBe('NONE');
    expect(out['dashboard_pnl_mode_2_1']).toBeUndefined();
    expect(out['dashboard_pnl_users_2_1']).toBeUndefined();
    expect(out['dashboard_height_2_1']).toBeUndefined();
    expect(out['dashboard_type_1_1']).toBe('TOP'); // other cells untouched
    expect(out.name).toBe('D');
  });

  it('sets the type key to NONE even when the cell was already empty', () => {
    const out = clearCellKeys({ name: 'D' }, suffix);
    expect(out['dashboard_type_2_1']).toBe('NONE');
  });

  it('returns a new map and never mutates the input', () => {
    const map = { dashboard_type_2_1: 'PNL', dashboard_height_2_1: 300 };
    const out = clearCellKeys(map, suffix);
    expect(out).not.toBe(map);
    expect(map['dashboard_type_2_1']).toBe('PNL');
  });
});
