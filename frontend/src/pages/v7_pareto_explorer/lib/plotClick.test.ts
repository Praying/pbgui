import { describe, expect, it } from 'vitest';
import { extractPlotConfigIndex, type PlotlyPoint } from './plotClick';

/*
 * bindPlotClick's config-index extraction (:2781-2824): the first point that
 * yields a finite index wins; every carrier Plotly uses is accepted.
 */

describe('extractPlotConfigIndex (:2781-2824)', () => {
  it('reads a numeric customdata array', () => {
    const points: PlotlyPoint[] = [{ customdata: [17] }];
    expect(extractPlotConfigIndex(points, null)).toBe(17);
  });

  it('reads customdata.config_index objects', () => {
    const points: PlotlyPoint[] = [{ customdata: { config_index: 3 } }];
    expect(extractPlotConfigIndex(points, null)).toBe(3);
  });

  it('reads trace meta.config_index', () => {
    const points: PlotlyPoint[] = [{ data: { meta: { config_index: 5 } } }];
    expect(extractPlotConfigIndex(points, null)).toBe(5);
  });

  it('reads fullData.meta as a fallback when data carries none', () => {
    const points: PlotlyPoint[] = [{ data: { meta: {} }, fullData: { meta: { config_index: 9 } } }];
    expect(extractPlotConfigIndex(points, null)).toBe(9);
  });

  it('parses the Config #N trace name', () => {
    const points: PlotlyPoint[] = [{ data: { name: 'Config #42' } }];
    expect(extractPlotConfigIndex(points, null)).toBe(42);
  });

  it('maps a Best Match trace to the payload best-match index', () => {
    const points: PlotlyPoint[] = [{ data: { name: 'Best Match (weights)' } }];
    expect(extractPlotConfigIndex(points, 31)).toBe(31);
    expect(extractPlotConfigIndex(points, null)).toBeNull();
  });

  it('falls back to the raw x value', () => {
    const points: PlotlyPoint[] = [{ x: 8 }];
    expect(extractPlotConfigIndex(points, null)).toBe(8);
  });

  it('scans every point until one yields an index', () => {
    const points: PlotlyPoint[] = [{ x: null }, { data: { name: 'Config 7' } }, { customdata: [99] }];
    expect(extractPlotConfigIndex(points, null)).toBe(7);
  });

  it('returns null when nothing parses', () => {
    expect(extractPlotConfigIndex([], null)).toBeNull();
    expect(extractPlotConfigIndex([{ x: null }], null)).toBeNull();
  });

  it('rejects non-finite parses (NaN config strings)', () => {
    expect(extractPlotConfigIndex([{ customdata: ['nan'] }], null)).toBeNull();
  });
});
