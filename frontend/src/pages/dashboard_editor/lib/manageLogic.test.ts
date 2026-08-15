import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDashTranslator } from './i18n';
import {
  ACTION_OPTIONS,
  buildRowAction,
  closePriceForRow,
  defaultAmountForRow,
  formatManageNumber,
  initialManageModalGeometry,
  manageModalHeightFor,
  manageRowControls,
  manageSuccessMessage,
  manageTableHeightForRows,
  marketCloseMinMessage,
  minCloseAmountForRow,
  minCloseValueForRow,
  panicAllButtonsState,
  parseAmountValue,
  previewModalGeometry,
  quoteCurrencyForRow,
  quoteValueForAmount,
  rememberMarketCloseErrorHint,
  rowKey,
  shouldLoadFreshClosePrice,
  sortPositions,
  syncedAmountFor,
  type ManageControlState,
  type PositionRowLike,
} from './manageLogic';

/*
 * manageLogic — the pure half of the legacy Manage modal
 * (dashboard_render.js:2131-3281, function-local helpers lifted verbatim).
 * The old code is the spec; every assertion mirrors a legacy line.
 */

beforeEach(() => {
  setDashTranslator(null);
});

afterEach(() => {
  setDashTranslator(null);
});

function state(overrides: Partial<ManageControlState> = {}): ManageControlState {
  return {
    action: 'market_close',
    amount: '1',
    amountTouched: false,
    quickPct: null,
    closePrice: 0,
    closePriceLoaded: false,
    closePriceLoading: false,
    minCloseValue: 0,
    minCloseAmount: 0,
    ...overrides,
  };
}

function row(overrides: Partial<PositionRowLike> = {}): PositionRowLike {
  return {
    user: 'alice',
    exchange: 'binance',
    symbol: 'BTCUSDT',
    side: 'long',
    size: 2,
    upnl: 1.5,
    entry: 100,
    price: 110,
    dca: 0,
    next_dca: 90,
    next_tp: 130,
    pos_value: 220,
    ...overrides,
  };
}

describe('rowKey / parseAmountValue / formatManageNumber (render.js:2283-2297)', () => {
  it('builds the user|symbol|side control key', () => {
    expect(rowKey(row())).toBe('alice|BTCUSDT|long');
    expect(rowKey(null)).toBe('');
  });

  it('parses amounts with comma→dot normalization and parseFloat semantics', () => {
    expect(parseAmountValue('1.5')).toBe(1.5);
    expect(parseAmountValue('1,5')).toBe(1.5);
    expect(parseAmountValue(' 2 ')).toBe(2);
    expect(parseAmountValue('12abc')).toBe(12);
    expect(parseAmountValue('')).toBeNaN();
    expect(parseAmountValue(null)).toBeNaN();
    expect(parseAmountValue('abc')).toBeNaN();
  });

  it('formats with trailing-zero stripping (render.js:2293-2297)', () => {
    expect(formatManageNumber(1.5, 2)).toBe('1.5');
    expect(formatManageNumber(1, 2)).toBe('1');
    expect(formatManageNumber(0.5, 4)).toBe('0.5');
    expect(formatManageNumber(1.23456, 8)).toBe('1.23456');
    expect(formatManageNumber(100, 2)).toBe('100');
    expect(formatManageNumber(0, 8)).toBe('0');
  });

  it('returns the empty string for non-finite values', () => {
    expect(formatManageNumber(NaN, 4)).toBe('');
    expect(formatManageNumber(Infinity, 4)).toBe('');
    expect(formatManageNumber('x' as unknown as number, 4)).toBe('');
  });

  it('preserves the legacy decimals=0 integer-zero quirk', () => {
    /* (10).toFixed(0) = '10' — the /0+$/ strip eats the integer zero too. */
    expect(formatManageNumber(10, 0)).toBe('1');
  });
});

describe('quote currency / close price helpers (render.js:2299-2328)', () => {
  it('detects the USDC suffix case-insensitively', () => {
    expect(quoteCurrencyForRow(row({ symbol: 'BTCUSDC' }))).toBe('USDC');
    expect(quoteCurrencyForRow(row({ symbol: 'btcusdc' }))).toBe('USDC');
    expect(quoteCurrencyForRow(row({ symbol: 'BTCUSDT' }))).toBe('USDT');
    expect(quoteCurrencyForRow(row({ symbol: '' }))).toBe('USDT');
  });

  it('prefers the fresh close price, falls back to |row.price|', () => {
    expect(closePriceForRow(row(), state({ closePrice: 123.4 }))).toBe(123.4);
    expect(closePriceForRow(row({ price: -110 }), state())).toBe(110);
    expect(closePriceForRow(row({ price: 110 }), state({ closePrice: 0 }))).toBe(110);
  });

  it('computes quote value as |amount| × price, zero when either side is zero', () => {
    expect(quoteValueForAmount(row(), '0.5', state())).toBe(55);
    expect(quoteValueForAmount(row(), '-0.5', state())).toBe(55);
    expect(quoteValueForAmount(row(), '0', state())).toBe(0);
    expect(quoteValueForAmount(row({ price: 0 }), '0.5', state())).toBe(0);
  });

  it('derives the minimum close value from state, else hyperliquid=10, else 0', () => {
    expect(minCloseValueForRow(row(), state({ minCloseValue: 5 }))).toBe(5);
    expect(minCloseValueForRow(row({ exchange: 'hyperliquid' }), state())).toBe(10);
    expect(minCloseValueForRow(row({ exchange: 'HyperLiquid' }), state())).toBe(10);
    expect(minCloseValueForRow(row({ exchange: 'binance' }), state())).toBe(0);
  });

  it('derives the minimum close amount as minValue / price, zero when unusable', () => {
    expect(minCloseAmountForRow(row({ price: 2 }), state({ minCloseValue: 10 }))).toBe(5);
    expect(minCloseAmountForRow(row({ price: 0 }), state({ minCloseValue: 10 }))).toBe(0);
    expect(minCloseAmountForRow(row(), state({ minCloseValue: 0 }))).toBe(0);
  });
});

describe('marketCloseMinMessage (render.js:2330-2346)', () => {
  it('returns the exchange-minimum message below a remembered min amount', () => {
    const msg = marketCloseMinMessage(row(), '0.3', state({ minCloseAmount: 0.5 }));
    expect(msg).toBe('Exchange minimum close amount is 0.5.');
  });

  it('skips the min-amount branch when the amount is zero', () => {
    expect(marketCloseMinMessage(row(), '0', state({ minCloseAmount: 0.5 }))).toBe('');
  });

  it('returns the Hyperliquid minimum-order message below the min value', () => {
    const msg = marketCloseMinMessage(
      row({ exchange: 'hyperliquid' }),
      '0.05',
      state({ closePrice: 100, minCloseValue: 10 })
    );
    expect(msg).toBe(
      'Hyperliquid minimum order value is $10. Selected close value is $5; use at least 0.1 amount.'
    );
  });

  it('returns the empty string once the value clears the minimum', () => {
    expect(
      marketCloseMinMessage(row({ exchange: 'hyperliquid' }), '0.2', state({ closePrice: 100, minCloseValue: 10 }))
    ).toBe('');
    expect(marketCloseMinMessage(row({ exchange: 'binance' }), '0.2', state())).toBe('');
  });
});

describe('rememberMarketCloseErrorHint (render.js:2348-2357)', () => {
  it('extracts the precision amount for market_close failures', () => {
    const hint = rememberMarketCloseErrorHint(
      { user: 'alice', symbol: 'BTCUSDT', side: 'long', action: 'market_close' },
      'Bybit minimum amount precision of 0.001 required'
    );
    expect(hint).toEqual({ key: 'alice|BTCUSDT|long', minCloseAmount: 0.001 });
  });

  it('defaults the side to long in the hint key', () => {
    const hint = rememberMarketCloseErrorHint(
      { user: 'alice', symbol: 'BTCUSDT', action: 'market_close' },
      'minimum amount precision of 0.01'
    );
    expect(hint?.key).toBe('alice|BTCUSDT|long');
  });

  it('ignores non-market-close bodies, non-matching messages and junk numbers', () => {
    expect(rememberMarketCloseErrorHint({ action: 'panic_symbol' }, 'minimum amount precision of 0.001')).toBeNull();
    expect(rememberMarketCloseErrorHint({ action: 'market_close' }, 'some other error')).toBeNull();
    expect(rememberMarketCloseErrorHint({ action: 'market_close' }, 'minimum amount precision of abc')).toBeNull();
    expect(rememberMarketCloseErrorHint({ action: 'market_close' }, 'minimum amount precision of 0')).toBeNull();
  });
});

describe('fresh close-price gate (render.js:2359-2361)', () => {
  it('loads only for hyperliquid rows that are not loaded/loading', () => {
    const r = row({ exchange: 'hyperliquid' });
    expect(shouldLoadFreshClosePrice(r, state())).toBe(true);
    expect(shouldLoadFreshClosePrice(r, state({ closePriceLoaded: true }))).toBe(false);
    expect(shouldLoadFreshClosePrice(r, state({ closePriceLoading: true }))).toBe(false);
    expect(shouldLoadFreshClosePrice(row({ exchange: 'binance' }), state())).toBe(false);
  });
});

describe('default amount + quickPct sync (render.js:2536-2566)', () => {
  it('defaults to |size| formatted with 8 decimals', () => {
    expect(defaultAmountForRow(row({ size: -2 }))).toBe('2');
    expect(defaultAmountForRow(row({ size: 0 }))).toBe('0');
  });

  it('applies quickPct over |size| when set', () => {
    const r = row({ size: 4 });
    expect(syncedAmountFor(r, state({ quickPct: 25 }))).toBe('1');
    expect(syncedAmountFor(r, state({ quickPct: 50 }))).toBe('2');
    expect(syncedAmountFor(r, state({ quickPct: 100 }))).toBe('4');
  });

  it('re-defaults untouched amounts to |size|', () => {
    expect(syncedAmountFor(row({ size: 3 }), state({ amount: '9', amountTouched: false }))).toBe('3');
  });

  it('keeps a touched, non-quick amount untouched', () => {
    expect(syncedAmountFor(row({ size: 3 }), state({ amount: '1.5', amountTouched: true }))).toBe('1.5');
  });
});

describe('row action validation (render.js:2840-2869)', () => {
  it('builds a non-market payload without an amount', () => {
    expect(
      buildRowAction(row(), state({ action: 'panic_symbol', amountTouched: true, amount: '2' }))
    ).toEqual({ ok: true, body: { user: 'alice', symbol: 'BTCUSDT', side: 'long', action: 'panic_symbol' } });
  });

  it('rejects unsupported market closes with the row reason', () => {
    const res = buildRowAction(
      row({ market_close_supported: false, market_close_reason: 'Exchange not verified' }),
      state()
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe('Exchange not verified');
  });

  it('falls back to the generic unavailable message without a reason', () => {
    const res = buildRowAction(row({ market_close_supported: false }), state());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe('Direct market close is unavailable for this exchange.');
  });

  it('rejects zero / unparsable amounts', () => {
    for (const amount of ['', 'abc', '0', '-1']) {
      const res = buildRowAction(row(), state({ amount, amountTouched: true }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toBe('Enter an amount greater than zero.');
    }
  });

  it('rejects amounts below the minimum with the min message', () => {
    const res = buildRowAction(row(), state({ amount: '0.3', amountTouched: true, minCloseAmount: 0.5 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe('Exchange minimum close amount is 0.5.');
  });

  it('builds the market_close payload with the parsed amount', () => {
    const res = buildRowAction(row(), state({ amount: '1,5', amountTouched: true }));
    expect(res).toEqual({
      ok: true,
      body: { user: 'alice', symbol: 'BTCUSDT', side: 'long', action: 'market_close', amount: 1.5 },
    });
  });
});

describe('manageSuccessMessage (render.js:2474-2493)', () => {
  const user = { user: 'alice', symbol: 'BTCUSDT', side: 'long' };

  it('reports dry runs as a preview with the per-action title', () => {
    expect(manageSuccessMessage({ ...user, action: 'panic_all', dry_run: true }, { dry_run: true })).toEqual({
      statusText: 'Preview only. No config was saved and no SSH sync was started.',
      preview: { title: 'Panic config preview for alice', config: null },
    });
    expect(
      manageSuccessMessage({ ...user, action: 'graceful_stop_all', dry_run: true }, { dry_run: true }).preview?.title
    ).toBe('Graceful stop config preview for alice');
    expect(
      manageSuccessMessage({ ...user, action: 'tp_only_all', dry_run: true }, { dry_run: true }).preview?.title
    ).toBe('Take Profit Only config preview for alice');
  });

  it('falls back to the literal user in the preview title', () => {
    expect(
      manageSuccessMessage({ user: '', action: 'panic_all', dry_run: true }, { dry_run: true }).preview?.title
    ).toBe('Panic config preview for user');
  });

  it('carries the dry-run config into the preview', () => {
    const res = manageSuccessMessage({ ...user, action: 'panic_all', dry_run: true }, { dry_run: true, config: { a: 1 } });
    expect(res.preview?.config).toEqual({ a: 1 });
  });

  it('maps every legacy action to its success message', () => {
    expect(manageSuccessMessage({ ...user, action: 'market_close' }, {}).statusText).toBe('Market close order sent.');
    expect(manageSuccessMessage({ ...user, action: 'panic_symbol' }, {}).statusText).toBe('Panic synced for BTCUSDT.');
    expect(manageSuccessMessage({ ...user, action: 'panic_symbol' }, { coin: 'XRPUSDT' }).statusText).toBe(
      'Panic synced for XRPUSDT.'
    );
    expect(manageSuccessMessage({ ...user, action: 'graceful_stop_symbol' }, {}).statusText).toBe(
      'Graceful stop synced for BTCUSDT.'
    );
    expect(manageSuccessMessage({ ...user, action: 'tp_only_symbol' }, {}).statusText).toBe(
      'Take Profit Only synced for BTCUSDT.'
    );
    expect(manageSuccessMessage({ ...user, action: 'graceful_stop_all' }, {}).statusText).toBe(
      'Global graceful stop synced for user alice.'
    );
    expect(manageSuccessMessage({ ...user, action: 'tp_only_all' }, {}).statusText).toBe(
      'Global Take Profit Only synced for user alice.'
    );
    expect(manageSuccessMessage({ ...user, action: 'panic_all' }, {}).statusText).toBe(
      'Global panic synced for user alice.'
    );
  });

  it('never previews non-dry runs', () => {
    expect(manageSuccessMessage({ ...user, action: 'panic_all' }, { dry_run: false }).preview).toBeNull();
  });
});

describe('dialog geometry (render.js:2263-2277, 2903-2909, 2402-2407)', () => {
  it('caps the manage table height at 8 rows', () => {
    expect(manageTableHeightForRows(0)).toBe(38 + 46);
    expect(manageTableHeightForRows(3)).toBe(38 + 3 * 46);
    expect(manageTableHeightForRows(8)).toBe(38 + 8 * 46);
    expect(manageTableHeightForRows(20)).toBe(38 + 8 * 46);
  });

  it('computes the modal height with the legacy clamp chain', () => {
    expect(manageModalHeightFor(1000, 406)).toBe(596); // min(904, max(280, min(640, 596)))
    expect(manageModalHeightFor(1000, 100)).toBe(290); // min(904, max(280, min(640, 290)))
    expect(manageModalHeightFor(300, 406)).toBe(204); // min(204, …) — viewport wins
  });

  it('computes the initial modal geometry (openManageModal)', () => {
    const height = manageModalHeightFor(1000, manageTableHeightForRows(3));
    expect(initialManageModalGeometry(1920, 1000, 3)).toEqual({
      width: Math.max(760, 1920 - 32),
      height,
      left: Math.max(12, Math.floor((1920 - 1888) / 2)),
      top: Math.max(12, Math.floor((1000 - height) / 2)),
    });
  });

  it('computes the preview modal geometry', () => {
    expect(previewModalGeometry(1920, 1000)).toEqual({
      width: 1200,
      height: 760,
      left: Math.max(12, Math.floor((1920 - 1200) / 2)),
      top: Math.max(12, Math.floor((1000 - 760) / 2)),
    });
    expect(previewModalGeometry(600, 380)).toEqual({
      width: 560,
      height: 320,
      left: Math.max(12, Math.floor((600 - 560) / 2)),
      top: Math.max(12, Math.floor((380 - 320) / 2)),
    });
  });
});

describe('manageRowControls (render.js:2630-2650)', () => {
  it('enables the amount inputs only for supported market closes', () => {
    const c = manageRowControls(row(), state(), false);
    expect(c.amountDisabled).toBe(false);
    expect(c.quoteDisabled).toBe(false);
    expect(c.quickVisible).toBe(true);
    expect(c.runText).toBe('Market Close');
    expect(c.runClass).toBe('dp-row-run danger');
    expect(c.runDisabled).toBe(false);
    expect(c.runTitle).toBe('');
  });

  it('disables everything for unsupported market closes and shows the reason', () => {
    const c = manageRowControls(
      row({ market_close_supported: false, market_close_reason: 'Not verified' }),
      state(),
      false
    );
    expect(c.amountDisabled).toBe(true);
    expect(c.quoteDisabled).toBe(true);
    expect(c.quickVisible).toBe(false);
    expect(c.runText).toBe('Unavailable');
    expect(c.runDisabled).toBe(true);
    expect(c.runTitle).toBe('Not verified');
  });

  it('disables the quote input when the row has no price', () => {
    expect(manageRowControls(row({ price: 0 }), state(), false).quoteDisabled).toBe(true);
  });

  it('labels and colors the per-symbol action buttons', () => {
    expect(manageRowControls(row(), state({ action: 'panic_symbol' }), false).runText).toBe('Panic');
    expect(manageRowControls(row(), state({ action: 'panic_symbol' }), false).runClass).toBe('dp-row-run danger');
    expect(manageRowControls(row(), state({ action: 'graceful_stop_symbol' }), false).runText).toBe('Graceful stop');
    expect(manageRowControls(row(), state({ action: 'graceful_stop_symbol' }), false).runClass).toBe('dp-row-run warn');
    expect(manageRowControls(row(), state({ action: 'tp_only_symbol' }), false).runText).toBe('Take Profit Only');
    expect(manageRowControls(row(), state({ action: 'tp_only_symbol' }), false).runClass).toBe('dp-row-run ok');
  });

  it('disables the run button while busy, loading a price, or below the minimum', () => {
    expect(manageRowControls(row(), state(), true).runDisabled).toBe(true);
    expect(manageRowControls(row(), state(), true).runTitle).toBe('Another manage action is still running.');
    expect(manageRowControls(row(), state({ closePriceLoading: true }), false).runTitle).toBe(
      'Loading fresh close price...'
    );
    expect(
      manageRowControls(row(), state({ amount: '0.3', minCloseAmount: 0.5 }), false).runDisabled
    ).toBe(true);
  });
});

describe('ACTION_OPTIONS / panicAllButtonsState (render.js:2741-2755, 2657-2691)', () => {
  it('lists the four legacy row actions with market_close disabled when unsupported', () => {
    const opts = ACTION_OPTIONS(row({ market_close_supported: false }));
    expect(opts.map((o) => [o.value, o.label, o.disabled])).toEqual([
      ['market_close', 'Market close amount (unavailable)', true],
      ['panic_symbol', 'Panic symbol', false],
      ['graceful_stop_symbol', 'Graceful stop symbol', false],
      ['tp_only_symbol', 'Take profit only symbol', false],
    ]);
    expect(ACTION_OPTIONS(row())[0]!.disabled).toBe(false);
  });

  it('disables the six all-position buttons without a user or while busy', () => {
    const idle = panicAllButtonsState('alice', false);
    expect(idle.previewPanic.disabled).toBe(false);
    expect(idle.previewPanic.text).toBe('Preview Panic');
    expect(idle.previewPanic.title).toBe(
      'Build the panic-all config for alice without saving or syncing.'
    );
    expect(idle.panic.text).toBe('Panic');
    expect(idle.panic.title).toBe('Save Panic for all positions of alice and sync it to the bot host.');
    expect(idle.previewGraceful.text).toBe('Preview Graceful stop');
    expect(idle.graceful.text).toBe('Graceful stop');
    expect(idle.previewTpOnly.text).toBe('Preview TP only');
    expect(idle.tpOnly.text).toBe('Take Profit Only');

    const noUser = panicAllButtonsState('', false);
    expect(noUser.previewPanic.disabled).toBe(true);
    expect(noUser.previewPanic.title).toBe('Select a user position first.');

    const busy = panicAllButtonsState('alice', true);
    expect(busy.panic.disabled).toBe(true);
    expect(busy.panic.title).toBe('Another manage action is still running.');
  });
});

describe('sortPositions (render.js:3200-3212)', () => {
  const rows = [
    row({ user: 'bob', symbol: 'ETHUSDT', upnl: -2 }),
    row({ user: 'Alice', symbol: 'BTCUSDT', upnl: 5 }),
    row({ user: 'alice', symbol: 'ETHUSDT', upnl: 1 }),
  ];

  it('sorts ascending/descending by string keys case-insensitively', () => {
    expect(sortPositions(rows, 'user', true).map((r) => r.user)).toEqual(['Alice', 'alice', 'bob']);
    /* equal keys keep insertion order (stable sort): Alice stays before alice */
    expect(sortPositions(rows, 'user', false).map((r) => r.user)).toEqual(['bob', 'Alice', 'alice']);
  });

  it('sorts by numeric keys', () => {
    expect(sortPositions(rows, 'upnl', true).map((r) => r.upnl)).toEqual([-2, 1, 5]);
    expect(sortPositions(rows, 'upnl', false).map((r) => r.upnl)).toEqual([5, 1, -2]);
  });

  it('returns the input order without a sort column', () => {
    expect(sortPositions(rows, null, true)).toBe(rows);
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    sortPositions(rows, 'upnl', false);
    expect(rows).toEqual(copy);
  });
});
