import { describe, expect, it } from 'vitest';
import { compareCellText, compareColumns, compareSourceLabels, compareStatusesAndLabels } from './compareTables';
import type { CompareData } from '../types';

/* Compare tab label/column derivation — ports of :1223-1343. */

describe('compareSourceLabels (:1223-1248)', () => {
  it('v7 labels map pb7/b/c to the legacy engine names', () => {
    const labels = compareSourceLabels(false, {}, false);
    expect(labels).toMatchObject({ pb7: 'PB7 Backtest Result', b: 'PBGui Simulation', c: 'PB7 Backtest Engine' });
  });

  it('v8 default labels use the stored/fresh replay names', () => {
    const labels = compareSourceLabels(true, {}, false);
    expect(labels).toMatchObject({ pb7: 'Stored PB8 Result', b: 'Fresh PB8 Replay', c: 'PB8 Native Replay' });
  });

  it('server-provided sources override the defaults', () => {
    const data = { sources: { pb7: { label: 'A' }, b: 'B', c: { label: 'C' } } } as unknown as CompareData;
    expect(compareSourceLabels(false, data, false)).toMatchObject({ pb7: 'A', b: 'B', c: 'C' });
  });

  it('v8 pinned-baseline pairs relabel b/c (:1236-1245)', () => {
    const stored = { sources: { pb7: 'x', c: 'y' } } as unknown as CompareData;
    expect(compareSourceLabels(true, stored, false)).toMatchObject({ pb7: 'Stored PB8 Result', c: 'Fresh PB8 Replay' });
    const pinned = { sources: { b: 'x', c: 'y' } } as unknown as CompareData;
    expect(compareSourceLabels(true, pinned, true)).toMatchObject({
      b: 'Current PB8 Config',
      c: 'Pinned PB8 Baseline',
    });
    expect(compareSourceLabels(true, pinned, false)).toMatchObject({ b: 'PB8 Native Replay A', c: 'PB8 Native Replay B' });
  });
});

describe('compareStatusesAndLabels (:1249-1290)', () => {
  it('uses the full eight-status set on v7', () => {
    const { statuses, labels } = compareStatusesAndLabels(false, { long: {}, short: {} }, null, false);
    expect(statuses).toEqual(['match', 'pb7_only', 'b_only', 'c_only', 'pb7_and_b', 'pb7_and_c', 'b_and_c', 'mismatch']);
    expect(labels.pb7_only).toBe('PB7 Result only');
    expect(labels.b_and_c).toBe('PBGui Simulation + PB7 Backtest Engine');
  });

  it('v8 stored-vs-fresh narrows the status set (:1270-1273)', () => {
    const data = { sources: { pb7: 's', c: 'f' } } as unknown as CompareData;
    const { statuses, labels } = compareStatusesAndLabels(true, { long: {}, short: {} }, data, false);
    expect(statuses).toEqual(['match', 'pb7_only', 'c_only', 'pb7_and_c', 'mismatch']);
    expect(labels.c_only).toBe('Fresh PB8 Replay only');
  });

  it('v8 current-vs-pinned relabels the b/c pair (:1274-1278)', () => {
    const data = { sources: { b: 'x', c: 'y' } } as unknown as CompareData;
    const { statuses, labels } = compareStatusesAndLabels(true, { long: {}, short: {} }, data, true);
    expect(statuses).toEqual(['match', 'b_only', 'c_only', 'b_and_c', 'mismatch']);
    expect(labels.b_only).toBe('Current PB8 Config only');
    expect(labels.b_and_c).toBe('Current Config + Pinned Baseline');
  });

  it('discovers statuses from non-empty summary counts (:1279-1283)', () => {
    // sources without a b+c pair (or v7) fall through to summary discovery
    const data = { sources: { b: 'x', z: 'w' } } as unknown as CompareData;
    const summary = { long: { match: 3, b_only: 1 }, short: { mismatch: 2 } };
    const { statuses } = compareStatusesAndLabels(true, summary as CompareData['summary'], data, false);
    expect(statuses.sort()).toEqual(['b_only', 'match', 'mismatch']);
  });

  it('backend status_labels override the defaults (:1266-1267)', () => {
    const data = { sources: { b: 'x', c: 'y' }, status_labels: { match: 'MATCH!' } } as unknown as CompareData;
    const { labels } = compareStatusesAndLabels(false, { long: {}, short: {} }, data, false);
    expect(labels.match).toBe('MATCH!');
  });
});

describe('compareColumns (:1299-1330)', () => {
  it('v7 keeps the full 39-column set (:1304-1310)', () => {
    const cols = compareColumns(false, null, false);
    expect(cols).toHaveLength(39);
    expect(cols[0]).toEqual(['idx', '#']);
    expect(cols.find((c) => c[0] === 'b_price')).toEqual(['b_price', 'pbgui_price']);
  });

  it('v8 stored-vs-fresh drops the b_* columns and renames to stored_/fresh_', () => {
    const data = { sources: { pb7: 's', c: 'f' } } as unknown as CompareData;
    const cols = compareColumns(true, data, false);
    expect(cols.find((c) => c[0] === 'b_price')).toBeUndefined();
    expect(cols.find((c) => c[0] === 'pb7_price')).toEqual(['pb7_price', 'stored_price']);
    expect(cols.find((c) => c[0] === 'c_price')).toEqual(['c_price', 'fresh_price']);
    expect(cols.find((c) => c[0] === 'in_pb7')).toEqual(['in_pb7', 'in_stored']);
    expect(cols.find((c) => c[0] === 'in_b')).toBeUndefined();
  });

  it('v8 current-vs-pinned drops the pb7_* columns and uses current_/pinned_', () => {
    const data = { sources: { b: 'x', c: 'y' } } as unknown as CompareData;
    const cols = compareColumns(true, data, true);
    expect(cols.find((c) => c[0] === 'pb7_price')).toBeUndefined();
    expect(cols.find((c) => c[0] === 'b_price')).toEqual(['b_price', 'current_price']);
    expect(cols.find((c) => c[0] === 'c_price')).toEqual(['c_price', 'pinned_price']);
    expect(cols.find((c) => c[0] === 'in_b')).toEqual(['in_b', 'in_current']);
    expect(cols.find((c) => c[0] === 'in_c')).toEqual(['in_c', 'in_pinned']);
  });

  it('v8 A/B replay naming without a baseline (:1323-1327)', () => {
    const data = { sources: { b: 'x', c: 'y' } } as unknown as CompareData;
    const cols = compareColumns(true, data, false);
    expect(cols.find((c) => c[0] === 'b_price')).toEqual(['b_price', 'replay_a_price']);
    expect(cols.find((c) => c[0] === 'c_price')).toEqual(['c_price', 'replay_b_price']);
    expect(cols.find((c) => c[0] === 'in_c')).toEqual(['in_c', 'in_replay_b']);
  });
});

describe('compareCellText (:1331-1339)', () => {
  const statusLabels: Record<string, string> = { mismatch: 'Mismatch' };

  it('formats idx, status, numbers, booleans and blanks', () => {
    expect(compareCellText({ compare_index: 7 }, 'idx', 0, statusLabels)).toBe('7');
    expect(compareCellText({}, 'idx', 4, statusLabels)).toBe('5');
    expect(compareCellText({ status: 'mismatch' }, 'status', 0, statusLabels)).toBe('Mismatch');
    expect(compareCellText({ qty: 0.5 }, 'qty', 0, statusLabels)).toBe('0.5');
    expect(compareCellText({ qty: 1234.5 }, 'qty', 0, statusLabels)).toBe('1,234.5');
    expect(compareCellText({ in_b: true }, 'in_b', 0, statusLabels)).toBe('TRUE');
    expect(compareCellText({ in_b: false }, 'in_b', 0, statusLabels)).toBe('FALSE');
    expect(compareCellText({ qty: null }, 'qty', 0, statusLabels)).toBe('');
    expect(compareCellText({ order_type: '<x>' }, 'order_type', 0, statusLabels)).toBe('&lt;x&gt;');
  });
});
