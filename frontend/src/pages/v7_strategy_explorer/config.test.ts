import { describe, expect, it, vi } from 'vitest';
import {
  createExplorerAdapter,
  detectExplorerFlavor,
  explorerApiBase,
  readDraftId,
  readResultPath,
  refreshCacheKey,
  sessionUrl,
} from './config';

/*
 * Dual-flavor config — the Strategy Explorer twin of v7_run's
 * detectRunVersion/config.ts (frontend/src/pages/v7_run/config.test.ts).
 *
 * The legacy page derived its flavour from the injected API_BASE
 * (v7_strategy_explorer.html:384):
 *
 *   var IS_V8 = /\/api\/strategy-explorer-v8(?:\/|$)/.test(String(API_BASE || ''));
 *
 * api/strategy_explorer.py:176 always injected origin +
 * "/api/strategy-explorer" while api/strategy_explorer_v8.py:534 injected
 * origin + route_base ("/api/strategy-explorer-v8") — so the only flavour
 * signal is the serving route's path, exactly like /api/v7 vs /api/v8.
 */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: 'v1.99', serial: 'S9' })),
}));

describe('detectExplorerFlavor (legacy IS_V8 :384)', () => {
  it('detects the v8 flavour from the /api/strategy-explorer-v8 route', () => {
    expect(detectExplorerFlavor('/api/strategy-explorer-v8/main_page')).toBe('v8');
  });

  it('detects the v7 flavour from the /api/strategy-explorer route', () => {
    expect(detectExplorerFlavor('/api/strategy-explorer/main_page')).toBe('v7');
  });

  it('does not treat the bare v7 router prefix as v8', () => {
    // '/api/strategy-explorer' contains no '-v8' segment — the regex anchors
    // on the exact v8 route segment, so this must stay v7.
    expect(detectExplorerFlavor('/api/strategy-explorer/main_page')).not.toBe('v8');
  });
});

describe('createExplorerAdapter', () => {
  it('v8 adapter: PB8 label, v8 nav id, v8-only simulation mode (:385, :483-486, :3271)', () => {
    const adapter = createExplorerAdapter('v8');
    expect(adapter.isV8).toBe(true);
    expect(adapter.strategyLabel).toBe('PB8');
    expect(adapter.navCurrent).toBe('v8_strategy_explorer');
    expect(adapter.navSubtitleKey).toBe('v7explore.navSubtitleV8');
    expect(adapter.titleKey).toBe('v7explore.titleV8');
    expect(adapter.subtitleKey).toBe('v7explore.subtitleV8');
    expect(adapter.pageTitleKey).toBe('v7explore.pageTitleV8');
    // v8 keeps exactly ONE simulation mode (:486 `modes.slice(0, 1)`)
    expect(adapter.defaultSimulationModes.map((m) => m.key)).toEqual(['pb8_engine']);
  });

  it('v7 adapter: PB7 label, v7 nav id, two simulation modes (:485)', () => {
    const adapter = createExplorerAdapter('v7');
    expect(adapter.isV8).toBe(false);
    expect(adapter.strategyLabel).toBe('PB7');
    expect(adapter.navCurrent).toBe('v7_strategy_explorer');
    expect(adapter.navSubtitleKey).toBe('v7explore.navSubtitleV7');
    expect(adapter.titleKey).toBe('v7explore.titleV7');
    expect(adapter.subtitleKey).toBe('v7explore.subtitleV7');
    expect(adapter.pageTitleKey).toBe('v7explore.pageTitleV7');
    expect(adapter.defaultSimulationModes.map((m) => m.key)).toEqual(['local_simulation', 'pb7_engine']);
  });
});

describe('explorerApiBase (:176 / :534 injections)', () => {
  it('v7 base is the origin + /api/strategy-explorer', () => {
    expect(explorerApiBase(createExplorerAdapter('v7'))).toBe('http://pbgui.test:8000/api/strategy-explorer');
  });

  it('v8 base is the origin + /api/strategy-explorer-v8 (request route path)', () => {
    expect(explorerApiBase(createExplorerAdapter('v8'))).toBe('http://pbgui.test:8000/api/strategy-explorer-v8');
  });
});

describe('query-param handoff (:159/:166-167 v7, :523-524 v8)', () => {
  it('reads draft_id and result_path from the query string', () => {
    const search = '?draft_id=d-42&result_path=%2Fdata%2Fbacktest%2F2024';
    expect(readDraftId(search)).toBe('d-42');
    expect(readResultPath(search)).toBe('/data/backtest/2024');
  });

  it('returns empty strings without params', () => {
    expect(readDraftId('')).toBe('');
    expect(readResultPath('')).toBe('');
  });
});

describe('sessionUrl (:3117-3118)', () => {
  it('v7 appends result_path alongside draft_id', () => {
    expect(sessionUrl(createExplorerAdapter('v7'), 'd-1', '/res/ult')).toBe(
      '/session?draft_id=d-1&result_path=%2Fres%2Fult'
    );
  });

  it('v8 omits result_path entirely', () => {
    expect(sessionUrl(createExplorerAdapter('v8'), 'd-1', '/res/ult')).toBe('/session?draft_id=d-1');
  });
});

describe('refreshCacheKey (:408)', () => {
  it('namespaces by flavour and draft id', () => {
    expect(refreshCacheKey(createExplorerAdapter('v8'), 'd-9')).toBe('pbgui_strategy_explorer_refresh:v8:d-9');
    expect(refreshCacheKey(createExplorerAdapter('v8'), '')).toBe('pbgui_strategy_explorer_refresh:v8:default');
    expect(refreshCacheKey(createExplorerAdapter('v7'), '')).toBe('pbgui_strategy_explorer_refresh:v7:default');
  });
});
