/**
 * Legacy `confirmDialog(options)` → window.PBGuiDialogs.confirm bridge
 * (pbgui_dialogs.js, loaded by index.html). Same contract as the
 * dashboard_templates page-local helper.
 */
export function dialogsConfirm(options: {
  title: string;
  message: string;
  detail?: string;
  confirmText: string;
}): Promise<boolean> {
  const dialogs = (window as Window & {
    PBGuiDialogs?: { confirm?: (o: unknown) => Promise<boolean> };
  }).PBGuiDialogs;
  if (!dialogs || typeof dialogs.confirm !== 'function') return Promise.resolve(false);
  return dialogs.confirm(options);
}
