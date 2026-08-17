import type { DiffOpcode } from '../types';

/* Backup diff row computation ported from renderUnifiedDiff /
   renderSideDiff (api_keys_editor.html:3309-3420) — context CTX=3 with
   separator rows and paired line numbers. Pure functions so the modal
   template only renders rows. */

export const DIFF_CONTEXT = 3;

export type DiffLineKind = 'ctx' | 'add' | 'del' | 'empty';

export interface DiffLineRow {
  kind: DiffLineKind;
  ln1: number | null;
  ln2: number | null;
  sign: string;
  text: string;
}

export interface DiffSepRow {
  kind: 'sep';
  count: number;
}

export type DiffRow = DiffLineRow | DiffSepRow;

function isSep(row: DiffRow): row is DiffSepRow {
  return row.kind === 'sep';
}

export function isDiffSep(row: DiffRow): row is DiffSepRow {
  return isSep(row);
}

/** True when every opcode is 'equal' — the identical-files view (:3311). */
export function diffAllEqual(opcodes: DiffOpcode[]): boolean {
  return opcodes.every((op) => op[0] === 'equal');
}

export function unifiedDiffRows(lines1: string[], lines2: string[], opcodes: DiffOpcode[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let ln1 = 1;
  let ln2 = 1;
  for (const [tag, i1, i2, j1, j2] of opcodes) {
    if (tag === 'equal') {
      const len = i2 - i1;
      if (len <= DIFF_CONTEXT * 2 + 1) {
        for (let i = i1; i < i2; i++) {
          rows.push({ kind: 'ctx', ln1: ln1++, ln2: ln2++, sign: ' ', text: lines1[i] ?? '' });
        }
      } else {
        for (let i = i1; i < i1 + DIFF_CONTEXT; i++) {
          rows.push({ kind: 'ctx', ln1: ln1++, ln2: ln2++, sign: ' ', text: lines1[i] ?? '' });
        }
        rows.push({ kind: 'sep', count: len - DIFF_CONTEXT * 2 });
        ln1 += len - DIFF_CONTEXT * 2;
        ln2 += len - DIFF_CONTEXT * 2;
        for (let i = i2 - DIFF_CONTEXT; i < i2; i++) {
          rows.push({ kind: 'ctx', ln1: ln1++, ln2: ln2++, sign: ' ', text: lines1[i] ?? '' });
        }
      }
    } else if (tag === 'replace') {
      for (let i = i1; i < i2; i++) {
        rows.push({ kind: 'del', ln1: ln1++, ln2: null, sign: '-', text: lines1[i] ?? '' });
      }
      for (let j = j1; j < j2; j++) {
        rows.push({ kind: 'add', ln1: null, ln2: ln2++, sign: '+', text: lines2[j] ?? '' });
      }
    } else if (tag === 'delete') {
      for (let i = i1; i < i2; i++) {
        rows.push({ kind: 'del', ln1: ln1++, ln2: null, sign: '-', text: lines1[i] ?? '' });
      }
    } else if (tag === 'insert') {
      for (let j = j1; j < j2; j++) {
        rows.push({ kind: 'add', ln1: null, ln2: ln2++, sign: '+', text: lines2[j] ?? '' });
      }
    }
  }
  return rows;
}

/** Side-by-side columns: left mirrors lines1, right lines2 (:3368-3420). */
export function sideDiffRows(
  lines1: string[],
  lines2: string[],
  opcodes: DiffOpcode[]
): { left: DiffRow[]; right: DiffRow[] } {
  const left: DiffRow[] = [];
  const right: DiffRow[] = [];
  let ln1 = 1;
  let ln2 = 1;
  for (const [tag, i1, i2, j1, j2] of opcodes) {
    if (tag === 'equal') {
      const len = i2 - i1;
      if (len <= DIFF_CONTEXT * 2 + 1) {
        for (let i = 0; i < len; i++) {
          left.push({ kind: 'ctx', ln1: ln1++, ln2: null, sign: ' ', text: lines1[i1 + i] ?? '' });
          right.push({ kind: 'ctx', ln1: ln2++, ln2: null, sign: ' ', text: lines2[j1 + i] ?? '' });
        }
      } else {
        for (let i = 0; i < DIFF_CONTEXT; i++) {
          left.push({ kind: 'ctx', ln1: ln1++, ln2: null, sign: ' ', text: lines1[i1 + i] ?? '' });
          right.push({ kind: 'ctx', ln1: ln2++, ln2: null, sign: ' ', text: lines2[j1 + i] ?? '' });
        }
        const skip = len - DIFF_CONTEXT * 2;
        left.push({ kind: 'sep', count: skip });
        right.push({ kind: 'sep', count: skip });
        ln1 += skip;
        ln2 += skip;
        for (let i = len - DIFF_CONTEXT; i < len; i++) {
          left.push({ kind: 'ctx', ln1: ln1++, ln2: null, sign: ' ', text: lines1[i1 + i] ?? '' });
          right.push({ kind: 'ctx', ln1: ln2++, ln2: null, sign: ' ', text: lines2[j1 + i] ?? '' });
        }
      }
    } else if (tag === 'replace') {
      const maxLen = Math.max(i2 - i1, j2 - j1);
      for (let x = 0; x < maxLen; x++) {
        if (x < i2 - i1) left.push({ kind: 'del', ln1: ln1++, ln2: null, sign: '-', text: lines1[i1 + x] ?? '' });
        else left.push({ kind: 'empty', ln1: null, ln2: null, sign: ' ', text: '' });
        if (x < j2 - j1) right.push({ kind: 'add', ln1: ln2++, ln2: null, sign: '+', text: lines2[j1 + x] ?? '' });
        else right.push({ kind: 'empty', ln1: null, ln2: null, sign: ' ', text: '' });
      }
    } else if (tag === 'delete') {
      for (let i = i1; i < i2; i++) {
        left.push({ kind: 'del', ln1: ln1++, ln2: null, sign: '-', text: lines1[i] ?? '' });
        right.push({ kind: 'empty', ln1: null, ln2: null, sign: ' ', text: '' });
      }
    } else if (tag === 'insert') {
      for (let j = j1; j < j2; j++) {
        left.push({ kind: 'empty', ln1: null, ln2: null, sign: ' ', text: '' });
        right.push({ kind: 'add', ln1: ln2++, ln2: null, sign: '+', text: lines2[j] ?? '' });
      }
    }
  }
  return { left, right };
}
