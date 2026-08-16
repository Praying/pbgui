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

/* M-data-5 integrity panel integration (:9066-9071, :7324-7332, :4562-4605). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({
    token: 'tok',
    origin: 'http://pbgui.test:8000',
    version: '1.0.0',
    serial: 'S1',
  })),
}));

let fetchMock: ReturnType<typeof vi.fn>;

const LS_KEY_PANEL = 'market_data_fastapi_active_panel';

beforeEach(() => {
  fetchMock = installFetchMock();
});

afterEach(() => {
  clearAppTestGlobals();
});

describe('integrity panel integration (M-data-5, :9066-9071, :7324-7332, :4562-4605)', () => {
  const INTEGRITY_CHECKSUM = {
    publish_enabled: false,
    publish_archive: '',
    reference_archive: '',
    archives: [{ name: 'own', repository: 'me/pbgui', can_publish: true, can_reference: false }],
    catalog: { initial_scan_complete: true, counts: { valid: 1, invalid: 0 } },
    reference: {},
  };

  function integrityFetchMock(url: string | URL): Promise<Response> {
    const u = String(url);
    if (u === `${BASE}/api/market-data/checksums/settings`) {
      return Promise.resolve(new Response(JSON.stringify(INTEGRITY_CHECKSUM), { status: 200 }));
    }
    if (u.includes('/api/market-data/integrity/status')) {
      return Promise.resolve(new Response(JSON.stringify({ catalog: INTEGRITY_CHECKSUM.catalog }), { status: 200 }));
    }
    if (u.includes('/api/market-data/integrity/removed-coins')) {
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    }
    if (u.includes('/api/market-data/integrity/issues')) {
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    }
    if (u.includes('/api/jobs/')) {
      return Promise.resolve(new Response(JSON.stringify({ jobs: [] }), { status: 200 }));
    }
    if (u.includes('/api/market-data/settings/')) {
      return Promise.resolve(new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 }));
    }
    return Promise.resolve(new Response('{"running":false}', { status: 200 }));
  }

  function urlsOf(): string[] {
    return fetchMock.mock.calls.map((call) => String(call[0]));
  }

  it('loads the panel and starts the 2 s job poll when the panel is restored active (:9764 → :9066-9068)', async () => {
    window.localStorage.setItem(LS_KEY_PANEL, 'integrity-panel');
    fetchMock.mockImplementation(integrityFetchMock);
    const app = mountApp();
    await flushPromises();
    expect(visiblePanelIds(app)).toEqual(['integrity-panel']);
    expect(urlsOf()).toEqual(expect.arrayContaining([
      `${BASE}/api/market-data/checksums/settings`,
      `${BASE}/api/market-data/integrity/status?exchange=hyperliquid`,
      `${BASE}/api/market-data/integrity/removed-coins?exchange=hyperliquid`,
      `${BASE}/api/market-data/integrity/issues?exchange=hyperliquid&limit=1000000`,
      `${BASE}/api/jobs/?states=pending,running&limit=100`,
    ]));
    // job monitor iframe mounted with the hyperliquid URL matrix (:4238-4244)
    const frame = app.find('#integrity-job-monitor-frame').element as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toContain('exchange=hyperliquid');
    expect(decodeURIComponent(frame.getAttribute('src') ?? '')).toContain('ohlcv_hyperliquid_normalize_fallback');
    app.unmount();
  });

  it('stops the poll when switching away and restarts it on return (:9066-9071, R5)', async () => {
    vi.useFakeTimers();
    try {
      window.localStorage.setItem(LS_KEY_PANEL, 'integrity-panel');
      fetchMock.mockImplementation(integrityFetchMock);
      const app = mountApp();
      await vi.advanceTimersByTimeAsync(0);
      const jobsAfterEnter = urlsOf().filter((url) => url.includes('/api/jobs/')).length;
      expect(jobsAfterEnter).toBe(1);
      await app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'Settings')!.trigger('click');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(urlsOf().filter((url) => url.includes('/api/jobs/'))).toHaveLength(1); // chain dead
      await app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'OHLCV Integrity')!.trigger('click');
      await vi.advanceTimersByTimeAsync(0);
      expect(urlsOf().filter((url) => url.includes('/api/jobs/'))).toHaveLength(2); // immediate restart
      await vi.advanceTimersByTimeAsync(2000);
      expect(urlsOf().filter((url) => url.includes('/api/jobs/'))).toHaveLength(3); // 2 s chain
      app.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets and force-reloads the panel when the exchange changes while active (:7324-7332)', async () => {
    window.localStorage.setItem(LS_KEY_PANEL, 'integrity-panel');
    fetchMock.mockImplementation(integrityFetchMock);
    const app = mountApp();
    await flushPromises();
    await app.find('#page-exchange').setValue('bybit');
    await flushPromises();
    expect(urlsOf().filter((url) => url.includes('/integrity/status?exchange=bybit'))).toHaveLength(1);
    const frame = app.find('#integrity-job-monitor-frame').element as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toContain('exchange=bybit');
    expect(decodeURIComponent(frame.getAttribute('src') ?? '')).toContain('ohlcv_checksum_publish');
    app.unmount();
  });
});
