import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ConfigsPanel from './ConfigsPanel.vue';

describe('ConfigsPanel', () => {
  it('renders the shared configuration-list visual contract', () => {
    const wrapper = mount(ConfigsPanel, {
      props: { rows: [{ name: 'alpha', exchange: 'bybit', backtest_count: 3, start: '2024-01-01', end: '2024-02-01', modified: '2026-08-01' }], selected: new Set<string>(), search: '', isV8: false },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.classes()).toContain('pbgui-config-list');
    expect(wrapper.find('.pbgui-config-toolbar').exists()).toBe(true);
    expect(wrapper.find('.pbgui-config-frame').exists()).toBe(true);
    expect(wrapper.find('.pbgui-config-wrap').exists()).toBe(true);
    expect(wrapper.find('table.pbgui-config-table').exists()).toBe(true);
    expect(wrapper.find('.pbgui-config-name').text()).toBe('alpha');
    expect(wrapper.find('.pbgui-config-exchange').text()).toBe('bybit');
    expect(wrapper.find('.pbgui-config-date').text()).toBe('2024-01-01');
    expect(wrapper.find('.pbgui-config-count').text()).toBe('3');
    expect(wrapper.find('.pbgui-config-action').exists()).toBe(true);
    expect(wrapper.get('[data-test="configs-list-footer"]').text()).toContain('1 config');
    expect(wrapper.get('tbody tr[data-path="alpha"]').attributes('aria-selected')).toBe('false');
    expect(wrapper.get('tbody tr[data-path="alpha"]').attributes('tabindex')).toBe('0');
    wrapper.unmount();
  });

  it('toggles config selection from keyboard activation', async () => {
    const wrapper = mount(ConfigsPanel, {
      props: { rows: [{ name: 'alpha', exchange: 'bybit' }], selected: new Set<string>(), search: '', isV8: false },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.get('tbody tr[data-path="alpha"]').trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('toggle')).toEqual([['alpha']]);
    wrapper.unmount();
  });

  it('keeps start/end/flags columns and routes PB8 strategy metadata', () => {
    const wrapper = mount(ConfigsPanel, {
      props: { rows: [{ name: 'alpha', exchange: 'bybit', backtest_count: 3, start: '2024-01-01', end: '2024-02-01', flags: ['suite', 'crossover'], strategy: 'recursive_grid' }], selected: new Set<string>(), search: '', isV8: true },
      global: { plugins: [createI18n('en')] },
    });
    expect(wrapper.text()).toContain('2024-01-01');
    expect(wrapper.text()).toContain('suite');
    expect(wrapper.text()).toContain('recursive_grid');
    expect(wrapper.get('[data-test="config-strategy"]').attributes('title')).toBe('recursive_grid');
    expect(wrapper.get('[data-test="config-flags"]').attributes('title')).toBe('suite, crossover');
    wrapper.unmount();
  });
});
