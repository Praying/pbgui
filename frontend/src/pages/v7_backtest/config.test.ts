import { describe, expect, it } from 'vitest';
import {
  BACKTEST_PANELS,
  BACKTEST_SORT_COLUMNS,
  BACKTEST_SORT_DEFAULTS,
  archiveApiBase,
  backtestApiBase,
  backtestApiBaseFrom,
  createBacktestAdapter,
  detectBacktestVersion,
  readDeepLinkConfig,
  viewStateKeyFor,
  wsUrl,
} from './config';

/*
 * Backtest adapter — structural port of backtest_editor_adapter.js
 * (create :16-180) plus the v7_run-style pathname flavor detection
 * (recon §4: /api/backtest-v{7,8}/main_page → version).
 */

describe('detectBacktestVersion', () => {
  it('detects v8 from the backtest-v8 route', () => {
    expect(detectBacktestVersion('/api/backtest-v8/main_page')).toBe('v8');
    expect(detectBacktestVersion('/api/backtest-v8/')).toBe('v8');
  });

  it('detects v7 from the backtest-v7 route', () => {
    expect(detectBacktestVersion('/api/backtest-v7/main_page')).toBe('v7');
    expect(detectBacktestVersion('/api/backtest-v7/main_page?draft_id=x')).toBe('v7');
  });

  it('never treats other v8 routes as the backtest page', () => {
    expect(detectBacktestVersion('/api/v8/main_page')).toBe('v7');
    expect(detectBacktestVersion('/api/optimize-v8/main_page')).toBe('v7');
    expect(detectBacktestVersion('/')).toBe('v7');
  });
});

describe('createBacktestAdapter', () => {
  it('v7 flavor fields (:122-165)', () => {
    const adapter = createBacktestAdapter('v7');
    expect(adapter.version).toBe('v7');
    expect(adapter.isV8).toBe(false);
    expect(adapter.label).toBe('PBv7');
    expect(adapter.navSubtitleParams).toEqual({ version: 'PBv7' });
    expect(adapter.navCurrent).toBe('v7_backtest');
    expect(adapter.websocketPath).toBe('/api/backtest-v7/ws/bt7');
    expect(adapter.queueLogFile('job1')).toBe('backtests/job1.log');
    expect(adapter.initialPanels).toEqual(['configs', 'queue', 'results', 'archive', 'legacy']);
    expect(adapter.navItems().map((i) => i.panel)).toEqual(['configs', 'queue', 'results', 'archive', 'legacy']);
  });

  it('v8 flavor fields (:122-165)', () => {
    const adapter = createBacktestAdapter('v8');
    expect(adapter.version).toBe('v8');
    expect(adapter.isV8).toBe(true);
    expect(adapter.label).toBe('PBv8');
    expect(adapter.navCurrent).toBe('v8_backtest');
    expect(adapter.websocketPath).toBe('/api/backtest-v8/ws/bt7');
    expect(adapter.queueLogFile('job1')).toBe('backtests_v8/job1.log');
    // R-guard: v8 drops the legacy panel (adapter.js:160-162, :165)
    expect(adapter.initialPanels).toEqual(['configs', 'queue', 'results', 'archive']);
    expect(adapter.navItems().map((i) => i.panel)).toEqual(['configs', 'queue', 'results', 'archive']);
    // the queue nav item is the only badged one (:156)
    expect(adapter.navItems().filter((i) => i.badge)).toHaveLength(1);
  });

  it('junk versions normalize to v7 (adapter.js:17)', () => {
    expect(createBacktestAdapter('V8' as never).version).toBe('v7');
    expect(createBacktestAdapter('' as never).version).toBe('v7');
  });
});

describe('api base builders', () => {
  it('backtestApiBase joins origin + router (:2836, backtest_v8 :1513)', () => {
    expect(backtestApiBase('http://h:8000', 'v7')).toBe('http://h:8000/api/backtest-v7');
    expect(backtestApiBase('http://h:8000', 'v8')).toBe('http://h:8000/api/backtest-v8');
  });

  it('backtestApiBaseFrom rewrites the version suffix (:1152-1154)', () => {
    expect(backtestApiBaseFrom('http://h:8000/api/backtest-v7', 'v8')).toBe('http://h:8000/api/backtest-v8');
    expect(backtestApiBaseFrom('http://h:8000/api/backtest-v8', 'v7')).toBe('http://h:8000/api/backtest-v7');
  });

  it('archiveApiBase always points at the v7 router (:146-148)', () => {
    expect(archiveApiBase('http://h:8000/api/backtest-v7')).toBe('http://h:8000/api/backtest-v7');
    expect(archiveApiBase('http://h:8000/api/backtest-v8')).toBe('http://h:8000/api/backtest-v7');
  });
});

describe('wsUrl', () => {
  it('rewrites the scheme like the legacy WS_BASE injection (:2837)', () => {
    expect(wsUrl(createBacktestAdapter('v7'), 'http://h:8000')).toBe('ws://h:8000/api/backtest-v7/ws/bt7');
    expect(wsUrl(createBacktestAdapter('v8'), 'https://h')).toBe('wss://h/api/backtest-v8/ws/bt7');
  });
});

describe('view-state vocabulary (schema-frozen, R2)', () => {
  it('the localStorage key carries the version (:1068)', () => {
    expect(viewStateKeyFor('v7')).toBe('pbgui:v7_backtest:view_state');
    expect(viewStateKeyFor('v8')).toBe('pbgui:v8_backtest:view_state');
  });

  it('panel vocabulary (:1354)', () => {
    expect(BACKTEST_PANELS).toEqual(['configs', 'queue', 'results', 'archive', 'legacy']);
  });

  it('sort defaults (:1069-1074)', () => {
    expect(BACKTEST_SORT_DEFAULTS).toEqual({
      configs: { col: 'modified', asc: false },
      results: { col: 'modified', asc: false },
      archive: { col: 'adg', asc: false },
      legacy: { col: 'adg', asc: false },
    });
  });

  it('sort column whitelists (:1075-1080)', () => {
    expect(BACKTEST_SORT_COLUMNS.configs).toContain('name');
    expect(BACKTEST_SORT_COLUMNS.configs).toContain('modified');
    expect(BACKTEST_SORT_COLUMNS.results).toContain('backtest_version');
    expect(BACKTEST_SORT_COLUMNS.archive).not.toContain('strategy');
    expect(BACKTEST_SORT_COLUMNS.legacy).not.toContain('backtest_version');
    for (const table of Object.keys(BACKTEST_SORT_DEFAULTS) as (keyof typeof BACKTEST_SORT_DEFAULTS)[]) {
      // every default must be inside its own whitelist or normalize would drop it
      expect(BACKTEST_SORT_COLUMNS[table]).toContain(BACKTEST_SORT_DEFAULTS[table].col);
    }
  });
});

describe('readDeepLinkConfig (:2164-2168)', () => {
  it('reads the ?config= migration target', () => {
    expect(readDeepLinkConfig('?config=my_cfg')).toBe('my_cfg');
    expect(readDeepLinkConfig('?draft_id=abc')).toBe('');
    expect(readDeepLinkConfig('')).toBe('');
  });
});
