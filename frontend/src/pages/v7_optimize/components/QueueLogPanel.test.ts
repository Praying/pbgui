import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import QueueLogPanel from './QueueLogPanel.vue';
import type { OptimizeAdapter } from '../config';

const adapter: OptimizeAdapter = {
  version: 'v8',
  isV8: true,
  label: 'PBv8',
  apiBase: '',
  archiveApiBase: '',
  backtestApiBase: '',
  metadataApiBase: '',
  paretoExplorerBase: '',
  queueLogPrefix: 'optimizes_v8/',
  websocketPath: '',
  navCurrent: 'v8_optimize',
  navSubtitle: 'PBv8 OPTIMIZE',
};

describe('QueueLogPanel', () => {
  it('renders a large themed dialog with an explicit close action', async () => {
    vi.stubGlobal('__BOOT__', { origin: 'http://testserver' });
    const wrapper = mount(QueueLogPanel, {
      props: { open: true, filename: 'alpha.log', title: 'alpha', adapter },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.find('.optimize-log-overlay').exists()).toBe(true);
    expect(wrapper.find('#optimize-log-viewer-target').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Close"]').exists()).toBe(true);

    await wrapper.find('[aria-label="Close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
