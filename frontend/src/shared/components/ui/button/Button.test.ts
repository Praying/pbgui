import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Button } from '.';

describe('Button', () => {
  it('renders the default variant chrome on a native button', () => {
    const wrapper = mount(Button, { slots: { default: 'Run' } });

    const button = wrapper.get('button');
    expect(button.text()).toBe('Run');
    expect(button.classes()).toContain('bg-elevated');
    expect(button.classes()).toContain('h-8');
  });

  it('maps every semantic variant onto the accent/status token classes', () => {
    for (const [variant, token] of [
      ['primary', 'bg-accent'],
      ['danger', 'bg-danger/13'],
      ['success', 'bg-success/13'],
      ['warning', 'bg-warning/14'],
      ['info', 'bg-accent/14'],
      ['secondary', 'bg-card'],
      ['ghost', 'bg-transparent'],
      ['outline', 'bg-transparent'],
    ] as const) {
      const wrapper = mount(Button, { props: { variant }, slots: { default: 'x' } });
      expect(wrapper.get('button').classes(), `variant=${variant}`).toContain(token);
    }
  });

  it('supports the compact size and the square icon size', () => {
    const sm = mount(Button, { props: { size: 'sm' } });
    expect(sm.get('button').classes()).toContain('h-7');

    const icon = mount(Button, { props: { size: 'icon' } });
    expect(icon.get('button').classes()).toContain('size-8');
  });

  it('blocks interaction while loading and announces it', () => {
    const wrapper = mount(Button, {
      props: { loading: true },
      slots: { default: 'Saving' },
    });

    const button = wrapper.get('button');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.spinner').exists()).toBe(true);
    expect(button.text()).toContain('Saving');
  });

  it('stays disabled when the caller disables it', () => {
    const wrapper = mount(Button, { props: { disabled: true } });
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
  });

  it('merges caller classes without losing the variant classes', () => {
    const wrapper = mount(Button, {
      props: { variant: 'primary', class: 'w-full mt-2' },
    });
    const classes = wrapper.get('button').classes();
    expect(classes).toContain('bg-accent');
    expect(classes).toContain('w-full');
  });

  it('exposes focus/blur for imperative call sites', () => {
    const wrapper = mount(Button, { attachTo: document.body });
    const vm = wrapper.vm as unknown as { focus: () => void; blur: () => void };
    vm.focus();
    expect(document.activeElement).toBe(wrapper.get('button').element);
    vm.blur();
    expect(document.activeElement).not.toBe(wrapper.get('button').element);
  });
});
