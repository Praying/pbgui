import { ref, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import type { TiingoUsage } from '../lib/tiingoUsage';
import type { ToastLevel } from '../types';

/*
 * The Tiingo vault controller — legacy market_data_main.html:
 *
 *   clearTiingoRevealedToken :5587-5596  wipe a revealed token + remask
 *   toggleTiingoTokenVisible :5598-5640  the eye flow (mask/unmask/reveal
 *                                        with generation + profile guards)
 *   isTiingoConfigured      :5725-5727
 *   testTiingo              :8949-8968   POST tiingo-probe → usage rerender
 *   saveTiingoToken         :8970-9030   profiles → PUT config → reload
 *   settings payload tail   :7379-7396   applied via applySettingsPayload
 *                                        (useSettings.onHyperliquidPayload)
 *
 * The legacy 401 side effect of fetchApiKeysJson (:4924) is wired by App.vue:
 * useApi({onUnauthorized}) receives clearRevealedToken, and the pagehide
 * clear (:9734) is registered there as well.
 */

/** The fetch helpers this controller needs (useApi slices). */
export interface TiingoApi {
  fetchJson<T>(path: string, init?: RequestInit): Promise<T>;
  fetchApiKeysJson<T>(path: string, init?: RequestInit): Promise<T>;
}

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;
export type ShowToastFn = (message: unknown, level?: ToastLevel) => void;

export interface UseTiingoOptions {
  api: TiingoApi;
  t: TranslateFn;
  showToast: ShowToastFn;
  /**
   * Legacy loadSettings('hyperliquid', {keepFeedback:true}) (:9013) — the flag
   * was void-ed inside loadSettings (:8882-8884), so the port takes a plain
   * callback and the M-data-2/3 store types the flag as literal false.
   */
  reloadSettings(): Promise<void>;
}

/** PUT /tradfi/config result.profile slice. */
interface VaultProfileResult {
  profile?: { id?: unknown; has_api_key?: unknown } | null;
  status?: unknown;
}

/** GET /tradfi/profiles entry slice. */
interface VaultProfile {
  id?: unknown;
  provider?: unknown;
  active?: unknown;
  pending?: unknown;
  label?: unknown;
  shared?: unknown;
}

/** settings.tiingo_* slice of the settings payload (:7380-7396). */
export interface TiingoSettingsSlice {
  tiingo_configured?: unknown;
  tiingo_profile_id?: unknown;
  tiingo_usage?: unknown;
  /** The full settings object passes through (weak-type escape). */
  [key: string]: unknown;
}

export interface UseTiingo {
  /** The token input value (typed or revealed). */
  tokenValue: Ref<string>;
  /** dataset.revealed (:5591-5592, :5631) — value came from the vault. */
  isRevealed: Ref<boolean>;
  /** input.type text/password (:5611, :5593). */
  visible: Ref<boolean>;
  /** Eye button disabled while a reveal is in flight (:5622). */
  revealLoading: Ref<boolean>;
  /** Save button disabled (:8985). */
  saveLoading: Ref<boolean>;
  /** Token input disabled during a save (:8986). */
  inputDisabled: Ref<boolean>;
  /** settingsState.tiingoConfigured (:3710). */
  configured: Ref<boolean>;
  /** settingsState.tiingoProfileId (:3711). */
  profileId: Ref<string>;
  /** Last rendered usage payload (settings.tiingo_usage or probe result). */
  usage: Ref<TiingoUsage>;
  /** renderTiingoUsage's `configured` argument (:5396/:8963). */
  usageConfigured: Ref<boolean>;

  isTiingoConfigured(): boolean;
  clearRevealedToken(): void;
  toggleVisible(): Promise<void>;
  applySettingsPayload(settings: TiingoSettingsSlice): void;
  saveToken(): Promise<void>;
  test(): Promise<void>;
}

export function useTiingo(options: UseTiingoOptions): UseTiingo {
  const { api, t, showToast } = options;

  const tokenValue = ref('');
  const isRevealed = ref(false);
  const visible = ref(false);
  const revealLoading = ref(false);
  const saveLoading = ref(false);
  const inputDisabled = ref(false);
  const configured = ref(false);
  const profileId = ref('');
  const usage = ref<TiingoUsage>({});
  const usageConfigured = ref(false);

  /* tiingoSaveGeneration/tiingoRevealGeneration (:3712-3713) */
  let saveGeneration = 0;
  let revealGeneration = 0;

  function isTiingoConfigured(): boolean {
    return Boolean(configured.value); // :5725-5727
  }

  /** Legacy clearTiingoRevealedToken (:5587-5596). */
  function clearRevealedToken(): void {
    revealGeneration += 1;
    if (isRevealed.value) tokenValue.value = ''; // :5591
    isRevealed.value = false;
    visible.value = false; // :5593 type=password + eye reset
  }

  /** Legacy toggleTiingoTokenVisible (:5598-5640). */
  async function toggleVisible(): Promise<void> {
    if (visible.value) {
      if (isRevealed.value) {
        clearRevealedToken(); // :5602-5603
      } else {
        visible.value = false; // :5605-5606 mask a locally typed value
      }
      return;
    }
    if (tokenValue.value) {
      visible.value = true; // :5610-5613 unmask the typed value, no fetch
      return;
    }
    if (!isTiingoConfigured() || !profileId.value) {
      showToast(t('market.noStoredTiingoToken'), 'warning'); // :5616
      return;
    }

    const profileIdAtStart = profileId.value;
    revealGeneration += 1;
    const generation = revealGeneration;
    revealLoading.value = true; // :5622
    try {
      const result = await api.fetchApiKeysJson<{ value?: unknown }>('/tradfi/reveal', {
        method: 'POST',
        body: JSON.stringify({ profile_id: profileIdAtStart }),
      });
      if (generation !== revealGeneration || profileIdAtStart !== profileId.value) return; // :5628-5629
      tokenValue.value = String(result.value || ''); // :5630
      isRevealed.value = true; // :5631 dataset.revealed = 'true'
      visible.value = true; // :5632
    } catch (error) {
      if (generation !== revealGeneration) return; // :5635
      const message = error instanceof Error && error.message ? serverMsg(error.message) : '';
      showToast(message || t('market.failedRevealTiingo'), 'error'); // :5636
    } finally {
      revealLoading.value = false; // :5638
    }
  }

  /** Legacy renderSettingsPayload tiingo tail (:7379-7396). */
  function applySettingsPayload(settings: TiingoSettingsSlice): void {
    clearRevealedToken(); // :7379
    configured.value = Boolean(settings.tiingo_configured); // :7380
    profileId.value = String(settings.tiingo_profile_id ?? ''); // :7381
    tokenValue.value = ''; // :7384
    visible.value = false; // :7385
    const payloadUsage = (settings.tiingo_usage ?? {}) as TiingoUsage; // :7396 `|| {}`
    usage.value = payloadUsage;
    usageConfigured.value = configured.value;
  }

  /** Legacy saveTiingoToken (:8970-9030). */
  async function saveToken(): Promise<void> {
    if (isRevealed.value) {
      showToast(t('market.hideRevealedToken'), 'warning'); // :8973-8975
      return;
    }
    const token = String(tokenValue.value || '').trim(); // :8977
    if (!token) {
      showToast(t('market.enterNewTiingoToken'), 'error'); // :8979
      return;
    }
    if (saveLoading.value) return; // :8982

    saveGeneration += 1;
    const generation = saveGeneration;
    saveLoading.value = true; // :8985
    inputDisabled.value = true; // :8986
    try {
      const profilePayload = await api.fetchApiKeysJson<{ profiles?: unknown }>(
        '/tradfi/profiles'
      ); // :8988
      if (generation !== saveGeneration) return; // :8989
      const profiles = (Array.isArray(profilePayload.profiles) ? profilePayload.profiles : []).filter(
        (item): item is VaultProfile => Boolean(item)
      ); // :8990
      const profile =
        profiles.find((item) => String(item.id ?? '') === profileId.value) || // :8991-8992
        profiles.find(
          (item) => item.provider === 'tiingo' && item.active && !item.pending // :8993-8994
        ) ||
        profiles.find((item) => item.provider === 'tiingo' && !item.pending) || // :8995-8996
        null;
      const result = await api.fetchApiKeysJson<VaultProfileResult>('/tradfi/config', {
        method: 'PUT',
        body: JSON.stringify({
          profile_id: profile ? profile.id : null, // :9001
          provider: 'tiingo',
          label: profile && profile.label ? profile.label : t('market.marketDataTiingo'), // :9003
          active: true,
          shared: profile ? Boolean(profile.shared) : true, // :9005
          api_key: token,
          create_new: !profile, // :9007
        }),
      });
      if (generation !== saveGeneration) return; // :9010
      configured.value = Boolean(result.profile && result.profile.has_api_key); // :9011
      profileId.value = String((result.profile && result.profile.id) || ''); // :9012
      await options.reloadSettings(); // :9013 (legacy passed keepFeedback:true — void-ed)
      showToast(
        result.status === 'pending' ? t('market.tiingoPending') : t('market.tiingoSaved'),
        result.status === 'pending' ? 'warning' : 'success'
      ); // :9014-9019
    } catch (error) {
      const message = error instanceof Error && error.message ? serverMsg(error.message) : '';
      showToast(message || t('market.failedSaveTiingo'), 'error'); // :9021
    } finally {
      if (tokenValue.value === token) tokenValue.value = ''; // :9023
      if (generation === saveGeneration) {
        saveLoading.value = false; // :9026
        inputDisabled.value = false; // :9027
      }
    }
  }

  /** Legacy testTiingo (:8949-8968). */
  async function test(): Promise<void> {
    if (!isTiingoConfigured()) {
      showToast(t('market.noTiingoProfile'), 'error'); // :8951
      return;
    }
    try {
      const result = await api.fetchJson<{
        success?: boolean;
        error?: string;
        message?: string;
        usage?: TiingoUsage;
      }>('/settings/hyperliquid/tiingo-probe', {
        method: 'POST',
        body: JSON.stringify({ ticker: 'AAPL' }), // :8958
      });
      if (!result.success) {
        throw new Error(result.error || t('market.tiingoTestFailed')); // :8961
      }
      usage.value = result.usage ?? {}; // :8963 renderTiingoUsage(result.usage || {}, …)
      usageConfigured.value = true; // …the second argument is literal true
      showToast(result.message || t('market.tiingoConnectionOk'), 'success'); // :8964
    } catch (error) {
      const message = error instanceof Error && error.message ? serverMsg(error.message) : '';
      showToast(message || t('market.tiingoTestFailed'), 'error'); // :8966
    }
  }

  return {
    tokenValue,
    isRevealed,
    visible,
    revealLoading,
    saveLoading,
    inputDisabled,
    configured,
    profileId,
    usage,
    usageConfigured,
    isTiingoConfigured,
    clearRevealedToken,
    toggleVisible,
    applySettingsPayload,
    saveToken,
    test,
  };
}
