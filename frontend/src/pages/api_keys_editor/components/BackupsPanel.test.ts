import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import BackupsPanel from './BackupsPanel.vue';
import { TOASTS_KEY, useToasts } from '../composables/useToasts';

/* Provenance: backup list/selection/drag :3091-3246, diff modal :3270-3420,
   restore :3153-3171. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();
const i18n = createI18n('en');

const BACKUPS = [
  { filename: '_current_pb7', ts: '2026-08-17T10:00:00', size_kb: 1.5, target: 'pb7' },
  { filename: 'api-keys7_20260816_100000.json', ts: '2026-08-16T10:00:00', size_kb: 1.2, target: 'pb7' },
  { filename: 'api-keys7_20260815_100000.json', ts: '2026-08-15T10:00:00', size_kb: 1.1, target: 'pb7' },
];

function mountPanel() {
  const toasts = useToasts((key, params) => i18n.global.t(key, params ?? {}));
  const wrapper = mount(BackupsPanel, {
    global: { plugins: [i18n], provide: { [TOASTS_KEY as symbol]: toasts } },
    attachTo: document.body,
  });
  return { wrapper, toasts };
}

beforeEach(() => {
  (window as Window & { PBGuiDialogs?: { confirm: ReturnType<typeof vi.fn> } }).PBGuiDialogs = { confirm: vi.fn(async () => true) };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url).replace('http://pbgui.test:8000/api/api-keys', '');
    const method = (init?.method as string) || 'GET';
    if (u === '/backups' && method === 'GET') return Promise.resolve(new Response(JSON.stringify(BACKUPS), { status: 200 }));
    if (u === '/backups/restore')
      return Promise.resolve(new Response(JSON.stringify({ restored_to: ['pb7'] }), { status: 200 }));
    if (u === '/backups/diff') {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            filename1: body.filename1,
            filename2: body.filename2,
            lines1: ['{', '  "a": 1', '}'],
            lines2: ['{', '  "a": 2', '}'],
            opcodes: [
              ['equal', 0, 1, 0, 1],
              ['replace', 1, 2, 1, 2],
              ['equal', 2, 3, 2, 3],
            ],
          }),
          { status: 200 }
        )
      );
    }
    if (String(url) === '/api/notify_log') return Promise.resolve(new Response('{}', { status: 200 }));
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function selectRow(wrapper: ReturnType<typeof mount>, filename: string) {
  const row = wrapper.find(`.backup-row[data-backup-fn="${filename}"]`);
  await row.trigger('mousedown', { button: 0 });
  document.dispatchEvent(new MouseEvent('mouseup'));
  await flushPromises();
}

describe('BackupsPanel', () => {
  it('lists backups with size and target (:3124-3151)', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    const rows = wrapper.findAll('.backup-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain('_current_pb7');
    expect(rows[1]!.text()).toContain('1.2 KB');
    expect(wrapper.find('#btnDiffSelected').attributes('disabled')).toBeDefined();
  });

  it('requires exactly two selected rows to compare (:3179-3205)', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    await selectRow(wrapper, BACKUPS[0]!.filename);
    expect(wrapper.find(`.backup-row[data-backup-fn="${BACKUPS[0]!.filename}"]`).classes()).toContain('selected');
    expect(wrapper.find('#btnDiffSelected').attributes('disabled')).toBeDefined();

    await selectRow(wrapper, BACKUPS[1]!.filename);
    expect(wrapper.find('#btnDiffSelected').attributes('disabled')).toBeUndefined();
  });

  it('opens the diff modal and renders unified then side-by-side (:3270-3420)', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    await selectRow(wrapper, BACKUPS[0]!.filename);
    await selectRow(wrapper, BACKUPS[1]!.filename);
    await wrapper.find('#btnDiffSelected').trigger('click');
    await flushPromises();

    const diff = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/backups/diff') && i?.method === 'POST');
    expect(JSON.parse(String(diff![1]!.body))).toEqual({
      filename1: '_current_pb7',
      filename2: 'api-keys7_20260816_100000.json',
    });
    expect(wrapper.find('#diffModal').isVisible()).toBe(true);
    expect(wrapper.find('#diffTitle').text()).toContain('Current (live) pb7');
    const unifiedRows = wrapper.findAll('#diffContent tr.diff-add, #diffContent tr.diff-del');
    expect(unifiedRows).toHaveLength(2); // one del + one add for the replace

    await wrapper.find('#btnDiffSide').trigger('click');
    expect(wrapper.findAll('#diffContent .diff-side-col')).toHaveLength(2);
    expect(wrapper.find('#diffContent .diff-side-hdr').text()).toContain('_current_pb7');

    await wrapper.find('#diffModal [data-slot="button"]').trigger('click'); // Back closes (first button in the header)
    expect(wrapper.find('#diffModal').isVisible()).toBe(false);
  });

  it('shows the identical-files view when nothing differs (:3309-3319)', async () => {
    fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url).replace('http://pbgui.test:8000/api/api-keys', '');
      if (u === '/backups/diff') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              filename1: 'a',
              filename2: 'b',
              lines1: ['x'],
              lines2: ['x'],
              opcodes: [['equal', 0, 1, 0, 1]],
            }),
            { status: 200 }
          )
        );
      }
      if (u === '/backups') return Promise.resolve(new Response(JSON.stringify(BACKUPS), { status: 200 }));
      void init;
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    const { wrapper } = mountPanel();
    await flushPromises();

    await selectRow(wrapper, BACKUPS[0]!.filename);
    await selectRow(wrapper, BACKUPS[1]!.filename);
    await wrapper.find('#btnDiffSelected').trigger('click');
    await flushPromises();

    expect(wrapper.find('#diffContent').text()).toContain('Files are identical');
    expect(wrapper.find('#diffContent').text()).toContain('1 lines');
  });

  it('restores a backup after confirm (:3153-3171)', async () => {
    const { wrapper, toasts } = mountPanel();
    await flushPromises();

    await wrapper.find('.backup-row[data-backup-fn="api-keys7_20260816_100000.json"] .backup-restore-btn').trigger('click');
    await flushPromises();

    expect((window as Window & { PBGuiDialogs?: { confirm: ReturnType<typeof vi.fn> } }).PBGuiDialogs!.confirm).toHaveBeenCalled();
    const restore = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/backups/restore') && i?.method === 'POST');
    expect(JSON.parse(String(restore![1]!.body))).toEqual({ filename: 'api-keys7_20260816_100000.json' });
    expect(toasts.toasts.value.some((toast) => toast.message.includes('Restored from'))).toBe(true);
  });
});
