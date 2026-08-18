import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ScoringLimitsEditor from './ScoringLimitsEditor.vue';

describe('ScoringLimitsEditor', () => {
  it('adds and removes scoring and limit rows without discarding existing values', async () => {
    const wrapper = mount(ScoringLimitsEditor, { props: { scoring: [{ metric: 'adg', goal: 'maximize' }], limits: [], scenarioLabels: [] }, global: { plugins: [createI18n('en')] } });
    await wrapper.findAll('section').at(0)!.find('header button').trigger('click');
    expect(wrapper.emitted('update:scoring')?.[0]?.[0]).toHaveLength(2);
    await wrapper.findAll('section').at(1)!.find('header button').trigger('click');
    expect(wrapper.emitted('update:limits')?.[0]?.[0]).toHaveLength(1);
  });
  it('uses runtime metric metadata and writes canonical scoring and limit entries', async () => {
    const wrapper = mount(ScoringLimitsEditor, {
      props: {
        version: 'v8',
        scoring: [{ metric: 'adg_usd', goal: 'maximize' }],
        limits: [{ metric: 'drawdown_usd', penalize_if: 'outside_range', range: [0.1, 0.4] }],
        scenarioLabels: ['bull'],
        metadata: {
          metrics_by_group: { all: ['adg', 'drawdown'] },
          all_valid_metrics: ['adg_usd', 'drawdown_usd'],
          currency_metrics: ['adg', 'drawdown'],
          currency_options: ['usd', 'btc'],
          penalize_if_options: ['greater_than', 'outside_range'],
          stat_options: ['', 'mean', 'median'],
          goal_options: ['min', 'max'],
          scoring_basis_field: 'aggregate',
          limit_basis_field: 'stat',
        },
      },
      global: { plugins: [createI18n('en')] },
    });

    const scoringGoal = wrapper.findAll('section').at(0)!.find('select[data-field="scoring-goal"]');
    expect((scoringGoal.element as HTMLSelectElement).value).toBe('max');
    await scoringGoal.setValue('min');
    expect(wrapper.emitted('update:scoring')?.at(-1)?.[0]).toEqual([{ metric: 'adg_usd', goal: 'min' }]);
    expect(wrapper.find('select[data-field="limit-penalize-if"]').exists()).toBe(true);
    expect(wrapper.find('input[data-field="limit-range-low"]').exists()).toBe(true);
    await wrapper.find('input[type="checkbox"]').setValue(false);
    expect(wrapper.emitted('update:limits')?.at(-1)?.[0]).toMatchObject([{ enabled: false }]);
  });

});
