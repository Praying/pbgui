import { getBoot } from '@/shared/boot';

/**
 * Strategy Explorer page config — the Vue replacement for the legacy
 * server-side flavour injection (v7_strategy_explorer.html:378-385,
 * api/strategy_explorer.py:162-192, api/strategy_explorer_v8.py:523-553):
 *
 *   API_BASE    ← %%API_BASE%%    (origin + /api/strategy-explorer[-v8])
 *   WS_BASE     ← %%WS_BASE%%     (origin with ws/wss scheme — never read by
 *                                  the legacy script body beyond declaration)
 *   DRAFT_ID    ← %%DRAFT_ID%%    (?draft_id= query param)
 *   RESULT_PATH ← %%RESULT_PATH%% (?result_path= query param, v7 only)
 *   VERSION/SERIAL ← boot.js
 *
 * Both routes serve the SAME Vue build, so the flavour is derived from the
 * serving route's path — the twin of v7_run's config.ts detectRunVersion.
 */

export type ExplorerFlavor = 'v7' | 'v8';

export interface ExplorerSimulationMode {
  readonly key: string;
  readonly labelKey: string;
}

export interface ExplorerAdapter {
  readonly flavor: ExplorerFlavor;
  readonly isV8: boolean;
  /** 'PB8' | 'PB7' — v8 can be overridden by page.strategy_label (:506). */
  readonly strategyLabel: string;
  readonly navCurrent: 'v7_strategy_explorer' | 'v8_strategy_explorer';
  readonly navSubtitleKey: 'v7explore.navSubtitleV8' | 'v7explore.navSubtitleV7';
  readonly titleKey: 'v7explore.titleV8' | 'v7explore.titleV7';
  readonly subtitleKey: 'v7explore.subtitleV8' | 'v7explore.subtitleV7';
  readonly pageTitleKey: 'v7explore.pageTitleV8' | 'v7explore.pageTitleV7';
  readonly compareModePrimaryKey: 'v7explore.compareModePrimaryV8' | 'v7explore.compareModePrimary';
  /** Simulation-mode buttons in flavour order (:483-486 configureSimulationModes). */
  readonly defaultSimulationModes: readonly ExplorerSimulationMode[];
}

export function createExplorerAdapter(flavor: ExplorerFlavor): ExplorerAdapter {
  const isV8 = flavor === 'v8';
  return {
    flavor: isV8 ? 'v8' : 'v7',
    isV8,
    strategyLabel: isV8 ? 'PB8' : 'PB7',
    navCurrent: isV8 ? 'v8_strategy_explorer' : 'v7_strategy_explorer',
    navSubtitleKey: isV8 ? 'v7explore.navSubtitleV8' : 'v7explore.navSubtitleV7',
    titleKey: isV8 ? 'v7explore.titleV8' : 'v7explore.titleV7',
    subtitleKey: isV8 ? 'v7explore.subtitleV8' : 'v7explore.subtitleV7',
    pageTitleKey: isV8 ? 'v7explore.pageTitleV8' : 'v7explore.pageTitleV7',
    compareModePrimaryKey: isV8 ? 'v7explore.compareModePrimaryV8' : 'v7explore.compareModePrimary',
    defaultSimulationModes: isV8
      ? [{ key: 'pb8_engine', labelKey: 'v7explore.simModePb8Replay' }]
      : [
          { key: 'local_simulation', labelKey: 'v7explore.simModeLocalSimulation' },
          { key: 'pb7_engine', labelKey: 'v7explore.simModePb7Engine' },
        ],
  };
}

/**
 * The serving route's flavour: /api/strategy-explorer-v8/... → 'v8', the
 * /api/strategy-explorer route → 'v7' (legacy IS_V8 regex :384 tested the
 * injected API_BASE; the path carries the same signal).
 */
export function detectExplorerFlavor(pathname: string = window.location.pathname): ExplorerFlavor {
  return /\/api\/strategy-explorer-v8(\/|$)/.test(pathname) ? 'v8' : 'v7';
}

/** The adapter for the page the browser is on. */
export function currentExplorerAdapter(
  pathname: string = window.location.pathname,
  origin: string = getBoot().origin
): { adapter: ExplorerAdapter; origin: string } {
  return { adapter: createExplorerAdapter(detectExplorerFlavor(pathname)), origin };
}

/** REST base for the explorer router (:176 v7, :534 v8). */
export function explorerApiBase(adapter: ExplorerAdapter, origin: string = getBoot().origin): string {
  return origin + (adapter.isV8 ? '/api/strategy-explorer-v8' : '/api/strategy-explorer');
}

/** ?draft_id= handoff from the route query (:164/:524). */
export function readDraftId(search: string = window.location.search): string {
  return new URLSearchParams(search).get('draft_id') || '';
}

/** ?result_path= handoff — only the v7 route forwards it (:165). */
export function readResultPath(search: string = window.location.search): string {
  return new URLSearchParams(search).get('result_path') || '';
}

/** Legacy /session query builder (:3117-3118) — v8 omits result_path. */
export function sessionUrl(adapter: ExplorerAdapter, draftId: string, resultPath: string): string {
  const qs = '?draft_id=' + encodeURIComponent(draftId || '');
  if (adapter.isV8) return '/session' + qs;
  return '/session' + qs + '&result_path=' + encodeURIComponent(resultPath || '');
}

/** sessionStorage key (:408) — namespaced by flavour and draft id. */
export function refreshCacheKey(adapter: ExplorerAdapter, draftId: string): string {
  return 'pbgui_strategy_explorer_refresh:' + (adapter.isV8 ? 'v8:' : 'v7:') + (draftId || 'default');
}

/** Legacy STRATEGY_REFRESH_CACHE_MAX_BYTES (:409). */
export const REFRESH_CACHE_MAX_BYTES = 3 * 1024 * 1024;
