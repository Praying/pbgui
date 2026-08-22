import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from '@/shared/i18n';
import CoinMultiSelect from './CoinMultiSelect.vue';

describe('CoinMultiSelect accessibility', () => {
  it('uses semantic labelled buttons for selection controls', async () => {
    const Harness = defineComponent({
      setup() {
        const selected = ref<string[]>(['BTC']);
        return () => h(CoinMultiSelect, {
          id: 'coins',
          modelValue: selected.value,
          'onUpdate:modelValue': (value: string[]) => (selected.value = value),
          options: ['BTC', 'ETH'],
          allowAll: true,
        });
      },
    });
    const wrapper = mount(Harness, { global: { plugins: [createI18n('en')] } });

    expect(wrapper.find('button.ms-all-btn').attributes('aria-label')).toBe('Select All');
    expect(wrapper.find('button.ms-clear-btn').attributes('aria-label')).toBe('Clear all');
    expect(wrapper.find('button.ms-x').attributes('aria-label')).toBe('Remove BTC');
    expect(wrapper.findAll('button.ms-option')).toHaveLength(2);
    expect(wrapper.find('button.ms-option').attributes('aria-pressed')).toBe('true');

    await wrapper.findAll('button.ms-option')[1]!.trigger('click');
    await nextTick();
    expect(wrapper.findAll('button.ms-option')[1]!.attributes('aria-pressed')).toBe('true');

    await wrapper.find('button.ms-clear-btn').trigger('click');
    await nextTick();
    expect(wrapper.findAll('.ms-tag')).toHaveLength(0);
  });
});
