import { serverMsg } from '@/shared/i18n';

/**
 * Shared PBGuiDialogs bridge — the single import path for the legacy global
 * dialog chrome (pbgui_dialogs.js, loaded by each page's index.html).
 * Consolidates the former per-page copies (v7_edit/lib/dialogs.ts,
 * v7_run/lib/dialogs.ts, market_data_status/dialogs.ts).
 *
 * Degrade rules preserved from the page bridges:
 * - alert: returns false when the global is missing so callers can fall back
 *   to their own toast path (never silently lost).
 * - confirm: resolves false when the global is missing so destructive paths
 *   cancel instead of proceeding.
 */

export interface DialogsAlertOptions {
  readonly title: string;
  readonly message: string;
  readonly detail?: string;
  readonly confirmText: string;
}

type DialogsGlobal = typeof globalThis & {
  PBGuiDialogs?: {
    alert?: (options: DialogsAlertOptions) => Promise<unknown> | void;
    confirm?: (options: DialogsAlertOptions) => Promise<boolean>;
  };
};

function dialogs() {
  return (window as DialogsGlobal).PBGuiDialogs ?? {};
}

/** PBGuiDialogs.alert — returns false when the global is unavailable. */
export async function dialogsAlert(options: DialogsAlertOptions): Promise<boolean> {
  const alert = dialogs().alert;
  if (typeof alert !== 'function') return false;
  await alert(options);
  return true;
}

/** PBGuiDialogs.confirm — resolves false when the global is unavailable. */
export async function dialogsConfirm(options: DialogsAlertOptions): Promise<boolean> {
  const confirm = dialogs().confirm;
  if (typeof confirm !== 'function') return false;
  return confirm(options);
}

/** i18n serverMsg bridge (PBGuiI18n.serverMsg parity). */
export { serverMsg };
