import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import PbDataStatus from './PbDataStatus.vue';
import type { FetchSummaryData, PollerMetricsData } from '../types';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: 'Err', json: async () => body } as Response;
}

/** Fixed clock so the age assertions stay deterministic across the suite. */
const NOW_MS = 1_790_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

/** Realistic GET /fetch-summary payload (legacy renderFetchSummary input). */
const FETCH_SUMMARY: FetchSummaryData = {
  timestamp: '2026-08-15 12:00:00',
  balances: { ws: ['alice'], rest: ['bob'] },
  positions: { ws: ['alice'], rest: [] },
  orders: { ws: [], rest: ['bob'] },
  prices: { binance: { active: true, symbols: 120 }, okx: { active: false, symbols: 80 } },
  history: ['alice'],
  executions: [],
  last_fetch_ts: {
    alice: { balances: NOW_S - 30, positions: NOW_S - 120, orders: 0, history: NOW_S - 3600 },
    bob: { balances: NOW_S - 10, positions: 0, orders: NOW_S - 90 },
  },
};

/** Realistic GET /poller-metrics payload (legacy renderPollerMetrics input). */
const POLLER_METRICS: PollerMetricsData = {
  timestamp: '2026-08-15 12:00:00',
  exchanges: {
    binance: {
      combined_last_ts: NOW_S - 30,
      combined_cycle_ms: 1500,
      combined_users: 2,
      history_last_ts: NOW_S - 300,
      history_cycle_ms: 90000,
      history_users: 1,
      backoff_remaining_s: 5,
      rate_limit_429: 2,
      errors: 1,
      rest_slot_timeouts: 0,
    },
  },
  semaphores: { binance: { slots: 4, available: 3, in_use: 1 } },
  market_data: {
    'binance-btc': { running: true, exchange: 'binance', coins_total: 10, coins_done: 4, last_run_ts: NOW_S - 60, last_run_duration_s: 90, current_coin: 'BTC' },
  },
  budgets: {
    binance: {
      tokens: 60,
      capacity: 100,
      weight_per_minute: 1200,
      refill_per_second: 20,
      total_consumed: 500,
      requests_count: 42,
      waits_count: 3,
      total_waited_ms: 1500,
      per_operation: { trades: { consumed: 200, requests: 10, waits: 2, wait_ms: 900 } },
    },
  },
};

function mountStatus(active = true) {
  return mount(PbDataStatus, {
    props: { active },
    global: { plugins: [createI18n('en')] },
  });
}

async function mountedStatus(data: FetchSummaryData = FETCH_SUMMARY, metrics: PollerMetricsData = POLLER_METRICS) {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith('/fetch-summary')) return jsonResponse(data);
    if (String(url).endsWith('/poller-metrics')) return jsonResponse(metrics);
    return jsonResponse({});
  });
  const wrapper = mountStatus();
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({}));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PbDataStatus loading (legacy loadFetchSummary/loadPollerMetrics)', () => {
  it('loads fetch summary and poller metrics when the tab becomes active', async () => {
    await mountedStatus();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((u) => u.endsWith('/fetch-summary'))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith('/poller-metrics'))).toHaveLength(1);
    expect(urls[0]).toBe('http://pbgui.test:8000/api/services/fetch-summary');
  });

  it('shows the loading placeholders before the fetches resolve', async () => {
    let releaseFs!: (r: Response) => void;
    let releasePm!: (r: Response) => void;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/fetch-summary')) return new Promise((r) => (releaseFs = r));
      return new Promise((r) => (releasePm = r));
    });
    const wrapper = mountStatus();

    expect(wrapper.find('#pbdata-status-wrap').text()).toBe('Loading status…');
    expect(wrapper.find('#pbdata-poller-metrics-wrap').text()).toBe('Loading poller metrics…');

    releaseFs(jsonResponse(FETCH_SUMMARY));
    releasePm(jsonResponse(POLLER_METRICS));
    await flushPromises();
    expect(wrapper.find('.fs-title').text()).toContain('Fetch Summary');
  });

  it('polls both endpoints every 5s while the tab is active', async () => {
    vi.useFakeTimers();
    try {
      await mountedStatus();
      fetchMock.mockClear();

      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/fetch-summary'))).toHaveLength(1);
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/poller-metrics'))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling when the tab becomes inactive (legacy clearInterval on switch)', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountedStatus();
      await wrapper.setProps({ active: false });
      fetchMock.mockClear();

      await vi.advanceTimersByTimeAsync(10000);
      expect(fetchMock.mock.calls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the failed messages on load errors', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const wrapper = mountStatus();
    await flushPromises();

    expect(wrapper.find('#pbdata-status-wrap').text()).toBe('Failed to load fetch summary.');
    expect(wrapper.find('#pbdata-poller-metrics-wrap').text()).toBe('Failed to load poller metrics.');
  });

  it('shows the empty notes for empty payloads', async () => {
    const wrapper = await mountedStatus({}, { exchanges: {} });

    expect(wrapper.find('#pbdata-status-wrap').text()).toBe('No fetch summary available yet. Start PBData or wait for the next cycle.');
    expect(wrapper.find('#pbdata-poller-metrics-wrap').text()).toBe('No poller metrics yet. PBData must be running.');
  });
});

describe('PbDataStatus fetch summary rendering (legacy renderFetchSummary)', () => {
  it('renders the six summary groups with the legacy counters', async () => {
    const wrapper = await mountedStatus();

    const groups = wrapper.findAll('.fs-group');
    expect(groups).toHaveLength(6);
    expect(groups[0]!.find('.fs-group-title').text()).toBe('Balances');
    expect(groups[0]!.text()).toContain('WS');
    expect(groups[0]!.text()).toContain('1');
    expect(groups[0]!.text()).toContain('REST');
    // Legacy grpFlat has no space/count label: 'History1' / 'Executions0'.
    expect(groups[4]!.text()).toBe('History1');
    expect(groups[5]!.text()).toBe('Executions0');
  });

  it('renders the clickable prices group and emits open-prices', async () => {
    const wrapper = await mountedStatus();

    const prices = wrapper.find('.fs-group-clickable');
    expect(prices.find('.fs-group-title').text()).toBe('Prices');
    expect(prices.text()).toContain('1/2');
    expect(prices.text()).toContain('Sym');
    expect(prices.text()).toContain('200');
    expect(prices.attributes('title')).toBe('Click to view symbols & prices');

    await prices.trigger('click');
    expect(wrapper.emitted('open-prices')).toHaveLength(1);
  });

  it('renders the user table with mode classes and age fallbacks', async () => {
    const wrapper = await mountedStatus();

    const rows = wrapper.findAll('#fs-table tbody tr');
    expect(rows).toHaveLength(2);
    const alice = rows[0]!;
    expect(alice.find('td').text()).toBe('alice');
    expect(alice.find('.fs-col-balances').text()).toBe('30s');
    expect(alice.find('.fs-col-balances span').classes()).toContain('fs-ws');
    expect(alice.find('.fs-col-positions').text()).toBe('2m');
    expect(alice.find('.fs-col-orders span').classes()).toContain('fs-never');
    expect(alice.find('.fs-col-history').text()).toBe('1h');
    expect(rows[1]!.find('.fs-col-balances span').classes()).toContain('fs-rest');
  });

  it('renders never for users without a last-fetch timestamp', async () => {
    // Legacy fmtMode checks ws/rest membership before the age: 'carol' appears
    // in no list, so every column falls back to fs-never + 'never'.
    const wrapper = await mountedStatus({
      ...FETCH_SUMMARY,
      last_fetch_ts: { carol: {} },
    });

    expect(wrapper.find('#fs-table td.fs-col-balances span').classes()).toContain('fs-never');
    expect(wrapper.find('#fs-table td.fs-col-balances').text()).toBe('never');
    expect(wrapper.find('#fs-table td.fs-col-history span').classes()).toContain('fs-never');
  });

  it('toggles column visibility from the legacy filter checkboxes', async () => {
    const wrapper = await mountedStatus();

    await wrapper.find('#fs-f-balances').setValue(false);
    expect((wrapper.find('#fs-table .fs-col-balances').element as HTMLElement).style.display).toBe('none');

    await wrapper.find('#fs-f-balances').setValue(true);
    expect((wrapper.find('#fs-table .fs-col-balances').element as HTMLElement).style.display).toBe('');

    await wrapper.find('#fs-f-history').setValue(false);
    expect((wrapper.find('#fs-table .fs-col-history').element as HTMLElement).style.display).toBe('none');
  });

  it('hides non-WS rows when the WS-only filter is enabled', async () => {
    const wrapper = await mountedStatus();

    await wrapper.find('#fs-f-wsonly').setValue(true);
    const rows = wrapper.findAll('#fs-table tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.find('td').text()).toBe('alice');
  });

  it('keeps filter state across refreshes', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountedStatus();
      await wrapper.find('#fs-f-balances').setValue(false);

      fetchMock.mockClear();
      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();

      expect((wrapper.find('#fs-f-balances').element as HTMLInputElement).checked).toBe(false);
      expect((wrapper.find('#fs-table .fs-col-balances').element as HTMLElement).style.display).toBe('none');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PbDataStatus poller metrics rendering (legacy renderPollerMetrics)', () => {
  it('renders the exchange pollers table', async () => {
    const wrapper = await mountedStatus();

    const pm = wrapper.find('#pbdata-poller-metrics-wrap');
    expect(pm.find('.pm-title').text()).toContain('Poller Metrics');
    expect(pm.find('.pm-section-title').text()).toBe('Exchange Pollers');
    const row = pm.find('.pm-table tbody tr');
    expect(row.findAll('td').map((td) => td.text())).toEqual(['binance', '30s', '1.5s', '2', '5m', '90.0s', '1', '5s', '2', '1', '0']);
  });

  it('renders the semaphores, market data loops and budgets sections', async () => {
    const wrapper = await mountedStatus();

    const pm = wrapper.find('#pbdata-poller-metrics-wrap');
    const titles = pm.findAll('.pm-section-title').map((s) => s.text());
    expect(titles).toEqual(['Exchange Pollers', 'REST Semaphores', 'Market Data Loops', 'Rate Limit Budgets']);

    const semRow = pm.findAll('.pm-table tbody tr')[1]!;
    expect(semRow.findAll('td').map((td) => td.text())).toEqual(['binance', '4', '3', '1']);

    const mdRow = pm.findAll('.pm-table tbody tr')[2]!;
    expect(mdRow.findAll('td').map((td) => td.text())).toEqual([
      'binance-btc', 'binance', 'running', '4/10', '1m', '1m 30s', 'BTC',
    ]);

    const budgetRow = pm.findAll('.pm-table tbody tr')[3]!;
    expect(budgetRow.findAll('td').map((td) => td.text())).toEqual([
      'binance', '60 (60%)', '100', '1200', '20', '500', '42', '3', '1.5s',
    ]);
    const perOp = pm.findAll('.pm-table tbody tr')[4]!;
    expect(perOp.findAll('td').map((td) => td.text())).toEqual([
      '↳ trades', '', '', '', '', '200', '10', '2', '0.9s',
    ]);
  });

  it('renders the ok checkmark for empty backoffs and muted dashes for missing values', async () => {
    const wrapper = await mountedStatus(FETCH_SUMMARY, {
      exchanges: { okx: { combined_last_ts: 0, combined_cycle_ms: 0, combined_users: 0 } },
    });

    const row = wrapper.find('#pbdata-poller-metrics-wrap .pm-table tbody tr');
    expect(row.findAll('td').map((td) => td.text())).toEqual(['okx', '-', '-', '0', '-', '-', '0', '✓', '0', '0', '0']);
  });

  it('collapses and expands the metrics body from the toggle button', async () => {
    const wrapper = await mountedStatus();

    const pm = wrapper.find('#pbdata-poller-metrics-wrap');
    const btn = pm.find('#pm-toggle-btn');
    expect(btn.text()).toBe('▼ Hide');

    await btn.trigger('click');
    expect(pm.find('#pm-body').attributes('style')).toContain('display: none');
    expect(pm.find('#pm-toggle-btn').text()).toBe('▶ Show');

    await pm.find('#pm-toggle-btn').trigger('click');
    expect(pm.find('#pm-body').attributes('style')).not.toContain('display: none');
  });
});
