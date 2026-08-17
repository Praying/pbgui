import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from './useSettings';
import type { BacktestSettings } from '../types';

/*
 * Backtest settings store — loadSettings single-flight (:1467-1476),
 * saveSettingsFromModal POST body (:1587-1619), cleanHlcvsNow
 * (:1621-1642) and the modal cpu_max fallback (:1483-1486).
 */

const API = 'http://h:8000/api/backtest-v7';
const fetchMock = vi.fn();

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function err(status: number, detail: string): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify({ detail }), { status }));
}

type FetchCall = Parameters<typeof fetchMock>;
function requestOf(call: FetchCall[number]): RequestInit {
  return (call as FetchCall[0])?.[1] as RequestInit;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock.mockReset().mockImplementation(() => ok({})));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadSettings (:1467-1476)', () => {
  it('GETs /settings and replaces the whole settings object', async () => {
    fetchMock.mockImplementationOnce(() =>
      ok({ autostart: true, cpu: 4, cpu_max: 8, hlcvs_cleanup_days: 30, extra_server_field: 'x' })
    );
    const store = useSettings({ apiBase: API });
    const settings = await store.loadSettings();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(API + '/settings');
    expect(settings.autostart).toBe(true);
    expect(settings.cpu).toBe(4);
    expect(settings.hlcvs_cleanup_days).toBe(30);
  });

  it('single-flights concurrent loads (:1468)', async () => {
    fetchMock.mockImplementationOnce(() => ok({ cpu: 3 }));
    const store = useSettings({ apiBase: API });
    const [a, b] = await Promise.all([store.loadSettings(), store.loadSettings()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('a failed load clears the flight so a retry can run (:1473-1475)', async () => {
    fetchMock.mockImplementationOnce(() => err(500, 'boom')).mockImplementationOnce(() => ok({ cpu: 2 }));
    const store = useSettings({ apiBase: API });
    await expect(store.loadSettings()).rejects.toThrow('boom');
    await expect(store.loadSettings()).resolves.toMatchObject({ cpu: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps defaults while never loaded (:1046)', () => {
    const store = useSettings({ apiBase: API });
    expect(store.settings.value).toEqual({
      autostart: false,
      cpu: 1,
      cpu_max: null,
      hsl_signal_modes: [],
      exchange_options: [],
      use_pbgui_market_data: false,
      hlcvs_cleanup_enabled: false,
      hlcvs_cleanup_days: 7,
      hlcvs_cleanup_interval_h: 24,
    } satisfies BacktestSettings);
  });
});

describe('applyWs (:1296-1303 merge target)', () => {
  it('merges a WS settings push immutably', () => {
    const store = useSettings({ apiBase: API });
    store.applyWs({ cpu: 5 });
    expect(store.settings.value.cpu).toBe(5);
    expect(store.settings.value.autostart).toBe(false);
  });
});

describe('saveSettings (:1587-1619)', () => {
  it('POSTs the six modal fields', async () => {
    fetchMock.mockImplementationOnce(() => ok({}));
    const store = useSettings({ apiBase: API });
    const saved = await store.saveSettings({
      cpu: 3,
      autostart: true,
      use_pbgui_market_data: true,
      hlcvs_cleanup_enabled: true,
      hlcvs_cleanup_days: 14,
      hlcvs_cleanup_interval_h: 12,
    });
    expect(saved).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(API + '/settings');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(requestOf(fetchMock.mock.calls[0])?.body))).toEqual({
      cpu: 3,
      autostart: true,
      use_pbgui_market_data: true,
      hlcvs_cleanup_enabled: true,
      hlcvs_cleanup_days: 14,
      hlcvs_cleanup_interval_h: 12,
    });
    expect(store.settings.value.cpu).toBe(3);
  });

  it('a failed save returns false and keeps local state untouched', async () => {
    fetchMock.mockImplementationOnce(() => err(422, 'bad'));
    const store = useSettings({ apiBase: API });
    const saved = await store.saveSettings({ cpu: 9, autostart: false, use_pbgui_market_data: false, hlcvs_cleanup_enabled: false, hlcvs_cleanup_days: 7, hlcvs_cleanup_interval_h: 24 });
    expect(saved).toBe(false);
    expect(store.settings.value.cpu).toBe(1);
  });
});

describe('cleanHlcvsNow (:1621-1642)', () => {
  it('POSTs the retention days and reports the cleanup summary', async () => {
    fetchMock.mockImplementationOnce(() =>
      ok({ removed: 12, freed_mb: 340, errors: 0, skipped_locked: 0, targets: [{ label: 'PB7' }, { label: 'PB8' }, { label: '' }] })
    );
    const store = useSettings({ apiBase: API });
    const result = await store.cleanHlcvsNow(7);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(API + '/settings/hlcvs-cleanup-now');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ days: 7 });
    expect(result).toMatchObject({ removed: 12, freed_mb: 340, targetLabels: ['PB7', 'PB8'] });
  });

  it('defaults the days to 7 when unset (:1622)', async () => {
    fetchMock.mockImplementationOnce(() => ok({ removed: 0 }));
    const store = useSettings({ apiBase: API });
    await store.cleanHlcvsNow(NaN);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ days: 7 });
  });

  it('surfaces API errors', async () => {
    fetchMock.mockImplementationOnce(() => err(500, 'nope'));
    const store = useSettings({ apiBase: API });
    await expect(store.cleanHlcvsNow(7)).rejects.toThrow('nope');
  });
});

describe('effectiveCpuMax (:1483-1486)', () => {
  it('uses settings.cpu_max when valid', () => {
    const store = useSettings({ apiBase: API });
    store.settings.value.cpu_max = 16;
    store.settings.value.cpu = 4;
    expect(store.effectiveCpuMax()).toBe(16);
  });

  it('falls back to hardwareConcurrency, then cpu, then 1 (:1484-1486)', () => {
    const store = useSettings({ apiBase: API, hardwareConcurrency: 12 });
    expect(store.effectiveCpuMax()).toBe(12);
    const noHw = useSettings({ apiBase: API, hardwareConcurrency: undefined });
    expect(noHw.effectiveCpuMax()).toBe(1);
  });

  it('an invalid cpu_max (< 1 or NaN) is ignored', () => {
    const store = useSettings({ apiBase: API, hardwareConcurrency: 8 });
    store.settings.value.cpu_max = 0;
    expect(store.effectiveCpuMax()).toBe(8);
    store.settings.value.cpu_max = Number.NaN;
    expect(store.effectiveCpuMax()).toBe(8);
  });
});
