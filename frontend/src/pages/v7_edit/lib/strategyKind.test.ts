import { describe, expect, it } from 'vitest';
import {
  applyStrategyKindChange,
  cacheStrategyBlocks,
  clearEditedRunStrategyDefaultMark,
  detectSideStrategy,
  getRunStrategyDefault,
} from './strategyKind';

/*
 * v8 strategy_kind plumbing — ports of getRunStrategyDefault/cacheRunStrategy
 * Blocks/selectRunStrategyConfig (:2190-2226), changeRunStrategyKind
 * (:2240-2276) and syncRunStrategyKindFromSideConfig (:2278-2294).
 */

const EDITOR_METADATA = {
  strategies: ['neat', 'recursive_mc'],
  strategy_defaults: {
    long: { recursive_mc: { default_long: 1 } },
    short: { recursive_mc: { default_short: 2 } },
  },
} as const;

describe('getRunStrategyDefault (:2190-2194)', () => {
  it('clones per-side defaults', () => {
    expect(getRunStrategyDefault('long', 'recursive_mc', EDITOR_METADATA)).toEqual({ default_long: 1 });
    expect(getRunStrategyDefault('short', 'recursive_mc', EDITOR_METADATA)).toEqual({ default_short: 2 });
  });

  it('returns a fresh empty object for unknown strategies (no shared reference)', () => {
    const a = getRunStrategyDefault('long', 'neat', EDITOR_METADATA);
    const b = getRunStrategyDefault('long', 'neat', EDITOR_METADATA);
    expect(a).toEqual({});
    expect(a).not.toBe(b);
  });

  it('tolerates missing metadata', () => {
    expect(getRunStrategyDefault('long', 'neat', {})).toEqual({});
  });
});

describe('cacheStrategyBlocks (:2196-2208)', () => {
  it('caches each strategy block with its pb_default marker', () => {
    const cache = cacheStrategyBlocks(
      'long',
      { strategy: { neat: { grids: 4 }, recursive_mc: { span: 10 } } },
      { long: { recursive_mc: 'pb_default' } } as never,
      {}
    );
    expect(cache.long.neat).toEqual({ config: { grids: 4 }, fromDefault: false });
    expect(cache.long.recursive_mc).toEqual({ config: { span: 10 }, fromDefault: true });
  });

  it('ignores non-object strategy blocks', () => {
    const cache = cacheStrategyBlocks('long', { strategy: { neat: null, x: 5 } }, {} as never, {});
    expect(cache.long.neat).toBeUndefined();
    expect(cache.long.x).toBeUndefined();
  });
});

describe('detectSideStrategy (:2278-2294)', () => {
  it('returns the single supported strategy key', () => {
    expect(
      detectSideStrategy({ strategy: { neat: { grids: 1 }, unknown_kind: { a: 1 } } }, ['neat', 'recursive_mc'])
    ).toBe('neat');
  });

  it('returns null for zero or multiple supported blocks', () => {
    expect(detectSideStrategy({ strategy: {} }, ['neat'])).toBeNull();
    expect(
      detectSideStrategy({ strategy: { neat: {}, recursive_mc: {} } }, ['neat', 'recursive_mc'])
    ).toBeNull();
    expect(detectSideStrategy({ strategy: { neat: null } }, ['neat'])).toBeNull();
  });
});

describe('applyStrategyKindChange (changeRunStrategyKind :2240-2276)', () => {
  it('switches both sides to the requested strategy using cached blocks', () => {
    const current = {
      long: { strategy: { neat: { grids: 3 } }, keep: { long_side: 1 } },
      short: { strategy: { neat: { grids: 1 } }, keep: { short_side: 1 } },
    };
    const result = applyStrategyKindChange({
      sideConfigs: current,
      nextStrategy: 'recursive_mc',
      editorMetadata: EDITOR_METADATA,
      paramStatus: { long: {}, short: {} },
      strategyCache: { long: {}, short: {} },
    });
    expect(result.long.strategy).toEqual({ recursive_mc: { default_long: 1 } });
    expect(result.short.strategy).toEqual({ recursive_mc: { default_short: 2 } });
    // non-strategy side keys survive
    expect(result.long.keep).toEqual({ long_side: 1 });
    expect(result.paramStatus.long.recursive_mc).toBe('pb_default');
    expect(result.paramStatus.short.recursive_mc).toBe('pb_default');
    expect(result.activeStrategyKind).toBe('recursive_mc');
  });

  it('reuses the cached block when switching back to a previously edited strategy', () => {
    const cache = {
      long: { neat: { config: { grids: 9 }, fromDefault: false } },
      short: {},
    };
    const result = applyStrategyKindChange({
      sideConfigs: { long: { strategy: { recursive_mc: {} } }, short: { strategy: {} } },
      nextStrategy: 'neat',
      editorMetadata: EDITOR_METADATA,
      paramStatus: { long: {}, short: {} },
      strategyCache: cache,
    });
    expect(result.long.strategy).toEqual({ neat: { grids: 9 } });
    expect(result.paramStatus.long.neat).toBeUndefined();
  });

  it('keeps stale param-status entries only for other strategies (deleted for known list)', () => {
    const result = applyStrategyKindChange({
      sideConfigs: { long: {}, short: {} },
      nextStrategy: 'neat',
      editorMetadata: EDITOR_METADATA,
      paramStatus: { long: { recursive_mc: 'pb_default', custom_x: 'neutralized' } },
      strategyCache: { long: {}, short: {} },
    });
    expect(result.paramStatus.long.recursive_mc).toBeUndefined();
    expect(result.paramStatus.long.custom_x).toBe('neutralized');
  });

  it('marks the pb_default marker cleared once the block diverges (clearEditedRunStrategyDefaultMark :2296-2308)', () => {
    const paramStatus = { long: { recursive_mc: 'pb_default' } };
    const cache = { long: { recursive_mc: { config: { default_long: 1 }, fromDefault: true } } };
    const edited = clearEditedRunStrategyDefaultMark(
      'long',
      { strategy: { recursive_mc: { default_long: 42 } } },
      'recursive_mc',
      paramStatus,
      cache,
      EDITOR_METADATA
    );
    expect(edited.paramStatus.long.recursive_mc).toBeUndefined();
    expect(edited.cache.long.recursive_mc!.fromDefault).toBe(false);

    const untouched = clearEditedRunStrategyDefaultMark(
      'long',
      { strategy: { recursive_mc: { default_long: 1 } } },
      'recursive_mc',
      { long: { recursive_mc: 'pb_default' } },
      cache,
      EDITOR_METADATA
    );
    expect(untouched.paramStatus.long.recursive_mc).toBe('pb_default');
  });
});
