import { getBoot } from '@/shared/boot';

/**
 * DB Tools page config — the Vue replacement for the legacy server-side
 * injections (db_tools.html:296-303, api/db_tools.py:2684-2702):
 *
 *   API_BASE ← %%API_BASE%% (origin + /api/db-tools)
 *   WS_BASE  ← %%WS_BASE%%  (ws(s) transform of the origin)
 *
 * The Vue page derives both from /api/boot.js at runtime.
 */

/** REST base, e.g. http://host:port/api/db-tools. */
export function dbToolsApiBase(): string {
  return `${getBoot().origin}/api/db-tools`;
}

/** Legacy plain concatenation (apiFetch :320). */
export function apiUrl(path: string): string {
  return dbToolsApiBase() + path;
}

/** Legacy WS transform (:2689). */
export function wsBase(): string {
  return getBoot().origin.replace('http://', 'ws://').replace('https://', 'wss://');
}
