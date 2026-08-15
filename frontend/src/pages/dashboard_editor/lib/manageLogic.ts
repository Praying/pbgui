/**
 * manageLogic — the pure half of the POSITIONS Manage modal, lifted verbatim
 * from buildPositions' function-local helpers (dashboard_render.js:2131-3281):
 *
 *   parseAmountValue / formatManageNumber        :2287-2297
 *   quoteCurrencyForRow / closePriceForRow /
 *   quoteValueForAmount / minCloseValueForRow /
 *   minCloseAmountForRow                         :2299-2328
 *   marketCloseMinMessage                        :2330-2346
 *   rememberMarketCloseErrorHint                 :2348-2357
 *   shouldLoadFreshClosePrice                    :2359-2361
 *   manageTableHeightForRows / updateManageDialogSize :2263-2277
 *   defaultAmountForRow / controlStateForKey /
 *   syncedAmountFor                              :2536-2566
 *   updateManageRowControls                      :2630-2650
 *   updatePanicAllButton                         :2657-2691
 *   renderManageRows action/validation blocks    :2693-2879
 *   openManageModal geometry                     :2903-2909
 *   openConfigPreviewModal geometry              :2402-2407
 *   renderRows sort                              :3200-3212
 *   requestManageAction success messages         :2474-2493
 *
 * Quirks preserved on purpose (the old code is the spec):
 *  - formatManageNumber(10, 0) === '1' — the /0+$/ strip eats integer zeros
 *    when there is no decimal point (legacy only ever calls it with ≥2
 *    decimals, where the '.' protects the integer part);
 *  - marketCloseMinMessage reads amounts with raw Number() (NOT
 *    parseAmountValue): a comma amount yields NaN→0 quantity/value exactly
 *    like legacy;
 *  - the sort lowercases only the LEFT operand's type check branch and
 *    compares raw values abstractly otherwise.
 */
import { dashT, dashServerMsg } from './i18n';
import type { PositionRow } from '../types/widgets';

/** Structural alias — tests and the modal both pass PositionRow-shaped data. */
export type PositionRowLike = PositionRow;

/** The four per-row actions (render.js:2741-2746). */
export type ManageAction = 'market_close' | 'panic_symbol' | 'graceful_stop_symbol' | 'tp_only_symbol';

/** POST /dashboard/positions/manage body (dashboard.py:1071-1080). The
 *  all-position actions send only {user, action} — symbol/side default
 *  server-side ('' / 'long') exactly like the legacy payloads. */
export interface ManageBody {
  user: string;
  symbol?: string;
  side?: string;
  action: string;
  amount?: number;
  dry_run?: boolean;
}

/**
 * Per-row control state — legacy manageState.controls[rowKey] plus the
 * close-price fields the fresh-price fetch mutates in place.
 */
export interface ManageControlState {
  action: ManageAction;
  amount: string;
  amountTouched: boolean;
  quickPct: number | null;
  /** Fresh /positions/close_price price — 0 until loaded. */
  closePrice: number;
  closePriceLoaded: boolean;
  closePriceLoading: boolean;
  /** Fresh close-price min_cost — 0 when none. */
  minCloseValue: number;
  /** Precision amount remembered from a failed market close. */
  minCloseAmount: number;
}

/* ── key / number parsing (render.js:2283-2297) ── */

export function rowKey(row: PositionRowLike | null | undefined): string {
  return row ? String(row.user) + '|' + String(row.symbol) + '|' + String(row.side) : '';
}

export function parseAmountValue(value: unknown): number {
  const text = String(value == null ? '' : value).trim().replace(',', '.');
  const parsed = parseFloat(text);
  return isNaN(parsed) ? NaN : parsed;
}

export function formatManageNumber(value: unknown, decimals: number): string {
  const num = Number(value);
  if (!isFinite(num)) return '';
  return num.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
}

/* ── quote currency / close price (render.js:2299-2328) ── */

export function quoteCurrencyForRow(row: PositionRowLike): 'USDC' | 'USDT' {
  const symbol = String((row && row.symbol) || '').toUpperCase();
  if (symbol.slice(-4) === 'USDC') return 'USDC';
  return 'USDT';
}

export function closePriceForRow(row: PositionRowLike, state: ManageControlState): number {
  const fresh = Number((state && state.closePrice) || 0);
  if (fresh > 0) return fresh;
  return Math.abs(Number((row && row.price) || 0));
}

export function quoteValueForAmount(
  row: PositionRowLike,
  amount: unknown,
  state: ManageControlState
): number {
  const qty = Math.abs(Number(amount || 0));
  const price = closePriceForRow(row, state);
  return qty > 0 && price > 0 ? qty * price : 0;
}

export function minCloseValueForRow(row: PositionRowLike, state: ManageControlState): number {
  const freshMin = Number((state && state.minCloseValue) || 0);
  if (freshMin > 0) return freshMin;
  const exchange = String((row && row.exchange) || '').toLowerCase();
  return exchange === 'hyperliquid' ? 10 : 0;
}

export function minCloseAmountForRow(row: PositionRowLike, state: ManageControlState): number {
  const price = closePriceForRow(row, state);
  const minValue = minCloseValueForRow(row, state);
  return price > 0 && minValue > 0 ? minValue / price : 0;
}

/* ── validation messages (render.js:2330-2346) ── */

export function marketCloseMinMessage(
  row: PositionRowLike,
  amount: unknown,
  state: ManageControlState
): string {
  const qty = Math.abs(Number(amount || 0));
  const minQty = Number((state && state.minCloseAmount) || 0);
  if (minQty > 0 && qty > 0 && qty < minQty) {
    return dashT('dash.exchangeMinClose', 'Exchange minimum close amount is {amount}.', {
      amount: formatManageNumber(minQty, 8),
    });
  }
  const minValue = minCloseValueForRow(row, state);
  if (minValue <= 0) return '';
  const value = quoteValueForAmount(row, amount, state);
  if (value >= minValue) return '';
  const minValueAmount = minCloseAmountForRow(row, state);
  return dashT(
    'dash.hyperliquidMinOrder',
    'Hyperliquid minimum order value is ${min}. Selected close value is ${value}; use at least {amount} amount.',
    {
      min: formatManageNumber(minValue, 2),
      value: formatManageNumber(value, 6),
      amount: formatManageNumber(minValueAmount, 8),
    }
  );
}

/** The extracted-precision hint from a failed market close (render.js:2348-2357). */
export interface MarketCloseErrorHint {
  key: string;
  minCloseAmount: number;
}

export function rememberMarketCloseErrorHint(
  body: Partial<ManageBody> | null | undefined,
  message: unknown
): MarketCloseErrorHint | null {
  if (!body || body.action !== 'market_close') return null;
  const match = String(message || '').match(/minimum amount precision of\s+([0-9.]+)/i);
  if (!match) return null;
  const minAmount = parseFloat(match[1] ?? '');
  if (!isFinite(minAmount) || minAmount <= 0) return null;
  return {
    key: String(body.user || '') + '|' + String(body.symbol || '') + '|' + String(body.side || 'long'),
    minCloseAmount: minAmount,
  };
}

export function shouldLoadFreshClosePrice(
  row: PositionRowLike,
  state: ManageControlState
): boolean {
  return (
    String((row && row.exchange) || '').toLowerCase() === 'hyperliquid' &&
    !state.closePriceLoaded &&
    !state.closePriceLoading
  );
}

/* ── amount sync (render.js:2536-2566) ── */

export function defaultAmountForRow(row: PositionRowLike): string {
  return formatManageNumber(Math.abs(Number((row && row.size) || 0)), 8);
}

/** The amount a row input should show (quickPct → recompute, untouched → default). */
export function syncedAmountFor(row: PositionRowLike, state: ManageControlState): string {
  if (state.quickPct != null) {
    return formatManageNumber(
      (Math.abs(Number(row.size || 0)) * Number(state.quickPct || 0)) / 100,
      8
    );
  }
  if (!state.amountTouched) return defaultAmountForRow(row);
  return state.amount;
}

/* ── row action validation (render.js:2840-2869) ── */

export type ManageActionValidation =
  | { ok: true; body: ManageBody }
  | { ok: false; message: string };

export function buildRowAction(
  row: PositionRowLike,
  state: ManageControlState
): ManageActionValidation {
  const body: ManageBody = {
    user: row.user,
    symbol: row.symbol,
    side: row.side,
    action: state.action,
  };
  if (state.action === 'market_close') {
    if (row.market_close_supported === false) {
      return {
        ok: false,
        message:
          dashServerMsg(String(row.market_close_reason || '')) ||
          dashT('dash.marketCloseUnavailable', 'Direct market close is unavailable for this exchange.'),
      };
    }
    const amount = parseAmountValue(state.amount);
    if (isNaN(amount) || amount <= 0) {
      return { ok: false, message: dashT('dash.enterAmountGreaterZero', 'Enter an amount greater than zero.') };
    }
    const minMessage = marketCloseMinMessage(row, amount, state);
    if (minMessage) return { ok: false, message: minMessage };
    body.amount = amount;
  }
  return { ok: true, body };
}

/* ── success message mapping (render.js:2474-2493) ── */

export interface ManageSuccess {
  statusText: string;
  /** Set for dry runs — the config preview to open. */
  preview: { title: string; config: unknown } | null;
}

export function manageSuccessMessage(
  body: ManageBody,
  data: Record<string, unknown> | null | undefined
): ManageSuccess {
  if (data && data.dry_run) {
    const previewLabel =
      body.action === 'graceful_stop_all'
        ? dashT('dash.gracefulStop', 'Graceful stop')
        : body.action === 'tp_only_all'
          ? dashT('dash.takeProfitOnly', 'Take Profit Only')
          : dashT('dash.panic', 'Panic');
    return {
      statusText: dashT('dash.previewOnly', 'Preview only. No config was saved and no SSH sync was started.'),
      preview: {
        title: dashT('dash.configPreviewFor', '{kind} config preview for {user}', {
          kind: previewLabel,
          user: body.user || 'user',
        }),
        config: data.config ?? null,
      },
    };
  }
  const coin = String((data && data.coin) || body.symbol);
  let statusText: string;
  if (body.action === 'market_close') {
    statusText = dashT('dash.marketCloseSent', 'Market close order sent.');
  } else if (body.action === 'panic_symbol') {
    statusText = dashT('dash.panicSynced', 'Panic synced for {coin}.', { coin });
  } else if (body.action === 'graceful_stop_symbol') {
    statusText = dashT('dash.gracefulStopSynced', 'Graceful stop synced for {coin}.', { coin });
  } else if (body.action === 'tp_only_symbol') {
    statusText = dashT('dash.tpOnlySynced', 'Take Profit Only synced for {coin}.', { coin });
  } else if (body.action === 'graceful_stop_all') {
    statusText = dashT('dash.globalGracefulStopSynced', 'Global graceful stop synced for user {user}.', {
      user: body.user,
    });
  } else if (body.action === 'tp_only_all') {
    statusText = dashT('dash.globalTpOnlySynced', 'Global Take Profit Only synced for user {user}.', {
      user: body.user,
    });
  } else {
    statusText = dashT('dash.globalPanicSynced', 'Global panic synced for user {user}.', {
      user: body.user,
    });
  }
  return { statusText, preview: null };
}

/* ── dialog geometry (render.js:2263-2277, 2402-2407, 2903-2909) ── */

export function manageTableHeightForRows(rowCount: number): number {
  return 38 + Math.min(Math.max(rowCount, 1), 8) * 46;
}

export function manageModalHeightFor(viewportHeight: number, tableHeight: number): number {
  return Math.min(viewportHeight - 96, Math.max(280, Math.min(640, 190 + tableHeight)));
}

export interface ModalGeometry {
  width: number;
  height: number;
  left: number;
  top: number;
}

export function initialManageModalGeometry(
  viewportWidth: number,
  viewportHeight: number,
  rowCount: number
): ModalGeometry {
  const width = Math.max(760, viewportWidth - 32);
  const height = manageModalHeightFor(viewportHeight, manageTableHeightForRows(rowCount));
  return {
    width,
    height,
    left: Math.max(12, Math.floor((viewportWidth - width) / 2)),
    top: Math.max(12, Math.floor((viewportHeight - height) / 2)),
  };
}

export function previewModalGeometry(viewportWidth: number, viewportHeight: number): ModalGeometry {
  const width = Math.min(1200, Math.max(560, viewportWidth - 48));
  const height = Math.min(760, Math.max(320, viewportHeight - 72));
  return {
    width,
    height,
    left: Math.max(12, Math.floor((viewportWidth - width) / 2)),
    top: Math.max(12, Math.floor((viewportHeight - height) / 2)),
  };
}

/* ── per-row control state (render.js:2630-2650) ── */

export interface ManageRowControls {
  amountDisabled: boolean;
  quoteDisabled: boolean;
  quickVisible: boolean;
  runText: string;
  runClass: string;
  runDisabled: boolean;
  runTitle: string;
}

export function manageRowControls(
  row: PositionRowLike,
  state: ManageControlState,
  actionInFlight: boolean
): ManageRowControls {
  const isMarket = state.action === 'market_close';
  const marketSupported = row.market_close_supported !== false;
  const marketDisabled = isMarket && !marketSupported;
  const minMessage = isMarket ? marketCloseMinMessage(row, state.amount, state) : '';
  const modeClass =
    state.action === 'panic_symbol'
      ? ' danger'
      : state.action === 'graceful_stop_symbol'
        ? ' warn'
        : state.action === 'tp_only_symbol'
          ? ' ok'
          : '';
  const modeText =
    state.action === 'panic_symbol'
      ? dashT('dash.panic', 'Panic')
      : state.action === 'graceful_stop_symbol'
        ? dashT('dash.gracefulStop', 'Graceful stop')
        : state.action === 'tp_only_symbol'
          ? dashT('dash.takeProfitOnly', 'Take Profit Only')
          : '';
  const runText = marketDisabled
    ? dashT('dash.unavailable', 'Unavailable')
    : isMarket
      ? dashT('dash.marketClose', 'Market Close')
      : modeText;
  const runTitle = marketDisabled
    ? String(row.market_close_reason || dashT('dash.marketCloseUnavailable', 'Direct market close is unavailable for this exchange.'))
    : actionInFlight
      ? dashT('dash.anotherActionRunning', 'Another manage action is still running.')
      : state.closePriceLoading
        ? dashT('dash.loadingClosePrice', 'Loading fresh close price...')
        : minMessage || '';
  return {
    amountDisabled: !isMarket || marketDisabled,
    quoteDisabled: !isMarket || marketDisabled || Number((row && row.price) || 0) <= 0,
    quickVisible: isMarket && !marketDisabled,
    runText,
    runClass: 'dp-row-run' + (isMarket ? ' danger' : modeClass),
    runDisabled: actionInFlight || marketDisabled || !!minMessage || (isMarket && state.closePriceLoading),
    runTitle,
  };
}

/* ── action select options (render.js:2741-2755) ── */

export interface ActionOption {
  value: ManageAction;
  label: string;
  disabled: boolean;
}

export function ACTION_OPTIONS(row: PositionRowLike): ActionOption[] {
  const entries: Array<[ManageAction, string]> = [
    ['market_close', dashT('dash.marketCloseAmount', 'Market close amount')],
    ['panic_symbol', dashT('dash.panicSymbol', 'Panic symbol')],
    ['graceful_stop_symbol', dashT('dash.gracefulStopSymbol', 'Graceful stop symbol')],
    ['tp_only_symbol', dashT('dash.takeProfitOnlySymbol', 'Take profit only symbol')],
  ];
  const marketUnsupported = row.market_close_supported === false;
  return entries.map(([value, label]) => ({
    value,
    label:
      value === 'market_close' && marketUnsupported
        ? label + dashT('dash.unavailableSuffix', ' (unavailable)')
        : label,
    disabled: value === 'market_close' && marketUnsupported,
  }));
}

/* ── all-position footer buttons (render.js:2657-2691) ── */

export interface PanicAllButtonState {
  disabled: boolean;
  text: string;
  title: string;
}

export interface PanicAllButtonsState {
  previewPanic: PanicAllButtonState;
  panic: PanicAllButtonState;
  previewGraceful: PanicAllButtonState;
  graceful: PanicAllButtonState;
  previewTpOnly: PanicAllButtonState;
  tpOnly: PanicAllButtonState;
}

export function panicAllButtonsState(user: string, actionInFlight: boolean): PanicAllButtonsState {
  const busyTitle = dashT('dash.anotherActionRunning', 'Another manage action is still running.');
  const noUserTitle = dashT('dash.selectUserPositionFirst', 'Select a user position first.');
  const disabled = !user || actionInFlight;
  const title = actionInFlight ? busyTitle : user ? 'ok' : noUserTitle;
  const t = (msg: string): string => (actionInFlight ? busyTitle : user ? msg : noUserTitle);
  return {
    previewPanic: {
      disabled,
      text: dashT('dash.previewPanic', 'Preview Panic'),
      title: t(dashT('dash.buildPanicAll', 'Build the panic-all config for {user} without saving or syncing.', { user })),
    },
    panic: {
      disabled,
      text: dashT('dash.panic', 'Panic'),
      title: t(dashT('dash.savePanicAll', 'Save Panic for all positions of {user} and sync it to the bot host.', { user })),
    },
    previewGraceful: {
      disabled,
      text: dashT('dash.previewGracefulStop', 'Preview Graceful stop'),
      title: t(dashT('dash.buildGracefulAll', 'Build the Graceful Stop config for {user} without saving or syncing.', { user })),
    },
    graceful: {
      disabled,
      text: dashT('dash.gracefulStop', 'Graceful stop'),
      title: t(dashT('dash.saveGracefulAll', 'Save Graceful Stop for all positions of {user} and sync it to the bot host.', { user })),
    },
    previewTpOnly: {
      disabled,
      text: dashT('dash.previewTpOnly', 'Preview TP only'),
      title: t(dashT('dash.buildTpOnlyAll', 'Build the Take Profit Only config for {user} without saving or syncing.', { user })),
    },
    tpOnly: {
      disabled,
      text: dashT('dash.takeProfitOnly', 'Take Profit Only'),
      title: t(dashT('dash.saveTpOnlyAll', 'Save Take Profit Only for {user} and sync it to the bot host.', { user })),
    },
  };
}

/* ── positions table sort (render.js:3200-3212) ── */

export function sortPositions<T extends Record<string, unknown>>(
  rows: T[],
  sortCol: string | null,
  sortAsc: boolean
): T[] {
  if (!sortCol) return rows;
  const sorted = rows.slice();
  sorted.sort((a, b) => {
    let va: unknown = a[sortCol];
    let vb: unknown = b[sortCol];
    if (typeof va === 'string') {
      va = va.toLowerCase();
      vb = String(vb ?? '').toLowerCase();
    }
    /* JS abstract comparison — the cast is compile-time only; runtime
       semantics are byte-identical to the legacy comparator. */
    const x = va as string;
    const y = vb as string;
    if (x < y) return sortAsc ? -1 : 1;
    if (x > y) return sortAsc ? 1 : -1;
    return 0;
  });
  return sorted;
}

/* ── the shared 11-column table contract (render.js:2208-2220) ──
 * Legacy defines COLS once inside buildPositions and uses it for BOTH the
 * widget table and the manage modal table. */

export interface PositionColumn {
  key: keyof PositionRow & string;
  i18nKey: string;
  fallback: string;
  fmt: ((v: number) => string) | null;
}

export const POSITION_COLUMNS: readonly PositionColumn[] = [
  { key: 'user', i18nKey: 'dash.user', fallback: 'User', fmt: null },
  { key: 'symbol', i18nKey: 'dash.symbol', fallback: 'Symbol', fmt: null },
  { key: 'side', i18nKey: 'dash.side', fallback: 'Side', fmt: null },
  { key: 'size', i18nKey: 'dash.size', fallback: 'Size', fmt: (v) => v.toFixed(3) },
  { key: 'upnl', i18nKey: 'dash.upnl', fallback: 'uPnl', fmt: (v) => v.toFixed(4) },
  { key: 'entry', i18nKey: 'dash.entry', fallback: 'Entry', fmt: (v) => v.toFixed(5) },
  { key: 'price', i18nKey: 'dash.price', fallback: 'Price', fmt: (v) => v.toFixed(5) },
  { key: 'dca', i18nKey: 'dash.dca', fallback: 'DCA', fmt: null },
  { key: 'next_dca', i18nKey: 'dash.nextDca', fallback: 'Next DCA', fmt: (v) => v.toFixed(5) },
  { key: 'next_tp', i18nKey: 'dash.nextTp', fallback: 'Next TP', fmt: (v) => v.toFixed(5) },
  { key: 'pos_value', i18nKey: 'dash.posValue', fallback: 'Pos Value', fmt: (v) => v.toFixed(2) },
];

/**
 * Cell text — the legacy `COLS[ci].fmt ? COLS[ci].fmt(val) : String(val)`
 * (render.js:3230-3232): numeric columns format, everything else String().
 * (Legacy formatManageValue wrapped fmt in try/catch → String fallback; the
 * isFinite guard reproduces that for missing/malformed values.)
 */
export function positionCellText(row: PositionRowLike, col: PositionColumn): string {
  const val = row[col.key];
  if (col.fmt && typeof val === 'number' && isFinite(val)) return col.fmt(val);
  return String(val);
}
