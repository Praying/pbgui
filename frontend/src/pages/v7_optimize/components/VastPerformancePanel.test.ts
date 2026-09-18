import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { apiFetch } from '@/shared/api';
import VastPerformancePanel from './VastPerformancePanel.vue';

vi.mock('@/shared/api', () => ({ apiFetch: vi.fn() }));
enableAutoUnmount(afterEach);

const fingerprint = 'f'.repeat(64);
const runs = [
  {
    id: 'a'.repeat(32),
    config_name: 'alpha',
    status: 'completed',
    fingerprint,
    hardware: { gpu_name: 'RTX 4090', machine_id: 42, cpu_cores: 16 },
    workload: { coins: ['BTC'], exchanges: ['binance'], scenario_count: 2, exported_candles: 1000 },
    summary: { proxy_per_minute: 1200, exact_per_minute: 30, exact_per_usd: 100 },
    cost_estimate: { total_usd: 1.25 },
  },
  {
    id: 'b'.repeat(32),
    config_name: 'beta',
    status: 'completed',
    fingerprint,
    hardware: { gpu_name: 'RTX 3090', machine_id: 43, cpu_cores: 12 },
    workload: { coins: ['ETH'], exchanges: ['bybit'], scenario_count: 1, exported_candles: 800 },
    summary: { proxy_per_minute: 900, exact_per_minute: 25, exact_per_usd: 80 },
    cost_estimate: { total_usd: 1.5 },
  },
];

describe('VastPerformancePanel', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/vast/performance?')) return { runs, total: 2, offset: 0, limit: 100 };
      if (url === '/api/vast/performance/compare' && init?.method === 'POST') {
        return {
          runs: runs.map((run, index) => ({
            ...run,
            series: {
              counter: [
                { sampled_at: 1000, proxy_total: 100, exact_total: 10 },
                { sampled_at: 1060, proxy_total: 700 + index * 100, exact_total: 40 + index * 5 },
              ],
              telemetry: [],
            },
          })),
        };
      }
      return {};
    });
  });

  it('filters retained history and compares selected runs from one workload', async () => {
    const wrapper = mount(VastPerformancePanel, {
      props: { active: true },
      global: { plugins: [createI18n('en')] },
    });
    await flushPromises();

    expect(wrapper.findAll('[data-test="performance-row"]')).toHaveLength(2);
    await wrapper.get('[data-test="performance-filter"]').setValue('ETH');
    expect(wrapper.findAll('[data-test="performance-row"]')).toHaveLength(1);
    await wrapper.get('[data-test="performance-filter"]').setValue('');

    const rows = wrapper.findAll('[data-test="performance-row"]');
    await rows[0]!.trigger('click');
    await rows[1]!.trigger('click');
    await wrapper.get('[data-test="performance-compare"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(apiFetch).mock.calls).toContainEqual([
      '/api/vast/performance/compare',
      {
        method: 'POST',
        body: JSON.stringify({ ids: [runs[0]!.id, runs[1]!.id] }),
        signal: expect.any(AbortSignal),
      },
    ]);
    expect(wrapper.findAll('[data-test="performance-run-details"]')).toHaveLength(2);
    expect(wrapper.findAll('svg[data-test="performance-chart"]')).toHaveLength(2);
  });

  it('supports full-row drag range selection and same-workload filtering', async () => {
    const wrapper = mount(VastPerformancePanel, {
      props: { active: true },
      global: { plugins: [createI18n('en')] },
    });
    await flushPromises();

    const rows = wrapper.findAll('[data-test="performance-row"]');
    await rows[0]!.trigger('pointerdown', { button: 0 });
    await rows[1]!.trigger('pointerenter');
    document.dispatchEvent(new Event('pointerup'));
    await wrapper.get('[data-test="performance-same-workload"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(apiFetch).mock.calls.some(([url]) => String(url).includes(`fingerprint=${fingerprint}`))).toBe(true);
  });

  it('does not deselect a row when pointerdown is followed by its native click', async () => {
    const wrapper = mount(VastPerformancePanel, {
      props: { active: true },
      global: { plugins: [createI18n('en')] },
    });
    await flushPromises();

    const firstRow = wrapper.findAll('[data-test="performance-row"]')[0]!;
    await firstRow.trigger('pointerdown', { button: 0 });
    document.dispatchEvent(new Event('pointerup'));
    await firstRow.trigger('click');

    expect(firstRow.attributes('aria-selected')).toBe('true');
  });
});
