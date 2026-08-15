import { getBoot } from '@/shared/boot';

/**
 * Legacy dashboard_main received `%%API_BASE%%` (origin + /api) and
 * `%%WS_BASE%%` via server-side string injection; the Vue page derives the
 * base from /api/boot.js at runtime. (WS_BASE was injected but never read —
 * see the App.vue mapping comment.)
 * Functions (not constants) so importing the module never needs window.__BOOT__.
 */

/** REST base for the dashboard API, e.g. http://host:port/api. */
export function apiBase(): string {
  return `${getBoot().origin}/api`;
}

/** GET /api/dashboards + DELETE /api/dashboards/{name} base (api/dashboards.py). */
export function dashboardsUrl(): string {
  return `${apiBase()}/dashboards`;
}

/**
 * Legacy loadView/loadEditor iframe URLs:
 *   /api/dashboard/editor_page?name=..&api_base=..&view_only=1   (view)
 *   /api/dashboard/editor_page?name=..&api_base=..&standalone=1  (editor)
 */
export function editorPageUrl(name: string, mode: 'view' | 'editor'): string {
  const params = new URLSearchParams({ name, api_base: apiBase() });
  params.set(mode === 'view' ? 'view_only' : 'standalone', '1');
  return `${apiBase()}/dashboard/editor_page?${params.toString()}`;
}

/** Legacy openTemplates iframe URL: /api/dashboard/templates_page?current=..&api_base=.. */
export function templatesPageUrl(current: string): string {
  const params = new URLSearchParams({ current, api_base: apiBase() });
  return `${apiBase()}/dashboard/templates_page?${params.toString()}`;
}
