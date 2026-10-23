import { describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '.';
import { openSelect, selectOptionElements } from '@/shared/testing/select';

/**
 * The ui/select wrappers drive reka's SelectRoot, which supports `multiple`.
 * Four pages kept a native <select multiple> on the belief the listbox was
 * single-value; this pins the multi-value contract they now rely on.
 */
function mountMulti(initial: string[]) {
  const value = ref<string[]>(initial);
  const Host = defineComponent({
    components: { SelectRoot, SelectTrigger, SelectContent, SelectItem },
    setup: () => ({ value }),
    template: `
      <SelectRoot v-model="value" multiple>
        <SelectTrigger data-test="multi"><span>{{ value.join(', ') }}</span></SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
          <SelectItem value="b">B</SelectItem>
          <SelectItem value="c">C</SelectItem>
        </SelectContent>
      </SelectRoot>`,
  });
  const wrapper = mount(Host, { attachTo: document.body });
  return { wrapper, value };
}

describe('ui/select multiple', () => {
  it('binds an array model and shows every selected value', () => {
    const { wrapper } = mountMulti(['a', 'c']);
    expect(wrapper.get('[data-test="multi"]').text()).toContain('a, c');
    wrapper.unmount();
  });

  it('keeps the listbox open and toggles several options', async () => {
    const { wrapper, value } = mountMulti(['a']);
    await openSelect(wrapper, '[data-test="multi"]');
    const options = selectOptionElements();
    expect(options.map((o) => o.textContent?.trim())).toEqual(['A', 'B', 'C']);

    // in multiple mode choosing an option toggles it and leaves the listbox open
    await new DOMWrapper(options[1]!).trigger('pointerup');
    await flushPromises();
    expect(selectOptionElements()).toHaveLength(3);
    await new DOMWrapper(selectOptionElements()[2]!).trigger('pointerup');
    await flushPromises();

    expect(new Set(value.value)).toEqual(new Set(['a', 'b', 'c']));
    wrapper.unmount();
  });
});
