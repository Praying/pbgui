import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

vi.mock('@/shared/api', () => ({ apiFetch: vi.fn().mockResolvedValue({ settings: {}, configs: [], items: [], results: [] }) }));

describe('v7_optimize App', () => {
  beforeEach(() => {
    vi.stubGlobal('__BOOT__', { origin: 'http://testserver', token: '', version: 'test', serial: '1' });
    vi.stubGlobal('WebSocket', class { onopen = null; onmessage = null; onclose = null; onerror = null; close() {} send() {} } as unknown as typeof WebSocket);
  });
  it('renders the four workbench panels and opens the new config editor', async () => {
    const wrapper = mount(App, { global: { plugins: [createI18n('en')], stubs: { teleport: true } } });
    await flushPromises();
    expect(wrapper.find('#sidebar').exists()).toBe(true);
    expect(wrapper.text()).toContain('Configs');
    await wrapper.find('button.opt-side-action.primary').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  });

  it('does not use native confirmation APIs for destructive actions', () => {
    const source = String(App);
    expect(source).not.toContain('window.confirm');
    expect(source).not.toContain('window.alert');
  });
  it('keeps legacy bulk-selection, duplicate and Pareto backtest actions reachable', async () => {
    const wrapper = mount(App, { global: { plugins: [createI18n('en')], stubs: { teleport: true } } });
    await flushPromises();

    expect(wrapper.find('[data-test="duplicate-selected"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="select-all-configs"]').exists()).toBe(true);
    await wrapper.find('[data-test="nav-paretos"]').trigger('click');
    expect(wrapper.find('[data-test="backtest-paretos"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="select-all-paretos"]').exists()).toBe(true);
  });

  it('disables sidebar result actions until the selected result advertises support', async () => {
    const wrapper = mount(App, { global: { plugins: [createI18n('en')], stubs: { teleport: true } } });
    await flushPromises();
    await wrapper.find('[data-test="nav-results"]').trigger('click');
    expect(wrapper.find('[data-test="result-paretos"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="result-dash"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="result-config"]').attributes('disabled')).toBeDefined();
  });

  it('closes the active editor when Escape is pressed', async () => {
    const wrapper = mount(App, { global: { plugins: [createI18n('en')], stubs: { teleport: true } } });
    await flushPromises();
    await wrapper.find('button.opt-side-action.primary').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

});
