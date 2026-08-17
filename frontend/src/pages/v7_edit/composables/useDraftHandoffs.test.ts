import { describe, expect, it, vi } from 'vitest';
import { createEditAdapter } from '../config';
import {
  backtestDraftRequest,
  backtestHandoffUrl,
  balanceCalcApiBase,
  openBalanceCalcPage,
  requestBalanceCalculation,
  strategyExplorerApiBase,
} from './useDraftHandoffs';

/*
 * Cross-page handoffs — ports of goBacktest (:1699-1729),
 * strategyExplorerApiBase (:1731-1735), goStrategyExplorer (:1737-1765),
 * goBalanceCalc (:1777-1794) and the editor_shared.js balance helpers
 * (:612-677). Draft TTL stores live server-side; these builders must keep
 * the exact URL/body vocabularies (recon R6).
 */

const ORIGIN = 'http://pbgui.test:8000';

describe('strategyExplorerApiBase (:1731-1735)', () => {
  it('keeps the API_BASE origin and swaps the router prefix per flavour', () => {
    expect(strategyExplorerApiBase(ORIGIN + '/api/v7', false)).toBe(ORIGIN + '/api/strategy-explorer');
    expect(strategyExplorerApiBase(ORIGIN + '/api/v8', true)).toBe(ORIGIN + '/api/strategy-explorer-v8');
  });

  it('falls back to location.origin when API_BASE is a bare path', () => {
    expect(strategyExplorerApiBase('/api/v7', false)).toBe(window.location.origin + '/api/strategy-explorer');
  });
});

describe('balanceCalcApiBase (editor_shared :612-625)', () => {
  it('rewrites every known router prefix onto /api/balance-calc', () => {
    expect(balanceCalcApiBase(ORIGIN + '/api/v7')).toBe(ORIGIN + '/api/balance-calc');
    expect(balanceCalcApiBase(ORIGIN + '/api/v8')).toBe(ORIGIN + '/api/balance-calc');
    expect(balanceCalcApiBase(ORIGIN + '/api/backtest-v7')).toBe(ORIGIN + '/api/balance-calc');
    expect(balanceCalcApiBase(ORIGIN + '/api/backtest-v8')).toBe(ORIGIN + '/api/balance-calc');
    expect(balanceCalcApiBase(ORIGIN + '/api/balance-calc')).toBe(ORIGIN + '/api/balance-calc');
  });

  it('throws for an empty base', () => {
    expect(() => balanceCalcApiBase('')).toThrow('Missing API base');
  });
});

describe('backtestDraftRequest (run_editor_adapter.js :154-168)', () => {
  const config = { live: { user: 'alice' } };

  it('v7 posts to the run router draft store', () => {
    const request = backtestDraftRequest(createEditAdapter('v7'), ORIGIN + '/api/v7', config, {});
    expect(request).toEqual({
      url: ORIGIN + '/api/v7/draft',
      body: { config },
      page: ORIGIN + '/api/v7/draft-target',
    });
  });

  it('v8 posts the override configs to the backtest-v8 optimize-draft store', () => {
    const overrides = { 'X.json': { bot: { long: {} } } };
    const request = backtestDraftRequest(createEditAdapter('v8'), ORIGIN + '/api/v8', config, overrides);
    expect(request.url).toBe(ORIGIN + '/api/backtest-v8/optimize-draft');
    expect(request.body).toEqual({ config, override_configs: overrides });
    expect(request.page).toBe(ORIGIN + '/api/backtest-v8/main_page');
  });
});

describe('backtestHandoffUrl (:1721-1725)', () => {
  it('uses draft_id on v7 and opt_draft_id on v8', () => {
    expect(backtestHandoffUrl(false, ORIGIN + '/api/backtest-v7/main_page', 'd-1', 'myname')).toBe(
      ORIGIN + '/api/backtest-v7/main_page?draft_id=d-1&draft_name=myname'
    );
    expect(backtestHandoffUrl(true, ORIGIN + '/api/backtest-v8/main_page', 'd-2', 'other user')).toBe(
      ORIGIN + '/api/backtest-v8/main_page?opt_draft_id=d-2&draft_name=other%20user'
    );
  });
});

describe('openBalanceCalcPage (editor_shared :646-657)', () => {
  it('creates a balance-calc draft and returns the URL without navigating', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(ORIGIN + '/api/balance-calc/draft');
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({ draft_id: 'bc-9' }), { status: 200 });
    });
    const result = await openBalanceCalcPage(
      { apiBase: ORIGIN + '/api/v7', config: { live: {} }, exchange: 'Binance', navigate: false },
      fetchMock as unknown as typeof fetch
    );
    expect(result).toEqual({
      draft_id: 'bc-9',
      url: ORIGIN + '/api/balance-calc/main_page?draft_id=bc-9&exchange=binance',
    });
  });

  it('throws when the draft store rejects', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: 'nope' }), { status: 400 }));
    await expect(
      openBalanceCalcPage(
        { apiBase: ORIGIN + '/api/v7', config: { live: {} }, exchange: 'binance', navigate: false },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow('nope');
  });
});

describe('requestBalanceCalculation (editor_shared :659-677)', () => {
  it('posts the config + exchange to /calculate', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(ORIGIN + '/api/balance-calc/calculate');
      expect(JSON.parse(String(init?.body))).toEqual({ config: { live: {} }, exchange: 'binance' });
      return new Response(JSON.stringify({ recommendation: null }), { status: 200 });
    });
    const result = await requestBalanceCalculation(
      { apiBase: ORIGIN + '/api/v7', config: { live: {} }, exchange: 'Binance' },
      fetchMock as unknown as typeof fetch
    );
    expect(result).toEqual({ recommendation: null });
  });

  it('rejects non-object configs and missing exchanges', async () => {
    await expect(requestBalanceCalculation({ apiBase: ORIGIN + '/api/v7', config: [] as never, exchange: 'x' })).rejects.toThrow(
      'Config must be a JSON object'
    );
    await expect(
      requestBalanceCalculation({ apiBase: ORIGIN + '/api/v7', config: {}, exchange: '  ' })
    ).rejects.toThrow('Missing exchange');
  });
});
