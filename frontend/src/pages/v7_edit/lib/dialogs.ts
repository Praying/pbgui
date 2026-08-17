import { serverMsg } from '@/shared/i18n';

/**
 * PBGuiDialogs bridge — the page keeps the legacy global dialog chrome
 * (pbgui_dialogs.js, loaded in index.html like v7_run). The 409
 * "Update your VPS first" save/copy blocks use alert(); a missing global
 * falls back to the caller's toast path (never silently lost).
 */

interface AlertOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmText: string;
}

type DialogsGlobal = typeof globalThis & {
  PBGuiDialogs?: { alert?: (options: AlertOptions) => void };
};

/** PBGuiDialogs.alert — returns false when the global is unavailable. */
export function dialogsAlert(options: AlertOptions): boolean {
  const dialogs = (window as DialogsGlobal).PBGuiDialogs;
  if (!dialogs || typeof dialogs.alert !== 'function') return false;
  dialogs.alert(options);
  return true;
}

/** i18n serverMsg bridge (PBGuiI18n.serverMsg parity). */
export { serverMsg };
