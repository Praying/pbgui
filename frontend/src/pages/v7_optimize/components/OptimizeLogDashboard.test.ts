import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import OptimizeLogDashboard from './OptimizeLogDashboard.vue';
import type { OptimizeLogStatus } from '../lib/optimizeLogStatus';

function payload(overrides: Record<string, unknown> = {}): OptimizeLogStatus {
  return {
    name: 'alpha',
    phase: 'running',
    progress: { eval: 1200, target_iters: 5000, percent: 24.0, estimated: false, front: 42, pareto_added: 3, pareto_removed: 1 },
    runtime: { backend: 'cpu', algorithm: 'nsga2', objective_count: 2, config_n_cpus: 8 },
    system: { cpu_percent: 42.5, memory_percent: 61.2, memory_used_bytes: 9663676416, memory_total_bytes: 17179869184 },
    process: { started_at: '2026-09-06T10:00:00Z' },
    queue: { running: 1, queued: 2, error: 0 },
    log: { updated_at: '2026-09-06T10:05:00Z', last_line: 'gen 120', last_error: null },
    metrics: { objectives: { sharpe: 1.234, drawdown: 0.05 }, ranges: { roi: { min: 0.1, max: 2.5 } } },
    ...overrides,
  } as OptimizeLogStatus;
}

function mountDashboard(props: Partial<InstanceType<typeof OptimizeLogDashboard>['$props']> = {}) {
  return mount(OptimizeLogDashboard, {
    props: { status: payload(), statusError: '', actionsEnabled: true, ...props },
    global: { plugins: [createI18n('en')] },
  });
}

describe('OptimizeLogDashboard', () => {
  it('renders waiting placeholders without a status', () => {
    const wrapper = mountDashboard({ status: null });

    expect(wrapper.find('[data-test="log-progress-label"]').text()).toBe('Waiting for optimize status...');
    expect(wrapper.find('[data-test="log-phase"]').text()).toContain('-');
    expect(wrapper.find('[data-test="log-pareto"]').text()).toBe('-');
    expect(wrapper.find('[data-test="log-queue"]').text()).toBe('0 run · 0 queued · 0 err');
  });

  it('renders the legacy card values', () => {
    const wrapper = mountDashboard();

    expect(wrapper.find('[data-test="log-phase"]').text()).toContain('Running');
    expect(wrapper.find('[data-test="log-progress-label"]').text()).toBe('1,200 / 5,000 evals (24.0%)');
    expect(wrapper.find('[data-test="log-pareto"]').text()).toBe('42 (+3/-1)');
    expect(wrapper.find('[data-test="log-backend"]').text()).toBe('cpu / nsga2 / 2 obj / n_cpus 8');
    expect(wrapper.find('[data-test="log-memory"]').text()).toContain('61.2%');
    expect(wrapper.find('[data-test="log-queue"]').text()).toBe('1 run · 2 queued · 0 err');
    expect(wrapper.find('[data-test="log-objectives"]').text()).toContain('sharpe=1.234');
    expect(wrapper.find('[data-test="log-ranges"]').text()).toContain('roi 0.1000..2.500');
    expect(wrapper.find('[data-test="log-activity"]').text()).toBe('gen 120');
  });

  it('shows the gpu exact/proxy progress variant', () => {
    const wrapper = mountDashboard({
      status: payload({
        progress: { eval: 900, exact_evaluations: 120, target_exact_evaluations: 500, generation: 12, proxy_evaluations: 780, exact_inflight: 4, percent: 24.0 },
        runtime: { backend: 'gpu', algorithm: 'nsga2', objective_count: 2 },
      }),
    });

    expect(wrapper.find('[data-test="log-progress-label"]').text()).toBe('120 / 500 exact · gen 12 · 780 proxy · 4 inflight (24.0%)');
  });

  it('reports status failures in the activity and error rows', () => {
    const wrapper = mountDashboard({ statusError: 'API 500: nope' });

    expect(wrapper.find('[data-test="log-activity"]').text()).toBe('Status unavailable');
    expect(wrapper.find('[data-test="log-error"]').text()).toBe('API 500: nope');
  });

  it('disables and emits the Pareto mini actions', async () => {
    const locked = mountDashboard({ actionsEnabled: false });
    expect(locked.find('[data-test="log-open-results"]').attributes('disabled')).toBeDefined();
    expect(locked.find('[data-test="log-open-explorer"]').attributes('disabled')).toBeDefined();
    locked.unmount();

    const wrapper = mountDashboard();
    await wrapper.find('[data-test="log-open-results"]').trigger('click');
    await wrapper.find('[data-test="log-open-explorer"]').trigger('click');
    expect(wrapper.emitted('openResults')).toHaveLength(1);
    expect(wrapper.emitted('openExplorer')).toHaveLength(1);
  });
});
