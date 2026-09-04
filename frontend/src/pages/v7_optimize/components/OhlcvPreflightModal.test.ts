import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import OhlcvPreflightModal from './OhlcvPreflightModal.vue';

describe('OhlcvPreflightModal', () => {
  it('renders readiness counts and exposes preload job controls in English', async () => {
    const wrapper = mount(OhlcvPreflightModal, {
      props: {
        open: true,
        loading: false,
        error: '',
        payload: {
          summary: {
            overall_status: 'preload',
            headline: 'Some coins would fetch on start',
            detail: '1 would fetch on start',
            counts: { missing_local: 1 },
            preload_supported: true,
            preload_label: 'Preload missing OHLCV data',
          },
        },
        job: { job_id: 'job-1', status: 'running', log_tail: ['downloading BTCUSDT'] },
      },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.text()).toContain('Some coins would fetch on start');
    expect(wrapper.text()).toContain('Missing local');
    expect(wrapper.text()).toContain('downloading BTCUSDT');
    expect(wrapper.find('[data-action="stop"]').exists()).toBe(true);
    await wrapper.find('[data-action="refresh"]').trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });

  it('renders translated status, server messages, request fields, and universe values in Chinese', async () => {
    const wrapper = mount(OhlcvPreflightModal, {
      props: {
        open: true,
        loading: false,
        error: '',
        payload: {
          summary: {
            overall_status: 'preload',
            headline: 'Some coins need PB8 OHLCV data',
            detail: '41 would fetch on start',
            counts: { missing_local: 41 },
            preload_supported: true,
            preload_label: 'Preload missing OHLCV data',
            preload_detail: "Run PB8's native passivbot download command for this config.",
          },
          request: {
            requested_start_date: '2024-01-01',
            catalog_present: true,
          },
          universe: {
            coin_count: 41,
            coins_mode: 'explicit',
          },
          best_samples: {
            missing_local: [
              { coin: 'BTC', exchange: 'bybit', note: 'PB8 would fetch this range.', effective_start_date: '2024-01-01' },
            ],
          },
          notes: ['Preflight uses PB8\'s current approved-coin resolution.'],
        },
        job: null,
      },
      global: { plugins: [createI18n('zh')] },
    });

    const text = wrapper.text();
    // Status & Summary
    expect(text).toContain('需要预加载');
    expect(text).toContain('部分币对需要 PB8 OHLCV 数据');
    expect(text).toContain('41 个启动时将在线获取');
    expect(text).toContain('本地缺失');
    expect(text).toContain("针对此配置运行 PB8 原生 passivbot 下载命令。");

    // Request & Universe fields and values
    expect(text).toContain('请求开始日期');
    expect(text).toContain('目录就绪');
    expect(text).toContain('是');
    expect(text).toContain('币对数量');
    expect(text).toContain('币对模式');
    expect(text).toContain('指定');

    // Samples & Notes
    expect(text).toContain('PB8 将在线获取此区间。');
    expect(text).toContain("预检使用 PB8 当前的已批准币对解析规则。");

    // Preload button
    expect(text).toContain('预加载缺失的 OHLCV 数据');
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
    expect(overlay.classes()).toContain('z-[var(--z-modal)]');
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


