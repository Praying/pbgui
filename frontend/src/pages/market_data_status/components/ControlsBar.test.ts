import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ControlsBar from './ControlsBar.vue';

enableAutoUnmount(afterEach);

function mountBar(
  props: { queued: boolean; running: boolean; received: boolean; actionPending?: boolean },
  lang: 'en' | 'zh' = 'en',
) {
  return mount(ControlsBar, { props: { actionPending: false, ...props }, global: { plugins: [createI18n(lang)] } });
}

/** The three buttons in legacy order: Refresh Now, Cancel Queued, Stop. */
function buttons(bar: VueWrapper) {
  const all = bar.findAll('button');
  return { refresh: all[0]!, cancel: all[1]!, stop: all[2]! };
}

describe('ControlsBar (legacy mds-controls button matrix)', () => {
  it('disables Refresh Now until the first status frame arrives (html:272)', async () => {
    // Legacy ships the button disabled and only updateUI (first WS frame)
    // enables it — mirroring this requires the received prop.
    const bar = mountBar({ queued: false, running: false, received: false });

    expect(bar.findAll('button')[0]!.isVisible()).toBe(true);
    expect(bar.findAll('button')[0]!.attributes('disabled')).toBeDefined();

    await bar.setProps({ received: true });
    expect(bar.findAll('button')[0]!.attributes('disabled')).toBeUndefined();
  });

  it('shows only the enabled Refresh Now button in the idle state', () => {
    const { refresh, cancel, stop } = buttons(mountBar({ queued: false, running: false, received: true }));

    expect(refresh.text()).toContain('Refresh Now');
    expect(refresh.isVisible()).toBe(true);
    expect(refresh.attributes('disabled')).toBeUndefined();
    expect(cancel.isVisible()).toBe(false);
    expect(stop.isVisible()).toBe(false);
  });

  it('shows only Cancel Queued Refresh while a refresh is queued', () => {
    const { refresh, cancel, stop } = buttons(mountBar({ queued: true, running: false, received: true }));

    expect(refresh.isVisible()).toBe(false);
    expect(refresh.attributes('disabled')).toBeDefined();
    expect(cancel.isVisible()).toBe(true);
    expect(cancel.attributes('disabled')).toBeUndefined();
    expect(cancel.text()).toContain('Cancel Queued Refresh');
    expect(stop.isVisible()).toBe(false);
  });

  it('shows Stop Current Run and disables Refresh Now while running', () => {
    const { refresh, stop } = buttons(mountBar({ queued: false, running: true, received: true }));

    expect(refresh.isVisible()).toBe(true);
    expect(refresh.attributes('disabled')).toBeDefined();
    expect(stop.isVisible()).toBe(true);
    expect(stop.attributes('disabled')).toBeUndefined();
    expect(stop.text()).toContain('Stop Current Run');
  });

  it('keeps Stop disabled until running', () => {
    const bar = mountBar({ queued: false, running: false, received: true });

    expect(bar.findAll('button')[2]!.attributes('disabled')).toBeDefined();
  });

  it('disables every action while a request is pending', () => {
    const bar = mountBar({ queued: false, running: true, received: true, actionPending: true });

    expect(bar.findAll('button')[0]!.attributes('disabled')).toBeDefined();
    expect(bar.findAll('button')[2]!.attributes('disabled')).toBeDefined();
  });

  it('emits refresh/cancel/stop from the buttons a user can actually click', async () => {
    // Refresh is clickable while idle; Stop is clickable while running.
    const active = mountBar({ queued: false, running: false, received: true });
    await active.findAll('button')[0]!.trigger('click');
    const running = mountBar({ queued: false, running: true, received: true });
    await running.findAll('button')[2]!.trigger('click');
    expect(active.emitted('refresh')).toHaveLength(1);
    expect(running.emitted('stop')).toHaveLength(1);

    const queued = mountBar({ queued: true, running: false, received: true });
    await queued.findAll('button')[1]!.trigger('click');
    expect(queued.emitted('cancel')).toHaveLength(1);
  });

  it('renders the kept hook class and icons', () => {
    const { refresh, cancel, stop } = buttons(mountBar({ queued: false, running: false, received: true }));

    expect(refresh.classes()).toContain('mds-btn');
    expect(cancel.classes()).toContain('mds-btn');
    expect(stop.classes()).toContain('mds-btn');
    expect(refresh.attributes('data-slot')).toBe('button');
    expect(refresh.find('svg').exists()).toBe(true);
    expect(cancel.find('svg').exists()).toBe(true);
    expect(stop.find('svg').exists()).toBe(true);
  });

  it('localizes labels in zh', () => {
    const bar = mountBar({ queued: true, running: false, received: true }, 'zh');

    expect(bar.findAll('button')[1]!.text()).toContain('取消排队的刷新');
  });
});
