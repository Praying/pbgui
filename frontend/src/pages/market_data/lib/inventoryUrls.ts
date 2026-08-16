import type { InventorySubsection } from '../types';

/*
 * M-data-6 — inventory URL builders (legacy market_data_main.html). Pure
 * path constructors; the api layer (config.ts/useApi.ts) owns the base
 * joins, so tests can assert the exact query strings.
 *
 *   loadInventoryPanel          :8690-8692
 *   preview-delete-older        :8321
 *   delete-selected/-older/clear :8757/:8803/:8838
 *   heatmap info/overview       :8651-8653/:8659-8661
 *   heatmap minutes             :8607-8612
 *   OHLCV iframe                :8573-8575
 */

/** GET /inventory/{exchange} (:8690-8692). */
export function inventoryPath(
  exchange: string,
  viewKey: InventorySubsection,
  includeMissing: boolean
): string {
  return (
    `/inventory/${encodeURIComponent(exchange)}` +
    `?view=${encodeURIComponent(viewKey)}` +
    `&include_missing=${encodeURIComponent(includeMissing ? 'true' : 'false')}`
  );
}

/** POST /inventory/{exchange}/preview-delete-older (:8321). */
export function previewDeleteOlderPath(exchange: string): string {
  return `/inventory/${encodeURIComponent(exchange)}/preview-delete-older`;
}

/** POST /inventory/{exchange}/delete-selected (:8757). */
export function deleteSelectedPath(exchange: string): string {
  return `/inventory/${encodeURIComponent(exchange)}/delete-selected`;
}

/** POST /inventory/{exchange}/delete-older (:8803). */
export function deleteOlderPath(exchange: string): string {
  return `/inventory/${encodeURIComponent(exchange)}/delete-older`;
}

/** POST /inventory/{exchange}/clear-dataset (:8838). */
export function clearDatasetPath(exchange: string): string {
  return `/inventory/${encodeURIComponent(exchange)}/clear-dataset`;
}

/** GET /heatmap/info (:8651-8653). */
export function heatmapInfoPath(exchange: string, dataset: string, coin: string): string {
  return (
    `/info?exchange=${encodeURIComponent(exchange)}` +
    `&dataset=${encodeURIComponent(dataset)}` +
    `&coin=${encodeURIComponent(coin)}`
  );
}

/** GET /heatmap/overview (:8659-8661). */
export function heatmapOverviewPath(exchange: string, dataset: string, coin: string): string {
  return (
    `/overview?exchange=${encodeURIComponent(exchange)}` +
    `&dataset=${encodeURIComponent(dataset)}` +
    `&coin=${encodeURIComponent(coin)}`
  );
}

/** GET /heatmap/minutes (:8607-8612) — month drill + holiday/oos toggles. */
export function heatmapMinutesPath(
  exchange: string,
  dataset: string,
  coin: string,
  month: string,
  showHoliday: boolean,
  showOos: boolean
): string {
  return (
    `/minutes?exchange=${encodeURIComponent(exchange)}` +
    `&dataset=${encodeURIComponent(dataset)}` +
    `&coin=${encodeURIComponent(coin)}` +
    `&month=${encodeURIComponent(month)}` +
    `&show_holiday=${encodeURIComponent(showHoliday !== false ? 'true' : 'false')}` +
    `&show_oos=${encodeURIComponent(showOos !== false ? 'true' : 'false')}`
  );
}

/** The OHLCV iframe path on the market-data router (:8573-8575). */
export function ohlcvFramePath(exchange: string, dataset: string, coin: string): string {
  return (
    '/inventory/chart/ohlcv' +
    `?exchange=${encodeURIComponent(exchange)}` +
    `&dataset=${encodeURIComponent(dataset)}` +
    `&coin=${encodeURIComponent(coin)}`
  );
}

/** The OHLCV iframe absolute URL — legacy apiUrl(path) (:8573). */
export function buildOhlcvFrameUrl(apiBase: string, exchange: string, dataset: string, coin: string): string {
  return apiBase + ohlcvFramePath(exchange, dataset, coin);
}
