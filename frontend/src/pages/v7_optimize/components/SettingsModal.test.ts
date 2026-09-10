import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import SettingsModal from './SettingsModal.vue';
import type { OptimizeSettings } from '../types';

function settings(overrides: Partial<OptimizeSettings> = {}): OptimizeSettings {
  return {
    autostart: false,
    cpu: 1,
    cpu_override: true,
    use_pbgui_market_data: false,
    cpu_max: 8,
    host_cpu_count: 8,
    ...overrides,
  };
}

describe('SettingsModal', () => {
  it('uses a compact header with one visible discard action in the footer', () => {
    const wrapper = mount(SettingsModal, {
      props: { open: true, settings: settings() },
      global: { plugins: [createI18n('en')] },
    });

    const header = wrapper.get('header');
    const footer = wrapper.get('footer');

    expect(header.find('button').exists()).toBe(false);
    expect(header.classes()).toContain('py-2.5');
    expect(footer.classes()).toContain('py-2.5');
    expect(footer.text()).toContain('Cancel');
    expect(footer.text()).toContain('Save');

    wrapper.unmount();
  });
});
