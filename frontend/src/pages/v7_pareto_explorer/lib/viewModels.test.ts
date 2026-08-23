import { describe, expect, it } from 'vitest';
import { createI18n } from '@/shared/i18n';
import {
  bestMatchText,
  championRows,
  detailViewModel,
  insightRows,
  playgroundMetricSummary,
  previewSummaries,
} from './viewModels';
import type {
  CommandCenterPayload,
  ConfigDetailPayload,
  PlaygroundPayload,
} from '../types';

/*
 * Render-surface view models — ports of renderChampions (:2944-2973),
 * renderInsights (:2975-2990), renderPreview summaries (:2904-2909),
 * renderPlayground's text line (:3355-3364) and renderDetail (:3849-3893).
 */

const i18n = createI18n('en');
const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {});

describe('championRows (:2944-2973)', () => {
  const payload: CommandCenterPayload = {
    champions: [
      { config_index: 4, style: 'momentum', composite_score: 91.5, performance: 1.2, robustness: 0.8, risk_overall: 0.3 },
      { config_index: 9, style: 'mean-revert', composite_score: null, performance: null, robustness: null, risk_overall: null },
    ],
  };

  it('builds the rank/score/perf/rob/risk chips per champion', () => {
    const rows = championRows(payload, null, t);
    expect(rows[0]).toMatchObject({
      configIndex: 4,
      style: 'momentum',
      rankText: 'Rank 1',
      scoreText: 'Score 91.5',
      perfText: 'Perf 1.2',
      robText: 'Rob 0.8',
      riskText: 'Risk 0.3',
      active: false,
    });
    expect(rows[1]!.rankText).toBe('Rank 2');
    expect(rows[1]!.scoreText).toBe('Score -');
  });

  it('marks the selected config active', () => {
    const rows = championRows(payload, 9, t);
    expect(rows[0]!.active).toBe(false);
    expect(rows[1]!.active).toBe(true);
  });

  it('returns an empty list for a missing payload', () => {
    expect(championRows(null, null, t)).toEqual([]);
    expect(championRows({}, null, t)).toEqual([]);
  });
});

describe('insightRows (:2975-2990)', () => {
  it('maps levels to warn/good/info chips', () => {
    const rows = insightRows({
      insights: [
        { level: 'warning', text: 'near bounds' },
        { level: 'success', text: 'strong run' },
        { level: 'info', text: 'neutral' },
        { level: '', text: 'raw' },
      ],
    });
    expect(rows[0]).toEqual({ levelClass: 'warn', levelText: 'warning', text: 'near bounds' });
    expect(rows[1]).toEqual({ levelClass: 'good', levelText: 'success', text: 'strong run' });
    expect(rows[2]).toEqual({ levelClass: 'info', levelText: 'info', text: 'neutral' });
    expect(rows[3]).toEqual({ levelClass: 'info', levelText: 'info', text: 'raw' });
  });

  it('returns [] without payload', () => {
    expect(insightRows(null)).toEqual([]);
  });
});

describe('previewSummaries (:2904-2909)', () => {
  it('labels pareto-only mode with the config count', () => {
    const out = previewSummaries(
      { visualizations: { preview: { counts: { configs: 12, pareto: 5 } } } } as PlaygroundPayload,
      t
    );
    expect(out.left).toBe('Pareto Analysis - Showing 12 Pareto configs | 5 Pareto ⭐');
    expect(out.right).toBe('Robustness vs Performance - Showing 12 Pareto configs | 5 Pareto ⭐');
  });

  it('labels show_all mode with shown/total and defaults the totals to the shown count', () => {
    const out = previewSummaries(
      { visualizations: { preview: { counts: { configs: 40, total_configs: 900, show_all: true, pareto: 7 } } } } as PlaygroundPayload,
      t
    );
    expect(out.left).toContain('40 / 900 configs');
    const noTotal = previewSummaries({ visualizations: { preview: { counts: { configs: 3, show_all: true } } } } as PlaygroundPayload, t);
    expect(noTotal.left).toContain('3 / 3 configs');
  });

  it('renders the placeholder summaries without a payload (:2895-2902)', () => {
    const out = previewSummaries(null, t);
    expect(out.left).toBe('Pareto preview chart will appear here.');
    expect(out.right).toBe('Robustness preview chart will appear here.');
  });
});

describe('bestMatchText / playgroundMetricSummary (:3355-3364)', () => {
  it('formats the best match with score and style', () => {
    expect(bestMatchText({ best_match: { config_index: 12, score: 88.2, style: 'sniper' } }, t)).toBe('Best Match: Config #12 | Score: 88.2 | sniper');
  });

  it('falls back to no-best-match text', () => {
    expect(bestMatchText({}, t)).toBe('Could not determine a best match.');
    expect(bestMatchText({ best_match: { score: 5 } }, t)).toBe('Could not determine a best match.');
  });

  it('summarises radar vs scatter axes (plain legacy concatenation, no i18n)', () => {
    expect(playgroundMetricSummary({ viz_type: 'Radar Chart', quick_view: 'Risk Profile' })).toBe('Radar Chart: Risk Profile');
    expect(
      playgroundMetricSummary({
        viz_type: '3D Scatter',
        metrics: { x_metric: 'adg', y_metric: 'sharpe', z_metric: 'cnc', color_metric: 'vol' },
      })
    ).toBe('3D Scatter: adg vs sharpe vs cnc | Color: vol');
    expect(playgroundMetricSummary({ viz_type: '2D Scatter', metrics: {} })).toBe('2D Scatter: - vs -');
  });
});

describe('detailViewModel (:3849-3893)', () => {
  const detail: ConfigDetailPayload = {
    config_index: 3,
    style: 'balanced',
    explorer_score: 77.5,
    robustness: 0.91,
    top_metrics: [{ name: 'adg', value: 1.5 }, { value: null }],
    risk_profile: { max_drawdown: 0.2 },
    all_metrics: [
      { name: 'adg', value: 1.5 },
      { name: 'positions_held_per_day', value: 4.2 },
      { name: 'position_held_hours_mean', value: 12 },
      ...Array.from({ length: 30 }, (_, i) => ({ name: 'm' + i, value: i })),
    ],
    has_scenarios: true,
    scenario_metrics: {
      bull: { adg: 1, sharpe: 2 },
      bear: { adg: -1 },
    },
    full_config: { bot: { long: {} } },
  };

  it('titles the panel with the config index', () => {
    expect(detailViewModel(detail, t).title).toBe('#3');
    expect(detailViewModel(null, t).title).toBe('No config selected');
  });

  it('shows the loading placeholder while a selection is pending (v1.98.37, :4086-4090)', () => {
    expect(detailViewModel(null, t, 7).title).toBe('Loading #7...');
    expect(detailViewModel(null, t, null).title).toBe('No config selected');
    expect(detailViewModel(detail, t, 7).title).toBe('#3');
  });

  it('renders top metrics and the risk profile as mini metrics', () => {
    const vm = detailViewModel(detail, t);
    expect(vm.topMetrics).toEqual([
      { name: 'adg', value: '1.5' },
      { name: '-', value: '-' },
    ]);
    expect(vm.riskProfile).toEqual([{ name: 'max_drawdown', value: '0.2' }]);
  });

  it('builds the four style rows including the two all_metrics lookups', () => {
    const vm = detailViewModel(detail, t);
    expect(vm.styleRows).toEqual([
      { strong: 'balanced', chip: 'Style' },
      { strong: 'Positions/Day', chip: '4.2' },
      { strong: 'Avg Hold Hours', chip: '12' },
      { strong: 'Explorer Score', chip: '77.5' },
    ]);
    const missing = detailViewModel({ all_metrics: [] }, t);
    expect(missing.styleRows[1]!.chip).toBe('-');
    expect(missing.styleRows[3]!.chip).toBe('-');
  });

  it('caps the all-metrics list at 24 rows (:3888)', () => {
    const vm = detailViewModel(detail, t);
    expect(vm.allMetrics).toHaveLength(24);
    expect(vm.hasAllMetrics).toBe(true);
    expect(detailViewModel({}, t).hasAllMetrics).toBe(false);
  });

  it('summarises scenario metrics (8 scenarios, 6 metric chips, sorted)', () => {
    const scenarios: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 10; i++) scenarios['s' + String(i).padStart(2, '0')] = { a: i, b: i, c: i, d: i, e: i, f: i, g: i, h: i };
    const vm = detailViewModel({ has_scenarios: true, scenario_metrics: scenarios }, t);
    expect(vm.scenarioRows).toHaveLength(8);
    expect(vm.scenarioRows[0]).toEqual({
      name: 's00',
      metricsShown: 6,
      chips: [
        { key: 'a', value: '0' },
        { key: 'b', value: '0' },
        { key: 'c', value: '0' },
        { key: 'd', value: '0' },
        { key: 'e', value: '0' },
        { key: 'f', value: '0' },
      ],
    });
  });

  it('hides scenario metrics when the result carries none (:3889)', () => {
    expect(detailViewModel({ has_scenarios: false, scenario_metrics: { bull: { a: 1 } } }, t).scenarioRows).toEqual([]);
    expect(detailViewModel({}, t).scenarioRows).toEqual([]);
  });

  it('serialises the full config and falls back when absent', () => {
    expect(detailViewModel(detail, t).fullConfigText).toBe(JSON.stringify({ bot: { long: {} } }, null, 2));
    expect(detailViewModel({ config_index: 1 }, t).fullConfigText).toBe('Full config unavailable.');
    expect(detailViewModel(null, t).fullConfigText).toBe('No config selected');
  });
});
