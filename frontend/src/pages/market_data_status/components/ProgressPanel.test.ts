import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ProgressPanel from './ProgressPanel.vue';
import type { MarketDataStatus } from '../types';

enableAutoUnmount(afterEach);

function status(overrides: Partial<MarketDataStatus> = {}): MarketDataStatus {
  return {
    running: false,
    queued: false,
    coins_done: 0,
    coins_total: 0,
    current_coin: '',
    coin_rows: [],
    ...overrides,
  };
}

function mountPanel(state: MarketDataStatus | null, lang: 'en' | 'zh' = 'en') {
  return mount(ProgressPanel, { props: { status: state }, global: { plugins: [createI18n(lang)] } });
}

describe('ProgressPanel (legacy mds-progress-section states)', () => {
  it('is hidden before the first status message and when idle', () => {
    expect(mountPanel(null).find('.mds-progress-section').isVisible()).toBe(false);
    expect(mountPanel(status()).find('.mds-progress-section').isVisible()).toBe(false);
  });

  it('shows the coin progress while running with a known total', () => {
    const panel = mountPanel(status({ running: true, coins_done: 2, coins_total: 4, current_coin: 'BTC' }));
    const section = panel.find('.mds-progress-section');

    expect(section.isVisible()).toBe(true);
    expect((panel.find('.mds-progress-bar').element as HTMLElement).style.width).toBe('50%');
    expect(panel.find('.mds-progress-label').text()).toBe('2 / 4');
    expect(panel.find('.mds-progress-text').text()).toBe('Current: BTC');
  });

  it('falls back to an ellipsis current coin while running', () => {
    const panel = mountPanel(status({ running: true, coins_done: 1, coins_total: 3, current_coin: '' }));

    expect(panel.find('.mds-progress-text').text()).toBe('Current: ...');
  });

  it('shows the indeterminate running state without a total', () => {
    const panel = mountPanel(status({ running: true, coins_total: 0 }));
    const section = panel.find('.mds-progress-section');

    expect(section.isVisible()).toBe(true);
    expect((panel.find('.mds-progress-bar').element as HTMLElement).style.width).toBe('100%');
    expect(panel.find('.mds-progress-label').text()).toBe('Running...');
    expect(panel.find('.mds-progress-text').text()).toBe('Starting...');
  });

  it('localizes the running details in zh', () => {
    const panel = mountPanel(status({ running: true, coins_total: 0 }), 'zh');

    expect(panel.find('.mds-progress-label').text()).toBe('运行中...');
    expect(panel.find('.mds-progress-text').text()).toBe('正在启动...');
  });

  it('renders the legacy idle default label inside the hidden section', () => {
    const panel = mountPanel(status());

    expect(panel.find('.mds-progress-text').text()).toBe('Idle');
  });
});
