/**
 * Legacy window.PBGuiDialogs bridge (pbgui_dialogs.js, loaded by index.html).
 * The legacy page would throw if the script were missing; index.html always
 * loads it, so the fallbacks are unreachable in practice (confirm → false,
 * alert → resolve).
 */
export interface DialogsGlobal {
  alert?: (options: Record<string, string>) => Promise<unknown>;
  confirm?: (options: Record<string, string>) => Promise<boolean>;
}

function dialogs(): DialogsGlobal {
  return (window as Window & { PBGuiDialogs?: DialogsGlobal }).PBGuiDialogs ?? {};
}

export async function dialogsAlert(options: {
  title: string;
  message: string;
  detail?: string;
  confirmText: string;
}): Promise<void> {
  const alert = dialogs().alert;
  if (typeof alert === 'function') await alert(options);
}

export async function dialogsConfirm(options: {
  title: string;
  message: string;
  detail?: string;
  confirmText: string;
}): Promise<boolean> {
  const confirm = dialogs().confirm;
  if (typeof confirm !== 'function') return false;
  return confirm(options);
}
