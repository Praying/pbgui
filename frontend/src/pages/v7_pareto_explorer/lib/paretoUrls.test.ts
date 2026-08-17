import { describe, expect, it } from 'vitest';
import {
  backToOptimizeResultsUrl,
  backtestApiBase,
  buildBacktestMainPageUrl,
  buildOptimizeMainPageUrl,
  optimizeApiBase,
  strategyExplorerApiBase,
} from './paretoUrls';

/*
 * Cross-page URL builders — every builder takes the RUNTIME optimize version
 * (:1782-1792 parity). This is the one page where pathname detection is
 * wrong: a v8-seeded page can display a v7 result and vice versa.
 */

const ORIGIN = 'http://pbgui.test:8000';

describe('api bases per runtime version (:1782-1792)', () => {
  it('optimizeApiBase follows the version', () => {
    expect(optimizeApiBase('v7', ORIGIN)).toBe(ORIGIN + '/api/optimize-v7');
    expect(optimizeApiBase('v8', ORIGIN)).toBe(ORIGIN + '/api/optimize-v8');
  });

  it('backtestApiBase follows the version', () => {
    expect(backtestApiBase('v7', ORIGIN)).toBe(ORIGIN + '/api/backtest-v7');
    expect(backtestApiBase('v8', ORIGIN)).toBe(ORIGIN + '/api/backtest-v8');
  });

  it('strategyExplorerApiBase maps v8 to the v8-only route', () => {
    expect(strategyExplorerApiBase('v7', ORIGIN)).toBe(ORIGIN + '/api/strategy-explorer');
    expect(strategyExplorerApiBase('v8', ORIGIN)).toBe(ORIGIN + '/api/strategy-explorer-v8');
  });
});

describe('main_page URL builders (:1826-1844)', () => {
  it('keeps non-empty params and drops empty/null/undefined values', () => {
    expect(buildBacktestMainPageUrl('v8', ORIGIN, { opt_draft_id: 'd1', draft_name: '' })).toBe(
      ORIGIN + '/api/backtest-v8/main_page?opt_draft_id=d1'
    );
    expect(buildOptimizeMainPageUrl('v7', ORIGIN, { open_config: 'cfg.json', dead: null, gone: undefined })).toBe(
      ORIGIN + '/api/optimize-v7/main_page?open_config=cfg.json'
    );
  });

  it('encodes values via URLSearchParams (:1869-1881 draft handoff shape)', () => {
    // legacy used URLSearchParams.toString(): space → '+', '&' → '%26'
    expect(buildBacktestMainPageUrl('v7', ORIGIN, { opt_draft_id: 'a b&c' })).toBe(
      ORIGIN + '/api/backtest-v7/main_page?opt_draft_id=a+b%26c'
    );
  });

  it('produces a bare main_page when no params survive', () => {
    expect(buildOptimizeMainPageUrl('v8', ORIGIN, {})).toBe(ORIGIN + '/api/optimize-v8/main_page');
  });
});

describe('backToOptimizeResultsUrl (:4482-4487)', () => {
  it('targets the runtime optimize version results panel with the #results deep link', () => {
    expect(backToOptimizeResultsUrl('v7', ORIGIN)).toBe(ORIGIN + '/api/optimize-v7/main_page?panel=results#results');
    expect(backToOptimizeResultsUrl('v8', ORIGIN)).toBe(ORIGIN + '/api/optimize-v8/main_page?panel=results#results');
  });
});
