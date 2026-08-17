import { describe, expect, it } from 'vitest';
import { buildLoadSummary } from './loadSummary';

/* renderLoadSummary's payload (:2557-2576) — the Result Context JSON pre. */

const FALLBACKS = { resultPath: '/opt/results/run1', loadStrategy: ['performance'], maxConfigs: 2000 };

describe('buildLoadSummary', () => {
  it('summarises result + load state', () => {
    const summary = buildLoadSummary(
      {
        mode: 'full',
        load_strategy: ['sharpe'],
        max_configs: 999,
        view_range: { start: 0, end: 500, max: 1200 },
        scoring_metrics: ['adg'],
        scenario_labels: ['bull', 'bear'],
        load_stats: { selected_configs: 1200 },
        summary: { visible_configs: 500 },
      },
      { name: 'run1', path: '/opt/results/run1', has_all_results: true, pareto_count: 42, mtime: '2026-08-01T00:00:00' },
      FALLBACKS
    );
    expect(summary).toEqual({
      result: {
        name: 'run1',
        path: '/opt/results/run1',
        has_all_results: true,
        pareto_count: 42,
        mtime: '2026-08-01T00:00:00',
      },
      load: {
        mode: 'full',
        load_strategy: ['sharpe'],
        max_configs: 999,
        view_range: { start: 0, end: 500, max: 1200 },
        scoring_metrics: ['adg'],
        scenario_labels: ['bull', 'bear'],
        load_stats: { selected_configs: 1200 },
        summary: { visible_configs: 500 },
      },
    });
  });

  it('fills load fields from state fallbacks when the server omits them (:2567-2574)', () => {
    const summary = buildLoadSummary({ mode: 'fast' }, { name: 'run1' }, FALLBACKS);
    expect(summary.load).toEqual({
      mode: 'fast',
      load_strategy: ['performance'],
      max_configs: 2000,
      view_range: null,
      scoring_metrics: [],
      scenario_labels: [],
      load_stats: {},
      summary: {},
    });
  });

  it('renders only the path when no result and no load exist', () => {
    expect(buildLoadSummary(null, null, FALLBACKS)).toEqual({
      result: { path: '/opt/results/run1' },
      load: null,
    });
  });

  it('falls back to the state result path when the result object omits it (:2561)', () => {
    const summary = buildLoadSummary(null, { pareto_count: 7 }, FALLBACKS);
    expect(summary.result).toEqual({ name: '', path: '/opt/results/run1', has_all_results: false, pareto_count: 7, mtime: null });
  });
});
