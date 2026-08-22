import { describe, expect, it, vi } from 'vitest';
import { useContextExchange, type ExchangeFanoutHooks } from './useContextExchange';
import type { PanelId } from '../types';

/* Legacy setContextExchange fan-out (market_data_main.html:7304-7333),
   openBest1mPanel section state (:7687-7691) and the bootstrap restore
   (:9766-9771). Panel-specific fan-out branches are injected hooks owned by
   M-data-3..7. The sidebar shortcut state tests (:7415-7446) retired with
   the #sidebar column — the rail/in-panel controls carry their own active
   state (covered in App.test.ts). */

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: () => null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => map.set(key, value),
  } as Storage;
}

/** All hooks as required mocks so assertions can read .mock directly. */
type MockHooks = { [K in keyof ExchangeFanoutHooks]-?: ReturnType<typeof vi.fn> };

function makeHarness(options: {
  initialExchange?: string;
  activePanel?: PanelId;
}): {
  ctx: ReturnType<typeof useContextExchange>;
  hooks: MockHooks;
  storage: Storage;
} {
  const hooks: MockHooks = {
    loadSettings: vi.fn(),
    updateStatusPanel: vi.fn(),
    syncInventorySubsectionVisibility: vi.fn(),
    loadInventoryPanel: vi.fn(),
    refreshBest1mPanel: vi.fn(),
    onIntegrityExchangeChange: vi.fn(),
  };
  const storage = makeStorage();
  const ctx = useContextExchange({
    storage,
    initialExchange: options.initialExchange ?? 'hyperliquid',
    isPanelActive: (panel) => panel === (options.activePanel ?? 'settings-panel'),
    hooks,
  });
  return { ctx, hooks, storage };
}

describe('setContextExchange normalization + persistence (:7304-7313, :9766)', () => {
  it('keeps a known exchange key and persists it', () => {
    const { ctx, storage } = makeHarness({ initialExchange: 'bybit' });
    ctx.setContextExchange('okx');
    expect(ctx.contextExchange.value).toBe('okx');
    expect(storage.getItem('market_data_fastapi_context_exchange')).toBe('okx');
  });

  it('normalizes binance-usdm spellings to binance (:4092-4100)', () => {
    const { ctx } = makeHarness({});
    ctx.setContextExchange('binanceusdm');
    expect(ctx.contextExchange.value).toBe('binance');
    ctx.setContextExchange('Binance-USDM');
    expect(ctx.contextExchange.value).toBe('binance');
  });

  it('falls back to hyperliquid for unknown values and trims input', () => {
    const { ctx } = makeHarness({});
    ctx.setContextExchange('  nonexistent  ');
    expect(ctx.contextExchange.value).toBe('hyperliquid');
    ctx.setContextExchange('');
    expect(ctx.contextExchange.value).toBe('hyperliquid');
  });

  it('does not persist before setContextExchange runs (bootstrap :9766-9771 order)', () => {
    const { ctx, storage } = makeHarness({ initialExchange: 'bybit' });
    expect(storage.getItem('market_data_fastapi_context_exchange')).toBeNull();
    ctx.setContextExchange(ctx.contextExchange.value);
    expect(storage.getItem('market_data_fastapi_context_exchange')).toBe('bybit');
  });
});

describe('setContextExchange fan-out (:7314-7333)', () => {
  it('runs the unconditional fan-out in legacy order', () => {
    const { ctx, hooks } = makeHarness({ activePanel: 'settings-panel' });
    ctx.setContextExchange('bybit');
    const loadSettingsAt = hooks.loadSettings.mock.invocationCallOrder[0] ?? -1;
    const updateStatusAt = hooks.updateStatusPanel.mock.invocationCallOrder[0] ?? -2;
    const syncVisibilityAt = hooks.syncInventorySubsectionVisibility.mock.invocationCallOrder[0] ?? -3;
    expect(loadSettingsAt).toBeGreaterThan(0);
    expect(updateStatusAt).toBeGreaterThan(0);
    expect(syncVisibilityAt).toBeGreaterThan(0);
    expect(loadSettingsAt).toBeLessThan(updateStatusAt);
    expect(updateStatusAt).toBeLessThan(syncVisibilityAt);
  });

  it('passes the normalized key to loadSettings and the full meta to updateStatusPanel', () => {
    const { ctx, hooks } = makeHarness({});
    ctx.setContextExchange('binanceusdm');
    expect(hooks.loadSettings).toHaveBeenCalledWith('binance', { keepFeedback: false }); // :7314
    expect(hooks.updateStatusPanel).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'binance', statusKey: 'binanceusdm' })
    );
  });

  it('skips panel-gated branches while settings is active', () => {
    const { ctx, hooks } = makeHarness({ activePanel: 'settings-panel' });
    ctx.setContextExchange('bybit');
    expect(hooks.loadInventoryPanel).not.toHaveBeenCalled();
    expect(hooks.refreshBest1mPanel).not.toHaveBeenCalled();
    expect(hooks.onIntegrityExchangeChange).not.toHaveBeenCalled();
  });

  it('reloads the inventory panel with force=true when it is active (:7318-7320)', () => {
    const { ctx, hooks } = makeHarness({ activePanel: 'inventory-panel' });
    ctx.setContextExchange('bybit');
    expect(hooks.loadInventoryPanel).toHaveBeenCalledWith(true);
  });

  it('refreshes the best1m panel with force=false when it is active (:7321-7323)', () => {
    const { ctx, hooks } = makeHarness({ activePanel: 'best1m-panel' });
    ctx.setContextExchange('bybit');
    expect(hooks.refreshBest1mPanel).toHaveBeenCalledWith(false);
  });

  it('resets the integrity branch with the statusKey when it is active (:7324-7332)', () => {
    const { ctx, hooks } = makeHarness({ activePanel: 'integrity-panel' });
    ctx.setContextExchange('binanceusdm');
    expect(hooks.onIntegrityExchangeChange).toHaveBeenCalledWith('binanceusdm');
  });

  it('runs the whole fan-out on every call, including no-op exchange re-sets', () => {
    const { ctx, hooks } = makeHarness({});
    ctx.setContextExchange('bybit');
    ctx.setContextExchange('bybit');
    expect(hooks.loadSettings).toHaveBeenCalledTimes(2);
    expect(hooks.updateStatusPanel).toHaveBeenCalledTimes(2);
  });
});

describe('best-1m shortcut section state (:7687-7691, uiState.best1mPanelSection)', () => {
  it('defaults to build', () => {
    const { ctx } = makeHarness({});
    expect(ctx.best1mSection.value).toBe('build');
  });

  it('normalizes the section like openBest1mPanel (:7688)', () => {
    const { ctx } = makeHarness({});
    ctx.setBest1mSection('download');
    expect(ctx.best1mSection.value).toBe('download');
    ctx.setBest1mSection('build');
    expect(ctx.best1mSection.value).toBe('build');
    ctx.setBest1mSection('garbage');
    expect(ctx.best1mSection.value).toBe('build');
    ctx.setBest1mSection('DOWNLOAD');
    expect(ctx.best1mSection.value).toBe('build');
  });

  it('exposes the current exchange meta for consumers', () => {
    const { ctx } = makeHarness({});
    ctx.setContextExchange('bybit');
    expect(ctx.contextMeta.value).toEqual({ key: 'bybit', statusKey: 'bybit', label: 'Bybit' });
  });
});
