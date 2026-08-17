import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCoinOverrides, type CoinOvRequest } from './useCoinOverrides';

/*
 * The stateful halves of frontend/js/coin_overrides_editor.js: init +
 * _fetchAllowedParams (:478-538), coinOvLoad (:541-595), the override-file
 * cache + loaders (:659-693), collect/snapshot/acknowledge (:719-793) and the
 * edit flow (:1121-1630) — the embed contract v7_edit.html:1851-1888 drives.
 */

type FileEntry = { config: Record<string, unknown> };

const MESSAGES = {
  jsonInvalid: (side: string) => `Coin Override ${side} JSON is invalid`,
  invalidValue: (param: string, msg: string) => `Invalid value for ${param}: ${msg}`,
  alreadyHas: (coin: string) => `${coin} already has overrides`,
};

function createRequest(routes: Record<string, unknown> = {}): CoinOvRequest & { calls: [string, unknown][] } {
  const calls: [string, unknown][] = [];
  const request: CoinOvRequest = async (path, options) => {
    calls.push([path, options]);
    if (path in routes) {
      const route = routes[path]!;
      if (route instanceof Error) throw route;
      return route;
    }
    return {};
  };
  return Object.assign(request, { calls });
}

function createCov(overrides: Partial<Parameters<typeof useCoinOverrides>[0]> = {}) {
  const notify = vi.fn();
  const sync = vi.fn();
  const request = overrides.request ?? createRequest();
  const store = useCoinOverrides({
    apiBase: '/api/v7',
    deferConfigFileWrites: false,
    preserveMarketIdentifiers: false,
    request,
    notify,
    notifyStructuredSync: sync,
    jsonInvalid: MESSAGES.jsonInvalid,
    invalidValue: MESSAGES.invalidValue,
    alreadyHas: MESSAGES.alreadyHas,
    ...overrides,
  } as Parameters<typeof useCoinOverrides>[0]);
  return { store, notify, sync, request };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('allowed params metadata', () => {
  it('fetches /override-params without context on v7 and stores params', async () => {
    const request = createRequest({
      '/override-params': { params: { bot: { long: { entry_initial_qty_pct: { type: 'number' } } }, live: {} } },
    });
    const { store } = createCov({ request });
    await store.init();
    expect(request.calls[0]![0]).toBe('/override-params');
    expect(store.allowedParams.value).toEqual({
      bot: { long: { entry_initial_qty_pct: { type: 'number' } } },
      live: {},
    });
    expect(store.allowedParamsError.value).toBe('');
  });

  it('passes hsl/strategy context in the query (v8) and records load errors', async () => {
    const request = createRequest({ '/override-params?hsl_signal_mode=coin&strategy_kind=neat': new Error('nope') });
    const { store } = createCov({ request, deferConfigFileWrites: true, preserveMarketIdentifiers: true });
    store.setContext({ hslSignalMode: 'coin', strategyKind: 'neat' });
    await store.init();
    expect(request.calls[0]![0]).toBe('/override-params?hsl_signal_mode=coin&strategy_kind=neat');
    expect(store.allowedParams.value).toEqual({});
    expect(store.allowedParamsError.value).toBe('nope');
  });

  it('short-circuits when the context is incomplete (contextAware)', async () => {
    const request = createRequest();
    const { store } = createCov({
      request,
      deferConfigFileWrites: true,
      preserveMarketIdentifiers: true,
      context: { hslSignalMode: '', strategyKind: '' },
    });
    await store.init();
    expect(request.calls).toHaveLength(0);
    expect(store.allowedParamsError.value).toBe('Override context is unavailable');
  });
});

describe('load + collect', () => {
  it('normalizes on load and collects a deep copy', async () => {
    const { store } = createCov();
    store.load({ coin_overrides: { BTCUSDT: { live: { leverage: 5 } } } });
    expect(Object.keys(store.overrides)).toEqual(['BTC']);
    const collected = store.collect();
    expect(collected).toEqual({ coin_overrides: { BTC: { live: { leverage: 5 } } } });
    collected.coin_overrides!.BTC!.live = { leverage: 99 };
    expect(store.collect().coin_overrides!.BTC!.live).toEqual({ leverage: 5 });
  });

  it('returns {} when there are no overrides', () => {
    const { store } = createCov();
    store.load({});
    expect(store.collect()).toEqual({});
  });

  it('resets the edit state on load', () => {
    const { store } = createCov();
    store.load({ coin_overrides: { BTC: { live: { leverage: 5 } } } });
    store.editCoinStart('BTC');
    store.load({ coin_overrides: {} });
    expect(store.editCoin.value).toBe('');
  });

  it('preservePending keeps cached files whose path still matches', () => {
    const { store } = createCov({ deferConfigFileWrites: true, preserveMarketIdentifiers: true });
    store.load({ coin_overrides: { X: { override_config_path: 'X.json' } } });
    store.cacheOverrideFile('X', { bot: { long: { a: 1 } } });
    store.markPendingWrite('X');
    store.load(
      { coin_overrides: { X: { override_config_path: 'X.json' } } },
      { preservePending: true }
    );
    expect(store.pendingFileCount()).toBe(1);
    // path changed → pending dropped
    store.load({ coin_overrides: { X: { override_config_path: 'Y.json' } } }, { preservePending: true });
    expect(store.pendingFileCount()).toBe(0);
    expect(store.cachedOverrideFile('X')).toBeUndefined();
  });
});

describe('override file loading + snapshots', () => {
  it('loads override files through the API with a generation guard', async () => {
    const request = createRequest({
      '/override-config/mycfg/BTC.json': { config: { bot: { long: { a: 1 } } } },
    });
    const { store } = createCov({ request });
    store.load({ coin_overrides: { BTC: { override_config_path: 'BTC.json' } } });
    store.setConfigName('mycfg');
    const payload = (await store.loadOverrideFile('BTC')) as Record<string, unknown>;
    expect(payload).toEqual({ bot: { long: { a: 1 } } });
    expect(request.calls[0]![0]).toBe('/override-config/mycfg/BTC.json');
    // second call is cached
    await store.loadOverrideFile('BTC');
    expect(request.calls).toHaveLength(1);
  });

  it('records load errors in the cache and still resolves', async () => {
    const request = createRequest({
      '/override-config/mycfg/BTC.json': new Error('boom'),
    });
    const { store } = createCov({ request });
    store.load({ coin_overrides: { BTC: { override_config_path: 'BTC.json' } } });
    store.setConfigName('mycfg');
    const payload = await store.loadOverrideFile('BTC');
    expect((payload as { __pbgui_load_error__?: string }).__pbgui_load_error__).toBe('boom');
  });

  it('snapshotAllFiles resolves every file-backed override', async () => {
    const request = createRequest({
      '/override-config/mycfg/BTC.json': { config: { bot: { long: { a: 1 } } } },
      '/override-config/mycfg/ETH.json': { config: { bot: { short: { b: 2 } } } },
    });
    const { store } = createCov({ request });
    store.load({
      coin_overrides: {
        BTC: { override_config_path: 'BTC.json' },
        ETH: { override_config_path: 'ETH.json' },
        INLINE: { live: { leverage: 3 } },
      },
    });
    store.setConfigName('mycfg');
    expect(await store.snapshotAllFiles()).toEqual({
      'BTC.json': { bot: { long: { a: 1 } } },
      'ETH.json': { bot: { short: { b: 2 } } },
    });
  });

  it('snapshotAllFiles keeps going with the error marker when a file fails to load (legacy parity)', async () => {
    const request = createRequest({
      '/override-config/mycfg/BTC.json': new Error('boom'),
    });
    const { store } = createCov({ request });
    store.load({ coin_overrides: { BTC: { override_config_path: 'BTC.json' } } });
    store.setConfigName('mycfg');
    // legacy _covLoadOverrideFile resolves the {__pbgui_load_error__} marker,
    // so the snapshot carries it instead of rejecting (:773-793)
    const files = await store.snapshotAllFiles();
    expect(files['BTC.json']).toEqual({ __pbgui_load_error__: 'boom' });
  });

  it('snapshotPendingFiles + acknowledgePendingFiles round-trip', async () => {
    const { store } = createCov({ deferConfigFileWrites: true, preserveMarketIdentifiers: true });
    store.load({ coin_overrides: { X: { override_config_path: 'X.json' } } });
    store.markPendingWrite('X', { config: { bot: { long: { a: 1 } } } });
    const snapshot = store.snapshotPendingFiles();
    expect(snapshot).toEqual({
      files: { 'X.json': { bot: { long: { a: 1 } } } },
      entries: { X: { filename: 'X.json', config: { bot: { long: { a: 1 } } } } },
    });
    store.acknowledgePendingFiles(snapshot);
    expect(store.pendingFileCount()).toBe(0);
  });
});

describe('edit flow', () => {
  const ALLOWED = {
    params: {
      bot: {
        long: { entry_initial_qty_pct: { type: 'number' }, forced_mode_long: true },
        short: {},
      },
      live: { leverage: { type: 'number' } },
    },
  };

  async function createEditCov() {
    const request = createRequest({ '/override-params': ALLOWED });
    const ctx = createCov({ request });
    await ctx.store.init();
    return ctx;
  }

  it('pickCoin adds the coin and opens the editor', async () => {
    const { store, sync } = await createEditCov();
    store.load({ coin_overrides: {} });
    store.pickCoin('BTC');
    expect(store.overrides.BTC).toEqual({});
    expect(store.editCoin.value).toBe('BTC');
    expect(sync).toHaveBeenCalled();
    // duplicate pick toasts and does nothing
    store.pickCoin('BTC');
    expect(store.editCoin.value).toBe('BTC');
  });

  it('addParam parses the raw value and removeParam deletes it', async () => {
    const { store } = await createEditCov();
    store.load({ coin_overrides: {} });
    store.pickCoin('BTC');
    store.addParam('bot.long', 'entry_initial_qty_pct', '0.15');
    expect(store.overrides.BTC).toEqual({ bot: { long: { entry_initial_qty_pct: 0.15 } } });
    store.addParam('live', 'leverage', '5');
    expect(store.overrides.BTC!.live).toEqual({ leverage: 5 });
    store.removeParam('live', 'leverage');
    expect(store.overrides.BTC!.live).toBeUndefined();
  });

  it('addParam toasts the parse error and keeps focus-worthy state', async () => {
    const { store, notify } = await createEditCov();
    store.load({ coin_overrides: {} });
    store.pickCoin('BTC');
    store.addParam('bot.long', 'entry_initial_qty_pct', 'abc');
    expect(notify).toHaveBeenCalledWith(MESSAGES.invalidValue('entry_initial_qty_pct', 'must be a number'), 'err');
    // legacy _covEnsureNested ran before the parse, so the empty container stays
    expect(store.overrides.BTC).toEqual({ bot: { long: {} } });
  });

  it('saveEditValues reads the inline inputs and reports invalid ones', async () => {
    const { store, notify } = await createEditCov();
    store.load({ coin_overrides: { BTC: { bot: { long: { entry_initial_qty_pct: 0.1 } } } } });
    store.editCoinStart('BTC');
    expect(store.inlineValues['bot.long.entry_initial_qty_pct']).toBe('0.1');
    store.inlineValues['bot.long.entry_initial_qty_pct'] = '0.2';
    expect(store.saveEditValues()).toBe(true);
    expect(store.overrides.BTC).toMatchObject({ bot: { long: { entry_initial_qty_pct: 0.2 } } });
    store.inlineValues['bot.long.entry_initial_qty_pct'] = 'zzz';
    expect(store.saveEditValues()).toBe(false);
    expect(notify).toHaveBeenCalled();
  });

  it('collect throws when the open editor holds invalid values', async () => {
    const { store } = await createEditCov();
    store.load({ coin_overrides: { BTC: { bot: { long: { entry_initial_qty_pct: 0.1 } } } } });
    store.editCoinStart('BTC');
    store.inlineValues['bot.long.entry_initial_qty_pct'] = 'zzz';
    expect(() => store.collect()).toThrow('Coin override values are invalid');
  });

  it('removeCoin drops the override and its cached file', () => {
    const { store } = createCov();
    store.load({ coin_overrides: { BTC: { override_config_path: 'BTC.json' } } });
    store.cacheOverrideFile('BTC', { bot: {} });
    store.removeCoin('BTC');
    expect(store.overrides.BTC).toBeUndefined();
    expect(store.cachedOverrideFile('BTC')).toBeUndefined();
  });
});

describe('config-file save', () => {
  const ALLOWED = { params: { bot: { long: {}, short: {} }, live: {} } };

  it('v7 saves edited file content immediately via PUT', async () => {
    const request = createRequest({ '/override-params': ALLOWED });
    const ctx = createCov({ request });
    await ctx.store.init();
    const { store } = ctx;
    store.setConfigName('mycfg');
    store.load({ coin_overrides: { BTC: {} } });
    store.editCoinStart('BTC');
    store.fileValues.long = '{\n    "a": 1\n}';
    store.fileValues.short = '';
    expect(store.saveEditValues()).toBe(true);
    expect(store.overrides.BTC!.override_config_path).toBe('BTC.json');
    const put = request.calls.find(([p, o]) => p === '/override-config/mycfg/BTC.json' && (o as { method?: string }).method === 'PUT');
    expect(put).toBeTruthy();
  });

  it('v8 defers the write into pendingConfigFileWrites', () => {
    const request = createRequest({ '/override-params': ALLOWED });
    const { store } = createCov({ request, deferConfigFileWrites: true, preserveMarketIdentifiers: true });
    store.setConfigName('mycfg');
    store.load({ coin_overrides: { '1000PEPEUSDT': {} } });
    store.editCoinStart('1000PEPEUSDT');
    store.fileValues.long = '{"a": 1}';
    expect(store.saveEditValues()).toBe(true);
    expect(store.pendingFileCount()).toBe(1);
    const [filename, content] = Object.entries(store.snapshotPendingFiles().files)[0]!;
    expect(filename).toMatch(/^1000PEPEUSDT-[0-9a-f]{8}\.json$/);
    expect(content).toEqual({ bot: { long: { a: 1 } } });
  });

  it('rejects invalid side JSON with the status message', async () => {
    const request = createRequest({ '/override-params': ALLOWED });
    const ctx = createCov({ request });
    await ctx.store.init();
    const { store, notify } = ctx;
    store.load({ coin_overrides: { BTC: {} } });
    store.editCoinStart('BTC');
    store.fileValues.long = '{oops}';
    expect(store.saveEditValues()).toBe(false);
    expect(notify).toHaveBeenCalledWith('Invalid JSON in long. Fix it before closing.', 'err');
  });

  it('clearing both sides removes override_config_path', async () => {
    const request = createRequest({ '/override-params': ALLOWED });
    const ctx = createCov({ request });
    await ctx.store.init();
    const { store } = ctx;
    store.load({ coin_overrides: { BTC: { override_config_path: 'BTC.json' } } });
    store.editCoinStart('BTC');
    store.fileValues.long = '';
    store.fileValues.short = '';
    expect(store.saveEditValues()).toBe(true);
    expect(store.overrides.BTC!.override_config_path).toBeUndefined();
  });

  it('flushPendingFiles PUTs each pending file once', async () => {
    const request = createRequest({ '/override-params': ALLOWED });
    const { store } = createCov({ request, deferConfigFileWrites: true, preserveMarketIdentifiers: true });
    store.setConfigName('mycfg');
    store.load({ coin_overrides: { X: { override_config_path: 'X.json' } } });
    store.markPendingWrite('X', { config: { bot: { long: { a: 1 } } } });
    await store.flushPendingFiles();
    const put = request.calls.find(([p, o]) => (o as { method?: string }).method === 'PUT');
    expect(put![0]).toBe('/override-config/mycfg/X.json');
    expect(store.pendingFileCount()).toBe(0);
  });
});

describe('setOverrideConfigs (draft preload)', () => {
  it('caches normalized payloads and marks pending for file-backed overrides', () => {
    const request = createRequest({ '/override-params': { params: { bot: { long: {}, short: {} }, live: {} } } });
    const { store } = createCov({ request, deferConfigFileWrites: true, preserveMarketIdentifiers: true });
    store.load({ coin_overrides: { BTC: { override_config_path: 'BTC.json' }, ETH: {} } });
    store.setOverrideConfigs({ BTC: { bot: { long: { a: 1 } } }, ETH: { bot: {} } }, { markPending: true });
    expect(store.cachedOverrideFile('BTC')).toEqual({ bot: { long: { a: 1 } } });
    expect(store.pendingFileCount()).toBe(1);
    expect(store.snapshotPendingFiles().entries.BTC).toBeDefined();
  });
});

describe('setCoins + setConfigName', () => {
  it('filters "all" and sorts the coin list', () => {
    const { store } = createCov();
    store.setCoins(['ETH', 'all', 'BTC']);
    expect(store.availableCoins.value).toEqual(['BTC', 'ETH']);
  });

  it('setConfigName bumps the load generation on change', () => {
    const { store } = createCov();
    store.setConfigName('a');
    store.setConfigName('a');
    store.setConfigName('b');
    expect(store.configName.value).toBe('b');
  });
});

describe('paste filter (covFilterCfgPaste :1567-1623)', () => {
  const ALLOWED = { params: { bot: { long: { entry_initial_qty_pct: true }, short: {} }, live: {} } };

  it('extracts the side from structured pastes and filters unknown params', async () => {
    const request = createRequest({ '/override-params': ALLOWED });
    const ctx = createCov({ request });
    await ctx.store.init();
    const { store } = ctx;
    const paste = JSON.stringify({ bot: { long: { entry_initial_qty_pct: 0.2, junk: 1 } }, short: {} });
    const result = store.filterPaste('long', paste);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!.text)).toEqual({ entry_initial_qty_pct: 0.2 });
    expect(result!.messageKey).toBe('extractedFilteredPaste');
  });

  it('rewrites even clean flat pastes (legacy dead early-return parity)', async () => {
    const request = createRequest({ '/override-params': ALLOWED });
    const ctx = createCov({ request });
    await ctx.store.init();
    const { store } = ctx;
    const paste = JSON.stringify({ entry_initial_qty_pct: 0.2 });
    const result = store.filterPaste('long', paste);
    // _covFlattenForAllowed always returns a fresh object, so `flat === parsed`
    // never holds and every object paste is reformatted (:1592-1598)
    expect(result).not.toBeNull();
    expect(JSON.parse(result!.text)).toEqual({ entry_initial_qty_pct: 0.2 });
    expect(result!.messageKey).toBe('extractedPaste');
  });

  it('repairs trailing commas in pasted JSON', async () => {
    const request = createRequest({ '/override-params': ALLOWED });
    const ctx = createCov({ request });
    await ctx.store.init();
    const { store } = ctx;
    const result = store.filterPaste('long', '{"entry_initial_qty_pct": 0.2, "junk": 1,}');
    expect(result).not.toBeNull();
    expect(JSON.parse(result!.text)).toEqual({ entry_initial_qty_pct: 0.2 });
    expect(result!.messageKey).toBe('extractedFilteredPaste');
  });

  it('ignores non-object and short pastes', async () => {
    const request = createRequest({ '/override-params': ALLOWED });
    const ctx = createCov({ request });
    await ctx.store.init();
    const { store } = ctx;
    expect(store.filterPaste('long', '[1]')).toBeNull();
    expect(store.filterPaste('long', '{')).toBeNull();
  });
});
