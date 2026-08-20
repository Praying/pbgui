import { describe, expect, it } from 'vitest';
import { metricTooltip } from './metricDocs';

/* Spec 2026-08-20: exact-match-first resolution, then suffix decomposition
 * (longest-first), bilingual output "zh block\n\nen block", undefined for
 * unknown names. */

describe('metricTooltip exact match', () => {
  it('matches full names that look like base+suffix (position_held_hours_max)', () => {
    const tip = metricTooltip('position_held_hours_max');
    expect(tip).toContain('最长持仓时长');
    expect(tip).toContain('Maximum holding time');
  });

  it('matches scoring objectives like adg_pnl as whole entries', () => {
    const tip = metricTooltip('adg_pnl');
    expect(tip).toContain('评分目标');
    expect(tip).toContain('scoring objective');
  });
});

describe('metricTooltip suffix decomposition', () => {
  it('decomposes multi-suffix names with qualifiers in name order', () => {
    const tip = metricTooltip('adg_w_usd');
    expect(tip).toContain('平均日收益');
    expect(tip).toContain('\n· 近期加权（偏向近期表现） · 美元计价');
    expect(tip).toContain('\n· recency-weighted · USD-denominated');
  });

  it('decomposes _strategy_eq variants down to the bare base', () => {
    const tip = metricTooltip('peak_recovery_hours_strategy_eq');
    expect(tip).toContain('峰值回补');
    expect(tip).toContain('按策略权益口径');
    expect(tip).toContain('strategy-equity basis');
  });

  it('decomposes exposure-suffixed gain variants', () => {
    const tip = metricTooltip('adg_per_exposure_long');
    expect(tip).toContain('除以多头敞口限额');
    expect(tip).toContain('per long exposure limit');
  });
});

describe('metricTooltip output format and degradation', () => {
  it('emits the zh block, a blank line, then the en block', () => {
    const [zhBlock, enBlock] = metricTooltip('sharpe_ratio')!.split('\n\n');
    expect(zhBlock).toContain('夏普比率');
    expect(enBlock).toContain('Sharpe ratio');
  });

  it('returns undefined for unknown metrics without throwing', () => {
    expect(metricTooltip('mystery_metric')).toBeUndefined();
    expect(metricTooltip('')).toBeUndefined();
    expect(metricTooltip('_w')).toBeUndefined();
  });
});
