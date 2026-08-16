import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  clearAppTestGlobals,
  installFetchMock,
  flushPromises,
  mountApp,
  visiblePanelIds,
  BASE,
  SETTINGS_PAYLOAD,
} from './App.test-support';

/* M-data-7 best-1m + copy-data panel integration (:9058-9064, :7321-7323,
   :7662-7685, :5127-5153). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({
    token: 'tok',
    origin: 'http://pbgui.test:8000',
    version: '1.0.0',
    serial: 'S1',
  })),
}));

let fetchMock: ReturnType<typeof vi.fn>;

const LS_KEY_EXCHANGE = 'market_data_fastapi_context_exchange';

beforeEach(() => {
  fetchMock = installFetchMock();
});

afterEach(() => {
  clearAppTestGlobals();
});

describe('best1m panel integration (M-data-7, :9058, :7321-7323, :7662-7685)', () => {
  function best1mFetchMock(url: string | URL): Promise<Response> {
    const u = String(url);
    if (u.includes('/api/market-data/best-1m/info/')) {
      return Promise.resolve(
        new Response(JSON.stringify({ exchange: 'bybit', coins: ['BTC', 'ETH'] }), { status: 200 })
      );
    }
    if (u.includes('/api/market-data/settings/')) {
      return Promise.resolve(new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 }));
    }
    return Promise.resolve(new Response('{"running":false}', { status: 200 }));
  }

  it('refreshes the panel on enter through the shortcut (:9112-9115 → :9058)', async () => {
    fetchMock.mockImplementation(best1mFetchMock);
    const app = mountApp();
    await app.find('#sidebar-best-1m-link').trigger('click');
    await flushPromises();
    expect(visiblePanelIds(app)).toEqual(['best1m-panel']);
    const infoCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/best-1m/info/'));
    // hyperliquid never fetches the generic info — the iframe is the panel
    // (:7670-7677)
    expect(infoCalls).toEqual([]);
    expect(app.find('#best1m-generic-panel').attributes('hidden')).toBeDefined();
    const frame = app.find('#best1m-hyperliquid-frame').element as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe(
      `${BASE}/api/market-data/data-actions/hyperliquid?section=build`
    );
    app.unmount();
  });

  it('switches to the generic variant and reloads on exchange change while active (:7321-7323)', async () => {
    window.localStorage.setItem(LS_KEY_EXCHANGE, 'bybit');
    fetchMock.mockImplementation(best1mFetchMock);
    const app = mountApp();
    await app.find('#sidebar-best-1m-link').trigger('click');
    await flushPromises();
    expect(app.find('#best1m-generic-panel').attributes('hidden')).toBeUndefined();
    const monitor = app.find('#best1m-job-monitor-frame').element as HTMLIFrameElement;
    expect(monitor.getAttribute('src')).toBe(
      `/app/jobs_monitor.html?v=S1&embed=1&exchange=bybit&job_type=bybit_best_1m`
    );
    const infoCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/best-1m/info/'));
    expect(infoCalls).toEqual([`${BASE}/api/market-data/best-1m/info/bybit`]);
    await app.find('#page-exchange').setValue('okx');
    await flushPromises();
    const okxCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/best-1m/info/okx'));
    expect(okxCalls).toEqual([`${BASE}/api/market-data/best-1m/info/okx`]);
    app.unmount();
  });
});

describe('copy-data panel integration (M-data-7, :9059-9064, :5127-5153)', () => {
  function copyDataFetchMock(url: string | URL): Promise<Response> {
    const u = String(url);
    if (u.endsWith('/api/market-data/copy-data/schedules')) {
      return Promise.resolve(
        new Response(JSON.stringify({ schedules: [{ id: 's1', name: 'Nightly', enabled: true }] }), { status: 200 })
      );
    }
    if (u.includes('/api/market-data/settings/')) {
      return Promise.resolve(new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 }));
    }
    return Promise.resolve(new Response('{"running":false}', { status: 200 }));
  }

  it('mounts the monitor and starts the 15 s schedule poll on enter (:9059-9061)', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(copyDataFetchMock);
      const app = mountApp();
      await app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'Copy Data')!.trigger('click');
      await vi.advanceTimersByTimeAsync(0);
      const scheduleCalls = fetchMock.mock.calls
        .map((call) => String(call[0]))
        .filter((url) => url.endsWith('/copy-data/schedules'));
      expect(scheduleCalls).toEqual([`${BASE}/api/market-data/copy-data/schedules`]);
      const frame = app.find('#copy-data-job-monitor-frame').element as HTMLIFrameElement;
      expect(frame.getAttribute('src')).toBe(
        `/app/jobs_monitor.html?v=S1&embed=1&exchange=ohlcv&job_type=ohlcv_copy%2Cohlcv_copy_dry_run`
      );
      await vi.advanceTimersByTimeAsync(15_000);
      expect(
        fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.endsWith('/copy-data/schedules'))
      ).toHaveLength(2); // 15 s chain
      // leaving the panel stops the chain (:9063)
      await app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'Settings')!.trigger('click');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(
        fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.endsWith('/copy-data/schedules'))
      ).toHaveLength(2); // chain dead
      app.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
