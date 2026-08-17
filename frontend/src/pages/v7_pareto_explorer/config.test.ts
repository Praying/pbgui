import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEEP_TAB,
  DEFAULT_LOAD_STRATEGY,
  DEFAULT_MAX_CONFIGS,
  DEFAULT_STAGE,
  LOAD_STRATEGY_OPTIONS,
  VALID_DEEP_TABS,
  VALID_STAGES,
  buildLocationUrl,
  normalizeOptimizeVersion,
  readResultPath,
  readRouteState,
  readSeedOptimizeVersion,
} from './config';

/*
 * Page config — pareto is the ONLY runtime-flavor page of the v7/v8 module:
 * the seed comes from the ?optimize_version= query (the server already
 * resolved result-dir version vs query, pareto_explorer.py:3359-3362) and
 * optimizeVersion() re-resolves per result at runtime (:1765-1768).
 */

describe('normalizeOptimizeVersion (:1697/:1768)', () => {
  it('maps only v8 — case-insensitive — to v8', () => {
    expect(normalizeOptimizeVersion('v8')).toBe('v8');
    expect(normalizeOptimizeVersion('V8')).toBe('v8');
    expect(normalizeOptimizeVersion(' v8 ')).toBe('v8');
  });

  it('resolves everything else to v7', () => {
    expect(normalizeOptimizeVersion('v7')).toBe('v7');
    expect(normalizeOptimizeVersion('V7')).toBe('v7');
    expect(normalizeOptimizeVersion('v9')).toBe('v7');
    expect(normalizeOptimizeVersion('')).toBe('v7');
    expect(normalizeOptimizeVersion(undefined)).toBe('v7');
    expect(normalizeOptimizeVersion(null)).toBe('v7');
    expect(normalizeOptimizeVersion(8)).toBe('v7');
  });
});

describe('readSeedOptimizeVersion (?optimize_version= query)', () => {
  it('reads and normalizes the query param', () => {
    expect(readSeedOptimizeVersion('?optimize_version=v8')).toBe('v8');
    expect(readSeedOptimizeVersion('?result_path=/x&optimize_version=V8')).toBe('v8');
    expect(readSeedOptimizeVersion('?optimize_version=v7')).toBe('v7');
  });

  it('defaults to v7 when absent or junk', () => {
    expect(readSeedOptimizeVersion('')).toBe('v7');
    expect(readSeedOptimizeVersion('?result_path=/x')).toBe('v7');
    expect(readSeedOptimizeVersion('?optimize_version=nope')).toBe('v7');
  });
});

describe('readResultPath (?result_path= query)', () => {
  it('reads the raw path', () => {
    expect(readResultPath('?result_path=/opt/backtests/2024-01-01_01-02-03')).toBe('/opt/backtests/2024-01-01_01-02-03');
  });
  it('is empty when absent', () => {
    expect(readResultPath('?stage=settings')).toBe('');
    expect(readResultPath('')).toBe('');
  });
});

describe('readRouteState (:1794-1804 stage/deep_tab whitelists)', () => {
  it('accepts whitelisted values', () => {
    expect(readRouteState('?stage=pareto_playground&deep_tab=evolution')).toEqual({
      stage: 'pareto_playground',
      deepTab: 'evolution',
    });
    expect(readRouteState('?stage=settings&deep_tab=correlations')).toEqual({
      stage: 'settings',
      deepTab: 'correlations',
    });
  });

  it('keeps defaults for unknown or missing values', () => {
    expect(readRouteState('')).toEqual({ stage: DEFAULT_STAGE, deepTab: DEFAULT_DEEP_TAB });
    expect(DEFAULT_STAGE).toBe('command_center');
    expect(DEFAULT_DEEP_TAB).toBe('parameters');
    expect(readRouteState('?stage=bogus&deep_tab=bogus')).toEqual({ stage: 'command_center', deepTab: 'parameters' });
  });

  it('trims whitespace before matching', () => {
    expect(readRouteState('?stage=%20settings%20')).toEqual({ stage: 'settings', deepTab: 'parameters' });
  });

  it('exposes the exact legacy vocabularies', () => {
    expect([...VALID_STAGES]).toEqual(['command_center', 'pareto_playground', 'deep_intelligence', 'settings']);
    expect([...VALID_DEEP_TABS]).toEqual(['parameters', 'scenarios', 'evolution', 'correlations']);
    expect([...DEFAULT_LOAD_STRATEGY]).toEqual(['performance', 'robustness', 'sharpe', 'coverage']);
    expect(DEFAULT_MAX_CONFIGS).toBe(2000);
    expect(LOAD_STRATEGY_OPTIONS).toContain('coverage');
    expect(LOAD_STRATEGY_OPTIONS).toHaveLength(10);
  });
});

describe('buildLocationUrl (:4123-4130)', () => {
  it('sets result_path, stage and deep_tab', () => {
    const url = buildLocationUrl('http://pbgui.test:8000/api/pareto-explorer/main_page?result_path=old&stage=old', '/new/path', 'settings', 'evolution');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('result_path')).toBe('/new/path');
    expect(parsed.searchParams.get('stage')).toBe('settings');
    expect(parsed.searchParams.get('deep_tab')).toBe('evolution');
    expect(parsed.pathname).toBe('/api/pareto-explorer/main_page');
  });

  it('removes result_path when empty', () => {
    const url = buildLocationUrl('http://pbgui.test:8000/api/pareto-explorer/main_page?result_path=/x&stage=command_center', '', 'command_center', 'parameters');
    expect(new URL(url).searchParams.has('result_path')).toBe(false);
  });

  it('preserves unrelated params and the hash', () => {
    const url = buildLocationUrl('http://h/api/pareto-explorer/main_page?optimize_version=v8#results', '/p', 'settings', 'scenarios');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('optimize_version')).toBe('v8');
    expect(parsed.hash).toBe('#results');
  });

  it('does not mutate the input href string state (pure)', () => {
    const href = 'http://h/api/pareto-explorer/main_page?result_path=/a';
    buildLocationUrl(href, '/b', 'settings', 'evolution');
    expect(href).toBe('http://h/api/pareto-explorer/main_page?result_path=/a');
  });
});
