import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rowIdxAtY, useRowDragSelect } from './useRowDragSelect';

/*
 * The results/configs row-selection drag mechanics — the port of the
 * document-level mousedown/mousemove/mouseup blocks (:5731-5785) plus
 * tickRowSelectAutoScroll (:5625-5663): click toggles one row, a >5px
 * drag range-selects add/remove from the anchor row, and the wrap
 * auto-scrolls near its 40px edges at up to 22px per rAF tick.
 */

function rowAt(top: number, bottom: number): HTMLElement {
  const row = document.createElement('tr');
  row.getBoundingClientRect = () => ({ top, bottom } as DOMRect);
  return row;
}

describe('rowIdxAtY (:5736-5740)', () => {
  it('returns the index of the last row whose top is above y', () => {
    const rows = [rowAt(0, 10), rowAt(10, 20), rowAt(20, 30)];
    expect(rowIdxAtY(rows, 5)).toBe(0);
    expect(rowIdxAtY(rows, 15)).toBe(1);
    expect(rowIdxAtY(rows, 100)).toBe(2);
    expect(rowIdxAtY(rows, -5)).toBe(0);
  });

  it('an empty list still reports index 0', () => {
    expect(rowIdxAtY([], 10)).toBe(0);
  });
});

describe('useRowDragSelect (:5755-5784)', () => {
  const events: string[] = [];
  let toggled: string[] = [];
  let ranges: Array<{ paths: string[]; selected: boolean }> = [];

  beforeEach(() => {
    toggled = [];
    ranges = [];
    events.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mouse(target: HTMLElement, type: string, clientY: number, button = 0): void {
    target.dispatchEvent(
      new MouseEvent(type, { button, clientY, bubbles: true, cancelable: true })
    );
    events.push(type);
  }

  function setup(): { rows: HTMLElement[]; wrap: HTMLElement; dispose(): void } {
    const rows = ['a', 'b', 'c'].map((path) => {
      const tr = document.createElement('tr');
      tr.dataset.path = path;
      document.body.appendChild(tr);
      return tr;
    });
    vi.spyOn(rows[0]!, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 20 } as DOMRect);
    vi.spyOn(rows[1]!, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 40 } as DOMRect);
    vi.spyOn(rows[2]!, 'getBoundingClientRect').mockReturnValue({ top: 40, bottom: 60 } as DOMRect);
    const wrap = document.createElement('div');
    wrap.style.overflow = 'auto';
    document.body.appendChild(wrap);
    const select = useRowDragSelect({
      getRows: () => rows,
      getWrap: () => wrap,
      isSelected: (path) => path === 'b',
      onToggle: (path) => toggled.push(path),
      onSelectRange: (paths, selected) => ranges.push({ paths, selected }),
      raf: (fn) => window.setTimeout(fn, 16) as unknown as number,
      cancelRaf: (id) => window.clearTimeout(id as number),
    });
    return { rows, wrap, dispose: select.dispose };
  }

  it('a plain click (no movement) toggles the anchor row (:5776-5778)', () => {
    const { rows, dispose } = setup();
    mouse(rows[0]!, 'mousedown', 10);
    mouse(document.body, 'mouseup', 11); // < 5px movement
    expect(toggled).toEqual(['a']);
    expect(ranges).toEqual([]);
    dispose();
  });

  it('a >5px drag applies an add-range from the anchor to the hovered row (:5764-5773)', async () => {
    const { rows, dispose } = setup();
    mouse(rows[0]!, 'mousedown', 10);
    mouse(document.body, 'mousemove', 16); // crossing the 5px threshold — anchor 'a' is unselected → add
    mouse(document.body, 'mousemove', 45); // over row c
    mouse(document.body, 'mouseup', 45);
    expect(toggled).toEqual([]);
    expect(ranges.at(-1)).toEqual({ paths: ['a', 'b', 'c'], selected: true });
    dispose();
  });

  it('a drag from a selected anchor removes rows from the range (:5766-5767)', () => {
    const { rows, dispose } = setup();
    mouse(rows[1]!, 'mousedown', 25); // 'b' is selected → remove mode
    mouse(document.body, 'mousemove', 40);
    mouse(document.body, 'mouseup', 40);
    expect(ranges.at(-1)).toEqual({ paths: ['b', 'c'], selected: false });
    dispose();
  });

  it('mousedown on the actions cell is ignored (:5758)', () => {
    const { rows, dispose } = setup();
    const td = document.createElement('td');
    td.className = 'actions-cell';
    rows[0]!.appendChild(td);
    mouse(td, 'mousedown', 10);
    mouse(document.body, 'mouseup', 10);
    expect(toggled).toEqual([]);
    dispose();
  });

  it('non-left buttons are ignored (:5756)', () => {
    const { rows, dispose } = setup();
    mouse(rows[0]!, 'mousedown', 10, 2);
    mouse(document.body, 'mouseup', 10, 2);
    expect(toggled).toEqual([]);
    dispose();
  });

  it('auto-scrolls the wrap when the cursor nears its bottom edge and stops on release (:5642-5663)', async () => {
    const { rows, wrap, dispose } = setup();
    const rect = { top: 0, bottom: 100, height: 100 } as DOMRect;
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue(rect);
    Object.defineProperty(wrap, 'scrollTop', { configurable: true, get: () => (wrap as unknown as { __st?: number }).__st ?? 0, set: (v: number) => ((wrap as unknown as { __st?: number }).__st = v) });
    mouse(rows[0]!, 'mousedown', 10);
    mouse(document.body, 'mousemove', 20);
    mouse(document.body, 'mousemove', 95); // inside the 40px bottom edge
    await new Promise((resolve) => setTimeout(resolve, 40)); // let rAF ticks run
    expect((wrap as unknown as { __st?: number }).__st ?? 0).toBeGreaterThan(0);
    mouse(document.body, 'mouseup', 95);
    const frozen = (wrap as unknown as { __st?: number }).__st ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect((wrap as unknown as { __st?: number }).__st ?? 0).toBe(frozen);
    dispose();
  });
});
