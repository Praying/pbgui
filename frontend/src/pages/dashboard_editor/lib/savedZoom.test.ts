import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSavedZoom,
  dropFracRange,
  getSavedZoom,
  resetSavedZoom,
  saveFracZoom,
  savePlainZoom,
  setSavedZoom,
} from './savedZoom';

/*
 * The zoom memory is the Vue replacement for the legacy per-rebuild zoom
 * hand-off: the editor's build* fast-path reads `_fc.layout` before each
 * Plotly.react (dashboard_render.js:1696-1709, 1980-1993, 3974-3987) and the
 * PPL fragment's one-shot `_savedZoom = _getFracZoom()` (dashboard_ppl.html).
 * A module-level map keyed by cell pos survives the D-2 epoch remounts that
 * the legacy container rebuilds did not.
 */

describe('savedZoom memory', () => {
  beforeEach(() => {
    resetSavedZoom();
  });

  it('returns null for unknown positions', () => {
    expect(getSavedZoom('1_2')).toBeNull();
  });

  it('stores and retrieves a zoom by cell position', () => {
    setSavedZoom('1_2', { xrange: [1, 2], yrange: [3, 4] });
    expect(getSavedZoom('1_2')).toEqual({ xrange: [1, 2], yrange: [3, 4] });
    expect(getSavedZoom('2_1')).toBeNull();
  });

  it('clears a single position without touching others', () => {
    setSavedZoom('1_1', { xrange: [1, 2], yrange: null });
    setSavedZoom('1_2', { xrange: [3, 4], yrange: null });
    clearSavedZoom('1_1');
    expect(getSavedZoom('1_1')).toBeNull();
    expect(getSavedZoom('1_2')).not.toBeNull();
  });

  it('removes a position when set to null (legacy empty-data rebuild wipes zoom)', () => {
    setSavedZoom('1_2', { xrange: [1, 2], yrange: null });
    setSavedZoom('1_2', null);
    expect(getSavedZoom('1_2')).toBeNull();
  });

  it('resets every position (test isolation)', () => {
    setSavedZoom('1_1', { xrange: [1, 2], yrange: null });
    resetSavedZoom();
    expect(getSavedZoom('1_1')).toBeNull();
  });
});

describe('plain capture (editor fast-path, render.js:1698-1705)', () => {
  beforeEach(() => {
    resetSavedZoom();
  });

  it('overwrites x/y ranges but preserves a pending fracRange (one-shot PPL remap)', () => {
    saveFracZoom('1_2', { fracRange: [0.1, 0.9], yrange: [5, 6] });
    savePlainZoom('1_2', { xrange: [1, 2], yrange: [3, 4] });
    expect(getSavedZoom('1_2')).toEqual({
      xrange: [1, 2], yrange: [3, 4], fracRange: [0.1, 0.9],
    });
  });

  it('stores null ranges as null (autorange true → no zoom)', () => {
    savePlainZoom('1_2', { xrange: null, yrange: null });
    expect(getSavedZoom('1_2')).toEqual({ xrange: null, yrange: null });
  });
});

describe('frac capture (dashboard_ppl.html _getFracZoom one-shot)', () => {
  beforeEach(() => {
    resetSavedZoom();
  });

  it('stores a fracRange with preferFrac semantics via the fracRange key', () => {
    saveFracZoom('1_2', { fracRange: [0.25, 0.75], yrange: [7, 8] });
    expect(getSavedZoom('1_2')).toEqual({
      xrange: null, yrange: [7, 8], fracRange: [0.25, 0.75],
    });
  });

  it('drops the fracRange after it has been consumed by one render', () => {
    saveFracZoom('1_2', { fracRange: [0.25, 0.75], yrange: [7, 8] });
    savePlainZoom('1_2', { xrange: [2, 3], yrange: [8, 9] }); // pre-render capture keeps it
    dropFracRange('1_2'); // wrapper consumes it after the frac render
    expect(getSavedZoom('1_2')).toEqual({ xrange: [2, 3], yrange: [8, 9] });
  });
});
