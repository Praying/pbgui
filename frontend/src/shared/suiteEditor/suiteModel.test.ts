import { describe, expect, it } from 'vitest';
import {
  SUITE_TEMPLATES,
  migrateSuiteTemplateOverrides,
  normalizeSuiteAggMetrics,
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
});
