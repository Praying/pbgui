import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { Textarea } from '.';

describe('Textarea', () => {
  it('binds v-model and keeps the mono chrome', async () => {
    const value = ref('{"symbol": "BTCUSDT"}');
    const wrapper = mount(Textarea, {
      props: { modelValue: value.value, 'onUpdate:modelValue': (v: string | undefined) => (value.value = v ?? '') },
    });

    const el = wrapper.get('textarea');
    expect((el.element as HTMLTextAreaElement).value).toBe('{"symbol": "BTCUSDT"}');
    expect(el.classes()).toContain('font-mono');
    expect(el.classes()).toContain('resize-y');

    await el.setValue('{}');
    expect(value.value).toBe('{}');
  });

  it('falls rows and placeholder through', () => {
    const wrapper = mount(Textarea, { attrs: { rows: 8, placeholder: 'JSON' } });
    expect(wrapper.get('textarea').attributes('rows')).toBe('8');
    expect(wrapper.get('textarea').attributes('placeholder')).toBe('JSON');
  });
});
