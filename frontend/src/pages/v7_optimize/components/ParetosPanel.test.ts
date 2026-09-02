import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ParetosPanel from './ParetosPanel.vue';

describe('ParetosPanel', () => {
  it('renders each advertised metric as a sortable column', async () => {
    const wrapper = mount(ParetosPanel, {
      props: {
        rows: [
          { path: '/p/1', name: 'one', summary: { gain: 0.2, risk: 1 } },
          { path: '/p/2', name: 'two', summary: { gain: 0.1, risk: 2 } },
        ],
        meta: { summary_keys: ['gain', 'risk'] }, resultName: 'result', selected: new Set<string>(), isV8: true,
      },
      global: { plugins: [createI18n('en')] },
    });
    expect(wrapper.find('[data-sort-key="summary:gain"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-metric="gain"]')).toHaveLength(2);
    await wrapper.find('[data-sort-key="summary:gain"]').trigger('click');
    expect(wrapper.emitted('sort')?.[0]?.[0]).toBe('summary:gain');
    wrapper.unmount();
  });

  it('renders the metric column picker and emits column actions', async () => {
    const wrapper = mount(ParetosPanel, {
      props: {
        rows: [{ path: '/p/1', name: 'one', summary: { gain: 0.2 } }],
        meta: {},
        resultName: 'result',
        selected: new Set<string>(),
        isV8: true,
        columns: ['gain'],
        availableMetrics: ['gain', 'sharpe_ratio', 'zzz_custom'],
      },
      global: { plugins: [createI18n('en')] },
    });
    const picker = wrapper.find('[data-test="pareto-columns-picker"]');
    expect(picker.exists()).toBe(true);
    expect(picker.find('summary').text()).toContain('Columns (1)');
    // pill 标签 + 自定义指标回退
    expect(picker.text()).toContain('sharpe (sharpe_ratio)');
    expect(picker.text()).toContain('zzz_custom');
    // ui/Checkbox renders a button with role="checkbox" — state via data-state
    expect(picker.find('[data-pareto-metric="gain"]').attributes('data-state')).toBe('checked');

    await picker.find('[data-pareto-metric="sharpe_ratio"]').trigger('click');
    expect(wrapper.emitted('toggleColumn')?.[0]).toEqual(['sharpe_ratio', true]);
    await picker.find('[data-test="pareto-columns-defaults"]').trigger('click');
    expect(wrapper.emitted('resetColumns')).toHaveLength(1);
    // 列表仅显示所选列
    expect(wrapper.findAll('th[data-sort-key]')).toHaveLength(1);
    expect(wrapper.find('th[data-sort-key="summary:gain"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders empty state spanning all 4 default columns when no result is selected', () => {
    const wrapper = mount(ParetosPanel, {
      props: {
        rows: [],
        meta: {},
        resultName: '',
        selected: new Set<string>(),
        isV8: true,
        columns: [],
      },
      global: { plugins: [createI18n('en')] },
    });
    const emptyTd = wrapper.find('tbody tr td');
    expect(emptyTd.exists()).toBe(true);
    expect(emptyTd.attributes('colspan')).toBe('4');
    expect(wrapper.text()).toContain('Choose a result set first.');
    wrapper.unmount();
  });
});
