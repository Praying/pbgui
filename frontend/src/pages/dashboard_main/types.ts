/** GET /api/dashboards response (api/dashboards.py list_dashboards). */
export interface DashboardsResponse {
  dashboards: string[];
}

/** postMessage payloads sent by the editor/templates iframes (dashboard_editor.html). */
export interface EditorMessage {
  type: string;
  name?: string;
  original_name?: string;
}

declare global {
  interface Window {
    /** Public help opener consumed by pbgui_nav.js Guide button (legacy window._openDashboardHelp). */
    PBGUI_HELP_OPENER?: () => void;
  }
}
