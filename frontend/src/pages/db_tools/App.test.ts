import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { getBoot } from '@/shared/boot';
import App from './App.vue';

/* Page-shell integration: panels render and switch, the select lists toggle,
   preview→confirm→run flows gate destructive actions. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();

const TARGETS = { targets: [{ id: 'local', label: 'Master' }, { id: 'replica', label: 'Replica' }] };

async function mountApp() {
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return wrapper;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/db-tools/main_page');
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/targets')) return Promise.resolve(new Response(JSON.stringify(TARGETS), { status: 200 }));
    if (u.includes('/users?')) {
      return Promise.resolve(
        new Response(JSON.stringify({ users: [{ user: 'alice', total: 3 }, { user: 'bob', total: 5 }] }), { status: 200 })
      );
    }
    if (u.includes('/sync/jobs')) return Promise.resolve(new Response(JSON.stringify({ jobs: [] }), { status: 200 }));
    if (u.includes('/backups?')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            backups: [
              { name: 'db-tools-20240102-030405-cleanup', label: 'cleanup', db_name: 'pbgui.db', size: 2 * 1024 * 1024, mtime: '' },
            ],
          }),
          { status: 200 }
        )
      );
    }
    if (u.includes('/dashboards?')) return Promise.resolve(new Response(JSON.stringify({ dashboards: ['d1'], templates: ['t1'] }), { status: 200 }));
    void init;
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('DB Tools page shell', () => {
  it('renders the six panels with the cleanup panel active and users loaded', async () => {
    const wrapper = await mountApp();

    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.get('#main-content').element.tagName).toBe('DIV');
    expect(wrapper.find('#panel-cleanup').classes()).toContain('active');
    expect(wrapper.find('#panel-backups').classes()).not.toContain('active');
    const rows = wrapper.findAll('#cleanup-users .select-row[data-value]');
    expect(rows.map((row) => row.text())).toContain('alice3 rows');
    expect(document.title).toBe('DB Tools - PBGui');
  });

  it('switches panels through the sidebar', async () => {
    const wrapper = await mountApp();

    await wrapper.find('[data-testid="rail-section-backups"]').trigger('click');
    expect(wrapper.find('#panel-backups').classes()).toContain('active');
    expect(wrapper.find('#backup-total-summary').text()).toContain('1 files');
    const backupRow = wrapper.find('#backup-list .backup-row');
    expect(backupRow.text()).toContain('2024-01-02 03:04:05 UTC');
    expect(backupRow.text()).toContain('2.0 MB');
  });

  it('toggles user selection through the list (plain click)', async () => {
    const wrapper = await mountApp();

    const row = wrapper.findAll('#cleanup-users .select-row[data-value]')[0]!;
    expect(row.classes()).not.toContain('selected');
    await row.trigger('mousedown', { button: 0 });
    document.dispatchEvent(new MouseEvent('mouseup'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(row.classes()).toContain('selected');
  });

  it('previews cleanup and gates run behind the confirm modal', async () => {
    const wrapper = await mountApp();

    await wrapper.findAll('#cleanup-users .select-row[data-value]')[0]!.trigger('mousedown', { button: 0 });
    document.dispatchEvent(new MouseEvent('mouseup'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ users_affected: 1 }), { status: 200 }));
    await wrapper.find('#cleanup-preview').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/cleanup/preview');
    expect(wrapper.find('#cleanup-run').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('#cleanup-status').classes()).toContain('ok');

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ operation: { id: 'op1', status: 'running', percent: 10 } }), { status: 200 }));
    await wrapper.find('#cleanup-run').trigger('click');
    expect(wrapper.find('#confirm-ovl').classes()).toContain('visible');
    expect(fetchMock).not.toHaveBeenCalled(); // gated until confirmed

    await wrapper.find('#confirm-ok').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/cleanup/run');
    expect(wrapper.find('#cleanup-run').attributes('disabled')).toBeDefined();
  });

  it('renders the sync panel with the empty job list and opens the editor for a new job', async () => {
    const wrapper = await mountApp();

    await wrapper.find('[data-testid="rail-section-sync-jobs"]').trigger('click');
    expect(wrapper.find('#sync-job-list').text()).toContain('No sync jobs configured');
    expect(wrapper.find('#sync-editor').classes()).not.toContain('visible');

    await wrapper.find('#sync-new').trigger('click');
    expect(wrapper.find('#sync-editor').classes()).toContain('visible');
    expect(wrapper.find('#sync-editor-title').text()).toBe('New Sync Job');
  });
});
