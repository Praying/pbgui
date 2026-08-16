/*
 * TradFi map filtering + option derivation — legacy market_data_main.html:
 *
 *   buildTradfiSymbol        :6433-6439  IEX:/FX: composite symbol
 *   filterTradfiRows         :6468-6485  getTradfiFilteredRows (symbol +
 *                                        type + status, 4-field haystack)
 *   deriveTradfiOptionLists  :6516-6527  payload lists with the fallbacks
 *   normalizeSelectValue     :6499-6505  syncTradfiSelectOptions keep/fallback
 */

/** One row of /settings/hyperliquid/tradfi-map payload.rows (server-supplied). */
export interface TradfiRow {
  xyz_coin?: string;
  canonical_type?: string;
  description?: string;
  instrument_label?: string;
  tiingo_ticker?: string;
  tiingo_fx_ticker?: string;
  tiingo_fx_invert?: boolean;
  tiingo_start_date?: string;
  tiingo_fetch_start?: string;
  last_verified?: string;
  status?: string;
  note?: string;
  hl_link?: string;
  pyth_link?: string;
  hl_price?: unknown;
  tiingo_price?: unknown;
  tiingo_symbol?: string;
  /** Editor provenance flag (:6461 — mapping json vs saved map). */
  _in_map?: boolean;
  [key: string]: unknown;
}

/** tradfiMapState.filters (:3766-3770). */
export interface TradfiFilters {
  symbol: string;
  type: string;
  status: string;
}

/** renderTradfiMap fallback status list for the status filter (:6521). */
export const DEFAULT_FILTER_STATUS_VALUES: readonly string[] = [
  'ok',
  'alias',
  'pending',
  'no_provider',
];

/** renderTradfiMap fallback canonical type list for the editor (:6524). */
export const DEFAULT_CANONICAL_TYPES: readonly string[] = [
  'equity_us',
  'equity_kr',
  'equity_jp',
  'fx',
  'commodity',
  'commodity_etf',
  'index_etf',
  'etf',
];

/** renderTradfiMap fallback status list for the editor (:6527). */
export const DEFAULT_EDITOR_STATUSES: readonly string[] = [
  'ok',
  'alias',
  'pending',
  'no_provider',
  'delisted',
];

/** The four select lists renderTradfiMap syncs (:6529-6532). */
export interface TradfiOptionLists {
  /** Filter-by-type options (:6516-6518). */
  typeValues: readonly string[];
  /** Filter-by-status options (:6519-6521). */
  statusValues: readonly string[];
  /** Editor canonical type options (:6522-6524). */
  canonicalTypes: readonly string[];
  /** Editor status options (:6525-6527). */
  statuses: readonly string[];
}

/** Payload-carried option lists (all optional — fallbacks apply, :6516-6527). */
export interface TradfiOptionSource {
  type_values?: unknown;
  status_values?: unknown;
  canonical_types?: unknown;
  statuses?: unknown;
}

/** Legacy buildTradfiSymbol (:6433-6439). */
export function buildTradfiSymbol(rowData: Partial<TradfiRow> | null | undefined): string {
  const row = rowData ?? {};
  const equity = String(row.tiingo_ticker ?? '').trim().toUpperCase();
  if (equity) return `IEX:${equity}`;
  const fx = String(row.tiingo_fx_ticker ?? '').trim().toUpperCase();
  if (!fx) return '';
  return `FX:${fx}${row.tiingo_fx_invert ? ' (inv)' : ''}`;
}

/** Legacy getTradfiFilteredRows (:6468-6485). */
export function filterTradfiRows(rows: readonly TradfiRow[], filters: TradfiFilters): TradfiRow[] {
  const symbolFilter = String(filters.symbol ?? '').trim().toUpperCase();
  return rows.filter((row) => {
    const typeMatch =
      filters.type === 'all' || String(row.canonical_type ?? '') === filters.type;
    const statusMatch = filters.status === 'all' || String(row.status ?? '') === filters.status;
    if (!typeMatch || !statusMatch) return false;
    if (!symbolFilter) return true;
    const haystack = [
      String(row.xyz_coin ?? '').toUpperCase(),
      String(row.tiingo_ticker ?? '').toUpperCase(),
      String(row.tiingo_fx_ticker ?? '').toUpperCase(),
      buildTradfiSymbol(row).toUpperCase(),
    ];
    return haystack.some((value) => value.includes(symbolFilter));
  });
}

/** Legacy :6516-6527 — payload lists win, else row-derived / vocab defaults.
 *  (The server derives type_values identically to the client fallback, so
 *  re-filtering without a new payload never changes the options.) */
export function deriveTradfiOptionLists(
  payload: TradfiOptionSource | undefined | null,
  rows: readonly TradfiRow[]
): TradfiOptionLists {
  const stringList = (value: unknown, fallback: readonly string[]): readonly string[] =>
    Array.isArray(value) ? value.map((entry) => String(entry)) : fallback;
  const typeFallback = Array.from(
    new Set(
      rows
        .map((row) => String(row.canonical_type ?? ''))
        .filter(Boolean)
    )
  ).sort();
  return {
    typeValues: stringList(payload?.type_values, typeFallback),
    statusValues: stringList(payload?.status_values, DEFAULT_FILTER_STATUS_VALUES),
    canonicalTypes: stringList(payload?.canonical_types, DEFAULT_CANONICAL_TYPES),
    statuses: stringList(payload?.statuses, DEFAULT_EDITOR_STATUSES),
  };
}

/** Legacy syncTradfiSelectOptions value keep/fallback (:6499-6505). */
export function normalizeSelectValue(
  values: readonly string[],
  current: string,
  includeAll: boolean
): string {
  if (values.includes(current)) return current;
  if (includeAll) return 'all';
  if (values.length > 0) return values[0] ?? '';
  return current;
}
