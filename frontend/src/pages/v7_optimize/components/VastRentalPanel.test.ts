import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import VastRentalPanel from './VastRentalPanel.vue';
import type { VastJob, VastWorker } from '../lib/vastTypes';

enableAutoUnmount(afterEach);

function runningJob(): VastJob {
  return {
    id: 'a'.repeat(32),
    config_name: 'cloud-config',
    status: 'running',
    preparation_progress: { bytes: 50, total_bytes: 100, files: 2, total_files: 4, stage: 'copying' },
    runtime_metrics: { gpu_percent: 80, cpu_percent: 42, sampled_at: Date.now() / 1000 },
    throughput: {
      proxy_per_minute: 1200,
      exact_per_minute: 24,
      proxy_total: 12000,
      exact_total: 240,
      sampled_at: Date.now() / 1000,
    },
    rental: {
      id: 'b'.repeat(32),
      deadline: 2_000_000_000,
      budget_usd: 2,
      transfer_reserve_usd: 0.25,
      deadline_protocol: 1,
      offer: { machine_id: 42, gpu_name: 'RTX 4090', price_hour_usd: 0.5 },
    },
  };
}

describe('VastRentalPanel', () => {
  it('renders preparation, utilization, throughput and editable rental limits', async () => {
    const job = runningJob();
    const worker: VastWorker = { id: job.rental!.id, rental_state: 'active', rental: job.rental };
    const wrapper = mount(VastRentalPanel, {
      props: { jobs: [job], worker, queuePaused: false, busy: false },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.get('[data-test="job-progress"]').text()).toContain('50%');
    expect(wrapper.get('[data-test="job-throughput"]').text()).toContain('1,200');
    expect(wrapper.get('[data-test="job-utilization"]').text()).toContain('80%');

    await wrapper.get('[data-test="deadline-minutes"]').setValue('90');
    await wrapper.get('[data-test="extend-deadline"]').trigger('click');
    await wrapper.get('[data-test="rental-budget"]').setValue('3.5');
    await wrapper.get('[data-test="save-rental-budget"]').trigger('click');
    await wrapper.get('[data-test="transfer-reserve"]').setValue('0.5');
    await wrapper.get('[data-test="save-transfer-reserve"]').trigger('click');

    expect(wrapper.emitted('adjust-deadline')).toEqual([[job.rental, 90]]);
    expect(wrapper.emitted('adjust-budget')).toEqual([[job.rental, 3.5]]);
    expect(wrapper.emitted('adjust-reserve')).toEqual([[job.rental, 0.5]]);
  });

  it('preserves same-rental drafts across polling updates and resets for a new rental', async () => {
    const job = runningJob();
    const wrapper = mount(VastRentalPanel, {
      props: { jobs: [job], worker: { id: job.rental!.id, rental_state: 'active' }, queuePaused: false, busy: false },
      global: { plugins: [createI18n('en')] },
    });

    const budget = wrapper.get('[data-test="rental-budget"]');
    await budget.setValue('9');
    await wrapper.setProps({ jobs: [{ ...job, rental: { ...job.rental!, budget_usd: 4 } }] });
    expect((budget.element as HTMLInputElement).value).toBe('9');

    await wrapper.setProps({ jobs: [{ ...job, rental: { ...job.rental!, id: 'c'.repeat(32), budget_usd: 5 } }] });
    expect((wrapper.get('[data-test="rental-budget"]').element as HTMLInputElement).value).toBe('5');
  });
});
