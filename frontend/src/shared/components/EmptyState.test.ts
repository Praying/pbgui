import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EmptyState from './EmptyState.vue';

describe('EmptyState', () => {
  it('communicates an empty result and exposes the existing next action', async () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: 'No jobs found',
        message: 'Try another filter.',
        actionLabel: 'Refresh jobs',
      },
    });

    const state = wrapper.get('[role="status"]');

    expect(state.attributes('data-state')).toBe('empty');
    expect(state.attributes('aria-live')).toBe('polite');
    expect(state.attributes('aria-labelledby')).toBeTruthy();
    expect(state.attributes('aria-describedby')).toBeTruthy();
    expect(state.text()).toContain('No jobs found');
    expect(state.text()).toContain('Try another filter.');
    expect(wrapper.get('button').text()).toBe('Refresh jobs');
    expect(wrapper.get('button').attributes('data-slot')).toBe('button');

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('action')).toHaveLength(1);
  });
});
