import type { InventorySubsection } from '../types';

/*
 * M-data-6 — the inventory panel's queue routing
 * (legacy market_data_main.html):
 *
 *   best1mQueueMeta              :3757-3763  (the sidebar build button's
 *                                            route table; M-data-7's best-1m
 *                                            form reuses the same matrix)
 *   getInventoryQueueActionConfig :8234-8251
 */

/** Legacy best1mQueueMeta (:3757-3763) — verbatim. */
export const BEST1M_QUEUE_META: Readonly<Record<string, { api: 'heatmap' | 'market-data'; path: string }>> = {
  hyperliquid: { api: 'heatmap', path: '/queue-build-ohlcv' },
  binance: { api: 'market-data', path: '/best-1m/queue/binance' },
  bybit: { api: 'market-data', path: '/best-1m/queue/bybit' },
  bitget: { api: 'market-data', path: '/best-1m/queue/bitget' },
  okx: { api: 'market-data', path: '/best-1m/queue/okx' },
};

export interface InventoryQueueActionConfig {
  kind: 'l2book' | 'best1m';
  api: 'heatmap' | 'market-data';
  path: string;
}

/** Legacy getInventoryQueueActionConfig (:8234-8251). */
export function getInventoryQueueActionConfig(
  exchangeKey: string,
  viewKey: InventorySubsection
): InventoryQueueActionConfig | null {
  if (exchangeKey === 'hyperliquid' && viewKey === 'l2Book') {
    return { kind: 'l2book', api: 'heatmap', path: '/queue-l2book-download-bulk' }; // :8236-8242
  }
  const queueMeta = BEST1M_QUEUE_META[exchangeKey] ?? null; // :8243-8245
  if (!queueMeta) return null;
  return { kind: 'best1m', api: queueMeta.api, path: queueMeta.path }; // :8246-8250
}
