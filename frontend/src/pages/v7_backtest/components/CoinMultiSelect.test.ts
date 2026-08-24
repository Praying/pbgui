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

describe('CoinMultiSelect dropdown interaction', () => {
  it('selects an option via a real mouse click (mousedown keeps the dropdown open)', async () => {
    const Harness = defineComponent({
      setup() {
        const selected = ref<string[]>([]);
        return () => h(CoinMultiSelect, {
          id: 'exchanges',
          modelValue: selected.value,
          'onUpdate:modelValue': (value: string[]) => (selected.value = value),
          options: ['binance', 'bybit'],
        });
      },
    });
    const wrapper = mount(Harness, { global: { plugins: [createI18n('en')] } });

    await wrapper.find('#exchanges-input').trigger('focusin');
    expect(wrapper.find('#exchanges-dd').classes()).toContain('open');

    // focusout alone would hide the dropdown before the click lands;
    // the option buttons swallow the mousedown so the search input keeps focus
    const option = wrapper.findAll('button.ms-option')[0]!;
    await option.trigger('mousedown');
    await option.trigger('click');
    await nextTick();

    expect(wrapper.find('.ms-tag').text()).toContain('binance');
    expect(wrapper.find('#exchanges-dd').classes()).toContain('open');
  });

  it('hides the clear button while nothing is selected', async () => {
    const Harness = defineComponent({
      setup() {
        const selected = ref<string[]>([]);
        return () => h(CoinMultiSelect, {
          id: 'exchanges',
          modelValue: selected.value,
          'onUpdate:modelValue': (value: string[]) => (selected.value = value),
          options: ['binance'],
        });
      },
    });
    const wrapper = mount(Harness, { global: { plugins: [createI18n('en')] } });
    expect(wrapper.find('button.ms-clear-btn').exists()).toBe(false);

    await wrapper.find('#exchanges-input').trigger('focusin');
    const option = wrapper.find('button.ms-option');
    await option.trigger('mousedown');
    await option.trigger('click');
    await nextTick();
    expect(wrapper.find('button.ms-clear-btn').exists()).toBe(true);
  });
});
