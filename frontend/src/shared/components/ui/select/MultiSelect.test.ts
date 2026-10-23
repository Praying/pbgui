import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MultiSelect from './MultiSelect.vue';
import { checkedSelectOptionTexts, toggleSelectOptions } from '@/shared/testing/select';

const OPTIONS = ['binance', 'bybit', 'okx', 'kucoin'];

function mountMulti(initial: string[]) {
  const wrapper = mount(MultiSelect, {
    props: { modelValue: initial, options: OPTIONS, id: 'ms', dataTest: 'ms-trigger' },
    attachTo: document.body,
  });
  // v-model parity: feed every update back in, as a parent's v-model would.
  wrapper.setProps({ 'onUpdate:modelValue': (value: string[]) => wrapper.setProps({ modelValue: value }) });
  return wrapper;
}

describe('ui/select MultiSelect', () => {
  it('summarises the selection on the trigger and falls back to a dash', async () => {
    const wrapper = mountMulti(['bybit', 'okx']);
    expect(wrapper.get('[data-test="ms-trigger"]').text()).toBe('bybit, okx');
    await wrapper.setProps({ modelValue: [] });
    expect(wrapper.get('[data-test="ms-trigger"]').text()).toBe('—');
    wrapper.unmount();
  });

  it('puts the id on the trigger so a <label for> has a target', () => {
    const wrapper = mountMulti([]);
    expect(wrapper.get('#ms').attributes('data-test')).toBe('ms-trigger');
    wrapper.unmount();
  });

  it('keeps the options\' own order whatever order they are chosen in', async () => {
    const wrapper = mountMulti([]);
    await toggleSelectOptions(wrapper, '[data-test="ms-trigger"]', ['okx', 'binance', 'kucoin']);
    expect(wrapper.props('modelValue')).toEqual(['binance', 'okx', 'kucoin']);
    wrapper.unmount();
  });

  it('removes only the toggled option and marks the rest checked', async () => {
    const wrapper = mountMulti(['binance', 'bybit', 'okx']);
    await toggleSelectOptions(wrapper, '[data-test="ms-trigger"]', ['bybit']);
    expect(wrapper.props('modelValue')).toEqual(['binance', 'okx']);
    expect(checkedSelectOptionTexts()).toEqual(['binance', 'okx']);
    wrapper.unmount();
  });
});
