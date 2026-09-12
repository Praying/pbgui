import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import QueueLogModal from './QueueLogModal.vue';

vi.mock('@/shared/components/QueueLogTerminal.vue', () => ({
  default: {
    name: 'QueueLogTerminal',
    props: ['file'],
    template: '<div data-test="fake-log-terminal">{{ file }}</div>',
  },
}));

function mountModal(props: { open: boolean; filename: string; title: string; file: string }) {
  const i18n = createI18n('en');
  return mount(QueueLogModal, {
    props,
    global: {
      plugins: [i18n],
    },
  });
}

describe('QueueLogModal', () => {
  it('does not render when open is false', () => {
    const wrapper = mountModal({
      open: false,
      filename: '6-7-bnb.json',
      title: '6-7-bnb',
      file: 'backtests_v8/6-7-bnb.log',
    });
    expect(wrapper.find('[data-test="backtest-log-overlay"]').exists()).toBe(false);
  });

  it('renders modal dialog with title, file path and log terminal when open is true', () => {
    const wrapper = mountModal({
      open: true,
      filename: '6-7-bnb.json',
      title: '6-7-bnb',
      file: 'backtests_v8/6-7-bnb.log',
    });
    expect(wrapper.find('[data-test="backtest-log-overlay"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="backtest-log-title"]').text()).toContain('6-7-bnb');
    expect(wrapper.find('[data-test="backtest-log-path"]').text()).toBe('backtests_v8/6-7-bnb.log');
    expect(wrapper.find('[data-test="fake-log-terminal"]').text()).toBe('backtests_v8/6-7-bnb.log');
  });

  it('emits close event when close button is clicked', async () => {
    const wrapper = mountModal({
      open: true,
      filename: '6-7-bnb.json',
      title: '6-7-bnb',
      file: 'backtests_v8/6-7-bnb.log',
    });
    const closeBtn = wrapper.find('[data-test="backtest-log-close"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
