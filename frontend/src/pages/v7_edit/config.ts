import { getBoot } from '@/shared/boot';

/**
 * PBv7/PBv8 shared Run editor config — the Vue replacement for the injected
 * vars (v7_edit.html:1223-1232) and frontend/js/run_editor_adapter.js (209 L,
 * ported below as createEditAdapter). Both serving routes mount the SAME Vue
 * build:
 *
 *   /api/v7/edit_page  (api/v7_instances.py get_edit_page)
 *   /api/v8/edit_page  (api/v8_instances.py get_v8_edit_page)
 *
 * The flavour comes from the serving route's path; name/new/draft_id come
 * from the query string (the legacy %%INSTANCE%%/%%IS_NEW%%/%%DRAFT_ID%%
 * injections carried exactly those three values).
 */

export type EditFlavor = 'v7' | 'v8';

/** Structural port of window.PBGuiRunEditorAdapter.create (run_editor_adapter.js:20-205). */
export interface EditAdapter {
  readonly version: EditFlavor;
  readonly isV8: boolean;
  /** 'PB8' | 'PB7'. */
  readonly label: string;
  readonly navSubtitleKey: 'editor.run.editNavSubtitle';
  readonly navSubtitleParams: { version: string };
  /** The edit page highlights the RUN nav entry (adapter navCurrent, :110). */
  readonly navCurrent: 'v7_run' | 'v8_run';
  readonly titleKey: 'v7run.titleEdit' | 'v7run.titleEditV8';
  readonly sidebarTitleKey: 'v7run.editInstance' | 'v7run.editPb8Instance';
  readonly backtestPath: '/api/backtest-v7/main_page' | '/api/backtest-v8/main_page';
  readonly supportsStrategyExplorer: true;
  readonly supportsDynamicIgnore: boolean;
  readonly supportsBalanceCalculator: true;
  readonly capabilityKey: 'pb7_capable' | 'pb8_capable';
  /** Seed KNOWN_LIVE_PARAMS for v8; v7 uses the page list (liveParams.ts). */
  readonly knownLiveParams: readonly string[] | null;
  readonly managedLiveValue: (key: string, values: Record<string, unknown>) => unknown;
  readonly readLiveValue: (live: Record<string, unknown>, key: string) => unknown;
  readonly getBotValue: (sideConfig: Record<string, unknown>, key: string, fallback: unknown) => unknown;
  readonly setBotValue: (sideConfig: Record<string, unknown>, key: string, value: unknown) => void;
  readonly newInstanceName: (config: Record<string, unknown>) => string;
  readonly saveQuery: (isNew: boolean) => string;
  readonly saveBody: (
    config: Record<string, unknown>,
    overrideConfigs: { files?: Record<string, unknown> } | Record<string, unknown> | null,
    expectedVersion: number | string
  ) => Record<string, unknown>;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function createEditAdapter(flavor: EditFlavor): EditAdapter {
  const isV8 = flavor === 'v8';
  /** v8 bot params live under side.risk, v7 at the side root (:98-103). */
  const risk = (sideConfig: Record<string, unknown>): Record<string, unknown> => {
    if (!isV8) return sideConfig;
    const existing = sideConfig.risk;
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      sideConfig.risk = {};
    }
    return sideConfig.risk as Record<string, unknown>;
  };
  return {
    version: isV8 ? 'v8' : 'v7',
    isV8,
    label: isV8 ? 'PB8' : 'PB7',
    navSubtitleKey: 'editor.run.editNavSubtitle',
    navSubtitleParams: { version: isV8 ? '8' : '7' },
    navCurrent: isV8 ? 'v8_run' : 'v7_run',
    titleKey: isV8 ? 'v7run.titleEditV8' : 'v7run.titleEdit',
    sidebarTitleKey: isV8 ? 'v7run.editPb8Instance' : 'v7run.editInstance',
    backtestPath: isV8 ? '/api/backtest-v8/main_page' : '/api/backtest-v7/main_page',
    supportsStrategyExplorer: true,
    supportsDynamicIgnore: !isV8,
    supportsBalanceCalculator: true,
    capabilityKey: isV8 ? 'pb8_capable' : 'pb7_capable',
    knownLiveParams: isV8 ? ['user', 'approved_coins', 'ignored_coins'] : null,
    managedLiveValue(key, values) {
      const sourceKey =
        key === 'limit_order_create_max_market_dist_pct'
          ? 'initial_entry_exec_max_market_dist_pct'
          : key;
      return object(values)[sourceKey];
    },
    readLiveValue(live, key) {
      if (isV8 && key === 'initial_entry_exec_max_market_dist_pct' && live.limit_order_create_max_market_dist_pct !== undefined) {
        return live.limit_order_create_max_market_dist_pct;
      }
      return live[key];
    },
    getBotValue(sideConfig, key, fallback) {
      const value = risk(sideConfig)[key];
      return value === undefined || value === null ? fallback : value;
    },
    setBotValue(sideConfig, key, value) {
      risk(sideConfig)[key] = value;
    },
    newInstanceName(config) {
      return String(object(object(config).live).user ?? '').trim();
    },
    saveQuery(isNew) {
      return isV8 && isNew ? '?create_only=true' : '';
    },
    saveBody(config, overrideConfigs, expectedVersion) {
      if (!isV8) return { config };
      return {
        config,
        override_configs: object(object(overrideConfigs).files),
        expected_version: Number(expectedVersion || 0),
      };
    },
  };
}

/**
 * The serving route's flavour: /api/v8/edit_page → 'v8', the /api/v7 route →
 * 'v7' (legacy RUN_VERSION injection; the path carries the same signal).
 */
export function detectEditFlavor(pathname: string = window.location.pathname): EditFlavor {
  return /\/api\/v8\/edit_page/.test(pathname) ? 'v8' : 'v7';
}

/** The adapter for the page the browser is on. */
export function currentEditAdapter(pathname: string = window.location.pathname): EditAdapter {
  return createEditAdapter(detectEditFlavor(pathname));
}

export interface EditPageParams {
  readonly name: string;
  readonly isNew: boolean;
  readonly draftId: string;
}

/** name|new|draft_id query vocabulary of both edit routes (:2494-2497 / :1840-1845). */
export function readEditPageParams(search: string = window.location.search): EditPageParams {
  const query = new URLSearchParams(search);
  return {
    name: query.get('name') || '',
    isNew: query.get('new') === '1',
    draftId: query.get('draft_id') || '',
  };
}

/** REST base for the editing router (legacy %%API_BASE%%, :1223). */
export function editApiBase(adapter: EditAdapter, origin: string = getBoot().origin): string {
  return `${origin}/api/${adapter.version}`;
}

/** Back-to-list target (goBack :1696). */
export function runListUrl(apiBase: string): string {
  return apiBase + '/main_page';
}
