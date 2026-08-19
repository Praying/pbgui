import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { getBoot } from '@/shared/boot';
import App from './App.vue';

/* Page-shell integration: bootstrap render, section switching, setup form
   gating, password flows and the file browser modal. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: 'v1.99', serial: 'S9' })),
}));

const fetchMock = vi.fn();

const BOOTSTRAP = {
  version: 'v1.99.1',
  serial: 'S99',
  auth: { authenticated: true, auth_mode: 'password', password_required: true, login_security: { blocked_attempts: 0 } },
  setup: {
    ready: false,
    import_ready: true,
    venv_ready: false,
    src_dir: '/opt/pb7',
    pb7dir: '/opt/pb7',
    pb7venv: '',
    pbname: 'main',
    role: 'master',
    master: true,
    errors: [],
    warnings: ['PB7 venv missing'],
    pb8: { required: false, configured: false, ready: false, source_ready: false, pb8dir: '', pb8venv: '' },
  },
};

async function mountApp() {
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return wrapper;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/auth/main_page');
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL) => {
    const u = String(url);
    if (u.includes('/api/auth/bootstrap')) return Promise.resolve(new Response(JSON.stringify(BOOTSTRAP), { status: 200 }));
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
  document.body.innerHTML = '';
});

describe('Welcome page shell', () => {
  it('renders the overview summary from the bootstrap payload', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('#summary-auth').text()).toBe('Authenticated');
    expect(wrapper.find('#summary-pb7').text()).toBe('PB7 source ready');
    expect(wrapper.find('#summary-pb8').text()).toBe('PB8 optional');
    expect(wrapper.find('#summary-identity').text()).toBe('main');
    expect(wrapper.find('#meta-version').text()).toBe('v1.99.1');
    expect(document.title).toBe('PBGui - Welcome');
  });

  it('uses a focused overview with grouped statuses and a direct PB7 setup action', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('.migration-watermark').exists()).toBe(false);
    expect(wrapper.find('.overview-header').exists()).toBe(true);
    expect(wrapper.find('.overview-title').text()).toBe('System Overview');
    expect(wrapper.find('.sb-meta').exists()).toBe(false);

    const cards = wrapper.findAll('.summary-card');
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.attributes('data-tone'))).toEqual(['success', 'warning', 'neutral', 'neutral']);
    expect(wrapper.find('.summary-action').exists()).toBe(true);
    expect(wrapper.find('.summary-action').text()).toBe('Configure PB7');
    await wrapper.find('.summary-action').trigger('click');
    expect(wrapper.find('#section-setup').attributes('hidden')).toBeUndefined();
    await wrapper.findAll('#sidebar .sb-btn')[0]!.trigger('click');

    const statusGroups = wrapper.findAll('#status-list .status-group');
    expect(statusGroups).toHaveLength(4);
    expect(statusGroups[0]!.findAll('.status-row')).toHaveLength(1);
    expect(statusGroups[1]!.findAll('.status-row')).toHaveLength(3);
    expect(statusGroups[2]!.findAll('.status-row')).toHaveLength(4);
    expect(statusGroups[3]!.findAll('.status-row')).toHaveLength(1);

    const statusBadges = wrapper.findAll('#status-list .status-badge');
    expect(statusBadges).toHaveLength(9);
    expect(statusBadges[0]!.attributes('data-tone')).toBe('success');
    expect(statusBadges[1]!.attributes('data-tone')).toBe('success');
    expect(statusBadges[2]!.attributes('data-tone')).toBe('warning');
  });

  it('renders the runtime status rows and setup issues', async () => {
    const wrapper = await mountApp();

    const rows = wrapper.findAll('#status-list .status-row');
    expect(rows.length).toBe(9); // :1289-1303
    expect(rows[1]!.text()).toContain('PB7 source');
    expect(rows[1]!.text()).toContain('/opt/pb7');
    const issues = wrapper.findAll('#issues .issue');
    expect(issues.map((issue) => issue.text())).toContain('PB7 venv missing');
  });

  it('does not repeat generic runtime-missing messages below the grouped status rows', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...BOOTSTRAP,
          setup: {
            ...BOOTSTRAP.setup,
            errors: ['Passivbot V7 path is not configured.', 'Passivbot V7 python interpreter is not configured.'],
            warnings: [],
          },
        }),
        { status: 200 }
      )
    );

    const wrapper = await mountApp();
    expect(wrapper.findAll('#issues .issue')).toHaveLength(0);
  });

  it('shows the login-security warning with acknowledge until acknowledged', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ...BOOTSTRAP,
            auth: { ...BOOTSTRAP.auth, login_security: { blocked_attempts: 2, active_blocks: 1 } },
          }),
          { status: 200 }
        )
      )
    );
    const wrapper = await mountApp();

    expect(wrapper.find('.login-security-warning').exists()).toBe(true);
    expect(wrapper.find('.login-security-warning').text()).toContain('2');

    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes('/login-security/ack')) {
        return Promise.resolve(
          new Response(JSON.stringify({ login_security: { blocked_attempts: 2, acknowledged: true } }), { status: 200 })
        );
      }
      if (u.includes('/bootstrap')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ...BOOTSTRAP, auth: { ...BOOTSTRAP.auth, login_security: { blocked_attempts: 2, acknowledged: true } } }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    await wrapper.find('.login-security-ack').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.find('.login-security-warning').exists()).toBe(false);
    expect(wrapper.find('#banner').classes()).toContain('success');
  });

  it('switches to the setup section, prefills fields and saves the payload', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('#section-setup').attributes('hidden')).toBeDefined();
    await wrapper.findAll('#sidebar [data-flow-section], #sidebar .sb-btn')[1]!.trigger('click');
    expect(wrapper.find('#section-setup').attributes('hidden')).toBeUndefined();
    expect((wrapper.find('#pb7dir').element as HTMLInputElement).value).toBe('/opt/pb7');
    expect((wrapper.find('#pbname').element as HTMLInputElement).value).toBe('main');

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...BOOTSTRAP, message: 'Setup saved' }), { status: 200 }));
    await wrapper.find('#pb7venv').setValue('/venv/bin/python');
    await wrapper.find('#save-setup-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://pbgui.test:8000/api/auth/setup');
    expect(JSON.parse(String(init.body))).toMatchObject({ pb7dir: '/opt/pb7', pb7venv: '/venv/bin/python', pbname: 'main', role: 'master' });
  });

  it('organizes setup into bounded PB7/PB8 groups with a distinct identity action area', async () => {
    const wrapper = await mountApp();
    await wrapper.findAll('#sidebar .sb-btn')[1]!.trigger('click');

    expect(wrapper.find('#section-setup .settings-section-heading').exists()).toBe(true);
    expect(wrapper.find('#section-setup .settings-section-heading .section-kicker').text()).toBe('Runtime Settings');
    expect(wrapper.find('#section-setup .settings-panel').exists()).toBe(true);
    expect(wrapper.findAll('#section-setup .runtime-group')).toHaveLength(2);
    expect(wrapper.find('#section-setup .runtime-group--pb7 #pb7dir').exists()).toBe(true);
    expect(wrapper.find('#section-setup .runtime-group--pb8 #pb8dir').exists()).toBe(true);
    expect(wrapper.find('#section-setup .identity-section').exists()).toBe(true);
    expect(wrapper.find('#section-setup .settings-actions').exists()).toBe(true);
    expect(wrapper.find('#sidebar-header .sb-title').classes()).toContain('sb-title');
  });

  it('opens the password section only when authenticated', async () => {
    const wrapper = await mountApp();
    await wrapper.find('#sidebar-password-btn').trigger('click');
    expect(wrapper.find('#section-password').attributes('hidden')).toBeUndefined();
    expect(wrapper.find('.password-panel').exists()).toBe(true);
    expect(wrapper.find('.password-danger-zone').exists()).toBe(true);

    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ...BOOTSTRAP, auth: { ...BOOTSTRAP.auth, authenticated: false } }), { status: 200 })
      )
    );
    const guest = await mountApp();
    expect((guest.find('#sidebar-password-btn').element as HTMLButtonElement).disabled).toBe(true);
    await guest.find('#sidebar-password-btn').trigger('click');
    expect(guest.find('#section-password').attributes('hidden')).toBeDefined();
    expect(guest.find('#section-overview').attributes('hidden')).toBeUndefined();
  });

  it('changes the password with the exact payload and reloads', async () => {
    const wrapper = await mountApp();
    await wrapper.find('#sidebar-password-btn').trigger('click');

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'Password updated' }), { status: 200 }));
    await wrapper.find('#current-password').setValue('old');
    await wrapper.find('#new-password').setValue('new');
    await wrapper.find('#change-password-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://pbgui.test:8000/api/auth/change-password');
    expect(JSON.parse(String(init.body))).toEqual({ current_password: 'old', new_password: 'new', disable_auth: false });
  });

  it('browses directories and applies the selection to the field', async () => {
    const wrapper = await mountApp();
    await wrapper.findAll('#sidebar .sb-btn')[1]!.trigger('click');

    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes('/api/auth/browse')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              current_path: '/opt',
              parent_path: '/',
              entries: [
                { name: 'pb7', path: '/opt/pb7', is_dir: true },
                { name: 'python', path: '/opt/pb7/venv/bin/python', is_dir: false },
              ],
            }),
            { status: 200 }
          )
        );
      }
      if (u.includes('/bootstrap')) return Promise.resolve(new Response(JSON.stringify(BOOTSTRAP), { status: 200 }));
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    await wrapper.find('#browse-pb7dir-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.find('#file-browser-modal').attributes('hidden')).toBeUndefined();
    expect(wrapper.find('#file-browser-path').element).toBeTruthy();

    await wrapper.find('#file-browser-select').trigger('click');
    expect((wrapper.find('#pb7dir').element as HTMLInputElement).value).toBe('/opt');
    expect(wrapper.find('#file-browser-modal').attributes('hidden')).toBeDefined();
  });

  it('requires a new password before submitting', async () => {
    const wrapper = await mountApp();
    await wrapper.find('#sidebar-password-btn').trigger('click');

    fetchMock.mockClear();
    await wrapper.find('#change-password-btn').trigger('click');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('#banner').text()).toContain('Enter a new password');
  });
});
