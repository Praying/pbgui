import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ACTIVE_PANEL,
  DEFAULT_CONTEXT_EXCHANGE,
  INVENTORY_SUBSECTIONS,
  PANELS,
  PANEL_STORAGE_KEYS,
  SETTINGS_SUBSECTIONS,
  persistActivePanel,
  persistContextExchange,
  persistInventorySubsection,
  persistSettingsSubsection,
  readActivePanel,
  readContextExchange,
  readInventorySubsection,
  readSettingsSubsection,
  usePanels,
} from './usePanels';
import type { PanelId } from '../types';

/* Legacy panel registry + persistence (market_data_main.html):
   sectionButtons :3674-3682, storage keys :3694-3697, setActivePanel
   :9032-9074 (per-panel lazy loads + localStorage write), restorePanel
   :9736-9746 (actions-panel remap + existence check), subsection restore
   :3818-3828, context exchange :9765-9769. */

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length(): number {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  } as Storage;
}

/** Storage whose accessors throw, like legacy private-mode localStorage. */
function throwingStorage(): Storage {
  const boom = (): never => {
    throw new Error('SecurityError');
  };
  return { getItem: boom, setItem: boom, removeItem: boom } as unknown as Storage;
}

const PANEL_IDS = [
  'settings-panel',
  'status-panel',
  'inventory-panel',
  'integrity-panel',
  'best1m-panel',
  'copy-data-panel',
  'activity-panel',
] as const;

describe('panel registry (sectionButtons :3674-3682)', () => {
  it('registers the seven legacy panels in order', () => {
    expect(PANELS.map((p) => p.id)).toEqual([...PANEL_IDS]);
  });

  it('keeps the legacy label i18n keys verbatim', () => {
    expect(PANELS.map((p) => p.labelKey)).toEqual([
      'market.settings',
      'market.statusMonitor',
      'market.ohlcvData',
      'market.ohlcvIntegrity',
      'market.buildBest1mTitle',
      'market.copyData',
      'market.activityLog',
    ]);
  });

  it('gives best1m no sidebar button (legacy buttonId null; reached via shortcut link)', () => {
    const best1m = PANELS.find((p) => p.id === 'best1m-panel');
    expect(best1m?.buttonId).toBeNull();
    expect(PANELS.filter((p) => p.buttonId !== null)).toHaveLength(6);
  });
});

describe('persisted storage keys (schema-frozen, :3694-3697)', () => {
  it('uses the four legacy key names verbatim', () => {
    expect(PANEL_STORAGE_KEYS.activePanel).toBe('market_data_fastapi_active_panel');
    expect(PANEL_STORAGE_KEYS.contextExchange).toBe('market_data_fastapi_context_exchange');
    expect(PANEL_STORAGE_KEYS.settingsSubsection).toBe('market_data_fastapi_settings_subsection');
    expect(PANEL_STORAGE_KEYS.inventorySubsection).toBe('market_data_fastapi_inventory_subsection');
  });
});

describe('readActivePanel (restorePanel :9736-9746)', () => {
  it('defaults to the settings panel', () => {
    expect(DEFAULT_ACTIVE_PANEL).toBe('settings-panel');
    expect(readActivePanel(memoryStorage())).toBe('settings-panel');
  });

  it('restores a stored valid panel id', () => {
    const storage = memoryStorage({ market_data_fastapi_active_panel: 'integrity-panel' });
    expect(readActivePanel(storage)).toBe('integrity-panel');
  });

  it('remaps the legacy actions-panel value to settings-panel (:9743)', () => {
    const storage = memoryStorage({ market_data_fastapi_active_panel: 'actions-panel' });
    expect(readActivePanel(storage)).toBe('settings-panel');
  });

  it('falls back to settings-panel for unknown ids (:9744 existence check)', () => {
    const storage = memoryStorage({ market_data_fastapi_active_panel: 'no-such-panel' });
    expect(readActivePanel(storage)).toBe('settings-panel');
  });

  it('survives a throwing storage (legacy try/catch :9738-9742)', () => {
    expect(readActivePanel(throwingStorage())).toBe('settings-panel');
  });
});

describe('subsection restore (:3818-3828) with migration-safe vocabulary (R3)', () => {
  it('exposes the legacy settings vocabulary', () => {
    expect(SETTINGS_SUBSECTIONS).toEqual(['normal', 'aws', 'tradfi']);
    expect(readSettingsSubsection(memoryStorage())).toBe('normal');
  });

  it('restores each stored settings subsection value', () => {
    for (const value of ['normal', 'aws', 'tradfi'] as const) {
      const storage = memoryStorage({ market_data_fastapi_settings_subsection: value });
      expect(readSettingsSubsection(storage)).toBe(value);
    }
  });

  it('falls back to normal for unknown settings values (R3 migration-safe read)', () => {
    const storage = memoryStorage({ market_data_fastapi_settings_subsection: 'garbage' });
    expect(readSettingsSubsection(storage)).toBe('normal');
    expect(readSettingsSubsection(throwingStorage())).toBe('normal');
  });

  it('exposes the legacy inventory vocabulary', () => {
    expect(INVENTORY_SUBSECTIONS).toEqual(['1m', '1m_api', 'l2Book', 'pb7_cache']);
    expect(readInventorySubsection(memoryStorage())).toBe('1m');
  });

  it('restores each stored inventory subsection value', () => {
    for (const value of ['1m', '1m_api', 'l2Book', 'pb7_cache'] as const) {
      const storage = memoryStorage({ market_data_fastapi_inventory_subsection: value });
      expect(readInventorySubsection(storage)).toBe(value);
    }
  });

  it('falls back to 1m for unknown inventory values (R3 migration-safe read)', () => {
    const storage = memoryStorage({ market_data_fastapi_inventory_subsection: '4h' });
    expect(readInventorySubsection(storage)).toBe('1m');
    expect(readInventorySubsection(throwingStorage())).toBe('1m');
  });
});

describe('context exchange persistence (:7310, :9766)', () => {
  it('defaults to hyperliquid', () => {
    expect(DEFAULT_CONTEXT_EXCHANGE).toBe('hyperliquid');
    expect(readContextExchange(memoryStorage())).toBe('hyperliquid');
  });

  it('restores and round-trips a stored exchange key', () => {
    const storage = memoryStorage({ market_data_fastapi_context_exchange: 'bybit' });
    expect(readContextExchange(storage)).toBe('bybit');
    persistContextExchange(storage, 'okx');
    expect(readContextExchange(storage)).toBe('okx');
  });

  it('survives a throwing storage', () => {
    expect(readContextExchange(throwingStorage())).toBe('hyperliquid');
    expect(() => persistContextExchange(throwingStorage(), 'okx')).not.toThrow();
  });
});

describe('persist helpers', () => {
  it('writes the exact panel id under the exact key (:9052-9056)', () => {
    const storage = memoryStorage();
    persistActivePanel(storage, 'copy-data-panel');
    expect(storage.getItem('market_data_fastapi_active_panel')).toBe('copy-data-panel');
  });

  it('writes subsection values verbatim (:6178, :6379)', () => {
    const storage = memoryStorage();
    persistSettingsSubsection(storage, 'aws');
    persistInventorySubsection(storage, 'pb7_cache');
    expect(storage.getItem('market_data_fastapi_settings_subsection')).toBe('aws');
    expect(storage.getItem('market_data_fastapi_inventory_subsection')).toBe('pb7_cache');
  });

  it('swallows storage write failures (legacy try/catch)', () => {
    expect(() => persistActivePanel(throwingStorage(), 'status-panel')).not.toThrow();
    expect(() => persistSettingsSubsection(throwingStorage(), 'normal')).not.toThrow();
    expect(() => persistInventorySubsection(throwingStorage(), '1m')).not.toThrow();
  });
});

describe('usePanels setActivePanel (:9032-9074)', () => {
  it('starts on the default panel and switches active panels', () => {
    const panels = usePanels({ storage: memoryStorage() });
    expect(panels.activePanel.value).toBe('settings-panel');
    panels.setActivePanel('integrity-panel');
    expect(panels.activePanel.value).toBe('integrity-panel');
  });

  it('persists every switch under the frozen key (:9053)', () => {
    const storage = memoryStorage();
    const panels = usePanels({ storage });
    panels.setActivePanel('inventory-panel');
    expect(storage.getItem('market_data_fastapi_active_panel')).toBe('inventory-panel');
    panels.setActivePanel('activity-panel');
    expect(storage.getItem('market_data_fastapi_active_panel')).toBe('activity-panel');
  });

  it('fires the previous panel onLeave then the new panel onEnter (legacy lazy loads + poll stops)', () => {
    const calls: string[] = [];
    const panels = usePanels({
      storage: memoryStorage(),
      hooks: {
        'integrity-panel': {
          onEnter: () => calls.push('integrity:enter'),
          onLeave: () => calls.push('integrity:leave'),
        },
        'copy-data-panel': {
          onEnter: () => calls.push('copy-data:enter'),
          onLeave: () => calls.push('copy-data:leave'),
        },
      },
    });
    panels.setActivePanel('integrity-panel');
    panels.setActivePanel('copy-data-panel');
    expect(calls).toEqual(['integrity:enter', 'integrity:leave', 'copy-data:enter']);
  });

  it('leaving a panel with no onLeave hook and entering a panel with no onEnter hook is a no-op', () => {
    const calls: string[] = [];
    const panels = usePanels({
      storage: memoryStorage(),
      hooks: { 'status-panel': { onEnter: () => calls.push('status:enter') } },
    });
    panels.setActivePanel('status-panel');
    panels.setActivePanel('settings-panel'); // settings has no hooks
    expect(calls).toEqual(['status:enter']);
  });

  it('restorePanel reads, remaps and activates (:9736-9746)', () => {
    const storage = memoryStorage({ market_data_fastapi_active_panel: 'actions-panel' });
    const panels = usePanels({ storage });
    expect(panels.restorePanel()).toBe('settings-panel');
    expect(panels.activePanel.value).toBe('settings-panel');

    storage.setItem('market_data_fastapi_active_panel', 'best1m-panel');
    expect(panels.restorePanel()).toBe('best1m-panel');
    expect(panels.activePanel.value).toBe('best1m-panel');
    // restorePanel persists the restored id through setActivePanel
    expect(storage.getItem('market_data_fastapi_active_panel')).toBe('best1m-panel');
  });

  it('restorePanel fires the enter hook for the restored panel (:9057-9071 lazy loads)', () => {
    const onEnter = vi.fn();
    const panels = usePanels({
      storage: memoryStorage({ market_data_fastapi_active_panel: 'integrity-panel' }),
      hooks: { 'integrity-panel': { onEnter } },
    });
    panels.restorePanel();
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('uses window.localStorage by default', () => {
    window.localStorage.setItem('market_data_fastapi_active_panel', 'status-panel');
    const panels = usePanels();
    expect(panels.restorePanel()).toBe('status-panel');
    expect(panels.activePanel.value).toBe('status-panel');
  });
});

describe('PanelId type surface (compile-time)', () => {
  it('accepts every registry id as a PanelId', () => {
    const ids: PanelId[] = PANELS.map((p) => p.id);
    expect(ids).toHaveLength(7);
  });
});

afterEach(() => {
  window.localStorage.clear();
});
