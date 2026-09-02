import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
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
const DASHBOARDS_URL = 'http://pbgui.test:8000/api/dashboards';
const appSource = readFileSync(resolve(import.meta.dirname, 'App.vue'), 'utf8');

interface DialogsStub {
  alert: ReturnType<typeof vi.fn>;
}
interface SharedHelpStub {
  open: ReturnType<typeof vi.fn>;
}

/** GET /dashboards serves the current list; DELETE is accepted and re-mutates the list. */
function dashboardsApi(list: string[]): void {
  apiFetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u === DASHBOARDS_URL && (!init || !init.method)) {
      return { dashboards: [...list] };
    }
    if (u.startsWith(`${DASHBOARDS_URL}/`) && init?.method === 'DELETE') {
      const name = decodeURIComponent(u.slice(DASHBOARDS_URL.length + 1));
      const ix = list.indexOf(name);
      if (ix >= 0) list.splice(ix, 1);
      return { status: 'ok', name };
    }
    return {};
  });
}

let alertSpy: ReturnType<typeof vi.fn>;
let helpOpenSpy: ReturnType<typeof vi.fn>;

// App mounts are attached to the document body: jsdom's getComputedStyle only
// resolves inline styles (v-show) reliably for connected elements.
const hosts: HTMLElement[] = [];

function mountApp(lang: 'en' | 'zh' = 'en', search = ''): ReturnType<typeof mount> {
  // Relative URLs only: jsdom history.replaceState rejects cross-origin URLs.
  window.history.replaceState(null, '', `/api/dashboard/main_page${search}`);
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  return mount(App, { attachTo: host, global: { plugins: [createI18n(lang)] } });
}

/** Dispatch a window message like the editor/templates iframes do, then flush the DOM update. */
async function message(data: unknown): Promise<void> {
  window.dispatchEvent(new MessageEvent('message', { data }));
  await nextTick();
}

/** Replace the iframe contentWindow with a spy so postMessage calls are observable. */
function framePost(wrapper: ReturnType<typeof mountApp>) {
  const post = vi.fn();
  Object.defineProperty(wrapper.find('#content-frame').element, 'contentWindow', {
    value: { postMessage: post },
    configurable: true,
  });
  return post;
}

function frameSrc(wrapper: ReturnType<typeof mountApp>): string {
  return wrapper.find('#content-frame').attributes('src') ?? '';
}

beforeEach(() => {
  alertSpy = vi.fn();
  helpOpenSpy = vi.fn();
  (window as Window & { PBGuiDialogs?: DialogsStub }).PBGuiDialogs = { alert: alertSpy };
  (window as Window & { PBGuiSharedHelp?: SharedHelpStub }).PBGuiSharedHelp = { open: helpOpenSpy };
  window.history.replaceState(null, '', '/api/dashboard/main_page');
});

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  delete (window as Window & { PBGuiDialogs?: DialogsStub }).PBGuiDialogs;
  delete (window as Window & { PBGuiSharedHelp?: SharedHelpStub }).PBGuiSharedHelp;
  delete (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
  window.history.replaceState(null, '', '/api/dashboard/main_page');
});

describe('dashboard_main App shell', () => {
  it('uses the shared deep surface for the iframe loading canvas', () => {
    expect(appSource).toContain('background: var(--surface-deep);');
  });

  it('renders the shared shell, sidebar and main content layout', async () => {
    dashboardsApi(['a']);
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('.app-shell').exists()).toBe(true);
    expect(wrapper.find('#topnav').exists()).toBe(false);
    expect(wrapper.find('#page-body').exists()).toBe(true);
    expect(wrapper.find('#sidebar').exists()).toBe(true);
    expect(wrapper.find('#main-content').exists()).toBe(true);
    expect(wrapper.find('#content-frame').exists()).toBe(true);
    // Legacy initial state: spinner + select-dashboard hint, hidden frame
    expect(wrapper.find('#content-loading').text()).toContain('Select a dashboard from the sidebar');
    expect(wrapper.find('#content-frame').classes()).not.toContain('visible');
  });

  it('sets the document title from i18n', () => {
    dashboardsApi([]);
    mountApp();

    expect(document.title).toBe('PBGui Dashboard');
  });

  it('sets a localized title in zh', () => {
    dashboardsApi([]);
    mountApp('zh');

    expect(document.title).toBe('PBGui 仪表盘');
  });

  it('registers PBGUI_HELP_OPENER on mount', () => {
    dashboardsApi([]);
    mountApp();

    const opener = (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
    expect(typeof opener).toBe('function');
    expect(() => opener?.()).not.toThrow();
  });
});

describe('dashboard list loading', () => {
  it('fetches the dashboard list on mount and renders it sorted', async () => {
    dashboardsApi(['B', 'a', 'C']);
    const wrapper = mountApp();
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith(DASHBOARDS_URL);
    const names = wrapper.findAll('.sb-item .sb-item-name').map((n) => n.text());
    expect(names).toEqual(['a', 'B', 'C']);
  });

  it('renders the sidebar count', async () => {
    dashboardsApi(['a', 'B', 'C']);
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('#sb-count').text()).toBe('3');
  });

  it('hides the search box below four dashboards and shows it at four', async () => {
    dashboardsApi(['a', 'B', 'C']);
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find('#sidebar-search-wrap').classes()).not.toContain('visible');

    dashboardsApi(['a', 'B', 'C', 'd']);
    const wrapper2 = mountApp();
    await flushPromises();
    expect(wrapper2.find('#sidebar-search-wrap').classes()).toContain('visible');
  });

  it('shows a filtered count while searching', async () => {
    dashboardsApi(['a', 'B', 'C', 'd']);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#sidebar-search').setValue('b');

    expect(wrapper.find('#sb-count').text()).toBe('1/4');
    expect(wrapper.findAll('.sb-item')).toHaveLength(1);
    expect(wrapper.find('.sb-item .sb-item-name').text()).toBe('B');
  });

  it('shows the noMatch message when the filter removes every item', async () => {
    dashboardsApi(['a', 'B', 'C', 'd']);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#sidebar-search').setValue('zzz');

    expect(wrapper.find('.sb-no-match').text()).toBe('No match');
  });
});

describe('initial current dashboard', () => {
  it('auto-loads the view for the current query param when present in the list', async () => {
    dashboardsApi(['a', 'B', 'C']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();

    expect(frameSrc(wrapper)).toBe(
      'http://pbgui.test:8000/api/dashboard/editor_page?name=B&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi&view_only=1'
    );
    expect(wrapper.find('.sb-item.active .sb-item-name').text()).toBe('B');
  });

  it('does not auto-load when current is missing from the list', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=ghost');
    await flushPromises();

    expect(frameSrc(wrapper)).toBe('');
  });
});

describe('view toolbar', () => {
  it('renders refresh, new and templates buttons in view mode', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('#sb-refresh').exists()).toBe(true);
    expect(wrapper.find('#sb-refresh').attributes('title')).toBe('Refresh list');
    expect(wrapper.find('#sb-new').exists()).toBe(true);
    expect(wrapper.find('#sb-templates').exists()).toBe(true);
    // No edit-mode controls and no edit/delete targets without a current dashboard
    expect(wrapper.find('#sb-save').exists()).toBe(false);
    expect(wrapper.find('#sb-edit').exists()).toBe(false);
    expect(wrapper.find('#sb-del').exists()).toBe(false);
  });

  it('shows the edit button when a dashboard is current', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();

    expect(wrapper.find('#sb-edit').attributes('title')).toBe('Edit current dashboard');
  });

  it('shows the delete button targeting the current dashboard when nothing is selected', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();

    expect(wrapper.find('#sb-del').attributes('title')).toBe('Delete selected dashboard');
  });

  it('refreshes the list from the refresh button', async () => {
    const list = ['a'];
    dashboardsApi(list);
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.findAll('.sb-item')).toHaveLength(1);

    list.push('b');
    await wrapper.find('#sb-refresh').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.sb-item')).toHaveLength(2);
  });
});

describe('view loading', () => {
  it('selecting an item loads the view url with view_only and marks it active', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('.sb-item[data-name="B"]').trigger('click');

    expect(frameSrc(wrapper)).toBe(
      'http://pbgui.test:8000/api/dashboard/editor_page?name=B&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi&view_only=1'
    );
    expect(wrapper.find('.sb-item[data-name="B"]').classes()).toContain('active');
  });

  it('hides the spinner and shows the frame when the iframe loads', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp();
    await flushPromises();
    // No dashboard loaded yet: the legacy initial state keeps the frame hidden.
    expect(wrapper.find('#content-frame').classes()).not.toContain('visible');

    await wrapper.find('.sb-item[data-name="B"]').trigger('click');
    await flushPromises();
    // jsdom fires the iframe load once the src is set on an attached element;
    // triggering it again is a no-op (legacy onload handler).
    await wrapper.find('#content-frame').trigger('load');

    expect(wrapper.find('#content-frame').classes()).toContain('visible');
    expect((wrapper.find('#content-loading').element as HTMLElement).style.display).toBe('none');
  });

  it('reloads with a cache-busting param after an AI create_dashboard action', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp();
    await flushPromises();

    window.dispatchEvent(
      new CustomEvent('pbgui:ai-action-completed', { detail: { action: 'create_dashboard', name: 'B' } }),
    );
    await flushPromises();

    // Generation-safe reload: same name, but the iframe src gains refresh=.
    const src = frameSrc(wrapper);
    expect(src).toContain('name=B');
    expect(src).toContain('view_only=1');
    expect(src).toMatch(/refresh=\d+/);
  });

  it('ignores AI actions for other entities', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.find('.sb-item[data-name="B"]').trigger('click');
    const before = frameSrc(wrapper);

    window.dispatchEvent(
      new CustomEvent('pbgui:ai-action-completed', { detail: { action: 'save_something', name: 'B' } }),
    );
    await flushPromises();

    expect(frameSrc(wrapper)).toBe(before);
  });
});

describe('edit mode', () => {
  it('edit button loads the standalone editor and shows the edit-mode banner', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();

    await wrapper.find('#sb-edit').trigger('click');

    expect(frameSrc(wrapper)).toBe(
      'http://pbgui.test:8000/api/dashboard/editor_page?name=B&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi&standalone=1'
    );
    expect(wrapper.find('#edit-mode-banner').classes()).toContain('visible');
    expect(wrapper.find('#sb-save').exists()).toBe(true);
    expect(wrapper.find('#sb-cancel').exists()).toBe(true);
    expect(wrapper.find('#sb-delete').exists()).toBe(true);
    expect(wrapper.find('#sb-refresh').exists()).toBe(false);
  });

  it('save and cancel post pbgui_trigger_save / pbgui_trigger_cancel to the frame', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();
    const post = framePost(wrapper);

    await wrapper.find('#sb-edit').trigger('click');
    await wrapper.find('#sb-save').trigger('click');
    await wrapper.find('#sb-cancel').trigger('click');

    expect(post).toHaveBeenNthCalledWith(1, { type: 'pbgui_trigger_save' }, '*');
    expect(post).toHaveBeenNthCalledWith(2, { type: 'pbgui_trigger_cancel' }, '*');
  });

  it('new button opens the dialog and create loads the standalone editor', async () => {
    dashboardsApi(['a']);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#sb-new').trigger('click');
    expect(wrapper.find('#new-dash-dialog').isVisible()).toBe(true);

    await wrapper.find('#new-dash-name').setValue('Fresh');
    await wrapper.find('#new-dash-ok').trigger('click');

    expect(wrapper.find('#new-dash-dialog').isVisible()).toBe(false);
    expect(frameSrc(wrapper)).toBe(
      'http://pbgui.test:8000/api/dashboard/editor_page?name=Fresh&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi&standalone=1'
    );
    expect(wrapper.find('#edit-mode-banner').classes()).toContain('visible');
  });

  it('duplicate new-dashboard names are rejected by the dialog', async () => {
    dashboardsApi(['a']);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#sb-new').trigger('click');
    await wrapper.find('#new-dash-name').setValue('a');
    await wrapper.find('#new-dash-ok').trigger('click');

    expect(wrapper.find('#new-dash-dialog').isVisible()).toBe(true);
    expect(wrapper.find('#new-dash-dialog [role="alert"]').text()).toBe('A dashboard with this name already exists.');
    expect(frameSrc(wrapper)).toBe('');
  });
});

describe('selection and delete', () => {
  it('ctrl-click toggles selection and the delete button counts it', async () => {
    dashboardsApi(['a', 'B', 'C']);
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('.sb-item[data-name="a"]').trigger('click', { ctrlKey: true });
    expect(wrapper.find('.sb-item[data-name="a"]').classes()).toContain('selected');
    expect(wrapper.find('#sb-del').attributes('title')).toBe('Delete selected dashboard');

    await wrapper.find('.sb-item[data-name="C"]').trigger('click', { ctrlKey: true });
    expect(wrapper.find('#sb-del').attributes('title')).toBe('Delete selected dashboards');

    await wrapper.find('.sb-item[data-name="a"]').trigger('click', { ctrlKey: true });
    expect(wrapper.find('.sb-item[data-name="a"]').classes()).not.toContain('selected');
  });

  it('confirming the delete dialog deletes each selected dashboard and refreshes', async () => {
    const list = ['a', 'B', 'C'];
    dashboardsApi(list);
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.find('.sb-item[data-name="a"]').trigger('click', { ctrlKey: true });
    await wrapper.find('.sb-item[data-name="C"]').trigger('click', { ctrlKey: true });

    await wrapper.find('#sb-del').trigger('click');
    expect(wrapper.find('#del-dash-dialog').isVisible()).toBe(true);
    expect(wrapper.find('#del-confirm-name').text()).toBe('2 dashboards');

    await wrapper.find('#del-ok').trigger('click');
    await flushPromises();

    const deletes = apiFetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deletes.map(([url]) => String(url))).toEqual([
      `${DASHBOARDS_URL}/a`,
      `${DASHBOARDS_URL}/C`,
    ]);
    expect(wrapper.find('#del-dash-dialog').isVisible()).toBe(false);
    const names = wrapper.findAll('.sb-item .sb-item-name').map((n) => n.text());
    expect(names).toEqual(['B']);
  });

  it('deleting the current dashboard resets the view', async () => {
    const list = ['a', 'B'];
    dashboardsApi(list);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();
    expect(frameSrc(wrapper)).toContain('name=B');

    await wrapper.find('#sb-del').trigger('click');
    await wrapper.find('#del-ok').trigger('click');
    await flushPromises();

    expect(frameSrc(wrapper)).toBe('');
    expect(wrapper.find('#sb-edit').exists()).toBe(false);
    // Legacy artifact kept: the reset shows the spinner and clears the frame, but
    // the still-attached onload handler hides the spinner again when the blank
    // src loads (jsdom fires that load automatically on the attached iframe).
    expect((wrapper.find('#content-loading').element as HTMLElement).style.display).toBe('none');
  });

  it('shows the PBGuiDialogs alert when the delete fails', async () => {
    dashboardsApi(['a']);
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (init?.method === 'DELETE') throw new ApiError(500, 'boom');
      return { dashboards: ['a'] };
    });

    await wrapper.find('.sb-item[data-name="a"]').trigger('click', { ctrlKey: true });
    await wrapper.find('#sb-del').trigger('click');
    await wrapper.find('#del-ok').trigger('click');
    await flushPromises();

    expect(alertSpy).toHaveBeenCalledWith({
      title: 'Delete Dashboard',
      message: 'Delete failed.',
    });
  });
});

describe('postMessage from the editor iframe', () => {
  it('pbgui_editor_saved refreshes the list and loads the saved dashboard', async () => {
    const list = ['a'];
    dashboardsApi(list);
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.find('#sb-new').trigger('click');
    await wrapper.find('#new-dash-name').setValue('Draft');
    await wrapper.find('#new-dash-ok').trigger('click');
    expect(frameSrc(wrapper)).toContain('standalone=1');

    list.push('Draft');
    await message({ type: 'pbgui_editor_saved', name: 'Draft' });
    await flushPromises();

    expect(frameSrc(wrapper)).toBe(
      'http://pbgui.test:8000/api/dashboard/editor_page?name=Draft&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi&view_only=1'
    );
    expect(wrapper.find('#edit-mode-banner').classes()).not.toContain('visible');
  });

  it('pbgui_editor_cancelled with original_name loads the original view', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();
    await wrapper.find('#sb-edit').trigger('click');
    expect(frameSrc(wrapper)).toContain('standalone=1');

    await message({ type: 'pbgui_editor_cancelled', original_name: 'a' });
    await flushPromises();

    expect(frameSrc(wrapper)).toContain('name=a');
    expect(frameSrc(wrapper)).toContain('view_only=1');
    expect(wrapper.find('#edit-mode-banner').classes()).not.toContain('visible');
  });

  it('pbgui_editor_cancelled without a name resets the frame', async () => {
    const list = ['a'];
    dashboardsApi(list);
    const wrapper = mountApp();
    await flushPromises();

    // Delete the current dashboard to reach the legacy currentDash === '' state,
    // then cancel with no original_name: the frame must stay reset.
    await wrapper.find('.sb-item[data-name="a"]').trigger('click');
    await wrapper.find('#sb-del').trigger('click');
    await wrapper.find('#del-ok').trigger('click');
    await flushPromises();

    await message({ type: 'pbgui_editor_cancelled' });

    expect(frameSrc(wrapper)).toBe('');
    expect(wrapper.find('#content-frame').classes()).not.toContain('visible');
  });

  it('ignores non-object message data', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();
    const srcBefore = frameSrc(wrapper);

    message('nope');

    expect(frameSrc(wrapper)).toBe(srcBefore);
  });

  it('pbgui_resize_start/end lock and unlock page scroll', async () => {
    dashboardsApi([]);
    mountApp();
    await flushPromises();

    await message({ type: 'pbgui_resize_start' });
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');

    await message({ type: 'pbgui_resize_end' });
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
  });

  it('pbgui_dashboard_created refreshes and loads the created dashboard', async () => {
    const list = ['a'];
    dashboardsApi(list);
    const wrapper = mountApp();
    await flushPromises();

    list.push('Made');
    await message({ type: 'pbgui_dashboard_created', name: 'Made' });
    await flushPromises();

    expect(frameSrc(wrapper)).toContain('name=Made');
    expect(frameSrc(wrapper)).toContain('view_only=1');
  });
});

describe('view-save button', () => {
  it('appears after the templates button on pbgui_view_dirty and posts the save trigger', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();
    const post = framePost(wrapper);
    expect(wrapper.find('#sb-view-save').exists()).toBe(false);

    await message({ type: 'pbgui_view_dirty' });

    const saveBtn = wrapper.find('#sb-view-save');
    expect(saveBtn.exists()).toBe(true);
    expect(saveBtn.attributes('title')).toBe('Save view layout');
    expect(saveBtn.element.previousElementSibling?.id).toBe('sb-templates');

    await saveBtn.trigger('click');
    expect(post).toHaveBeenCalledWith({ type: 'pbgui_trigger_view_save' }, '*');
  });

  it('disappears on pbgui_view_saved', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();

    await message({ type: 'pbgui_view_dirty' });
    expect(wrapper.find('#sb-view-save').exists()).toBe(true);

    await message({ type: 'pbgui_view_saved' });
    expect(wrapper.find('#sb-view-save').exists()).toBe(false);
  });

  it('is hidden in edit mode', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();
    await message({ type: 'pbgui_view_dirty' });
    expect(wrapper.find('#sb-view-save').exists()).toBe(true);

    await wrapper.find('#sb-edit').trigger('click');

    expect(wrapper.find('#sb-view-save').exists()).toBe(false);
  });
});

describe('templates overlay', () => {
  it('templates button opens the overlay with the templates url', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();

    await wrapper.find('#sb-templates').trigger('click');

    expect(wrapper.find('#tpl-overlay').isVisible()).toBe(true);
    expect(wrapper.find('#tpl-iframe').attributes('src')).toBe(
      'http://pbgui.test:8000/api/dashboard/templates_page?current=B&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi'
    );
  });

  it('pbgui_close_templates closes the overlay and clears the iframe', async () => {
    dashboardsApi(['a', 'B']);
    const wrapper = mountApp('en', '?current=B');
    await flushPromises();
    await wrapper.find('#sb-templates').trigger('click');
    expect(wrapper.find('#tpl-overlay').isVisible()).toBe(true);

    await message({ type: 'pbgui_close_templates' });

    expect(wrapper.find('#tpl-overlay').isVisible()).toBe(false);
    expect(wrapper.find('#tpl-iframe').attributes('src')).toBe('');
  });

  it('pbgui_dashboard_created closes the templates overlay', async () => {
    const list = ['a'];
    dashboardsApi(list);
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.find('#sb-templates').trigger('click');
    expect(wrapper.find('#tpl-overlay').isVisible()).toBe(true);

    list.push('FromTpl');
    await message({ type: 'pbgui_dashboard_created', name: 'FromTpl' });
    await flushPromises();

    expect(wrapper.find('#tpl-overlay').isVisible()).toBe(false);
    expect(wrapper.find('#tpl-iframe').attributes('src')).toBe('');
    expect(frameSrc(wrapper)).toContain('name=FromTpl');
  });
});

describe('sidebar resize', () => {
  it('clamps the sidebar width between 160 and 420 while dragging', async () => {
    dashboardsApi([]);
    const wrapper = mountApp();
    await flushPromises();
    const sidebar = wrapper.find('#sidebar').element as HTMLElement;

    await wrapper.find('#sidebar-resize').trigger('mousedown', { clientX: 200 });
    expect(document.body.style.cursor).toBe('col-resize');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 800, bubbles: true }));
    expect(sidebar.style.width).toBe('420px');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, bubbles: true }));
    expect(sidebar.style.width).toBe('160px');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, bubbles: true }));
    expect(sidebar.style.width).toBe('160px');
    expect(document.body.style.cursor).toBe('');
  });
});
