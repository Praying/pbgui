import { describe, expect, it } from 'vitest';
import { computeUpnl, useUpnlTracker } from './ordersUpnl';

/*
 * ordersUpnl — port of buildOrders' live uPnL header state machine
 * (dashboard_render.js:3686-3693 initial display, 3763-3813 the wrapped
 * updateCandle/updatePosition recompute). Pure math + a tiny reactive tracker.
 */

describe('computeUpnl (render.js:3770-3779)', () => {
  it('approximates long uPnL from entry, size and close', () => {
    expect(computeUpnl(100, 2, 'long', 110)).toBe(20);
  });

  it('inverts the diff for shorts', () => {
    expect(computeUpnl(100, 2, 'short', 90)).toBe(20);
    expect(computeUpnl(100, 2, 'short', 110)).toBe(-20);
  });

  it('uses the absolute size (legacy Math.abs)', () => {
    expect(computeUpnl(100, -2, 'long', 110)).toBe(20);
  });

  it('returns null when entry, size or close is missing (render.js:3772)', () => {
    expect(computeUpnl(0, 2, 'long', 110)).toBeNull();
    expect(computeUpnl(100, 0, 'long', 110)).toBeNull();
    expect(computeUpnl(100, 2, 'long', 0)).toBeNull();
  });
});

describe('useUpnlTracker', () => {
  it('shows the exact exchange uPnL from the payload (render.js:3688-3693)', () => {
    const t = useUpnlTracker();
    t.initFromPosition({ entry: 95, size: 2, upnl: 12.5, side: 'long' });
    expect(t.text.value).toBe('+12.50');
    expect(t.cls.value).toBe('dt-pos');
  });

  it('colors a negative exchange uPnL red', () => {
    const t = useUpnlTracker();
    t.initFromPosition({ entry: 95, size: 2, upnl: -3.25, side: 'long' });
    expect(t.text.value).toBe('-3.25');
    expect(t.cls.value).toBe('dt-neg');
  });

  it('shows nothing without a position or without an upnl field', () => {
    const t = useUpnlTracker();
    t.initFromPosition(null);
    expect(t.text.value).toBe('');
    const t2 = useUpnlTracker();
    t2.initFromPosition({ entry: 95, size: 2, side: 'long' });
    expect(t2.text.value).toBe('');
  });

  it('resets stale state when the next payload has no position (render.js:3763-3768 fresh _posState per build)', () => {
    const t = useUpnlTracker();
    t.initFromPosition({ entry: 100, size: 2, upnl: 5, side: 'long' });
    expect(t.text.value).toBe('+5.00');
    t.initFromPosition(null);
    expect(t.text.value).toBe('');
    t.onCandleUpdate(120);
    expect(t.text.value).toBe('');
  });

  it('recomputes from the latest close on every candle (render.js:3786-3792, 3770-3783)', () => {
    const t = useUpnlTracker();
    t.initFromPosition({ entry: 100, size: 2, side: 'long' });
    t.onCandleUpdate(110);
    expect(t.text.value).toBe('+20.00');
    expect(t.cls.value).toBe('dt-pos');
    t.onCandleUpdate(90);
    expect(t.text.value).toBe('-20.00');
    expect(t.cls.value).toBe('dt-neg');
  });

  it('clears the display when the recompute inputs vanish (render.js:3772-3774)', () => {
    const t = useUpnlTracker();
    t.initFromPosition({ entry: 100, size: 2, upnl: 5, side: 'long' });
    t.onCandleUpdate(0);
    expect(t.text.value).toBe('');
  });

  it('tracks the position from updatePosition and prefers its exact upnl (render.js:3793-3806)', () => {
    const t = useUpnlTracker();
    t.initFromPosition({ entry: 100, size: 2, side: 'long' });
    t.onPositionUpdate({ entry: 90, size: 3, upnl: -1.5, side: 'short' });
    expect(t.text.value).toBe('-1.50');
    expect(t.cls.value).toBe('dt-neg');
    /* the tracked state now drives the candle recompute */
    t.onCandleUpdate(95);
    expect(t.text.value).toBe('-15.00'); /* (90 - 95) * 3 */
  });

  it('keeps the previous display when an updatePosition lacks upnl (render.js:3801-3806)', () => {
    const t = useUpnlTracker();
    t.initFromPosition({ entry: 100, size: 2, upnl: 5, side: 'long' });
    t.onPositionUpdate({ entry: 110, size: 2, side: 'long' });
    expect(t.text.value).toBe('+5.00');
  });

  it('clears state and display on a null position (render.js:3807-3811)', () => {
    const t = useUpnlTracker();
    t.initFromPosition({ entry: 100, size: 2, upnl: 5, side: 'long' });
    t.onPositionUpdate(null);
    expect(t.text.value).toBe('');
    t.onCandleUpdate(120);
    expect(t.text.value).toBe('');
  });

  it('ignores zero-entry positions in updatePosition (render.js:3797, 3508)', () => {
    const t = useUpnlTracker();
    t.initFromPosition({ entry: 100, size: 2, upnl: 5, side: 'long' });
    t.onPositionUpdate({ entry: 0, size: 2, side: 'long' });
    expect(t.text.value).toBe('');
    t.onCandleUpdate(120);
    expect(t.text.value).toBe('');
  });
});
