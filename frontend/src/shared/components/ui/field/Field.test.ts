import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Field } from '.';
import { Input } from '@/shared/components/ui/input';

describe('Field', () => {
  it('associates the label with the slotted control through slot props', () => {
    const wrapper = mount(Field, {
      props: { label: 'Symbol' },
      slots: {
        default: `<template #default="sp"><input :id="sp.id" /></template>`,
      },
    });

    const label = wrapper.get('label');
    const input = wrapper.get('input');
    expect(label.attributes('for')).toBe(input.attributes('id'));
    expect(label.text()).toContain('Symbol');
  });

  it('wires the slotted control to hint feedback through slot props', () => {
    const wrapper = mount(Field, {
      props: { label: 'Symbol', hint: 'e.g. BTCUSDT' },
      slots: {
        default: `<template #default="sp"><input :id="sp.id" :aria-describedby="sp.describedby" /></template>`,
      },
    });

    const input = wrapper.get('input');
    const hint = wrapper.get('p');
    expect(input.attributes('aria-describedby')).toBe(hint.attributes('id'));
    expect(hint.text()).toBe('e.g. BTCUSDT');
  });

  it('switches to the error look and marks the control invalid', () => {
    const wrapper = mount(Field, {
      props: { label: 'Symbol', hint: 'e.g. BTCUSDT', error: 'Required field' },
      slots: {
        default: `<template #default="sp"><input :id="sp.id" :aria-invalid="sp.invalid" /></template>`,
      },
    });

    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toBe('Required field');
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true');
    expect(wrapper.attributes('data-invalid')).toBeDefined();
  });

  it('applies the label wiring to Input automatically through the field context', () => {
    const wrapper = mount(Field, {
      props: { label: 'Exchange', hint: 'Where the bot runs' },
      slots: { default: { template: '<Input />' } },
      global: { components: { Input } },
    });

    const input = wrapper.get('input');
    const label = wrapper.get('label');
    expect(label.attributes('for')).toBe(input.attributes('id'));
    expect(input.attributes('aria-describedby')).toBe(wrapper.get('p').attributes('id'));
    expect(input.classes()).toContain('bg-input');
  });

  it('marks required fields for sighted and screen-reader users', () => {
    const wrapper = mount(Field, {
      props: { label: 'Symbol', required: true },
      slots: { default: `<template #default="sp"><input :id="sp.id" /></template>` },
    });

    expect(wrapper.get('label').text()).toContain('*');
    expect(wrapper.get('.sr-only').text()).toBe('(required)');
  });
});
