import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ErrorState from './ErrorState.vue';

describe('ErrorState', () => {
  it('announces a reachable failure and keeps retry text visible', async () => {
    const wrapper = mount(ErrorState, {
      props: {
        title: 'Jobs unavailable',
        message: 'The jobs service did not respond.',
        retryLabel: 'Retry loading jobs',
      },
    });

    const state = wrapper.get('[role="alert"]');

    expect(state.attributes('data-state')).toBe('error');
    expect(state.attributes('aria-live')).toBe('assertive');
    expect(state.attributes('aria-labelledby')).toBeTruthy();
    expect(state.attributes('aria-describedby')).toBeTruthy();
    expect(state.text()).toContain('The jobs service did not respond.');
    expect(wrapper.get('button').text()).toBe('Retry loading jobs');
    expect(wrapper.get('button').find('svg').exists()).toBe(true);

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('retry')).toHaveLength(1);
  });
});
