/* Legacy PBGuiDialogs confirm via local casts — the welcome-page convention:
   a page's shape must not merge into the global Window type. */

export interface DialogOptions {
  title: string;
  message: string;
  detail?: string;
  confirmText?: string;
}

export function confirmDialog(options: DialogOptions): Promise<boolean> {
  const dialogs = (window as Window & { PBGuiDialogs?: { confirm(opts: DialogOptions): Promise<boolean> } }).PBGuiDialogs;
  if (!dialogs) return Promise.resolve(false);
  return dialogs.confirm(options);
}
