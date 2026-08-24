import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { Checkbox } from '.';

describe('Checkbox', () => {
  it('renders an ARIA checkbox with the shared chrome', () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false } });

    const el = wrapper.get('[role="checkbox"]');
    expect(el.classes()).toContain('size-4');
    expect(el.attributes('aria-checked')).toBe('false');
  });

  it('toggles through v-model on click and shows the check icon', async () => {
    const checked = ref(false);
    const wrapper = mount(Checkbox, {
      props: {
        modelValue: checked.value,
        'onUpdate:modelValue': (v: boolean | 'indeterminate') => (checked.value = v === true),
      },
    });

    await wrapper.get('[role="checkbox"]').trigger('click');
    expect(checked.value).toBe(true);

    // the parent writes the new value back, the checkbox reflects it
    await wrapper.setProps({ modelValue: checked.value });
    expect(wrapper.get('[role="checkbox"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('supports the indeterminate state', () => {
    const wrapper = mount(Checkbox, { props: { modelValue: 'indeterminate' } });

    const el = wrapper.get('[role="checkbox"]');
    expect(el.attributes('aria-checked')).toBe('mixed');
    expect(el.classes()).toContain('data-[state=indeterminate]:bg-accent');
  });

  it('respects the disabled state', () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false, disabled: true } });
    expect(wrapper.get('[role="checkbox"]').attributes('disabled')).toBeDefined();
  });
});
