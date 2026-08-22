import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { PhHouse } from '@phosphor-icons/vue';
import IconButton from './IconButton.vue';

describe('IconButton', () => {
  it('gives icon-only actions an accessible name and title', () => {
    const wrapper = mount(IconButton, {
      props: { icon: PhHouse, label: 'Open home' },
    });

    expect(wrapper.get('button').attributes('aria-label')).toBe('Open home');
    expect(wrapper.get('button').attributes('title')).toBe('Open home');
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true');
  });

  it('uses an explicit tooltip slot instead of duplicating a title attribute', () => {
    const wrapper = mount(IconButton, {
      props: { icon: PhHouse, label: 'Open home' },
      slots: { tooltip: '<span>Open the home page</span>' },
    });

    const tooltip = wrapper.get('[role="tooltip"]');

    expect(wrapper.get('button').attributes('title')).toBeUndefined();
    expect(wrapper.get('button').attributes('aria-describedby')).toBe(tooltip.attributes('id'));
    expect(tooltip.text()).toBe('Open the home page');
  });

  it('forwards button type, disabled state, and click events', async () => {
    const wrapper = mount(IconButton, {
      props: { icon: PhHouse, label: 'Submit form', type: 'submit', disabled: true },
    });

    expect(wrapper.get('button').attributes('type')).toBe('submit');
    expect(wrapper.get('button').element.disabled).toBe(true);

    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();

    await wrapper.setProps({ disabled: false });
    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('click')).toHaveLength(1);
  });
});
