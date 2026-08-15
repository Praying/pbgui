import { getBoot } from '@/shared/boot';

/**
 * Editor page config — the Vue replacement for the legacy server-side
 * injections (dashboard_editor.html:493-497):
 *
 *   API_BASE   ← %%API_BASE%%        (query param `api_base`)
 *   ORIG_NAME  ← %%DASHBOARD_NAME%%  (query param `name`)
 *   VIEW_ONLY  ← %%VIEW_ONLY%%       (query param `view_only` = "1")
 *   STANDALONE ← %%STANDALONE%%      (query param `standalone` = "1")
 *
 * dashboard_main builds the iframe URL with exactly these params
 * (dashboard_main/config.ts:26-29), so the Vue page reads them with
 * URLSearchParams the same way dashboard_main reads %%CURRENT%%
 * (dashboard_main/App.vue initialCurrent).
 *
 * Deviation (documented): legacy used the raw `api_base` param as-is — an
 * empty value produced RELATIVE fetch URLs (origin-rooted paths, since every
 * path starts with `/`). The Vue page falls back to the boot origin + /api
 * like dashboard_main/config.ts; the iframe is always served from the same
 * origin, so the URLs are identical in practice and the WS derivation below
 * still produces the correct ws:// host.
 *
 * Functions (not constants) so importing the module never needs __BOOT__.
 */

export interface EditorConfig {
  /** Legacy %%API_BASE%% — origin + /api (or relative for direct URLs). */
  apiBase: string;
  /** Legacy ORIG_NAME — the dashboard name; fixed at init. */
  origName: string;
  /** Legacy VIEW_ONLY — "1" only. */
  viewOnly: boolean;
  /** Legacy STANDALONE — "1" only. */
  standalone: boolean;
}

/** Parse the editor's query params into the legacy injected-config shape. */
export function readEditorConfig(search: string = window.location.search): EditorConfig {
  const params = new URLSearchParams(search);
  const apiBaseParam = (params.get('api_base') ?? '').trim();
  return {
    apiBase: apiBaseParam || `${getBoot().origin}/api`,
    origName: params.get('name') ?? '',
    viewOnly: params.get('view_only') === '1',
    standalone: params.get('standalone') === '1',
  };
}

/**
 * Legacy WS URL derivation (editor:2788-2791): strip the trailing /api,
 * rewrite the scheme, append /ws/dashboard. A relative apiBase yields the
 * relative '/ws/dashboard' the legacy empty API_BASE produced.
 */
export function wsDashboardUrl(apiBase: string): string {
  const wsBase = apiBase
    .replace(/\/api$/, '')
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:');
  return wsBase + '/ws/dashboard';
}
