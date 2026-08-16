import { getBoot } from '@/shared/boot';

/**
 * HL data-actions page config — the Vue replacement for the legacy
 * data-attribute injections (_render_hl_data_actions_html, api/market_data.py
 * :1257-1265):
 *
 *   data-api-base      ← origin + /api
 *   data-api-host      ← request netloc (WS host)
 *   data-initial-section ← the route's ?section= build|download
 *
 * The Vue page derives the base/host from /api/boot.js + location at runtime;
 * the section comes through the URL query the route already passes verbatim.
 */

/** REST base, e.g. http://host:port/api (legacy API_BASE). */
export function apiBase(): string {
  return `${getBoot().origin}/api`;
}

/** Legacy plain concatenation (doInit :940, submitDL :1563 …). */
export function apiUrl(path: string): string {
  return apiBase() + path;
}

/** WS host (legacy data-api-host = request netloc; same-origin page). */
export function apiHost(): string {
  return window.location.host;
}

/** connectWS (:1645-1646) — ws(s)://{host}/ws/jobs. */
export function jobsWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${apiHost()}/ws/jobs`;
}

/** The route's ?section= — 'build' | 'download' restricts to one section (:523-524). */
export function initialSection(): 'build' | 'download' | '' {
  const value = new URLSearchParams(window.location.search).get('section') || '';
  const clean = value.trim().toLowerCase();
  return clean === 'download' || clean === 'build' ? clean : '';
}
