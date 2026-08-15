import { describe, expect, it } from 'vitest';
import { mselPosition } from './mselPosition';

/* Port of makeUsersDropdown.positionDrop (dashboard_editor.html:720-736).
   The math is byte-for-byte the legacy inline computation, extracted so both
   the component and the tests share one definition. */

const BTN = { right: 100, bottom: 300, top: 270, width: 150 };
const WIN = { innerWidth: 1024, innerHeight: 768 };

describe('mselPosition (editor:720-736)', () => {
  it('opens below when there is enough room (below >= 180)', () => {
    const p = mselPosition({ btnRect: BTN, win: WIN, filterHeight: 26 });
    expect(p.openAbove).toBe(false);
    expect(p.top).toBe(300 + 3);
    expect(p.maxHeight).toBe(768 - 300 - 12);
    expect(p.listMaxHeight).toBe(768 - 300 - 12 - 26 - 8);
  });

  it('opens above when below < 180 and above > below', () => {
    const btn = { right: 100, bottom: 740, top: 100, width: 150 };
    const p = mselPosition({ btnRect: btn, win: WIN, filterHeight: 26 });
    expect(p.openAbove).toBe(true);
    /* above = 88 but the legacy max-height floor is 140 (Math.max(140, …)) */
    expect(p.maxHeight).toBe(140);
    expect(p.top).toBe(8); // max(8, 100-140-3)
  });

  it('stays below with a 140px floor when above is smaller', () => {
    /* above = 8, below = 16 → openAbove false; maxHeight floor 140 */
    const btn = { right: 100, bottom: 740, top: 20, width: 150 };
    const p = mselPosition({ btnRect: btn, win: WIN, filterHeight: 26 });
    expect(p.openAbove).toBe(false);
    expect(p.maxHeight).toBe(140); // max(140, below=16)
    expect(p.top).toBe(740 + 3);
  });

  it('enforces the 180px minimum width', () => {
    const p = mselPosition({ btnRect: { ...BTN, width: 100 }, win: WIN, filterHeight: 0 });
    expect(p.width).toBe(180);
  });

  it('keeps widths above 180', () => {
    const p = mselPosition({ btnRect: { ...BTN, width: 240 }, win: WIN, filterHeight: 0 });
    expect(p.width).toBe(240);
  });

  it('anchors left = rect.right - width, clamped to the 8px viewport edge', () => {
    /* right=100, width=180 → left would be -80 → clamp to 8 */
    const p = mselPosition({ btnRect: BTN, win: WIN, filterHeight: 0 });
    expect(p.left).toBe(8);
  });

  it('clamps left to the right viewport edge', () => {
    const btn = { right: 1020, bottom: 300, top: 270, width: 150 };
    const p = mselPosition({ btnRect: btn, win: WIN, filterHeight: 0 });
    /* left = 1020-180 = 840; max allowed = 1024-180-8 = 836 → clamped */
    expect(p.left).toBe(1024 - 180 - 8);
  });

  it('keeps the unclamped position mid-viewport', () => {
    const btn = { right: 500, bottom: 300, top: 270, width: 150 };
    const p = mselPosition({ btnRect: btn, win: WIN, filterHeight: 0 });
    expect(p.left).toBe(500 - 180);
  });

  it('floors the list height at 120 (small filter/space cases)', () => {
    /* above = 8, below = 16 → maxHeight floor 140; list = max(120, 140-26-8) */
    const btn = { right: 100, bottom: 740, top: 20, width: 150 };
    const p = mselPosition({ btnRect: btn, win: WIN, filterHeight: 26 });
    expect(p.listMaxHeight).toBe(120); // max(120, 140-26-8)
  });

  it('uses the full list room when maxHeight exceeds 120', () => {
    const p = mselPosition({ btnRect: BTN, win: WIN, filterHeight: 0 });
    expect(p.listMaxHeight).toBe(768 - 300 - 12 - 0 - 8);
  });
});
