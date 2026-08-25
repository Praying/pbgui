import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { apiFetch, ApiError } from '@/shared/api';
import App from './App.vue';

vi.mock('@/shared/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ settings: {}, configs: [], items: [], results: [] }),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public detail: string) { super(detail); }
  },
}));

describe('v7_optimize App', () => {
  beforeEach(() => {
    vi.stubGlobal('__BOOT__', { origin: 'http://testserver', token: '', version: 'test', serial: '1' });
    vi.stubGlobal('WebSocket', class { onopen = null; onmessage = null; onclose = null; onerror = null; close() {} send() {} } as unknown as typeof WebSocket);
  });
  it('renders the four workbench panels and opens the new config editor', async () => {
    const wrapper = mount(App, { global: { plugins: [createI18n('en')], stubs: { teleport: true } } });
    await flushPromises();
    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.find('main#app-shell-main').exists()).toBe(true);
    expect(wrapper.find('div.workbench-page-content').exists()).toBe(true);
    expect(wrapper.find('.page-toolbar').exists()).toBe(true); /* in-page sidebar retired: nav converged to the rail */
    expect(wrapper.text()).toContain('Configs');
    await wrapper.find('[data-test="new-config"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  });

  it('renders each sidebar action icon exactly once', async () => {
    const wrapper = mount(App, { global: { plugins: [createI18n('en')], stubs: { teleport: true } } });
    await flushPromises();

    const actionButtons = () => wrapper.findAll('.page-toolbar [data-slot="button"]');
    const actionTexts = () => actionButtons().map((button) => button.text());
    expect(actionTexts()).toEqual([
      'New Config',
      'Import Config',
      'Edit Selected',
      'Duplicate',
      'Queue Selected',
      'Add to Archive',
      'Convert to PB8 Optimize',
      'Delete Selected',
    ]);
    expect(actionButtons()[1]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[2]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[3]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[4]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[5]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[6]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[0]!.find('svg').exists()).toBe(true);

    await wrapper.find('[data-testid="rail-section-queue"]').trigger('click');
    expect(actionTexts()).toEqual(['Delete Selected', 'Settings']);
    expect(actionButtons()[0]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[1]!.find('svg').exists()).toBe(true);

    await wrapper.find('[data-testid="rail-section-results"]').trigger('click');
    expect(actionTexts()).toEqual([
      'Paretos',
      'Pareto Explorer',
      'PD Pareto Dash',
      '3D Plot',
      'Continue Optimize',
      'Config Draft',
      'Delete Selected',
    ]);
    expect(actionButtons()[0]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[1]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[2]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[3]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[4]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[5]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[6]!.find('svg').exists()).toBe(true);

    await wrapper.find('[data-testid="rail-section-paretos"]').trigger('click');
    expect(actionTexts()).toEqual([
      'Pareto Explorer',
      'Backtest',
      'Seed Selected',
      'Seed Whole Result',
    ]);
    expect(actionButtons()[0]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[1]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[2]!.find('svg').exists()).toBe(true);
    expect(actionButtons()[3]!.find('svg').exists()).toBe(true);
  });

  it('renders the OHLCV readiness icon once in editor actions', async () => {
    const wrapper = mount(App, { global: { plugins: [createI18n('en')], stubs: { teleport: true } } });
    await flushPromises();
    await wrapper.find('[data-test="new-config"]').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.page-toolbar [data-slot="button"]').at(-1)?.text()).toBe('OHLCV Readiness');
    expect(wrapper.findAll('.page-toolbar [data-slot="button"]').at(-1)?.find('svg').exists()).toBe(true);
  });

  it('keeps the PB8 workbench visible with an update warning when runtime metadata is unavailable', async () => {
    window.history.replaceState({}, '', '/api/optimize-v8/main_page');
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new ApiError(503, 'PB8 update incomplete'))
      .mockResolvedValueOnce({ configs: [{ name: 'alpha' }] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ results: [] });
    const wrapper = mount(App, { global: { plugins: [createI18n('en')], stubs: { teleport: true } } });
    await flushPromises();

    expect(wrapper.find('[data-test="pb8-runtime-warning"]').text()).toContain('PB8 update required');
    expect(wrapper.find('[data-test="pb8-runtime-warning"]').text()).toContain('PB8 update incomplete');
    expect(wrapper.find('[data-test="pb8-runtime-warning"] a').attributes('href')).toBe('/api/vps-manager/main_page');
    expect(wrapper.text()).toContain('alpha');
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
    await wrapper.find('[data-testid="rail-section-paretos"]').trigger('click');
    expect(wrapper.find('[data-test="backtest-paretos"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="select-all-paretos"]').exists()).toBe(true);
  });

  it('disables sidebar result actions until the selected result advertises support', async () => {
    const wrapper = mount(App, { global: { plugins: [createI18n('en')], stubs: { teleport: true } } });
    await flushPromises();
    await wrapper.find('[data-testid="rail-section-results"]').trigger('click');
    expect(wrapper.find('[data-test="result-paretos"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="result-dash"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="result-config"]').attributes('disabled')).toBeDefined();
  });

  it('closes the active editor when Escape is pressed', async () => {
    const wrapper = mount(App, { global: { plugins: [createI18n('en')], stubs: { teleport: true } } });
    await flushPromises();
    await wrapper.find('[data-test="new-config"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

});
