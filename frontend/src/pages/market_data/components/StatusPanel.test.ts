import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import StatusPanel from './StatusPanel.vue';
import type { StatusMonitorController } from '../composables/useStatusMonitor';

/* Status panel shell (legacy market_data_main.html:3223-3227) hosting the
   monitor iframe (M-data-8: the retired innerHTML fragment became the built
   market_data_status Vue page, embedded same-origin — see useStatusMonitor).
   The loading/error callouts (:4150-4154, :4168-4172) render as Vue
   templates — escaped by default, never v-html for server data. */

type Mock = ReturnType<typeof vi.fn>;

interface Harness {
  controller: StatusMonitorController;
  attachFrame: Mock;
  destroyStatusMonitor: Mock;
  handleFrameLoad: Mock;
  handleFrameError: Mock;
}

function makeController(
  phase: 'idle' | 'loading' | 'ready' | 'error' = 'idle',
  errorMessage = ''
): Harness {
  const attachFrame = vi.fn();
  const destroyStatusMonitor = vi.fn();
  const handleFrameLoad = vi.fn();
  const handleFrameError = vi.fn();
  const controller = {
    phase: { value: phase },
    errorMessage: { value: errorMessage },
    attachFrame,
    destroyStatusMonitor,
    handleFrameLoad,
    handleFrameError,
    updateStatusPanel: vi.fn(),
    mountStatusMonitor: vi.fn(async () => undefined),
    reloadStatusMonitor: vi.fn(),
  } as unknown as StatusMonitorController;
  return { controller, attachFrame, destroyStatusMonitor, handleFrameLoad, handleFrameError };
}

function mountPanel(harness: Harness) {
  return mount(StatusPanel, {
    props: { monitor: harness.controller },
    global: { plugins: [createI18n('en')] },
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('status panel shell (:3223-3227)', () => {
  it('renders the context shell and the monitor iframe', () => {
    const panel = mountPanel(makeController());
    expect(panel.find('.context-shell.status-panel-shell').exists()).toBe(true);
    expect(panel.find('iframe#status-monitor-host.status-monitor-host').exists()).toBe(true);
  });

  it('attaches its iframe element to the controller on mount', () => {
    const harness = makeController();
    const panel = mountPanel(harness);
    expect(harness.attachFrame).toHaveBeenCalledTimes(1);
    const frame = harness.attachFrame.mock.calls[0]?.[0] as HTMLIFrameElement | null;
    expect(frame).toBeInstanceOf(HTMLIFrameElement);
    expect(frame?.id).toBe('status-monitor-host');
    expect(panel.find('#status-monitor-host').element).toBe(frame);
  });

  it('gives the frame an accessible title', () => {
    const panel = mountPanel(makeController());
    expect(panel.find('#status-monitor-host').attributes('title')).toBe('Status Monitor');
  });

  it('loads the frame eagerly (legacy mounted the fragment in the fan-out)', () => {
    const panel = mountPanel(makeController());
    expect(panel.find('#status-monitor-host').attributes('loading')).toBeUndefined();
  });
});

describe('frame event wiring', () => {
  it('routes the load event to the controller phase machine', async () => {
    const harness = makeController('loading');
    const panel = mountPanel(harness);
    await panel.find('#status-monitor-host').trigger('load');
    expect(harness.handleFrameLoad).toHaveBeenCalledTimes(1);
  });

  it('routes the error event to the controller phase machine', async () => {
    const harness = makeController('loading');
    const panel = mountPanel(harness);
    await panel.find('#status-monitor-host').trigger('error');
    expect(harness.handleFrameError).toHaveBeenCalledTimes(1);
  });
});

describe('loading state (:4150-4154)', () => {
  it('shows the status monitor callout while the frame loads', () => {
    const panel = mountPanel(makeController('loading'));
    const callout = panel.find('.callout');
    expect(callout.exists()).toBe(true);
    expect(callout.find('.eyebrow').text()).toBe('Status Monitor');
    expect(callout.find('p').text()).toBe('Loading live market data status…');
  });
});

describe('error state (:4168-4172)', () => {
  it('shows the warning callout with the server message', () => {
    const panel = mountPanel(makeController('error', 'HTTP 500'));
    const callout = panel.find('.callout.warning');
    expect(callout.exists()).toBe(true);
    expect(callout.find('p').text()).toBe('HTTP 500');
  });

  it('falls back to market.failedStatusMonitor when the message is empty', () => {
    const panel = mountPanel(makeController('error', ''));
    expect(panel.find('.callout.warning p').text()).toBe('Failed to load live status monitor.');
  });

  it('renders the message escaped — never as markup (no v-html for server data)', () => {
    const panel = mountPanel(makeController('error', '<img src=x onerror=alert(1)>'));
    const html = panel.find('.callout.warning p').html();
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(panel.find('.callout.warning p img').exists()).toBe(false);
  });
});

describe('lifecycle', () => {
  it('destroys the monitor state on unmount (R2 destroy-before-unmount)', () => {
    const harness = makeController('ready');
    const panel = mountPanel(harness);
    panel.unmount();
    expect(harness.destroyStatusMonitor).toHaveBeenCalledTimes(1);
    expect(harness.attachFrame).toHaveBeenLastCalledWith(null);
  });

  it('renders no callout once the frame is ready', () => {
    const panel = mountPanel(makeController('ready'));
    expect(panel.find('.callout').exists()).toBe(false);
  });
});
