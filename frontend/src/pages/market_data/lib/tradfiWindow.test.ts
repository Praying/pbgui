import { describe, expect, it } from 'vitest';
import {
  RESIZE_DIRECTIONS,
  WINDOW_MARGIN,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_TOP_MIN,
  clampDragPosition,
  clampRectToViewport,
  isMobileViewport,
  resizeRect,
  type Viewport,
} from './tradfiWindow';

/* Specs-window geometry — legacy initTradfiSpecsWindow (:5963-6110): the
   drag clamp (:5999-6006), the 8-direction resize math (:6042-6081) and the
   viewport-reclamp handler (:6093-6109). Pure so the clamping edges are
   unit-testable (legacy could only be exercised by hand). */

const VIEWPORT: Viewport = { width: 1920, height: 1080 };

describe('legacy clamping constants (:6000-6001, :6032-6033)', () => {
  it('keeps the legacy margins and minimums', () => {
    expect(WINDOW_MARGIN).toBe(8);
    expect(WINDOW_TOP_MIN).toBe(56);
    expect(WINDOW_MIN_WIDTH).toBe(520);
    expect(WINDOW_MIN_HEIGHT).toBe(320);
    expect(RESIZE_DIRECTIONS).toEqual(['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']);
  });
});

describe('clampDragPosition (:6000-6005)', () => {
  it('keeps an in-bounds box untouched', () => {
    expect(clampDragPosition({ left: 100, top: 100 }, 600, 400, VIEWPORT)).toEqual({
      left: 100,
      top: 100,
    });
  });

  it('clamps left to the 8px margin (:6002)', () => {
    expect(clampDragPosition({ left: -50, top: 100 }, 600, 400, VIEWPORT).left).toBe(8);
  });

  it('clamps top to the 56px topnav band (:6003)', () => {
    expect(clampDragPosition({ left: 100, top: 10 }, 600, 400, VIEWPORT).top).toBe(56);
  });

  it('clamps the right/bottom edges to viewport - box - 8 (:6000-6001)', () => {
    const result = clampDragPosition({ left: 1800, top: 900 }, 600, 400, VIEWPORT);
    expect(result).toEqual({ left: 1920 - 600 - 8, top: 1080 - 400 - 8 });
  });

  it('prefers the margin floor when the viewport is smaller than the box (:6000-6001 max())', () => {
    const tiny: Viewport = { width: 400, height: 300 };
    const result = clampDragPosition({ left: 300, top: 200 }, 600, 400, tiny);
    expect(result).toEqual({ left: 8, top: 56 });
  });
});

describe('resizeRect (:6042-6081)', () => {
  const start = { left: 200, top: 200, width: 800, height: 500 };

  it('grows east and clamps to the viewport right edge (:6050-6052)', () => {
    expect(resizeRect('e', start, { dx: 100, dy: 0 }, VIEWPORT)).toEqual({
      left: 200,
      top: 200,
      width: 900,
      height: 500,
    });
    const clamped = resizeRect('e', start, { dx: 5000, dy: 0 }, VIEWPORT);
    expect(clamped.width).toBe(1920 - 200 - 8);
    expect(clamped.left).toBe(200);
  });

  it('shrinks/grows west and keeps the right edge anchored (:6054-6056)', () => {
    expect(resizeRect('w', start, { dx: 100, dy: 0 }, VIEWPORT)).toEqual({
      left: 300,
      top: 200,
      width: 700,
      height: 500,
    });
    expect(resizeRect('w', start, { dx: -100, dy: 0 }, VIEWPORT)).toEqual({
      left: 100,
      top: 200,
      width: 900,
      height: 500,
    });
  });

  it('pins west resize at the 8px left margin and eats the width (:6057-6060)', () => {
    // A sub-margin start rect (only reachable transiently) exercises the pin:
    const lowStart = { left: -100, top: 200, width: 540, height: 500 };
    const result = resizeRect('w', lowStart, { dx: 1000, dy: 0 }, VIEWPORT);
    expect(result.left).toBe(8);
    expect(result.width).toBe(WINDOW_MIN_WIDTH); // :6075 overrides the pin correction
  });

  it('grows south and clamps to the viewport bottom (:6062-6064)', () => {
    expect(resizeRect('s', start, { dx: 0, dy: 60 }, VIEWPORT)).toEqual({
      left: 200,
      top: 200,
      width: 800,
      height: 560,
    });
    expect(resizeRect('s', start, { dx: 0, dy: 5000 }, VIEWPORT).height).toBe(1080 - 200 - 8);
  });

  it('resizes north keeping the bottom anchored (:6066-6068)', () => {
    expect(resizeRect('n', start, { dx: 0, dy: 100 }, VIEWPORT)).toEqual({
      left: 200,
      top: 300,
      width: 800,
      height: 400,
    });
  });

  it('pins north resize at the 56px band (:6069-6072, re-clamped by :6076)', () => {
    const lowStart = { left: 200, top: -100, width: 800, height: 400 };
    const result = resizeRect('n', lowStart, { dx: 0, dy: 500 }, VIEWPORT);
    expect(result.top).toBe(56);
    expect(result.height).toBe(WINDOW_MIN_HEIGHT); // :6076 overrides the pin correction
  });

  it('combines both axes for corner handles (:6050-6073)', () => {
    expect(resizeRect('se', start, { dx: 50, dy: 50 }, VIEWPORT)).toEqual({
      left: 200,
      top: 200,
      width: 850,
      height: 550,
    });
    expect(resizeRect('nw', start, { dx: 50, dy: 50 }, VIEWPORT)).toEqual({
      left: 250,
      top: 250,
      width: 750,
      height: 450,
    });
  });

  it('enforces the minimum size (:6051/6055/6063/6067 + :6075-6076)', () => {
    const shrunk = resizeRect('se', start, { dx: -2000, dy: -2000 }, VIEWPORT);
    expect(shrunk.width).toBe(WINDOW_MIN_WIDTH);
    expect(shrunk.height).toBe(WINDOW_MIN_HEIGHT);
    const wMin = resizeRect('w', start, { dx: 2000, dy: 0 }, VIEWPORT);
    expect(wMin.width).toBe(WINDOW_MIN_WIDTH);
    expect(wMin.left).toBe(200 + 800 - wMin.width); // right edge anchored
  });

  it('returns the start rect unchanged for an unknown direction', () => {
    expect(resizeRect('x', start, { dx: 100, dy: 100 }, VIEWPORT)).toEqual(start);
  });
});

describe('clampRectToViewport (:6104-6108)', () => {
  it('pulls an off-viewport box back to the edges', () => {
    const result = clampRectToViewport(
      { left: 1800, top: 900, width: 600, height: 400 },
      VIEWPORT
    );
    expect(result).toEqual({
      left: 1920 - 600 - 8,
      top: 1080 - 400 - 8,
      width: 600,
      height: 400,
    });
  });

  it('leaves an in-bounds box untouched (:6107-6108 only when over)', () => {
    const rect = { left: 100, top: 100, width: 600, height: 400 };
    expect(clampRectToViewport(rect, VIEWPORT)).toEqual(rect);
  });

  it('keeps only the violated axis (:6107, :6108 are independent ifs)', () => {
    const result = clampRectToViewport(
      { left: 100, top: 900, width: 600, height: 400 },
      VIEWPORT
    );
    expect(result.left).toBe(100);
    expect(result.top).toBe(1080 - 400 - 8);
  });
});

describe('isMobileViewport (:5981, :6020, :6095 — innerWidth <= 700)', () => {
  it('matches the legacy 700px breakpoint', () => {
    expect(isMobileViewport({ width: 700, height: 900 })).toBe(true);
    expect(isMobileViewport({ width: 701, height: 900 })).toBe(false);
    expect(isMobileViewport({ width: 1920, height: 1080 })).toBe(false);
  });
});
