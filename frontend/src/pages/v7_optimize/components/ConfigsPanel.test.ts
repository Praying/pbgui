import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ConfigsPanel from './ConfigsPanel.vue';

describe('ConfigsPanel', () => {
  it('keeps start/end/flags columns and routes PB8 strategy metadata', () => {
    const wrapper = mount(ConfigsPanel, {
      props: { rows: [{ name: 'alpha', exchange: 'bybit', backtest_count: 3, start: '2024-01-01', end: '2024-02-01', flags: ['suite'], strategy: 'recursive_grid' }], selected: new Set<string>(), search: '', isV8: true },
      global: { plugins: [createI18n('en')] },
    });
    expect(wrapper.text()).toContain('2024-01-01');
    expect(wrapper.text()).toContain('suite');
    expect(wrapper.text()).toContain('recursive_grid');
    wrapper.unmount();
  });
});
