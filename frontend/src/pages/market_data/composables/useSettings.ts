import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import { readSettingsSubsection, persistSettingsSubsection } from './usePanels';
import { useSettingsBaseline } from './useSettingsBaseline';
import {
  collectSettingsRequest,
  type SettingsRequest,
} from '../lib/settingsRequest';
import {
  createSettingsFieldValues,
  toFieldValue,
  type SettingsFieldValues,
} from '../lib/settingsFields';
import type { SettingsSubsection, ToastLevel } from '../types';

/*
 * The settings store — legacy settingsState (:3698-3714) plus its action
 * core, so App can wire the exchange fan-out and the sidebar while the
 * SettingsPanel renders it:
 *
 *   loadSettings           :8881-8898  GET /settings/{ex} → apply → baseline
 *   renderSettingsPayload  :7335-7404  field slice (tiingo/tradfi slice is an
 *                                      injected M-data-4 hook)
 *   collectSettingsRequest :8900-8928  lib/settingsRequest (golden parity)
 *   saveSettings           :8930-8947  POST → apply → baseline → toast
 *   subsections            :6146-6186  availability/resolve/persist
 *   coin picker state      :7015-7133  filter/sort/prune/select-all/clear
 *   dirty tracking         :5528-5549  useSettingsBaseline (reactive)
 *
 * M-data-2 handoff landed here: the fan-out hook's second argument
 * {keepFeedback:false} (:7314) is now an executable contract — the literal
 * type only admits false (legacy void-ed the flag, :8882-8884), and a runtime
 * guard rejects any untyped true.
 */

/** Legacy fetchJson slice the store needs (useApi().fetchJson). */
export interface SettingsApi {
  fetchJson<T>(path: string, init?: RequestInit): Promise<T>;
}

/** Only the literal legacy call shape is legal (:7314). */
export interface LoadSettingsOptions {
  keepFeedback: false;
}

export interface SettingsPayloadSettings {
  interval_seconds?: unknown;
  coin_pause_seconds?: unknown;
  api_timeout_seconds?: unknown;
  min_lookback_days?: unknown;
  max_lookback_days?: unknown;
  aws_profile?: unknown;
  aws_access_key_id?: unknown;
  aws_secret_access_key?: unknown;
  aws_access_key_configured?: unknown;
  aws_secret_access_key_configured?: unknown;
  aws_region?: unknown;
  l2book_scan_timeout_s?: unknown;
  l2book_scan_workers?: unknown;
  l2book_archive_enabled?: unknown;
  l2book_archive_dir?: unknown;
  /** tiingo_* fields pass through untouched (M-data-4). */
  [key: string]: unknown;
}

/** GET /settings/{ex} body — also nested as `settings` in the POST result (:8939). */
export interface SettingsPayload {
  exchange?: string;
  success?: boolean;
  error?: string;
  auto_enable_new_coins?: unknown;
  enabled_coins?: unknown;
  coin_options?: unknown;
  missing_saved_coins?: unknown;
  settings?: SettingsPayloadSettings;
  [key: string]: unknown;
}

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;
export type ShowToastFn = (message: unknown, level?: ToastLevel) => void;

export interface UseSettingsOptions {
  api: SettingsApi;
  storage?: Storage;
  t: TranslateFn;
  showToast: ShowToastFn;
  /** renderSettingsPayload's hyperliquid tail (:7379-7397) — M-data-4. */
  onHyperliquidPayload?(payload: SettingsPayload): void;
  /** The non-hyperliquid tail (:7399-7401) — M-data-4 (tradfi reset). */
  onOtherExchangePayload?(): void;
}

export interface SettingsController {
  exchange: Ref<string>;
  isHyperliquid: ComputedRef<boolean>;
  autoEnableNewCoins: Ref<boolean>;
  coinFilter: Ref<string>;
  selectedCoins: Ref<ReadonlySet<string>>;
  /** renderCoinOptions snapshot — stable between renders like the legacy DOM. */
  renderedCoins: Ref<readonly string[]>;
  activeSubsection: Ref<SettingsSubsection>;
  availableSubsections: ComputedRef<readonly SettingsSubsection[]>;
  resolvedSubsection: ComputedRef<SettingsSubsection>;
  missingSavedCoins: ComputedRef<readonly string[]>;
  isDirty: ComputedRef<boolean>;
  fields: SettingsFieldValues;
  allCoins: ComputedRef<readonly string[]>;

  isCoinSelected(coin: string): boolean;
  setCoinSelected(coin: string, selected: boolean): void;
  renderCoinOptions(): void;
  setCoinFilter(value: string): void;
  setAutoEnableNewCoins(value: boolean): void;
  selectVisibleCoins(): void;
  clearAllCoins(): void;
  setActiveSubsection(key: SettingsSubsection): void;
  collectRequest(): SettingsRequest;
  loadSettings(exchangeKey: string, options?: LoadSettingsOptions): Promise<void>;
  saveSettings(): Promise<void>;
}

const SETTINGS_SUBSECTIONS_ALL: readonly SettingsSubsection[] = ['normal', 'aws', 'tradfi'];

export function useSettings(options: UseSettingsOptions): SettingsController {
  const storage = options.storage ?? window.localStorage;
  const { t, showToast } = options;

  /* ── state (:3698-3714) ── */
  const exchange = ref('hyperliquid');
  const payload = ref<SettingsPayload | null>(null);
  const autoEnableNewCoins = ref(false);
  const coinFilter = ref('');
  const selectedCoins = ref<ReadonlySet<string>>(new Set());
  const renderedCoins = ref<readonly string[]>([]);
  const activeSubsection = ref<SettingsSubsection>(readSettingsSubsection(storage)); // :3819
  const fields = reactive<SettingsFieldValues>(createSettingsFieldValues());

  /* ── derived ── */
  const allCoins = computed<readonly string[]>(() =>
    Array.isArray(payload.value?.coin_options) ? (payload.value.coin_options as string[]) : []
  ); // getAllCoins :7015-7019

  const isHyperliquid = computed(() => exchange.value === 'hyperliquid'); // :6147

  const availableSubsections = computed<readonly SettingsSubsection[]>(() =>
    isHyperliquid.value ? SETTINGS_SUBSECTIONS_ALL : ['normal'] // :6146-6150
  );

  const resolvedSubsection = computed<SettingsSubsection>(() =>
    availableSubsections.value.includes(activeSubsection.value) ? activeSubsection.value : 'normal'
  ); // :6152-6155

  const missingSavedCoins = computed<readonly string[]>(() =>
    Array.isArray(payload.value?.missing_saved_coins)
      ? (payload.value.missing_saved_coins as string[])
      : []
  ); // :7352

  /* ── dirty tracking (:5528-5549) ── */
  const baseline = useSettingsBaseline({
    collect: () => JSON.stringify(collectRequest()),
  });
  const isDirty = baseline.isDirty;

  function collectRequest(): SettingsRequest {
    return collectSettingsRequest({
      exchange: exchange.value,
      autoEnableNewCoins: autoEnableNewCoins.value,
      selectedCoins: selectedCoins.value,
      allCoins: allCoins.value,
      fields,
    });
  }

  /* ── coin picker (:7015-7133) ── */

  /** getVisibleCoins (:7021-7026). */
  function visibleCoinsOf(coins: readonly string[]): string[] {
    const filter = coinFilter.value.trim().toLowerCase();
    return coins.filter((coin) => !filter || coin.toLowerCase().includes(filter));
  }

  /** renderCoinOptions (:7028-7063) — the only renderedCoins refresh sites. */
  function renderCoinOptions(): void {
    const coins = allCoins.value;
    if (autoEnableNewCoins.value) {
      selectedCoins.value = new Set(coins); // :7035-7036
    } else {
      const coinSet = new Set(coins);
      selectedCoins.value = new Set(
        [...selectedCoins.value].filter((coin) => coinSet.has(coin)) // :7037-7041 prune
      );
    }
    renderedCoins.value = visibleCoinsOf(coins).slice().sort((left, right) => {
      const leftRank = selectedCoins.value.has(left) ? 0 : 1; // :7043
      const rightRank = selectedCoins.value.has(right) ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.localeCompare(right); // :7046
    });
  }

  function isCoinSelected(coin: string): boolean {
    return selectedCoins.value.has(coin);
  }

  function setCoinSelected(coin: string, selected: boolean): void {
    if (!coin) return; // :7120-7121
    const next = new Set(selectedCoins.value);
    if (selected) next.add(coin);
    else next.delete(coin);
    selectedCoins.value = next;
  }

  function setCoinFilter(value: string): void {
    coinFilter.value = value; // :9628
    renderCoinOptions(); // :9629
  }

  function setAutoEnableNewCoins(value: boolean): void {
    autoEnableNewCoins.value = value; // :9632
    renderCoinOptions(); // :9633 (expand/prune + disable rows)
  }

  function selectVisibleCoins(): void {
    if (autoEnableNewCoins.value) return; // :9673
    const next = new Set(selectedCoins.value);
    for (const coin of visibleCoinsOf(allCoins.value)) next.add(coin); // :9674-9676
    selectedCoins.value = next;
    renderCoinOptions(); // :9677
  }

  function clearAllCoins(): void {
    if (autoEnableNewCoins.value) return; // :9681
    selectedCoins.value = new Set(); // :9682
    renderCoinOptions(); // :9683
  }

  /* ── subsections (:6175-6185) ── */

  function setActiveSubsection(key: SettingsSubsection): void {
    activeSubsection.value = key;
    persistSettingsSubsection(storage, key); // :6177-6181
    // visibility is derived; the panel scroll-to-top lives in SettingsPanel (:6183-6184)
  }

  /* ── renderSettingsPayload field slice (:7335-7404) ── */

  function applyRenderSettings(): boolean {
    const current = payload.value;
    if (!current || current.success === false) {
      showToast(current?.error ? current.error : t('market.failedLoadSettings'), 'error'); // :7337-7339 — raw error, no serverMsg
      return false;
    }

    const settings = current.settings ?? {};
    autoEnableNewCoins.value = Boolean(current.auto_enable_new_coins); // :7343-7344
    fields.intervalSeconds = toFieldValue(settings.interval_seconds); // :7346-7350
    fields.coinPauseSeconds = toFieldValue(settings.coin_pause_seconds);
    fields.apiTimeoutSeconds = toFieldValue(settings.api_timeout_seconds);
    fields.minLookbackDays = toFieldValue(settings.min_lookback_days);
    fields.maxLookbackDays = toFieldValue(settings.max_lookback_days);

    // :7362-7366 — the hyperliquid-only cards (AWS/archive here; tiingo +
    // tradfi-map placeholders stay with the panel until M-data-4 lands)
    if (current.exchange === 'hyperliquid') {
      fields.awsProfile = toFieldValue(settings.aws_profile); // :7371-7378
      fields.awsAccessKeyId = '';
      fields.awsSecretAccessKey = '';
      fields.awsAccessKeyConfigured = Boolean(settings.aws_access_key_configured);
      fields.awsSecretAccessKeyConfigured = Boolean(settings.aws_secret_access_key_configured);
      fields.awsRegion = toFieldValue(settings.aws_region);
      fields.scanTimeout = toFieldValue(settings.l2book_scan_timeout_s);
      fields.scanWorkers = toFieldValue(settings.l2book_scan_workers);
      fields.archiveEnabled = Boolean(settings.l2book_archive_enabled);
      fields.archiveDir = toFieldValue(settings.l2book_archive_dir);
      options.onHyperliquidPayload?.(current); // :7379-7397 — M-data-4 hook
    } else {
      options.onOtherExchangePayload?.(); // :7399-7401 — M-data-4 hook
    }

    renderCoinOptions(); // :7403
    return true;
  }

  /* ── loadSettings (:8881-8898) ── */

  async function loadSettings(exchangeKey: string, loadOptions?: LoadSettingsOptions): Promise<void> {
    if (loadOptions && loadOptions.keepFeedback !== false) {
      // M-data-2 handoff: the flag was comment-only in legacy (:8882-8884
      // void-ed it); make any drift loud instead of silent.
      throw new Error('loadSettings: keepFeedback=true is not implemented (legacy void-ed the flag)');
    }
    const exchangeKeyNormalized = String(exchangeKey || 'hyperliquid'); // :8883
    try {
      const fetched = await options.api.fetchJson<SettingsPayload>(
        `/settings/${encodeURIComponent(exchangeKeyNormalized)}` // :8885
      );
      exchange.value = fetched.exchange || exchangeKeyNormalized; // :8886
      payload.value = fetched; // :8887
      autoEnableNewCoins.value = Boolean(fetched.auto_enable_new_coins); // :8888
      selectedCoins.value = new Set(
        Array.isArray(fetched.enabled_coins) ? (fetched.enabled_coins as string[]) : []
      ); // :8889
      coinFilter.value = ''; // :8890-8891
      applyRenderSettings(); // :8892
      baseline.setBaseline(); // :8893 — runs even when the render bailed (legacy did too)
    } catch (error) {
      const message = error instanceof Error && error.message ? serverMsg(error.message) : '';
      showToast(message || t('market.failedLoadSettings'), 'error'); // :8895-8897
    }
  }

  /* ── saveSettings (:8930-8947) ── */

  async function saveSettings(): Promise<void> {
    try {
      const result = await options.api.fetchJson<{
        success?: boolean;
        error?: string;
        message?: string;
        settings?: SettingsPayload;
      }>(`/settings/${encodeURIComponent(exchange.value)}`, {
        method: 'POST',
        body: JSON.stringify(collectRequest()), // :8932-8935
      });
      if (!result.success) {
        throw new Error(result.error || t('market.saveFailed')); // :8936-8938
      }
      payload.value = result.settings ?? {}; // :8939
      selectedCoins.value = new Set(
        Array.isArray(result.settings?.enabled_coins)
          ? (result.settings.enabled_coins as string[])
          : []
      ); // :8940
      applyRenderSettings(); // :8941
      baseline.setBaseline(); // :8942
      showToast(result.message || t('market.settingsSaved'), 'success'); // :8943
    } catch (error) {
      const message = error instanceof Error && error.message ? serverMsg(error.message) : '';
      showToast(message || t('market.saveFailed'), 'error'); // :8944-8946
    }
  }

  return {
    exchange,
    isHyperliquid,
    autoEnableNewCoins,
    coinFilter,
    selectedCoins,
    renderedCoins,
    activeSubsection,
    availableSubsections,
    resolvedSubsection,
    missingSavedCoins,
    isDirty,
    fields,
    allCoins,
    isCoinSelected,
    setCoinSelected,
    renderCoinOptions,
    setCoinFilter,
    setAutoEnableNewCoins,
    selectVisibleCoins,
    clearAllCoins,
    setActiveSubsection,
    collectRequest,
    loadSettings,
    saveSettings,
  };
}
