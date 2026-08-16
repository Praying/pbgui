import { getBoot } from '@/shared/boot';

/**
 * Help page config — the Vue replacement for the legacy help.html URL
 * plumbing (help.html:551-556, fetches :722/:841/:860).
 *
 * The legacy page was served as a STATIC file at /app/help.html, so its
 * %%API_BASE%% placeholder stayed literal and every fetch used a relative
 * '/api/help/...' URL. The Vue page derives the base from /api/boot.js at
 * runtime (coin_data config.ts convention) and keeps the legacy URL joins.
 * The /api/help/* endpoints live on the main FastAPI app
 * (PBApiServer.py help_index/help_meta/help_content), not on a sub-router.
 */

/** REST base for the help endpoints, e.g. http://host:port/api/help. */
export function helpApiBase(): string {
  return `${getBoot().origin}/api/help`;
}

/** Legacy concatenation (relative '/api/help/...' made absolute via boot). */
export function helpApiUrl(path: string): string {
  return helpApiBase() + path;
}
