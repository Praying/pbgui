import type { EditAdapter } from '../config';
import { replaceTopLocation } from '@/shared/nav';

/**
 * Cross-page draft handoffs — ports of v7_edit.html goBacktest
 * (:1699-1729), strategyExplorerApiBase (:1731-1735), goStrategyExplorer
 * (:1737-1765), goBalanceCalc (:1777-1794) and the editor_shared.js
 * balance helpers (:612-677). Handoffs are full page loads through
 * short-lived server draft stores (recon R6) — these builders keep the
 * exact URL/body vocabularies the target pages read.
 */

type FetchFn = typeof fetch;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** strategyExplorerApiBase (:1731-1735) — API_BASE origin + router prefix. */
export function strategyExplorerApiBase(apiBase: string, isV8: boolean, origin: string = window.location.origin): string {
  const match = String(apiBase || '').match(/^(https?:\/\/[^/]+)/);
  const base = match ? match[1]! : origin;
  return base + (isV8 ? '/api/strategy-explorer-v8' : '/api/strategy-explorer');
}

/** getBalanceCalcApiBase (editor_shared.js:612-625). */
export function balanceCalcApiBase(apiBase: string): string {
  const base = String(apiBase || '');
  if (!base) throw new Error('Missing API base');
  if (/\/api\/balance-calc$/.test(base)) return base;
  return base
    .replace(/\/api\/v7$/, '/api/balance-calc')
    .replace(/\/api\/v8$/, '/api/balance-calc')
    .replace(/\/api\/backtest-v7$/, '/api/balance-calc')
    .replace(/\/api\/backtest-v8$/, '/api/balance-calc')
    .replace(/\/v7$/, '/balance-calc')
    .replace(/\/v8$/, '/balance-calc')
    .replace(/\/backtest-v7$/, '/balance-calc')
    .replace(/\/backtest-v8$/, '/balance-calc');
}

/** runEditorAdapter.backtestDraftRequest (run_editor_adapter.js:154-168). */
export function backtestDraftRequest(
  adapter: EditAdapter,
  apiBase: string,
  config: Record<string, unknown>,
  overrideConfigs: Record<string, unknown>
): { url: string; body: Record<string, unknown>; page: string } {
  if (!adapter.isV8) {
    return {
      url: String(apiBase || '') + '/draft',
      body: { config },
      page: String(apiBase || '') + '/draft-target',
    };
  }
  const origin = String(apiBase || '').replace(/\/api\/v8$/, '');
  return {
    url: origin + '/api/backtest-v8/optimize-draft',
    body: { config, override_configs: overrideConfigs || {} },
    page: origin + '/api/backtest-v8/main_page',
  };
}

/** The backtest handoff URL (:1721-1725) — draft_id (v7) vs opt_draft_id (v8). */
export function backtestHandoffUrl(isV8: boolean, pageUrl: string, draftId: string, draftName: string): string {
  const queryKey = isV8 ? 'opt_draft_id' : 'draft_id';
  return (
    pageUrl +
    '?' +
    queryKey +
    '=' +
    encodeURIComponent(draftId) +
    '&draft_name=' +
    encodeURIComponent(draftName)
  );
}

async function resolveJsonResult(promise: Promise<Response>, fetchFn: FetchFn): Promise<Record<string, unknown>> {
  const resp = await promise;
  if (!resp.ok) {
    let detail = 'HTTP ' + resp.status;
    try {
      const err = (await resp.json()) as { detail?: unknown };
      if (err && err.detail) detail = String(err.detail);
    } catch {
      if (resp.statusText) detail = resp.statusText;
    }
    throw new Error(detail);
  }
  return (await resp.json()) as Record<string, unknown>;
}

export interface BalanceCalcOptions {
  readonly apiBase: string;
  readonly config: Record<string, unknown>;
  readonly exchange: string;
  /** Set false to only create the draft (tests). */
  readonly navigate?: boolean;
}

/** openBalanceCalcPage (editor_shared.js:646-657). */
export async function openBalanceCalcPage(opts: BalanceCalcOptions, fetchFn: FetchFn = fetch): Promise<{ draft_id: string; url: string }> {
  const exchange = String(opts.exchange || '').trim().toLowerCase();
  if (!exchange) throw new Error('Missing exchange');
  const apiBase = balanceCalcApiBase(opts.apiBase);
  const data = await resolveJsonResult(
    fetchFn(apiBase + '/draft', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: opts.config }),
    }),
    fetchFn
  );
  if (!data.draft_id) throw new Error('Balance Calculator draft creation failed');
  const draftId = String(data.draft_id);
  const url = apiBase + '/main_page?draft_id=' + encodeURIComponent(draftId) + '&exchange=' + encodeURIComponent(exchange);
  if (opts.navigate !== false) replaceTopLocation(url);
  return { draft_id: draftId, url };
}

/** requestBalanceCalculation (editor_shared.js:659-677). */
export async function requestBalanceCalculation(
  opts: { apiBase: string; config: Record<string, unknown>; exchange: string },
  fetchFn: FetchFn = fetch
): Promise<Record<string, unknown>> {
  if (!opts.config || typeof opts.config !== 'object' || Array.isArray(opts.config)) {
    throw new Error('Config must be a JSON object');
  }
  const exchange = String(opts.exchange || '').trim().toLowerCase();
  if (!exchange) throw new Error('Missing exchange');
  const apiBase = balanceCalcApiBase(opts.apiBase);
  return resolveJsonResult(
    fetchFn(apiBase + '/calculate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: opts.config, exchange }),
    }),
    fetchFn
  );
}

export interface DraftHandoffActions {
  /** goBacktest (:1699-1729). */
  goBacktest(): Promise<void>;
  /** goStrategyExplorer (:1737-1765). */
  goStrategyExplorer(): Promise<void>;
  /** goBalanceCalc page handoff (:1777-1794). */
  goBalanceCalc(): Promise<void>;
}

export interface DraftHandoffOptions {
  readonly adapter: EditAdapter;
  readonly apiBase: string;
  /** The save-validation gates each handoff runs first. */
  readonly validateForHandoff: () => boolean;
  readonly collectConfig: () => Record<string, unknown>;
  /** coinOvSnapshotAllFiles — v8 override files travel with the draft. */
  readonly snapshotOverrideFiles: () => Promise<Record<string, unknown>>;
  /** Selected user exchange ('' when unknown). */
  readonly selectedUserExchange: () => string;
  readonly draftName: () => string;
  readonly onError: (messageKey: 'v7run.failedCreateDraft' | 'v7run.failedOpenStrategyExplorer' | 'v7run.failedOpenBalanceCalculator' | 'v7run.cannotDetermineExchange', detail?: string) => void;
  readonly fetchFn?: FetchFn;
}

/** The three sidebar handoff actions with the legacy gate order. */
export function useDraftHandoffs(options: DraftHandoffOptions): DraftHandoffActions {
  const fetchFn = options.fetchFn ?? fetch;
  const { adapter, apiBase } = options;

  async function postDraft(url: string, body: Record<string, unknown>): Promise<string> {
    const resp = await fetchFn(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = object(await resp.json());
    if (!data.draft_id) throw new Error('draft_id missing');
    return String(data.draft_id);
  }

  async function gated(): Promise<Record<string, unknown> | null> {
    if (!options.validateForHandoff()) return null;
    return options.collectConfig();
  }

  async function goBacktest(): Promise<void> {
    const config = await gated();
    if (!config) return;
    try {
      const overrides = adapter.isV8 ? await options.snapshotOverrideFiles() : {};
      const request = backtestDraftRequest(adapter, apiBase, config, overrides);
      const draftId = await postDraft(request.url, request.body);
      const page = adapter.isV8 ? request.page : window.location.origin + '/api/backtest-v7/main_page';
      replaceTopLocation(backtestHandoffUrl(adapter.isV8, page, draftId, options.draftName()));
    } catch (error) {
      options.onError('v7run.failedCreateDraft', error instanceof Error ? error.message : String(error));
    }
  }

  async function goStrategyExplorer(): Promise<void> {
    const config = await gated();
    if (!config) return;
    const explorerBase = strategyExplorerApiBase(apiBase, adapter.isV8);
    try {
      const overrides = adapter.isV8 ? await options.snapshotOverrideFiles() : {};
      const body = adapter.isV8 ? { config, override_configs: overrides || {} } : { config };
      const draftId = await postDraft(explorerBase + '/draft', body);
      replaceTopLocation(explorerBase + '/main_page?draft_id=' + encodeURIComponent(draftId));
    } catch (error) {
      options.onError('v7run.failedOpenStrategyExplorer', error instanceof Error ? error.message : String(error));
    }
  }

  async function goBalanceCalc(): Promise<void> {
    const config = await gated();
    if (!config) return;
    const exchange = options.selectedUserExchange();
    if (!exchange) {
      options.onError('v7run.cannotDetermineExchange');
      return;
    }
    try {
      await openBalanceCalcPage({ apiBase, config, exchange }, fetchFn);
    } catch (error) {
      options.onError('v7run.failedOpenBalanceCalculator', error instanceof Error ? error.message : String(error));
    }
  }

  return { goBacktest, goStrategyExplorer, goBalanceCalc };
}
