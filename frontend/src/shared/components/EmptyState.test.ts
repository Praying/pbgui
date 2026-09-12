import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { PhHourglass } from '@phosphor-icons/vue';
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

  it('defaults to the roomy panel with a secondary action', () => {
    const wrapper = mount(EmptyState, { props: { title: 'Nothing here', actionLabel: 'Reload' } });

    const state = wrapper.get('[role="status"]');
    expect(state.classes()).toContain('pbgui-empty-state--panel');
    expect(state.classes()).not.toContain('pbgui-empty-state--inline');
    expect(wrapper.find('.pbgui-empty-state__icon').exists()).toBe(false);
    // secondary = no primary font weight; the CTA tone only changes there
    const button = wrapper.get('button');
    expect(button.classes()).toContain('bg-card');
    expect(button.classes()).not.toContain('font-semibold');
  });

  it('renders the decorative icon tile without duplicating the semantics', () => {
    const wrapper = mount(EmptyState, { props: { title: 'Queue is empty', icon: PhHourglass } });

    const tile = wrapper.get('.pbgui-empty-state__icon');
    expect(tile.attributes('aria-hidden')).toBe('true');
    expect(tile.find('svg').exists()).toBe(true);
    // the tile must not become an accessible name source
    expect(wrapper.get('[role="status"]').attributes('aria-label')).toBeUndefined();
    expect(wrapper.get('.pbgui-empty-state__title').text()).toBe('Queue is empty');
  });

  it('shrinks the tile and title for the inline variant', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No matches', icon: PhHourglass, size: 'inline' },
    });

    const state = wrapper.get('[role="status"]');
    expect(state.classes()).toContain('pbgui-empty-state--inline');
    expect(state.classes()).not.toContain('pbgui-empty-state--panel');
    expect(wrapper.find('.pbgui-empty-state__icon').exists()).toBe(true);
  });

  it('honours the action variant for first-run empty states', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No configs yet', actionLabel: 'New Config', actionVariant: 'primary' },
    });

    const button = wrapper.get('button');
    expect(button.classes()).toContain('bg-accent');
    expect(button.classes()).toContain('font-semibold');
  });

  it('drops aria-describedby when there is no message', () => {
    const wrapper = mount(EmptyState, { props: { title: 'Nothing here' } });

    expect(wrapper.get('[role="status"]').attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.find('.pbgui-empty-state__message').exists()).toBe(false);
  });
});
