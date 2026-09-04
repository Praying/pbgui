import { describe, expect, it } from 'vitest';
import {
  clampExecutionSync,
  collectApprovedCoinsValue,
  createEmptyFormState,
  executionSyncBounds,
  forcedModeConfigValue,
  forcedModeSelectValue,
  getCoinSelectionValue,
  getOptionalNum,
  intVal,
  numVal,
  seededCoinsFromSelection,
} from './formModel';

/*
 * Pure field-io helpers — ports of v7_edit.html:2140-2175 (coin selection),
 * :2311-2324 (forced-mode mapping), :2580-2617 (getVal/getNum/getInt/
 * getOptionalNum/setChk semantics) and :1646-1675 (max-cancel/create bounds).
 */

describe('numVal / intVal / getOptionalNum (:2609-2616)', () => {
  it('numVal mirrors parseFloat() || 0', () => {
    expect(numVal('2.5')).toBe(2.5);
    expect(numVal('')).toBe(0);
    expect(numVal('abc')).toBe(0);
    expect(numVal('-3')).toBe(-3);
  });

  it('intVal mirrors parseInt(x, 10) || 0', () => {
    expect(intVal('42')).toBe(42);
    expect(intVal('7.9')).toBe(7);
    expect(intVal('')).toBe(0);
    expect(intVal('nope')).toBe(0);
  });

  it('getOptionalNum returns null only for blank/unparseable input', () => {
    expect(getOptionalNum('')).toBeNull();
    expect(getOptionalNum('   ')).toBeNull();
    expect(getOptionalNum('5')).toBe(5);
    expect(getOptionalNum('x')).toBeNull();
  });
});

describe('forcedModeSelectValue (:2311-2324)', () => {
  it('v7 maps long names onto the short option codes', () => {
    expect(forcedModeSelectValue('normal', false)).toBe('n');
    expect(forcedModeSelectValue('manual', false)).toBe('m');
    expect(forcedModeSelectValue('graceful_stop', false)).toBe('gs');
    expect(forcedModeSelectValue('graceful-stop', false)).toBe('gs');
    expect(forcedModeSelectValue('panic', false)).toBe('p');
    expect(forcedModeSelectValue('tp_only', false)).toBe('t');
    expect(forcedModeSelectValue('take_profit_only', false)).toBe('t');
    expect(forcedModeSelectValue(' N ', false)).toBe('n');
  });

  it('v7 passes unknown values through as-is', () => {
    expect(forcedModeSelectValue('weird', false)).toBe('weird');
    expect(forcedModeSelectValue(null, false)).toBe('');
  });

  it('v8 keeps the full names', () => {
    expect(forcedModeSelectValue('graceful_stop', true)).toBe('graceful_stop');
    expect(forcedModeSelectValue('N', true)).toBe('n');
  });
});

describe('forcedModeConfigValue', () => {
  it('keeps PB7 short forced-mode values', () => {
    expect(forcedModeConfigValue('n', false)).toBe('n');
    expect(forcedModeConfigValue('gs', false)).toBe('gs');
  });

  it('converts PB8 select aliases to runtime values', () => {
    expect(forcedModeConfigValue('n', true)).toBe('');
    expect(forcedModeConfigValue('m', true)).toBe('manual');
    expect(forcedModeConfigValue('gs', true)).toBe('graceful_stop');
    expect(forcedModeConfigValue('p', true)).toBe('panic');
    expect(forcedModeConfigValue('t', true)).toBe('tp_only');
  });
});

describe('getCoinSelectionValue (:2144-2153)', () => {
  it('reads canonical all', () => {
    expect(getCoinSelectionValue('all', 'long', true)).toEqual(['all']);
  });

  it('reads flat arrays', () => {
    expect(getCoinSelectionValue(['BTC', 'ETH'], 'long', false)).toEqual(['BTC', 'ETH']);
  });

  it('reads per-side objects', () => {
    const raw = { long: ['BTC'], short: 'all' };
    expect(getCoinSelectionValue(raw, 'long', true)).toEqual(['BTC']);
    expect(getCoinSelectionValue(raw, 'short', true)).toEqual(['all']);
    expect(getCoinSelectionValue(raw, 'short', false)).toEqual([]);
  });

  it('returns empty for missing shapes', () => {
    expect(getCoinSelectionValue(undefined, 'long', true)).toEqual([]);
    expect(getCoinSelectionValue('BTCUSDT', 'long', true)).toEqual([]);
  });
});

describe('collectApprovedCoinsValue (:2165-2175)', () => {
  it('collapses to canonical all only when both sides are bare all', () => {
    expect(collectApprovedCoinsValue(['all'], ['all'])).toBe('all');
    // long mixes all with a coin → the coin is dropped, long stays canonical all
    expect(collectApprovedCoinsValue(['all', 'BTC'], ['all'])).toEqual({
      long: 'all',
      short: 'all',
    });
    expect(collectApprovedCoinsValue(['BTC'], [])).toEqual({ long: ['BTC'], short: [] });
  });

  it('strips the all marker from mixed selections', () => {
    expect(collectApprovedCoinsValue(['all', 'ETH'], ['BTC'])).toEqual({
      long: 'all',
      short: ['BTC'],
    });
    expect(collectApprovedCoinsValue(['ETH'], ['all', 'BTC'])).toEqual({
      long: ['ETH'],
      short: 'all',
    });
  });
});

describe('seededCoinsFromSelection (loadSymbolsAndTags :2085-2086)', () => {
  it('merges unique non-all coins sorted', () => {
    expect(seededCoinsFromSelection(['BTC', 'ETH'], [], ['XRP', 'BTC'], ['all'])).toEqual([
      'BTC',
      'ETH',
      'XRP',
    ]);
  });

  it('drops empty values', () => {
    expect(seededCoinsFromSelection([], [''], [], [])).toEqual([]);
  });
});

describe('execution sync bounds (:1646-1675)', () => {
  it('derives the dynamic min/max pair', () => {
    const state = createEmptyFormState();
    state.maxCancel = '5';
    state.maxCreate = '3';
    expect(executionSyncBounds(state)).toEqual({ cancelMin: 4, createMax: 4 });
  });

  it('clamps cancel up when it drops to or below create', () => {
    const state = createEmptyFormState();
    state.maxCancel = '3';
    state.maxCreate = '3';
    const next = clampExecutionSync(state, 'maxCancel');
    expect(next.maxCancel).toBe('4');
    expect(next.maxCreate).toBe('3');
  });

  it('clamps create down when it reaches cancel', () => {
    const state = createEmptyFormState();
    state.maxCancel = '5';
    state.maxCreate = '5';
    const next = clampExecutionSync(state, 'maxCreate');
    expect(next.maxCancel).toBe('5');
    expect(next.maxCreate).toBe('4');
  });

  it('clamps create to zero floor', () => {
    const state = createEmptyFormState();
    state.maxCancel = '0';
    state.maxCreate = '2';
    const next = clampExecutionSync(state, 'maxCreate');
    expect(next.maxCreate).toBe('0');
  });

  it('does not mutate the input state', () => {
    const state = createEmptyFormState();
    state.maxCancel = '3';
    state.maxCreate = '3';
    const snapshot = { ...state };
    clampExecutionSync(state, 'maxCancel');
    expect({ ...state }).toEqual(snapshot);
  });
});
