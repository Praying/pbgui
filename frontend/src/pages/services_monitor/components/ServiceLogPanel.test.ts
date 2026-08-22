import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ServiceLogPanel from './ServiceLogPanel.vue';
import type { ServiceStatusMap } from '../types';

vi.mock('./LogViewer.vue', () => ({
  default: { name: 'LogViewer', props: ['file'], template: '<div class="logviewer-stub">{{ file }}</div>' },
}));

const STATUSES: ServiceStatusMap = {
  pbcluster: { running: true, unit: 'pbcluster.service' },
  pbrun: { running: false },
  'api-server': { running: true },
};

interface Props {
  svcId?: string;
  label?: string;
  logFile?: string;
  statuses?: ServiceStatusMap;
  pending?: Record<string, string>;
  active?: boolean;
  tabs?: Array<{ id: string; i18nKey: string; icon?: string; task: string }>;
}

function mountPanel(props: Props = {}) {
  return mount(ServiceLogPanel, {
    props: {
      svcId: props.svcId ?? 'pbcluster',
      label: props.label ?? 'PBCluster',
      logFile: props.logFile ?? 'PBCluster.log',
      statuses: props.statuses ?? STATUSES,
      active: props.active ?? true,
      tabs: props.tabs,
    },
    global: { plugins: [createI18n('en')] },
  });
}

beforeEach(() => {
  window.location.hash = '';
});

afterEach(() => {
  window.location.hash = '';
});

describe('ServiceLogPanel ctrl strip (legacy per-panel markup)', () => {
  it('renders the service title, status dot and status label', () => {
    const wrapper = mountPanel({ svcId: 'pbrun', label: 'PBRun', logFile: 'PBRun.log' });

    expect(wrapper.find('.ctrl-title').text()).toBe('PBRun');
    expect(wrapper.find('.status-dot').classes()).toContain('stopped');
    expect(wrapper.find('.status-label').text()).toBe('Stopped');
  });

  it('renders the legacy service action buttons and emits action', async () => {
    const wrapper = mountPanel();

    const buttons = wrapper.findAll('.ctrl-strip .ctrl-btn');
    expect(buttons).toHaveLength(2); // running service: stop + restart
    expect(buttons[0]!.classes()).toContain('stop');
    expect(buttons[0]!.text()).toContain('Stop');

    await buttons[0]!.trigger('click');
    expect(wrapper.emitted('action')).toEqual([['pbcluster', 'stop']]);
  });

  it('shows only restart for the api-server (legacy restartApiServer route)', () => {
    const wrapper = mountPanel({ svcId: 'api-server', label: 'PBAPIServer', logFile: 'PBApiServer.log' });

    const buttons = wrapper.findAll('.ctrl-strip .ctrl-btn');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.classes()).toContain('restart');
  });
});

describe('ServiceLogPanel log pane (legacy initLogViewer)', () => {
  it('mounts the log viewer with the legacy default file once the panel is active', async () => {
    const wrapper = mountPanel({ active: false });
    expect(wrapper.find('.logviewer-stub').exists()).toBe(false); // legacy initLogViewer runs on selectPanel

    await wrapper.setProps({ active: true });
    expect(wrapper.find('.logviewer-stub').text()).toBe('PBCluster.log');
  });

  it('keeps the log viewer mounted after the first activation (legacy _logViewers cache)', async () => {
    const wrapper = mountPanel();

    await wrapper.setProps({ active: false });

    expect(wrapper.find('.logviewer-stub').exists()).toBe(true);
  });
});

describe('ServiceLogPanel tabs (legacy switchTab)', () => {
  const PBDATA_TABS = [
    { id: 'log', i18nKey: 'sysmon.logTab', task: 'Task 10' },
    { id: 'settings', i18nKey: 'sysmon.settings', task: 'Task 12' },
    { id: 'status', i18nKey: 'sysmon.status', task: 'Task 12' },
  ];

  it('renders the legacy tab bar with Log active by default', () => {
    const wrapper = mountPanel({ svcId: 'pbdata', label: 'PBData', logFile: 'PBData.log', tabs: PBDATA_TABS });

    const tabs = wrapper.findAll('.tab-btn');
    expect(tabs.map((button) => button.text())).toEqual(['Log', 'Settings', 'Status']);
    expect(tabs.every((button) => button.find('svg').exists())).toBe(true);
    expect(tabs[0]!.classes()).toContain('active');
    expect(wrapper.find('#pbdata-tab-log').classes()).toContain('active');
    expect(wrapper.find('.logviewer-stub').text()).toBe('PBData.log');
  });

  it('switches tabs, persists the hash and keeps the log pane alive', async () => {
    const wrapper = mountPanel({ svcId: 'pbdata', label: 'PBData', logFile: 'PBData.log', tabs: PBDATA_TABS });

    await wrapper.findAll('.tab-btn')[1]!.trigger('click');

    expect(window.location.hash).toBe('#pbdata/settings');
    expect(wrapper.find('#pbdata-tab-log').classes()).not.toContain('active');
    expect(wrapper.find('#pbdata-tab-settings').classes()).toContain('active');
    // Legacy created the viewer once and never destroyed it on tab switches.
    expect(wrapper.find('.logviewer-stub').exists()).toBe(true);
  });

  it('restores the tab from the location hash on mount', () => {
    window.location.hash = '#api-server/settings';
    const wrapper = mountPanel({
      svcId: 'api-server',
      label: 'PBAPIServer',
      logFile: 'PBApiServer.log',
      tabs: [
        { id: 'log', i18nKey: 'sysmon.logTab', task: 'Task 10' },
        { id: 'settings', i18nKey: 'sysmon.settings', task: 'Task 13' },
      ],
    });

    expect(wrapper.find('#api-server-tab-settings').classes()).toContain('active');
    // Log viewer stays unopened: legacy initLogViewer only ran for the log tab.
    expect(wrapper.find('.logviewer-stub').exists()).toBe(false);
  });
});
