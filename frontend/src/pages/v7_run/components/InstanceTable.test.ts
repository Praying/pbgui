import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from '@/shared/i18n';
import InstanceTable from './InstanceTable.vue';
import type { RunInstance } from '../lib/table';

const HOST = 'vps-frankfurt-hetzner-cx41-prod-01.internal.example-trading-infra.com';
const NOTE = 'A fairly long operator note explaining why this instance is configured the way it is';

function row(overrides: Partial<RunInstance> = {}): RunInstance {
  return {
    name: 'strategy_instance_with_a_very_long_descriptive_name_for_testing_0',
    user: 'wallet_main_hyperliquid_vault_rebalancer_account_0',
    strategy: 'passivbot',
    enabled_on: HOST,
    status: 'running',
    version: 3,
    running_version: 3,
    twe: '125',
    running_on: [HOST, 'vps-singapore-01'],
    blocked_on: [],
    desired_state: 'running',
    note: NOTE,
    ...overrides,
  };
}

function mountTable(rows: RunInstance[], isV8 = false) {
  return mount(InstanceTable, {
    props: {
      rows,
      totalCount: rows.length,
      isV8,
      supportsForcedModes: false,
      supportsConversion: false,
      sort: { col: 'name', asc: true },
    },
    global: { plugins: [createI18n('en')] },
  });
}

/**
 * The table is min-w-max with nowrap cells, so its width was the sum of the
 * widest value per column. With realistic data (66-char FQDNs, free-text notes)
 * it measured 3050-3816px in a 1324px frame and Status, versions and TWE fell
 * out of view. Free-text columns are capped and carry a tooltip; the status and
 * numeric columns are not clamped so they stay on screen.
 */
describe('InstanceTable free-text columns', () => {
  const FREE_TEXT: Array<[string, number]> = [
    ['name', 0],
    ['user', 1],
    ['enabled_on', 2],
  ];

  it('caps and truncates the name, user and enabled-on cells and exposes the full value', () => {
    const wrapper = mountTable([row()]);
    const cells = wrapper.findAll('tbody tr').at(0)!.findAll('td');
    for (const [, index] of FREE_TEXT) {
      const span = cells[index]!.get('span');
      expect(span.classes(), `column ${index}`).toEqual(expect.arrayContaining(['block', 'truncate']));
      expect(span.classes().some((c) => /^max-w-/.test(c)), `column ${index} has a cap`).toBe(true);
      expect(span.attributes('title')).toBe(cells[index]!.text());
    }
  });

  it('caps running-on and note and exposes the full text', () => {
    const wrapper = mountTable([row()]);
    const cells = wrapper.findAll('tbody tr').at(0)!.findAll('td');
    const runningOn = cells.find((c) => c.text().includes('vps-singapore-01'))!.get('span');
    expect(runningOn.attributes('title')).toBe(`${HOST}, vps-singapore-01`);
    expect(runningOn.classes()).toContain('truncate');
    const note = cells.find((c) => c.text() === NOTE)!.get('span');
    expect(note.attributes('title')).toBe(NOTE);
    expect(note.classes().some((c) => /^max-w-/.test(c))).toBe(true);
  });

  it('adds the same cap to the v8-only strategy column', () => {
    const wrapper = mountTable([row()], true);
    const strategy = wrapper.findAll('tbody tr').at(0)!.findAll('td').find((c) => c.text() === 'passivbot')!;
    expect(strategy.get('span').classes()).toContain('truncate');
  });

  it('does not clamp the numeric and status columns', () => {
    const wrapper = mountTable([row()]);
    const cells = wrapper.findAll('tbody tr').at(0)!.findAll('td');
    const version = cells.find((c) => c.classes().includes('tabular-nums'))!;
    expect(version.find('.truncate').exists()).toBe(false);
  });

  it('renders a dash and no empty tooltip for a missing note', () => {
    const wrapper = mountTable([row({ note: '' })]);
    const noteSpans = wrapper.findAll('tbody tr').at(0)!.findAll('td span.max-w-80');
    expect(noteSpans).toHaveLength(1);
    expect(noteSpans[0]!.attributes('title')).toBeUndefined();
  });
});
