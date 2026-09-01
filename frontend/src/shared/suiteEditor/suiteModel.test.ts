import { describe, expect, it } from 'vitest';
import {
  SUITE_TEMPLATES,
  applySuiteTemplate,
  migrateSuiteTemplateOverrides,
  normalizeSuiteAggMetrics,
  suiteAggregateMethods,
  suiteCollect,
  suiteLoad,
  type SuiteScenario,
  type SuiteState,
} from './suiteModel';

/*
 * Suite model — the shared port of js/suite_editor.js's pure half
 * (templates :39-74 + the v8 override-path migration :114-125, agg
 * metric normalization :129-145, suiteLoad :148-176, suiteCollect
 * :179-191). Reused by optimize (M-v7-14).
 */

function state(overrides: Partial<SuiteState> = {}): SuiteState {
  return { enabled: false, scenarios: [], editIdx: -1, aggregate: { default: 'mean' }, ...overrides };
}

describe('templates (:39-74, :114-125)', () => {
  it('exposes the four built-in templates', () => {
    expect(Object.keys(SUITE_TEMPLATES).sort()).toEqual(['Date Windows', 'Exchange Comparison', 'TWE Sensitivity', 'n_positions Sensitivity']);
  });

  it('migrates TWE/n_positions override paths to risk.* for v8 (:116-124)', () => {
    const migrated = migrateSuiteTemplateOverrides('TWE Sensitivity', true);
    expect(migrated.scenarios![0]!.overrides).toEqual({
      'bot.long.risk.total_wallet_exposure_limit': 0.5,
      'bot.short.risk.total_wallet_exposure_limit': 0.5,
    });
    const npos = migrateSuiteTemplateOverrides('n_positions Sensitivity', true);
    expect(npos.scenarios![0]!.overrides).toEqual({ 'bot.long.risk.n_positions': 5, 'bot.short.risk.n_positions': 5 });
  });

  it('keeps root override paths on v7', () => {
    const v7 = migrateSuiteTemplateOverrides('TWE Sensitivity', false);
    expect(v7.scenarios![0]!.overrides).toEqual({
      'bot.long.total_wallet_exposure_limit': 0.5,
      'bot.short.total_wallet_exposure_limit': 0.5,
    });
  });

  it('leaves non-bot templates untouched by the migration', () => {
    expect(migrateSuiteTemplateOverrides('Date Windows', true)).toEqual(SUITE_TEMPLATES['Date Windows']!);
  });
});

describe('normalizeSuiteAggMetrics (:129-145)', () => {
  it('falls back to the built-in metric list, dedupes and trims', () => {
    expect(normalizeSuiteAggMetrics([])).toContain('adg_strategy_eq');
    expect(normalizeSuiteAggMetrics(['a', 'a', ' b ', ''])).toEqual(['a', 'b']);
    expect(normalizeSuiteAggMetrics(null)).toEqual(normalizeSuiteAggMetrics([]));
  });
});

describe('suiteLoad (:148-176)', () => {
  it('reads suite_enabled/scenarios/aggregate off cfg.backtest', () => {
    const loaded = suiteLoad(
      { backtest: { suite_enabled: true, scenarios: [{ label: 'a' }], aggregate: { default: 'max' } } },
      state({ enabled: true, scenarios: [{ label: 'old' }], editIdx: 0 })
    );
    expect(loaded.enabled).toBe(true);
    expect(loaded.scenarios).toEqual([{ label: 'a' }]);
    expect(loaded.aggregate).toEqual({ default: 'max' });
  });

  it('defaults aggregate to mean and scenarios to empty', () => {
    const loaded = suiteLoad({}, state({ enabled: true, aggregate: { default: 'max', extra: 'min' } }));
    expect(loaded.enabled).toBe(false);
    expect(loaded.scenarios).toEqual([]);
    expect(loaded.aggregate).toEqual({ default: 'mean' });
  });

  it('preserveEdit re-anchors editIdx by label, falling back to the index (:160-174)', () => {
    const prev = state({ enabled: true, scenarios: [{ label: 'x' }, { label: 'keep' }], editIdx: 1 });
    const byLabel = suiteLoad({ backtest: { suite_enabled: true, scenarios: [{ label: 'a' }, { label: 'z' }, { label: 'keep' }] } }, prev, {
      preserveEdit: true,
    });
    expect(byLabel.editIdx).toBe(2);

    const byIndex = suiteLoad({ backtest: { suite_enabled: true, scenarios: [{ label: 'a' }, { label: 'z' }] } }, prev, { preserveEdit: true });
    expect(byIndex.editIdx).toBe(1);

    const closed = suiteLoad({ backtest: { suite_enabled: true, scenarios: [{ label: 'a' }] } }, prev);
    expect(closed.editIdx).toBe(-1);
  });

  it('clones scenarios so later edits never alias the source config', () => {
    const cfg = { backtest: { suite_enabled: true, scenarios: [{ label: 'a', overrides: { k: 1 } }] } };
    const loaded = suiteLoad(cfg, state());
    loaded.scenarios[0]!.label = 'mutated';
    expect((cfg.backtest!.scenarios as SuiteScenario[])[0]!.label).toBe('a');
  });

  it('prefers PB8 reducer and clones scenario provenance', () => {
    const cfg = {
      backtest: {
        suite_enabled: true,
        scenarios: [{ label: 'generated' }],
        aggregate: { default: 'mean' },
        reducer: { default: 'median', drawdown: 'std' },
      },
      pbgui: { scenario_template: { template: 'walk_forward', parameters: { window_days: 90 } } },
    };
    const loaded = suiteLoad(cfg, state(), { isV8: true });
    expect(loaded.aggregate).toEqual({ default: 'median', drawdown: 'std' });
    expect(loaded.scenarioTemplate).toEqual(cfg.pbgui.scenario_template);
    (loaded.scenarioTemplate!.parameters as Record<string, unknown>).window_days = 30;
    expect((cfg.pbgui.scenario_template.parameters as Record<string, unknown>).window_days).toBe(90);
  });

  it('does not load provenance from a disabled suite', () => {
    const loaded = suiteLoad({ pbgui: { scenario_template: { template: 'rolling_windows' } } }, state({ scenarioTemplate: { template: 'old' } }));
    expect(loaded.scenarioTemplate).toBeUndefined();
  });

  it('normalizes unsupported PB7 aggregate methods to mean', () => {
    const loaded = suiteLoad(
      { backtest: { suite_enabled: true, aggregate: { default: 'median', drawdown: 'std' } } },
      state(),
      { isV8: false },
    );
    expect(loaded.aggregate).toEqual({ default: 'mean', drawdown: 'mean' });
  });
});

describe('suiteCollect (:179-191)', () => {
  it('returns just the flag when disabled', () => {
    expect(suiteCollect(state({ enabled: false, scenarios: [{ label: 'x' }], aggregate: { default: 'max' } }))).toEqual({ suite_enabled: false });
  });

  it('returns cloned scenarios + aggregate when enabled', () => {
    const st = state({ enabled: true, scenarios: [{ label: 'x' }], aggregate: { default: 'min', adg_strategy_eq: 'max' } });
    const collected = suiteCollect(st);
    expect(collected).toEqual({ suite_enabled: true, scenarios: [{ label: 'x' }], aggregate: { default: 'min', adg_strategy_eq: 'max' } });
    collected.scenarios![0]!.label = 'changed';
    expect(st.scenarios[0]!.label).toBe('x');
  });

  it('returns cloned enabled provenance and mutators clear it', () => {
    const st = state({ enabled: true, scenarioTemplate: { template: 'rolling_windows', parameters: { window_days: 30 } } });
    const collected = suiteCollect(st);
    expect(collected.scenario_template).toEqual(st.scenarioTemplate);
    collected.scenario_template!.parameters = { window_days: 1 };
    expect((st.scenarioTemplate!.parameters as Record<string, unknown>).window_days).toBe(30);
    expect(applySuiteTemplate(st, 'Date Windows', true).scenarioTemplate).toBeUndefined();
  });
});

describe('PB8 reducer methods', () => {
  it('allows std and median only for PB8', () => {
    expect(suiteAggregateMethods(false)).toEqual(['mean', 'min', 'max']);
    expect(suiteAggregateMethods(true)).toEqual(['mean', 'min', 'max', 'std', 'median']);
  });
});
