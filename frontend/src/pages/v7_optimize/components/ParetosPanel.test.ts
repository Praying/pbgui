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
});
