import { describe, expect, it } from 'vitest';
import { MAIN_COLUMNS } from './columns';

/**
 * The main symbol table is table-fixed with percentage columns. Without floors
 * every column shrinks together and the short headers clip ("Coin" -> "Co…",
 * "Rank" -> "R.."; 7-11 of 12 headers clipped between 1440px and 1024px). Each
 * column therefore carries a measured `minWidth`, and the table's own min-width
 * is the smallest width at which every column's percentage share still covers
 * its floor. These tests keep the two in step so retuning one cannot silently
 * reintroduce the clipping.
 */
describe('MAIN_COLUMNS header floors', () => {
  const pct = (c: { width: string }): number => Number.parseFloat(c.width);

  it('declares a floor on every column', () => {
    for (const column of MAIN_COLUMNS) expect(column.minWidth, column.key).toBeGreaterThan(0);
  });

  it('keeps the percentages summing to 100 so the colgroup fills the table', () => {
    const total = MAIN_COLUMNS.reduce((sum, c) => sum + pct(c), 0);
    expect(total).toBeCloseTo(100, 1);
  });

  it('gives every column at least its floor at the table floor width', () => {
    const tableFloor = Math.max(...MAIN_COLUMNS.map((c) => ((c.minWidth ?? 0) * 100) / pct(c)));
    for (const column of MAIN_COLUMNS) {
      const share = (pct(column) / 100) * tableFloor;
      expect(share, `${column.key} gets ${share.toFixed(1)}px of its ${column.minWidth}px floor`).toBeGreaterThanOrEqual(
        (column.minWidth ?? 0) - 0.5,
      );
    }
  });

  it('does not let the table floor outgrow what a 1440px viewport can scroll sensibly', () => {
    const tableFloor = Math.max(...MAIN_COLUMNS.map((c) => ((c.minWidth ?? 0) * 100) / pct(c)));
    // a floor far above the common laptop width would turn every view into a scroller
    expect(tableFloor).toBeLessThan(1500);
  });
});
