import { describe, expect, it } from 'vitest';
import { parseCsv } from './parseCsv';

/*
 * parseCsv (:5422-5437) — the results CSV reader used for equity + fills
 * files. Parity: header keys and row values are trimmed, blank lines are
 * skipped, fewer values than headers degrade to ''.
 */

describe('parseCsv (:5422-5437)', () => {
  it('parses headers and rows into trimmed records', () => {
    const csv = parseCsv('time,balance,equity\n2024-01-01T00:00:00Z,100 , 99.5\n2024-01-02T00:00:00Z,101,100.5');
    expect(csv.headers).toEqual(['time', 'balance', 'equity']);
    expect(csv.rows).toHaveLength(2);
    expect(csv.rows[0]).toEqual({ time: '2024-01-01T00:00:00Z', balance: '100', equity: '99.5' });
  });

  it('returns empty for a header-only or empty file (< 2 lines)', () => {
    expect(parseCsv('time,balance')).toEqual({ headers: [], rows: [] });
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });

  it('skips blank lines and pads missing trailing values with empty strings', () => {
    const csv = parseCsv('a,b,c\n1,2\n\n3,4,5\n');
    expect(csv.rows).toEqual([
      { a: '1', b: '2', c: '' },
      { a: '3', b: '4', c: '5' },
    ]);
  });

  it('keeps headers untrimmed (consumers trim, :7251/:7381) but keys trimmed', () => {
    const csv = parseCsv(' time ,balance\n1,2');
    expect(csv.headers).toEqual([' time ', 'balance']);
    expect(csv.rows[0]).toEqual({ time: '1', balance: '2' });
  });
});
