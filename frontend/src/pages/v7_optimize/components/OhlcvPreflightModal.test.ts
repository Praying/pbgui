import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import OhlcvPreflightModal from './OhlcvPreflightModal.vue';

describe('OhlcvPreflightModal', () => {
  it('renders readiness counts and exposes preload job controls', async () => {
    const wrapper = mount(OhlcvPreflightModal, {
      props: {
        open: true,
        loading: false,
        error: '',
        payload: { summary: { overall_status: 'preload', headline: 'Some coins would fetch', detail: '1 missing', counts: { missing_local: 1 }, preload_supported: true, preload_label: 'Preload missing OHLCV data' } },
        job: { job_id: 'job-1', status: 'running', log_tail: ['downloading BTCUSDT'] },
      },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.text()).toContain('Some coins would fetch');
    expect(wrapper.text()).toContain('missing local');
    expect(wrapper.text()).toContain('downloading BTCUSDT');
    expect(wrapper.find('[data-action="stop"]').exists()).toBe(true);
    await wrapper.find('[data-action="refresh"]').trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });
});
