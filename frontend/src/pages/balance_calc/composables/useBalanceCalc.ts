/*
 * The Balance Calculator store — the reactive port of balance_calc.html
 * :268-528: instance loading (:296-321), instance-config load (:324-347),
 * the calculate flow (:360-403) and the draft pre-load (:514-527). Results
 * rendering (:406-483) becomes typed state consumed by ResultsPanel.vue.
 */

import { ref, type Ref } from 'vue';
import { apiFetch, ApiError } from '@/shared/api';
import { serverMsg } from '@/shared/i18n';
import { apiUrl } from '../config';

export interface BalanceInstance {
  name: string;
  version: string;
}

export interface Recommendation {
  symbol: string;
  side: string;
  recommended_balance: number;
  min_order_price: number;
  total_wallet_exposure_limit: number;
  n_positions: number;
  entry_initial_qty_pct: number;
  calculated_balance: number;
}

export interface BalanceRow {
  coin: string;
  balance: number;
}

export interface CoinInfoRow {
  coin: string;
  currentPrice: number;
  contractSize: string;
  min_amount: string;
  min_cost: string;
  min_order_price: string;
  max_lev?: string;
}

/** POST /calculate success payload (renderResults :406-483 consumption). */
export interface CalcResults {
  exchange?: string;
  recommendation?: Recommendation;
  balance_long?: BalanceRow[];
  balance_short?: BalanceRow[];
  coin_infos?: CoinInfoRow[];
}

export type CalcFeedback =
  | { kind: 'info'; message: string }
  | { kind: 'error'; message: string }
  | null;

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

export interface UseBalanceCalc {
  instances: Ref<BalanceInstance[]>;
  selectedInstance: Ref<BalanceInstance | null>;
  exchange: Ref<string>;
  configText: Ref<string>;
  results: Ref<CalcResults | null>;
  feedback: Ref<CalcFeedback>;
  calculating: Ref<boolean>;
  loadInstances(initInstance: string, initVersion: string): Promise<void>;
  selectInstance(inst: BalanceInstance | null): void;
  calculate(): Promise<void>;
  loadDraft(draftId: string): Promise<boolean>;
}

export function useBalanceCalc(options: {
  t: TranslateFn;
  exchanges: readonly string[];
  initExchange: string;
}): UseBalanceCalc {
  const t = options.t;

  const instances = ref<BalanceInstance[]>([]);
  const selectedInstance = ref<BalanceInstance | null>(null);
  const exchange = ref(options.initExchange || '');
  const configText = ref('');
  const results = ref<CalcResults | null>(null);
  const feedback = ref<CalcFeedback>({ kind: 'info', message: '' });
  const calculating = ref(false);

  function setError(message: string): void {
    feedback.value = { kind: 'error', message };
  }

  /* ── instances (:296-321) ── */

  async function loadInstances(initInstance: string, initVersion: string): Promise<void> {
    try {
      // legacy used a cookie-session fetch without a Bearer header (:297) —
      // apiFetch adds the header, which the same session accepts
      const list = (await apiFetch<BalanceInstance[]>(apiUrl('/instances'), {
        credentials: 'same-origin',
      })) as BalanceInstance[];
      instances.value = Array.isArray(list) ? list : [];
      if (initInstance) {
        const match = instances.value.find(
          (inst) => inst.name === initInstance && (!initVersion || inst.version === initVersion) // :311
        );
        if (match) await selectInstance(match);
      }
    } catch {
      /* legacy logged and left the list empty (:320) */
    }
  }

  /* ── instance config (:324-347) ── */

  async function selectInstance(inst: BalanceInstance | null): Promise<void> {
    selectedInstance.value = inst;
    if (!inst || !inst.name || !inst.version) return;
    try {
      const data = (await apiFetch<{ config: unknown; exchange?: string }>(apiUrl('/load-config'), {
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ name: inst.name, version: inst.version }), // :330-331
      })) as { config: unknown; exchange?: string };
      configText.value = JSON.stringify(data.config, null, 4); // :339
      if (data.exchange) exchange.value = data.exchange; // :340-342
    } catch (error) {
      const message = error instanceof ApiError ? serverMsg(error.detail) : String(error);
      configText.value = '// ' + t('misc.balance.failedLoadConfig', { error: message }); // :345
    }
  }

  /* ── calculate (:360-403) ── */

  async function calculate(): Promise<void> {
    const configSource = configText.value.trim();
    if (!configSource) {
      setError(t('misc.balance.enterConfig')); // :363
      return;
    }
    let config: unknown;
    try {
      config = JSON.parse(configSource);
    } catch (e) {
      setError(t('misc.balance.invalidJson', { error: e instanceof Error ? e.message : String(e) })); // :370
      return;
    }
    if (!exchange.value) {
      setError(t('misc.balance.selectExchange')); // :375
      return;
    }

    calculating.value = true;
    feedback.value = null;
    try {
      const data = (await apiFetch<CalcResults & { error?: string }>(apiUrl('/calculate'), {
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ config, exchange: exchange.value }), // :386
      })) as CalcResults & { error?: string };
      if (data.error) {
        setError(serverMsg(data.error)); // :393
        return;
      }
      results.value = data;
    } catch (error) {
      const message = error instanceof ApiError ? error.detail : String(error);
      setError(t('misc.balance.requestFailed', { error: message })); // :401
    } finally {
      calculating.value = false;
    }
  }

  /* ── draft pre-load (:514-527) ── */

  async function loadDraft(draftId: string): Promise<boolean> {
    if (!draftId) return false;
    try {
      const d = (await apiFetch<{ config?: unknown }>(
        apiUrl('/draft/' + encodeURIComponent(draftId)),
        { credentials: 'same-origin' }
      )) as { config?: unknown };
      if (d.config) {
        configText.value = JSON.stringify(d.config, null, 4); // :521
        await calculate(); // :523 — auto-calculate immediately
        return true;
      }
    } catch {
      /* legacy logged (:526) */
    }
    return false;
  }

  return {
    instances,
    selectedInstance,
    exchange,
    configText,
    results,
    feedback,
    calculating,
    loadInstances,
    selectInstance,
    calculate,
    loadDraft,
  };
}
