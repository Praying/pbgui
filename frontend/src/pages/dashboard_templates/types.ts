/** GET /api/dashboards/templates response (api/dashboards.py list_templates). */
export interface TemplatesResponse {
  templates: string[];
}

/** GET /api/dashboards/users response (api/dashboards.py list_users). */
export interface UsersResponse {
  users: string[];
}

/** GET /api/dashboards/{name} response; legacy only tested `config` for existence. */
export interface DashboardConfigResponse {
  config?: unknown;
}

/** Write responses ({"status": "ok", ...}) and FastAPI error bodies. */
export interface StatusResponse {
  status?: string;
  detail?: string;
}

/** postMessage payloads sent to the dashboard_main parent window. */
export interface OutboundMessage {
  type: 'pbgui_close_templates' | 'pbgui_dashboard_created';
}
