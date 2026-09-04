/**
 * PBGuiDialogs bridge — now a thin re-export of the shared module
 * (src/shared/lib/dialogs.ts). Kept as a page-local path so existing
 * imports (`../lib/dialogs`) need no churn.
 */
export { dialogsAlert, dialogsConfirm, serverMsg } from '@/shared/lib/dialogs';
export type { DialogsAlertOptions as AlertOptions } from '@/shared/lib/dialogs';
