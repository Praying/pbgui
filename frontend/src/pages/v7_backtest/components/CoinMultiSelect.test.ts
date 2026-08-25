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
    // selected values live in the chips — the dropdown offers only additions
    expect(wrapper.findAll('button.ms-option').map((o) => o.text())).toEqual(['ETH']);

    await wrapper.findAll('button.ms-option')[0]!.trigger('click');
    await nextTick();
    expect(wrapper.findAll('.ms-tag').map((tag) => tag.text())).toEqual(['BTC', 'ETH']);

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

  /* The reported bug (2026-08-25): the new-config template pre-selects
     exchanges (['binance','bybit']), the option list showed selected
     entries first, and clicking "the first item (binance)" toggled it OFF —
     after blur the chip was gone, reading as "the selection disappears".
     The dropdown now offers only unselected values: clicking any listed
     option — or Enter on the first match — always adds. */
  it('never removes through the dropdown: pre-selected entries are not offered', async () => {
    const Harness = defineComponent({
      setup() {
        const selected = ref<string[]>(['binance', 'bybit']);
        return () => h(CoinMultiSelect, {
          id: 'exchanges',
          modelValue: selected.value,
          'onUpdate:modelValue': (value: string[]) => (selected.value = value),
          options: ['binance', 'bybit', 'bitget', 'okx'],
        });
      },
    });
    const wrapper = mount(Harness, { global: { plugins: [createI18n('en')] } });

    await wrapper.find('#exchanges-input').trigger('focusin');
    // only the unselected exchanges are listed — binance/bybit live in chips
    expect(wrapper.findAll('button.ms-option').map((o) => o.text())).toEqual(['bitget', 'okx']);

    // clicking the first listed option ADDS it; the pre-selection is intact
    await wrapper.findAll('button.ms-option')[0]!.trigger('click');
    await nextTick();
    expect(wrapper.findAll('.ms-tag').map((tag) => tag.text())).toEqual(['binance', 'bybit', 'bitget']);

    // Enter selects the first ADDABLE match, never a removal
    await wrapper.find('#exchanges-input').trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect(wrapper.findAll('.ms-tag').map((tag) => tag.text())).toEqual(['binance', 'bybit', 'bitget', 'okx']);

    // blur closes the dropdown and keeps every chip
    await wrapper.find('#exchanges-input').trigger('focusout');
    await nextTick();
    expect(wrapper.find('#exchanges-dd').classes()).not.toContain('open');
    expect(wrapper.findAll('.ms-tag').map((tag) => tag.text())).toEqual(['binance', 'bybit', 'bitget', 'okx']);
  });

  it('searching a selected value finds no dropdown match (it is already a chip)', async () => {
    const Harness = defineComponent({
      setup() {
        const selected = ref<string[]>(['binance']);
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
    await wrapper.find('#exchanges-input').setValue('binance');
    await nextTick();
    expect(wrapper.findAll('button.ms-option')).toHaveLength(0);
    expect(wrapper.text()).toContain('No matches');
  });
});
