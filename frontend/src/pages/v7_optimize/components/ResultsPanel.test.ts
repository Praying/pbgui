import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ResultsPanel from './ResultsPanel.vue';

describe('ResultsPanel', () => {
  it('renders the legacy result columns and gates actions by backend capabilities', () => {
    const wrapper = mount(ResultsPanel, {
      props: {
        rows: [{
          path: '/results/a', name: 'alpha', result: 'run-1', strategy: 'recursive_grid', mode: 'suite',
          pareto_count: 2, has_pareto: true, has_config: true, supports_3d: true, supports_dash: false, resumable: true,
        }],
        selected: new Set<string>(), search: '', selectedPath: '', isV8: true,
      },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.text()).toContain('run-1');
    expect(wrapper.text()).toContain('recursive_grid');
    expect(wrapper.text()).toContain('suite');
    expect(wrapper.find('[data-action="explorer"]').exists()).toBe(true);
    expect(wrapper.find('[data-action="plot3d"]').exists()).toBe(true);
    expect(wrapper.find('[data-action="dash"]').exists()).toBe(false);
    expect(wrapper.find('[data-action="continue"]').exists()).toBe(true);
    expect(wrapper.find('[data-action="resume"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
