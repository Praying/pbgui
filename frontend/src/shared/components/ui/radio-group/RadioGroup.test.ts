import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ref, type Ref } from 'vue';
import { RadioGroup, RadioItem } from '.';

function mountGroup(model: Ref<string>) {
  return mount(
    {
      components: { RadioGroup, RadioItem },
      template: `
        <RadioGroup v-model="value">
          <RadioItem value="market" />
          <RadioItem value="limit" />
          <RadioItem value="stop" disabled />
        </RadioGroup>
      `,
      setup() {
        const value = model;
        return { value };
      },
    },
  );
}

describe('RadioGroup', () => {
  it('renders an ARIA radiogroup with role=radio children', () => {
    const wrapper = mountGroup(ref('limit'));

    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true);
    const radios = wrapper.findAll('[role="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios[1]!.attributes('aria-checked')).toBe('true');
    expect(radios[2]!.attributes('data-disabled')).toBeDefined();
  });

  it('selects an option through v-model on click', async () => {
    const value = ref('market');
    const wrapper = mountGroup(value);

    await wrapper.findAll('[role="radio"]')[1]!.trigger('click');
    expect(value.value).toBe('limit');
  });

  it('shows the accent dot on the checked item', () => {
    const wrapper = mountGroup(ref('limit'));
    const checked = wrapper.findAll('[role="radio"]')[1]!;
    expect(checked.find('span').exists()).toBe(true);
  });
});
