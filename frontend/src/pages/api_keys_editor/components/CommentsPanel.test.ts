import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import CommentsPanel from './CommentsPanel.vue';
import { TOASTS_KEY, useToasts } from '../composables/useToasts';

/* Provenance: loadComments/showAddComment/createComment/updateComment/deleteComment
   api_keys_editor.html:2326-2429. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();
const i18n = createI18n('en');

function mountPanel() {
  const toasts = useToasts((key, params) => i18n.global.t(key, params ?? {}));
  const wrapper = mount(CommentsPanel, {
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
    if (u === '/comments/list' && method === 'GET')
      return Promise.resolve(
        new Response(JSON.stringify([{ key: '_comment_a', value: 'hello' }, { key: '_comment_b', value: 'world' }]), { status: 200 })
      );
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('CommentsPanel', () => {
  it('lists comment fields with editable values (:2348-2372)', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    const rows = wrapper.findAll('#commentsBody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.find('code').text()).toBe('_comment_a');
    expect((rows[0]!.find('input.comment-val').element as HTMLInputElement).value).toBe('hello');
  });

  it('creates a comment via POST and reloads (:2385-2400)', async () => {
    const { wrapper, toasts } = mountPanel();
    await flushPromises();

    await wrapper.find('#commentsPanel .btn-primary.btn-sm').trigger('click'); // + Add
    expect(wrapper.find('#addCommentForm').isVisible()).toBe(true);
    await wrapper.find('#newCommentKey').setValue('notes');
    await wrapper.find('#newCommentValue').setValue('my note');
    await wrapper.find('#addCommentForm .btn-primary').trigger('click');
    await flushPromises();

    const post = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/comments/list') && i?.method === 'POST');
    expect(JSON.parse(String(post![1]!.body))).toEqual({ key: 'notes', value: 'my note' });
    expect(toasts.toasts.value.some((toast) => toast.message.includes('Comment created'))).toBe(true);
    expect(wrapper.find('#addCommentForm').isVisible()).toBe(false);
  });

  it('updates a comment value via PUT (:2402-2414)', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    await wrapper.findAll('input.comment-val')[0]!.setValue('changed');
    await wrapper.findAll('#commentsBody .btn-primary')[0]!.trigger('click');
    await flushPromises();

    const put = fetchMock.mock.calls.find(([u, i]) => String(u).includes('/comments/list/_comment_a') && i?.method === 'PUT');
    expect(JSON.parse(String(put![1]!.body))).toEqual({ value: 'changed' });
  });

  it('deletes a comment after confirm (:2416-2429)', async () => {
    const { wrapper, toasts } = mountPanel();
    await flushPromises();

    await wrapper.findAll('#commentsBody .btn-danger')[0]!.trigger('click');
    await flushPromises();

    expect((window as Window & { PBGuiDialogs?: { confirm: ReturnType<typeof vi.fn> } }).PBGuiDialogs!.confirm).toHaveBeenCalled();
    const del = fetchMock.mock.calls.find(([u, i]) => String(u).includes('/comments/list/_comment_a') && i?.method === 'DELETE');
    expect(del).toBeTruthy();
    expect(toasts.toasts.value.some((toast) => toast.message.includes('Comment deleted'))).toBe(true);
  });
});
