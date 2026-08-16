import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useTiingo, type TiingoApi } from './useTiingo';
import { toTiingoUsageModel } from '../lib/tiingoUsage';

/* The Tiingo vault flows — legacy market_data_main.html:
   clearTiingoRevealedToken :5587-5596, toggleTiingoTokenVisible :5598-5640,
   renderTiingoUsage :5676-5723 (via lib/tiingoUsage), isTiingoConfigured
   :5725-5727, testTiingo :8949-8968, saveTiingoToken :8970-9030 and the
   settings-payload tail :7379-7396. */

const T = (key: string): string => key;

interface ToastCapture {
  messages: { message: string; level: string }[];
  showToast: (message: unknown, level?: string) => void;
}

function toastCapture(): ToastCapture {
  const messages: { message: string; level: string }[] = [];
  return {
    messages,
    showToast: (message, level = 'info') => messages.push({ message: String(message), level }),
  };
}

interface ApiMock {
  api: TiingoApi;
  fetchJson: ReturnType<typeof vi.fn>;
  fetchApiKeysJson: ReturnType<typeof vi.fn>;
}

function apiMock(): ApiMock {
  const fetchJson = vi.fn(async () => ({}) as Record<string, unknown>);
  const fetchApiKeysJson = vi.fn(async () => ({}) as Record<string, unknown>);
  return {
    api: {
      fetchJson: fetchJson as unknown as TiingoApi['fetchJson'],
      fetchApiKeysJson: fetchApiKeysJson as unknown as TiingoApi['fetchApiKeysJson'],
    },
    fetchJson,
    fetchApiKeysJson,
  };
}

function makeTiingo(api: ApiMock, reloadSettings: ReturnType<typeof vi.fn> = vi.fn(async () => {})) {
  const toasts = toastCapture();
  const tiingo = useTiingo({
    api: api.api,
    t: T,
    showToast: toasts.showToast,
    reloadSettings,
  });
  return { tiingo, toasts, reloadSettings };
}

describe('clearTiingoRevealedToken (:5587-5596)', () => {
  it('wipes a revealed value and remasks', async () => {
    const { tiingo } = makeTiingo(apiMock());
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await nextTick();
    tiingo.tokenValue.value = 'SECRET';
    tiingo.isRevealed.value = true;
    tiingo.visible.value = true;
    tiingo.clearRevealedToken();
    expect(tiingo.tokenValue.value).toBe('');
    expect(tiingo.isRevealed.value).toBe(false);
    expect(tiingo.visible.value).toBe(false);
  });

  it('keeps a locally typed (un-revealed) value, only remasking (:5591)', () => {
    const { tiingo } = makeTiingo(apiMock());
    tiingo.tokenValue.value = 'typed-by-user';
    tiingo.visible.value = true;
    tiingo.clearRevealedToken();
    expect(tiingo.tokenValue.value).toBe('typed-by-user');
    expect(tiingo.visible.value).toBe(false);
  });

  it('is safe to call with nothing revealed', () => {
    const { tiingo } = makeTiingo(apiMock());
    expect(() => tiingo.clearRevealedToken()).not.toThrow();
    expect(tiingo.visible.value).toBe(false);
  });
});

describe('toggleTiingoTokenVisible (:5598-5640)', () => {
  it('hides a revealed value by clearing it (:5601-5603)', async () => {
    const { tiingo } = makeTiingo(apiMock());
    tiingo.tokenValue.value = 'SECRET';
    tiingo.isRevealed.value = true;
    tiingo.visible.value = true;
    await tiingo.toggleVisible();
    expect(tiingo.tokenValue.value).toBe('');
    expect(tiingo.visible.value).toBe(false);
    expect(tiingo.revealLoading.value).toBe(false);
  });

  it('only masks a locally typed value (:5604-5607)', async () => {
    const { tiingo } = makeTiingo(apiMock());
    tiingo.tokenValue.value = 'typed';
    tiingo.visible.value = true;
    await tiingo.toggleVisible();
    expect(tiingo.tokenValue.value).toBe('typed');
    expect(tiingo.visible.value).toBe(false);
  });

  it('unmasks a locally typed value without any fetch (:5610-5613)', async () => {
    const api = apiMock();
    const { tiingo } = makeTiingo(api);
    tiingo.tokenValue.value = 'typed';
    await tiingo.toggleVisible();
    expect(tiingo.visible.value).toBe(true);
    expect(tiingo.isRevealed.value).toBe(false);
    expect(api.fetchApiKeysJson).not.toHaveBeenCalled();
  });

  it('warns when no stored token exists (:5615-5618)', async () => {
    const api = apiMock();
    const { tiingo, toasts } = makeTiingo(api);
    await tiingo.toggleVisible();
    expect(toasts.messages).toEqual([
      { message: 'market.noStoredTiingoToken', level: 'warning' },
    ]);
    expect(api.fetchApiKeysJson).not.toHaveBeenCalled();
  });

  it('reveals the stored token through the vault (:5620-5633)', async () => {
    const api = apiMock();
    api.fetchApiKeysJson.mockResolvedValueOnce({ value: 'vault-token' });
    const { tiingo } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await nextTick();
    const pending = tiingo.toggleVisible();
    expect(tiingo.revealLoading.value).toBe(true); // :5622 button disabled
    await pending;
    expect(api.fetchApiKeysJson).toHaveBeenCalledWith('/tradfi/reveal', {
      method: 'POST',
      body: JSON.stringify({ profile_id: 'p1' }),
    });
    expect(tiingo.tokenValue.value).toBe('vault-token');
    expect(tiingo.isRevealed.value).toBe(true);
    expect(tiingo.visible.value).toBe(true);
    expect(tiingo.revealLoading.value).toBe(false);
  });

  it('treats an empty vault value as empty string (:5630 String(result.value || ""))', async () => {
    const api = apiMock();
    api.fetchApiKeysJson.mockResolvedValueOnce({ value: null });
    const { tiingo } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await nextTick();
    await tiingo.toggleVisible();
    expect(tiingo.tokenValue.value).toBe('');
    expect(tiingo.isRevealed.value).toBe(true);
  });

  it('drops the reveal when the generation moves on (:5628-5629)', async () => {
    const api = apiMock();
    let release: (value: unknown) => void = () => undefined;
    api.fetchApiKeysJson.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    const { tiingo } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await nextTick();
    const pending = tiingo.toggleVisible();
    tiingo.clearRevealedToken(); // 401-style invalidation mid-flight
    release({ value: 'stale-token' });
    await pending;
    expect(tiingo.tokenValue.value).toBe('');
    expect(tiingo.isRevealed.value).toBe(false);
    expect(tiingo.revealLoading.value).toBe(false);
  });

  it('drops the reveal when the profile changes mid-flight (:5629)', async () => {
    const api = apiMock();
    let release: (value: unknown) => void = () => undefined;
    api.fetchApiKeysJson.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    const { tiingo } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await nextTick();
    const pending = tiingo.toggleVisible();
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p2' });
    release({ value: 'other-profile-token' });
    await pending;
    expect(tiingo.tokenValue.value).toBe('');
    expect(tiingo.isRevealed.value).toBe(false);
  });

  it('toasts the server message on reveal failure (:5634-5636)', async () => {
    const api = apiMock();
    api.fetchApiKeysJson.mockRejectedValueOnce(new Error('vault exploded'));
    const { tiingo, toasts } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await nextTick();
    await tiingo.toggleVisible();
    expect(toasts.messages).toEqual([{ message: 'vault exploded', level: 'error' }]);
    expect(tiingo.isRevealed.value).toBe(false);
    expect(tiingo.revealLoading.value).toBe(false);
  });

  it('falls back to the generic reveal-failed message (:5636)', async () => {
    const api = apiMock();
    api.fetchApiKeysJson.mockRejectedValueOnce(new Error(''));
    const { tiingo, toasts } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await nextTick();
    await tiingo.toggleVisible();
    expect(toasts.messages).toEqual([{ message: 'market.failedRevealTiingo', level: 'error' }]);
  });

  it('stays silent when a stale request fails (:5635)', async () => {
    const api = apiMock();
    let reject: (error: Error) => void = () => undefined;
    api.fetchApiKeysJson.mockImplementationOnce(
      () => new Promise((_resolve, rej) => (reject = rej))
    );
    const { tiingo, toasts } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await nextTick();
    const pending = tiingo.toggleVisible();
    tiingo.clearRevealedToken();
    reject(new Error('late failure'));
    await pending;
    expect(toasts.messages).toEqual([]);
  });
});

describe('applySettingsPayload (:7379-7396)', () => {
  it('clears the revealed token and applies the vault state', async () => {
    const { tiingo } = makeTiingo(apiMock());
    tiingo.tokenValue.value = 'leftover';
    tiingo.isRevealed.value = true;
    tiingo.visible.value = true;
    tiingo.applySettingsPayload({
      tiingo_configured: true,
      tiingo_profile_id: 'p9',
      tiingo_usage: { hour_requests: 3 },
    });
    expect(tiingo.tokenValue.value).toBe('');
    expect(tiingo.isRevealed.value).toBe(false);
    expect(tiingo.visible.value).toBe(false);
    expect(tiingo.configured.value).toBe(true);
    expect(tiingo.profileId.value).toBe('p9');
    expect(tiingo.usage.value).toEqual({ hour_requests: 3 });
    expect(tiingo.usageConfigured.value).toBe(true);
  });

  it('normalizes a missing usage object to empty (:7396 `|| {}`)', () => {
    const { tiingo } = makeTiingo(apiMock());
    tiingo.applySettingsPayload({ tiingo_configured: false });
    expect(tiingo.usage.value).toEqual({});
    expect(tiingo.configured.value).toBe(false);
    expect(tiingo.profileId.value).toBe('');
    expect(tiingo.usageConfigured.value).toBe(false);
  });
});

describe('saveTiingoToken (:8970-9030)', () => {
  const PROFILES = {
    profiles: [
      { id: 'other', provider: 'tiingo', active: false, pending: false, label: 'Other' },
      { id: 'p1', provider: 'tiingo', active: true, pending: false, label: 'Primary', shared: false },
      { id: 'stale', provider: 'tiingo', active: true, pending: false, label: 'Stale' },
    ],
  };

  it('refuses to save while a revealed token is showing (:8973-8976)', async () => {
    const api = apiMock();
    const { tiingo, toasts } = makeTiingo(api);
    tiingo.isRevealed.value = true;
    await tiingo.saveToken();
    expect(toasts.messages).toEqual([
      { message: 'market.hideRevealedToken', level: 'warning' },
    ]);
    expect(api.fetchApiKeysJson).not.toHaveBeenCalled();
  });

  it('refuses an empty token (:8977-8981)', async () => {
    const api = apiMock();
    const { tiingo, toasts } = makeTiingo(api);
    await tiingo.saveToken();
    expect(toasts.messages).toEqual([{ message: 'market.enterNewTiingoToken', level: 'error' }]);
    expect(api.fetchApiKeysJson).not.toHaveBeenCalled();
  });

  it('prefers the current profile id, then active, then any tiingo profile (:8990-8997)', async () => {
    const api = apiMock();
    api.fetchApiKeysJson
      .mockResolvedValueOnce(PROFILES)
      .mockResolvedValueOnce({ profile: { id: 'p1', has_api_key: true }, status: 'ok' });
    const reload = vi.fn(async () => {});
    const { tiingo } = makeTiingo(api, reload);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    tiingo.tokenValue.value = 'new-token';
    await tiingo.saveToken();
    const configCall = api.fetchApiKeysJson.mock.calls[1];
    expect(configCall?.[0]).toBe('/tradfi/config');
    expect(JSON.parse(String(configCall?.[1]?.body))).toEqual({
      profile_id: 'p1',
      provider: 'tiingo',
      label: 'Primary',
      active: true,
      shared: false,
      api_key: 'new-token',
      create_new: false,
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('falls back to the first active non-pending profile when the id misses (:8993-8994)', async () => {
    const api = apiMock();
    api.fetchApiKeysJson
      .mockResolvedValueOnce(PROFILES)
      .mockResolvedValueOnce({ profile: { id: 'p1', has_api_key: true }, status: 'ok' });
    const { tiingo } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'gone' });
    tiingo.tokenValue.value = 'tok';
    await tiingo.saveToken();
    const body = JSON.parse(String(api.fetchApiKeysJson.mock.calls[1]?.[1]?.body));
    expect(body.profile_id).toBe('p1'); // first active && !pending in array order
    expect(body.create_new).toBe(false);
  });

  it('creates a fresh shared profile when none matches (:8998-9008)', async () => {
    const api = apiMock();
    api.fetchApiKeysJson
      .mockResolvedValueOnce({ profiles: [] })
      .mockResolvedValueOnce({ profile: { id: 'new', has_api_key: true }, status: 'ok' });
    const { tiingo, toasts } = makeTiingo(api);
    tiingo.tokenValue.value = 'tok';
    await tiingo.saveToken();
    const body = JSON.parse(String(api.fetchApiKeysJson.mock.calls[1]?.[1]?.body));
    expect(body).toEqual({
      profile_id: null,
      provider: 'tiingo',
      label: 'market.marketDataTiingo',
      active: true,
      shared: true,
      api_key: 'tok',
      create_new: true,
    });
    expect(toasts.messages).toEqual([{ message: 'market.tiingoSaved', level: 'success' }]);
  });

  it('applies the saved profile state and reloads settings (:9011-9013)', async () => {
    const api = apiMock();
    api.fetchApiKeysJson
      .mockResolvedValueOnce(PROFILES)
      .mockResolvedValueOnce({ profile: { id: 'p1', has_api_key: true }, status: 'ok' });
    const reload = vi.fn(async () => {});
    const { tiingo } = makeTiingo(api, reload);
    tiingo.tokenValue.value = 'tok';
    await tiingo.saveToken();
    expect(tiingo.configured.value).toBe(true);
    expect(tiingo.profileId.value).toBe('p1');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(tiingo.tokenValue.value).toBe(''); // :9023 finally clears
    expect(tiingo.saveLoading.value).toBe(false);
    expect(tiingo.inputDisabled.value).toBe(false);
  });

  it('toasts the pending variant when the vault reports pending (:9014-9019)', async () => {
    const api = apiMock();
    api.fetchApiKeysJson
      .mockResolvedValueOnce({ profiles: [] })
      .mockResolvedValueOnce({ profile: { id: 'x', has_api_key: false }, status: 'pending' });
    const { tiingo, toasts } = makeTiingo(api);
    tiingo.tokenValue.value = 'tok';
    await tiingo.saveToken();
    expect(toasts.messages).toEqual([{ message: 'market.tiingoPending', level: 'warning' }]);
  });

  it('toasts the save failure (:9020-9021)', async () => {
    const api = apiMock();
    api.fetchApiKeysJson.mockRejectedValueOnce(new Error('vault down'));
    const { tiingo, toasts } = makeTiingo(api);
    tiingo.tokenValue.value = 'tok';
    await tiingo.saveToken();
    expect(toasts.messages).toEqual([{ message: 'vault down', level: 'error' }]);
    expect(tiingo.tokenValue.value).toBe(''); // finally still clears the dead token
    expect(tiingo.saveLoading.value).toBe(false);
  });

  it('keeps the input disabled while a newer save generation owns it (:9025-9028)', async () => {
    const api = apiMock();
    let release: (value: unknown) => void = () => undefined;
    api.fetchApiKeysJson.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    const { tiingo } = makeTiingo(api);
    tiingo.tokenValue.value = 'first';
    const pending = tiingo.saveToken();
    expect(tiingo.inputDisabled.value).toBe(true);
    release({ profiles: [] });
    await pending;
    expect(tiingo.inputDisabled.value).toBe(false);
  });
});

describe('testTiingo (:8949-8968)', () => {
  it('refuses when not configured (:8950-8953)', async () => {
    const api = apiMock();
    const { tiingo, toasts } = makeTiingo(api);
    await tiingo.test();
    expect(toasts.messages).toEqual([{ message: 'market.noTiingoProfile', level: 'error' }]);
    expect(api.fetchJson).not.toHaveBeenCalled();
  });

  it('probes AAPL and renders the fresh usage (:8955-8964)', async () => {
    const api = apiMock();
    api.fetchJson.mockResolvedValueOnce({
      success: true,
      message: 'Tiingo connection OK.',
      usage: { hour_requests: 5, hour_limit: 10 },
    });
    const { tiingo, toasts } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await tiingo.test();
    expect(api.fetchJson).toHaveBeenCalledWith('/settings/hyperliquid/tiingo-probe', {
      method: 'POST',
      body: JSON.stringify({ ticker: 'AAPL' }),
    });
    expect(tiingo.usage.value).toEqual({ hour_requests: 5, hour_limit: 10 });
    expect(tiingo.usageConfigured.value).toBe(true); // renderTiingoUsage(usage, true)
    expect(toasts.messages).toEqual([{ message: 'Tiingo connection OK.', level: 'success' }]);
  });

  it('toasts the probe failure (:8965-8967)', async () => {
    const api = apiMock();
    api.fetchJson.mockResolvedValueOnce({ success: false, error: 'No key.' });
    const { tiingo, toasts } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await tiingo.test();
    expect(toasts.messages).toEqual([{ message: 'No key.', level: 'error' }]);
  });

  it('falls back to the generic failure message (:8961/8966)', async () => {
    const api = apiMock();
    api.fetchJson.mockRejectedValueOnce(new Error(''));
    const { tiingo, toasts } = makeTiingo(api);
    tiingo.applySettingsPayload({ tiingo_configured: true, tiingo_profile_id: 'p1' });
    await tiingo.test();
    expect(toasts.messages).toEqual([{ message: 'market.tiingoTestFailed', level: 'error' }]);
  });
});

describe('toTiingoUsageModel (renderTiingoUsage math :5683-5695)', () => {
  it('normalizes the counters with Number(x || 0)', () => {
    const model = toTiingoUsageModel({
      hour_requests: 30,
      hour_limit: 60,
      hour_remaining: 30,
      day_requests: '5',
      day_limit: 0,
      month_bytes: 1536,
      month_bytes_limit: 1024,
      month_bytes_remaining: null,
    });
    expect(model.hour).toEqual({ used: 30, limit: 60, remaining: 30, ratio: 0.5 });
    expect(model.day.used).toBe(5);
    expect(model.day.ratio).toBe(0); // limit 0 → ratio 0 (:5694)
    expect(model.month.usedText).toBe('1.5 KB');
    expect(model.month.limitText).toBe('1.0 KB');
    expect(model.month.remainingText).toBe('0 B');
    expect(model.month.ratio).toBe(1); // clamped to 1 (:5695)
  });

  it('clamps ratios into [0, 1] (:5693-5695)', () => {
    const model = toTiingoUsageModel({ hour_requests: -50, hour_limit: 10 });
    expect(model.hour.ratio).toBe(0);
  });

  it('flags the 429 wait (:5692, :5696-5700)', () => {
    const model = toTiingoUsageModel({ server_429_wait_remaining_s: 90 });
    expect(model.waitRemainingSeconds).toBe(90);
    expect(model.isExceeded).toBe(true);
    expect(toTiingoUsageModel({}).isExceeded).toBe(false);
  });
});
