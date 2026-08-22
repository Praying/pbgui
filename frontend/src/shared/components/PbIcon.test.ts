import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { PhHouse } from '@phosphor-icons/vue';
import PbIcon from './PbIcon.vue';

describe('PbIcon', () => {
  it('passes the requested size and regular weight to the icon component', () => {
    const wrapper = mount(PbIcon, {
      props: { icon: PhHouse, size: 20 },
    });

    const renderedIcon = wrapper.findComponent(PhHouse);

    expect(renderedIcon.props('size')).toBe(20);
    expect(renderedIcon.props('weight')).toBe('regular');
    expect(wrapper.find('svg').attributes('width')).toBe('20');
    expect(wrapper.find('svg').attributes('height')).toBe('20');
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true');
  });

  it('exposes an accessible name instead of decorative semantics when labeled', () => {
    const wrapper = mount(PbIcon, {
      props: { icon: PhHouse, ariaLabel: 'Home' },
    });

    expect(wrapper.find('svg').attributes('aria-label')).toBe('Home');
    expect(wrapper.find('svg').attributes('aria-hidden')).toBeUndefined();
  });
});
