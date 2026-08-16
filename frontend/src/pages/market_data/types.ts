/** Page-level types for the market_data workbench (M-data-1 scaffold). */

/** Legacy panel ids verbatim (DOM sections :2979-3593, sectionButtons :3674-3682). */
export type PanelId =
  | 'settings-panel'
  | 'status-panel'
  | 'inventory-panel'
  | 'integrity-panel'
  | 'best1m-panel'
  | 'copy-data-panel'
  | 'activity-panel';

/** One sectionButtons entry (:3674-3682). best1m has no sidebar button — it is
 *  reached through the #sidebar-best-1m-link shortcut (:2946, :9112-9115). */
export interface PanelDef {
  id: PanelId;
  /** vue-i18n key of the legacy PBGuiI18n.t label. */
  labelKey: string;
  /** Legacy sidebar button element id; null for the best1m shortcut link. */
  buttonId: string | null;
}

/** Legacy toast levels (showToast :4983-5002; the page passes
 *  success/error/info/warning — class names are rendered verbatim). */
export type ToastLevel = 'info' | 'success' | 'error' | 'warn' | 'warning';

/** Reactive toast item driving ToastStack (legacy DOM lifecycle :4987-5001). */
export interface ToastItem {
  id: number;
  message: string;
  level: ToastLevel;
  leaving: boolean;
}

/** Settings panel subsections (:3683-3687, persisted :3819). */
export type SettingsSubsection = 'normal' | 'aws' | 'tradfi';

/** Inventory panel dataset views (:3688-3693, persisted :3825). */
export type InventorySubsection = '1m' | '1m_api' | 'l2Book' | 'pb7_cache';

/** One exchangeOptions entry (:3667-3673). */
export interface ExchangeOption {
  key: string;
  statusKey: string;
  label: string;
}
