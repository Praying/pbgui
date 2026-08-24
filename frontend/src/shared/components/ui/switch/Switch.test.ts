import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { Switch } from '.';

describe('Switch', () => {
  it('renders an ARIA switch with the shared chrome', () => {
    const wrapper = mount(Switch, { props: { modelValue: false } });

    const el = wrapper.get('[role="switch"]');
    expect(el.classes()).toContain('w-9');
    expect(el.attributes('aria-checked')).toBe('false');
    expect(wrapper.find('[data-slot="switch-thumb"]').exists()).toBe(true);
  });

  it('toggles through v-model on click', async () => {
    const on = ref(false);
    const wrapper = mount(Switch, {
      props: { modelValue: on.value, 'onUpdate:modelValue': (v: string | number | boolean) => (on.value = v as boolean) },
    });

    await wrapper.get('[role="switch"]').trigger('click');
    expect(on.value).toBe(true);

    // the parent writes the new value back, the switch reflects it
    await wrapper.setProps({ modelValue: on.value });
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
  });

  it('supports non-boolean bound values via trueValue/falseValue', async () => {
    const enabled = ref(0);
    const wrapper = mount(Switch, {
      props: {
        modelValue: enabled.value,
        'onUpdate:modelValue': (v: string | number | boolean) => (enabled.value = v as number),
        trueValue: 1,
        falseValue: 0,
      },
    });

    await wrapper.get('[role="switch"]').trigger('click');
    expect(enabled.value).toBe(1);
  });

  it('toggles from the keyboard and can be disabled', async () => {
    const on = ref(false);
    const wrapper = mount(Switch, {
      props: { modelValue: on.value, 'onUpdate:modelValue': (v: string | number | boolean) => (on.value = v as boolean) },
    });

    // Reka binds Enter; Space activates through the native button click
    await wrapper.get('[role="switch"]').trigger('keydown', { key: 'Enter' });
    expect(on.value).toBe(true);

    const disabled = mount(Switch, { props: { modelValue: false, disabled: true } });
    expect(disabled.get('[role="switch"]').attributes('disabled')).toBeDefined();
  });
});
