import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import SettingsModal from './SettingsModal.vue';
import type { BacktestSettings } from '../types';

/*
 * Settings modal — renderSettingsModal (:1482-1540), settingsAdjustCpu
 * (:1568-1577), the dirty-guarded live sync (:1542-1558) and the save
 * payload (:1587-1619). The clean-now button (:1621-1642) is driven by
 * App; this component owns its in-flight state via the cleaning prop.
 */

const i18n = createI18n('en');

function settings(overrides: Partial<BacktestSettings> = {}): BacktestSettings {
  return {
    autostart: false,
    cpu: 2,
    cpu_max: 8,
    hsl_signal_modes: [],
    exchange_options: [],
    use_pbgui_market_data: false,
    hlcvs_cleanup_enabled: false,
    hlcvs_cleanup_days: 7,
    hlcvs_cleanup_interval_h: 24,
    ...overrides,
  };
}

function mountModal(props: Partial<{ settings: BacktestSettings; open: boolean; cleaning: boolean }> = {}) {
  return mount(SettingsModal, {
    props: { settings: settings(), open: true, cleaning: false, ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/backtest-v7/main_page');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('render (:1482-1540)', () => {
  it('seeds every field from the settings prop', () => {
    const wrapper = mountModal({ settings: settings({ cpu: 3, autostart: true, use_pbgui_market_data: true, hlcvs_cleanup_enabled: true, hlcvs_cleanup_days: 21, hlcvs_cleanup_interval_h: 6 }) });
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('3');
    expect((wrapper.find('#set-autostart').element as HTMLInputElement).checked).toBe(true);
    expect((wrapper.find('#set-pbgui-market-data').element as HTMLInputElement).checked).toBe(true);
    expect((wrapper.find('#set-cleanup-enabled').element as HTMLInputElement).checked).toBe(true);
    expect((wrapper.find('#set-cleanup-days').element as HTMLInputElement).value).toBe('21');
    expect((wrapper.find('#set-cleanup-interval').element as HTMLInputElement).value).toBe('6');
    expect(wrapper.text()).toContain('max 8');
    wrapper.unmount();
  });

  it('hides entirely while closed', () => {
    const wrapper = mountModal({ open: false });
    expect(wrapper.find('#modal-root').exists()).toBe(false);
    wrapper.unmount();
  });

  it('disables the cleanup options visually when cleanup is off (:1519)', () => {
    const wrapper = mountModal();
    const opts = wrapper.find('#cleanup-opts');
    expect(opts.attributes('style')).toContain('opacity: 0.4');
    expect(opts.attributes('style')).toContain('pointer-events: none');
    wrapper.unmount();
  });
});

describe('cpu stepper (:1568-1577)', () => {
  it('steps ±1 within [1, cpu_max]', async () => {
    const wrapper = mountModal();
    expect(wrapper.find('[data-test="cpu-minus"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="cpu-minus"]').attributes('aria-label')).toBe('Decrease CPU');
    expect(wrapper.find('[data-test="cpu-plus"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="cpu-plus"]').attributes('aria-label')).toBe('Increase CPU');
    await wrapper.find('[data-test="cpu-plus"]').trigger('click');
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('3');
    await wrapper.find('[data-test="cpu-minus"]').trigger('click');
    await wrapper.find('[data-test="cpu-minus"]').trigger('click');
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('1');
    wrapper.unmount();
  });

  it('clamps at cpu_max (:1574-1575)', async () => {
    const wrapper = mountModal({ settings: settings({ cpu: 8, cpu_max: 8 }) });
    await wrapper.find('[data-test="cpu-plus"]').trigger('click');
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('8');
    wrapper.unmount();
  });

  it('falls back to hardwareConcurrency when cpu_max is invalid (:1483-1486)', () => {
    const wrapper = mountModal({ settings: settings({ cpu_max: null }) });
    expect(wrapper.text()).toContain(`max ${navigator.hardwareConcurrency || 2}`);
    wrapper.unmount();
  });
});

describe('live sync (:1542-1558 syncOpenSettingsModal)', () => {
  it('an unchanged modal follows a settings push', async () => {
    const wrapper = mountModal({ settings: settings({ cpu: 2, cpu_max: 8 }) });
    await wrapper.setProps({ settings: settings({ cpu: 5, autostart: true }) });
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('5');
    expect((wrapper.find('#set-autostart').element as HTMLInputElement).checked).toBe(true);
    wrapper.unmount();
  });

  it('a dirty modal is never clobbered by a push (:1543)', async () => {
    const wrapper = mountModal({ settings: settings({ cpu: 2 }) });
    await wrapper.find('[data-test="cpu-plus"]').trigger('click'); // dirty
    await wrapper.setProps({ settings: settings({ cpu: 7 }) });
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('3');
    wrapper.unmount();
  });

  it('cpu is clamped into range while syncing (:1548)', async () => {
    const wrapper = mountModal({ settings: settings({ cpu: 2, cpu_max: 4 }) });
    await wrapper.setProps({ settings: settings({ cpu: 99, cpu_max: 4 }) });
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('4');
    wrapper.unmount();
  });

  it('the sync is skipped while cpu_max is still unknown (:1546-1547)', async () => {
    const wrapper = mountModal({ settings: settings({ cpu: 2, cpu_max: null }) });
    await wrapper.setProps({ settings: settings({ cpu: 5, cpu_max: null }) });
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('2');
    wrapper.unmount();
  });

  it('a second settings push while open is ignored — legacy WS pushes never re-synced an open modal (:1296-1303 vs :1563)', async () => {
    const wrapper = mountModal({ settings: settings({ cpu: 2, cpu_max: 8 }) });
    await wrapper.setProps({ settings: settings({ cpu: 5, cpu_max: 8 }) }); // the load-refresh sync
    await wrapper.setProps({ settings: settings({ cpu: 6, cpu_max: 8 }) }); // a later WS push: stays stale
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('5');
    wrapper.unmount();
  });

  it('adjustCpu is a no-op while cpu_max is unknown — pre-load (:1573 early return)', async () => {
    const wrapper = mountModal({ settings: settings({ cpu: 1, cpu_max: null }) });
    await wrapper.find('[data-test="cpu-plus"]').trigger('click');
    // legacy marks dirty but changes nothing until /settings supplies cpu_max
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('1');
    wrapper.unmount();
  });

  it('toggling cleanup re-enables its options (:1579-1585)', async () => {
    const wrapper = mountModal();
    await wrapper.find('#set-cleanup-enabled').setValue(true);
    const style = wrapper.find('#cleanup-opts').attributes('style') ?? '';
    expect(style).not.toContain('pointer-events: none');
    wrapper.unmount();
  });
});

describe('save + clean now (:1587-1642)', () => {
  it('save emits the six-field patch (:1602-1612)', async () => {
    const wrapper = mountModal();
    await wrapper.find('[data-test="cpu-plus"]').trigger('click');
    await wrapper.find('#set-autostart').setValue(true);
    await wrapper.find('#set-cleanup-enabled').setValue(true);
    await wrapper.find('#set-cleanup-days').setValue('30');
    const save = wrapper.findAll('.modal-btn').find((b) => b.text() === 'Save')!;
    await save.trigger('click');
    expect(wrapper.emitted('save')).toEqual([
      [
        {
          cpu: 3,
          autostart: true,
          use_pbgui_market_data: false,
          hlcvs_cleanup_enabled: true,
          hlcvs_cleanup_days: 30,
          hlcvs_cleanup_interval_h: 24,
        },
      ],
    ]);
    wrapper.unmount();
  });

  it('cancel just closes (:1537)', async () => {
    const wrapper = mountModal();
    const cancel = wrapper.findAll('.modal-btn').find((b) => b.text() === 'Cancel')!;
    await cancel.trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('clean now emits with the modal days (:1622)', async () => {
    const wrapper = mountModal();
    await wrapper.find('#set-cleanup-days').setValue('14');
    await wrapper.find('#clean-now-btn').trigger('click');
    expect(wrapper.emitted('cleanup')).toEqual([[14]]);
    wrapper.unmount();
  });

  it('the clean button shows the busy state via the cleaning prop (:1624)', async () => {
    const wrapper = mountModal({ cleaning: true });
    const btn = wrapper.find('#clean-now-btn');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    expect(btn.text()).toBe('Cleaning…');
    wrapper.unmount();
  });

  it('days default to 7 when the field is junk (:1592)', async () => {
    const wrapper = mountModal();
    await wrapper.find('#set-cleanup-days').setValue('junk');
    await wrapper.find('#clean-now-btn').trigger('click');
    expect(wrapper.emitted('cleanup')).toEqual([[7]]);
    await nextTick();
    wrapper.unmount();
  });
});
