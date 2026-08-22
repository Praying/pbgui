import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import LoadingSkeleton from './LoadingSkeleton.vue';

describe('LoadingSkeleton', () => {
  it('announces loading content and preserves the requested block shape', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { label: 'Loading jobs', lines: 3 },
    });

    const state = wrapper.get('[aria-busy="true"]');

    expect(state.attributes('data-state')).toBe('loading');
    expect(state.attributes('role')).toBe('status');
    expect(state.attributes('aria-live')).toBe('polite');
    expect(state.attributes('aria-labelledby')).toBeTruthy();
    expect(wrapper.get(`#${state.attributes('aria-labelledby')}`).text()).toBe('Loading jobs');
    expect(state.text()).toContain('Loading jobs');
    expect(wrapper.findAll('.pbgui-skeleton-line')).toHaveLength(3);
  });
});
