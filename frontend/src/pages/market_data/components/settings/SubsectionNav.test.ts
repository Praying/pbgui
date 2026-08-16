import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import SubsectionNav from './SubsectionNav.vue';
import { SETTINGS_SUBSECTION_BUTTONS } from '../../composables/usePanels';
import type { SettingsSubsection } from '../../types';

/* Sidebar subsection nav — legacy #settings-subsection-nav
   (market_data_main.html:2953-2957, registry :3683-3687, visibility
   :6157-6173, click :9602-9609). */

function mountNav(props: {
  available?: readonly SettingsSubsection[];
  active?: SettingsSubsection;
} = {}) {
  return mount(SubsectionNav, {
    props: {
      available: props.available ?? ['normal', 'aws', 'tradfi'],
      active: props.active ?? 'normal',
    },
    global: { plugins: [createI18n('en')] },
  });
}

describe('registry (:3683-3687, :2954-2956)', () => {
  it('renders the three legacy buttons with verbatim ids and labels', () => {
    const nav = mountNav();
    const buttons = nav.findAll('button');
    expect(buttons.map((b) => b.attributes('id'))).toEqual([
      'btn-settings-subsection-normal',
      'btn-settings-subsection-aws',
      'btn-settings-subsection-tradfi',
    ]);
    expect(buttons.map((b) => b.text())).toEqual(['Coin Refresh', 'AWS / l2Book', 'TradFi / Tiingo']);
    expect(SETTINGS_SUBSECTION_BUTTONS.map((item) => item.buttonId)).toEqual([
      'btn-settings-subsection-normal',
      'btn-settings-subsection-aws',
      'btn-settings-subsection-tradfi',
    ]);
  });
});

describe('visibility + active state (:6161-6167)', () => {
  it('hides subsections unavailable for the current exchange (:6165)', () => {
    const nav = mountNav({ available: ['normal'] });
    const buttons = nav.findAll('button');
    expect(buttons[0]?.attributes('hidden')).toBeUndefined();
    expect(buttons[1]?.attributes('hidden')).toBeDefined();
    expect(buttons[2]?.attributes('hidden')).toBeDefined();
  });

  it('marks the active subsection only when available (:6166)', () => {
    const nav = mountNav({ available: ['normal', 'aws'], active: 'aws' });
    expect(nav.find('#btn-settings-subsection-aws').classes()).toContain('active');
    expect(nav.find('#btn-settings-subsection-normal').classes()).not.toContain('active');
    // the `active` prop is the RESOLVED subsection (the store resolves an
    // unavailable stored value to normal — covered in useSettings tests);
    // an unavailable key can therefore never receive the active class
    const unavailable = mountNav({ available: ['normal'], active: 'tradfi' });
    expect(unavailable.find('#btn-settings-subsection-normal').classes()).not.toContain('active');
    expect(unavailable.find('#btn-settings-subsection-tradfi').attributes('hidden')).toBeDefined();
  });
});

describe('selection (:9605-9608)', () => {
  it('emits the subsection key on click', async () => {
    const nav = mountNav();
    await nav.find('#btn-settings-subsection-tradfi').trigger('click');
    expect(nav.emitted('select')).toEqual([['tradfi']]);
  });
});
