import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import PricesOverlay from './PricesOverlay.vue';
import type { PriceRow } from '../types';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: 'Err', json: async () => body } as Response;
}

/** Fixed clock so the Age column assertions stay deterministic across the suite. */
const NOW_MS = 1_790_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

/** Realistic GET /prices-snapshot rows (legacy fmtPrice/fmtAge input). */
const ROWS: PriceRow[] = [
  { symbol: 'BTCUSDT', exchange: 'binance', price: 120000, ts: NOW_S - 30 },
  { symbol: 'ETHUSDT', exchange: 'binance', price: 0.01234, ts: NOW_S - 250 },
  { symbol: 'SOLUSDT', exchange: 'okx', price: 0.0005678, ts: NOW_S - 3600 },
  { symbol: 'XXX', exchange: 'unknown', price: null, ts: null },
];

function mountOverlay() {
  return mount(PricesOverlay, { global: { plugins: [createI18n('en')] } });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({ rows: [] }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PricesOverlay open/close (legacy openPricesOverlay/closePricesOverlay)', () => {
  it('stays hidden until open() is called', async () => {
    const wrapper = mountOverlay();
    await flushPromises();

    expect(wrapper.find('#prices-overlay').classes()).not.toContain('active');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens, clears the search and loads the snapshot', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
    const wrapper = mountOverlay();
    const search = wrapper.find('#po-search');
    await search.setValue('BTC');
    expect((search.element as HTMLInputElement).value).toBe('BTC');

    await wrapper.vm.open();
    await flushPromises();

    expect(wrapper.find('#prices-overlay').classes()).toContain('active');
    expect((wrapper.find('#po-search').element as HTMLInputElement).value).toBe('');
    expect(fetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/prices-snapshot', expect.anything());
    expect(wrapper.findAll('.po-table tbody tr')).toHaveLength(4);
  });

  it('closes and stops the refresh timers', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
      const wrapper = mountOverlay();
      await wrapper.vm.open();
      await flushPromises();
      fetchMock.mockClear();

      await wrapper.vm.close();
      await vi.advanceTimersByTimeAsync(20000);

      expect(wrapper.find('#prices-overlay').classes()).not.toContain('active');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PricesOverlay table rendering (legacy renderTable/fmtPrice/fmtAge/ageCol)', () => {
  it('renders numbered rows with symbol, exchange, formatted price and age', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    const rows = wrapper.findAll('.po-table tbody tr');
    const cells = rows[0]!.findAll('td').map((td) => td.text());
    expect(cells[0]).toBe('1');
    expect(cells[1]).toBe('BTCUSDT');
    expect(cells[2]).toBe('binance');
    expect(cells[3]).toBe('120,000');
    expect(cells[4]).toBe('30s');
    // Legacy ageCol #4ade80/#f59e0b/#ff4b4b (jsdom normalizes hex to rgb()).
    expect(rows[0]!.findAll('td')[4]!.attributes('style')).toContain('color: rgb(74, 222, 128)');

    expect(rows[1]!.findAll('td')[3]!.text()).toBe('0.012340');
    expect(rows[1]!.findAll('td')[4]!.text()).toBe('4m');
    expect(rows[1]!.findAll('td')[4]!.attributes('style')).toContain('color: rgb(245, 158, 11)');

    expect(rows[2]!.findAll('td')[3]!.text()).toBe('0.0005678');
    expect(rows[2]!.findAll('td')[4]!.text()).toBe('1h');
    expect(rows[2]!.findAll('td')[4]!.attributes('style')).toContain('color: rgb(255, 75, 75)');

    expect(rows[3]!.findAll('td')[3]!.text()).toBe('—');
    expect(rows[3]!.findAll('td')[4]!.text()).toBe('—');
  });

  it('renders the header labels from the legacy keys', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    expect(wrapper.find('.po-table thead').text()).toBe('#SymbolExchangePriceAge');
    expect(wrapper.find('#prices-overlay-title').text()).toContain('📊');
    expect(wrapper.find('#prices-overlay-title').text()).toContain('Price Snapshot');
  });

  it('shows the no-data note for an empty payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: [] }));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    expect(wrapper.find('#prices-overlay-body').text()).toBe('No price data available yet.');
  });

  it('shows the failed message when the snapshot fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    expect(wrapper.find('#prices-overlay-body').text()).toBe('Failed to load prices.');
  });

  it('shows the loading text while a non-silent load is in flight', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((r) => (release = r)));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    expect(wrapper.find('#prices-overlay-body').text()).toBe('Loading…');

    release(jsonResponse({ rows: ROWS }));
    await flushPromises();
    expect(wrapper.findAll('.po-table tbody tr')).toHaveLength(4);
  });
});

describe('PricesOverlay filtering + auto refresh (legacy filterPricesOverlay/startPricesAutoRefresh)', () => {
  it('filters rows by symbol or exchange from the search input', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    await wrapper.find('#po-search').setValue('okx');
    const rows = wrapper.findAll('.po-table tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.findAll('td')[1]!.text()).toBe('SOLUSDT');

    await wrapper.find('#po-search').setValue('eth');
    expect(wrapper.findAll('.po-table tbody tr')).toHaveLength(1);
    expect(wrapper.find('.po-table tbody tr').findAll('td')[1]!.text()).toBe('ETHUSDT');
  });

  it('shows the no-data note when the filter matches nothing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    await wrapper.find('#po-search').setValue('zzz');
    expect(wrapper.find('#prices-overlay-body').text()).toBe('No price data available yet.');
  });

  it('silently reloads every 5s and drops overlapping loads', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
      const wrapper = mountOverlay();
      await wrapper.vm.open();
      await flushPromises();
      fetchMock.mockClear();

      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();
      const snapshotCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/prices-snapshot'));
      expect(snapshotCalls).toHaveLength(1);
      // The silent reload keeps the table (no loading flash).
      expect(wrapper.findAll('.po-table tbody tr')).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
