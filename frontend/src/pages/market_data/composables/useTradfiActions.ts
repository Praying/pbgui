import type { ComputedRef, Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import type { TradfiRow } from '../lib/tradfiFilters';
import type {
  ShowToastFn,
  TradfiActionResponse,
  TradfiApi,
  TradfiSpecsPayload,
  TranslateFn,
} from './useTradfiMap';

/*
 * The TradFi action layer (market_data_main.html :6754-6975), split from
 * useTradfiMap along the reviewer-identified seam: the uniform runAction
 * envelope, the seven action endpoint wrappers (test-resolve, start dates
 * one/all, spec/metadata/price refresh, auto-map) and the specs window
 * (loadSpecsView). All state (refs) stays in useTradfiMap and is injected
 * here; useTradfiMap wires the two together so consumers keep importing
 * the combined composable from './useTradfiMap'.
 */

function text(value: unknown): string {
  return String(value ?? '');
}

/** The useTradfiMap controller slices the action layer operates on. */
export interface UseTradfiActionsOptions {
  api: TradfiApi;
  t: TranslateFn;
  showToast: ShowToastFn;
  /** Legacy isTiingoConfigured (:6390) — the Tiingo controller owns it. */
  isTiingoConfigured(): boolean;
  selectedRow: ComputedRef<TradfiRow | null>;
  windowMode: Ref<'' | 'search' | 'specs'>;
  specsPayload: Ref<TradfiSpecsPayload | null>;
  specsLoadingMessage: Ref<string>;
  applyResultPayload(result: TradfiActionResponse | null | undefined): void;
  setActionResult(
    level: string | undefined,
    title: unknown,
    details?: unknown,
    groups?: unknown
  ): void;
}

export interface UseTradfiActions {
  testResolve(): Promise<void>;
  fetchStartDate(): Promise<void>;
  fetchAllStartDates(): Promise<void>;
  refreshSpecs(): Promise<void>;
  autoMap(): Promise<void>;
  refreshMetadata(): Promise<void>;
  refreshPrices(): Promise<void>;
  loadSpecsView(): Promise<void>;
}

export function useTradfiActions(options: UseTradfiActionsOptions): UseTradfiActions {
  const {
    api,
    t,
    showToast,
    selectedRow,
    windowMode,
    specsPayload,
    specsLoadingMessage,
    applyResultPayload,
    setActionResult,
  } = options;

  /* ── action endpoints (:6754-6953) ── */

  /**
   * Uniform envelope handling shared by every action endpoint: POST →
   * success guard → applyTradfiPayload → per-action render; failures render
   * the legacy error box + toast pair (serverMsg(err) or the fallback key).
   */
  async function runAction(
    path: string,
    body: Record<string, unknown>,
    fallbackKey: string,
    onSuccess: (result: TradfiActionResponse) => void
  ): Promise<void> {
    try {
      const result = await api.fetchJson<TradfiActionResponse>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!result.success) {
        throw new Error(result.error || t(fallbackKey));
      }
      applyResultPayload(result);
      onSuccess(result);
    } catch (error) {
      const message =
        error instanceof Error && error.message ? serverMsg(error.message) : '';
      setActionResult('error', message || t(fallbackKey), []);
      showToast(message || t(fallbackKey), 'error');
    }
  }

  /** testTradfiResolve (:6754-6781). */
  async function testResolve(): Promise<void> {
    const row = selectedRow.value;
    if (!row) {
      showToast(t('market.selectTradfiRow'), 'error'); // :6756-6758
      return;
    }
    try {
      const result = await api.fetchJson<TradfiActionResponse>(
        '/settings/hyperliquid/tradfi-map/test-resolve',
        {
          method: 'POST',
          body: JSON.stringify({ xyz_coin: row.xyz_coin }), // :6761-6764
        }
      );
      if (!result.success) {
        throw new Error(result.error || t('market.resolveTestFailed'));
      }
      const payload = (result.result ?? {}) as Record<string, unknown>; // :6768
      const details: string[] = [];
      if (payload.tiingo_ticker) {
        details.push(t('market.tiingoIex', { ticker: payload.tiingo_ticker })); // :6770
      }
      if (payload.tiingo_fx_ticker) {
        details.push(
          t('market.tiingoFx', { ticker: payload.tiingo_fx_ticker }) +
            (payload.tiingo_fx_invert ? t('market.invertedSuffix') : '')
        ); // :6771
      }
      if (payload.tiingo_start_date) {
        details.push(t('market.startDateDetail', { date: payload.tiingo_start_date })); // :6772
      }
      if (!details.length) {
        details.push(
          t('market.entryStatusSkipped', { status: text(payload.entry_status) || 'missing' })
        ); // :6774
      }
      setActionResult(
        details.length ? 'success' : 'warn',
        t('market.resolveResultFor', { coin: row.xyz_coin }),
        details
      ); // :6776
    } catch (error) {
      const message =
        error instanceof Error && error.message ? serverMsg(error.message) : '';
      setActionResult('error', message || t('market.resolveTestFailed'), []);
      showToast(message || t('market.resolveTestFailed'), 'error'); // :6778-6779
    }
  }

  /** fetchTradfiStartDate (:6783-6814). */
  async function fetchStartDate(): Promise<void> {
    const row = selectedRow.value;
    if (!row) {
      showToast(t('market.selectTradfiRow'), 'error'); // :6786-6788
      return;
    }
    if (!options.isTiingoConfigured()) {
      showToast(t('market.tiingoKeyEmpty'), 'error'); // :6790
      return;
    }
    await runAction(
      '/settings/hyperliquid/tradfi-map/fetch-start-date',
      { xyz_coin: row.xyz_coin },
      'market.startDateFetchFailed',
      (result) => {
        const action = (result.result ?? {}) as Record<string, unknown>; // :6802
        const updated = Number(action.updated || 0) > 0; // :6803
        setActionResult(
          updated ? 'success' : 'warn',
          updated
            ? t('market.startDateUpdated', { coin: row.xyz_coin })
            : t('market.startDateSkipped', { coin: row.xyz_coin }),
          updated
            ? [text(action.ticker), text(action.start_date)].filter(Boolean)
            : [text(action.reason) || t('market.noChange')]
        ); // :6803-6809
      }
    );
  }

  /** fetchAllTradfiStartDates (:6816-6840). */
  async function fetchAllStartDates(): Promise<void> {
    if (!options.isTiingoConfigured()) {
      showToast(t('market.tiingoKeyEmpty'), 'error'); // :6818
      return;
    }
    await runAction(
      '/settings/hyperliquid/tradfi-map/fetch-all-start-dates',
      {},
      'market.bulkStartDateFailed',
      (result) => {
        const summary = (result.result ?? {}) as Record<string, unknown>; // :6830
        setActionResult('success', t('market.bulkStartDateFinished'), [
          t('market.updatedCount', { count: Number(summary.updated || 0) }),
          t('market.skippedCount', { count: Number(summary.skipped || 0) }),
          t('market.errorsCount', { count: Number(summary.errors || 0) }),
        ]); // :6831-6835
      }
    );
  }

  /** refreshTradfiSpecs (:6842-6857). */
  async function refreshSpecs(): Promise<void> {
    await runAction(
      '/settings/hyperliquid/tradfi-map/spec-refresh',
      {},
      'market.xyzSpecRefreshFailed',
      (result) => {
        setActionResult('success', result.message || t('market.xyzSpecsRefreshed'), []); // :6852
      }
    );
  }

  /** autoMapTradfiMappings (:6859-6906). */
  async function autoMap(): Promise<void> {
    if (!options.isTiingoConfigured()) {
      showToast(t('market.tiingoKeyEmpty'), 'error'); // :6861
      return;
    }
    await runAction(
      '/settings/hyperliquid/tradfi-map/auto-map',
      {},
      'market.tradfiAutoMapFailed',
      (result) => {
        const counts = (result.result ?? {}) as Record<string, unknown>; // :6873
        const details = (counts.details ?? {}) as Record<string, unknown>; // :6874
        const itemsOf = (key: string): unknown[] =>
          Array.isArray(details[key]) ? (details[key] as unknown[]) : [];
        setActionResult('success', result.message || t('market.tradfiAutoMapCompleted'), [], [
          {
            label: t('market.equities'),
            count: Number(counts.mapped_equity || 0),
            items: itemsOf('mapped_equity'),
          },
          {
            label: t('market.fxCommodities'),
            count: Number(counts.mapped_fx || 0),
            items: itemsOf('mapped_fx'),
          },
          {
            label: t('market.noProvider'),
            count: Number(counts.no_provider || 0),
            items: itemsOf('no_provider'),
          },
          {
            label: t('market.notFound'),
            count: Number(counts.not_found || 0),
            items: itemsOf('not_found'),
          },
          {
            label: t('market.skipped'),
            count: Number(counts.skipped || 0),
            items: itemsOf('skipped'),
          },
        ]); // :6875-6901
      }
    );
  }

  /** refreshTradfiMetadata (:6908-6927). */
  async function refreshMetadata(): Promise<void> {
    if (!options.isTiingoConfigured()) {
      showToast(t('market.tiingoKeyEmpty'), 'error'); // :6910
      return;
    }
    await runAction(
      '/settings/hyperliquid/tradfi-map/refresh-metadata',
      {},
      'market.metadataRefreshFailed',
      (result) => {
        setActionResult('success', result.message || t('market.metadataRefreshed'), []); // :6922
      }
    );
  }

  /** refreshTradfiPrices (:6929-6953). */
  async function refreshPrices(): Promise<void> {
    if (!options.isTiingoConfigured()) {
      showToast(t('market.tiingoKeyEmpty'), 'error'); // :6931
      return;
    }
    await runAction(
      '/settings/hyperliquid/tradfi-map/refresh-prices',
      {},
      'market.priceRefreshFailed',
      (result) => {
        const summary = (result.result ?? {}) as Record<string, unknown>; // :6943
        setActionResult('success', result.message || t('market.priceCacheRefreshed'), [
          t('market.quotesSaved', { count: Number(summary.quotes_saved || 0) }),
          t('market.iexRows', { count: Number(summary.iex_rows || 0) }),
          t('market.fxRows', { count: Number(summary.fx_rows || 0) }),
        ]); // :6944-6948
      }
    );
  }

  /** loadTradfiSpecsView (:6955-6975). */
  async function loadSpecsView(): Promise<void> {
    windowMode.value = 'specs'; // :6956
    specsLoadingMessage.value = t('market.loadingXyzSpecs'); // :6959
    try {
      const result = await api.fetchJson<{
        success?: boolean;
        error?: string;
        payload?: TradfiSpecsPayload;
      }>('/settings/hyperliquid/tradfi-map/specs');
      if (!result.success) {
        throw new Error(result.error || t('market.failedLoadXyzSpecs')); // :6963
      }
      specsPayload.value = result.payload ?? { rows: [] }; // :6965
      specsLoadingMessage.value = ''; // renderTradfiSpecsView replaces the loading box
      const rowCount = Number(
        Array.isArray(specsPayload.value.rows) ? specsPayload.value.rows.length : 0
      );
      setActionResult('success', t('market.loadedXyzSpecs'), [
        t('market.rowsCount', { count: rowCount }),
      ]); // :6967-6969
    } catch (error) {
      const message =
        error instanceof Error && error.message ? serverMsg(error.message) : '';
      specsLoadingMessage.value = message || t('market.failedLoadXyzSpecs'); // :6971
      setActionResult('error', message || t('market.failedLoadXyzSpecs'), []);
      showToast(message || t('market.failedLoadXyzSpecs'), 'error'); // :6973
    }
  }

  return {
    testResolve,
    fetchStartDate,
    fetchAllStartDates,
    refreshSpecs,
    autoMap,
    refreshMetadata,
    refreshPrices,
    loadSpecsView,
  };
}
