import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';
import { apiBase, wsBase } from './config';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

/** Sidebar panels in legacy frontend/services_monitor.html order. */
const PANEL_IDS = [
  'overview',
  'workers',
  'migration',
  'pbcluster',
  'pbrun',
  'pbdata',
  'pbcoindata',
  'monitor-agent',
  'vps-monitor',
  'api-server',
] as const;

function mountApp(lang: 'en' | 'zh' = 'en') {
  return mount(App, { global: { plugins: [createI18n(lang)] } });
}

describe('services_monitor App skeleton', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('renders the nav placeholder and the page-body layout container', () => {
    const wrapper = mountApp();

    expect(wrapper.find('#topnav').exists()).toBe(true);
    expect(wrapper.find('#page-body').exists()).toBe(true);
    expect(wrapper.find('#sidebar').exists()).toBe(true);
    expect(wrapper.find('#main-content').exists()).toBe(true);
  });

  it('renders one sidebar button and placeholder panel container per legacy panel', () => {
    const wrapper = mountApp();

    const buttons = wrapper.findAll('.sb-btn');
    expect(buttons).toHaveLength(PANEL_IDS.length);
    for (const id of PANEL_IDS) {
      const panel = wrapper.find(`#panel-${id}`);
      expect(panel.exists(), `panel ${id} container`).toBe(true);
      expect(panel.text()).toContain(id);
    }
  });

  it('shows the overview panel as active by default', () => {
    const wrapper = mountApp();

    const active = wrapper.find('.svc-panel.active');
    expect(active.attributes('id')).toBe('panel-overview');
    expect(wrapper.find('.sb-btn.active').attributes('data-panel')).toBe('overview');
  });

  it('switches the active panel on sidebar click and persists it in the hash', async () => {
    const wrapper = mountApp();

    await wrapper.find('.sb-btn[data-panel="workers"]').trigger('click');

    expect(wrapper.find('.svc-panel.active').attributes('id')).toBe('panel-workers');
    expect(window.location.hash).toBe('#workers');
  });

  it('ignores hash panel ids that do not exist', () => {
    window.location.hash = '#no-such-panel';
    const wrapper = mountApp();

    expect(wrapper.find('.svc-panel.active').attributes('id')).toBe('panel-overview');
  });

  it('restores the active panel from the location hash', () => {
    window.location.hash = '#migration';
    const wrapper = mountApp();

    expect(wrapper.find('.svc-panel.active').attributes('id')).toBe('panel-migration');
  });

  it('sets the document title from i18n', () => {
    mountApp();

    expect(document.title).toBe('Services - PBGui');
  });

  it('renders localized sidebar labels', () => {
    const wrapper = mountApp('zh');

    expect(wrapper.find('.sb-btn[data-panel="overview"]').text()).toContain('概览');
    expect(wrapper.find('.sb-btn[data-panel="workers"]').text()).toContain('工作节点');
    // Panels the legacy page left untranslated stay as brand names.
    expect(wrapper.find('.sb-btn[data-panel="pbcluster"]').text()).toContain('PBCluster');
  });
});

describe('services_monitor config', () => {
  it('derives the services API base from the boot origin', () => {
    expect(apiBase()).toBe('http://pbgui.test:8000/api/services');
  });

  it('derives the websocket base from the boot origin', () => {
    expect(wsBase()).toBe('ws://pbgui.test:8000');
  });
});
