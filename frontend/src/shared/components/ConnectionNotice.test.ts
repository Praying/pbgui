import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConnectionNotice from './ConnectionNotice.vue';

afterEach(() => {
  vi.useRealTimers();
});

describe('ConnectionNotice', () => {
  it('keeps the initial waiting state silent until the delay elapses', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ConnectionNotice, {
      props: {
        state: 'waiting',
        waitingText: 'Connecting…',
        lostText: 'Connection lost — reconnecting…',
      },
    });

    expect(wrapper.find('#conn-banner').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(599);
    expect(wrapper.find('#conn-banner').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.get('#conn-banner').text()).toBe('Connecting…');
    expect(wrapper.get('#conn-banner').attributes('data-state')).toBe('waiting');
  });

  it('never shows waiting when the connection succeeds during the quiet period', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ConnectionNotice, {
      props: {
        state: 'waiting',
        waitingText: 'Connecting…',
        lostText: 'Connection lost — reconnecting…',
      },
    });

    await vi.advanceTimersByTimeAsync(300);
    await wrapper.setProps({ state: 'ok' });
    await vi.advanceTimersByTimeAsync(600);

    expect(wrapper.find('#conn-banner').exists()).toBe(false);
  });

  it('shows connection loss immediately and hides after recovery', async () => {
    const wrapper = mount(ConnectionNotice, {
      props: {
        state: 'lost',
        waitingText: 'Connecting…',
        lostText: 'Connection lost — reconnecting…',
      },
    });

    const notice = wrapper.get('#conn-banner');
    expect(notice.text()).toBe('Connection lost — reconnecting…');
    expect(notice.classes()).toContain('pbgui-connection-notice--lost');
    expect(notice.attributes('aria-live')).toBe('assertive');

    await wrapper.setProps({ state: 'ok' });
    expect(wrapper.find('#conn-banner').exists()).toBe(false);
  });

  it('can keep a successful connection visible for workbench status banners', () => {
    const wrapper = mount(ConnectionNotice, {
      props: {
        state: 'ok',
        waitingText: 'Connecting…',
        lostText: 'Connection lost — reconnecting…',
        okText: 'Connected',
        showOk: true,
      },
    });

    expect(wrapper.get('#conn-banner').text()).toBe('Connected');
    expect(wrapper.get('#conn-banner').classes()).toContain('pbgui-connection-notice--ok');
  });
});
