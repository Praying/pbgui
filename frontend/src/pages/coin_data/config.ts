import { getBoot } from '@/shared/boot';

/**
 * Coin Data page config — the Vue replacement for the legacy server-side
 * injections (coin_data.html:1669-1672):
 *
 *   API_BASE ← %%API_BASE%% (origin + /api/coin-data, api/coin_data.py:695-699)
 *
 * The Vue page derives the base from /api/boot.js at runtime (cookie-session
 * parity, market_data config.ts convention) and keeps the legacy URL joins
 * verbatim. Functions (not constants) so importing the module never needs
 * window.__BOOT__.
 */

/** REST base for the coin-data router, e.g. http://host:port/api/coin-data. */
export function coinDataApiBase(): string {
  return `${getBoot().origin}/api/coin-data`;
}

/** Legacy plain concatenation (buildStateUrl :2134, runRefresh :2233). */
export function apiUrl(path: string): string {
  return coinDataApiBase() + path;
}
