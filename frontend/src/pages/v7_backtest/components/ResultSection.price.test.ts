import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { pickSelectOption } from '@/shared/testing/select';
import ResultSection from './ResultSection.vue';
import type { ResultDataApi, ResultsSection } from '../composables/useResults';
import type { BacktestResultItem, BeSeries, PricePayload } from '../types';

/*
 * ResultSection's price overlay — the _priceRequestSeq stale-response
 * guard (:6791, checks :6853/:6884) folded in from the M-v7-10 review
 * follow-up #4: a slow price fetch for an abandoned market selection
 * must never overwrite the newer one.
 */


function be(times: number): BeSeries {
  return {
    time: Array.from({ length: times }, (_, i) => `2024-01-0${(i % 9) + 1}T00:00:00Z`),
    balance: Array.from({ length: times }, () => 1),
    equity: Array.from({ length: times }, () => 1),
    balance_btc: [],
    equity_btc: [],
  };
}

function price(points: number, exchange: string): PricePayload {
  return { available: true, time: Array.from({ length: points }, (_, i) => `t${i}`), close: [1], coverage_start: '2000-01-01', coverage_end: '2099-01-01', coverage_complete: true, exchange, coin: 'BTC' };
}

type Deferred = { promise: Promise<PricePayload>; resolve(value: PricePayload): void };

function deferred(): Deferred {
  let resolve!: (value: PricePayload) => void;
  const promise = new Promise<PricePayload>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeDataApi() {
  const pending = new Map<string, Deferred>();
  const dataApi = {
    loadBe: async () => be(3),
    loadFills: async () => ({ headers: [], rows: [] }),
    loadConfig: async () => ({}),
    loadAnalysis: async () => ({}),
    loadFiles: async () => [],
    loadPrice: (path: string, market: { exchange: string; coin: string }) => {
      const key = `${market.exchange}|${market.coin}`;
      if (!pending.has(key)) pending.set(key, deferred());
      return pending.get(key)!.promise;
    },
    imageUrl: () => '',
    beForCompare: async () => ({ path: '', version: 'v7', be: be(0) }),
    fetchCsv: async () => ({ headers: [], rows: [] }),
    clearCachesFor: () => {},
    resultApiBaseFor: () => 'http://h:8000/api/backtest-v7',
  } as unknown as ResultDataApi;
  return { dataApi, pending };
}

function section(result: BacktestResultItem): ResultsSection {
  return { result, actions: new Set(['view'] as const) };
}

function mountSection(dataApi: ResultDataApi) {
  const result: BacktestResultItem = {
    path: 'p',
    config_name: 'c',
    result_name: 'r',
    backtest_version: 'v7',
    exchanges: ['bybit', 'okx'],
    coins: ['BTC'],
  };
  return mount(ResultSection, {
    props: { section: section(result), index: 0, version: 'v7', dataApi },
    global: { plugins: [createI18n('en')] },
    attachTo: document.body,
  });
}

beforeEach(() => {
  (window as unknown as { Plotly?: unknown }).Plotly = {
    newPlot: async (el: unknown) => el,
    react: async (el: unknown) => el,
    relayout: async (el: unknown) => el,
    restyle: async (el: unknown) => el,
    purge: () => {},
    Plots: { resize: () => {} },
  };
});

afterEach(() => {
  delete (window as unknown as { Plotly?: unknown }).Plotly;
  document.body.innerHTML = '';
});

/* Registered AFTER the body-clearing hook so vitest's LIFO afterEach order
   unmounts wrappers first — unmounting a reka select AFTER its teleported
   anchors were wiped crashes removeFragment on null. */
enableAutoUnmount(afterEach);

describe('applyPrice stale-response guard (:6791, :6853/:6884)', () => {
  it('drops a superseded slow price response', async () => {
    const { dataApi, pending } = makeDataApi();
    const wrapper = mountSection(dataApi);
    // the initial auto-select requests BOTH markets (:6838-6845)
    await vi.waitFor(() => expect(pending.size).toBe(2));
    const bybit = pending.get('bybit|BTC')!;

    // switch to okx manually (gen 2, single candidate) and resolve it FIRST
    await pickSelectOption(wrapper, '[data-test="price-market"]', 'okx / BTC');
    const okx = pending.get('okx|BTC')!;
    okx.resolve(price(3, 'okx'));
    await vi.waitFor(() => expect(wrapper.find('[data-test="price-status"]').text()).toContain('3 price points'));

    // the stale bybit response lands last — must be ignored
    bybit.resolve(price(9, 'bybit'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(wrapper.find('[data-test="price-status"]').text()).toContain('3 price points');
    expect(wrapper.find('[data-test="price-status"]').text()).not.toContain('9 price points');
  });
});
