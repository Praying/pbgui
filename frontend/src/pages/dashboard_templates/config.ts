/**
 * Legacy dashboard_templates received `%%API_BASE%%` and `%%CURRENT%%` via
 * server-side string injection from the `api_base` / `current` query params
 * (set by dashboard_main's templatesPageUrl). The Vue page reads the same
 * query params at runtime; an empty api_base keeps legacy relative fetches
 * (the popup is served from the same origin, so relative URLs still hit the
 * right API).
 * Functions (not constants) so importing the module never needs the URL.
 */

/** Legacy %%API_BASE%%: the `api_base` query param, '' when missing. */
export function apiBase(): string {
  return new URLSearchParams(window.location.search).get('api_base') ?? '';
}

/** GET /api/dashboards base (api/dashboards.py list_dashboards). */
export function dashboardsUrl(): string {
  return `${apiBase()}/dashboards`;
}

/** GET / POST / DELETE / PATCH /api/dashboards/templates (api/dashboards.py). */
export function templatesUrl(): string {
  return `${apiBase()}/dashboards/templates`;
}

/** GET /api/dashboards/users (api/dashboards.py list_users). */
export function usersUrl(): string {
  return `${apiBase()}/dashboards/users`;
}

/** POST /api/dashboards/from_template (api/dashboards.py dashboards_from_template). */
export function fromTemplateUrl(): string {
  return `${apiBase()}/dashboards/from_template`;
}

/** Legacy %%CURRENT%%: the `current` query param of /api/dashboard/templates_page. */
export function initialCurrent(): string {
  return new URLSearchParams(window.location.search).get('current') ?? '';
}
