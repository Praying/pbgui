import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IncomeRow } from '../types/widgets';
import {
  DRAG_THRESHOLD_PX,
  JUMP_DEBOUNCE_MS,
  STATUS_HIDE_MS,
  cutoffDateText,
  deleteOlderUsersParam,
  findClosestDateIndex,
  findExactDateIndex,
  resetIncomeScroll,
  rowIndexAtTops,
  saveIncomeScroll,
  scanDeleteOlderSelection,
  selectionBounds,
  sortIncomeRows,
  takeIncomeScroll,
} from './incomeLogic';

/* Pure helpers lifted from the legacy income table
 * (dashboard_render.js:1030-1470 _buildIncomeTable + 894-898/1022-1026 scroll
 * preserve). These drive the IncomeTable component — see IncomeTable.test.ts. */

const ROWS: IncomeRow[] = [
  { id: 3, date_ms: 1706230000000, date: '2024-01-25 23:13:20', symbol: 'BTC', income: 12.345, user: 'alice' },
  { id: 1, date_ms: 1706200000000, date: '2024-01-25 16:53:20', symbol: 'ETH', income: -4, user: 'bob' },
  { id: 2, date_ms: 1706210000000, date: '2024-01-25 19:39:20', symbol: 'SOL', income: 7.5, user: 'alice' },
];

beforeEach(() => {
  resetIncomeScroll();
});

afterEach(() => {
  resetIncomeScroll();
});

describe('sortIncomeRows (render.js:1235-1243 doSort)', () => {
  it('sorts string columns ascending with localeCompare', () => {
    const out = sortIncomeRows(ROWS, 'user', true);
    expect(out.map((r) => r.user)).toEqual(['alice', 'alice', 'bob']);
  });

  it('sorts string columns descending by reversed comparator', () => {
    const out = sortIncomeRows(ROWS, 'symbol', false);
    expect(out.map((r) => r.symbol)).toEqual(['SOL', 'ETH', 'BTC']);
  });

  it('sorts the numeric income column both directions', () => {
    expect(sortIncomeRows(ROWS, 'income', true).map((r) => r.income)).toEqual([-4, 7.5, 12.345]);
    expect(sortIncomeRows(ROWS, 'income', false).map((r) => r.income)).toEqual([12.345, 7.5, -4]);
  });

  it('returns a new array and never mutates the input (server order is the default display)', () => {
    const input = [...ROWS];
    const out = sortIncomeRows(ROWS, 'date', true);
    expect(out).not.toBe(ROWS);
    expect(ROWS).toEqual(input);
  });
});

describe('rowIndexAtTops (render.js:1189-1195 rowIndexAtY)', () => {
  it('returns the last row whose top is at or above y', () => {
    expect(rowIndexAtTops([100, 120, 140], 100)).toBe(0);
    expect(rowIndexAtTops([100, 120, 140], 130)).toBe(1);
    expect(rowIndexAtTops([100, 120, 140], 500)).toBe(2);
  });

  it('returns 0 when y is above every row', () => {
    expect(rowIndexAtTops([100, 120, 140], 10)).toBe(0);
  });

  it('returns 0 for an empty row list', () => {
    expect(rowIndexAtTops([], 10)).toBe(0);
  });
});

describe('selectionBounds (render.js:1200-1203)', () => {
  it('normalizes anchor/current into low/high', () => {
    expect(selectionBounds(2, 0)).toEqual({ low: 0, high: 2 });
    expect(selectionBounds(0, 2)).toEqual({ low: 0, high: 2 });
    expect(selectionBounds(1, 1)).toEqual({ low: 1, high: 1 });
  });
});

describe('findExactDateIndex (render.js:1090-1096)', () => {
  it('matches on date.slice(0, 10) and returns the first hit', () => {
    expect(findExactDateIndex(ROWS, '2024-01-25')).toBe(0);
  });

  it('returns -1 when no row matches the target date', () => {
    expect(findExactDateIndex(ROWS, '2020-05-05')).toBe(-1);
  });

  it('returns -1 for an empty row list', () => {
    expect(findExactDateIndex([], '2024-01-25')).toBe(-1);
  });
});

describe('findClosestDateIndex (render.js:1107-1113)', () => {
  const DAYS: IncomeRow[] = [
    { id: 1, date_ms: 1, date: '2024-03-05 10:00:00', symbol: 'A', income: 1, user: 'u' },
    { id: 2, date_ms: 2, date: '2024-06-01 10:00:00', symbol: 'B', income: 2, user: 'u' },
    { id: 3, date_ms: 3, date: '2024-09-20 10:00:00', symbol: 'C', income: 3, user: 'u' },
  ];

  it('returns the row whose date is closest to the target by |ms| (day granularity)', () => {
    expect(findClosestDateIndex(DAYS, '2023-11-01')).toBe(0); /* nearest 2024-03-05 */
    expect(findClosestDateIndex(DAYS, '2024-07-15')).toBe(1); /* nearest 2024-06-01 */
    expect(findClosestDateIndex(DAYS, '2025-01-01')).toBe(2); /* nearest 2024-09-20 */
  });

  it('compares dates truncated to the day — same-day rows tie and the first wins (strict <)', () => {
    expect(findClosestDateIndex(ROWS, '2023-06-01')).toBe(0);
  });

  it('returns 0 for an empty row list (legacy bestIdx=0 default)', () => {
    expect(findClosestDateIndex([], '2024-01-25')).toBe(0);
  });
});

describe('scanDeleteOlderSelection (render.js:1290-1299)', () => {
  it('computes the min date_ms and the distinct selected users', () => {
    const selected = { '1': true, '2': true };
    expect(scanDeleteOlderSelection(ROWS, selected)).toEqual({
      cutoffMs: 1706200000000,
      selectedUsers: ['bob', 'alice'],
    });
  });

  it('ignores unselected rows entirely', () => {
    expect(scanDeleteOlderSelection(ROWS, { '3': true })).toEqual({
      cutoffMs: 1706230000000,
      selectedUsers: ['alice'],
    });
  });

  it('returns null when nothing is selected (legacy minMs=Infinity guard)', () => {
    expect(scanDeleteOlderSelection(ROWS, {})).toBeNull();
  });
});

describe('cutoffDateText (render.js:1299)', () => {
  it("formats ISO with 'T' replaced by a space, seconds precision (UTC)", () => {
    expect(cutoffDateText(0)).toBe('1970-01-01 00:00:00');
    expect(cutoffDateText(1700000000000)).toBe('2023-11-14 22:13:20');
  });
});

describe('deleteOlderUsersParam (render.js:1301)', () => {
  it("collapses to ['ALL'] when the widget users contain ALL", () => {
    expect(deleteOlderUsersParam(['ALL'], ['bob', 'alice'])).toEqual(['ALL']);
    expect(deleteOlderUsersParam(['alice', 'ALL'], ['bob'])).toEqual(['ALL']);
  });

  it('passes the selected-row users through otherwise', () => {
    expect(deleteOlderUsersParam(['alice', 'bob'], ['alice'])).toEqual(['alice']);
  });

  it('treats missing widget users as non-ALL (legacy opts.users falsy branch)', () => {
    expect(deleteOlderUsersParam(null, ['bob'])).toEqual(['bob']);
  });
});

describe('constants (render.js literals)', () => {
  it('matches the legacy drag threshold, jump debounce and status-hide timeouts', () => {
    expect(DRAG_THRESHOLD_PX).toBe(5);
    expect(JUMP_DEBOUNCE_MS).toBe(600);
    expect(STATUS_HIDE_MS).toBe(4000);
  });
});

describe('income scroll memory (render.js:894-898, 1022-1026)', () => {
  it('round-trips a saved scrollTop by cell position and defaults to 0', () => {
    expect(takeIncomeScroll('1_2')).toBe(0);
    saveIncomeScroll('1_2', 250);
    expect(takeIncomeScroll('1_2')).toBe(250);
    expect(takeIncomeScroll('2_1')).toBe(0);
  });

  it('is shared across instances (module state, like legacy DOM scrollTop)', () => {
    saveIncomeScroll('3_1', 80);
    expect(takeIncomeScroll('3_1')).toBe(80);
  });
});
