import { describe, expect, it } from 'vitest';
import {
  adgDataUrl,
  balanceUrl,
  incomeDataUrl,
  liveBalanceUrl,
  livePositionsUrl,
  ordersDataUrl,
  pnlDataUrl,
  positionsDataUrl,
  pplDataUrl,
  topDataUrl,
  usersParam,
} from './endpoints';

const BASE = 'http://pbgui.test:8000/api';

describe('usersParam (editor inline builders)', () => {
  it('joins selected users', () => {
    expect(usersParam(['u1', 'u2'])).toBe('u1,u2');
  });

  it('falls back to ALL for missing/empty selections', () => {
    expect(usersParam(undefined)).toBe('ALL');
    expect(usersParam(null)).toBe('ALL');
    expect(usersParam([])).toBe('ALL');
  });
});

describe('widget endpoint builders (editor:1176-1177,1244-1247,1381-1384,…)', () => {
  it('builds the balance URL', () => {
    expect(balanceUrl(BASE, ['u1'])).toBe(`${BASE}/dashboard/balance?users=u1`);
    expect(balanceUrl(BASE, [])).toBe(`${BASE}/dashboard/balance?users=ALL`);
  });

  it('builds the top_data URL (top raw-concatenated like legacy)', () => {
    expect(topDataUrl(BASE, ['u1', 'u2'], 'THIS_MONTH', 10)).toBe(
      `${BASE}/dashboard/top_data?users=u1%2Cu2&period=THIS_MONTH&top=10`
    );
  });

  it('builds the income_data URL (last_n/filter raw-concatenated like legacy)', () => {
    expect(incomeDataUrl(BASE, undefined, 'TODAY', 0, 0)).toBe(
      `${BASE}/dashboard/income_data?users=ALL&period=TODAY&last_n=0&filter=0`
    );
    expect(incomeDataUrl(BASE, ['a'], 'CUSTOM:2026-01-01:NOW', 25, 1)).toBe(
      `${BASE}/dashboard/income_data?users=a&period=CUSTOM%3A2026-01-01%3ANOW&last_n=25&filter=1`
    );
  });

  it('builds the pnl_data URL with users, period and mode', () => {
    expect(pnlDataUrl(BASE, ['u'], 'THIS_MONTH', 'bar')).toBe(
      `${BASE}/dashboard/pnl_data?users=u&period=THIS_MONTH&mode=bar`
    );
  });

  it('builds the adg_data URL with users, period and mode', () => {
    expect(adgDataUrl(BASE, [], 'TODAY', 'line')).toBe(
      `${BASE}/dashboard/adg_data?users=ALL&period=TODAY&mode=line`
    );
  });

  it('builds the ppl_data URL with users, period and sum_period', () => {
    expect(pplDataUrl(BASE, ['u1', 'u2'], 'THIS_MONTH', 'MONTH')).toBe(
      `${BASE}/dashboard/ppl_data?users=u1%2Cu2&period=THIS_MONTH&sum_period=MONTH`
    );
  });

  it('builds the positions_data URL', () => {
    expect(positionsDataUrl(BASE, undefined)).toBe(`${BASE}/dashboard/positions_data?users=ALL`);
    expect(positionsDataUrl(BASE, ['x', 'y'])).toBe(`${BASE}/dashboard/positions_data?users=x%2Cy`);
  });

  it('encodes special characters in user names', () => {
    expect(balanceUrl(BASE, ['user one', 'wáng & 李'])).toBe(
      `${BASE}/dashboard/balance?users=user%20one%2Cw%C3%A1ng%20%26%20%E6%9D%8E`
    );
  });
});

describe('live poll URLs (editor:1102,1139)', () => {
  it('builds the live positions URL with live=1', () => {
    expect(livePositionsUrl(BASE, ['u1', 'u2'])).toBe(
      `${BASE}/dashboard/positions_data?users=u1%2Cu2&live=1`
    );
  });

  it('builds the live balance URL with live=1', () => {
    expect(liveBalanceUrl(BASE, ['u1'])).toBe(`${BASE}/dashboard/balance?users=u1&live=1`);
  });
});

describe('orders chart URLs (editor:2060-2066, 2080-2086, 2105-2112)', () => {
  it('builds the selection load URL with users, symbol, side, timeframe and limit', () => {
    expect(ordersDataUrl(BASE, 'alice', 'BTC/USDT:USDT', 'long', '4h', 500)).toBe(
      `${BASE}/dashboard/orders_data?user=alice&symbol=BTC%2FUSDT%3AUSDT` +
        `&side=long&timeframe=4h&limit=500&live=1`
    );
  });

  it('inserts since before limit for the load-more fetch', () => {
    expect(ordersDataUrl(BASE, 'alice', 'BTC/USDT:USDT', 'short', '1w', 300, 1715680000000)).toBe(
      `${BASE}/dashboard/orders_data?user=alice&symbol=BTC%2FUSDT%3AUSDT` +
        `&side=short&timeframe=1w&since=1715680000000&limit=300&live=1`
    );
  });
});

