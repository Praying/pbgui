/**
 * Row click-toggle + drag range selection with wrap auto-scroll — the
 * port of the document-level selection blocks (:5731-5785) and
 * tickRowSelectAutoScroll (:5625-5663): click toggles one row, a >5px
 * drag applies add/remove ranges from the anchor, and the wrap scrolls
 * up to 22px per rAF tick inside its 40px edges.
 */

export const DRAG_THRESHOLD_PX = 5;
export const AUTOSCROLL_EDGE_PX = 40;
export const AUTOSCROLL_MAX_STEP_PX = 22;

interface RectLike {
  top: number;
  bottom: number;
}

/** rowIdxAtY (:5736-5740) — the last row whose top is at/above y. */
export function rowIdxAtY(rows: readonly HTMLElement[], y: number): number {
  let idx = 0;
  for (let i = 0; i < rows.length; i++) {
    if (y >= (rows[i]!.getBoundingClientRect() as RectLike).top) idx = i;
  }
  return idx;
}

export interface RowDragSelectOptions {
  /** The currently rendered body rows, in visual order. */
  getRows(): readonly HTMLElement[];
  /** The scrolling wrap that auto-scrolls (null → no autoscroll). */
  getWrap(): HTMLElement | null;
  /** Selection state of a row path (decides add vs remove mode). */
  isSelected(path: string): boolean;
  onToggle(path: string): void;
  onSelectRange(paths: string[], selected: boolean): void;
  raf?: (callback: () => void) => number;
  cancelRaf?: (handle: number) => void;
}

export interface RowDragSelect {
  onMouseDown(event: MouseEvent): void;
  onMouseMove(event: MouseEvent): void;
  onMouseUp(event: MouseEvent): void;
  dispose(): void;
}

export function useRowDragSelect(options: RowDragSelectOptions): RowDragSelect {
  const raf = options.raf ?? ((callback: () => void) => window.requestAnimationFrame(callback));
  const cancelRaf = options.cancelRaf ?? ((handle: number) => window.cancelAnimationFrame(handle));

  let dragStart: { row: HTMLElement; y: number } | null = null;
  let dragging = false;
  let mode: 'add' | 'remove' | null = null;

  const autoScroll: { frame: number; wrap: HTMLElement | null; y: number; apply: ((y: number) => void) | null } = {
    frame: 0,
    wrap: null,
    y: 0,
    apply: null,
  };

  function tick(): void {
    autoScroll.frame = 0;
    const wrap = autoScroll.wrap;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const y = autoScroll.y;
    let dy = 0;
    if (y < rect.top + AUTOSCROLL_EDGE_PX) {
      dy = -Math.ceil((rect.top + AUTOSCROLL_EDGE_PX - y) / AUTOSCROLL_EDGE_PX * AUTOSCROLL_MAX_STEP_PX);
    } else if (y > rect.bottom - AUTOSCROLL_EDGE_PX) {
      dy = Math.ceil((y - (rect.bottom - AUTOSCROLL_EDGE_PX)) / AUTOSCROLL_EDGE_PX * AUTOSCROLL_MAX_STEP_PX);
    }
    if (!dy) return;
    const before = wrap.scrollTop;
    wrap.scrollTop += dy;
    if (wrap.scrollTop !== before && typeof autoScroll.apply === 'function') {
      autoScroll.apply(y);
      autoScroll.frame = raf(tick);
    }
  }

  function startAutoScroll(wrap: HTMLElement | null, y: number, apply: (y: number) => void): void {
    if (!wrap) return;
    autoScroll.wrap = wrap;
    autoScroll.y = y;
    autoScroll.apply = apply;
    if (!autoScroll.frame) autoScroll.frame = raf(tick);
  }

  function stopAutoScroll(): void {
    if (autoScroll.frame) cancelRaf(autoScroll.frame);
    autoScroll.frame = 0;
    autoScroll.wrap = null;
    autoScroll.apply = null;
  }

  function applyRange(y: number): void {
    const rows = options.getRows();
    const anchor = rows.indexOf(dragStart?.row ?? document.createElement('tr'));
    if (anchor < 0) return;
    const current = rowIdxAtY(rows, y);
    const lo = Math.min(anchor, current);
    const hi = Math.max(anchor, current);
    const paths: string[] = [];
    const selected = mode === 'add';
    rows.forEach((row, i) => {
      if (i >= lo && i <= hi) {
        const path = row.dataset.path;
        if (path) paths.push(path);
        row.classList.toggle('selected', selected);
      }
    });
    options.onSelectRange(paths, selected);
  }

  function onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    const row = target?.closest('tr[data-path]') as HTMLElement | null;
    if (!row || target?.closest('.actions-cell')) return;
    // scope to THIS table's rows — the document-level listener must not
    // cross-fire when sibling panels (archive/legacy) render their own
    // tr[data-path] tables at the same time (:5877 vs :5936)
    if (!options.getRows().includes(row)) return;
    event.preventDefault(); // no text-selection / drag cursor
    dragStart = { row, y: event.clientY };
    dragging = false;
    mode = null;
  }

  function onMouseMove(event: MouseEvent): void {
    if (!dragStart) return;
    if (!dragging && Math.abs(event.clientY - dragStart.y) > DRAG_THRESHOLD_PX) {
      dragging = true;
      mode = options.isSelected(dragStart.row.dataset.path ?? '') ? 'remove' : 'add';
    }
    if (dragging) {
      event.preventDefault();
      applyRange(event.clientY);
      startAutoScroll(options.getWrap(), event.clientY, applyRange);
    }
  }

  function onMouseUp(): void {
    if (dragStart && !dragging) {
      const path = dragStart.row.dataset.path;
      if (path) options.onToggle(path);
    }
    dragStart = null;
    dragging = false;
    mode = null;
    stopAutoScroll();
  }

  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    dispose(): void {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      stopAutoScroll();
    },
  };
}
