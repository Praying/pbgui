import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { useHldaSections } from './useHldaSections';

/* doInit/populate/submit port of hl_data_actions.html :936-1053, :1555-1592. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();

function infoResponses(overrides: { dl?: Partial<Record<string, unknown>>; build?: Partial<Record<string, unknown>> } = {}): void {
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({ job_id: 'job-9', coins_count: 2, start_day: '20240101', end_day: '20240201' }), { status: 200 }));
    }
    if (u.includes('/heatmap/l2book-download-info')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            coins: ['BTC', 'ETH'],
            has_aws_creds: true,
            archive_range: { oldest_day: '20230101', newest_day: '20240201' },
            ...(overrides.dl || {}),
          }),
          { status: 200 }
        )
      );
    }
    if (u.includes('/heatmap/build-ohlcv-info')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ eligible_coins: ['BTC', 'xyz:AAPL'], coins_with_downloaded_history: ['BTC'], ...(overrides.build || {}) }),
          { status: 200 }
        )
      );
    }
    return Promise.reject(new Error('unexpected ' + u));
  });
}

function makeStore() {
  return useHldaSections({ t: (key, params) => `${key}${params ? ':' + JSON.stringify(params) : ''}` });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  infoResponses();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('init (doInit :936-963)', () => {
  it('populates both sections from the info endpoints', async () => {
    const store = makeStore();
    store.init();
    await vi.advanceTimersByTimeAsync(1);

    expect(store.initPhase.value).toBe('ready');
    expect(store.dlCoins.value).toEqual(['BTC', 'ETH']);
    expect(store.dlHasCreds.value).toBe(true);
    expect(store.dlArchive.value).toEqual({ oldest_day: '20230101', newest_day: '20240201' });
    expect(store.dlStartDate.value).toBe('2023-01-01'); // date inputs get yyyy-mm-dd
    expect(store.dlEndDate.value).toBe('2024-02-01');
    expect(store.buildCoins.value).toEqual(['BTC', 'xyz:AAPL']);
    expect(store.buildCoinsWithDownloadedHistory.value).toEqual(new Set(['BTC']));
  });

  it('retries three times before failing', async () => {
    fetchMock.mockRejectedValue(new Error('HTTP 500'));
    const store = makeStore();
    store.init();
    await vi.advanceTimersByTimeAsync(1);

    expect(store.initPhase.value).toBe('retrying');
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.initPhase.value).toBe('retrying');
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.initPhase.value).toBe('failed');
  });
});

describe('submitDownload (:1555-1573)', () => {
  it('validates dates before queueing', async () => {
    const store = makeStore();
    store.init();
    await vi.advanceTimersByTimeAsync(1);

    store.dlStartDate.value = '';
    await store.submitDownload();
    expect(store.dlMessage.value?.kind).toBe('error');
    expect(fetch).toHaveBeenCalledTimes(2); // only the two info calls
  });

  it('posts the bulk payload with the All/selection coins rule', async () => {
    const store = makeStore();
    store.init();
    await vi.advanceTimersByTimeAsync(1);
    store.setDlSelected('BTC', true);

    await store.submitDownload();

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('http://pbgui.test:8000/api/heatmap/queue-l2book-download-bulk');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      coins: ['BTC'],
      start_day: '20230101',
      end_day: '20240201',
      only_missing_1m_src_hours: true,
    });
    expect(store.dlMessage.value?.kind).toBe('success');
    expect(store.dlMessage.value?.parts?.jobId).toBe('job-9');
  });

  it('surfaces API errors verbatim', async () => {
    const store = makeStore();
    store.init();
    await vi.advanceTimersByTimeAsync(1);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'No matching enabled coins selected' }), { status: 200 }));

    await store.submitDownload();

    expect(store.dlMessage.value?.kind).toBe('error');
    expect(store.dlMessage.value?.text).toBe('No matching enabled coins selected');
  });
});

describe('submitBuild (:1575-1592)', () => {
  it('posts optional dates and the refetch flag', async () => {
    const store = makeStore();
    store.init();
    await vi.advanceTimersByTimeAsync(1);
    store.buildStartDate.value = '2024-01-01';
    store.buildEndDate.value = '2024-02-01';
    store.buildRefetch.value = true;

    await store.submitBuild();

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('http://pbgui.test:8000/api/heatmap/queue-build-ohlcv');
    expect(JSON.parse(String(init.body))).toEqual({
      coins: ['All'],
      start_day: '20240101',
      end_day: '20240201',
      refetch: true,
    });
  });
});

describe('ensureBuildDateOrder (:1301-1319)', () => {
  it('clamps the other side when the range inverts', async () => {
    const store = makeStore();
    store.init();
    await vi.advanceTimersByTimeAsync(1);

    store.buildStartDate.value = '2024-05-01';
    store.buildEndDate.value = '2024-01-01';
    expect(store.ensureBuildDateOrder('start')).toBe(false);
    expect(store.buildEndDate.value).toBe('2024-05-01');
    expect(store.buildMessage.value?.kind).toBe('warning');

    store.buildStartDate.value = '2024-01-01';
    store.buildEndDate.value = '2024-05-01';
    expect(store.ensureBuildDateOrder('start')).toBe(true);
  });
});

describe('picker toggles (:744-755)', () => {
  it('filters the build list through the toggles', async () => {
    const store = makeStore();
    store.init();
    await vi.advanceTimersByTimeAsync(1);

    store.toggleTradfiOnly();
    expect(store.buildVisibleList.value).toEqual(['xyz:AAPL']);
    store.toggleNoLocalData(); // BTC has downloaded history; xyz:AAPL does not
    expect(store.buildVisibleList.value).toEqual(['xyz:AAPL']);
    store.buildFilter.value = 'btc';
    expect(store.buildVisibleList.value).toEqual([]);
  });
});
