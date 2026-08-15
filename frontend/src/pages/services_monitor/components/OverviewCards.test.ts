import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import OverviewCards from './OverviewCards.vue';
import type { ServiceAction, ServiceStatusMap } from '../types';

/** One entry per SERVICES card, in legacy registry order. */
const STATUSES: ServiceStatusMap = {
  pbcluster: { running: true },
  pbrun: {
    running: false,
    reason: 'not started',
    unit: 'pbrun.service',
    systemd_state: 'inactive',
    systemd_enabled_state: 'enabled',
  },
  pbdata: { running: true, can_enable: true, enabled: true },
  pbcoindata: { running: false, can_enable: true },
  'monitor-agent': { running: false, expected: false },
  'vps-monitor': { running: true, can_enable: true, enabled: false, enable_blocked_reason: 'no unit' },
  'api-server': { running: true },
};

function mountCards(props: { statuses?: ServiceStatusMap; pending?: Record<string, ServiceAction> } = {}) {
  return mount(OverviewCards, {
    props: { statuses: STATUSES, ...props },
    global: { plugins: [createI18n('en')] },
  });
}

function card(wrapper: ReturnType<typeof mountCards>, svcId: string) {
  const cardEl = wrapper.findAll('.svc-card').find((c) => c.attributes('data-svc') === svcId);
  expect(cardEl, `card for ${svcId}`).toBeDefined();
  return cardEl!;
}

describe('OverviewCards', () => {
  it('renders one card per legacy service plus the workers and migration cards', () => {
    const wrapper = mountCards();

    const cards = wrapper.findAll('.svc-card');
    expect(cards).toHaveLength(9); // 7 SERVICES + workers + migration
    const names = cards.map((c) => c.find('.card-name').text());
    expect(names).toEqual([
      'PBCluster', 'PBRun', 'PBData', 'PBCoinData', 'PBMonitorAgent', 'VPSMonitor', 'PBAPIServer',
      'Workers', 'Migration',
    ]);
  });

  it('renders running/stopped/skipped status text and card classes', () => {
    const wrapper = mountCards();

    expect(card(wrapper, 'pbcluster').find('.card-status-row').text()).toBe('Running');
    expect(card(wrapper, 'pbrun').find('.card-status-row').text()).toBe('Stopped');
    expect(card(wrapper, 'monitor-agent').find('.card-status-row').text()).toBe('Skipped');
    expect(card(wrapper, 'pbcluster').classes()).toContain('running');
    expect(card(wrapper, 'pbrun').classes()).toContain('stopped');
    // Skipped services carry no status class at all (legacy serviceStatusClass).
    expect(card(wrapper, 'monitor-agent').classes()).not.toContain('running');
    expect(card(wrapper, 'monitor-agent').classes()).not.toContain('stopped');
  });

  it('appends the enable/disable suffix when can_enable is set', () => {
    const wrapper = mountCards();

    expect(card(wrapper, 'pbdata').find('.card-status-row').text()).toBe('Running · Enabled');
    expect(card(wrapper, 'pbcoindata').find('.card-status-row').text()).toBe('Stopped · Disabled');
  });

  it('carries the systemd detail tooltip on the status row', () => {
    const wrapper = mountCards();

    expect(card(wrapper, 'pbrun').find('.card-status-row').attributes('title')).toBe(
      'not started\nUnit: pbrun.service\nState: inactive\nAutostart: enabled'
    );
  });

  it('renders stop + restart buttons for a running service, start for a stopped one', () => {
    const wrapper = mountCards();

    const running = card(wrapper, 'pbcluster').findAll('.card-btn');
    expect(running).toHaveLength(2);
    expect(running[0]!.classes()).toContain('stop');
    expect(running[0]!.text()).toContain('Stop');
    expect(running[1]!.classes()).toContain('restart');
    expect(running[1]!.text()).toContain('Restart');

    const stopped = card(wrapper, 'pbrun').findAll('.card-btn');
    expect(stopped).toHaveLength(1);
    expect(stopped[0]!.classes()).toContain('start');
    expect(stopped[0]!.text()).toContain('Start');
  });

  it('renders only restart for a running api-server (legacy restartApiServer button)', () => {
    const wrapper = mountCards();

    const buttons = card(wrapper, 'api-server').findAll('.card-btn');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.classes()).toContain('restart');
  });

  it('renders no control buttons for a skipped service', () => {
    const wrapper = mountCards();

    expect(card(wrapper, 'monitor-agent').findAll('.card-btn')).toHaveLength(0);
  });

  it('renders disable when enabled, enable when disabled unless blocked', () => {
    const wrapper = mountCards();

    const pbdata = card(wrapper, 'pbdata').findAll('.card-btn');
    expect(pbdata.some((b) => b.classes().includes('disable'))).toBe(true);

    const pbcoindata = card(wrapper, 'pbcoindata').findAll('.card-btn');
    expect(pbcoindata.some((b) => b.classes().includes('enable'))).toBe(true);

    // enable_blocked_reason suppresses the enable button entirely.
    expect(card(wrapper, 'vps-monitor').findAll('.card-btn').some((b) => b.classes().includes('enable'))).toBe(false);
  });

  it('disables every button and swaps labels while an action is pending', () => {
    const wrapper = mountCards({ pending: { pbcluster: 'stop' } });

    const row = card(wrapper, 'pbcluster').find('.card-status-row');
    expect(row.text()).toBe('Running · Stopping...');
    const buttons = card(wrapper, 'pbcluster').findAll('.card-btn');
    expect(buttons.every((b) => b.attributes('disabled') !== undefined)).toBe(true);
    expect(buttons.find((b) => b.classes().includes('stop'))!.text()).toContain('Stopping...');
  });

  it('emits action with svcId and action on button click without selecting the panel', async () => {
    const wrapper = mountCards();

    await card(wrapper, 'pbcluster').find('.card-btn.stop').trigger('click');

    expect(wrapper.emitted('action')).toEqual([['pbcluster', 'stop']]);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('emits select with the panel id on card click', async () => {
    const wrapper = mountCards();

    await card(wrapper, 'pbrun').trigger('click');

    expect(wrapper.emitted('select')).toEqual([['pbrun']]);
  });

  it('shows the workers card from worker counts with an Open button', async () => {
    const wrapper = mountCards();
    await wrapper.setProps({ workersCounts: { running: 2, total: 5 } });

    const workers = wrapper.findAll('.svc-card').find((c) => c.attributes('data-svc') === 'workers')!;
    expect(workers.classes()).toContain('running');
    expect(workers.find('.card-status-row').text()).toBe('2 / 5 running');
    await workers.find('.card-btn').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['workers']]);
  });

  it('marks the workers card stopped at zero running', () => {
    const wrapper = mountCards();

    const workers = wrapper.findAll('.svc-card').find((c) => c.attributes('data-svc') === 'workers')!;
    expect(workers.classes()).toContain('stopped');
  });

  it('shows the not-loaded migration card until status arrives (Task 14)', async () => {
    const wrapper = mountCards();

    const migration = wrapper.findAll('.svc-card').find((c) => c.attributes('data-svc') === 'migration')!;
    expect(migration.find('.card-status-row').text()).toBe('Migration status not loaded yet.');
    await migration.find('.card-btn').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['migration']]);
  });
});
