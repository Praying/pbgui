import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Label } from '.';

describe('Label', () => {
  it('renders an associated form label with the shared chrome', () => {
    const wrapper = mount(Label, { props: { for: 'symbol-input' }, slots: { default: 'Symbol' } });

    const label = wrapper.get('label');
    expect(label.attributes('for')).toBe('symbol-input');
    expect(label.text()).toBe('Symbol');
    expect(label.classes()).toContain('uppercase');
    expect(label.classes()).toContain('tracking-label');
  });
});
