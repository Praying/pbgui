/**
 * Dashboard widget endpoint URLs — the exact URL construction of the legacy
 * inline builders (dashboard_editor.html:1176-1177, 1244-1247, 1381-1384,
 * 1525-1527, 1660-1662, 1798-1801, 1928-1929) and the live pollers
 * (editor:1102, 1139). Legacy concatenated raw values for `top`, `last_n`,
 * `filter` (numbers/state values); that is preserved so the wire format
 * stays byte-identical. apiBase is the injected %%API_BASE%% (origin + /api);
 * the Vue page derives it from boot like dashboard_main/config.ts.
 */

/** Legacy `usersParam`: joined selection, or 'ALL' for missing/empty. */
export function usersParam(users: string[] | null | undefined): string {
  return users && users.length > 0 ? users.join(',') : 'ALL';
}

/** GET /dashboard/balance?users=… (editor:1176-1177). */
export function balanceUrl(apiBase: string, users: string[] | null | undefined): string {
  return `${apiBase}/dashboard/balance?users=${encodeURIComponent(usersParam(users))}`;
}

/** GET /dashboard/top_data?users=…&period=…&top=… (editor:1244-1247). */
export function topDataUrl(
  apiBase: string,
  users: string[] | null | undefined,
  period: string,
  topN: number | string
): string {
  return (
    `${apiBase}/dashboard/top_data?users=${encodeURIComponent(usersParam(users))}` +
    `&period=${encodeURIComponent(period)}&top=${topN}`
  );
}

/** GET /dashboard/income_data?users=…&period=…&last_n=…&filter=… (editor:1381-1384). */
export function incomeDataUrl(
  apiBase: string,
  users: string[] | null | undefined,
  period: string,
  lastN: number | string,
  filter: number | string
): string {
  return (
    `${apiBase}/dashboard/income_data?users=${encodeURIComponent(usersParam(users))}` +
    `&period=${encodeURIComponent(period)}&last_n=${lastN}&filter=${filter}`
  );
}

/** GET /dashboard/pnl_data?users=…&period=…&mode=… (editor:1525-1527). */
export function pnlDataUrl(
  apiBase: string,
  users: string[] | null | undefined,
  period: string,
  mode: string
): string {
  return (
    `${apiBase}/dashboard/pnl_data?users=${encodeURIComponent(usersParam(users))}` +
    `&period=${encodeURIComponent(period)}&mode=${encodeURIComponent(mode)}`
  );
}

/** GET /dashboard/adg_data?users=…&period=…&mode=… (editor:1660-1662). */
export function adgDataUrl(
  apiBase: string,
  users: string[] | null | undefined,
  period: string,
  mode: string
): string {
  return (
    `${apiBase}/dashboard/adg_data?users=${encodeURIComponent(usersParam(users))}` +
    `&period=${encodeURIComponent(period)}&mode=${encodeURIComponent(mode)}`
  );
}

/** GET /dashboard/ppl_data?users=…&period=…&sum_period=… (editor:1798-1801). */
export function pplDataUrl(
  apiBase: string,
  users: string[] | null | undefined,
  period: string,
  sumPeriod: string
): string {
  return (
    `${apiBase}/dashboard/ppl_data?users=${encodeURIComponent(usersParam(users))}` +
    `&period=${encodeURIComponent(period)}&sum_period=${encodeURIComponent(sumPeriod)}`
  );
}

/** GET /dashboard/positions_data?users=… (editor:1928-1929). */
export function positionsDataUrl(apiBase: string, users: string[] | null | undefined): string {
  return `${apiBase}/dashboard/positions_data?users=${encodeURIComponent(usersParam(users))}`;
}

/** GET /dashboard/positions_data?users=…&live=1 (editor:1102). */
export function livePositionsUrl(apiBase: string, users: string[]): string {
  return `${apiBase}/dashboard/positions_data?users=${encodeURIComponent(users.join(','))}&live=1`;
}

/** GET /dashboard/balance?users=…&live=1 (editor:1139). */
export function liveBalanceUrl(apiBase: string, users: string[]): string {
  return `${apiBase}/dashboard/balance?users=${encodeURIComponent(users.join(','))}&live=1`;
}

/**
 * GET /dashboard/orders_data — the selection load (editor:2060-2066:
 * user/symbol/side/timeframe/limit/live) and the load-more fetch
 * (editor:2105-2112: `since` inserted before `limit=300`). Values are
 * encodeURIComponent'd exactly like the legacy builders.
 */
export function ordersDataUrl(
  apiBase: string,
  user: string,
  symbol: string,
  side: string,
  timeframe: string,
  limit: number,
  since?: number
): string {
  const base =
    `${apiBase}/dashboard/orders_data?user=${encodeURIComponent(user)}` +
    `&symbol=${encodeURIComponent(symbol)}&side=${encodeURIComponent(side)}` +
    `&timeframe=${encodeURIComponent(timeframe)}`;
  return since === undefined
    ? `${base}&limit=${limit}&live=1`
    : `${base}&since=${since}&limit=${limit}&live=1`;
}
