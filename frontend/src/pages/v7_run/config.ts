import { getBoot } from '@/shared/boot';

/**
 * PBv7/PBv8 Run list page config — the Vue replacement for the legacy
 * server-side injections (v7_run.html:567-574, api/v7_instances.py
 * :2449-2481, api/v8_instances.py :1787-1816):
 *
 *   API_BASE    ← %%API_BASE%%     (origin + /api/v7 | /api/v8)
 *   WS_BASE     ← %%WS_BASE%%      (origin with ws/wss scheme)
 *   RUN_VERSION ← %%RUN_VERSION%%  ("v7" from the v7 route, "v8" from v8)
 *
 * Both routes serve the SAME Vue build, so the run version is derived from
 * the serving route's path — the one difference the injected constant used
 * to carry. run_list_adapter.js (frontend/js/run_list_adapter.js) is the
 * legacy twin of createRunAdapter() below; the Vue page does not load it.
 */

export type RunVersion = 'v7' | 'v8';

/** Structural port of window.PBGuiRunListAdapter.create (run_list_adapter.js:16-37). */
export interface RunAdapter {
  readonly version: RunVersion;
  readonly isV8: boolean;
  /** 'PB8' | 'PB7' — used for the empty-list message (:887). */
  readonly label: string;
  readonly navSubtitleKey: 'editor.run.navSubtitle';
  readonly navSubtitleParams: { version: string };
  readonly navCurrent: 'v7_run' | 'v8_run';
  readonly websocketPath: '/api/v7/ws/v7' | '/api/v8/ws/v8';
  readonly supportsBackups: true;
  readonly supportsForcedModes: boolean;
  readonly supportsConversion: boolean;
  readonly titleKey: 'v7run.title' | 'v7run.titleV8';
  readonly addInstanceKey: 'v7run.addInstance' | 'v7run.addPb8Instance';
}

export function createRunAdapter(version: RunVersion): RunAdapter {
  const isV8 = version === 'v8';
  return {
    version: isV8 ? 'v8' : 'v7',
    isV8,
    label: isV8 ? 'PB8' : 'PB7',
    navSubtitleKey: 'editor.run.navSubtitle',
    navSubtitleParams: { version: isV8 ? '8' : '7' },
    navCurrent: isV8 ? 'v8_run' : 'v7_run',
    websocketPath: isV8 ? '/api/v8/ws/v8' : '/api/v7/ws/v7',
    supportsBackups: true,
    supportsForcedModes: !isV8,
    supportsConversion: !isV8,
    titleKey: isV8 ? 'v7run.titleV8' : 'v7run.title',
    addInstanceKey: isV8 ? 'v7run.addPb8Instance' : 'v7run.addInstance',
  };
}

/**
 * The serving route's version segment: /api/v8/main_page → 'v8', anything
 * else (the /api/v7 route) → 'v7'. '/api/backtest-v8/...' must NOT match —
 * the regex anchors on the version segment right after /api/.
 */
export function detectRunVersion(pathname: string = window.location.pathname): RunVersion {
  return /\/api\/v8(\/|$)/.test(pathname) ? 'v8' : 'v7';
}

/** The adapter for the page the browser is on. */
export function currentRunAdapter(pathname: string = window.location.pathname): RunAdapter {
  return createRunAdapter(detectRunVersion(pathname));
}

/** REST base for the run router, e.g. http://host:port/api/v7 (:2462). */
export function runApiBase(adapter: RunAdapter): string {
  return `${getBoot().origin}/api/${adapter.version}`;
}

/** Legacy plain concatenation (apiFetch(path) = API_BASE + path, :585-591). */
export function apiUrl(adapter: RunAdapter, path: string): string {
  return runApiBase(adapter) + path;
}

/**
 * Legacy WS_BASE + adapter.websocketPath (:619): the origin with the scheme
 * rewritten to ws/wss. The boot origin always carries http(s).
 */
export function wsUrl(adapter: RunAdapter): string {
  return `${getBoot().origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}${adapter.websocketPath}`;
}

/** Legacy edit-page navigation (editInstance :900, addInstance :906). */
export function editPageUrl(adapter: RunAdapter, name: string | null): string {
  return name === null
    ? apiUrl(adapter, '/edit_page?new=1')
    : apiUrl(adapter, '/edit_page?name=' + encodeURIComponent(name));
}

/** Cross-router targets the legacy page reached via window.location.origin. */
export function balanceCalcPageUrl(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${getBoot().origin}/api/balance-calc/main_page?${query.toString()}`;
}

export function backtestV8PageUrl(config: string): string {
  return `${getBoot().origin}/api/backtest-v8/main_page?config=${encodeURIComponent(config)}`;
}

export function migrateV7Url(): string {
  return `${getBoot().origin}/api/backtest-v8/migrate-v7`;
}

/**
 * Legacy convert target name (:911): strip path/control characters, cap at
 * 120 chars, append '_v8'.
 */
export function convertTargetName(name: string): string {
  return String(name || '').replace(/[\\/\x00-\x1f]/g, '_').slice(0, 120) + '_v8';
}
