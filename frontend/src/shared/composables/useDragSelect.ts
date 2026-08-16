/*
 * Drag-select engine — the dedupe of the three near-identical legacy pickers
 * (recon §2.1): the settings picker (market_data_main.html:7087-7133, bind
 * handlers :9387-9402 / :9424-9440 / :9475-9486 / keydown :9297-9305), its
 * best1m twin (:7258-7303, :9403-9416, :9441-9456, :9487-9496) and the
 * hl_data_actions coin grids (:835-921). Lives in shared/ since the
 * hl_data_actions migration — no page-local copies.
 *
 * Legacy semantics preserved:
 *   - mousedown on a row records the anchor and the mode from the row's
 *     current state (selected → remove, else add) (:9392-9401);
 *   - a Chebyshev movement of more than 5px enters sweep mode (:9426-9428);
 *   - each move re-applies the mode to the anchor (:9431-9434) and sweeps the
 *     segment from the last point, sampling every ≤8px via hit-testing
 *     (applySettingsCoinDragPath :7097-7111);
 *   - mouseup without a sweep toggles the anchor (:9480-9482);
 *   - Enter/Space toggles a row (:9297-9305).
 *
 * The engine is DOM-agnostic: the owning component supplies hit-testing and
 * selection accessors, so it drives reactive state instead of mutating DOM
 * classes and syncing them back at mouseup (:7113-7127). Selection updates
 * land in the store immediately — the visible mid-drag highlighting and the
 * final mouseup state are identical to legacy.
 */

/** Legacy sweep-mode threshold (:9426) — Chebyshev distance in px. */
export const DRAG_START_THRESHOLD_PX = 5;

/** Legacy path sampling step (:7101) — distance / 8, ceil, min 1. */
export const DRAG_SAMPLE_STEP_PX = 8;

interface DragStart {
  coin: string;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
}

type DragMode = 'add' | 'remove';

export interface UseDragSelectOptions {
  /** Resolve the row data value under a viewport point; null/'' off-row. */
  getRowAtPoint(x: number, y: number): string | null;
  /** Current selected state of a row (mousedown mode pick, mouseup toggle). */
  isRowSelected(coin: string): boolean;
  /** Apply a selection state to a row (live class-flip equivalent). */
  setRowSelected(coin: string, selected: boolean): void;
  /** Interactions disabled (settings auto-enable locks its picker, :9390). */
  isDisabled?(): boolean;
}

export interface DragSelectController {
  /** Row mousedown — legacy document handler's picker branch (:9388-9402). */
  handleRowMouseDown(event: MouseEvent, coin: string): void;
  /** Document mousemove — true when this picker consumed it (:9424-9440). */
  handleMouseMove(event: MouseEvent): boolean;
  /** Document mouseup (:9475-9486). */
  handleMouseUp(): void;
  /** Keyboard toggle (:9302-9304). */
  toggleRow(coin: string): void;
  /** resetDragSelection (:7129-7133). */
  reset(): void;
  /** Whether a press/drag is in flight. */
  isDragging(): boolean;
  /** Wire the document mousemove/mouseup listeners (:9424, :9475). */
  install(): void;
  /** Remove the document listeners (component unmount). */
  uninstall(): void;
}

export function useDragSelect(options: UseDragSelectOptions): DragSelectController {
  let dragStart: DragStart | null = null;
  let dragSelecting = false;
  let dragMode: DragMode | null = null;
  let installed = false;

  /** applyDragPath (:7097-7111) — sweep the segment, sampling every ≤8px. */
  function applyDragPath(fromX: number, fromY: number, toX: number, toY: number): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = Math.max(1, Math.ceil(distance / DRAG_SAMPLE_STEP_PX));
    for (let index = 0; index <= steps; index++) {
      // legacy ratio ternary `steps === 0 ? 1 : index / steps` is dead code —
      // steps is always >= 1 by the Math.max above
      const ratio = index / steps;
      const coin = options.getRowAtPoint(fromX + dx * ratio, fromY + dy * ratio);
      if (!coin) continue; // :7108-7109 — off-row samples skipped
      options.setRowSelected(coin, dragMode === 'add');
    }
  }

  function handleRowMouseDown(event: MouseEvent, coin: string): void {
    if (event.button !== 0) return; // :9388
    if (!coin || options.isDisabled?.()) return; // :9390
    event.preventDefault(); // :9391
    dragStart = {
      coin,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    }; // :9392-9398
    dragSelecting = false; // :9399
    dragMode = options.isRowSelected(coin) ? 'remove' : 'add'; // :9400
  }

  function handleMouseMove(event: MouseEvent): boolean {
    if (!dragStart) return false;
    const chebyshev = Math.max(
      Math.abs(event.clientX - dragStart.x),
      Math.abs(event.clientY - dragStart.y)
    );
    if (!dragSelecting && chebyshev > DRAG_START_THRESHOLD_PX) {
      dragSelecting = true; // :9426-9428
    }
    if (!dragSelecting) return true; // consumed: legacy returned after the branch
    event.preventDefault(); // :9430
    options.setRowSelected(dragStart.coin, dragMode === 'add'); // :9431-9434 anchor
    applyDragPath(dragStart.lastX, dragStart.lastY, event.clientX, event.clientY); // :9435
    dragStart = { ...dragStart, lastX: event.clientX, lastY: event.clientY }; // :9436-9437
    return true;
  }

  function handleMouseUp(): void {
    if (!dragStart) return;
    if (!dragSelecting) {
      // plain click — toggle the anchor (:9480-9482)
      options.setRowSelected(dragStart.coin, !options.isRowSelected(dragStart.coin));
    }
    reset(); // :9484 — legacy synced the DOM selection + dirty here; reactive
    // state already carries both, nothing left to sync
  }

  function toggleRow(coin: string): void {
    if (!coin || options.isDisabled?.()) return;
    options.setRowSelected(coin, !options.isRowSelected(coin));
  }

  function reset(): void {
    dragStart = null; // :7130-7132
    dragSelecting = false;
    dragMode = null;
  }

  function isDragging(): boolean {
    return dragStart !== null;
  }

  function onDocumentMouseMove(event: MouseEvent): void {
    handleMouseMove(event);
  }

  function onDocumentMouseUp(): void {
    handleMouseUp();
  }

  function install(): void {
    if (installed) return;
    installed = true;
    document.addEventListener('mousemove', onDocumentMouseMove);
    document.addEventListener('mouseup', onDocumentMouseUp);
  }

  function uninstall(): void {
    if (!installed) return;
    installed = false;
    document.removeEventListener('mousemove', onDocumentMouseMove);
    document.removeEventListener('mouseup', onDocumentMouseUp);
    reset();
  }

  return {
    handleRowMouseDown,
    handleMouseMove,
    handleMouseUp,
    toggleRow,
    reset,
    isDragging,
    install,
    uninstall,
  };
}
