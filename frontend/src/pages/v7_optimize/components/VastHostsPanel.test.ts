import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import VastHostsPanel from './VastHostsPanel.vue';

enableAutoUnmount(afterEach);

describe('VastHostsPanel', () => {
  it('renders rental evidence and emits reversible preference changes', async () => {
    const wrapper = mount(VastHostsPanel, {
      props: {
        hosts: [{
          machine_id: 42,
          used: true,
          working: true,
          working_detected: true,
          working_marked: false,
          preferred: false,
          rentals: 2,
        }],
        blockedMachineIds: [],
        busy: false,
      },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.get('[data-test="host-42"]').text()).toContain('Previously used');
    expect(wrapper.get('[data-test="host-42"]').text()).toContain('Working');

    await wrapper.get('[data-test="prefer-host-42"]').trigger('click');
    await wrapper.get('[data-test="block-host-42"]').trigger('click');

    expect(wrapper.emitted('set-preference')).toEqual([[42, 'preferred', true]]);
    expect(wrapper.emitted('set-block')).toEqual([[42, true]]);
  });

  it('supports manually adding and removing a blocked machine', async () => {
    const wrapper = mount(VastHostsPanel, {
      props: { hosts: [], blockedMachineIds: [77], busy: false },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.get('[data-test="host-machine-input"]').setValue('88');
    await wrapper.get('[data-test="block-machine-submit"]').trigger('click');
    await wrapper.get('[data-test="unblock-host-77"]').trigger('click');

    expect(wrapper.emitted('set-block')).toEqual([[88, true], [77, false]]);
  });
});
