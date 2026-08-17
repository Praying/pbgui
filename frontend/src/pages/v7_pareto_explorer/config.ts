import { getBoot } from '@/shared/boot';
import type { DeepTab, OptimizeVersion, ParetoStage } from './types';

/**
 * Pareto Explorer page config — replacement for the legacy injections
 * (frontend/v7_pareto_explorer.html:1646-1651, api/pareto_explorer.py:3335-3372):
 *
 *   API_BASE         ← %%API_BASE%%         (origin + /api/pareto-explorer)
 *   WS_BASE          ← %%WS_BASE%%          (unused by the legacy script body)
 *   INIT_RESULT_PATH ← %%RESULT_PATH%%      (?result_path= query)
 *   OPTIMIZE_VERSION ← %%OPTIMIZE_VERSION%% (server-resolved; the
 *                                            ?optimize_version= query carries
 *                                            the same signal — the server
 *                                            prefers the result dir's version,
 *                                            pareto_explorer.py:3358-3362)
 *   VERSION/SERIAL   ← boot.js
 *
 * FLAVOR — the critical difference from every other v7/v8 page: pareto is
 * served by ONE route and its flavor is RUNTIME-RESOLVED per result
 * (:1765-1768). Pathname detection (the v7_run/strategy-explorer pattern)
 * is WRONG here; the query only seeds the initial value and
 * composables/useParetoSession.ts re-resolves it on every session load.
 */

export type { DeepTab, OptimizeVersion, ParetoStage } from './types';

export const VALID_STAGES: readonly ParetoStage[] = [
  'command_center',
  'pareto_playground',
  'deep_intelligence',
  'settings',
];

export const VALID_DEEP_TABS: readonly DeepTab[] = ['parameters', 'scenarios', 'evolution', 'correlations'];

export const DEFAULT_STAGE: ParetoStage = 'command_center';
export const DEFAULT_DEEP_TAB: DeepTab = 'parameters';

/** state.loadStrategy default (:1661). */
export const DEFAULT_LOAD_STRATEGY: readonly string[] = ['performance', 'robustness', 'sharpe', 'coverage'];

/** state.maxConfigs default (:1662) and the parseInt fallback (:4616). */
export const DEFAULT_MAX_CONFIGS = 2000;

/** The settings-stage multi-select options (legacy markup :1194-1204). */
export const LOAD_STRATEGY_OPTIONS: readonly string[] = [
  'performance',
  'robustness',
  'sharpe',
  'coverage',
  'drawdown',
  'calmar',
  'sortino',
  'omega',
  'volatility',
  'recovery',
];

/**
 * Version normalisation (:1697, :1768): only 'v8' — lower-cased — maps to v8;
 * everything else (including junk, empty and missing) resolves to v7.
 */
export function normalizeOptimizeVersion(value: unknown): OptimizeVersion {
  return String(value ?? '').trim().toLowerCase() === 'v8' ? 'v8' : 'v7';
}

/** The seed from ?optimize_version= — the legacy %%OPTIMIZE_VERSION%% twin. */
export function readSeedOptimizeVersion(search: string = window.location.search): OptimizeVersion {
  return normalizeOptimizeVersion(new URLSearchParams(search).get('optimize_version'));
}

/** ?result_path= handoff from the optimize results panel. */
export function readResultPath(search: string = window.location.search): string {
  return new URLSearchParams(search).get('result_path') || '';
}

export interface RouteState {
  stage: ParetoStage;
  deepTab: DeepTab;
}

/**
 * readRouteState (:1794-1804): stage/deep_tab query params validated against
 * the exact vocabularies; unknown values fall back to the defaults.
 */
export function readRouteState(search: string = window.location.search): RouteState {
  const params = new URLSearchParams(search);
  const stage = String(params.get('stage') || '').trim() as ParetoStage;
  const deepTab = String(params.get('deep_tab') || '').trim() as DeepTab;
  return {
    stage: VALID_STAGES.includes(stage) ? stage : DEFAULT_STAGE,
    deepTab: VALID_DEEP_TABS.includes(deepTab) ? deepTab : DEFAULT_DEEP_TAB,
  };
}

/**
 * updateLocationState's pure core (:4123-4130): keep unrelated params and the
 * hash, set/clear result_path, always write stage + deep_tab.
 */
export function buildLocationUrl(href: string, resultPath: string, stage: string, deepTab: string): string {
  const url = new URL(href);
  if (resultPath) url.searchParams.set('result_path', resultPath);
  else url.searchParams.delete('result_path');
  url.searchParams.set('stage', stage);
  url.searchParams.set('deep_tab', deepTab);
  return url.toString();
}

/** REST base for the single pareto router (pareto_explorer.py:3352). */
export function paretoApiBase(origin: string = getBoot().origin): string {
  return origin + '/api/pareto-explorer';
}
