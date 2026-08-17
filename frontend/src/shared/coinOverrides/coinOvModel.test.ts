import { describe, expect, it } from 'vitest';
import {
  badgeSummary,
  cleanEmpty,
  defaultOverrideFilename,
  deleteDotted,
  describeOverrides,
  ensureNested,
  filterOverrideConfig,
  flattenForAllowed,
  flattenLeaves,
  getNested,
  normalizeCoin,
  normalizeOverridesForLoad,
  paramIsAllowed,
  parseParamValue,
  setDotted,
  unsupportedInlineParams,
} from './coinOvModel';

/*
 * Ports of the pure halves of frontend/js/coin_overrides_editor.js (1,733 L):
 * _covNormalizeCoin :599-621, the nested/flatten helpers :1634-1733,
 * _covBadge/_covDescribe/:1078-1102, _covDefaultOverrideFilename :1108-1118,
 * _covParseParamValue :1316-1340, coinOvLoad's normalization :541-595 and
 * _covFilterOverrideConfig :688-716. The legacy module is the spec.
 */

describe('normalizeCoin', () => {
  it('trims quote suffixes, powers-of-ten prefixes and k-prefixes (v7)', () => {
    expect(normalizeCoin('HYPEUSDT', false)).toBe('HYPE');
    expect(normalizeCoin('1000BONKUSDT', false)).toBe('BONK');
    expect(normalizeCoin('kSHIB', false)).toBe('SHIB');
    expect(normalizeCoin('BTCUSDC', false)).toBe('BTC');
  });

  it('keeps market identifiers verbatim (PB8 preserveMarketIdentifiers)', () => {
    expect(normalizeCoin('1000PEPEUSDT', true)).toBe('1000PEPEUSDT');
  });
});

describe('nested + flatten helpers', () => {
  it('reads, writes and deletes dotted paths', () => {
    const data: Record<string, unknown> = {};
    setDotted(data, 'bot.long.entry_initial_qty_pct', 0.1);
    expect(getNested(data, ['bot', 'long', 'entry_initial_qty_pct'])).toBe(0.1);
    deleteDotted(data, 'bot.long.entry_initial_qty_pct');
    expect(getNested(data, ['bot', 'long'])).toEqual({});
  });

  it('flattens leaves with dotted keys', () => {
    expect(flattenLeaves({ a: { b: 1 }, c: [1, 2], d: 'x' })).toEqual({
      'a.b': 1,
      c: [1, 2],
      d: 'x',
    });
  });

  it('flattenForAllowed keeps allowed paths and descends otherwise', () => {
    const allowed = { 'grid.initial': true, plain: true };
    expect(
      flattenForAllowed(
        {
          grid: { initial: 1, skipped: 2 },
          plain: 3,
          other: 4,
        },
        allowed
      )
    ).toEqual({ 'grid.initial': 1, 'grid.skipped': 2, plain: 3, other: 4 });
  });

  it('ensureNested creates the intermediate objects', () => {
    const data: Record<string, unknown> = {};
    expect(ensureNested(data, ['bot', 'long'])).toEqual({});
    expect(data).toEqual({ bot: { long: {} } });
  });
});

describe('cleanEmpty', () => {
  it('drops empty containers, keeping v7 top-level shapes explicit', () => {
    const data = {
      bot: { long: {}, short: { p: 1 } },
      live: {},
      extra: { nested: { empty: {} } },
    };
    cleanEmpty(data);
    expect(data).toEqual({ bot: { short: { p: 1 } } });
  });
});

describe('badge + describe summaries', () => {
  const data = {
    bot: { long: { a: 1, nested: { b: 2 } }, short: {} },
    live: { c: 3 },
    override_config_path: 'COIN.json',
  };

  it('badge counts per section + file marker', () => {
    expect(badgeSummary(data)).toBe('long 2 · live 1 · file');
    expect(badgeSummary({})).toBe('(empty)');
  });

  it('describe lists flattened parameter names', () => {
    expect(describeOverrides(data)).toBe('long: a, nested.b | live: c | file: COIN.json');
    expect(describeOverrides({})).toBe('(empty)');
  });
});

describe('defaultOverrideFilename', () => {
  it('uses the coin name for v7', () => {
    expect(defaultOverrideFilename('BTC', false)).toBe('BTC.json');
  });

  it('sanitizes + appends a stable fnv1a hash for PB8 market identifiers', () => {
    const name = defaultOverrideFilename('1000PEPE/USDT:USDT', true);
    expect(name).toMatch(/^[A-Za-z0-9._-]+-[0-9a-f]{8}\.json$/);
    expect(defaultOverrideFilename('1000PEPE/USDT:USDT', true)).toBe(name);
  });
});

describe('parseParamValue', () => {
  it('coerces per the runtime metadata type', () => {
    expect(parseParamValue('true', { type: 'boolean' }, 'k')).toBe(true);
    expect(parseParamValue('1.5', { type: 'number' }, 'k')).toBe(1.5);
    expect(parseParamValue('[1]', { type: 'array' }, 'k')).toEqual([1]);
    expect(parseParamValue('x', true, 'k')).toBe('x');
    expect(parseParamValue('2', true, 'k')).toBe(2); // numeric loose mode
  });

  it('applies defaults for blank input', () => {
    expect(parseParamValue('', { type: 'number', default: 4 }, 'k')).toBe(4);
    expect(parseParamValue('', undefined, 'leverage')).toBe(7);
  });

  it('forced modes fall back to normal and blank stays blank', () => {
    expect(parseParamValue('', undefined, 'forced_mode_long')).toBe('normal');
    expect(parseParamValue('panic', undefined, 'forced_mode_short')).toBe('panic');
  });

  it('throws for invalid booleans and numbers', () => {
    expect(() => parseParamValue('yes', { type: 'boolean' }, 'k')).toThrow('must be true or false');
    expect(() => parseParamValue('', { type: 'number' }, 'k')).toThrow('must be a number');
  });

  it('paramIsAllowed accepts true and metadata objects', () => {
    expect(paramIsAllowed(true)).toBe(true);
    expect(paramIsAllowed({ type: 'number' })).toBe(true);
    expect(paramIsAllowed(false)).toBe(false);
    expect(paramIsAllowed(undefined)).toBe(false);
  });
});

describe('normalizeOverridesForLoad', () => {
  it('normalizes coin keys and deep-copies values', () => {
    const overrides = normalizeOverridesForLoad({ BTCUSDT: { live: { leverage: 5 } } }, false);
    expect(overrides).toEqual({ BTC: { live: { leverage: 5 } } });
    overrides.BTC!.live = { leverage: 9 };
    // source untouched
    expect(normalizeOverridesForLoad({ BTCUSDT: { live: { leverage: 5 } } }, false).BTC).toEqual({
      live: { leverage: 5 },
    });
  });

  it('merges duplicate normalized entries (existing keys win, missing keys added)', () => {
    const overrides = normalizeOverridesForLoad(
      { BTCUSDT: { bot: { long: { a: 1 } } }, BTC: { bot: { short: { b: 2 } }, live: { c: 3 } } },
      false
    );
    expect(overrides.BTC).toEqual({ bot: { long: { a: 1 }, short: { b: 2 } }, live: { c: 3 } });
  });

  it('throws on duplicates when market identifiers must be preserved (PB8)', () => {
    expect(() => normalizeOverridesForLoad({ 'X/Y': {}, 'X/Y ': {} }, true)).toThrow(
      'Duplicate PB8 market identifier after trimming: X/Y'
    );
  });
});

describe('unsupportedInlineParams', () => {
  it('flags inline values the runtime does not accept', () => {
    const unsupported = unsupportedInlineParams(
      { bot: { long: { okay: 1, rogue: 2 } }, live: { rogue3: 3 } },
      { bot: { long: { okay: true } }, live: {} }
    );
    expect(unsupported).toEqual(['bot.long.rogue', 'live.rogue3']);
  });
});

describe('filterOverrideConfig', () => {
  it('keeps only allowed params per side and unwraps full configs', () => {
    const filtered = filterOverrideConfig(
      {
        bot: {
          long: { a: 1, junk: 2 },
          short: { bot: { short: { b: 3 } } }, // wrapped full-config shape
        },
      },
      { bot: { long: { a: true }, short: { b: true } } }
    );
    expect(filtered).toEqual({ bot: { long: { a: 1 }, short: { b: 3 } } });
  });

  it('returns the input unchanged when allowed params are unavailable', () => {
    const cfg = { bot: { long: { a: 1 } } };
    expect(filterOverrideConfig(cfg, null)).toBe(cfg);
  });
});
