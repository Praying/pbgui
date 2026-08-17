import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import DatePicker from './DatePicker.vue';

/*
 * DatePicker — the Vue port of the custom __dp popup calendar
 * (v7_backtest.html:4090-4333): month grid, prev/next month, month/year
 * dropdowns, Today/Close footer and the paired-field min/max bounds
 * (_range :4146-4166, _dayDisabled :4174-4178).
 */

function mountPicker(props: Record<string, unknown> = {}) {
  return mount(DatePicker, { props: { modelValue: '2026-08-01', ...props } });
}

function openPopup(wrapper: ReturnType<typeof mountPicker>): void {
  wrapper.find('button[data-dp]').trigger('click');
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-08-18T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('popup basics', () => {
  it('renders the field value and emits typing', async () => {
    const wrapper = mountPicker();
    expect(wrapper.find('input').element.value).toBe('2026-08-01');
    await wrapper.find('input').setValue('2027-01-05');
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['2027-01-05']);
  });

  it('opens on the calendar button and closes on Close', async () => {
    const wrapper = mountPicker();
    expect(wrapper.find('.dp-popup').exists()).toBe(false);
    openPopup(wrapper);
    await nextTick();
    expect(wrapper.find('.dp-popup').isVisible()).toBe(true);
    expect(wrapper.find('.dp-popup').text()).toContain('August');
    expect(wrapper.find('.dp-popup').text()).toContain('2026');
    await wrapper.find('button[data-test="dp-close"]').trigger('click');
    expect(wrapper.find('.dp-popup').exists()).toBe(false);
  });

  it('shows the selected day highlighted', async () => {
    const wrapper = mountPicker();
    openPopup(wrapper);
    await nextTick();
    expect(wrapper.find('.dp-day.selected').text()).toBe('1');
  });
});

describe('day picking', () => {
  it('emits YYYY-MM-DD and closes', async () => {
    const wrapper = mountPicker();
    openPopup(wrapper);
    await nextTick();
    const day15 = wrapper.findAll('.dp-day').find((d) => d.text() === '15')!;
    await day15.trigger('click');
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['2026-08-15']);
    expect(wrapper.find('.dp-popup').exists()).toBe(false);
  });

  it('disables days outside the min/max bounds and ignores clicks', async () => {
    const wrapper = mountPicker({ min: '2026-08-10', max: '2026-08-20' });
    openPopup(wrapper);
    await nextTick();
    const days = wrapper.findAll('.dp-day');
    expect(days.find((d) => d.text() === '5')!.classes()).toContain('dp-disabled');
    expect(days.find((d) => d.text() === '15')!.classes()).not.toContain('dp-disabled');
    await days.find((d) => d.text() === '5')!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('picks today from the footer', async () => {
    const wrapper = mountPicker();
    openPopup(wrapper);
    await nextTick();
    await wrapper.find('button[data-test="dp-today"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['2026-08-18']);
  });
});

describe('month navigation (:4305-4315)', () => {
  it('moves between months and updates the header', async () => {
    const wrapper = mountPicker();
    openPopup(wrapper);
    await nextTick();
    await wrapper.find('button[data-test="dp-prev"]').trigger('click');
    expect(wrapper.find('.dp-popup').text()).toContain('July');
    await wrapper.find('button[data-test="dp-next"]').trigger('click');
    expect(wrapper.find('.dp-popup').text()).toContain('August');
  });

  it('blocks navigation into months with no selectable day under the bounds', async () => {
    const wrapper = mountPicker({ min: '2026-08-10' });
    openPopup(wrapper);
    await nextTick();
    expect(wrapper.find('button[data-test="dp-prev"]').attributes('disabled')).toBeDefined();
  });
});
