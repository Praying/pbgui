import { describe, expect, it } from 'vitest';
import {
  customControlVisibility,
  filterCustomMetrics,
  isWeightedMetricName,
  preservedCustomMetrics,
  quickViewOptionsFor,
  resolveMetricOptions,
} from './metrics';

/*
 * Custom-metric plumbing — isWeightedMetricName (:2009-2012),
 * filterCustomMetrics (:2014-2028), setSelectOptions (:2030-2051), the quick
 * view option sets (:3332-3336), the custom-control visibility matrix
 * (:2064-2073) and preserveCurrentCustomMetrics (:2121-2131).
 */

describe('isWeightedMetricName (:2009-2012)', () => {
  it('flags _w_ anywhere, _w_usd/_w_btc tails and lone _w_ suffixes', () => {
    expect(isWeightedMetricName('adg_w_usd')).toBe(true);
    expect(isWeightedMetricName('adg_w_btc')).toBe(true);
    expect(isWeightedMetricName('total_w_gain')).toBe(true);
    expect(isWeightedMetricName('adg_w')).toBe(false); // no '_w_' substring — legacy :2009-2011
    expect(isWeightedMetricName('adg_usd')).toBe(false);
    expect(isWeightedMetricName('plain')).toBe(false);
    expect(isWeightedMetricName('')).toBe(false);
  });
});

describe('filterCustomMetrics (:2014-2028)', () => {
  const available = ['adg_usd', 'adg_w_usd', 'adg_btc', 'adg_w_btc', 'sharpe'];

  it('keeps only the active currency unless mixing is allowed', () => {
    const usd = filterCustomMetrics(available, { allowMixedCurrency: false, useBtc: false, allowMixedWeighted: true, useWeighted: true });
    expect(usd).toEqual(['adg_usd', 'adg_w_usd', 'sharpe']);
    const btc = filterCustomMetrics(available, { allowMixedCurrency: false, useBtc: true, allowMixedWeighted: true, useWeighted: true });
    expect(btc).toEqual(['adg_btc', 'adg_w_btc', 'sharpe']);
  });

  it('keeps only the active weighting unless mixing is allowed', () => {
    const weighted = filterCustomMetrics(available, { allowMixedCurrency: true, useBtc: false, allowMixedWeighted: false, useWeighted: true });
    expect(weighted).toEqual(['adg_w_usd', 'adg_w_btc']);
    const plain = filterCustomMetrics(available, { allowMixedCurrency: true, useBtc: false, allowMixedWeighted: false, useWeighted: false });
    expect(plain).toEqual(['adg_usd', 'adg_btc', 'sharpe']);
  });

  it('applies both filters together', () => {
    const both = filterCustomMetrics(available, { allowMixedCurrency: false, useBtc: false, allowMixedWeighted: false, useWeighted: true });
    expect(both).toEqual(['adg_w_usd']);
  });

  it('falls back to the full list when a filter empties it (:2027)', () => {
    const onlyUsdPlain = ['adg_usd'];
    const out = filterCustomMetrics(onlyUsdPlain, { allowMixedCurrency: false, useBtc: true, allowMixedWeighted: false, useWeighted: false });
    expect(out).toEqual(['adg_usd']);
  });

  it('tolerates junk input', () => {
    expect(filterCustomMetrics(null, { allowMixedCurrency: false, useBtc: false, allowMixedWeighted: false, useWeighted: true })).toEqual([]);
  });
});

describe('resolveMetricOptions / setSelectOptions (:2030-2051)', () => {
  it('keeps the selected metric and unshifts it when the list lacks it', () => {
    const out = resolveMetricOptions(['a', 'b'], 'z', 'a');
    expect(out.options).toEqual(['z', 'a', 'b']);
    expect(out.value).toBe('z');
  });

  it('falls back to the payload metric, then the first option', () => {
    expect(resolveMetricOptions(['a', 'b'], '', 'b').value).toBe('b');
    expect(resolveMetricOptions(['a', 'b'], '', 'zzz').value).toBe('zzz'); // unshifted fallback becomes the first option (:2034-2038)
    expect(resolveMetricOptions([], '', '').value).toBe('');
  });

  it('does not duplicate entries already present', () => {
    const out = resolveMetricOptions(['a', 'b'], 'b', 'a');
    expect(out.options).toEqual(['a', 'b']);
    expect(out.value).toBe('b');
  });
});

describe('quickViewOptionsFor (:3332-3336)', () => {
  it('serves the per-visualization option sets with Custom... last', () => {
    expect(quickViewOptionsFor('2D Scatter')).toEqual([
      'Profit vs Risk',
      'Risk-Adjusted',
      'Profit vs Quality',
      'Efficiency',
      'Multi-Risk',
      'Profit vs Recovery',
      'Performance Ratios',
      'Exposure Analysis',
      'Custom...',
    ]);
    expect(quickViewOptionsFor('Radar Chart')).toEqual(['Top Comparison', 'Risk Profile']);
    expect(quickViewOptionsFor('3D Scatter')).toContain('Custom...');
    expect(quickViewOptionsFor('3D Projections')[0]).toBe('Risk-Reward Triangle');
  });
});

describe('customControlVisibility (:2064-2073)', () => {
  it('hides the shared toggles for radar and the custom block unless Custom', () => {
    const custom2d = customControlVisibility('Custom...', '2D Scatter');
    expect(custom2d).toMatchObject({ isCustom: true, isRadar: false, is3d: false, showCustom: true, showFilters: true, showZ: false });

    const radar = customControlVisibility('Top Comparison', 'Radar Chart');
    expect(radar).toMatchObject({ isRadar: true, showCustom: false, showFilters: false, showZ: false });

    const preset3d = customControlVisibility('Profit vs Risk', '3D Scatter');
    expect(preset3d.showCustom).toBe(false);

    const custom3d = customControlVisibility('Custom...', '3D Projections');
    expect(custom3d.showZ).toBe(true);
    expect(custom3d.showCustom).toBe(true);
  });
});

describe('preservedCustomMetrics (:2121-2131)', () => {
  it('copies the current payload metrics when entering Custom', () => {
    expect(preservedCustomMetrics({ x_metric: 'adg', y_metric: 'sharpe', z_metric: 'adg_w' }, '3D Scatter')).toEqual({ x: 'adg', y: 'sharpe', z: 'adg_w' });
  });

  it('clears z for 2D visualizations and keeps it empty without payload metrics', () => {
    expect(preservedCustomMetrics({ x_metric: 'adg', y_metric: 'sharpe', z_metric: 'adg_w' }, '2D Scatter')).toEqual({ x: 'adg', y: 'sharpe', z: '' });
    expect(preservedCustomMetrics(null, '3D Scatter')).toEqual({ z: '' });
  });
});
