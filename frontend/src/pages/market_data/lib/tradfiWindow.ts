/*
 * Specs-floating-window geometry — legacy initTradfiSpecsWindow
 * (market_data_main.html:5963-6110), extracted as pure functions so the
 * drag clamp (:5999-6006), the 8-direction resize math (:6042-6081) and the
 * viewport-reclamp (:6104-6108) are unit-testable. The component
 * (SpecsFloatingWindow.vue) owns listeners and translates pointer deltas.
 */

/** Legacy left/right margin (:6000). */
export const WINDOW_MARGIN = 8;
/** Legacy top clamp — the topnav band (:6001, :6069). */
export const WINDOW_TOP_MIN = 56;
/** Legacy minimum width fallback (:6032 / CSS min-width :2456). */
export const WINDOW_MIN_WIDTH = 520;
/** Legacy minimum height fallback (:6033 / CSS min-height :2457). */
export const WINDOW_MIN_HEIGHT = 320;
/** Legacy mobile breakpoint (:5981, :6020, :6095). */
export const WINDOW_MOBILE_MAX_WIDTH = 700;

/** The 8 resize handles (:3150-3157 data-dir values). */
export type ResizeDirection = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se';

export const RESIZE_DIRECTIONS: readonly ResizeDirection[] = [
  'n',
  's',
  'w',
  'e',
  'nw',
  'ne',
  'sw',
  'se',
];

export interface WindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Legacy innerWidth <= 700 guard (:5981, :6020, :6095). */
export function isMobileViewport(viewport: Viewport): boolean {
  return viewport.width <= WINDOW_MOBILE_MAX_WIDTH;
}

/** Legacy drag clamp (:6000-6005). Pure — returns the clamped position. */
export function clampDragPosition(
  box: { left: number; top: number },
  width: number,
  height: number,
  viewport: Viewport
): { left: number; top: number } {
  const maxLeft = Math.max(WINDOW_MARGIN, viewport.width - width - WINDOW_MARGIN);
  const maxTop = Math.max(WINDOW_TOP_MIN, viewport.height - height - WINDOW_MARGIN);
  const nextLeft = Math.min(Math.max(WINDOW_MARGIN, box.left), maxLeft);
  const nextTop = Math.min(Math.max(WINDOW_TOP_MIN, box.top), maxTop);
  return { left: nextLeft, top: nextTop };
}

/**
 * Legacy resize math (:6042-6081). `start` is the rect at mouse-down,
 * `delta` the pointer displacement. Keeps the min-size re-clamp (:6075-6076)
 * which can legally push past the viewport edge (legacy did too).
 */
export function resizeRect(
  direction: string,
  start: WindowRect,
  delta: { dx: number; dy: number },
  viewport: Viewport,
  min: { width: number; height: number } = { width: WINDOW_MIN_WIDTH, height: WINDOW_MIN_HEIGHT }
): WindowRect {
  const { dx, dy } = delta;
  let nextLeft = start.left;
  let nextTop = start.top;
  let nextWidth = start.width;
  let nextHeight = start.height;

  if (direction === 'e' || direction === 'ne' || direction === 'se') {
    nextWidth = Math.max(min.width, start.width + dx);
    nextWidth = Math.min(nextWidth, viewport.width - start.left - WINDOW_MARGIN);
  }
  if (direction === 'w' || direction === 'nw' || direction === 'sw') {
    nextWidth = Math.max(min.width, start.width - dx);
    nextLeft = start.left + (start.width - nextWidth);
    if (nextLeft < WINDOW_MARGIN) {
      nextLeft = WINDOW_MARGIN;
      nextWidth = start.left + start.width - nextLeft;
    }
  }
  if (direction === 's' || direction === 'se' || direction === 'sw') {
    nextHeight = Math.max(min.height, start.height + dy);
    nextHeight = Math.min(nextHeight, viewport.height - start.top - WINDOW_MARGIN);
  }
  if (direction === 'n' || direction === 'ne' || direction === 'nw') {
    nextHeight = Math.max(min.height, start.height - dy);
    nextTop = start.top + (start.height - nextHeight);
    if (nextTop < WINDOW_TOP_MIN) {
      nextTop = WINDOW_TOP_MIN;
      nextHeight = start.top + start.height - nextTop;
    }
  }

  nextWidth = Math.max(min.width, nextWidth);
  nextHeight = Math.max(min.height, nextHeight);
  return { left: nextLeft, top: nextTop, width: nextWidth, height: nextHeight };
}

/** Legacy viewport-reclamp (:6104-6108) — pulls back only the violated axes. */
export function clampRectToViewport(rect: WindowRect, viewport: Viewport): WindowRect {
  const maxLeft = Math.max(WINDOW_MARGIN, viewport.width - rect.width - WINDOW_MARGIN);
  const maxTop = Math.max(WINDOW_TOP_MIN, viewport.height - rect.height - WINDOW_MARGIN);
  return {
    ...rect,
    left: rect.left > maxLeft ? maxLeft : rect.left,
    top: rect.top > maxTop ? maxTop : rect.top,
  };
}
