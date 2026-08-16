import { getBoot } from '@/shared/boot';

/**
 * Market data page config — the Vue replacement for the legacy server-side
 * injections (market_data_main.html:3640-3644):
 *
 *   API_BASE ← %%API_BASE%% (origin + /api/market-data, api/market_data.py:164-192)
 *
 * The Vue page derives the base from /api/boot.js at runtime (cookie-session
 * parity, services_monitor config.ts convention) and keeps every legacy URL
 * rewrite verbatim. Functions (not constants) so importing the module never
 * needs window.__BOOT__.
 */

/** Legacy literal same-origin path for logNotification (:4970). */
export const NOTIFY_LOG_URL = '/api/notify_log';

/** REST base for the market-data router, e.g. http://host:port/api/market-data. */
export function marketDataApiBase(): string {
  return `${getBoot().origin}/api/market-data`;
}

/** Legacy apiUrl (:4176-4178) — plain concatenation. */
export function apiUrl(path: string): string {
  return marketDataApiBase() + path;
}

/** Legacy jobs root strip (:4181) — /market-data (optionally slash-terminated)
 *  removed so /jobs/… and /api-keys/… hit the /api root. */
export function jobsApiUrl(path: string): string {
  return marketDataApiBase().replace(/\/market-data\/?$/, '') + path;
}

/** Legacy heatmap rewrite (:4889) — final /market-data becomes /heatmap
 *  (no trailing-slash tolerance, unlike the jobs strip). */
export function toHeatmapBase(base: string): string {
  return base.replace(/\/market-data$/, '/heatmap');
}

/** Heatmap REST base, e.g. http://host:port/api/heatmap. */
export function heatmapApiBase(): string {
  return toHeatmapBase(marketDataApiBase());
}

/** Legacy heatmapApiUrl (:4892-4894). */
export function heatmapApiUrl(path: string): string {
  return heatmapApiBase() + path;
}

/** Legacy getWsBase (:4102-4106) — injector override wins, else page protocol. */
export function wsBase(): string {
  const injected = (window as Window & { WS_BASE?: string }).WS_BASE;
  if (injected) return injected;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}
