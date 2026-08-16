import type { TranslateFn } from '../composables/useSettings';
import { fmtBytes } from './format';
import type { OlderPreviewPayload } from './inventoryTypes';

/*
 * M-data-6 — the delete-by-date dialog's preview view model, legacy
 * renderInventoryOlderPreview (market_data_main.html:8253-8311): the scope
 * line (:8263-8270), the selected-coin chips (:8272-8281) and the
 * disabled-reason branches (:8283-8310).
 */

export interface OlderPreviewView {
  /** Scope note above the date field (:8264-8270). */
  scopeText: string;
  /** Whether the selected-coin chip list renders (:8277-8280). */
  showSelection: boolean;
  /** Coin display names for the chips (:8274-8275). */
  selectionItems: string[];
  /** Preview box content (:8284-8309). */
  noteText: string;
  /** Whether the delete-files button is enabled (:8286-8310). */
  canDelete: boolean;
}

export interface OlderPreviewArgs {
  coins: readonly string[];
  coinLabels: readonly string[];
  cutoffDay: string;
  preview: OlderPreviewPayload | null;
  t: TranslateFn;
}

/** Legacy renderInventoryOlderPreview (:8253-8311) as a pure view model. */
export function computeOlderPreviewView(args: OlderPreviewArgs): OlderPreviewView {
  const { coins, coinLabels, cutoffDay, preview, t } = args;

  const scopeText = !coins.length
    ? t('market.selectCoinsInTable') // :8264-8265
    : coins.length === 1
      ? t('market.deleteOlderForCoin', { coin: coinLabels[0] ?? '' }) // :8266-8267
      : t('market.deleteOlderForCoins', { count: coins.length }); // :8268-8269

  let noteText = '';
  let canDelete = false;
  if (!cutoffDay) {
    noteText = t('market.selectCutoffDate'); // :8284
  } else if (!coins.length) {
    noteText = t('market.selectCoinsInTable'); // :8290
  } else if (!preview || preview.success === false) {
    noteText = t('market.previewUnavailable'); // :8296
  } else if (!Number(preview.would_delete_files || 0)) {
    noteText = t('market.noFilesOlder'); // :8302
  } else {
    noteText = t('market.filesSlashSize', {
      files: String(preview.would_delete_files || 0),
      size:
        String(preview.would_delete_size_label || '') || fmtBytes(preview.would_delete_size || 0), // :8309
    });
    canDelete = true; // :8310
  }

  return {
    scopeText,
    showSelection: coins.length > 0, // :8272-8281
    selectionItems: coins.length ? coinLabels.map((coin) => String(coin ?? '')) : [],
    noteText,
    canDelete,
  };
}
