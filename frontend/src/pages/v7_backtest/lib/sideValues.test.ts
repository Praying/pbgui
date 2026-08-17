import { describe, expect, it } from 'vitest';
import { getHslValue, getSideValue, setSideValue } from './sideValues';

/*
 * Side-value + HSL adapter fns — the structural port of
 * backtest_editor_adapter.js:114-137: v8 reads/writes bot side
 * params under `side.risk.*` while v7 keeps them at the side root,
 * and HSL values live under `side.hsl.X` (v8) vs `side.hsl_X` (v7).
 * Recon M-v7-9 test focus: "HSL path remap per flavor".
 */

describe('getSideValue (:124-127)', () => {
  it('reads the side root on v7', () => {
    expect(getSideValue('v7', { total_wallet_exposure_limit: 1.5 }, 'total_wallet_exposure_limit', 0)).toBe(1.5);
  });

  it('reads side.risk.* on v8', () => {
    expect(getSideValue('v8', { risk: { n_positions: 7 } }, 'n_positions', 0)).toBe(7);
  });

  it('falls back when missing or null (both flavors)', () => {
    expect(getSideValue('v7', {}, 'n_positions', 3)).toBe(3);
    expect(getSideValue('v7', { n_positions: null }, 'n_positions', 3)).toBe(3);
    expect(getSideValue('v8', {}, 'n_positions', 3)).toBe(3);
    expect(getSideValue('v8', { risk: { n_positions: null } }, 'n_positions', 3)).toBe(3);
  });

  it('tolerates non-object side configs', () => {
    expect(getSideValue('v8', null, 'n_positions', 2)).toBe(2);
    expect(getSideValue('v7', [1, 2], 'n_positions', 2)).toBe(2);
  });
});

describe('setSideValue (:128-130)', () => {
  it('writes the side root on v7 without touching other keys', () => {
    const side = { total_wallet_exposure_limit: 1, untouched: 'x' };
    setSideValue('v7', side, 'total_wallet_exposure_limit', 2);
    expect(side).toEqual({ total_wallet_exposure_limit: 2, untouched: 'x' });
  });

  it('writes side.risk.* on v8, creating the risk object when missing', () => {
    const side: Record<string, unknown> = {};
    setSideValue('v8', side, 'n_positions', 5);
    expect(side).toEqual({ risk: { n_positions: 5 } });
  });

  it('merges into an existing risk object on v8', () => {
    const side = { risk: { total_wallet_exposure_limit: 1 } };
    setSideValue('v8', side, 'n_positions', 5);
    expect(side).toEqual({ risk: { total_wallet_exposure_limit: 1, n_positions: 5 } });
  });
});

describe('getHslValue (:131-137) — the HSL path remap', () => {
  it('reads side.hsl_X on v7 (flat hsl_ prefix)', () => {
    expect(getHslValue('v7', { hsl_ddown_factor: 0.4 }, 'ddown_factor', null)).toBe(0.4);
  });

  it('reads side.hsl.X on v8 (nested hsl object)', () => {
    expect(getHslValue('v8', { hsl: { ddown_factor: 0.4 } }, 'ddown_factor', null)).toBe(0.4);
  });

  it('falls back when the key is absent in the flavor path', () => {
    expect(getHslValue('v7', { hsl: { ddown_factor: 0.4 } }, 'ddown_factor', 0.9)).toBe(0.9);
    expect(getHslValue('v8', { hsl_ddown_factor: 0.4 }, 'ddown_factor', 0.9)).toBe(0.9);
  });

  it('falls back on null values and non-object side configs', () => {
    expect(getHslValue('v7', { hsl_ddown_factor: null }, 'ddown_factor', 1)).toBe(1);
    expect(getHslValue('v8', null, 'ddown_factor', 1)).toBe(1);
  });
});
