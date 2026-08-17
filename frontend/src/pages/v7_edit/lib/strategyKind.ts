import type { EditorMetadata } from './liveParams';

/**
 * v8 strategy_kind plumbing — ports of getRunStrategyDefault (:2190-2194),
 * cacheRunStrategyBlocks (:2196-2208), selectRunStrategyConfig (:2210-2226),
 * changeRunStrategyKind's config half (:2257-2269),
 * syncRunStrategyKindFromSideConfig (:2278-2294) and
 * clearEditedRunStrategyDefaultMark (:2296-2308). Pure functions — the
 * module-level caches of the legacy page become explicit arguments.
 */

export type SideName = 'long' | 'short';

/** { long: {param: 'neutralized'|'pb_default'}, short: {...} } (:1237). */
export type ParamStatus = Record<SideName, Record<string, string>>;

export interface StrategyCacheEntry {
  config: Record<string, unknown>;
  fromDefault: boolean;
}

export type StrategyCache = Record<SideName, Record<string, StrategyCacheEntry>>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value == null ? {} : value)) as T;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function emptyCache(cache: StrategyCache | Partial<StrategyCache>): StrategyCache {
  return { long: object(cache.long) as never, short: object(cache.short) as never };
}

export function getRunStrategyDefault(
  side: SideName,
  strategy: string,
  editorMetadata: unknown
): Record<string, unknown> {
  const defaults = object(object(editorMetadata).strategy_defaults);
  const sideDefaults = object(defaults[side]);
  return clone(object(sideDefaults[strategy]));
}

export function cacheStrategyBlocks(
  side: SideName,
  sideConfig: Record<string, unknown>,
  paramStatus: ParamStatus | Partial<ParamStatus>,
  cache: StrategyCache | Partial<StrategyCache>
): StrategyCache {
  const strategyStore = object(sideConfig.strategy);
  const next = emptyCache(cache);
  for (const strategy of Object.keys(strategyStore)) {
    const block = strategyStore[strategy];
    if (!block || typeof block !== 'object') continue;
    next[side][strategy] = {
      config: clone(block as Record<string, unknown>),
      fromDefault: object(paramStatus[side])[strategy] === 'pb_default',
    };
  }
  return next;
}

/** selectRunStrategyConfig (:2210-2226) — keep one strategy block per side. */
export function selectStrategySideConfig(
  side: SideName,
  sideConfig: Record<string, unknown>,
  strategy: string,
  editorMetadata: unknown,
  paramStatus: ParamStatus | Partial<ParamStatus>,
  cache: StrategyCache | Partial<StrategyCache>
): { sideConfig: Record<string, unknown>; paramStatus: ParamStatus; cache: StrategyCache } {
  const result = clone(sideConfig);
  const nextCache = cacheStrategyBlocks(side, result, paramStatus, cache);
  let cached = nextCache[side][strategy];
  if (!cached) {
    cached = { config: getRunStrategyDefault(side, strategy, editorMetadata), fromDefault: true };
    nextCache[side][strategy] = clone(cached);
  }
  const strategyStore: Record<string, unknown> = {};
  strategyStore[strategy] = clone(cached.config);
  result.strategy = strategyStore;
  const sideStatus = { ...object(paramStatus[side]) } as Record<string, string>;
  for (const strategyName of object(editorMetadata).strategies
    ? ((object(editorMetadata).strategies as unknown[]) || []).map((value) => String(value))
    : []) {
    delete sideStatus[strategyName];
  }
  if (cached.fromDefault) sideStatus[strategy] = 'pb_default';
  const nextStatus: ParamStatus = { ...object(paramStatus), [side]: sideStatus } as ParamStatus;
  return { sideConfig: result, paramStatus: nextStatus, cache: nextCache };
}

/** syncRunStrategyKindFromSideConfig detection (:2280-2294). */
export function detectSideStrategy(
  sideConfig: Record<string, unknown>,
  strategies: readonly string[]
): string | null {
  const strategyStore = object(sideConfig.strategy);
  const strategyKeys = Object.keys(strategyStore).filter(
    (key) => strategies.includes(key) && strategyStore[key] && typeof strategyStore[key] === 'object'
  );
  if (strategyKeys.length !== 1) return null;
  return strategyKeys[0]!;
}

export interface ApplyStrategyKindInput {
  readonly sideConfigs: { long: Record<string, unknown>; short: Record<string, unknown> };
  readonly nextStrategy: string;
  readonly editorMetadata: unknown;
  readonly paramStatus: ParamStatus | Partial<ParamStatus>;
  readonly strategyCache: StrategyCache | Partial<StrategyCache>;
}

export interface ApplyStrategyKindResult {
  readonly long: Record<string, unknown>;
  readonly short: Record<string, unknown>;
  readonly paramStatus: ParamStatus;
  readonly cache: StrategyCache;
  readonly activeStrategyKind: string;
}

/** changeRunStrategyKind (:2257-2270) — the per-side config transformation. */
export function applyStrategyKindChange(input: ApplyStrategyKindInput): ApplyStrategyKindResult {
  const longSide = selectStrategySideConfig(
    'long',
    input.sideConfigs.long,
    input.nextStrategy,
    input.editorMetadata,
    input.paramStatus,
    input.strategyCache
  );
  const shortSide = selectStrategySideConfig(
    'short',
    input.sideConfigs.short,
    input.nextStrategy,
    input.editorMetadata,
    longSide.paramStatus,
    longSide.cache
  );
  return {
    long: longSide.sideConfig,
    short: shortSide.sideConfig,
    paramStatus: shortSide.paramStatus,
    cache: shortSide.cache,
    activeStrategyKind: input.nextStrategy,
  };
}

/** clearEditedRunStrategyDefaultMark (:2296-2308). */
export function clearEditedRunStrategyDefaultMark(
  side: SideName,
  sideConfig: Record<string, unknown>,
  strategy: string,
  paramStatus: ParamStatus | Partial<ParamStatus>,
  cache: StrategyCache | Partial<StrategyCache>,
  editorMetadata: unknown
): { paramStatus: ParamStatus; cache: StrategyCache } {
  if (!strategy || object(paramStatus[side])[strategy] !== 'pb_default') {
    return { paramStatus: object(paramStatus) as ParamStatus, cache: emptyCache(cache) };
  }
  const strategyStore = object(sideConfig.strategy);
  if (
    JSON.stringify(strategyStore[strategy] ?? {}) ===
    JSON.stringify(getRunStrategyDefault(side, strategy, editorMetadata))
  ) {
    return { paramStatus: object(paramStatus) as ParamStatus, cache: emptyCache(cache) };
  }
  const sideStatus = { ...object(paramStatus[side]) } as Record<string, string>;
  delete sideStatus[strategy];
  const nextCache = emptyCache(cache);
  if (nextCache[side][strategy]) nextCache[side][strategy] = { ...nextCache[side][strategy]!, fromDefault: false };
  return {
    paramStatus: { ...object(paramStatus), [side]: sideStatus } as ParamStatus,
    cache: nextCache,
  };
}

/** Extracted metadata accessor for the page (editorMetadata.strategies || []). */
export function supportedStrategies(editorMetadata: unknown): string[] {
  const raw = object(editorMetadata).strategies;
  return Array.isArray(raw) ? raw.map((value) => String(value)) : [];
}

export function createEmptyStrategyCache(): StrategyCache {
  return { long: {}, short: {} };
}
