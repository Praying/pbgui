import { getBoot, wsOrigin } from '@/shared/boot';

/**
 * API Keys editor config — the Vue replacement for the legacy server-side
 * injections (api_keys_editor.html:1080-1095, api/api_keys.py:650-674):
 *
 *   TOKEN  ← %%TOKEN%%   (browser auth uses the same-origin cookie; the boot
 *                        token only feeds LogViewerPanel's websocket)
 *   API_BASE ← %%API_BASE%% (request origin + /api/api-keys)
 *   VERSION/SERIAL ← %%VERSION%%/%%SERIAL%% (nav chrome only)
 *
 * Values are read from /api/boot.js at runtime (welcome page convention).
 */

export function apiBase(): string {
  return getBoot().base_prefix + '/api/api-keys';
}

export function bootVersion(): string {
  return getBoot().version || '';
}

export function bootSerial(): string {
  return getBoot().serial || '';
}

/** WebSocket origin for LogViewerPanel (legacy _getWsBase :3426-3434). */
export function wsBase(): string {
  try {
    return wsOrigin();
  } catch {
    return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host;
  }
}

/** Fallback when /exchanges has not loaded yet (legacy EXCHANGES[0] :1511). */
export const DEFAULT_EXCHANGE = 'binance';
