/**
 * DashRender opts contract → Vue widget props (schema-frozen).
 *
 * The legacy editor passes a per-widget opts object into DashRender.build*
 * (dashboard_render.js); each build* builds its own DOM controls and the
 * editor's inline builders (dashboard_editor.html:1161-2152) supply those
 * controls as opts fields. In Vue those DOM-node fields become component
 * props with VALUE types, and each widget fetches its own data.
 *
 * ┌ legacy opts field        │ Vue prop            ┐
 * ├ usersControl (DOM node)  │ users: string[]     │ makeUsersDropdown → MultiSelectDropdown (D-2)
 * │ topNControl/period…      │ topN/period/…       │ control values, not nodes (D-4)
 * │ height                   │ height: number|null │ storedH > 0 ? storedH : 280; income passes null
 * │ displayModeBar/responsive│ same (boolean)      │ Plotly layout flags
 * │ apiBase                  │ apiBase: string     │ injected %%API_BASE%%
 * │ onReload                 │ onReload(): void    │ rebuild callback
 * │ icon / onDelete          │ same                │ _widgetIcon / _makeDeleteCb; null in view mode
 * └──────────────────────────┴─────────────────────┘
 *
 * R5: the persisted dashboard JSON is a FLAT map of keys suffixed `_<row>_<col>`
 * (dashboard_editor.html:512-513, dashboard.py:1890-1909). The key names below
 * are the on-disk contract — renaming them corrupts saved dashboards. The
 * D-editor-2 state store owns this schema; this block is the frozen reference.
 */

/** Cell types stored in the persisted dashboard JSON (editor TYPES, line 502).
 *  R11: 'P+L' is the on-disk literal — never normalize it.
 *  'NONE' is the empty-cell value (editor:592 writes it, editor:872 uses it as
 *  the default) — not a renderable widget, but part of the same on-disk union. */
export type WidgetType =
  | 'BALANCE'
  | 'TOP'
  | 'INCOME'
  | 'PNL'
  | 'ADG'
  | 'P+L'
  | 'POSITIONS'
  | 'ORDERS'
  | 'NONE';

/** The server's live-source marker on live-poll payloads (d.source). */
export type LiveSource = 'live' | 'mixed' | 'db';

/**
 * Persisted per-cell config keys, suffixed `_<row>_<col>` (e.g.
 * `dashboard_pnl_mode_1_2`). Schema-frozen — see R5 above.
 */
export const PERSISTED_CELL_KEYS = {
  type: 'dashboard_type',
  height: 'dashboard_height',
  balanceUsers: 'dashboard_balance_users',
  topUsers: 'dashboard_top_symbols_users',
  topPeriod: 'dashboard_top_symbols_period',
  topN: 'dashboard_top_symbols_top',
  incomeUsers: 'dashboard_income_users',
  incomePeriod: 'dashboard_income_period',
  incomeLast: 'dashboard_income_last',
  incomeFilter: 'dashboard_income_filter',
  pnlUsers: 'dashboard_pnl_users',
  pnlPeriod: 'dashboard_pnl_period',
  pnlMode: 'dashboard_pnl_mode',
  adgUsers: 'dashboard_adg_users',
  adgPeriod: 'dashboard_adg_period',
  adgMode: 'dashboard_adg_mode',
  pplUsers: 'dashboard_ppl_users',
  pplPeriod: 'dashboard_ppl_period',
  pplSumPeriod: 'dashboard_ppl_sum_period',
  positionsUsers: 'dashboard_positions_users',
  ordersCfg: 'dashboard_orders',
} as const;

/** A balance table row (render.js renderBalanceRows:428-449). */
export interface BalanceRow {
  user: string;
  date: string;
  balance: number;
  upnl: number;
  we: number;
}

/** GET /dashboard/balance payload (buildBalance data + optional live source). */
export interface BalanceData {
  rows: BalanceRow[];
  totals: { balance: number; upnl: number; we: number };
  source?: LiveSource;
}

/** Props shared by every widget (legacy icon/onDelete/usersControl chrome). */
export interface WidgetBaseProps {
  /** state[uKey] — the users multi-select value; null/empty renders as ALL. */
  users: string[] | null;
  /** Legacy _widgetIcon(type) emoji. */
  icon: string | null;
  /** Legacy _makeDeleteCb(r, c); null in view mode. */
  onDelete: (() => void) | null;
}

/** Props for the Plotly widgets (TOP, PNL, ADG, P+L) — legacy build* opts. */
export interface PlotlyWidgetProps extends WidgetBaseProps {
  /** Legacy period state value — 'THIS_MONTH' | 'TODAY' | 'CUSTOM:from:to' | … */
  period: string;
  /** Legacy height opt: stored height or 280. */
  height: number | null;
  /** Legacy displayModeBar opt. */
  displayModeBar: boolean;
  /** Legacy responsive opt. */
  responsive: boolean;
}

/** Props for widgets that manage their own data (INCOME, POSITIONS) — legacy apiBase/onReload opts. */
export interface DataManagingWidgetProps extends WidgetBaseProps {
  /** Legacy %%API_BASE%% — origin + /api (dashboard_main/config.ts convention). */
  apiBase: string;
  /** Legacy onReload opt — refetch + rebuild after destructive actions. */
  onReload: () => void;
}

/** Props for the TOP widget — legacy topNControl (editor:1254-1261). */
export interface WidgetTopProps extends PlotlyWidgetProps {
  topN: number;
}

/** Props for the PNL/ADG widgets — legacy modeControl (editor:1518-1529, 1655-1666). */
export interface WidgetModeProps extends PlotlyWidgetProps {
  mode: string;
}

/** Props for the P+L widget — legacy sumPeriodControl (editor:1786-1803). */
export interface WidgetPplProps extends PlotlyWidgetProps {
  sumPeriod: string;
}

/** Props for the POSITIONS widget — legacy buildPositions opts (editor:1938-1943). */
export interface WidgetPositionsProps extends DataManagingWidgetProps {
  /** Legacy position opt — the 'R_C' cell key the widget reports events for. */
  position: string;
}
