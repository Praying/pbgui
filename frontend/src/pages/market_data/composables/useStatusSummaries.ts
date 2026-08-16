import { ref, type Ref } from 'vue';
import { useApi } from './useApi';
import { serverMsg } from '@/shared/i18n';
import { exchangeOptions } from '../lib/exchange';

/*
 * Legacy fetchStatus/refreshStatuses (market_data_main.html:9076-9096) and
 * the bootstrap call (:9772): fan out /status/{statusKey} for every
 * exchange in parallel, annotate each payload with the UI label + key and
 * swallow per-exchange failures into error entries.
 *
 * Deviation (documented): legacy mutated the server payload
 * (`payload.exchange = item.label`, :9084-9085); the port spreads into a
 * fresh object (immutability, same wire data).
 *
 * NOTE: uiState.statusPayloads has no consumer in the legacy page — the
 * store is ported for parity and kept available for M-data-3..7.
 */

export interface ExchangeStatusSummary {
  /** UI label (:9084, e.g. "Binance USDM"). */
  exchange: string;
  /** Exchange key (:9085). */
  uiExchange: string;
  /** serverMsg-mapped failure text when the fetch failed (:9091). */
  error?: string;
  [payload: string]: unknown;
}

/** Legacy error fallback (:9091 — PBGuiI18n.t('market.statusFetchFailed')). */
export const DEFAULT_STATUS_FETCH_FAILED = 'Status fetch failed';

export interface RefreshStatusesOptions {
  /** Translated market.statusFetchFailed fallback (legacy read it at error time). */
  fallbackMessage?: string;
}

/** Legacy fetchStatus :9076-9078. */
export async function fetchStatus(exchange: string): Promise<Record<string, unknown>> {
  return useApi().fetchJson(`/status/${encodeURIComponent(exchange)}`);
}

/** Legacy refreshStatuses :9080-9096. */
export async function refreshStatuses(
  options: RefreshStatusesOptions = {}
): Promise<ExchangeStatusSummary[]> {
  const fallback = options.fallbackMessage ?? DEFAULT_STATUS_FETCH_FAILED;
  return Promise.all(
    exchangeOptions.map(async (item): Promise<ExchangeStatusSummary> => {
      try {
        const payload = await fetchStatus(item.statusKey);
        return { ...payload, exchange: item.label, uiExchange: item.key };
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : '';
        return {
          exchange: item.label,
          uiExchange: item.key,
          error: message ? serverMsg(message) : fallback, // :9091
        };
      }
    })
  );
}

export interface UseStatusSummaries {
  /** uiState.statusPayloads (:3793, write-only in legacy). */
  statusSummaries: Ref<ExchangeStatusSummary[]>;
  refreshStatuses(options?: RefreshStatusesOptions): Promise<ExchangeStatusSummary[]>;
}

export function useStatusSummaries(): UseStatusSummaries {
  const statusSummaries = ref<ExchangeStatusSummary[]>([]);
  return {
    statusSummaries,
    refreshStatuses: async (options) => {
      statusSummaries.value = await refreshStatuses(options); // :9095
      return statusSummaries.value;
    },
  };
}
