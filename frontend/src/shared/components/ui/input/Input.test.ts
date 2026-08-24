import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { Input } from '.';

describe('Input', () => {
  it('binds v-model both ways', async () => {
    const value = ref<string | number | null>('BTCUSDT');
    const wrapper = mount(Input, {
      props: {
        modelValue: value.value,
        'onUpdate:modelValue': (v: string | number | null | undefined) => (value.value = v ?? null),
      },
    });

    const input = wrapper.get('input');
    expect((input.element as HTMLInputElement).value).toBe('BTCUSDT');

    await input.setValue('ETHUSDT');
    expect(value.value).toBe('ETHUSDT');
  });

  it('falls native attributes through to the element', () => {
    const wrapper = mount(Input, {
      attrs: { type: 'date', placeholder: 'YYYY-MM-DD', min: '2020-01-01' },
    });

    const input = wrapper.get('input');
    expect(input.attributes('type')).toBe('date');
    expect(input.attributes('placeholder')).toBe('YYYY-MM-DD');
    expect(input.attributes('min')).toBe('2020-01-01');
  });

  it('renders the shared chrome and disables', () => {
    const wrapper = mount(Input, { props: { disabled: true } });
    const input = wrapper.get('input');
    expect(input.classes()).toContain('bg-input');
    expect(input.classes()).toContain('h-8');
    expect(input.attributes('disabled')).toBeDefined();
  });

  it('merges caller classes after the base chrome', () => {
    const wrapper = mount(Input, { props: { class: 'h-7 font-mono' } });
    const classes = wrapper.get('input').classes();
    expect(classes).toContain('font-mono');
    // tailwind-merge resolves the height conflict in favour of the caller
    expect(classes).toContain('h-7');
    expect(classes).not.toContain('h-8');
  });
});
