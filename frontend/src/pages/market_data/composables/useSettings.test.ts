import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useSettings, type LoadSettingsOptions, type SettingsApi, type SettingsPayload } from './useSettings';
import type { ToastLevel } from '../types';

/* The settings store — legacy settingsState + loadSettings/renderSettingsPayload/
   collectSettingsRequest/saveSettings (:3698-3714, :5528-5586, :6121-6186,
   :7015-7133, :7335-7404, :8881-8948) with the M-data-4 tiingo/tradfi slice
   left as hooks. */

const T = (key: string, params?: Record<string, unknown>): string =>
  params ? `${key}:${JSON.stringify(params)}` : key;

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: () => null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => map.set(key, value),
  } as Storage;
}

function hyperliquidPayload(overrides: Record<string, unknown> = {}): SettingsPayload {
  return {
    exchange: 'hyperliquid',
    auto_enable_new_coins: false,
    enabled_coins: ['BTC', 'ETH'],
    coin_options: ['BTC', 'ETH', 'SOL'],
    missing_saved_coins: [],
    settings: {
      interval_seconds: 1800,
      coin_pause_seconds: 0.5,
      api_timeout_seconds: 30,
      min_lookback_days: 2,
      max_lookback_days: 4,
      aws_profile: 'pbgui-hyperliquid',
      aws_access_key_configured: true,
      aws_secret_access_key_configured: true,
      aws_region: 'us-east-1',
      l2book_scan_timeout_s: 5,
      l2book_scan_workers: 8,
      l2book_archive_enabled: false,
      l2book_archive_dir: '',
    },
    ...overrides,
  } as SettingsPayload;
}

function bybitPayload(): SettingsPayload {
  return {
    exchange: 'bybit',
    auto_enable_new_coins: false,
    enabled_coins: ['BTC'],
    coin_options: ['BTC', 'ADA'],
    missing_saved_coins: ['DOGE'],
    settings: {
      interval_seconds: 900,
      coin_pause_seconds: 1,
      api_timeout_seconds: 20,
      min_lookback_days: 1,
      max_lookback_days: 3,
    },
  } as SettingsPayload;
}

interface Harness {
  store: ReturnType<typeof useSettings>;
  api: { fetchJson: ReturnType<typeof vi.fn> };
  storage: Storage;
  toasts: Array<[string, ToastLevel]>;
}

function makeHarness(options: { payload?: SettingsPayload } = {}): Harness {
  const api = { fetchJson: vi.fn(async () => options.payload ?? hyperliquidPayload()) };
  const storage = makeStorage();
  const toasts: Array<[string, ToastLevel]> = [];
  const store = useSettings({
    api: api as unknown as SettingsApi,
    storage,
    t: T,
    showToast: (message, level = 'info') => toasts.push([String(message), level]),
  });
  return { store, api, storage, toasts };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await nextTick();
}

describe('loadSettings (:8881-8898)', () => {
  it('GETs /settings/{exchange} with the encoded key and applies the payload', async () => {
    const { store, api } = makeHarness();
    await store.loadSettings('hyperliquid');
    expect(api.fetchJson).toHaveBeenCalledWith('/settings/hyperliquid');
    expect(store.exchange.value).toBe('hyperliquid');
    expect(store.fields.intervalSeconds).toBe('1800');
    expect(store.fields.coinPauseSeconds).toBe('0.5');
    expect(store.fields.awsRegion).toBe('us-east-1');
    expect(store.autoEnableNewCoins.value).toBe(false);
  });

  it('encodes the exchange key into the URL (:8885)', async () => {
    const { store, api } = makeHarness();
    await store.loadSettings('binance');
    expect(api.fetchJson.mock.calls[0]?.[0]).toBe('/settings/binance');
  });

  it('defaults the exchange to the URL key when the payload omits it (:8886)', async () => {
    const { store, api } = makeHarness();
    api.fetchJson.mockResolvedValueOnce(hyperliquidPayload({ exchange: undefined }));
    await store.loadSettings('bybit');
    expect(store.exchange.value).toBe('bybit');
  });

  it('seeds the selection from enabled_coins and renders the picker (:8889)', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    expect([...store.selectedCoins.value]).toEqual(['BTC', 'ETH']);
    // rendered order: selected first, then the rest, locale-sorted (:7042-7047)
    expect(store.renderedCoins.value).toEqual(['BTC', 'ETH', 'SOL']);
  });

  it('clears the coin filter on every load (:8890-8891)', async () => {
    const { store } = makeHarness();
    store.setCoinFilter('sol');
    await store.loadSettings('hyperliquid');
    expect(store.coinFilter.value).toBe('');
  });

  it('sets the baseline so the form starts clean (:8893)', async () => {
    const { store } = makeHarness();
    expect(store.isDirty.value).toBe(false);
    store.fields.intervalSeconds = '9999'; // pre-load edit, no baseline yet
    expect(store.isDirty.value).toBe(false);
    await store.loadSettings('hyperliquid');
    expect(store.isDirty.value).toBe(false);
    store.fields.intervalSeconds = '9999';
    expect(store.isDirty.value).toBe(true);
  });

  it('accepts the literal {keepFeedback:false} options object (:7314, :8882-8884)', async () => {
    const { store } = makeHarness();
    await expect(store.loadSettings('hyperliquid', { keepFeedback: false })).resolves.toBeUndefined();
  });

  it('rejects keepFeedback:true loudly — the comment-only contract is now code', async () => {
    const { store, api } = makeHarness();
    await expect(
      store.loadSettings('hyperliquid', { keepFeedback: true } as unknown as LoadSettingsOptions)
    ).rejects.toThrow(/keepFeedback/);
    expect(api.fetchJson).not.toHaveBeenCalled();
  });

  it('toasts the raw server error (no serverMsg mapping) on success:false payloads (:7337-7339)', async () => {
    const { store, api, toasts } = makeHarness();
    api.fetchJson.mockResolvedValueOnce({ success: false, error: 'boom', exchange: 'bybit' });
    await store.loadSettings('bybit');
    expect(toasts).toEqual([['boom', 'error']]);
    // legacy still updates exchange/selection before the render bail (:8886-8889)
    expect(store.exchange.value).toBe('bybit');
  });

  it('toasts failedLoadSettings with serverMsg on transport errors (:8895-8897)', async () => {
    const { store, api, toasts } = makeHarness();
    api.fetchJson.mockRejectedValueOnce(new Error('HTTP 500'));
    await store.loadSettings('bybit');
    expect(toasts).toEqual([['HTTP 500', 'error']]);
  });

  it('toasts the generic fallback when the error carries no message', async () => {
    const { store, api, toasts } = makeHarness();
    api.fetchJson.mockRejectedValueOnce(new Error(''));
    await store.loadSettings('bybit');
    expect(toasts).toEqual([['market.failedLoadSettings', 'error']]);
  });
});

describe('renderSettingsPayload field slice (:7335-7360)', () => {
  it('shows the ignored-missing-coins note only when missing_saved_coins is non-empty (:7352-7360)', async () => {
    const { store, api } = makeHarness();
    await store.loadSettings('hyperliquid');
    expect(store.missingSavedCoins.value).toEqual([]);
    api.fetchJson.mockResolvedValueOnce(bybitPayload());
    await store.loadSettings('bybit');
    expect(store.missingSavedCoins.value).toEqual(['DOGE']);
  });

  it('renders numbers via the legacy stringification (0.5 stays "0.5")', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    expect(store.fields.coinPauseSeconds).toBe('0.5');
    expect(store.fields.minLookbackDays).toBe('2');
  });

  it('never copies AWS credential values from a settings response into reactive fields', async () => {
    const basePayload = hyperliquidPayload();
    const { store } = makeHarness({
      payload: hyperliquidPayload({
        settings: {
          ...basePayload.settings,
          aws_access_key_id: 'must-not-render',
          aws_secret_access_key: 'must-not-render',
        },
      }),
    });

    await store.loadSettings('hyperliquid');

    expect(store.fields.awsAccessKeyId).toBe('');
    expect(store.fields.awsSecretAccessKey).toBe('');
    expect(store.fields.awsAccessKeyConfigured).toBe(true);
    expect(store.fields.awsSecretAccessKeyConfigured).toBe(true);
  });

  it('keeps hyperliquid-only fields off the non-hyperliquid form (:7398-7401)', async () => {
    const { store, api } = makeHarness();
    await store.loadSettings('hyperliquid');
    expect(store.fields.awsRegion).toBe('us-east-1');
    api.fetchJson.mockResolvedValueOnce(bybitPayload());
    await store.loadSettings('bybit');
    expect(store.isHyperliquid.value).toBe(false);
  });

  it('runs the M-data-4 hyperliquid hook with the payload (:7379-7397 seam)', async () => {
    const onHyperliquidPayload = vi.fn();
    const onOtherExchangePayload = vi.fn();
    const api = { fetchJson: vi.fn(async () => hyperliquidPayload()) };
    const store = useSettings({
      api: api as unknown as SettingsApi,
      storage: makeStorage(),
      t: T,
      showToast: () => undefined,
      onHyperliquidPayload,
      onOtherExchangePayload,
    });
    await store.loadSettings('hyperliquid');
    expect(onHyperliquidPayload).toHaveBeenCalledTimes(1);
    expect(onOtherExchangePayload).not.toHaveBeenCalled();
    api.fetchJson.mockResolvedValueOnce(bybitPayload());
    await store.loadSettings('bybit');
    expect(onOtherExchangePayload).toHaveBeenCalledTimes(1);
  });
});

describe('subsections (:6146-6185)', () => {
  it('offers all three subsections on hyperliquid and only normal elsewhere', async () => {
    const { store, api } = makeHarness();
    await store.loadSettings('hyperliquid');
    expect(store.availableSubsections.value).toEqual(['normal', 'aws', 'tradfi']);
    api.fetchJson.mockResolvedValueOnce(bybitPayload());
    await store.loadSettings('bybit');
    expect(store.availableSubsections.value).toEqual(['normal']);
  });

  it('resolves a stored subsection that is unavailable back to normal (:6152-6155)', async () => {
    const storage = makeStorage();
    storage.setItem('market_data_fastapi_settings_subsection', 'aws');
    const api = { fetchJson: vi.fn(async () => bybitPayload()) };
    const store = useSettings({
      api: api as unknown as SettingsApi,
      storage,
      t: T,
      showToast: () => undefined,
    });
    await store.loadSettings('bybit');
    expect(store.activeSubsection.value).toBe('aws');
    expect(store.resolvedSubsection.value).toBe('normal');
  });

  it('restores the persisted subsection at creation (:3819, unknown → normal)', async () => {
    const storage = makeStorage();
    storage.setItem('market_data_fastapi_settings_subsection', 'tradfi');
    const store = useSettings({
      api: { fetchJson: vi.fn(async () => hyperliquidPayload()) } as unknown as SettingsApi,
      storage,
      t: T,
      showToast: () => undefined,
    });
    expect(store.activeSubsection.value).toBe('tradfi');

    const fresh = useSettings({
      api: { fetchJson: vi.fn(async () => hyperliquidPayload()) } as unknown as SettingsApi,
      storage: makeStorage(),
      t: T,
      showToast: () => undefined,
    });
    expect(fresh.activeSubsection.value).toBe('normal');
  });

  it('persists subsection changes (:6177-6181)', async () => {
    const { store, storage } = makeHarness();
    store.setActiveSubsection('aws');
    expect(storage.getItem('market_data_fastapi_settings_subsection')).toBe('aws');
    expect(store.resolvedSubsection.value).toBe('aws');
  });
});

describe('coin picker state (:7015-7133)', () => {
  it('filters visible coins case-insensitively and keeps order stable until the next render (:7021-7026)', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.setCoinFilter('eth');
    expect(store.renderedCoins.value).toEqual(['ETH']);
    store.setCoinFilter('sol');
    expect(store.renderedCoins.value).toEqual(['SOL']);
    store.setCoinFilter('');
    expect(store.renderedCoins.value).toEqual(['BTC', 'ETH', 'SOL']);
  });

  it('re-sorts selected coins first on render (:7042-7047)', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.setCoinSelected('SOL', true);
    store.renderCoinOptions();
    expect(store.renderedCoins.value).toEqual(['BTC', 'ETH', 'SOL']);
    store.setCoinSelected('BTC', false);
    store.setCoinSelected('ETH', false);
    store.renderCoinOptions();
    expect(store.renderedCoins.value).toEqual(['SOL', 'BTC', 'ETH']);
  });

  it('prunes selected coins that left coin_options on render (:7037-7041)', async () => {
    const { store, api } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.setCoinSelected('GONE', true);
    api.fetchJson.mockResolvedValueOnce(hyperliquidPayload());
    await store.loadSettings('hyperliquid');
    expect(store.isCoinSelected('GONE')).toBe(false);
  });

  it('select-visible unions the currently visible (filtered) coins (:9672-9679)', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.setCoinFilter('sol');
    store.selectVisibleCoins();
    expect(store.isCoinSelected('SOL')).toBe(true);
    expect(store.isCoinSelected('BTC')).toBe(true); // pre-existing selection kept
    expect(store.isCoinSelected('ETH')).toBe(true);
  });

  it('clear-all empties the selection (:9680-9685)', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.clearAllCoins();
    expect(store.selectedCoins.value.size).toBe(0);
    expect(store.renderedCoins.value).toEqual(['BTC', 'ETH', 'SOL']); // order re-sorted, none selected
  });

  it('auto-enable expands the selection to every coin and locks the picker (:7035-7036, :9631-9635)', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.setAutoEnableNewCoins(true);
    expect([...store.selectedCoins.value].sort()).toEqual(['BTC', 'ETH', 'SOL']);
    expect(store.isCoinSelected('SOL')).toBe(true);
    // buttons/rows disable
    expect(store.autoEnableNewCoins.value).toBe(true);
  });

  it('collect expands to all coins while auto-enable is on (:8901-8902)', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.clearAllCoins();
    store.setAutoEnableNewCoins(true);
    expect(store.collectRequest().enabled_coins).toEqual(['BTC', 'ETH', 'SOL']);
    expect(store.collectRequest().auto_enable_new_coins).toBe(true);
  });

  it('setCoinSelected is a no-op for empty coins (:7120-7121 guard)', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.setCoinSelected('', true);
    expect(store.selectedCoins.value.size).toBe(2);
  });
});

describe('dirty tracking end-to-end (:5535-5549, :9614-9635)', () => {
  it('field edits mark the form dirty and reverting marks it clean', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    expect(store.isDirty.value).toBe(false);
    store.fields.intervalSeconds = '2700';
    await flush();
    expect(store.isDirty.value).toBe(true);
    store.fields.intervalSeconds = '1800';
    await flush();
    expect(store.isDirty.value).toBe(false);
  });

  it('coin toggles and auto-enable flips mark the form dirty', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.setCoinSelected('SOL', true);
    expect(store.isDirty.value).toBe(true);
    store.setCoinSelected('SOL', false);
    expect(store.isDirty.value).toBe(false);
    store.setAutoEnableNewCoins(true);
    expect(store.isDirty.value).toBe(true);
  });

  it('the coin filter never dirties the form (:9617, :9623)', async () => {
    const { store } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.setCoinFilter('btc');
    expect(store.isDirty.value).toBe(false);
  });

  it('AWS field edits dirty the form on hyperliquid only (:8916)', async () => {
    const { store, api } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.fields.awsRegion = 'ap-south-1';
    expect(store.isDirty.value).toBe(true);
    store.fields.awsRegion = 'us-east-1';
    expect(store.isDirty.value).toBe(false);

    api.fetchJson.mockResolvedValueOnce(bybitPayload());
    await store.loadSettings('bybit');
    store.fields.awsRegion = 'ap-south-1'; // not collected for bybit
    expect(store.isDirty.value).toBe(false);
  });
});

describe('saveSettings (:8930-8947)', () => {
  it('POSTs the collected request to /settings/{exchange}', async () => {
    const { store, api } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.fields.intervalSeconds = '2700';
    await store.saveSettings();
    const [path, init] = api.fetchJson.mock.calls[api.fetchJson.mock.calls.length - 1] as [
      string,
      RequestInit | undefined,
    ];
    expect(path).toBe('/settings/hyperliquid');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(store.collectRequest());
  });

  it('applies the returned payload, re-baselines and toasts the server message (:8939-8943)', async () => {
    const { store, api, toasts } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.fields.intervalSeconds = '2700';
    expect(store.isDirty.value).toBe(true);
    api.fetchJson.mockResolvedValueOnce({
      success: true,
      message: 'Hyperliquid settings saved.',
      settings: hyperliquidPayload({ settings: { ...hyperliquidPayload().settings!, interval_seconds: 2700 } }),
    });
    await store.saveSettings();
    expect(store.fields.intervalSeconds).toBe('2700');
    expect(store.isDirty.value).toBe(false);
    expect(toasts).toEqual([['Hyperliquid settings saved.', 'success']]);
  });

  it('falls back to the settingsSaved toast without a message (:8943)', async () => {
    const { store, api, toasts } = makeHarness();
    await store.loadSettings('hyperliquid');
    api.fetchJson.mockResolvedValueOnce({ success: true, settings: hyperliquidPayload() });
    await store.saveSettings();
    expect(toasts).toEqual([['market.settingsSaved', 'success']]);
  });

  it('throws-to-toast path surfaces result.error (:8936-8937)', async () => {
    const { store, api, toasts } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.fields.intervalSeconds = '2700';
    expect(store.isDirty.value).toBe(true);
    api.fetchJson.mockResolvedValueOnce({ success: false, error: 'Rejected by server' });
    await store.saveSettings();
    expect(toasts).toEqual([['Rejected by server', 'error']]);
    expect(store.isDirty.value).toBe(true); // still dirty — nothing re-baselined
  });

  it('toasts serverMsg-mapped transport errors (:8944-8946)', async () => {
    const { store, api, toasts } = makeHarness();
    await store.loadSettings('hyperliquid');
    api.fetchJson.mockRejectedValueOnce(new Error('HTTP 503'));
    await store.saveSettings();
    expect(toasts).toEqual([['HTTP 503', 'error']]);
  });

  it('reseeds the selection from the saved payload (:8940)', async () => {
    const { store, api } = makeHarness();
    await store.loadSettings('hyperliquid');
    store.clearAllCoins();
    api.fetchJson.mockResolvedValueOnce({
      success: true,
      message: 'ok',
      settings: hyperliquidPayload({ enabled_coins: ['BTC', 'ETH', 'SOL'] }),
    });
    await store.saveSettings();
    expect([...store.selectedCoins.value].sort()).toEqual(['BTC', 'ETH', 'SOL']);
  });
});
