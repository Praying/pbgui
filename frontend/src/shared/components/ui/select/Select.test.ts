import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from '.';

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(
    {
      components: { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem },
      template: `
        <SelectRoot v-model="value" v-bind="extra">
          <SelectTrigger data-test="trigger" :disabled="disabled">
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="binance">Binance</SelectItem>
            <SelectItem value="bybit" disabled>Bybit</SelectItem>
            <SelectItem value="okx">OKX</SelectItem>
          </SelectContent>
        </SelectRoot>
      `,
      setup() {
        return { value: props.value, extra: props.extra ?? {}, disabled: props.disabled ?? false };
      },
    },
    { attachTo: document.body },
  );
}

describe('Select', () => {
  it('renders an accessible combobox trigger with placeholder', () => {
    const wrapper = mountSelect({ value: ref('') });

    const trigger = wrapper.get('[data-test="trigger"]');
    expect(trigger.attributes('role')).toBe('combobox');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(trigger.text()).toContain('Pick one');
    expect(trigger.classes()).toContain('bg-input');
    expect(trigger.classes()).toContain('h-8');
    expect(trigger.find('svg').exists()).toBe(true); // caret icon
  });

  it('opens the listbox from the keyboard and marks the selected item', async () => {
    document.body.innerHTML = '';
    const wrapper = mountSelect({ value: ref('okx') });

    await wrapper.get('[data-test="trigger"]').trigger('keydown', { key: 'Enter' });

    expect(wrapper.get('[data-test="trigger"]').attributes('aria-expanded')).toBe('true');
    const listbox = document.body.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(listbox?.textContent).toContain('Binance');

    const selected = listbox?.querySelector('[aria-selected="true"]');
    expect(selected?.textContent).toContain('OKX');

    // disabled option carries the disabled state for AT
    const disabledItem = Array.from(listbox?.querySelectorAll('[role="option"]') ?? []).find(
      (el) => el.textContent === 'Bybit',
    );
    expect(disabledItem?.getAttribute('aria-disabled')).toBe('true');
  });

  it('disables the trigger', () => {
    const wrapper = mountSelect({ value: ref(''), disabled: true });
    expect(wrapper.get('[data-test="trigger"]').attributes('disabled')).toBeDefined();
  });
});
