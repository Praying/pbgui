import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import AlertRouting from './AlertRouting.vue';

/** The exact 13 ids legacy collectAlertRoutingFromForm walks, in order. */
const ALL_ROUTING_IDS = [
  'offline_gui',
  'service_gui',
  'system_gui',
  'instance_gui',
  'ssh_lost_telegram',
  'ssh_recovered_telegram',
  'service_down_telegram',
  'service_restart_started_telegram',
  'service_recovered_telegram',
  'system_problem_telegram',
  'system_recovered_telegram',
  'instance_problem_telegram',
  'instance_recovered_telegram',
] as const;

/** Legacy renderAlertRoutingSettings group table (contract: order + rows). */
const GROUPS = [
  {
    title: 'Offline Hosts',
    guiId: 'offline_gui',
    telegram: [
      { id: 'ssh_lost_telegram', label: 'SSH lost' },
      { id: 'ssh_recovered_telegram', label: 'SSH recovered' },
    ],
  },
  {
    title: 'Services',
    guiId: 'service_gui',
    telegram: [
      { id: 'service_down_telegram', label: 'Service down' },
      { id: 'service_restart_started_telegram', label: 'Restart initiated' },
      { id: 'service_recovered_telegram', label: 'Service recovered' },
    ],
  },
  {
    title: 'System Thresholds',
    guiId: 'system_gui',
    telegram: [
      { id: 'system_problem_telegram', label: 'System problem' },
      { id: 'system_recovered_telegram', label: 'System recovered' },
    ],
  },
  {
    title: 'Instance Thresholds',
    guiId: 'instance_gui',
    telegram: [
      { id: 'instance_problem_telegram', label: 'Instance problem' },
      { id: 'instance_recovered_telegram', label: 'Instance recovered' },
    ],
  },
] as const;

function mountRouting(routing: Record<string, boolean> = {}) {
  return mount(AlertRouting, {
    props: { routing },
    global: { plugins: [createI18n('en')] },
  });
}

function checkbox(wrapper: ReturnType<typeof mountRouting>, id: string) {
  const box = wrapper.find(`#${id}`);
  expect(box.exists(), id).toBe(true);
  return box;
}

describe('AlertRouting rendering (legacy renderAlertRoutingSettings)', () => {
  it('renders the four legacy groups in order with their titles', () => {
    const wrapper = mountRouting();

    expect(wrapper.findAll('.alert-routing-title').map((el) => el.text())).toEqual(
      GROUPS.map((g) => g.title)
    );
    expect(wrapper.findAll('.alert-routing-group')).toHaveLength(4);
  });

  it('renders exactly the 13 legacy checkbox ids (legacy ids array, any DOM order)', () => {
    const wrapper = mountRouting();

    const ids = wrapper.findAll('input[type="checkbox"]').map((el) => el.attributes('id'));
    // The legacy collectAlertRoutingFromForm ids array only keys the payload;
    // the DOM renders gui + telegram per group. Assert the exact set.
    expect(ids).toHaveLength(13);
    expect([...ids].sort()).toEqual([...ALL_ROUTING_IDS].sort());
  });

  it('renders the GUI / Telegram column headers per group (legacy literals)', () => {
    const wrapper = mountRouting();

    for (const group of wrapper.findAll('.alert-routing-group')) {
      expect(group.findAll('.alert-routing-col-header').map((el) => el.text())).toEqual([
        'GUI',
        'Telegram',
      ]);
    }
  });

  it('labels the GUI row and telegram rows with their legacy labels', () => {
    const wrapper = mountRouting();

    for (const group of GROUPS) {
      const groupEl = wrapper.findAll('.alert-routing-group')[GROUPS.indexOf(group)]!;
      expect(groupEl.find(`#${group.guiId}`).element.closest('label')!.textContent).toContain(
        'Show active alarms in GUI'
      );
      for (const row of group.telegram) {
        expect(groupEl.find(`#${row.id}`).element.closest('label')!.textContent).toContain(
          row.label
        );
      }
    }
  });

  it('suffixes GUI rows with "Active alerts only" and telegram rows with "-> Telegram"', () => {
    const wrapper = mountRouting();

    const firstGroup = wrapper.findAll('.alert-routing-group')[0]!;
    expect(firstGroup.find('#offline_gui').element.closest('label')!.textContent).toContain(
      'Active alerts only'
    );
    expect(firstGroup.find('#ssh_lost_telegram').element.closest('label')!.textContent).toContain(
      '-> Telegram'
    );
    // The suffix span is the muted inner span, not the label itself.
    expect(firstGroup.find('.alert-routing-check .label-hint').text()).toBe('Active alerts only');
  });

  it('checks every box when the routing map is empty (legacy data[id] !== false)', () => {
    const wrapper = mountRouting();

    for (const id of ALL_ROUTING_IDS) {
      expect((checkbox(wrapper, id).element as HTMLInputElement).checked, id).toBe(true);
    }
  });

  it('unchecks exactly the ids set to false, keeping true checked', () => {
    const wrapper = mountRouting({
      offline_gui: false,
      service_restart_started_telegram: false,
      system_gui: true,
      instance_recovered_telegram: true,
    });

    expect((checkbox(wrapper, 'offline_gui').element as HTMLInputElement).checked).toBe(false);
    expect((checkbox(wrapper, 'service_restart_started_telegram').element as HTMLInputElement).checked).toBe(false);
    for (const id of ALL_ROUTING_IDS) {
      if (id === 'offline_gui' || id === 'service_restart_started_telegram') continue;
      expect((checkbox(wrapper, id).element as HTMLInputElement).checked, id).toBe(true);
    }
  });
});

describe('AlertRouting editing (emit chain for collectAlertRoutingFromForm)', () => {
  it('emits update:routing with the toggled box flipped immutably', async () => {
    const original = { offline_gui: true, ssh_lost_telegram: false };
    const wrapper = mountRouting(original);

    await checkbox(wrapper, 'ssh_lost_telegram').setValue(true);

    const emitted = wrapper.emitted('update:routing');
    expect(emitted).toHaveLength(1);
    expect(emitted![0]).toEqual([{ offline_gui: true, ssh_lost_telegram: true }]);
    expect(emitted![0]![0]).not.toBe(original);
    expect(original.ssh_lost_telegram).toBe(false);
  });

  it('toggles a default-checked box to false', async () => {
    const wrapper = mountRouting({});

    await checkbox(wrapper, 'service_gui').setValue(false);

    expect(wrapper.emitted('update:routing')![0]).toEqual([{ service_gui: false }]);
  });

  it('toggles an unchecked box back to true', async () => {
    const wrapper = mountRouting({ system_problem_telegram: false });

    await checkbox(wrapper, 'system_problem_telegram').setValue(true);

    expect(wrapper.emitted('update:routing')![0]).toEqual([{ system_problem_telegram: true }]);
  });
});
