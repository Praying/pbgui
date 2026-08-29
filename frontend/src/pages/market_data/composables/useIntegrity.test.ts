import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseIntegrityOptions } from './useIntegrity';
import { useIntegrity, type IntegrityApi, type IntegrityController } from './useIntegrity';
import type { IntegrityPollingController } from './useIntegrityPolling';

/* The integrity store — integrityState + integrityDetailState
   (market_data_main.html:3715-3738) with the load/save/queue/removed-coin/
   gap-modal action core (:4252-4887) and the exchange-change branch
   (:7324-7332). */

const T_KEYS: Record<string, string> = {
  'market.loadingIntegrityCatalog': 'Loading integrity catalog…',
  'market.failedIntegrityStatus': 'Failed to load integrity status.',
  'market.checksumSaved': 'Checksum settings saved.',
  'market.failedSaveChecksum': 'Failed to save checksum settings.',
  'market.jobAlreadyActive': 'A job is already active.',
  'market.unableQueueIntegrity': 'Unable to queue the integrity operation.',
  'market.integrityScanQueued': 'Integrity scan queued.',
  'market.fallbackNormalizationQueued': 'Fallback normalization queued.',
  'market.repairAllQueued': 'Repair all queued.',
  'market.coinRepairQueued': 'Coin repair queued.',
  'market.checksumPubQueued': 'Checksum publish queued.',
  'market.referenceRefreshQueued': 'Reference refresh queued.',
  'market.removeUnavailableTitle': 'Remove unavailable markets',
  'market.removeUnavailableMessage': 'Remove {count} unavailable market(s)?',
  'market.filesAndSize': '{files} files, {size}',
  'market.unsafeRowsExcluded': '{count} unsafe row(s) are excluded',
  'market.runtimeCachesNotRemoved': 'Runtime caches are not removed.',
  'market.unavailableMarkets': 'Unavailable markets',
  'market.removeMarketData': 'Remove market data',
  'market.unavailableDeletionQueued': 'Unavailable market deletion queued.',
  'market.unablePrepareUnavailable': 'Unable to prepare unavailable market removal.',
  'market.normalizeFallbackTitle': 'Normalize fallback candles',
  'market.contextSuffix': ' (context)',
  'market.loadingMinuteCoverage': 'Loading minute coverage…',
  'market.unableMinuteCoverage': 'Unable to load minute coverage.',
  'market.removedCount': '{count} removed markets',
  'market.issueCount': '{coins} coins / {days} damaged days',
  'market.differenceCount': '{count} differences',
  'market.removeSelected': 'Remove selected',
  'market.removeSelectedCount': 'Remove selected ({count})',
  'market.noPublishArchive': 'No publishable archive',
  'market.noReferenceArchive': 'No reference archive',
  'market.mappingUnavailable': '{exchange} mapping is unavailable.',
  'market.noRemovedMarkets': 'No removed markets.',
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
  archives: [
    { name: 'own', repository: 'me/pbgui', can_publish: true, can_reference: false },
    { name: 'public', repository: 'org/public', can_publish: false, can_reference: true },
    { name: 'neither', repository: 'x/y', can_publish: false, can_reference: false },
  ],
  catalog: {
    initial_scan_complete: true,
    counts: { valid: 10, inception_partial: 2, source_gap: 3, invalid: 4 },
  },
  reference: { selected_repository: 'org/public', matches_selected: true },
};

const INTEGRITY_STATUS = {
  exchange: 'bybit',
  catalog: CHECKSUM_SETTINGS.catalog,
  comparison: {
    counts: { local_only: 1, reference_only: 2, mismatch: 3 },
    differences: [{ kind: 'mismatch', exchange: 'bybit', coin: 'BTC', day: '2026-01-02' }],
  },
  reference: CHECKSUM_SETTINGS.reference,
};

const REMOVED_COINS = {
  rows: [
    { exchange: 'bybit', coin: 'OLD1', files: 2, bytes: 1024, from_day: '2024-01-01', to_day: '2024-02-01', market_reason: 'delisted', removable: true },
    { exchange: 'bybit', coin: 'OLD2', files: 1, bytes: 512, from_day: '2024-03-01', to_day: '2024-03-02', market_reason: 'inactive', removable: false },
    { exchange: 'bybit', coin: 'OLD3', files: 4, bytes: 2048, from_day: '2024-04-01', to_day: '2024-05-01', market_reason: 'delisted', removable: true },
  ],
  mapping_status: 'ok',
  mapping_reason: '',
};

const REMOVED_PREVIEW = {
  coin_count: 2,
  files: 3,
  bytes: 3072,
  from_day: '2024-01-01',
  to_day: '2024-02-01',
  blocked_count: 0,
  coins: ['OLD1', 'OLD3'],
};

const ISSUES = {
  rows: [
    { exchange: 'bybit', coin: 'BTC', day: '2026-01-05', missing_minutes: 10, error: 'checksum mismatch' },
    { exchange: 'bybit', coin: 'BTC', day: '2026-01-02', missing_minutes: 30, error: 'checksum mismatch' },
    { exchange: 'bybit', coin: 'ETH', day: '2026-01-03', missing_minutes: 5, error: 'candle count' },
    { exchange: 'bybit', coin: 'GONE', day: '2026-01-04', error: 'x', market_status: 'removed' },
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

interface Call {
  path: string;
  method: string;
  body?: string;
}

/** Shared mock type so call logs and implementations stay typed. */
type FetchJsonMock = ReturnType<typeof vi.fn>;

function defaultFetchJson(): FetchJsonMock {
  const fn = vi.fn(
    async (path: string, init?: RequestInit): Promise<Record<string, unknown>> => {
      const method = init?.method ?? 'GET';
      if (path === '/checksums/settings' && method === 'GET') return CHECKSUM_SETTINGS;
      if (path === '/checksums/settings' && method === 'PUT') {
        return { success: true, settings: CHECKSUM_SETTINGS };
      }
      if (path === '/integrity/removed-coins/preview') return REMOVED_PREVIEW;
      if (path.startsWith('/integrity/status')) return INTEGRITY_STATUS;
      if (path.startsWith('/integrity/removed-coins?')) return REMOVED_COINS;
      if (path.startsWith('/integrity/issues')) return ISSUES;
      if (path.startsWith('/integrity/day-details')) return DAY_DETAILS;
      if (method === 'POST') return { created: true };
      throw new Error(`unmocked ${method} ${path}`);
    }
  );
  return fn;
}

function makePolling() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    isPolling: vi.fn(() => false),
    hadActiveJob: vi.fn(() => false),
    markActiveJob: vi.fn(),
  };
}

function makeStore(
  overrides: {
    getExchange?: () => string;
    fetchJson?: FetchJsonMock;
    confirm?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const fetchJson = overrides.fetchJson ?? defaultFetchJson();
  const api = { fetchJson: fetchJson as unknown as IntegrityApi['fetchJson'] };
  const showToast = vi.fn();
  const confirm = overrides.confirm ?? vi.fn(async () => true);
  const polling = makePolling();
  const controller: IntegrityController = useIntegrity({
    api,
    t,
    showToast,
    confirm: confirm as unknown as UseIntegrityOptions['confirm'],
    getExchange: overrides.getExchange ?? (() => 'bybit'),
    serial: () => 'S1',
    polling,
    now: () => 1111,
  });
  return {
    controller,
    fetchJson,
    showToast,
    confirm,
    polling,
    /** Live view over the fetch mock (snapshot-free — call at assert time). */
    calls(): Call[] {
      return fetchJson.mock.calls.map((call) => ({
        path: String(call[0]),
        method: call[1]?.method ?? 'GET',
        body: call[1]?.body ? String(call[1].body) : undefined,
      }));
    },
  };
}

function mouseDown(y: number): MouseEvent {
  return new MouseEvent('mousedown', { button: 0, clientY: y });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('loadIntegrityPanel (:4521-4555)', () => {
  it('issues the four parallel GETs and applies the payloads', async () => {
    const { controller, calls } = makeStore();
    await controller.loadIntegrityPanel(false);
    expect(calls().map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /checksums/settings',
      'GET /integrity/status?exchange=bybit',
      'GET /integrity/removed-coins?exchange=bybit',
      'GET /integrity/issues?exchange=bybit&limit=1000000',
    ]);
    expect(controller.exchange.value).toBe('bybit');
    expect(controller.issueGroups.value).toHaveLength(2); // GONE filtered (:4544-4546)
    expect(controller.removedRows.value).toHaveLength(3);
    expect(controller.feedback.value.message).toBe('');
  });

  it('syncs the archive form with the predicate-filtered selects (:4310-4327)', async () => {
    const { controller } = makeStore();
    await controller.loadIntegrityPanel(false);
    expect(controller.form.publishEnabled.value).toBe(true);
    expect(controller.form.publishArchive.value).toBe('own');
    expect(controller.form.referenceArchive.value).toBe('public');
    expect(controller.archiveOptions.value.publish).toEqual([
      { value: '', label: 'No publishable archive' },
      { value: 'own', label: 'own (me/pbgui)' },
    ]);
    expect(controller.archiveOptions.value.reference).toEqual([
      { value: '', label: 'No reference archive' },
      { value: 'public', label: 'public (org/public)' },
    ]);
    expect(controller.publishDisabled.value).toBe(false);
    expect(controller.referenceDisabled.value).toBe(false);
  });

  it('falls back to the empty option when the stored archive is unavailable (:4275)', async () => {
    const { controller, fetchJson } = makeStore();
    fetchJson.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (path === '/checksums/settings' && method === 'GET') {
        return { ...CHECKSUM_SETTINGS, publish_archive: 'gone', reference_archive: '' };
      }
      if (path.startsWith('/integrity/status')) return INTEGRITY_STATUS;
      if (path.startsWith('/integrity/removed-coins?')) return REMOVED_COINS;
      if (path.startsWith('/integrity/issues')) return ISSUES;
      throw new Error('unexpected');
    });
    await controller.loadIntegrityPanel(false);
    expect(controller.form.publishArchive.value).toBe('');
    expect(controller.form.referenceArchive.value).toBe('');
    // the buttons follow the server-side selection, not the form fallback
    // (:4326-4327): 'gone' is truthy → publish stays enabled; '' disables reference
    expect(controller.publishDisabled.value).toBe(false);
    expect(controller.referenceDisabled.value).toBe(true);
  });

  it('mounts the job monitor once per load, cache-busted only when forced (:4550, :4245-4249)', async () => {
    const { controller } = makeStore();
    await controller.loadIntegrityPanel(false);
    const idle = controller.jobMonitorSrc.value;
    expect(idle.startsWith('/api/jobs/main_page?v=S1&embed=1&exchange=bybit&job_type=')).toBe(true);
    expect(idle.includes('_ts')).toBe(false);
    await controller.loadIntegrityPanel(true);
    expect(controller.jobMonitorSrc.value).toContain('&_ts=1111');
  });

  it('drops a stale load behind a newer request (:4538, R4)', async () => {
    const { controller, fetchJson } = makeStore();
    const resolvers: Array<(value: Record<string, unknown>) => void> = [];
    let settingsCalls = 0;
    fetchJson.mockImplementation(
      (path: string, init?: RequestInit) =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const method = init?.method ?? 'GET';
          if (path === '/checksums/settings' && method === 'GET') {
            settingsCalls += 1;
            if (settingsCalls === 1) {
              resolvers.push(resolve as (value: Record<string, unknown>) => void);
              return undefined as unknown as void;
            }
            resolve({ ...CHECKSUM_SETTINGS, publish_enabled: false });
            return undefined as unknown as void;
          }
          if (path.startsWith('/integrity/status')) return resolve(INTEGRITY_STATUS);
          if (path.startsWith('/integrity/removed-coins?')) return resolve(REMOVED_COINS);
          if (path.startsWith('/integrity/issues')) return resolve(ISSUES);
          reject(new Error('unexpected'));
          return undefined as unknown as void;
        }) as Promise<Record<string, unknown>>
    );
    const stale = controller.loadIntegrityPanel(false);
    const fresh = controller.loadIntegrityPanel(false);
    await fresh;
    resolvers[0]?.(CHECKSUM_SETTINGS); // the stale GET resolves last
    await stale;
    await flush();
    expect(controller.form.publishEnabled.value).toBe(false); // newer payload won
  });

  it('drops a load whose context exchange changed mid-flight (:4538)', async () => {
    let exchangeNow = 'bybit';
    const { controller } = makeStore({ getExchange: () => exchangeNow });
    const pending = controller.loadIntegrityPanel(false);
    exchangeNow = 'okx';
    await pending;
    expect(controller.issueGroups.value).toHaveLength(0); // nothing applied
  });

  it('shows the error callout on failure (:4551-4554)', async () => {
    const { controller, fetchJson } = makeStore();
    fetchJson.mockRejectedValue(new Error('HTTP 500'));
    await controller.loadIntegrityPanel(false);
    expect(controller.feedback.value).toEqual({ message: 'HTTP 500', level: 'error' });
    fetchJson.mockRejectedValue(new Error(''));
    await controller.loadIntegrityPanel(false);
    expect(controller.feedback.value.message).toBe('Failed to load integrity status.');
  });

  it('defers a load while saving, then reloads forced after the save (:4521-4525, :4631-4634)', async () => {
    const { controller, fetchJson, calls } = makeStore();
    await controller.loadIntegrityPanel(false);
    const getsBefore = calls().filter((c) => c.method === 'GET').length;
    let releasePut: (value: Record<string, unknown>) => void = () => undefined;
    fetchJson.mockImplementation(
      (path: string, init?: RequestInit) =>
        new Promise((resolve) => {
          const method = init?.method ?? 'GET';
          if (path === '/checksums/settings' && method === 'PUT') {
            releasePut = resolve as (value: Record<string, unknown>) => void;
            return undefined as unknown as void;
          }
          if (path === '/checksums/settings') {
            resolve({ ...CHECKSUM_SETTINGS, publish_enabled: false });
            return undefined as unknown as void;
          }
          if (path.startsWith('/integrity/status')) return resolve(INTEGRITY_STATUS);
          if (path.startsWith('/integrity/removed-coins?')) return resolve(REMOVED_COINS);
          if (path.startsWith('/integrity/issues')) return resolve(ISSUES);
          resolve({});
          return undefined as unknown as void;
        }) as Promise<Record<string, unknown>>
    );
    const saving = controller.saveIntegritySettings();
    expect(controller.isSaving.value).toBe(true);
    void controller.loadIntegrityPanel(false); // deferred behind the save
    expect(calls().filter((c) => c.method === 'GET').length).toBe(getsBefore);
    releasePut({ success: true, settings: CHECKSUM_SETTINGS });
    await saving;
    await flush();
    expect(calls().filter((c) => c.method === 'GET').length).toBe(getsBefore + 4); // reload ran
    expect(controller.jobMonitorSrc.value).toContain('_ts=1111'); // forced (:4633)
  });
});

describe('saveIntegritySettings (:4607-4636)', () => {
  it('PUTs the form payload and toasts success', async () => {
    const { controller, calls, showToast } = makeStore();
    await controller.loadIntegrityPanel(false);
    controller.form.publishEnabled.value = false;
    controller.form.publishArchive.value = 'own';
    controller.form.referenceArchive.value = 'public';
    await controller.saveIntegritySettings();
    const put = calls().find((c) => c.method === 'PUT');
    expect(put?.path).toBe('/checksums/settings');
    expect(JSON.parse(put?.body ?? '{}')).toEqual({
      publish_enabled: false,
      publish_archive: 'own',
      reference_archive: 'public',
    });
    expect(showToast).toHaveBeenCalledWith('Checksum settings saved.', 'success');
    expect(controller.isSaving.value).toBe(false);
  });

  it('toasts the server message or the fallback on failure (:4625-4627)', async () => {
    const { controller, fetchJson, showToast } = makeStore();
    await controller.loadIntegrityPanel(false);
    fetchJson.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'PUT') throw new Error('Publish archive must be the writable own archive');
      if (path === '/checksums/settings') return CHECKSUM_SETTINGS;
      if (path.startsWith('/integrity/status')) return INTEGRITY_STATUS;
      if (path.startsWith('/integrity/removed-coins')) return REMOVED_COINS;
      if (path.startsWith('/integrity/issues')) return ISSUES;
      throw new Error('unexpected');
    });
    await controller.saveIntegritySettings();
    expect(showToast).toHaveBeenCalledWith('Publish archive must be the writable own archive', 'error');
    fetchJson.mockRejectedValue(new Error(''));
    await controller.saveIntegritySettings();
    expect(showToast).toHaveBeenCalledWith('Failed to save checksum settings.', 'error');
  });
});

describe('queueIntegrityOperation family (:4638-4651, :9140-9177)', () => {
  it('queues a full scan for the current exchange (:9140-9143)', async () => {
    const { controller, calls, showToast, polling } = makeStore();
    await controller.queueScan();
    const post = calls().find((c) => c.method === 'POST');
    expect(post?.path).toBe('/integrity/scan');
    expect(JSON.parse(post?.body ?? '{}')).toEqual({ exchange: 'bybit' });
    expect(showToast).toHaveBeenCalledWith('Integrity scan queued.', 'success');
    expect(polling.markActiveJob).toHaveBeenCalled();
    expect(polling.start).toHaveBeenCalled();
    expect(controller.jobMonitorSrc.value).toContain('_ts=1111');
  });

  it('toasts jobAlreadyActive when the queue refuses (created=false, :4646)', async () => {
    const { controller, fetchJson, showToast } = makeStore();
    fetchJson.mockResolvedValue({ created: false });
    await controller.queueScan();
    expect(showToast).toHaveBeenCalledWith('A job is already active.', 'success');
  });

  it('toasts the fallback on queue failure (:4648-4650)', async () => {
    const { controller, fetchJson, showToast } = makeStore();
    fetchJson.mockRejectedValue(new Error('HTTP 422'));
    await controller.queueScan();
    expect(showToast).toHaveBeenCalledWith('HTTP 422', 'error');
    fetchJson.mockRejectedValue(new Error(''));
    await controller.queueScan();
    expect(showToast).toHaveBeenCalledWith('Unable to queue the integrity operation.', 'error');
  });

  it('gates the hyperliquid normalize fallback behind the confirm dialog (:9144-9164)', async () => {
    const confirm = vi.fn(async () => false);
    const { controller, calls, confirm: confirmSpy } = makeStore({
      getExchange: () => 'hyperliquid',
      confirm,
    });
    await controller.queueNormalizeFallback();
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Normalize fallback candles' })
    );
    expect(calls().find((c) => c.method === 'POST')).toBeUndefined();
    confirmSpy.mockImplementation(async () => true);
    await controller.queueNormalizeFallback();
    const post = calls().find((c) => c.method === 'POST');
    expect(post?.path).toBe('/integrity/hyperliquid/normalize-fallback');
    expect(post?.body).toBeUndefined(); // legacy null body (:4161)
  });

  it('no-ops the normalize fallback off hyperliquid (:9145)', async () => {
    const confirm = vi.fn(async () => true);
    const { controller, calls } = makeStore({ confirm });
    await controller.queueNormalizeFallback();
    expect(confirm).not.toHaveBeenCalled();
    expect(calls().find((c) => c.method === 'POST')).toBeUndefined();
  });

  it('queues repair-all and per-coin repairs (:9165-9168, :9187-9197)', async () => {
    const { controller, calls, showToast } = makeStore();
    await controller.queueRepairAll();
    expect(JSON.parse(calls().find((c) => c.path === '/integrity/repair-all')?.body ?? '{}')).toEqual({
      exchange: 'bybit',
    });
    await controller.queueRepairCoin('bybit', 'BTC');
    const repairs = calls().filter((c) => c.path === '/integrity/repair-all');
    expect(repairs).toHaveLength(2);
    expect(JSON.parse(repairs[1]?.body ?? '{}')).toEqual({ exchange: 'bybit', coin: 'BTC' });
    expect(showToast).toHaveBeenLastCalledWith('Coin repair queued.', 'success');
  });

  it('queues checksum publish and reference refresh (:9172-9177)', async () => {
    const { controller, calls } = makeStore();
    await controller.queuePublish();
    await controller.queueReference();
    expect(calls().find((c) => c.path === '/checksums/publish')?.body).toBeUndefined();
    expect(calls().find((c) => c.path === '/checksums/reference')?.body).toBeUndefined();
  });
});

describe('removed-coin removal flow (:4806-4886)', () => {
  it('previews then removes the selected coins with a deduped payload (:4849-4851)', async () => {
    const { controller, calls, showToast, confirm, polling } = makeStore();
    await controller.loadIntegrityPanel(false);
    await controller.removeUnavailableIntegrityCoins('bybit', ['OLD1', 'OLD1'], false);
    const preview = calls().find((c) => c.path === '/integrity/removed-coins/preview');
    expect(JSON.parse(preview?.body ?? '{}')).toEqual({ exchange: 'bybit', coins: ['OLD1'] });
    const confirmArg = confirm.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(confirmArg.title).toBe('Remove unavailable markets');
    expect(confirmArg.message).toBe('Remove 2 unavailable market(s)?');
    expect(String(confirmArg.detail)).toContain('3 files, 3.00 KB');
    expect(String(confirmArg.detail)).toContain(', 2024-01-01 to 2024-02-01');
    expect(String(confirmArg.detail)).toContain('Runtime caches are not removed.');
    expect(confirmArg.items).toEqual(['OLD1', 'OLD3']);
    expect(confirmArg.listLabel).toBe('Unavailable markets');
    expect(confirmArg.confirmText).toBe('Remove market data');
    const remove = calls().find((c) => c.path === '/integrity/removed-coins/remove');
    expect(JSON.parse(remove?.body ?? '{}')).toEqual({ exchange: 'bybit', coins: ['OLD1'] });
    expect(controller.selectedRemovedCount.value).toBe(0); // cleared (:4877)
    expect(showToast).toHaveBeenCalledWith('Unavailable market deletion queued.', 'success');
    expect(polling.markActiveJob).toHaveBeenCalled();
  });

  it('omits the blocked-row suffix when nothing is blocked (:4860-4864)', async () => {
    const { controller, fetchJson, confirm } = makeStore();
    fetchJson.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (path === '/integrity/removed-coins/preview') return { ...REMOVED_PREVIEW, blocked_count: 0 };
      if (path === '/checksums/settings') return CHECKSUM_SETTINGS;
      if (path.startsWith('/integrity/status')) return INTEGRITY_STATUS;
      if (path.startsWith('/integrity/removed-coins?')) return REMOVED_COINS;
      if (path.startsWith('/integrity/issues')) return ISSUES;
      if (method === 'POST') return { created: true };
      throw new Error('unexpected');
    });
    await controller.loadIntegrityPanel(false);
    await controller.removeUnavailableIntegrityCoins('bybit', ['OLD1'], false);
    const confirmArg = confirm.mock.calls[0]?.[0] as { detail: string };
    expect(confirmArg.detail).not.toContain('unsafe row');
  });

  it('sends the all:true payload for remove-all (:4849-4850)', async () => {
    const { controller, calls } = makeStore();
    await controller.loadIntegrityPanel(false);
    await controller.removeUnavailableIntegrityCoins('bybit', [], true);
    expect(
      JSON.parse(calls().find((c) => c.path === '/integrity/removed-coins/preview')?.body ?? '{}')
    ).toEqual({ exchange: 'bybit', all: true });
  });

  it('does not remove when the confirm is declined (:4861-4868)', async () => {
    const { controller, calls } = makeStore({ confirm: vi.fn(async () => false) });
    await controller.loadIntegrityPanel(false);
    await controller.removeUnavailableIntegrityCoins('bybit', ['OLD1'], false);
    expect(calls().find((c) => c.path === '/integrity/removed-coins/remove')).toBeUndefined();
  });

  it('refuses a foreign exchange (:4847-4848)', async () => {
    const { controller, calls } = makeStore();
    await controller.loadIntegrityPanel(false);
    await controller.removeUnavailableIntegrityCoins('okx', ['OLD1'], false);
    expect(calls().find((c) => c.method === 'POST')).toBeUndefined();
  });

  it('toasts the fallback when the preview fails (:4883-4885)', async () => {
    const { controller, fetchJson, showToast } = makeStore();
    await controller.loadIntegrityPanel(false);
    fetchJson.mockRejectedValue(new Error('HTTP 500'));
    await controller.removeUnavailableIntegrityCoins('bybit', ['OLD1'], false);
    expect(showToast).toHaveBeenCalledWith('HTTP 500', 'error');
    fetchJson.mockRejectedValue(new Error(''));
    await controller.removeUnavailableIntegrityCoins('bybit', ['OLD1'], false);
    expect(showToast).toHaveBeenLastCalledWith('Unable to prepare unavailable market removal.', 'error');
  });

  it('single-coin helper routes through the same flow (:4806-4808)', async () => {
    const { controller, calls } = makeStore();
    await controller.loadIntegrityPanel(false);
    await controller.removeUnavailableIntegrityCoin('bybit', 'OLD3');
    expect(
      JSON.parse(calls().find((c) => c.path === '/integrity/removed-coins/preview')?.body ?? '{}')
    ).toEqual({ exchange: 'bybit', coins: ['OLD3'] });
  });
});

describe('removed-coin selection + range drag (:4810-4843, :9217-9259)', () => {
  it('toggles single rows and mirrors the button state (:9237-9247)', async () => {
    const { controller } = makeStore();
    await controller.loadIntegrityPanel(false);
    expect(controller.removeSelectedDisabled.value).toBe(true);
    expect(controller.removeSelectedLabelText.value).toBe('Remove selected');
    controller.toggleRemovedCoin('OLD1');
    expect(controller.selectedRemovedCount.value).toBe(1);
    expect(controller.removeSelectedDisabled.value).toBe(false);
    expect(controller.removeSelectedLabelText.value).toBe('Remove selected (1)');
    controller.toggleRemovedCoin('OLD1');
    expect(controller.selectedRemovedCount.value).toBe(0);
  });

  it('prunes selections that are no longer removable on reload (:4361-4363)', async () => {
    const { controller, fetchJson } = makeStore();
    await controller.loadIntegrityPanel(false);
    controller.toggleRemovedCoin('OLD1');
    expect(controller.isRemovedCoinSelected('OLD1')).toBe(true);
    fetchJson.mockImplementation(async (path: string) => {
      if (path === '/checksums/settings') return CHECKSUM_SETTINGS;
      if (path.startsWith('/integrity/status')) return INTEGRITY_STATUS;
      if (path.startsWith('/integrity/removed-coins?')) {
        return { rows: REMOVED_COINS.rows.filter((r) => r.coin !== 'OLD1'), mapping_status: 'ok' };
      }
      if (path.startsWith('/integrity/issues')) return ISSUES;
      throw new Error('unexpected');
    });
    await controller.loadIntegrityPanel(false);
    expect(controller.isRemovedCoinSelected('OLD1')).toBe(false);
  });

  it('applies an index range between the anchor and the dragged row (:4827-4843)', async () => {
    const { controller } = makeStore();
    await controller.loadIntegrityPanel(false);
    // removable order: OLD1, OLD3
    controller.handleRemovedRowMouseDown(mouseDown(10), 'OLD1');
    controller.handleRemovedTableMouseMove({ button: 0, clientY: 60, target: null } as unknown as MouseEvent); // below threshold → no sweep yet
    expect(controller.selectedRemovedCount.value).toBe(0);
    controller.handleRemovedTableMouseMove({
      button: 0,
      clientY: 80,
      target: { closest: () => ({ getAttribute: () => 'OLD3' }) },
    } as unknown as MouseEvent);
    expect(controller.isRemovedCoinSelected('OLD1')).toBe(true);
    expect(controller.isRemovedCoinSelected('OLD3')).toBe(true);
    controller.handleRemovedMouseUp();
    expect(controller.selectedRemovedCount.value).toBe(2);
  });

  it('removes through the range when the anchor was selected (:9224)', async () => {
    const { controller } = makeStore();
    await controller.loadIntegrityPanel(false);
    controller.toggleRemovedCoin('OLD1');
    controller.toggleRemovedCoin('OLD3');
    controller.handleRemovedRowMouseDown(mouseDown(10), 'OLD1');
    controller.handleRemovedTableMouseMove({
      button: 0,
      clientY: 80,
      target: { closest: () => ({ getAttribute: () => 'OLD3' }) },
    } as unknown as MouseEvent);
    expect(controller.selectedRemovedCount.value).toBe(0);
    controller.handleRemovedMouseUp();
  });

  it('toggles the anchor on a plain click without a sweep (:9251-9254)', async () => {
    const { controller } = makeStore();
    await controller.loadIntegrityPanel(false);
    controller.handleRemovedRowMouseDown(mouseDown(10), 'OLD1');
    controller.handleRemovedMouseUp();
    expect(controller.isRemovedCoinSelected('OLD1')).toBe(true);
  });

  it('ignores mousedown on action buttons and non-left buttons (:9218)', async () => {
    const { controller } = makeStore();
    await controller.loadIntegrityPanel(false);
    controller.handleRemovedRowMouseDown(
      {
        button: 0,
        clientY: 10,
        target: { closest: (sel: string) => (sel === 'button' ? {} : null) },
      } as unknown as MouseEvent,
      'OLD1'
    );
    controller.handleRemovedMouseUp();
    expect(controller.selectedRemovedCount.value).toBe(0);
    controller.handleRemovedRowMouseDown({ button: 2, clientY: 10 } as MouseEvent, 'OLD1');
    controller.handleRemovedMouseUp();
    expect(controller.selectedRemovedCount.value).toBe(0);
  });
});

describe('view models (:4294-4519)', () => {
  it('renders counts and empty states', async () => {
    const { controller } = makeStore();
    await controller.loadIntegrityPanel(false);
    expect(controller.removedCountText.value).toBe('3 removed markets');
    expect(controller.removedEmptyMessage.value).toBe('');
    expect(controller.issueCountText.value).toBe('2 coins / 3 damaged days');
    expect(controller.repairAllDisabled.value).toBe(false);
    expect(controller.differenceCountText.value).toBe('6 differences');
    expect(controller.differences.value).toEqual([
      { kind: 'mismatch', exchange: 'bybit', coin: 'BTC', day: '2026-01-02' },
    ]);
    expect(controller.isHyperliquid.value).toBe(false);
    expect(controller.summaryCards.value).toHaveLength(5);
  });

  it('shows the mapping-unavailable empty state (:4370-4372)', async () => {
    const { controller, fetchJson } = makeStore();
    fetchJson.mockImplementation(async (path: string) => {
      if (path === '/checksums/settings') return CHECKSUM_SETTINGS;
      if (path.startsWith('/integrity/status')) return INTEGRITY_STATUS;
      if (path.startsWith('/integrity/removed-coins?')) {
        return { rows: [], mapping_status: 'unknown', mapping_reason: 'mapping offline' };
      }
      if (path.startsWith('/integrity/issues')) return { rows: [] };
      throw new Error('unexpected');
    });
    await controller.loadIntegrityPanel(false);
    expect(controller.removedEmptyMessage.value).toBe('mapping offline');
    expect(controller.issuesEmptyText.value).toBe('market.noDamagedDays');
    expect(controller.repairAllDisabled.value).toBe(true);
    expect(controller.removedCountText.value).toBe('0 removed markets');
    expect(controller.removedEmptyMessage.value).toBe('mapping offline');
  });
});

describe('onExchangeChange (:7324-7332)', () => {
  it('invalidates, clears and reloads forced', async () => {
    let current = 'bybit';
    const { controller, calls } = makeStore({ getExchange: () => current });
    await controller.loadIntegrityPanel(false);
    const gets = calls().filter((c) => c.method === 'GET').length;
    current = 'okx';
    controller.onExchangeChange('okx');
    await flush();
    expect(calls().filter((c) => c.method === 'GET').length).toBe(gets + 4);
    expect(controller.exchange.value).toBe('okx');
    expect(controller.jobMonitorSrc.value).toContain('exchange=okx');
  });
});

