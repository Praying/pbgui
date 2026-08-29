export interface RectLike {
  top: number;
  bottom: number;
  height: number;
}

export interface EmbeddedVisibleRegion {
  top: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Convert the parent's visible frame intersection into iframe-local pixels. */
export function calculateEmbeddedVisibleRegion(
  frameRect: RectLike,
  parentViewportHeight: number,
  clippingAncestorRects: readonly RectLike[],
): EmbeddedVisibleRegion {
  const frameHeight = Math.max(0, frameRect.height, frameRect.bottom - frameRect.top);
  let visibleTop = Math.max(0, frameRect.top);
  let visibleBottom = Math.min(parentViewportHeight, frameRect.bottom);

  for (const ancestorRect of clippingAncestorRects) {
    visibleTop = Math.max(visibleTop, ancestorRect.top);
    visibleBottom = Math.min(visibleBottom, ancestorRect.bottom);
  }

  if (visibleBottom <= visibleTop) {
    return { top: 0, height: Math.min(frameHeight, Math.max(0, parentViewportHeight)) };
  }

  const localTop = clamp(visibleTop - frameRect.top, 0, frameHeight);
  const localBottom = clamp(visibleBottom - frameRect.top, localTop, frameHeight);
  return { top: localTop, height: localBottom - localTop };
}
