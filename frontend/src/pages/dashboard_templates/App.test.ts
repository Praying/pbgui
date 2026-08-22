import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { ApiError, apiFetch } from '@/shared/api';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

enableAutoUnmount(afterEach);

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

vi.mock('@/shared/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public detail: string) {
      super(`API ${status}: ${detail}`);
    }
  },
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);
const BASE = 'http://pbgui.test:8000/api/dashboards';
const DEFAULT_SEARCH = '?current=B&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi';

interface ApiState {
  templates: string[];
  users: string[];
  dashboards: Record<string, unknown>;
  failSave?: boolean;
  failCreate?: boolean;
  failRename?: string; // ApiError detail thrown by PATCH
}

let state: ApiState;

/** Stateful mock of the dashboard templates API surface (api/dashboards.py). */
function installTemplatesApi(init: Partial<ApiState> = {}): void {
  state = {
    templates: [],
    users: [],
    dashboards: {},
    ...init,
  };
  apiFetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u === `${BASE}/templates` && method === 'GET') return { templates: [...state.templates] };
    if (u === `${BASE}/users` && method === 'GET') return { users: [...state.users] };
    if (u === `${BASE}/from_template` && method === 'POST') {
      if (state.failCreate) throw new ApiError(500, 'create boom');
      const body = JSON.parse(String(init?.body)) as { template: string; name: string };
      return { status: 'ok', name: body.name };
    }
    if (u.startsWith(`${BASE}/templates/`)) {
      if (method === 'POST') {
        if (state.failSave) throw new ApiError(500, 'save boom');
        return { status: 'ok' };
      }
      if (method === 'DELETE') return { status: 'ok' };
      if (method === 'PATCH') {
        if (state.failRename) throw new ApiError(409, state.failRename);
        return { status: 'ok' };
      }
    }
    if (u.startsWith(`${BASE}/`)) {
      const name = decodeURIComponent(u.slice(BASE.length + 1));
      const config = state.dashboards[name];
      if (config === undefined) throw new ApiError(404, `Dashboard '${name}' not found`);
      return { config };
    }
    throw new ApiError(404, `unexpected ${method} ${u}`);
  });
}

interface DialogsStub {
  confirm: ReturnType<typeof vi.fn>;
}

let confirmSpy: ReturnType<typeof vi.fn>;
let parentPost: ReturnType<typeof vi.fn>;

// App mounts are attached to the document body: jsdom's getComputedStyle only
// resolves inline styles (v-show) reliably for connected elements.
const hosts: HTMLElement[] = [];

function mountApp(lang: 'en' | 'zh' = 'en', search = DEFAULT_SEARCH): ReturnType<typeof mount> {
  // Relative URLs only: jsdom history.replaceState rejects cross-origin URLs.
  window.history.replaceState(null, '', `/api/dashboard/templates_page${search}`);
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  return mount(App, { attachTo: host, global: { plugins: [createI18n(lang)] } });
}

/** Select a template in the manage multi-select via the legacy press/release toggle. */
async function toggleManageItem(wrapper: ReturnType<typeof mountApp>, name: string): Promise<void> {
  const item = wrapper.find(`#tpl-manage-msel .msel-item[data-value="${name}"]`);
  await item.trigger('mousedown', { button: 0, clientX: 5, clientY: 5 });
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

beforeEach(() => {
  confirmSpy = vi.fn().mockResolvedValue(true);
  (window as Window & { PBGuiDialogs?: DialogsStub }).PBGuiDialogs = { confirm: confirmSpy };
  parentPost = vi.fn();
  vi.spyOn(window, 'postMessage').mockImplementation(parentPost);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const host of hosts.splice(0)) host.remove();
  delete (window as Window & { PBGuiDialogs?: DialogsStub }).PBGuiDialogs;
  window.history.replaceState(null, '', '/');
});

describe('dashboard_templates page shell', () => {
  it('shows the loading text until templates and users are both loaded', async () => {
    installTemplatesApi({ templates: ['T1'], users: ['alice'] });
    const wrapper = mountApp();

    // Iframe boundary: dashboard_main owns the rail and overlay chrome.
    expect(wrapper.find('.app-shell').exists()).toBe(false);
    expect(wrapper.find('#content').text()).toContain('Loading…');

    await flushPromises();

    expect(wrapper.find('#content').text()).not.toContain('Loading…');
    expect(wrapper.findAll('.tpl-card')).toHaveLength(3);
  });

  it('sets the document title from i18n', () => {
    installTemplatesApi();
    mountApp();

    expect(document.title).toBe('Dashboard Templates');
  });

  it('sets a localized title in zh', () => {
    installTemplatesApi();
    mountApp('zh');

    expect(document.title).toBe('仪表盘模板');
  });

  it('renders the three legacy cards in order when a current dashboard is open', async () => {
    installTemplatesApi({ templates: ['T1'], users: ['alice'] });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.findAll('.tpl-card-title').map((el) => el.text())).toEqual([
      'Save current dashboard as template',
      'My templates',
      'Create dashboards from template',
    ]);
    expect(wrapper.find('#save-name').exists()).toBe(true);
    expect(wrapper.find('#btn-save').exists()).toBe(true);
  });

  it('hides the save card when no current dashboard is open', async () => {
    installTemplatesApi({ templates: ['T1'], users: [] });
    const wrapper = mountApp('en', '?api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi');
    await flushPromises();

    expect(wrapper.find('#save-name').exists()).toBe(false);
    expect(wrapper.findAll('.tpl-card')).toHaveLength(2);
  });

  it('posts pbgui_close_templates to the parent on close', async () => {
    installTemplatesApi();
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#btn-close').trigger('click');

    expect(wrapper.find('#btn-close svg').exists()).toBe(true);
    expect(wrapper.find('#btn-close').attributes('aria-label')).toBe('Close');
    expect(parentPost).toHaveBeenCalledWith({ type: 'pbgui_close_templates' }, '*');
  });

  it('shows the legacy empty messages when no templates exist', async () => {
    installTemplatesApi({ templates: [], users: [] });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain('No templates saved yet.');
    expect(wrapper.text()).toContain('Save a template first.');
    expect(wrapper.find('#users-msel').exists()).toBe(false);
    expect(wrapper.find('#tpl-manage-msel').exists()).toBe(false);
  });

  it('treats template and user load failures as empty lists', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(500, 'down'));
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('#content').text()).not.toContain('Loading…');
    expect(wrapper.text()).toContain('No templates saved yet.');
  });

  it('localizes the card titles in zh', async () => {
    installTemplatesApi({ templates: ['T1'], users: ['alice'] });
    const wrapper = mountApp('zh');
    await flushPromises();

    expect(wrapper.findAll('.tpl-card-title').map((el) => el.text())).toEqual([
      '将当前仪表盘保存为模板',
      '我的模板',
      '从模板创建仪表盘',
    ]);
  });
});

describe('save current dashboard as template', () => {
  it('saves the current dashboard config under the entered name', async () => {
    installTemplatesApi({ templates: [], users: ['alice'], dashboards: { B: { rows: [1], cols: 2 } } });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#save-name').setValue('NewTpl');
    await wrapper.find('#btn-save').trigger('click');
    await flushPromises();

    const post = apiFetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(post?.[0])).toBe(`${BASE}/templates/NewTpl`);
    expect(post?.[1]?.body).toBe(JSON.stringify({ rows: [1], cols: 2 }));
    expect(wrapper.find('#save-msg').text()).toBe('“NewTpl” saved');
    expect(wrapper.find('#save-msg').classes()).toContain('ok');
    // legacy render() after a save reset the input to the current dashboard name
    expect((wrapper.find('#save-name').element as HTMLInputElement).value).toBe('B');
    // the saved name joins the template multi-select
    expect(wrapper.find('#tpl-manage-msel').text()).toContain('NewTpl');
    expect(wrapper.find('#tpl-select').text()).toContain('NewTpl');
  });

  it('requires a template name', async () => {
    installTemplatesApi({ dashboards: { B: { rows: [] } } });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#save-name').setValue('   ');
    await wrapper.find('#btn-save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#save-msg').text()).toBe('Name required');
    expect(wrapper.find('#save-msg').classes()).toContain('err');
    expect(apiFetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('shows couldNotLoadConfig when the dashboard config is missing', async () => {
    installTemplatesApi({ dashboards: {} }); // GET /dashboards/B → 404
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#btn-save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#save-msg').text()).toBe('Could not load dashboard config');
    expect(wrapper.find('#save-msg').classes()).toContain('err');
    expect(apiFetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('shows errorSavingTemplate when the save fails', async () => {
    installTemplatesApi({ failSave: true, dashboards: { B: { rows: [] } } });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#btn-save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#save-msg').text()).toBe('Error saving template');
    expect(wrapper.find('#save-msg').classes()).toContain('err');
  });
});

describe('manage templates', () => {
  it('hides the rename and delete buttons until templates are selected', async () => {
    installTemplatesApi({ templates: ['A', 'B'], users: [] });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('#btn-del-tpl').isVisible()).toBe(false);
    expect(wrapper.find('#btn-rename-tpl').isVisible()).toBe(false);

    await toggleManageItem(wrapper, 'A');

    expect(wrapper.find('#btn-del-tpl').isVisible()).toBe(true);
    expect(wrapper.find('#btn-rename-tpl').isVisible()).toBe(true);
    expect(wrapper.find('#btn-del-tpl svg').exists()).toBe(true);
    expect(wrapper.find('#btn-rename-tpl svg').exists()).toBe(true);
    expect(wrapper.find('#btn-del-tpl').attributes('aria-label')).toBe('Delete');
    expect(wrapper.find('#btn-rename-tpl').attributes('aria-label')).toBe('Rename');
  });

  it('deletes the selected templates after confirmation', async () => {
    installTemplatesApi({ templates: ['A', 'B', 'C'], users: [] });
    const wrapper = mountApp();
    await flushPromises();

    await toggleManageItem(wrapper, 'A');
    await toggleManageItem(wrapper, 'C');
    await wrapper.find('#btn-del-tpl').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith({
      title: 'Delete templates',
      message: 'Delete 2 templates?',
      confirmText: 'Delete',
    });
    const deletes = apiFetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deletes.map(([url]) => String(url))).toEqual([
      `${BASE}/templates/A`,
      `${BASE}/templates/C`,
    ]);
    // list refreshed locally, selection cleared
    expect(wrapper.find('#tpl-manage-msel').text()).not.toContain('A');
    expect(wrapper.find('#tpl-manage-msel').text()).toContain('B');
    expect(wrapper.find('#btn-del-tpl').isVisible()).toBe(false);
  });

  it('keeps the templates when the delete confirmation is declined', async () => {
    installTemplatesApi({ templates: ['A'], users: [] });
    confirmSpy.mockResolvedValueOnce(false);
    const wrapper = mountApp();
    await flushPromises();

    await toggleManageItem(wrapper, 'A');
    await wrapper.find('#btn-del-tpl').trigger('click');
    await flushPromises();

    expect(apiFetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    expect(wrapper.find('#tpl-manage-msel').text()).toContain('A');
  });

  it('renames the selected template via PATCH and keeps it selected', async () => {
    installTemplatesApi({ templates: ['A'], users: [] });
    const wrapper = mountApp();
    await flushPromises();

    await toggleManageItem(wrapper, 'A');
    await wrapper.find('#btn-rename-tpl').trigger('click');

    expect(wrapper.find('#rename-wrap').isVisible()).toBe(true);
    expect((wrapper.find('#rename-input').element as HTMLInputElement).value).toBe('A');

    await wrapper.find('#rename-input').setValue('Renamed');
    await wrapper.find('#btn-rename-confirm').trigger('click');
    await flushPromises();

    const patch = apiFetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(String(patch?.[0])).toBe(`${BASE}/templates/A`);
    expect(patch?.[1]?.body).toBe(JSON.stringify({ new_name: 'Renamed' }));
    expect(wrapper.find('#rename-wrap').isVisible()).toBe(false);
    expect(wrapper.find('#tpl-manage-msel .msel-btn').text()).toContain('Renamed');
    expect(wrapper.find('#btn-rename-tpl').isVisible()).toBe(true);
  });

  it('just hides the rename row when the new name matches the old one', async () => {
    installTemplatesApi({ templates: ['A'], users: [] });
    const wrapper = mountApp();
    await flushPromises();

    await toggleManageItem(wrapper, 'A');
    await wrapper.find('#btn-rename-tpl').trigger('click');
    await wrapper.find('#btn-rename-confirm').trigger('click'); // value still 'A'
    await flushPromises();

    expect(wrapper.find('#rename-wrap').isVisible()).toBe(false);
    expect(apiFetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  });

  it('does not auto-reopen the rename row after delete and reselection', async () => {
    installTemplatesApi({ templates: ['A', 'B', 'C'], users: [] });
    const wrapper = mountApp();
    await flushPromises();

    await toggleManageItem(wrapper, 'A');
    await wrapper.find('#btn-rename-tpl').trigger('click');
    expect(wrapper.find('#rename-wrap').isVisible()).toBe(true);

    // Selection moves to two templates: legacy updateTplButtons forces the row closed.
    await toggleManageItem(wrapper, 'B');
    expect(wrapper.find('#rename-wrap').isVisible()).toBe(false);

    await wrapper.find('#btn-del-tpl').trigger('click');
    await flushPromises();

    // Reselecting a template must keep the row closed (legacy: only 📝 opens it).
    await toggleManageItem(wrapper, 'C');
    expect(wrapper.find('#rename-wrap').isVisible()).toBe(false);
    expect(wrapper.find('#btn-rename-tpl').isVisible()).toBe(true);
  });

  it('shows the server detail message when the rename fails', async () => {
    installTemplatesApi({ templates: ['A'], users: [], failRename: "Template 'X' already exists" });
    const wrapper = mountApp();
    await flushPromises();

    await toggleManageItem(wrapper, 'A');
    await wrapper.find('#btn-rename-tpl').trigger('click');
    await wrapper.find('#rename-input').setValue('X');
    await wrapper.find('#btn-rename-confirm').trigger('click');
    await flushPromises();

    expect(wrapper.find('#manage-msg').text()).toBe("Template 'X' already exists");
    expect(wrapper.find('#manage-msg').classes()).toContain('err');
  });
});

describe('create dashboards from template', () => {
  it('creates a dashboard with a free name when no users exist', async () => {
    installTemplatesApi({ templates: ['T1'], users: [], dashboards: {} });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#tpl-select').setValue('T1');
    await wrapper.find('#dash-name').setValue('Fresh');
    await wrapper.find('#btn-create').trigger('click');
    await flushPromises();

    const posts = apiFetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/from_template') && init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.[1]?.body).toBe(JSON.stringify({ template: 'T1', name: 'Fresh' }));
    // Legacy quirk: this branch uses literal (non-i18n) success strings.
    expect(wrapper.find('#create-msg').text()).toBe('“Fresh” created');
    expect(wrapper.find('#create-msg').classes()).toContain('ok');
    expect((wrapper.find('#dash-name').element as HTMLInputElement).value).toBe('');
    expect(parentPost).toHaveBeenCalledWith({ type: 'pbgui_dashboard_created' }, '*');
  });

  it('requires a dashboard name when no users exist', async () => {
    installTemplatesApi({ templates: ['T1'], users: [] });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#tpl-select').setValue('T1');
    await wrapper.find('#btn-create').trigger('click');
    await flushPromises();

    expect(wrapper.find('#create-msg').text()).toBe('Dashboard name required');
    expect(wrapper.find('#create-msg').classes()).toContain('err');
    expect(apiFetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/from_template') && init?.method === 'POST')).toHaveLength(0);
  });

  it('requires a template selection', async () => {
    installTemplatesApi({ templates: ['T1'], users: [] });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#btn-create').trigger('click');
    await flushPromises();

    expect(wrapper.find('#create-msg').text()).toBe('Select a template');
    expect(wrapper.find('#create-msg').classes()).toContain('err');
  });

  it('confirms overwrite when the dashboard already exists', async () => {
    installTemplatesApi({ templates: ['T1'], users: [], dashboards: { Fresh: { rows: [] } } });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#tpl-select').setValue('T1');
    await wrapper.find('#dash-name').setValue('Fresh');
    await wrapper.find('#btn-create').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith({
      title: 'Overwrite dashboard',
      message: 'Dashboard “Fresh” already exists.',
      detail: 'Overwrite it with the selected template?',
      confirmText: 'Overwrite',
    });
    expect(wrapper.find('#create-msg').text()).toBe('“Fresh” created');
    expect(parentPost).toHaveBeenCalledWith({ type: 'pbgui_dashboard_created' }, '*');
  });

  it('aborts silently when the overwrite is declined', async () => {
    installTemplatesApi({ templates: ['T1'], users: [], dashboards: { Fresh: { rows: [] } } });
    confirmSpy.mockResolvedValueOnce(false);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#tpl-select').setValue('T1');
    await wrapper.find('#dash-name').setValue('Fresh');
    await wrapper.find('#btn-create').trigger('click');
    await flushPromises();

    expect(apiFetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/from_template') && init?.method === 'POST')).toHaveLength(0);
    expect(parentPost).not.toHaveBeenCalled();
    expect(wrapper.find('#create-msg').text()).toBe('');
  });

  it('shows an error when the creation fails', async () => {
    installTemplatesApi({ templates: ['T1'], users: [], failCreate: true });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#tpl-select').setValue('T1');
    await wrapper.find('#dash-name').setValue('Fresh');
    await wrapper.find('#btn-create').trigger('click');
    await flushPromises();

    expect(wrapper.find('#create-msg').text()).toBe('Error creating dashboard');
    expect(wrapper.find('#create-msg').classes()).toContain('err');
    expect(parentPost).not.toHaveBeenCalled();
  });

  it('creates one dashboard per user with the username as default name', async () => {
    installTemplatesApi({ templates: ['T1'], users: ['alice', 'bob'], dashboards: {} });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#tpl-select').setValue('T1');
    await wrapper.find('#btn-create').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith({
      title: 'Create dashboard(s)',
      message: 'Create 2 dashboard(s) from template “T1”?',
      confirmText: 'Create',
    });
    const posts = apiFetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/from_template') && init?.method === 'POST');
    expect(posts.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { template: 'T1', name: 'alice' },
      { template: 'T1', name: 'bob' },
    ]);
    expect(wrapper.find('#create-msg').text()).toBe('2 dashboard(s) created');
    expect(wrapper.find('#create-msg').classes()).toContain('ok');
    expect(parentPost).toHaveBeenCalledWith({ type: 'pbgui_dashboard_created' }, '*');
  });

  it('uses the entered name for every user and counts skipped overwrites', async () => {
    installTemplatesApi({
      templates: ['T1'],
      users: ['alice', 'bob'],
      dashboards: { Shared: { rows: [] } },
    });
    confirmSpy.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#tpl-select').setValue('T1');
    await wrapper.find('#dash-name').setValue('Shared');
    await wrapper.find('#btn-create').trigger('click');
    await flushPromises();

    const posts = apiFetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/from_template') && init?.method === 'POST');
    expect(posts.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { template: 'T1', name: 'Shared' },
    ]);
    expect(wrapper.find('#create-msg').text()).toBe('1 dashboard(s) created, 1 skipped');
    expect(wrapper.find('#create-msg').classes()).toContain('ok');
    expect(parentPost).toHaveBeenCalledWith({ type: 'pbgui_dashboard_created' }, '*');
  });

  it('shows an error message without posting when every creation is skipped', async () => {
    installTemplatesApi({ templates: ['T1'], users: ['alice'], dashboards: { alice: { rows: [] } } });
    confirmSpy.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#tpl-select').setValue('T1');
    await wrapper.find('#btn-create').trigger('click');
    await flushPromises();

    expect(wrapper.find('#create-msg').text()).toBe('0 dashboard(s) created, 1 skipped');
    expect(wrapper.find('#create-msg').classes()).toContain('err');
    expect(parentPost).not.toHaveBeenCalled();
  });

  it('creates dashboards only for the selected users', async () => {
    installTemplatesApi({ templates: ['T1'], users: ['alice', 'bob'], dashboards: {} });
    const wrapper = mountApp();
    await flushPromises();

    // replace the ALL selection with bob via the users multi-select
    const usersMsel = wrapper.find('#users-msel');
    await usersMsel.find('.msel-btn').trigger('click');
    await usersMsel.find('.msel-item[data-value="bob"]').trigger('mousedown', { button: 0, clientX: 5, clientY: 5 });
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    await wrapper.find('#tpl-select').setValue('T1');
    await wrapper.find('#btn-create').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith({
      title: 'Create dashboard(s)',
      message: 'Create 1 dashboard(s) from template “T1”?',
      confirmText: 'Create',
    });
    const posts = apiFetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/from_template') && init?.method === 'POST');
    expect(posts.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { template: 'T1', name: 'bob' },
    ]);
  });

  it('defaults the name placeholder to optionalDefaultUsername when users exist', async () => {
    installTemplatesApi({ templates: ['T1'], users: ['alice'] });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('#dash-name').attributes('placeholder')).toBe('optional — default: username');
  });

  it('uses the required placeholder when no users exist', async () => {
    installTemplatesApi({ templates: ['T1'], users: [] });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('#dash-name').attributes('placeholder')).toBe('required');
  });
});
