import { ref, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import { getExchangeMeta } from '../lib/exchange';
import { getInventoryQueueActionConfig } from '../lib/inventoryQueueConfig';
import {
  clearDatasetPath,
  deleteOlderPath,
  deleteSelectedPath,
  previewDeleteOlderPath,
} from '../lib/inventoryUrls';
import type {
  L2BookDownloadInfo,
  OlderPreviewPayload,
  QueueResultPayload,
} from '../lib/inventoryTypes';
import type { ConfirmDialogRequest } from './useConfirmDialog';
import type { InventoryViewState } from './useInventoryViewState';
import type { InventorySubsection } from '../types';
import type { ShowToastFn, TranslateFn } from './useSettings';

/*
 * M-data-6 — the inventory panel's destructive + queue actions
 * (legacy market_data_main.html):
 *
 *   openInventoryDeleteOlderDialog :8217-8232
 *   loadInventoryOlderPreview      :8313-8337
 *   runInventoryBuildBest1m        :8388-8472
 *   runInventoryDeleteSelected     :8735-8776
 *   runInventoryDeleteOlder        :8778-8823
 *   runInventoryClearDataset       :8825-8854
 *
 * Deviations (documented):
 *  - the legacy sidebar snapshot (buildBtn.dataset.selectedCoins :8355,
 *    :8391-8397) is dropped — the click reads the live selection, which is
 *    what the snapshot always held at render time;
 *  - setInventoryBox('inventory-build-feedback'/'inventory-delete-feedback')
 *    calls were no-ops in legacy (neither id exists in the DOM) — only the
 *    toasts survive, exactly what the user saw.
 */

export interface UseInventoryActionsOptions {
  api: {
    fetchJson<T>(path: string, init?: RequestInit): Promise<T>;
    fetchHeatmapJson<T>(path: string, init?: RequestInit): Promise<T>;
  };
  t: TranslateFn;
  showToast: ShowToastFn;
  confirm(request?: ConfirmDialogRequest): Promise<boolean>;
  getExchange(): string;
  getViewState(): InventoryViewState;
  getViewKey(): InventorySubsection;
  getSelectedCoins(): string[];
  getCoinLabels(): string[];
  reloadPanel(forceReload: boolean): void;
}

export interface InventoryActionsController {
  olderDialogVisible: Ref<boolean>;
  /** openInventoryDeleteOlderDialog (:8217-8232). */
  openOlderDialog(): void;
  /** closeInventoryDeleteOlderDialog (:8134-8139). */
  closeOlderDialog(): void;
  /** loadInventoryOlderPreview (:8313-8337). */
  loadOlderPreview(): Promise<void>;
  /** runInventoryBuildBest1m (:8388-8472). */
  runBuildBest1m(): Promise<void>;
  /** runInventoryDeleteSelected (:8735-8776). */
  runDeleteSelected(): Promise<void>;
  /** runInventoryDeleteOlder (:8778-8823). */
  runDeleteOlder(): Promise<void>;
  /** runInventoryClearDataset (:8825-8854). */
  runClearDataset(): Promise<void>;
}

function cutoffDigits(cutoffDay: string): string {
  return String(cutoffDay ?? '').replace(/-/g, ''); // :8326, :8808
}

export function useInventoryActions(options: UseInventoryActionsOptions): InventoryActionsController {
  const { api, t, showToast, confirm, getExchange, getViewState, getViewKey, getSelectedCoins, getCoinLabels, reloadPanel } =
    options;

  let olderPreviewRequestId = 0; // inventoryState.olderPreviewRequestId
  const olderDialogVisible = ref(false);

  /** openInventoryDeleteOlderDialog (:8217-8232). */
  function openOlderDialog(): void {
    const coins = getSelectedCoins();
    if (!coins.length) {
      showToast(t('market.selectRowOrCoins'), 'error'); // :8222-8224
      return;
    }
    olderDialogVisible.value = true; // :8229-8230
    // legacy kept the preview warm by refiring the POST from every table
    // render (:8384-8385); the port refreshes on the dialog's real inputs —
    // opening (:8228) and cutoff/selection change (the useInventory watch)
    void loadOlderPreview();
  }

  /** closeInventoryDeleteOlderDialog (:8134-8139). */
  function closeOlderDialog(): void {
    olderDialogVisible.value = false;
  }

  /** loadInventoryOlderPreview (:8313-8337). */
  async function loadOlderPreview(): Promise<void> {
    const viewState = getViewState();
    const scopeCoins = getSelectedCoins();
    viewState.olderPreview = null; // :8316
    if (!viewState.olderCutoffDay || !scopeCoins.length) return; // :8318
    const requestId = ++olderPreviewRequestId; // :8319
    try {
      const preview = await api.fetchJson<OlderPreviewPayload>(previewDeleteOlderPath(getExchange()), {
        method: 'POST',
        body: JSON.stringify({
          view: getViewKey(),
          coins: scopeCoins,
          cutoff_day: cutoffDigits(viewState.olderCutoffDay),
        }),
      }); // :8321-8328
      if (requestId !== olderPreviewRequestId) return; // :8329
      viewState.olderPreview = preview;
    } catch (error) {
      if (requestId !== olderPreviewRequestId) return; // :8333
      viewState.olderPreview = {
        success: false,
        error:
          error instanceof Error && error.message
            ? serverMsg(error.message)
            : t('market.previewFailed'),
      }; // :8334
    }
  }

  /** runInventoryBuildBest1m (:8388-8472). */
  async function runBuildBest1m(): Promise<void> {
    const selectedCoins = Array.from(new Set(getSelectedCoins())); // :8400
    const queueConfig = getInventoryQueueActionConfig(getExchange(), getViewKey());
    const isL2BookAction = queueConfig?.kind === 'l2book';
    if (!selectedCoins.length) {
      showToast(t('market.selectCoinFirst'), 'error'); // :8404-8406
      return;
    }
    if (!queueConfig) {
      showToast(t('market.noQueueAction'), 'error'); // :8408-8410
      return;
    }

    try {
      let requestPayload: Record<string, unknown>;
      if (isL2BookAction) {
        const downloadInfo = await api.fetchHeatmapJson<L2BookDownloadInfo>('/l2book-download-info'); // :8423
        const archiveRange = downloadInfo?.archive_range ?? {}; // :8424
        const startDay = String(archiveRange?.oldest_day ?? '').trim();
        const endDay = String(archiveRange?.newest_day ?? '').trim();
        if (!downloadInfo || downloadInfo.has_aws_creds === false) {
          throw new Error(t('market.awsCredsRequired')); // :8427-8429
        }
        if (!startDay || !endDay) {
          throw new Error(t('market.noArchiveRange')); // :8430-8432
        }
        requestPayload = {
          coins: selectedCoins,
          start_day: startDay,
          end_day: endDay,
          only_missing_1m_src_hours: true,
          skip_archive_preflight: true,
        }; // :8433-8439
      } else {
        requestPayload = {
          coins: selectedCoins,
          selected_only: true,
          start_day: '',
          end_day: '',
          refetch: false,
        }; // :8441-8447
      }
      const requestBody = JSON.stringify(requestPayload); // :8449
      const result =
        queueConfig.api === 'heatmap'
          ? await api.fetchHeatmapJson<QueueResultPayload>(queueConfig.path, { method: 'POST', body: requestBody })
          : await api.fetchJson<QueueResultPayload>(queueConfig.path, { method: 'POST', body: requestBody }); // :8450-8452
      if (!result || result.success === false || result.error) {
        throw new Error(
          result?.error
            ? result.error
            : isL2BookAction
              ? t('market.failedQueueL2book')
              : t('market.failedQueueBest1m')
        ); // :8453-8455
      }
      const message = isL2BookAction
        ? result.message ||
          t('market.queuedL2bookDownload', {
            id: result.job_id,
            count: Number(result.coins_count || selectedCoins.length),
            start: String(result.start_day || '?'),
            end: String(result.end_day || '?'),
          })
        : result.message ||
          t('market.queuedBest1mForCoins', {
            id: result.job_id,
            count: Number(result.coins_count || selectedCoins.length),
          }); // :8456-8458
      showToast(message, 'success'); // :8464
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : isL2BookAction
            ? t('market.failedQueueL2book')
            : t('market.failedQueueBest1m');
      showToast(message, 'error'); // :8468
    }
  }

  /** runInventoryDeleteSelected (:8735-8776). */
  async function runDeleteSelected(): Promise<void> {
    const list = getSelectedCoins();
    const listLabels = getCoinLabels();
    const payload = getViewState().payload ?? {};
    const exchangeMeta = getExchangeMeta(getExchange());
    if (!list.length) {
      showToast(t('market.selectCoinFirst'), 'error'); // :8740-8743
      return;
    }
    if (
      !(await confirm({
        title: list.length === 1 ? t('market.deleteSelectedCoin') : t('market.deleteSelectedCoins'),
        message:
          list.length === 1 ? t('market.deleteSelectedCoinMsg') : t('market.deleteSelectedCoinsMsg'),
        detail: `${String(exchangeMeta.label || getExchange())} • ${String(payload.view_label || getViewKey())}`,
        items: listLabels,
        listLabel: list.length === 1 ? t('market.selectedCoin') : t('market.selectedCoins'),
        confirmText: list.length === 1 ? t('market.deleteCoin') : t('market.deleteCoins'),
      }))
    ) {
      return; // :8744-8753
    }

    try {
      const result = await api.fetchJson<QueueResultPayload>(deleteSelectedPath(getExchange()), {
        method: 'POST',
        body: JSON.stringify({ view: getViewKey(), coins: list }),
      }); // :8757-8763
      if (!result.success) throw new Error(result.error || t('market.failedDeleteSelectedCoins')); // :8764
      showToast(result.message || t('market.selectedCoinsDeleted'), 'success'); // :8765
      const viewState = getViewState();
      viewState.selectedRowIds = []; // :8768
      viewState.olderPreview = null; // :8769
      reloadPanel(true); // :8770
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('market.failedDeleteSelectedCoins');
      showToast(message, 'error'); // :8774
    }
  }

  /** runInventoryDeleteOlder (:8778-8823). */
  async function runDeleteOlder(): Promise<void> {
    const viewState = getViewState();
    const coins = getSelectedCoins();
    const coinLabels = getCoinLabels();
    const payload = viewState.payload ?? {};
    const exchangeMeta = getExchangeMeta(getExchange());
    if (!viewState.olderCutoffDay) {
      showToast(t('market.selectCutoffDate'), 'error'); // :8784-8787
      return;
    }
    if (!coins.length) {
      showToast(t('market.selectRowOrCoins'), 'error'); // :8788-8791
      return;
    }
    if (
      !(await confirm({
        title: t('market.deleteFilesByDate'),
        message: t('market.deleteOlderMsg', { date: viewState.olderCutoffDay }),
        detail: `${String(exchangeMeta.label || getExchange())} • ${String(payload.view_label || getViewKey())}`,
        items: coinLabels,
        listLabel: coins.length === 1 ? t('market.selectedCoin') : t('market.selectedCoins'),
        confirmText: t('market.deleteFiles'),
      }))
    ) {
      return; // :8792-8799
    }

    try {
      const result = await api.fetchJson<QueueResultPayload>(deleteOlderPath(getExchange()), {
        method: 'POST',
        body: JSON.stringify({
          view: getViewKey(),
          coins,
          cutoff_day: cutoffDigits(viewState.olderCutoffDay),
        }),
      }); // :8803-8810
      if (!result.success) throw new Error(result.error || t('market.failedDeleteOldFiles')); // :8811
      showToast(result.message || t('market.oldFilesDeleted'), 'success'); // :8812
      viewState.olderPreview = null; // :8814
      viewState.selectedRowIds = []; // :8815
      closeOlderDialog(); // :8816
      reloadPanel(true); // :8817
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('market.failedDeleteOldFiles');
      showToast(message, 'error'); // :8821
    }
  }

  /** runInventoryClearDataset (:8825-8854). */
  async function runClearDataset(): Promise<void> {
    const payload = getViewState().payload ?? {};
    const label = String(payload.view_label || getViewKey());
    const exchangeMeta = getExchangeMeta(getExchange());
    if (
      !(await confirm({
        title: t('market.clearDataset'),
        message: t('market.clearDatasetMsg', { label }),
        detail: `${String(exchangeMeta.label || getExchange())} • ${t('market.clearDatasetDetail')}`,
        confirmText: t('market.clearDataset'),
      }))
    ) {
      return; // :8829-8834
    }

    try {
      const result = await api.fetchJson<QueueResultPayload>(clearDatasetPath(getExchange()), {
        method: 'POST',
        body: JSON.stringify({ view: getViewKey() }),
      }); // :8838-8841
      if (!result.success) throw new Error(result.error || t('market.failedClearDataset')); // :8842
      showToast(result.message || t('market.datasetCleared'), 'success'); // :8843
      const viewState = getViewState();
      viewState.selectedRowIds = []; // :8846
      viewState.olderPreview = null; // :8847
      reloadPanel(true); // :8848
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('market.failedClearDataset');
      showToast(message, 'error'); // :8852
    }
  }

  return {
    olderDialogVisible,
    openOlderDialog,
    closeOlderDialog,
    loadOlderPreview,
    runBuildBest1m,
    runDeleteSelected,
    runDeleteOlder,
    runClearDataset,
  };
}
