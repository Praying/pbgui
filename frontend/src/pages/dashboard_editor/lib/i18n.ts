/**
 * dashT — the Vue replacement for the render engine's `_t` helper
 * (dashboard_render.js:31-44) and the editor's direct `PBGuiI18n.t` calls.
 *
 * Legacy behavior: translate through window.PBGuiI18n when present and the
 * key resolves; otherwise substitute {param} placeholders into the English
 * fallback literal (this is what the legacy fragments/test VMs saw).
 *
 * The Vue page wires its vue-i18n instance in once at startup via
 * setDashTranslator; until then (e.g. unit tests) dashT behaves exactly like
 * the fallback branch of legacy _t.
 */
import { serverMsg } from '@/shared/i18n';

/** Translator contract: return the translated string, or `key` when missing. */
export type DashTranslator = (key: string, params?: Record<string, unknown>) => string;

let activeTranslator: DashTranslator | null = null;

/** Wire the page's vue-i18n t() (e.g. `setDashTranslator((k, p) => i18n.t(k, p))`). */
export function setDashTranslator(translator: DashTranslator | null): void {
  activeTranslator = translator;
}

/**
 * Translate `key` with the active translator; fall back to the English
 * literal with {param} substitution (legacy _t fallback path).
 */
export function dashT(key: string, fallback: string, params?: Record<string, unknown>): string {
  if (activeTranslator) {
    const value = activeTranslator(key, params);
    if (value !== key) return value;
  }
  let out = String(fallback);
  if (params) {
    out = out.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
  }
  return out;
}

/**
 * Server-message translation — same contract as legacy `_serverMsg`
 * (dashboard_render.js:45-48) / PBGuiI18n.serverMsg: exact-match dict
 * translation of known server English messages, passthrough otherwise.
 */
export { serverMsg as dashServerMsg } from '@/shared/i18n';
