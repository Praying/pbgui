import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import { getExchangeMeta } from '../lib/exchange';
import { fmtBytes } from '../lib/format';
import { buildIntegrityJobMonitorUrl } from '../lib/integrityUrlMatrix';
import {
  buildIntegritySummaryCards,
  groupIntegrityIssues,
  type DifferenceRow,
  type IntegrityIssueRow,
  type IssueGroup,
  type SummaryCard,
} from '../lib/integrityView';
import type { ConfirmDialogRequest } from './useConfirmDialog';
import { useIntegrityGapDetails, type IntegrityGapDetailsController } from './useIntegrityGapDetails';
import type { IntegrityPollingController } from './useIntegrityPolling';
import { type ArchiveOption, type IntegrityApi, type IntegrityFeedback } from './useIntegrityShared';
import type { ShowToastFn, TranslateFn } from './useSettings';

export type { ArchiveOption, IntegrityApi, IntegrityFeedback } from './useIntegrityShared';

/*
 * The integrity store — legacy integrityState + integrityDetailState
 * (market_data_main.html:3715-3738) with the whole integrity action core:
 *
 *   loadIntegrityPanel    :4521-4555  4 parallel GETs, stale/exchange guards
 *   saveIntegritySettings :4607-4636  PUT + reloadAfterSave
 *   queueIntegrity*       :4638-4651  POST queue ops (scan/normalize/
 *                                      repair-all/per-coin/publish/reference)
 *   removed-coin manager  :4806-4886  preview → confirm → remove (+the
 *                                      range drag-select :4810-4843)
 *   gap details modal     :4653-4804  open/day-select/close + payload
 *   exchange-change slice :7324-7332  invalidate → clear → forced reload
 *
 * renderIntegrityPanel's form sync (:4310-4327) and selection pruning
 * (:4361-4363) run in applyRenderIntegrity; every other render slice is a
 * computed over the payload refs (lib/integrityView).
 *
 * The 2 s poll lives in useIntegrityPolling; queue ops and removals mark it
 * active (:4644, :4879) and (re)start it (:4645, :4880).
 */

/** GET/PUT /checksums/settings payload (:4295). */
export interface ChecksumSettingsPayload {
  publish_enabled?: unknown;
  publish_archive?: unknown;
  reference_archive?: unknown;
  archives?: unknown;
  catalog?: CatalogSummary | null;
  reference?: ReferenceMeta | null;
  [key: string]: unknown;
}

export interface CatalogSummary {
  initial_scan_complete?: unknown;
  counts?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ReferenceMeta {
  selected_repository?: unknown;
  matches_selected?: unknown;
  [key: string]: unknown;
}

/** GET /integrity/status payload. */
export interface IntegrityStatusPayload {
  catalog?: CatalogSummary | null;
  comparison?: { counts?: Record<string, unknown> | null; differences?: unknown } | null;
  reference?: ReferenceMeta | null;
  [key: string]: unknown;
}

/** One removed-market row (:4355). */
export interface RemovedCoinRow {
  exchange?: unknown;
  coin?: unknown;
  files?: unknown;
  bytes?: unknown;
  from_day?: unknown;
  to_day?: unknown;
  market_reason?: unknown;
  removable?: unknown;
  [key: string]: unknown;
}

/** Formatted removed-market row for the table. */
export interface RemovedCoinViewRow {
  exchange: string;
  coin: string;
  files: string;
  size: string;
  fromDay: string;
  toDay: string;
  reason: string;
  removable: boolean;
}

export interface RemovedCoinsPayload {
  rows?: unknown;
  mapping_status?: unknown;
  mapping_reason?: unknown;
  [key: string]: unknown;
}

export interface IssuesPayload {
  rows?: unknown;
  [key: string]: unknown;
}

/** POST /integrity/removed-coins/preview payload (:4853-4859). */
export interface RemovedPreviewPayload {
  coin_count?: unknown;
  files?: unknown;
  bytes?: unknown;
  from_day?: unknown;
  to_day?: unknown;
  blocked_count?: unknown;
  coins?: unknown;
  [key: string]: unknown;
}

export interface UseIntegrityOptions {
  api: IntegrityApi;
  t: TranslateFn;
  showToast: ShowToastFn;
  confirm(request?: ConfirmDialogRequest): Promise<boolean>;
  /** uiState.contextExchange reader — normalized through getExchangeMeta. */
  getExchange: () => string;
  /** PBGUI_SERIAL for the job-monitor iframe (:4241). */
  serial: () => string;
  polling: IntegrityPollingController;
  now?: () => number;
}

export interface IntegrityController extends IntegrityGapDetailsController {
  /* state */
  exchange: Ref<string>;
  isSaving: Ref<boolean>;
  feedback: Ref<IntegrityFeedback>;
  form: {
    publishEnabled: Ref<boolean>;
    publishArchive: Ref<string>;
    referenceArchive: Ref<string>;
  };
  jobMonitorSrc: Ref<string>;

  /* view models */
  meta: ComputedRef<{ statusKey: string; label: string }>;
  isHyperliquid: ComputedRef<boolean>;
  descriptionText: ComputedRef<string>;
  removedNoteText: ComputedRef<string>;
  summaryCards: ComputedRef<readonly SummaryCard[]>;
  archiveOptions: ComputedRef<{ publish: readonly ArchiveOption[]; reference: readonly ArchiveOption[] }>;
  publishDisabled: ComputedRef<boolean>;
  referenceDisabled: ComputedRef<boolean>;
  removedRows: ComputedRef<readonly RemovedCoinViewRow[]>;
  removableCoins: ComputedRef<readonly string[]>;
  removedCountText: ComputedRef<string>;
  removedEmptyMessage: ComputedRef<string>;
  selectedRemovedCount: ComputedRef<number>;
  removeSelectedDisabled: ComputedRef<boolean>;
  removeSelectedLabelText: ComputedRef<string>;
  removeAllDisabled: ComputedRef<boolean>;
  issueGroups: ComputedRef<readonly IssueGroup[]>;
  issueCountText: ComputedRef<string>;
  repairAllDisabled: ComputedRef<boolean>;
  issuesEmptyText: ComputedRef<string>;
  differences: ComputedRef<readonly DifferenceRow[]>;
  differenceCountText: ComputedRef<string>;
  differencesEmptyText: ComputedRef<string>;

  /* actions */
  loadIntegrityPanel(forceMonitor?: boolean): Promise<void>;
  saveIntegritySettings(): Promise<void>;
  queueScan(): Promise<void>;
  queueNormalizeFallback(): Promise<void>;
  queueRepairAll(): Promise<void>;
  queueRepairCoin(exchange: string, coin: string): Promise<void>;
  queuePublish(): Promise<void>;
  queueReference(): Promise<void>;
  removeUnavailableIntegrityCoin(exchange: string, coin: string): Promise<void>;
  removeUnavailableIntegrityCoins(exchange: string, coins: readonly string[], removeAll: boolean): Promise<void>;
  /** #btn-integrity-remove-selected click (:9260-9266). */
  removeSelectedRemovedCoins(): Promise<void>;
  /** #btn-integrity-remove-all click (:9267-9269). */
  removeAllRemovedCoins(): Promise<void>;
  onExchangeChange(statusKey: string): void;
  handleDeleteKey(event: KeyboardEvent, panelActive: boolean): Promise<void>;

  /* removed-coin selection + range drag */
  isRemovedCoinSelected(coin: string): boolean;
  toggleRemovedCoin(coin: string): void;
  handleRemovedRowMouseDown(event: MouseEvent, coin: string): void;
  handleRemovedTableMouseMove(event: MouseEvent): void;
  handleRemovedMouseUp(): void;

}

/** Legacy drag sweep threshold (:9230) — vertical px. */
const REMOVED_DRAG_THRESHOLD_PX = 5;

export function useIntegrity(options: UseIntegrityOptions): IntegrityController {
  const { api, t, showToast, confirm, polling } = options;
  const now = options.now ?? Date.now;

  /* ── state (:3715-3738) ── */
  const exchange = ref('bybit'); // :3718
  const settings = ref<ChecksumSettingsPayload | null>(null); // :3716
  const status = ref<IntegrityStatusPayload | null>(null); // :3717
  const issues = ref<readonly IntegrityIssueRow[]>([]); // :3719
  const removedCoins = ref<readonly RemovedCoinRow[]>([]); // :3720
  const removedMappingStatus = ref(''); // :3721
  const removedMappingReason = ref(''); // :3722
  const selectedRemovedCoins = ref<ReadonlySet<string>>(new Set()); // :3723
  const isSaving = ref(false); // :3728
  const feedback = ref<IntegrityFeedback>({ message: '', level: 'info' });
  const publishEnabled = ref(false);
  const publishArchive = ref('');
  const referenceArchive = ref('');
  const jobMonitorSrc = ref('');
  let requestId = 0; // :3727
  let reloadAfterSave = false; // :3729

  /* removed-coin drag (:3724-3726) */
  let removedDragStart: { coin: string; y: number } | null = null;
  let removedDragSelecting = false;
  let removedDragMode: 'add' | 'remove' | null = null;

  /* ── helpers ── */

  function statusKeyNow(): string {
    return getExchangeMeta(options.getExchange()).statusKey;
  }

  function messageOr(error: unknown, fallback: string): string {
    const message = error instanceof Error && error.message ? serverMsg(error.message) : '';
    return message || fallback;
  }

  function setFeedback(message: string, level: IntegrityFeedback['level']): void {
    feedback.value = { message, level }; // setIntegrityFeedback :4252-4258
  }

  /* ── view models (:4294-4519) ── */

  const meta = computed(() => getExchangeMeta(exchange.value || options.getExchange())); // :4297
  const isHyperliquid = computed(() => meta.value.statusKey === 'hyperliquid');
  // canRepair is hardcoded true in legacy (:4298-4301) — the read-only
  // description/finding branches are dead and stay unported.
  const descriptionText = computed(() =>
    t('market.integrityDescriptionRepair', { exchange: meta.value.label })
  );
  const removedNoteText = computed(() =>
    t('market.removedNoteParam', { exchange: meta.value.label })
  );

  const catalog = computed<CatalogSummary>(() => status.value?.catalog ?? settings.value?.catalog ?? {}); // :4331
  const scanComplete = computed(() => Boolean(catalog.value.initial_scan_complete));
  const comparison = computed(() => status.value?.comparison ?? null);

  const summaryCards = computed<readonly SummaryCard[]>(() =>
    buildIntegritySummaryCards(
      {
        meta: meta.value,
        counts: catalog.value.counts,
        scanComplete: scanComplete.value,
        comparisonCounts: comparison.value?.counts ?? null,
        referenceMeta: (status.value?.reference ?? settings.value?.reference ?? {}) as ReferenceMeta, // :4343
      },
      t
    )
  );

  /** fillArchiveSelect option lists (:4260-4276). */
  function archiveOptionsOf(predicate: (row: RemovedCoinRowLike) => boolean): ArchiveOption[] {
    const archives = Array.isArray(settings.value?.archives)
      ? (settings.value.archives as RemovedCoinRowLike[])
      : [];
    return archives.filter(predicate).map((archive) => ({
      value: String(archive.name ?? ''),
      label: `${String(archive.name ?? '')} (${String(archive.repository ?? '')})`,
    }));
  }

  interface RemovedCoinRowLike {
    name?: unknown;
    repository?: unknown;
    can_publish?: unknown;
    can_reference?: unknown;
  }

  const archiveOptions = computed(() => ({
    publish: [
      { value: '', label: t('market.noPublishArchive') },
      ...archiveOptionsOf((row) => Boolean(row.can_publish)),
    ],
    reference: [
      { value: '', label: t('market.noReferenceArchive') },
      ...archiveOptionsOf((row) => Boolean(row.can_reference)),
    ],
  }));

  const publishDisabled = computed(() => !settings.value?.publish_archive); // :4326
  const referenceDisabled = computed(() => !settings.value?.reference_archive); // :4327

  const removedRows = computed<readonly RemovedCoinViewRow[]>(() =>
    removedCoins.value.map((row) => ({
      exchange: String(row.exchange ?? ''),
      coin: String(row.coin ?? ''),
      files: String(row.files ?? ''),
      size: fmtBytes(row.bytes), // :4386
      fromDay: String(row.from_day ?? ''),
      toDay: String(row.to_day ?? ''),
      reason: String(row.market_reason ?? ''),
      removable: row.removable !== false,
    }))
  );

  const removableCoins = computed<readonly string[]>(() =>
    removedCoins.value
      .filter((row) => row.removable !== false)
      .map((row) => String(row.coin ?? ''))
      .filter(Boolean)
  ); // :4356-4360

  const selectedRemovedCount = computed(() => selectedRemovedCoins.value.size);
  const removeSelectedDisabled = computed(() => selectedRemovedCount.value === 0); // :4822
  const removeSelectedLabelText = computed(() =>
    selectedRemovedCount.value
      ? t('market.removeSelectedCount', { count: selectedRemovedCount.value })
      : t('market.removeSelected')
  ); // :4823
  const removeAllDisabled = computed(() => removableCoins.value.length === 0); // :4824
  const removedCountText = computed(() =>
    t('market.removedCount', { count: removedCoins.value.length })
  ); // :4364
  const removedEmptyMessage = computed(() => {
    if (removedCoins.value.length) return '';
    return removedMappingStatus.value === 'unknown'
      ? removedMappingReason.value || t('market.mappingUnavailable', { exchange: meta.value.label })
      : t('market.noRemovedMarkets');
  }); // :4370-4372

  const issueGroups = computed(() => groupIntegrityIssues(issues.value));
  const issueCountText = computed(() =>
    t('market.issueCount', { coins: issueGroups.value.length, days: issues.value.length })
  ); // :4438
  const repairAllDisabled = computed(() => issues.value.length === 0); // :4439
  const issuesEmptyText = computed(() =>
    scanComplete.value ? t('market.noDamagedDays') : t('market.scanNotComplete')
  ); // :4445

  const differences = computed<readonly DifferenceRow[]>(() => {
    const rows = Array.isArray(comparison.value?.differences)
      ? (comparison.value?.differences as Record<string, unknown>[])
      : [];
    return rows.map((row) => ({
      kind: String(row.kind ?? ''),
      exchange: String(row.exchange ?? ''),
      coin: String(row.coin ?? ''),
      day: String(row.day ?? ''),
    }));
  });

  const differenceCountText = computed(() => {
    const counts = comparison.value?.counts ?? {};
    const total =
      Number(counts.local_only ?? 0) + Number(counts.reference_only ?? 0) + Number(counts.mismatch ?? 0);
    return t('market.differenceCount', { count: total });
  }); // :4496-4499

  const differencesEmptyText = computed(() =>
    comparison.value ? t('market.noDifferences') : t('market.noReferenceComparison')
  ); // :4505

  /* ── render form sync (:4310-4327) + selection prune (:4361-4363) ── */

  function applyRenderIntegrity(): void {
    const payload = settings.value ?? {};
    publishEnabled.value = Boolean(payload.publish_enabled);
    const publishNames = new Set(archiveOptions.value.publish.map((o) => o.value));
    const referenceNames = new Set(archiveOptions.value.reference.map((o) => o.value));
    const publishName = String(payload.publish_archive ?? '');
    const referenceName = String(payload.reference_archive ?? '');
    publishArchive.value = publishNames.has(publishName) ? publishName : ''; // :4274-4275
    referenceArchive.value = referenceNames.has(referenceName) ? referenceName : '';
    const removable = new Set(removableCoins.value);
    selectedRemovedCoins.value = new Set(
      [...selectedRemovedCoins.value].filter((coin) => removable.has(coin))
    );
  }

  /* ── job monitor mount (:4234-4250) ── */

  function mountJobMonitor(forceReload: boolean): void {
    const url = buildIntegrityJobMonitorUrl({
      statusKey: statusKeyNow(), // :4237 — the context exchange, not integrityState
      serial: options.serial(),
      forceReload,
      now,
    });
    if (forceReload || jobMonitorSrc.value !== url) jobMonitorSrc.value = url; // :4246-4249
  }

  /* ── loadIntegrityPanel (:4521-4555) ── */

  async function loadIntegrityPanel(forceMonitor: boolean): Promise<void> {
    if (isSaving.value) {
      reloadAfterSave = true; // :4522-4524
      return;
    }
    const storageExchange = statusKeyNow(); // :4526-4528
    exchange.value = storageExchange;
    requestId += 1;
    const id = requestId;
    setFeedback(t('market.loadingIntegrityCatalog'), 'info'); // :4530
    try {
      const payloads = await Promise.all([
        api.fetchJson<ChecksumSettingsPayload>('/checksums/settings'), // :4533
        api.fetchJson<IntegrityStatusPayload>(
          `/integrity/status?exchange=${encodeURIComponent(storageExchange)}`
        ),
        api.fetchJson<RemovedCoinsPayload>(
          `/integrity/removed-coins?exchange=${encodeURIComponent(storageExchange)}`
        ),
        api.fetchJson<IssuesPayload>(
          `/integrity/issues?exchange=${encodeURIComponent(storageExchange)}&limit=1000000`
        ),
      ]);
      if (id !== requestId || statusKeyNow() !== storageExchange) return; // :4538
      settings.value = payloads[0];
      status.value = payloads[1];
      removedCoins.value = Array.isArray(payloads[2].rows) ? (payloads[2].rows as RemovedCoinRow[]) : [];
      removedMappingStatus.value = String(payloads[2].mapping_status ?? '');
      removedMappingReason.value = String(payloads[2].mapping_reason ?? '');
      issues.value = (Array.isArray(payloads[3].rows) ? (payloads[3].rows as IntegrityIssueRow[]) : []).filter(
        (row) => String(row.market_status ?? '') !== 'removed' // :4544-4546
      );
      applyRenderIntegrity();
      setFeedback('', 'info'); // :4549
      mountJobMonitor(forceMonitor === true); // :4550
    } catch (error) {
      if (id !== requestId) return;
      setFeedback(messageOr(error, t('market.failedIntegrityStatus')), 'error'); // :4553
    }
  }

  /* ── saveIntegritySettings (:4607-4636) ── */

  async function saveIntegritySettings(): Promise<void> {
    if (isSaving.value) return; // :4608-4609
    isSaving.value = true;
    requestId += 1;
    const id = requestId;
    try {
      const result = await api.fetchJson<{ settings?: ChecksumSettingsPayload }>(
        '/checksums/settings',
        {
          method: 'PUT',
          body: JSON.stringify({
            publish_enabled: Boolean(publishEnabled.value), // :4616
            publish_archive: String(publishArchive.value ?? ''),
            reference_archive: String(referenceArchive.value ?? ''),
          }),
        }
      );
      if (id !== requestId) return; // :4621
      settings.value = result.settings ?? {}; // :4622
      applyRenderIntegrity(); // :4623
      showToast(t('market.checksumSaved'), 'success'); // :4624
    } catch (error) {
      if (id !== requestId) return;
      showToast(messageOr(error, t('market.failedSaveChecksum')), 'error'); // :4627
    } finally {
      isSaving.value = false;
      if (reloadAfterSave) {
        reloadAfterSave = false;
        void loadIntegrityPanel(true); // :4631-4634
      }
    }
  }

  /* ── queueIntegrityOperation (:4638-4651) ── */

  async function queueOperation(
    path: string,
    body: Record<string, unknown> | null,
    successMessage: string
  ): Promise<void> {
    try {
      const result = await api.fetchJson<{ created?: boolean }>(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined, // :4641-4643
      });
      polling.markActiveJob(); // :4644
      polling.start(); // :4645
      showToast(
        result?.created === false ? t('market.jobAlreadyActive') : successMessage,
        'success'
      ); // :4646
      mountJobMonitor(true); // :4647
    } catch (error) {
      showToast(messageOr(error, t('market.unableQueueIntegrity')), 'error'); // :4649
    }
  }

  async function queueScan(): Promise<void> {
    await queueOperation('/integrity/scan', { exchange: statusKeyNow() }, t('market.integrityScanQueued')); // :9142
  }

  async function queueNormalizeFallback(): Promise<void> {
    if (statusKeyNow() !== 'hyperliquid') return; // :9145
    const capturedRequestId = requestId;
    const confirmed = await confirm({
      title: t('market.normalizeFallbackTitle'),
      message: t('market.normalizeFallbackMsg'),
      detail: t('market.normalizeFallbackDetail'),
      items: [t('market.hyperliquidCrypto')],
      listLabel: t('market.dataset'),
      confirmText: t('market.normalizeCandles'),
    }); // :9147-9154
    if (!confirmed) return;
    if (capturedRequestId !== requestId || statusKeyNow() !== 'hyperliquid') return; // :9155-9158
    await queueOperation('/integrity/hyperliquid/normalize-fallback', null, t('market.fallbackNormalizationQueued')); // :9159-9163
  }

  async function queueRepairAll(): Promise<void> {
    await queueOperation('/integrity/repair-all', { exchange: statusKeyNow() }, t('market.repairAllQueued')); // :9167
  }

  async function queueRepairCoin(exchangeName: string, coin: string): Promise<void> {
    await queueOperation(
      '/integrity/repair-all',
      { exchange: String(exchangeName ?? ''), coin: String(coin ?? '') },
      t('market.coinRepairQueued')
    ); // :9189-9196
  }

  async function queuePublish(): Promise<void> {
    await queueOperation('/checksums/publish', null, t('market.checksumPubQueued')); // :9173
  }

  async function queueReference(): Promise<void> {
    await queueOperation('/checksums/reference', null, t('market.referenceRefreshQueued')); // :9176
  }

  /* ── removed-coin removal (:4806-4886) ── */

  async function removeUnavailableIntegrityCoins(
    exchangeName: string,
    coins: readonly string[],
    removeAll: boolean
  ): Promise<void> {
    const capturedRequestId = requestId; // :4846
    const selectedExchange = statusKeyNow(); // :4847
    if (exchangeName !== selectedExchange) return; // :4848
    const requestBody = removeAll
      ? { exchange: exchangeName, all: true }
      : { exchange: exchangeName, coins: [...new Set(coins ?? [])] }; // :4849-4851
    try {
      const preview = await api.fetchJson<RemovedPreviewPayload>('/integrity/removed-coins/preview', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      const period =
        preview.from_day && preview.to_day ? `, ${String(preview.from_day)} to ${String(preview.to_day)}` : '';
      const blocked = Number(preview.blocked_count ?? 0);
      const confirmed = await confirm({
        title: t('market.removeUnavailableTitle'),
        message: t('market.removeUnavailableMessage', { count: Number(preview.coin_count ?? 0) }),
        detail:
          t('market.filesAndSize', { files: Number(preview.files ?? 0), size: fmtBytes(preview.bytes ?? 0) }) +
          period +
          (blocked ? `. ${t('market.unsafeRowsExcluded', { count: blocked })}` : '') +
          ` ${t('market.runtimeCachesNotRemoved')}`,
        items: Array.isArray(preview.coins) ? preview.coins : [],
        listLabel: t('market.unavailableMarkets'),
        confirmText: t('market.removeMarketData'),
      }); // :4861-4868
      if (!confirmed) return;
      if (capturedRequestId !== requestId || statusKeyNow() !== selectedExchange) return; // :4869-4872
      const queued = await api.fetchJson<{ created?: boolean }>('/integrity/removed-coins/remove', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      selectedRemovedCoins.value = new Set(); // :4877
      polling.markActiveJob(); // :4879
      polling.start(); // :4880
      showToast(
        queued?.created === false ? t('market.jobAlreadyActive') : t('market.unavailableDeletionQueued'),
        'success'
      ); // :4881
      mountJobMonitor(true); // :4882
    } catch (error) {
      showToast(messageOr(error, t('market.unablePrepareUnavailable')), 'error'); // :4884
    }
  }

  function removeUnavailableIntegrityCoin(exchangeName: string, coin: string): Promise<void> {
    return removeUnavailableIntegrityCoins(exchangeName, [coin], false); // :4806-4808
  }

  function removeSelectedRemovedCoins(): Promise<void> {
    return removeUnavailableIntegrityCoins(statusKeyNow(), [...selectedRemovedCoins.value], false); // :9261-9265
  }

  function removeAllRemovedCoins(): Promise<void> {
    return removeUnavailableIntegrityCoins(statusKeyNow(), [], true); // :9268
  }

  /* ── removed-coin selection + range drag (:4810-4843, :9217-9259) ── */

  function isRemovedCoinSelected(coin: string): boolean {
    return selectedRemovedCoins.value.has(coin);
  }

  function toggleRemovedCoin(coin: string): void {
    const next = new Set(selectedRemovedCoins.value);
    if (next.has(coin)) next.delete(coin);
    else next.add(coin);
    selectedRemovedCoins.value = next; // :9244-9245
  }

  function applyRemovedCoinSelectionRange(targetCoin: string): void {
    if (!removedDragStart) return; // :4828-4829
    const coins = removableCoins.value;
    const startIndex = coins.indexOf(removedDragStart.coin);
    const targetIndex = coins.indexOf(targetCoin);
    if (startIndex < 0 || targetIndex < 0) return; // :4833
    const first = Math.min(startIndex, targetIndex);
    const last = Math.max(startIndex, targetIndex);
    const next = new Set(selectedRemovedCoins.value);
    for (let index = first; index <= last; index += 1) {
      const coin = coins[index];
      if (!coin) continue; // :4837-4838
      if (removedDragMode === 'remove') next.delete(coin);
      else next.add(coin);
    }
    selectedRemovedCoins.value = next;
  }

  function handleRemovedRowMouseDown(event: MouseEvent, coin: string): void {
    if (event.button !== 0) return; // :9218
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('button')) return; // :9218
    if (!coin) return;
    removedDragStart = { coin, y: event.clientY }; // :9222
    removedDragSelecting = false; // :9223
    removedDragMode = selectedRemovedCoins.value.has(coin) ? 'remove' : 'add'; // :9224
    event.preventDefault(); // :9225
  }

  function handleRemovedTableMouseMove(event: MouseEvent): void {
    if (!removedDragStart) return; // :9228-9229
    if (!removedDragSelecting && Math.abs(event.clientY - removedDragStart.y) > REMOVED_DRAG_THRESHOLD_PX) {
      removedDragSelecting = true; // :9230-9232
    }
    if (!removedDragSelecting) return;
    const row = (event.target as HTMLElement | null)?.closest?.('[data-integrity-removed-row]');
    const coin = row ? String(row.getAttribute('data-coin') ?? '') : '';
    if (coin) applyRemovedCoinSelectionRange(coin); // :9234-9235
  }

  function handleRemovedMouseUp(): void {
    if (!removedDragStart) return; // :9249
    if (!removedDragSelecting) toggleRemovedCoin(removedDragStart.coin); // :9251-9254
    removedDragStart = null;
    removedDragSelecting = false;
    removedDragMode = null;
  }

  /** Document Delete key (:9270-9283). */
  async function handleDeleteKey(event: KeyboardEvent, panelActive: boolean): Promise<void> {
    if (event.key !== 'Delete' || selectedRemovedCoins.value.size === 0) return; // :9271
    const active = event.target as HTMLElement | null;
    const tag = String(active?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || active?.isContentEditable) return; // :9272-9274
    if (!panelActive) return; // :9275-9276
    event.preventDefault();
    await removeUnavailableIntegrityCoins(statusKeyNow(), [...selectedRemovedCoins.value], false); // :9278-9282
  }

  /* gap details modal (:4653-4804) — useIntegrityGapDetails owns it */
  const gap = useIntegrityGapDetails({ api, t, issues });

  /* ── exchange-change slice (:7324-7332) ── */

  function onExchangeChange(statusKey: string): void {
    requestId += 1; // :7325
    exchange.value = statusKey; // :7326
    status.value = null; // :7327
    issues.value = []; // :7328
    removedCoins.value = []; // :7329
    selectedRemovedCoins.value = new Set(); // :7330 render → prune to nothing
    void loadIntegrityPanel(true); // :7331
  }

  return {
    exchange,
    isSaving,
    feedback,
    form: { publishEnabled, publishArchive, referenceArchive },
    jobMonitorSrc,
    meta,
    isHyperliquid,
    descriptionText,
    removedNoteText,
    summaryCards,
    archiveOptions,
    publishDisabled,
    referenceDisabled,
    removedRows,
    removableCoins,
    removedCountText,
    removedEmptyMessage,
    selectedRemovedCount,
    removeSelectedDisabled,
    removeSelectedLabelText,
    removeAllDisabled,
    issueGroups,
    issueCountText,
    repairAllDisabled,
    issuesEmptyText,
    differences,
    differenceCountText,
    differencesEmptyText,
    loadIntegrityPanel,
    saveIntegritySettings,
    queueScan,
    queueNormalizeFallback,
    queueRepairAll,
    queueRepairCoin,
    queuePublish,
    queueReference,
    removeUnavailableIntegrityCoin,
    removeUnavailableIntegrityCoins,
    removeSelectedRemovedCoins,
    removeAllRemovedCoins,
    onExchangeChange,
    handleDeleteKey,
    isRemovedCoinSelected,
    toggleRemovedCoin,
    handleRemovedRowMouseDown,
    handleRemovedTableMouseMove,
    handleRemovedMouseUp,
    ...gap,
  };
}
