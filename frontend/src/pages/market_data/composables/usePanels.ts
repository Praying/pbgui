import { ref, type Ref } from 'vue';
import type { InventorySubsection, PanelDef, PanelId, SettingsSubsection } from '../types';

/*
 * Panel registry + the persisted-state layer (market_data_main.html).
 *
 * sectionButtons      :3674-3682  (7 panels; best1m has no sidebar button)
 * storage keys        :3694-3697  (schema-frozen, names verbatim)
 * setActivePanel      :9032-9074  (per-panel lazy loads + poll stops +
 *                                 localStorage write)
 * restorePanel        :9736-9746  (actions-panel remap + existence check)
 * subsection restore  :3818-3828  (settings/inventory vocabularies)
 * context exchange    :7310, :9766 (default hyperliquid)
 *
 * The per-panel lazy loads/poll stops of setActivePanel become the hooks
 * registry: M-data-5..7 register onEnter/onLeave for their panels exactly
 * where legacy called loadIntegrityPanel/startIntegrityPolling etc.
 */

/** Schema-frozen localStorage keys (:3694-3697) — names are verbatim. */
export const PANEL_STORAGE_KEYS = {
  activePanel: 'market_data_fastapi_active_panel',
  contextExchange: 'market_data_fastapi_context_exchange',
  settingsSubsection: 'market_data_fastapi_settings_subsection',
  inventorySubsection: 'market_data_fastapi_inventory_subsection',
} as const;

/** Legacy sectionButtons registry (:3674-3682). */
export const PANELS: readonly PanelDef[] = [
  { id: 'settings-panel', labelKey: 'market.settings', buttonId: 'btn-panel-settings' },
  { id: 'status-panel', labelKey: 'market.statusMonitor', buttonId: 'btn-panel-status' },
  { id: 'inventory-panel', labelKey: 'market.ohlcvData', buttonId: 'btn-panel-inventory' },
  { id: 'integrity-panel', labelKey: 'market.ohlcvIntegrity', buttonId: 'btn-panel-integrity' },
  { id: 'best1m-panel', labelKey: 'market.buildBest1mTitle', buttonId: null },
  { id: 'copy-data-panel', labelKey: 'market.copyData', buttonId: 'btn-panel-copy-data' },
  { id: 'activity-panel', labelKey: 'market.activityLog', buttonId: 'btn-panel-activity' },
];

/** Legacy restorePanel default (:9737). */
export const DEFAULT_ACTIVE_PANEL: PanelId = 'settings-panel';

/** Legacy context exchange default (:9766). */
export const DEFAULT_CONTEXT_EXCHANGE = 'hyperliquid';

/** Legacy settings subsection vocabulary (:3683-3687, persisted :3819). */
export const SETTINGS_SUBSECTIONS: readonly SettingsSubsection[] = ['normal', 'aws', 'tradfi'];

/** Legacy inventory subsection vocabulary (:3688-3693, persisted :3825). */
export const INVENTORY_SUBSECTIONS: readonly InventorySubsection[] = [
  '1m',
  '1m_api',
  'l2Book',
  'pb7_cache',
];

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null; // legacy try/catch (:9738-9742, :3818-3828)
  }
}

function safeSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    /* legacy swallowed storage failures (:9052-9056) */
  }
}

/**
 * Legacy restorePanel read (:9736-9746): stored value, actions-panel remap,
 * existence check against the registry, settings-panel default.
 */
export function readActivePanel(storage: Storage = window.localStorage): PanelId {
  const stored = safeGet(storage, PANEL_STORAGE_KEYS.activePanel);
  if (!stored) return DEFAULT_ACTIVE_PANEL;
  const remapped = stored === 'actions-panel' ? DEFAULT_ACTIVE_PANEL : stored;
  return PANELS.some((panel) => panel.id === remapped) ? (remapped as PanelId) : DEFAULT_ACTIVE_PANEL;
}

/** Legacy setActivePanel persistence write (:9053). */
export function persistActivePanel(storage: Storage, panelId: string): void {
  safeSet(storage, PANEL_STORAGE_KEYS.activePanel, panelId);
}

/**
 * Settings subsection restore (:3819) with the R3 migration-safe vocabulary
 * check: legacy kept any stored string; unknown values now fall back to
 * `normal` so a corrupted key cannot desync the panel nav.
 */
export function readSettingsSubsection(storage: Storage = window.localStorage): SettingsSubsection {
  const stored = safeGet(storage, PANEL_STORAGE_KEYS.settingsSubsection);
  return SETTINGS_SUBSECTIONS.includes(stored as SettingsSubsection)
    ? (stored as SettingsSubsection)
    : 'normal';
}

/** Legacy setActiveSettingsSubsection persistence (:6178). */
export function persistSettingsSubsection(storage: Storage, key: SettingsSubsection): void {
  safeSet(storage, PANEL_STORAGE_KEYS.settingsSubsection, key);
}

/** Inventory subsection restore (:3825) with the R3 migration-safe check. */
export function readInventorySubsection(storage: Storage = window.localStorage): InventorySubsection {
  const stored = safeGet(storage, PANEL_STORAGE_KEYS.inventorySubsection);
  return INVENTORY_SUBSECTIONS.includes(stored as InventorySubsection)
    ? (stored as InventorySubsection)
    : '1m';
}

/** Legacy setActiveInventoryView persistence (:6379). */
export function persistInventorySubsection(storage: Storage, key: InventorySubsection): void {
  safeSet(storage, PANEL_STORAGE_KEYS.inventorySubsection, key);
}

/**
 * Context exchange restore (:9766) — the raw stored key; getExchangeMeta
 * normalizes it at consumption exactly like legacy setContextExchange
 * (:7304-7306). M-data-2 owns the fan-out.
 */
export function readContextExchange(storage: Storage = window.localStorage): string {
  return safeGet(storage, PANEL_STORAGE_KEYS.contextExchange) || DEFAULT_CONTEXT_EXCHANGE;
}

/** Legacy setContextExchange persistence write (:7310). */
export function persistContextExchange(storage: Storage, exchangeKey: string): void {
  safeSet(storage, PANEL_STORAGE_KEYS.contextExchange, exchangeKey);
}

/** Per-panel lifecycle hooks — the setActivePanel lazy-load/poll-stop slice
 *  (:9057-9071) that M-data-5..7 fill in for their panels. */
export interface PanelHooks {
  /** Legacy per-panel lazy loads (e.g. loadIntegrityPanel, loadCopyDataSchedules). */
  onEnter?: () => void;
  /** Legacy poll stops for the panel being left (stopIntegrityPolling,
   *  stopCopyDataSchedulePoll). */
  onLeave?: () => void;
}

export interface UsePanelsOptions {
  storage?: Storage;
  hooks?: Partial<Record<PanelId, PanelHooks>>;
}

export interface UsePanels {
  activePanel: Ref<PanelId>;
  /** Legacy setActivePanel (:9032-9074) — switches, persists, runs hooks. */
  setActivePanel(panelId: PanelId): void;
  /** Legacy restorePanel (:9736-9746) — read + validate + activate. */
  restorePanel(): PanelId;
}

/** The panel router: active-panel state plus the legacy switch semantics. */
export function usePanels(options: UsePanelsOptions = {}): UsePanels {
  const storage = options.storage ?? window.localStorage;
  const hooks = options.hooks ?? {};
  const activePanel = ref<PanelId>(DEFAULT_ACTIVE_PANEL);

  function setActivePanel(panelId: PanelId): void {
    const previous = activePanel.value;
    activePanel.value = panelId;
    persistActivePanel(storage, panelId); // :9052-9056
    // Legacy lazy loads (:9057-9071) run unconditionally on every switch —
    // even re-selecting the active panel re-runs them. Poll stops only
    // matter for the panel being left (legacy stops were idempotent no-ops).
    if (previous !== panelId) hooks[previous]?.onLeave?.();
    hooks[panelId]?.onEnter?.();
  }

  function restorePanel(): PanelId {
    const panelId = readActivePanel(storage);
    setActivePanel(panelId);
    return panelId;
  }

  return { activePanel, setActivePanel, restorePanel };
}
