import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({
    origin: 'http://pbgui.test:8000',
    base_prefix: '',
    authenticated: true,
    version: '1.0.0',
    serial: 'S1',
  }),
  apiPath: (path: string) => path,
  wsOrigin: () => 'ws://pbgui.test:8000',
  pageOrigin: () => 'http://pbgui.test:8000',
}));

const appSource = readFileSync(resolve(import.meta.dirname, 'App.vue'), 'utf8');
const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  delete (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
});

function mountApp(): ReturnType<typeof mount> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  return mount(App, {
    attachTo: host,
    global: {
      plugins: [createI18n('en')],
      stubs: {
        FixedDashboard: { template: '<div data-test="fixed-dashboard" />' },
      },
    },
  });
}

describe('fixed dashboard shell', () => {
  it('renders the shared shell and fixed overview slot', () => {
    const wrapper = mountApp();

    expect(wrapper.find('.app-shell').exists()).toBe(true);
    expect(wrapper.find('[data-test="fixed-dashboard"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Live overview');
  });

  it('does not expose dashboard management or iframe controls', () => {
    expect(appSource).not.toContain('NewDashboardDialog');
    expect(appSource).not.toContain('DashboardList');
    expect(appSource).not.toContain('content-frame');
    expect(appSource).not.toContain('templatesPageUrl');
  });

  it('installs the shared help opener without changing the page route', () => {
    mountApp();

    expect(window.PBGUI_HELP_OPENER).toBeTypeOf('function');
  });
});
