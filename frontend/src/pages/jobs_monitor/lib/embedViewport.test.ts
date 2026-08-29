import { describe, expect, it } from 'vitest';
import { calculateEmbeddedVisibleRegion } from './embedViewport';

describe('calculateEmbeddedVisibleRegion', () => {
  it('maps the parent viewport intersection into iframe coordinates', () => {
    expect(
      calculateEmbeddedVisibleRegion(
        { top: -420, bottom: 1580, height: 2000 },
        900,
        [],
      ),
    ).toEqual({ top: 420, height: 900 });
  });

  it('intersects clipping ancestors before calculating local geometry', () => {
    expect(
      calculateEmbeddedVisibleRegion(
        { top: 100, bottom: 1300, height: 1200 },
        900,
        [{ top: 180, bottom: 720, height: 540 }],
      ),
    ).toEqual({ top: 80, height: 540 });
  });

  it('returns a safe viewport-sized fallback when the frame is offscreen', () => {
    expect(
      calculateEmbeddedVisibleRegion(
        { top: 1200, bottom: 2200, height: 1000 },
        800,
        [],
      ),
    ).toEqual({ top: 0, height: 800 });
  });
});
