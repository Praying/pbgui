import { getBoot } from '@/shared/boot';

/**
 * Welcome page config — the Vue replacement for the legacy server-side
 * injections (welcome.html:925-935, api/auth.py:1122-1131):
 *
 *   TOKEN       ← %%TOKEN%%       (session token; boot.js carries it)
 *   API_ORIGIN  ← %%API_ORIGIN%%  (request origin; boot.js origin)
 *   VERSION     ← %%VERSION%%     PBGUI_VERSION
 *   SERIAL      ← %%SERIAL%%      PBGUI_SERIAL
 *
 * The ?next= query param passes through verbatim.
 */

export function apiOrigin(): string {
  return getBoot().origin;
}

export function bootVersion(): string {
  return getBoot().version;
}

export function bootSerial(): string {
  return getBoot().serial;
}

export function bootToken(): string {
  return getBoot().token || '';
}
