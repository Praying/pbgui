import { describe, expect, it, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import MigrationWatermark from './MigrationWatermark.vue';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('MigrationWatermark', () => {
  it('renders the watermark when explicitly enabled', () => {
    vi.stubEnv('VITE_MIGRATION_WATERMARK', 'on');
    const wrapper = mount(MigrationWatermark);
    expect(wrapper.find('.migration-watermark').exists()).toBe(true);
    expect(wrapper.text()).toContain('VUE MIGRATION PREVIEW');
  });

  it('hides when VITE_MIGRATION_WATERMARK=off', () => {
    vi.stubEnv('VITE_MIGRATION_WATERMARK', 'off');
    const wrapper = mount(MigrationWatermark);
    expect(wrapper.find('.migration-watermark').exists()).toBe(false);
  });

  it('is hidden by default and for any value other than on', () => {
    expect(mount(MigrationWatermark).find('.migration-watermark').exists()).toBe(false);
    vi.stubEnv('VITE_MIGRATION_WATERMARK', '0');
    expect(mount(MigrationWatermark).find('.migration-watermark').exists()).toBe(false);
  });

  it('never intercepts pointer events', () => {
    vi.stubEnv('VITE_MIGRATION_WATERMARK', 'on');
    const wrapper = mount(MigrationWatermark);
    const style = wrapper.find('.migration-watermark').attributes('style');
    expect(style).toContain('pointer-events: none');
  });
});
