/**
 * PBGuiDialogs bridge — the page keeps the legacy shared dialog chrome
 * (pbgui_dialogs.js, loaded in index.html). Rewind/delete/approve flows
 * use confirm(); a missing global resolves false so destructive paths
 * degrade to "cancelled" instead of proceeding (same contract as
 * v7_edit/lib/dialogs.ts).
 */

interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly detail?: string;
  readonly confirmText: string;
}

type DialogsGlobal = typeof globalThis & {
  PBGuiDialogs?: {
    confirm?: (options: ConfirmOptions) => Promise<boolean>;
  };
};

export async function dialogsConfirm(options: ConfirmOptions): Promise<boolean> {
  const dialogs = (window as DialogsGlobal).PBGuiDialogs;
  if (!dialogs || typeof dialogs.confirm !== 'function') return false;
  return await dialogs.confirm(options);
}
