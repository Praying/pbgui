import { getBoot } from '@/shared/boot';
import type { ArchiveMode, BacktestPanel, BacktestSorts, BacktestVersion, NavItem, SortSpec } from './types';

/**
 * Backtest workbench page config — the Vue replacement for the legacy
 * server injections (v7_backtest.html:1014-1024, api/backtest_v7.py
 * :2822-2857, api/backtest_v8.py:1503-1527):
 *
 *   TOKEN            ← %%TOKEN%%          (v7 route only; help-only consumer —
 *                                           Vue takes bootToken() instead, R13)
 *   API_BASE         ← %%API_BASE%%       (origin + /api/backtest-v{7,8})
 *   WS_BASE          ← %%WS_BASE%%        (boot origin, ws/wss scheme)
 *   BACKTEST_VERSION ← %%BACKTEST_VERSION%%
 *   LABEL/SUBTITLE/NAV_CURRENT — computed client-side (:1021-1022)
 *
 * Both routes serve the SAME Vue build; the flavour comes from the
 * serving route's pathname (the v7_run pattern, recon §4). The adapter
 * below is the structural port of backtest_editor_adapter.js:16-180 —
 * minus installRunHandoff()/configureUi() (DOM globals for the legacy
 * result/config buttons; their typed equivalents land with the
 * M-v7-9/M-v7-12 surfaces).
 */

export type { ArchiveMode, BacktestPanel, BacktestSorts, BacktestVersion, NavItem, SortSpec } from './types';

export interface BacktestAdapter {
  readonly version: BacktestVersion;
  readonly isV8: boolean;
  /** 'PBv7' | 'PBv8' — the nav subtitle param (:1021). */
  readonly label: 'PBv7' | 'PBv8';
  readonly navSubtitleKey: 'v7backtest.navSubtitle';
  readonly navSubtitleParams: { version: string };
  readonly navCurrent: 'v7_backtest' | 'v8_backtest';
  readonly titleKey: 'v7backtest.pageTitle';
  readonly titleParams: { label: string };
  /** WS path — v8 keeps the bt7 suffix (:149). */
  readonly websocketPath: `/api/backtest-v${'7' | '8'}/ws/bt7`;
  /** Result log path prefix (:150-152). */
  readonly queueLogFilePrefix: 'backtests_v8/' | 'backtests/';
  /** queueLogFile (:150-152). */
  queueLogFile(filename: string): string;
  /** Panels the flavour serves — v8 drops legacy (:165). */
  readonly initialPanels: readonly BacktestPanel[];
  /** navItems() (:153-164). */
  navItems(): NavItem[];
}

export function createBacktestAdapter(version: BacktestVersion): BacktestAdapter {
  const isV8 = version === 'v8';
  const panels: readonly BacktestPanel[] = isV8
    ? ['configs', 'queue', 'results', 'archive']
    : ['configs', 'queue', 'results', 'archive', 'legacy'];
  return {
    version: isV8 ? 'v8' : 'v7',
    isV8,
    label: isV8 ? 'PBv8' : 'PBv7',
    navSubtitleKey: 'v7backtest.navSubtitle',
    navSubtitleParams: { version: isV8 ? 'PBv8' : 'PBv7' },
    navCurrent: isV8 ? 'v8_backtest' : 'v7_backtest',
    titleKey: 'v7backtest.pageTitle',
    titleParams: { label: isV8 ? 'PBv8' : 'PBv7' },
    websocketPath: isV8 ? '/api/backtest-v8/ws/bt7' : '/api/backtest-v7/ws/bt7',
    queueLogFilePrefix: isV8 ? 'backtests_v8/' : 'backtests/',
    queueLogFile: (filename) => (isV8 ? 'backtests_v8/' : 'backtests/') + filename + '.log',
    initialPanels: panels,
    navItems: () => navItems(createBacktestAdapter(isV8 ? 'v8' : 'v7')),
  };
}

/**
 * The serving route's flavour: /api/backtest-v8/… → 'v8', anything else
 * → 'v7'. Anchored on the backtest-v8 segment so /api/v8/… and
 * /api/optimize-v8/… never match.
 */
export function detectBacktestVersion(pathname: string = window.location.pathname): BacktestVersion {
  return /\/api\/backtest-v8(\/|$)/.test(pathname) ? 'v8' : 'v7';
}

/** The adapter for the page the browser is on. */
export function currentBacktestAdapter(pathname: string = window.location.pathname): BacktestAdapter {
  return createBacktestAdapter(detectBacktestVersion(pathname));
}

/** REST base for the serving router (:2836, backtest_v8.py:1513). */
export function backtestApiBase(origin: string = getBoot().origin, version: BacktestVersion = detectBacktestVersion()): string {
  return `${origin}/api/backtest-${version}`;
}

/** Legacy backtestApiBase (:1152-1154): rewrite the version suffix of any base. */
export function backtestApiBaseFrom(apiBase: string, version: BacktestVersion): string {
  return String(apiBase || '').replace(/\/backtest-v[78]$/, '/backtest-' + version);
}

/** Archives always live on the v7 router (adapter.js:146-148). */
export function archiveApiBase(apiBase: string): string {
  return String(apiBase || '').replace(/\/backtest-v[78]$/, '/backtest-v7');
}

/** Result log path (:150-152). */
export function queueLogFile(adapter: BacktestAdapter, filename: string): string {
  return adapter.queueLogFilePrefix + filename + '.log';
}

/** WS_BASE + adapter.websocketPath (:1269) with the legacy scheme rewrite. */
export function wsUrl(adapter: BacktestAdapter, origin: string = getBoot().origin): string {
  return `${origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}${adapter.websocketPath}`;
}

/** Sidebar nav items (adapter.js:153-164): queue is badged; v8 drops legacy. */
export function navItems(adapter: BacktestAdapter): NavItem[] {
  const items: NavItem[] = [
    { panel: 'configs', icon: '📋', labelKey: 'editor.shell.navConfigs' },
    { panel: 'queue', icon: '⏳', labelKey: 'editor.shell.navQueue', badge: true },
    { panel: 'results', icon: '📊', labelKey: 'editor.shell.navResults' },
  ];
  items.push({ panel: 'archive', icon: '🗄️', labelKey: 'editor.backtest.navArchive' });
  if (!adapter.isV8) {
    items.push({ panel: 'legacy', icon: '🧭', labelKey: 'editor.backtest.navLegacy' });
  }
  return items;
}

/* ── Persisted view state vocabulary (schema-frozen, R2) ─────────────── */

export const BACKTEST_PANELS: readonly BacktestPanel[] = ['configs', 'queue', 'results', 'archive', 'legacy'];

/** localStorage key per flavour (:1068) — never rename. */
export function viewStateKeyFor(version: BacktestVersion): `pbgui:v${'7' | '8'}_backtest:view_state` {
  return `pbgui:v${version === 'v8' ? '8' : '7'}_backtest:view_state`;
}

/** BACKTEST_SORT_DEFAULTS (:1069-1074). */
export const BACKTEST_SORT_DEFAULTS: Record<keyof BacktestSorts, SortSpec> = {
  configs: { col: 'modified', asc: false },
  results: { col: 'modified', asc: false },
  archive: { col: 'adg', asc: false },
  legacy: { col: 'adg', asc: false },
};

/** BACKTEST_SORT_COLUMNS whitelists (:1075-1080). */
export const BACKTEST_SORT_COLUMNS: Record<keyof BacktestSorts, readonly string[]> = {
  configs: ['name', 'exchanges', 'strategy', 'coins', 'twe_long', 'start_date', 'end_date', 'results', 'modified'],
  results: [
    'backtest_version',
    'config_name',
    'strategy',
    'coins_text',
    'exchange_dir',
    'modified',
    'adg',
    'gain',
    'drawdown_worst',
    'sharpe_ratio',
    'starting_balance',
    'final_balance',
  ],
  archive: [
    'backtest_version',
    'config_name',
    'coins_text',
    'exchange_dir',
    'modified',
    'adg',
    'gain',
    'drawdown_worst',
    'sharpe_ratio',
    'starting_balance',
    'final_balance',
  ],
  legacy: [
    'config_name',
    'coins_text',
    'exchange_dir',
    'modified',
    'adg',
    'gain',
    'drawdown_worst',
    'sharpe_ratio',
    'starting_balance',
    'final_balance',
  ],
};

/** The v8 migration deep link ?config= (:2164-2168; consumer is M-v7-9). */
export function readDeepLinkConfig(search: string = window.location.search): string {
  return new URLSearchParams(search).get('config') || '';
}
