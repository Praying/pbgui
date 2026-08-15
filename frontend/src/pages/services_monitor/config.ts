import { getBoot } from '@/shared/boot';

/**
 * Legacy pages received `%%API_BASE%%` / `%%WS_BASE%%` via server-side string
 * injection; the Vue pages derive both from /api/boot.js at runtime instead.
 * Functions (not constants) so importing the module never needs window.__BOOT__.
 */

/** REST base for the services API, e.g. http://host:port/api/services. */
export function apiBase(): string {
  return `${getBoot().origin}/api/services`;
}

/** WebSocket base for the log viewer, e.g. ws://host:port. */
export function wsBase(): string {
  return getBoot().origin.replace(/^http/, 'ws');
}
