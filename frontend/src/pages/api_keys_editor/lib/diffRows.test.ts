import { describe, expect, it } from 'vitest';
import { diffAllEqual, sideDiffRows, unifiedDiffRows } from './diffRows';
import type { DiffOpcode } from '../types';

/* Provenance: renderUnifiedDiff / renderSideDiff api_keys_editor.html:3309-3420
   (context CTX=3, separator rows, line numbering). */

const L1 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
const L2 = ['a', 'b', 'c', 'd', 'X', 'f', 'g', 'h', 'i', 'j', 'k', 'L'];

// one replace in the middle (d→X at index 4, l→L at index 11 is context-only for L2? no: replace at 4, and 11 unchanged)
const OPS: DiffOpcode[] = [
  ['equal', 0, 4, 0, 4],
  ['replace', 4, 5, 4, 5],
  ['equal', 5, 12, 5, 12],
];

describe('unifiedDiffRows (:3332-3360)', () => {
  it('renders del+add rows for a replace with correct line numbers', () => {
    const rows = unifiedDiffRows(L1, L2, OPS);
    const del = rows.find((r) => r.kind === 'del');
    const add = rows.find((r) => r.kind === 'add');
    expect(del).toMatchObject({ text: 'e', ln1: 5, ln2: null, sign: '-' });
    expect(add).toMatchObject({ text: 'X', ln1: null, ln2: 5, sign: '+' });
  });

  it('collapses long equal runs into a separator row with the skipped count (:3342-3347)', () => {
    const long1 = Array.from({ length: 20 }, (_, i) => `l${i}`);
    const long2 = [...long1];
    long2[19] = 'CHANGED';
    const ops: DiffOpcode[] = [
      ['equal', 0, 19, 0, 19],
      ['replace', 19, 20, 19, 20],
    ];
    const rows = unifiedDiffRows(long1, long2, ops);
    const sep = rows.find((r) => r.kind === 'sep');
    // 19 equal lines, CTX=3 → skip 19-6=13
    expect(sep).toMatchObject({ count: 13 });
    const ctxRows = rows.filter((r) => r.kind === 'ctx');
    expect(ctxRows).toHaveLength(6); // 3 before + 3 after
    expect(ctxRows[0]).toMatchObject({ text: 'l0', ln1: 1, ln2: 1 });
    expect(ctxRows[5]).toMatchObject({ text: 'l18', ln1: 19, ln2: 19 });
  });

  it('keeps short equal runs verbatim without separators', () => {
    const rows = unifiedDiffRows(L1, L2, OPS);
    expect(rows.filter((r) => r.kind === 'sep')).toHaveLength(0);
  });

  it('handles delete and insert tags', () => {
    const ops: DiffOpcode[] = [
      ['delete', 0, 1, 0, 0],
      ['insert', 1, 1, 0, 1],
    ];
    const rows = unifiedDiffRows(L1, ['Z'], ops);
    expect(rows[0]).toMatchObject({ kind: 'del', text: 'a', sign: '-' });
    expect(rows[1]).toMatchObject({ kind: 'add', text: 'Z', sign: '+' });
  });
});

describe('sideDiffRows (:3368-3420)', () => {
  it('renders aligned left/right columns with empty padding for replace', () => {
    const { left, right } = sideDiffRows(L1, L2, OPS);
    const leftDel = left.find((r) => r.kind === 'del');
    const rightAdd = right.find((r) => r.kind === 'add');
    expect(leftDel).toMatchObject({ text: 'e' });
    expect(rightAdd).toMatchObject({ text: 'X' });
    expect(left).toHaveLength(right.length);
  });

  it('pads with empty rows on the opposite side for pure delete/insert', () => {
    const ops: DiffOpcode[] = [
      ['equal', 0, 1, 0, 1],
      ['delete', 1, 3, 1, 1],
    ];
    const { left, right } = sideDiffRows(L1, ['a'], ops);
    expect(left.filter((r) => r.kind === 'del')).toHaveLength(2);
    expect(right.filter((r) => r.kind === 'empty')).toHaveLength(2);
  });

  it('collapses long equal runs with separator rows in both columns', () => {
    const long1 = Array.from({ length: 20 }, (_, i) => `l${i}`);
    const ops: DiffOpcode[] = [['equal', 0, 20, 0, 20]];
    const { left, right } = sideDiffRows(long1, long1, ops);
    expect(left.find((r) => r.kind === 'sep')).toMatchObject({ count: 14 });
    expect(right.find((r) => r.kind === 'sep')).toMatchObject({ count: 14 });
    expect(left.filter((r) => r.kind === 'ctx')).toHaveLength(6);
  });
});

describe('diffAllEqual (:3311)', () => {
  it('true only when every opcode is equal', () => {
    expect(diffAllEqual([['equal', 0, 1, 0, 1]])).toBe(true);
    expect(diffAllEqual(OPS)).toBe(false);
    expect(diffAllEqual([])).toBe(true);
  });
});
