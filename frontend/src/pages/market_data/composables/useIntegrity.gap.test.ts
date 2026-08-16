import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseIntegrityOptions } from './useIntegrity';
import { useIntegrity, type IntegrityApi, type IntegrityController } from './useIntegrity';
import type { IntegrityPollingController } from './useIntegrityPolling';

/* The gap-details modal (:4653-4804) and the Delete-key removal
   (:9270-9283) — split out of useIntegrity.test.ts when the store was
   split (useIntegrityGapDetails); fixtures are local to keep the two files
   independent. */

const T_KEYS: Record<string, string> = {
  'market.contextSuffix': ' (context)',
  'market.loadingMinuteCoverage': 'Loading minute coverage…',
  'market.unableMinuteCoverage': 'Unable to load minute coverage.',
};

function t(key: string, params?: Record<string, unknown>): string {
  const raw = T_KEYS[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(params[name] ?? ''));
}

const CHECKSUM_SETTINGS = {
  publish_enabled: true,
  publish_archive: 'own',
  reference_archive: 'public',
  archives: [{ name: 'own', repository: 'me/pbgui', can_publish: true }],
  catalog: { initial_scan_complete: true, counts: { valid: 1 } },
  reference: {},
};

const INTEGRITY_STATUS = {
  catalog: CHECKSUM_SETTINGS.catalog,
  comparison: null,
  reference: {},
};

const REMOVED_COINS = {
  rows: [
    { exchange: 'bybit', coin: 'OLD1', files: 2, bytes: 1024, removable: true },
    { exchange: 'bybit', coin: 'OLD3', files: 4, bytes: 2048, removable: true },
  ],
  mapping_status: 'ok',
};

const REMOVED_PREVIEW = {
  coin_count: 1,
  files: 2,
  bytes: 1024,
  from_day: '2024-01-01',
  to_day: '2024-02-01',
  blocked_count: 0,
  coins: ['OLD1'],
};

const ISSUES = {
  rows: [
    { exchange: 'bybit', coin: 'BTC', day: '2026-01-05', missing_minutes: 10, error: 'checksum mismatch' },
    { exchange: 'bybit', coin: 'BTC', day: '2026-01-02', missing_minutes: 30, error: 'checksum mismatch' },
  ],
};

const DAY_DETAILS = {
  day: '2026-01-05',
  actual_candles: 1400,
  missing_minutes: 40,
  damaged_missing_minutes: 12,
  first: '2026-01-05T00:05:00',
  last: '2026-01-05T23:59:00',
  error: 'checksum mismatch',
  earliest_local_day: '2024-01-01',
  day_context: [{ day: '2026-01-04', hourly_coverage: 'p'.repeat(24), candles: 1440, status: 'ok' }],
  coverage: 'p'.repeat(1440),
  ranges: [{ kind: 'internal', start: '2026-01-05T01:00:00', end: '2026-01-05T01:10:00', minutes: 10 }],
};

function makeStore(confirm: (req?: unknown) => Promise<boolean> = async () => true) {
  const fetchJson = vi.fn(async (path: string, init?: RequestInit): Promise<unknown> => {
    const method = init?.method ?? 'GET';
    if (path === '/checksums/settings' && method === 'GET') return CHECKSUM_SETTINGS;
    if (path === '/integrity/removed-coins/preview') return REMOVED_PREVIEW;
    if (path.startsWith('/integrity/status')) return INTEGRITY_STATUS;
    if (path.startsWith('/integrity/removed-coins?')) return REMOVED_COINS;
    if (path.startsWith('/integrity/issues')) return ISSUES;
    if (path.startsWith('/integrity/day-details')) return DAY_DETAILS;
    if (method === 'POST') return { created: true };
    throw new Error(`unmocked ${method} ${path}`);
  });
  const showToast = vi.fn();
  const polling = {
    start: vi.fn(),
    stop: vi.fn(),
    isPolling: vi.fn(() => false),
    hadActiveJob: vi.fn(() => false),
    markActiveJob: vi.fn(),
  } satisfies IntegrityPollingController;
  const controller: IntegrityController = useIntegrity({
    api: { fetchJson: fetchJson as unknown as IntegrityApi['fetchJson'] },
    t,
    showToast,
    confirm: confirm as unknown as UseIntegrityOptions['confirm'],
    getExchange: () => 'bybit',
    serial: () => 'S1',
    polling,
    now: () => 1111,
  });
  const calls = () =>
    fetchJson.mock.calls.map((call) => ({
      path: String(call[0]),
      method: call[1]?.method ?? 'GET',
      body: call[1]?.body ? String(call[1].body) : undefined,
    }));
  return { controller, fetchJson, calls, showToast };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('gap details modal (:4653-4804)', () => {
  it('opens with the sorted days, last selected, and loads its payload (:4781-4804)', async () => {
    const { controller, calls } = makeStore();
    await controller.loadIntegrityPanel(false);
    controller.openGapDetails('bybit', 'BTC');
    expect(controller.gapOpen.value).toBe(true);
    expect(controller.gapSubtitle.value).toBe('bybit / BTC');
    expect(controller.gapDayOptions.value.map((o) => o.value)).toEqual(['2026-01-02', '2026-01-05']);
    expect(controller.gapSelectedDay.value).toBe('2026-01-05');
    await flush();
    expect(calls().find((c) => c.path.startsWith('/integrity/day-details'))?.path).toBe(
      '/integrity/day-details?exchange=bybit&coin=BTC&day=2026-01-05'
    );
    expect(controller.gapSummaryCards.value[0]?.value).toBe(1400);
    expect(controller.gapChart.value).toHaveLength(24);
    expect(controller.gapRanges.value).toHaveLength(1);
    expect(controller.gapFeedback.value.message).toBe('');
  });

  it('does not open without issue days (:4787)', async () => {
    const { controller } = makeStore();
    await controller.loadIntegrityPanel(false);
    controller.openGapDetails('bybit', 'NOPE');
    expect(controller.gapOpen.value).toBe(false);
  });

  it('appends a context day option with the suffix (:4765-4771)', async () => {
    const { controller, fetchJson } = makeStore();
    fetchJson.mockImplementation(async (path: string) => {
      if (path === '/checksums/settings') return CHECKSUM_SETTINGS;
      if (path.startsWith('/integrity/status')) return INTEGRITY_STATUS;
      if (path.startsWith('/integrity/removed-coins?')) return REMOVED_COINS;
      if (path.startsWith('/integrity/issues')) return ISSUES;
      if (path.startsWith('/integrity/day-details')) return { ...DAY_DETAILS, day: '2026-01-04' };
      throw new Error('unexpected');
    });
    await controller.loadIntegrityPanel(false);
    controller.openGapDetails('bybit', 'BTC');
    await flush();
    const appended = controller.gapDayOptions.value.find((o) => o.value === '2026-01-04');
    expect(appended?.label).toBe('2026-01-04 (context)');
    expect(controller.gapSelectedDay.value).toBe('2026-01-04');
  });

  it('drops in-flight day loads when the modal closes (:4764, :4653-4656)', async () => {
    const { controller, fetchJson } = makeStore();
    let releaseDay: (value: Record<string, unknown>) => void = () => undefined;
    fetchJson.mockImplementation(
      (path: string) =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
          if (path === '/checksums/settings') return resolve(CHECKSUM_SETTINGS);
          if (path.startsWith('/integrity/status')) return resolve(INTEGRITY_STATUS);
          if (path.startsWith('/integrity/removed-coins?')) return resolve(REMOVED_COINS);
          if (path.startsWith('/integrity/issues')) return resolve(ISSUES);
          if (path.startsWith('/integrity/day-details')) {
            releaseDay = resolve as (value: Record<string, unknown>) => void;
            return undefined as unknown as void;
          }
          reject(new Error('unexpected'));
          return undefined as unknown as void;
        }) as Promise<Record<string, unknown>>
    );
    await controller.loadIntegrityPanel(false);
    controller.openGapDetails('bybit', 'BTC');
    await flush();
    controller.closeGapDetails();
    expect(controller.gapOpen.value).toBe(false);
    releaseDay(DAY_DETAILS);
    await flush();
    expect(controller.gapSummaryCards.value).toHaveLength(0); // stale payload dropped
  });

  it('surfaces day-detail failures (:4775-4778)', async () => {
    const { controller, fetchJson } = makeStore();
    fetchJson.mockImplementation(async (path: string) => {
      if (path === '/checksums/settings') return CHECKSUM_SETTINGS;
      if (path.startsWith('/integrity/status')) return INTEGRITY_STATUS;
      if (path.startsWith('/integrity/removed-coins?')) return REMOVED_COINS;
      if (path.startsWith('/integrity/issues')) return ISSUES;
      if (path.startsWith('/integrity/day-details')) throw new Error('HTTP 500');
      throw new Error('unexpected');
    });
    await controller.loadIntegrityPanel(false);
    controller.openGapDetails('bybit', 'BTC');
    await flush();
    expect(controller.gapFeedback.value).toEqual({ message: 'HTTP 500', level: 'error' });
  });
});

describe('Delete-key removal (:9270-9283)', () => {
  it('routes the current selection through removal when the panel is active', async () => {
    const { controller, calls } = makeStore();
    await controller.loadIntegrityPanel(false);
    controller.toggleRemovedCoin('OLD3');
    await controller.handleDeleteKey(new KeyboardEvent('keydown', { key: 'Delete' }), true);
    expect(
      JSON.parse(calls().find((c) => c.path === '/integrity/removed-coins/preview')?.body ?? '{}')
    ).toEqual({ exchange: 'bybit', coins: ['OLD3'] });
  });

  it('ignores Delete while the panel is inactive or focus is in a field (:9271-9276)', async () => {
    const { controller, calls } = makeStore();
    await controller.loadIntegrityPanel(false);
    controller.toggleRemovedCoin('OLD1');
    await controller.handleDeleteKey(new KeyboardEvent('keydown', { key: 'Delete' }), false);
    expect(calls().find((c) => c.method === 'POST')).toBeUndefined();
    const input = document.createElement('input');
    const keydown = new KeyboardEvent('keydown', { key: 'Delete' });
    input.dispatchEvent(keydown); // gives the event a real input target
    await controller.handleDeleteKey(keydown, true);
    expect(calls().find((c) => c.method === 'POST')).toBeUndefined();
    await controller.handleDeleteKey(new KeyboardEvent('keydown', { key: 'x' }), true);
    expect(calls().find((c) => c.method === 'POST')).toBeUndefined();
  });
});
