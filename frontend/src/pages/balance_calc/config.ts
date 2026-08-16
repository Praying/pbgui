import { getBoot } from '@/shared/boot';

/**
 * Balance Calculator page config — the Vue replacement for the legacy
 * server-side injections (balance_calc.html:249-259, api/balance_calc.py
 * :471-493):
 *
 *   API_BASE      ← %%API_BASE%%            (origin + /api/balance-calc)
 *   INIT_INSTANCE ← ?instance=              (pre-select instance)
 *   INIT_VERSION  ← ?instance_version=
 *   DRAFT_ID      ← ?draft_id=              (pre-load a stored draft config)
 *   INIT_EXCHANGE ← ?exchange=              (pre-select exchange)
 *   EXCHANGES     ← %%EXCHANGES%%           (api/balance_calc.py EXCHANGES)
 *
 * The query params pass through the route verbatim, so the Vue page reads
 * them at runtime; the exchange list is mirrored here and locked against the
 * API constant by tests/test_balance_calc_route.py.
 */

/** api/balance_calc.py EXCHANGES (:52) — parity enforced by the route test. */
export const EXCHANGES = ['binance', 'bybit', 'bitget', 'gateio', 'hyperliquid', 'kucoin', 'okx'] as const;

/** REST base for the balance-calc router, e.g. http://host:port/api/balance-calc. */
export function balanceCalcApiBase(): string {
  return `${getBoot().origin}/api/balance-calc`;
}

/** Legacy plain concatenation (loadInstances :297, calculate :382). */
export function apiUrl(path: string): string {
  return balanceCalcApiBase() + path;
}

export interface BalanceCalcInit {
  instance: string;
  instanceVersion: string;
  draftId: string;
  exchange: string;
}

/** The route's pre-selection query params (%%INSTANCE%% & co. :478-481). */
export function readInitParams(search: string = window.location.search): BalanceCalcInit {
  const params = new URLSearchParams(search);
  return {
    instance: params.get('instance') || '',
    instanceVersion: params.get('instance_version') || '',
    draftId: params.get('draft_id') || '',
    exchange: params.get('exchange') || '',
  };
}
