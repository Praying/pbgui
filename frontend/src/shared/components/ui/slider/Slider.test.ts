import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { Slider } from '.';

describe('Slider', () => {
  it('renders the track, accent range and a labelled thumb', () => {
    const wrapper = mount(Slider, {
      props: { modelValue: 42, label: 'Leverage', min: 0, max: 100 },
    });

    const thumb = wrapper.get('[role="slider"]');
    expect(thumb.attributes('aria-label')).toBe('Leverage');
    expect(thumb.attributes('aria-valuemin')).toBe('0');
    expect(thumb.attributes('aria-valuemax')).toBe('100');
    expect(wrapper.find('[data-slot="slider-range"]').exists()).toBe(true);
    expect(wrapper.find('[data-slot="slider-track"]').exists()).toBe(true);
  });

  it('keeps min/max defaults when unspecified', () => {
    const wrapper = mount(Slider, { props: { modelValue: 50, label: 'x' } });
    const thumb = wrapper.get('[role="slider"]');
    expect(thumb.attributes('aria-valuemin')).toBe('0');
    expect(thumb.attributes('aria-valuemax')).toBe('100');
  });

  it('moves the value with keyboard input', async () => {
    const value = ref(50);
    const wrapper = mount(Slider, {
      props: {
        modelValue: value.value,
        'onUpdate:modelValue': (v: number | undefined) => {
          if (v !== undefined) value.value = v;
        },
        label: 'Weight',
        step: 5,
      },
    });

    const thumb = wrapper.get('[role="slider"]');
    await thumb.trigger('keydown', { key: 'ArrowRight' });
    expect(value.value).toBe(55);

    await thumb.trigger('keydown', { key: 'Home' });
    expect(value.value).toBe(0);
  });

  it('exposes the disabled state on the thumb', () => {
    const wrapper = mount(Slider, { props: { modelValue: 1, label: 'x', disabled: true } });
    expect(wrapper.get('[role="slider"]').attributes('data-disabled')).toBeDefined();
  });
});
