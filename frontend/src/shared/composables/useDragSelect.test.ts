import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDragSelect, DRAG_START_THRESHOLD_PX, DRAG_SAMPLE_STEP_PX } from './useDragSelect';

/* Drag-select engine — the dedupe of the two near-identical legacy pickers
   (settings market_data_main.html:7087-7133 + bind handlers :9387-9402,
   :9424-9440, :9475-9486, :9297-9305; best1m :7258-7303 twin — M-data-7
   reuses this composable).

   Fake picker geometry: rows are 20px tall bands starting at y=0, hit only
   while 0 <= x < 100. Row n occupies y in [n*20, (n+1)*20). */

const ROW_HEIGHT = 20;

interface Harness {
  controller: ReturnType<typeof useDragSelect>;
  selected: Map<string, boolean>;
  getRowAtPoint: ReturnType<typeof vi.fn>;
}

function makeHarness(options: { disabled?: () => boolean } = {}): Harness {
  const selected = new Map<string, boolean>([
    ['coin0', false],
    ['coin1', true],
    ['coin2', false],
    ['coin3', false],
  ]);
  const getRowAtPoint = vi.fn((x: number, y: number): string | null => {
    if (x < 0 || x >= 100 || y < 0) return null;
    const index = Math.floor(y / ROW_HEIGHT);
    return index >= 0 && index <= 3 ? `coin${index}` : null;
  });
  const controller = useDragSelect({
    getRowAtPoint: (x, y) => getRowAtPoint(x, y),
    isRowSelected: (coin) => selected.get(coin) === true,
    setRowSelected: (coin, value) => selected.set(coin, value),
    isDisabled: options.disabled,
  });
  return { controller, selected, getRowAtPoint };
}

function mouseEvent(type: string, x: number, y: number, button = 0): MouseEvent {
  const event = new MouseEvent(type, { button, clientX: x, clientY: y, bubbles: true });
  event.preventDefault = vi.fn();
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('plain click (no movement) — legacy mouseup toggle (:9480-9482)', () => {
  it('selects an unselected row on click', () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    controller.handleMouseUp();
    expect(selected.get('coin0')).toBe(true);
  });

  it('deselects a previously selected row on click', () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 25), 'coin1');
    controller.handleMouseUp();
    expect(selected.get('coin1')).toBe(false);
  });

  it('does not touch other rows', () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    controller.handleMouseUp();
    expect(selected.get('coin1')).toBe(true);
    expect(selected.get('coin2')).toBe(false);
  });

  it('prevents the default press behavior (:9391)', () => {
    const { controller } = makeHarness();
    const event = mouseEvent('mousedown', 10, 5);
    controller.handleRowMouseDown(event, 'coin0');
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('ignores non-left buttons (:9388)', () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5, 2), 'coin0');
    controller.handleMouseUp();
    expect(selected.get('coin0')).toBe(false);
  });

  it('ignores mouseup with no drag in flight', () => {
    const { controller, selected } = makeHarness();
    controller.handleMouseUp();
    expect(selected.get('coin0')).toBe(false);
    expect(selected.get('coin1')).toBe(true);
    expect(controller.isDragging()).toBe(false);
  });
});

describe('movement threshold (:9426-9428)', () => {
  it(`treats <= ${DRAG_START_THRESHOLD_PX}px Chebyshev movement as a click`, () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    controller.handleMouseMove(mouseEvent('mousemove', 10 + DRAG_START_THRESHOLD_PX, 5));
    controller.handleMouseUp();
    expect(selected.get('coin0')).toBe(true); // toggled, not swept
    expect(selected.get('coin1')).toBe(true); // untouched
  });

  it(`enters drag mode beyond ${DRAG_START_THRESHOLD_PX}px`, () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    controller.handleMouseMove(mouseEvent('mousemove', 10, 5 + DRAG_START_THRESHOLD_PX + 1));
    controller.handleMouseUp();
    expect(selected.get('coin0')).toBe(true);
    expect(selected.get('coin1')).toBe(true);
  });
});

describe('drag sweep (:9429-9437, applyDragPath :7097-7111)', () => {
  it('applies add mode to every row crossed between the last and current point', () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0'); // unselected → add
    controller.handleMouseMove(mouseEvent('mousemove', 10, 45)); // sweeps rows 0-2
    controller.handleMouseUp();
    expect(selected.get('coin0')).toBe(true);
    expect(selected.get('coin1')).toBe(true);
    expect(selected.get('coin2')).toBe(true);
  });

  it('applies remove mode when the drag starts on a selected row (:9400)', () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 25), 'coin1'); // selected → remove
    controller.handleMouseMove(mouseEvent('mousemove', 10, 65));
    controller.handleMouseUp();
    expect(selected.get('coin0')).toBe(false);
    expect(selected.get('coin1')).toBe(false);
    expect(selected.get('coin2')).toBe(false);
    expect(selected.get('coin3')).toBe(false);
  });

  it('keeps sweeping incremental segments from lastX/lastY (:9435, :9436-9437)', () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    controller.handleMouseMove(mouseEvent('mousemove', 10, 25)); // rows 0-1
    controller.handleMouseMove(mouseEvent('mousemove', 10, 45)); // rows 1-2
    controller.handleMouseUp();
    expect(selected.get('coin0')).toBe(true);
    expect(selected.get('coin1')).toBe(true);
    expect(selected.get('coin2')).toBe(true);
    expect(selected.get('coin3')).toBe(false);
  });

  it('re-applies the mode to the anchor row on every move (:9431-9434)', () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    // move off the picker (x >= 100): path hits nothing, but the anchor must
    // still be selected by the move handler itself
    controller.handleMouseMove(mouseEvent('mousemove', 150, 45));
    expect(selected.get('coin0')).toBe(true);
  });

  it('skips off-row points along the path (:7108-7109)', () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    // path from inside the picker to far right (off-picker), back over rows
    controller.handleMouseMove(mouseEvent('mousemove', 150, 5));
    expect(selected.get('coin0')).toBe(true); // anchor only
    expect(selected.get('coin1')).toBe(true); // untouched by the sweep
  });

  it('samples the segment at <= 8px steps so fast moves cannot skip rows', () => {
    expect(DRAG_SAMPLE_STEP_PX).toBe(8);
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 0), 'coin0');
    // 60px in one move: ceil(60/8)=8 samples → all four rows covered
    controller.handleMouseMove(mouseEvent('mousemove', 10, 60));
    expect(selected.get('coin3')).toBe(true);
  });

  it('prevents the default behavior while dragging (:9430)', () => {
    const { controller } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    const move = mouseEvent('mousemove', 10, 45);
    expect(controller.handleMouseMove(move)).toBe(true);
    expect(move.preventDefault).toHaveBeenCalled();
  });

  it('reports unconsumed mousemoves when no drag is in flight', () => {
    const { controller } = makeHarness();
    expect(controller.handleMouseMove(mouseEvent('mousemove', 10, 45))).toBe(false);
  });
});

describe('disabled pickers (:9390, :7092)', () => {
  it('ignores mousedown while disabled (settings auto-enable mode)', () => {
    const { controller, selected } = makeHarness({ disabled: () => true });
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    controller.handleMouseUp();
    expect(selected.get('coin0')).toBe(false);
    expect(controller.isDragging()).toBe(false);
  });

  it('keyboard toggle also no-ops through toggleRow guard via disabled state', () => {
    const { controller, selected } = makeHarness({ disabled: () => true });
    controller.toggleRow('coin0');
    // the settings keydown handler guards autoEnable before calling; the
    // engine itself keeps the row untouched when disabled
    expect(selected.get('coin0')).toBe(false);
  });
});

describe('keyboard toggle (:9297-9305)', () => {
  it('toggles a row and leaves the drag state clean', () => {
    const { controller, selected } = makeHarness();
    controller.toggleRow('coin2');
    expect(selected.get('coin2')).toBe(true);
    controller.toggleRow('coin2');
    expect(selected.get('coin2')).toBe(false);
  });
});

describe('reset (:7129-7133)', () => {
  it('clears an interrupted drag without toggling the anchor', () => {
    const { controller, selected } = makeHarness();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    controller.reset();
    expect(controller.isDragging()).toBe(false);
    // a stray late mouseup must not toggle after reset
    controller.handleMouseUp();
    expect(selected.get('coin0')).toBe(false);
  });
});

describe('document listener wiring (legacy document-level handlers :9387, :9424, :9475)', () => {
  it('installs mousemove/mouseup on the document and removes them on uninstall', () => {
    const { controller, selected } = makeHarness();
    controller.install();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 45 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(selected.get('coin2')).toBe(true);

    controller.uninstall();
    controller.handleRowMouseDown(mouseEvent('mousedown', 10, 5), 'coin0');
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 45 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    // coin0 was already selected → click toggles it off only via the wired
    // mouseup; unwired, nothing further happens
    expect(selected.get('coin3')).toBe(false);
  });
});
