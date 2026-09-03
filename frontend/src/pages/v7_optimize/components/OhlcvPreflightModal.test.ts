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

  it('adheres to system dark theme modal styling contracts', async () => {
    const wrapper = mount(OhlcvPreflightModal, {
      props: {
        open: true,
        loading: false,
        error: '',
        payload: {
          summary: { overall_status: 'pass', headline: 'All coins ready', preload_supported: true },
          request: { exchange: 'binance', start_date: '2024-01-01' },
          universe: { total_symbols: 10 },
          best_samples: {
            ready: [{ coin: 'BTC', sides: ['long', 'short'], exchange: 'binance', effective_start_date: '2024-01-01' }],
          },
        },
        job: null,
      },
      global: { plugins: [createI18n('en')] },
    });

    const overlay = wrapper.find('.fixed.inset-0');
    expect(overlay.classes()).toContain('z-[1100]');
    expect(overlay.classes()).toContain('bg-backdrop');

    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.classes()).toContain('bg-panel');
    expect(dialog.classes()).toContain('border');
    expect(dialog.classes()).toContain('border-border-default');
    expect(dialog.classes()).toContain('shadow-[var(--shadow-modal)]');

    // Close button
    const closeBtn = wrapper.find('header button');
    await closeBtn.trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    // Preload button
    const preloadBtn = wrapper.find('[data-action="preload"]');
    expect(preloadBtn.exists()).toBe(true);
    await preloadBtn.trigger('click');
    expect(wrapper.emitted('preload')).toHaveLength(1);

    // Check request & universe & sample groups rendering
    expect(wrapper.text()).toContain('binance');
    expect(wrapper.text()).toContain('2024-01-01');
    expect(wrapper.text()).toContain('BTC [long/short]');
  });
});

