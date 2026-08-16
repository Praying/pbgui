import { getBoot } from '@/shared/boot';

/**
 * Legacy market_data_status.html received `data-token` / `data-exchange` /
 * `data-api-host` / `data-api-base` via server-side string injection. The Vue
 * page derives token/origin from /api/boot.js at runtime; only the exchange
 * stays per-instance (route-injected `data-exchange` on the mount element,
 * with the query string and the status-monitor path as standalone fallbacks).
 * Functions (not constants) so importing the module never needs window.__BOOT__.
 */

/** Id of the mount element the route injects `data-exchange` into. */
export const MOUNT_ELEMENT_ID = 'mds-app';

/** Legacy showToast posted to this literal same-origin path. */
export const NOTIFY_LOG_URL = '/api/notify_log';

/** REST base for the market-data router, e.g. http://host:port/api. */
export function apiBase(): string {
  return `${getBoot().origin}/api`;
}

/** WebSocket URL for /ws/market-data (PBApiServer.py:1044). */
export function wsUrl(exchange: string): string {
  const wsBase = getBoot().origin.replace(/^http/, 'ws');
  return `${wsBase}/ws/market-data?exchange=${encodeURIComponent(exchange)}`;
}

/** POST /api/market-data/refresh-now (api/market_data.py trigger_refresh_now). */
export function refreshNowUrl(): string {
  return `${apiBase()}/market-data/refresh-now`;
}

/** POST /api/market-data/cancel-refresh. */
export function cancelRefreshUrl(): string {
  return `${apiBase()}/market-data/cancel-refresh`;
}

/** POST /api/market-data/stop-run. */
export function stopRunUrl(): string {
  return `${apiBase()}/market-data/stop-run`;
}

/** Legacy guard: `if (!API_TOKEN || !EXCHANGE)` replaced the page with a warning. */
export function hasApiToken(): boolean {
  return getBoot().token !== '';
}

/**
 * Legacy `root.getAttribute('data-exchange')` — trimmed/lowercased, with the
 * `?exchange=` query param and the /status-monitor/{exchange} path segment as
 * fallbacks for standalone (non-injected) loads.
 */
export function readExchange(): string {
  const el = document.getElementById(MOUNT_ELEMENT_ID);
  const fromAttr = (el instanceof HTMLElement ? el.dataset.exchange : undefined) ?? '';
  if (fromAttr.trim()) return fromAttr.trim().toLowerCase();

  const fromQuery = new URLSearchParams(window.location.search).get('exchange') ?? '';
  if (fromQuery.trim()) return fromQuery.trim().toLowerCase();

  const segments = window.location.pathname.split('/').filter(Boolean);
  const statusMonitorIx = segments.indexOf('status-monitor');
  if (statusMonitorIx >= 0 && statusMonitorIx + 1 < segments.length) {
    return segments[statusMonitorIx + 1]!.trim().toLowerCase();
  }
  return '';
}
