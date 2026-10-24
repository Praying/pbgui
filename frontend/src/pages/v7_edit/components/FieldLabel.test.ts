import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FieldLabel from './FieldLabel.vue';

/**
 * Parameter names are snake_case and are shown in narrow columns. The group CSS
 * allows `overflow-wrap: anywhere`, so without a real break opportunity the
 * engine splits a name at any character ("minimum_coin_age_d" / "ays"). The
 * component offers a <wbr> after every underscore instead.
 */
describe('FieldLabel', () => {
  it('offers a soft break after each underscore, and only there', () => {
    const wrapper = mount(FieldLabel, { props: { label: 'minimum_coin_age_days' } });
    expect(wrapper.findAll('wbr')).toHaveLength(3);
    // the DOM order is text, <wbr>, text ...: every text run before a <wbr> ends in '_'
    const html = wrapper.html().replace(/\s+/g, '');
    for (const run of html.split('<wbr>').slice(0, -1)) expect(run.endsWith('_'), run).toBe(true);
  });

  it('keeps the text and the tooltip hook intact', () => {
    const wrapper = mount(FieldLabel, { props: { label: 'pnls_max_lookback_days', tip: 'How far back' } });
    expect(wrapper.text()).toBe('pnls_max_lookback_days');
    expect(wrapper.get('[data-tip]').attributes('data-tip')).toBe('How far back');
  });

  it('adds no break opportunity to a label without underscores', () => {
    const wrapper = mount(FieldLabel, { props: { label: 'Leverage' } });
    expect(wrapper.findAll('wbr')).toHaveLength(0);
    expect(wrapper.text()).toBe('Leverage');
  });

  it('does not emit a trailing break after the last segment', () => {
    const wrapper = mount(FieldLabel, { props: { label: 'a_b' } });
    expect(wrapper.findAll('wbr')).toHaveLength(1);
    // Vue leaves a '<!--v-if-->' placeholder for the false branch; ignore comments.
    const html = wrapper.html().replace(/<!--.*?-->/g, '').replace(/\s+/g, '');
    expect(html.endsWith('b')).toBe(true);
    expect(html.endsWith('<wbr>')).toBe(false);
  });
});

/**
 * FieldLabel only helps if the field primitives actually render through it.
 * Reverting one back to a bare `{{ label }}` would silently bring the mid-word
 * breaks back for that field type, so check the wiring of all four.
 */
import FieldCheck from './FieldCheck.vue';
import FieldNumber from './FieldNumber.vue';
import FieldSelect from './FieldSelect.vue';
import FieldText from './FieldText.vue';

describe('field primitives use FieldLabel', () => {
  const label = 'margin_mode_preference';
  const cases: Array<[string, unknown, Record<string, unknown>]> = [
    ['FieldNumber', FieldNumber, { id: 'a', label, modelValue: '1' }],
    ['FieldText', FieldText, { id: 'a', label, modelValue: 'x' }],
    ['FieldCheck', FieldCheck, { id: 'a', label, modelValue: false }],
    ['FieldSelect', FieldSelect, { id: 'a', label, modelValue: 'x', options: [{ value: 'x', label: 'x' }] }],
  ];
  for (const [name, component, props] of cases) {
    it(`${name} renders a break opportunity after each underscore`, () => {
      const wrapper = mount(component as never, { props: props as never, global: { stubs: { SelectRoot: true, SelectTrigger: true, SelectContent: true, SelectItem: true } } });
      expect(wrapper.findAll('label wbr').length, name).toBe(2);
    });
  }
});
