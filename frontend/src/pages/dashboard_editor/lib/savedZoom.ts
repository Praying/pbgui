/**
 * Per-cell zoom memory — the Vue replacement for the legacy zoom hand-off:
 *
 *  - the editor's build* fast-path captures the current x/y ranges from the
 *    existing plot's `gd.layout` before each Plotly.react and hands them back
 *    as savedZoom (dashboard_render.js:1696-1709 PNL, 1980-1993 PPL,
 *    3974-3987 ADG); the TOP widget never preserves zoom (buildTop's fast
 *    path passes no savedZoom, render.js:700-703).
 *  - the PPL fragment stores a one-shot fractional zoom before a sum-period
 *    switch so the remap survives the bar-count change
 *    (dashboard_ppl.html:108-116 `_getFracZoom`, render.js:1901-1912).
 *
 * A module-level map keyed by `row_col` survives the D-editor-2 epoch
 * remounts (the blessed cell-level rebuild) the way the legacy DOM did —
 * and, unlike legacy, it also survives layout rebuilds.
 */

export interface SavedZoom {
  xrange: [number, number] | null;
  yrange: [number, number] | null;
  /** One-shot PPL fractional range [lo/n, hi/n] — consumed by one render. */
  fracRange?: [number, number];
}

export interface FracZoom {
  fracRange: [number, number];
  yrange: [number, number] | null;
}

const zoomByPos = new Map<string, SavedZoom>();

export function getSavedZoom(pos: string): SavedZoom | null {
  return zoomByPos.get(pos) ?? null;
}

export function setSavedZoom(pos: string, zoom: SavedZoom | null): void {
  if (zoom === null) zoomByPos.delete(pos);
  else zoomByPos.set(pos, zoom);
}

export function clearSavedZoom(pos: string): void {
  zoomByPos.delete(pos);
}

/**
 * Plain capture (editor fast-path + plotly_relayout listener): overwrite the
 * x/y ranges but keep a pending one-shot fracRange so the next PPL render
 * still remaps (dashboard_ppl.html captures frac zoom, then load() rebuilds —
 * the plain capture that happens pre-render must not clobber it).
 */
export function savePlainZoom(
  pos: string,
  captured: { xrange: [number, number] | null; yrange: [number, number] | null }
): void {
  const prev = zoomByPos.get(pos);
  zoomByPos.set(pos, {
    xrange: captured.xrange,
    yrange: captured.yrange,
    ...(prev?.fracRange ? { fracRange: prev.fracRange } : {}),
  });
}

/** One-shot fractional capture (dashboard_ppl.html:108-116 `_getFracZoom`). */
export function saveFracZoom(pos: string, zoom: FracZoom | null): void {
  if (zoom === null) {
    zoomByPos.delete(pos);
    return;
  }
  zoomByPos.set(pos, {
    xrange: null,
    yrange: zoom.yrange,
    fracRange: zoom.fracRange,
  });
}

/** Consume the one-shot fracRange after the render that applied it. */
export function dropFracRange(pos: string): void {
  const prev = zoomByPos.get(pos);
  if (!prev || prev.fracRange === undefined) return;
  if (prev.xrange === null && prev.yrange === null) {
    zoomByPos.delete(pos);
    return;
  }
  zoomByPos.set(pos, { xrange: prev.xrange, yrange: prev.yrange });
}

/** Tests only: detach the map (legacy _buildGen-style module state). */
export function resetSavedZoom(): void {
  zoomByPos.clear();
}
