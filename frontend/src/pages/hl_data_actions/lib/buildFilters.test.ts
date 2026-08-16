import { describe, expect, it } from 'vitest';
import {
  buildVisibleCoins,
  downloadVisibleCoins,
  isTradfiCoin,
  queueCoinsParam,
  sortPickerCoins,
} from './buildFilters';

/* The build-picker filter combination contract — the direct port of the
   assertions tests/ui/test_hl_data_actions_frontend.py extracted from the
   legacy getBuildVisibleCoins function. */

const COINS = ['BTC', 'ETH', 'xyz:AAPL', 'XYZ-MSFT'];

function state(overrides: Partial<Parameters<typeof buildVisibleCoins>[0]> = {}) {
  return {
    coins: COINS,
    coinsWithDownloadedHistory: new Set(['BTC', 'xyz:AAPL']),
    filter: '',
    tradfiOnly: false,
    noLocalData: false,
    ...overrides,
  };
}

describe('buildVisibleCoins (:1193-1202 — migrated pytest contract)', () => {
  it('returns all coins without toggles', () => {
    expect(buildVisibleCoins(state())).toEqual(COINS);
  });

  it('tradfi-only keeps XYZ coins regardless of separator case', () => {
    expect(buildVisibleCoins(state({ tradfiOnly: true }))).toEqual(['xyz:AAPL', 'XYZ-MSFT']);
  });

  it('tradfi-only + no-local-data compose', () => {
    expect(buildVisibleCoins(state({ tradfiOnly: true, noLocalData: true }))).toEqual(['XYZ-MSFT']);
  });

  it('no-local-data alone drops downloaded-history coins', () => {
    expect(buildVisibleCoins(state({ noLocalData: true }))).toEqual(['ETH', 'XYZ-MSFT']);
  });

  it('the text filter composes on top of both toggles', () => {
    expect(buildVisibleCoins(state({ noLocalData: true, filter: 'msft' }))).toEqual(['XYZ-MSFT']);
  });
});

describe('isTradfiCoin (:1196-1197)', () => {
  it('matches XYZ: and XYZ- prefixes case-insensitively', () => {
    expect(isTradfiCoin('XYZ:TSLA')).toBe(true);
    expect(isTradfiCoin('xyz-msft')).toBe(true);
    expect(isTradfiCoin('BTC')).toBe(false);
    expect(isTradfiCoin('')).toBe(false);
  });
});

describe('downloadVisibleCoins (:1102-1107)', () => {
  it('applies the case-insensitive text filter only', () => {
    expect(downloadVisibleCoins(['BTC', 'ETH'], 'b')).toEqual(['BTC']);
    expect(downloadVisibleCoins(['BTC'], '')).toEqual(['BTC']);
  });
});

describe('sortPickerCoins (:1164-1169)', () => {
  it('orders selected first, then locale order', () => {
    expect(sortPickerCoins(['BTC', 'ETH', 'SOL'], new Set(['SOL']))).toEqual(['SOL', 'BTC', 'ETH']);
  });
});

describe('queueCoinsParam (:1562, :1579)', () => {
  it('maps empty and full selections to All', () => {
    expect(queueCoinsParam(new Set(), COINS)).toEqual(['All']);
    expect(queueCoinsParam(new Set(COINS), COINS)).toEqual(['All']);
  });

  it('passes explicit selections through', () => {
    expect(queueCoinsParam(new Set(['BTC', 'ETH']), COINS)).toEqual(['BTC', 'ETH']);
  });
});
