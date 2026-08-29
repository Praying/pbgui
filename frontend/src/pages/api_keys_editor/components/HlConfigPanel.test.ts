import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import HlConfigPanel from './HlConfigPanel.vue';
import { TOASTS_KEY, useToasts } from '../composables/useToasts';

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();
const i18n = createI18n('en');

function mountPanel() {
  const toasts = useToasts((key, params) => i18n.global.t(key, params ?? {}));
  const wrapper = mount(HlConfigPanel, {
    global: { plugins: [i18n], provide: { [TOASTS_KEY as symbol]: toasts } },
    attachTo: document.body,
  });
  return { wrapper, toasts };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    if (!String(url).endsWith('/hl-expiry/config')) return Promise.resolve(new Response('{}', { status: 200 }));
    if ((init?.method || 'GET') === 'PUT') {
      return Promise.resolve(new Response(JSON.stringify({ telegram_warning_days: 14, configured: true }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ telegram_warning_days: 7, configured: false }), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('HlConfigPanel', () => {
  it('renders the current status and warning-window hierarchy', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    expect(wrapper.find('.hl-warning-page-head').exists()).toBe(true);
    expect(wrapper.find('#hl-warning-status-title').text()).toBe('Current configuration');
    expect(wrapper.find('#hl-warning-window-title').text()).toBe('Warning window');
    expect(wrapper.find('#hlWarningConfigStatus').text()).toContain('Not configured in pbgui.ini');
    expect((wrapper.find('#hlWarningDays').element as HTMLInputElement).value).toBe('7');
    expect(wrapper.find('label').attributes('for')).toBe('hlWarningDays');
  });

  it('validates the threshold before saving', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    await wrapper.find('#hlWarningDays').setValue('0');
    await wrapper.find('footer button').trigger('click');
    await flushPromises();

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
    expect((wrapper.find('#hlWarningDays').element as HTMLInputElement).value).toBe('0');
    expect(wrapper.find('footer button').attributes('disabled')).toBeUndefined();
  });

  it('saves the threshold and updates the configured status', async () => {
    const { wrapper, toasts } = mountPanel();
    await flushPromises();

    await wrapper.find('#hlWarningDays').setValue('14');
    await wrapper.find('footer button').trigger('click');
    await flushPromises();

    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(putCall![1]!.body))).toEqual({ telegram_warning_days: 14 });
    expect(wrapper.find('#hlWarningConfigStatus').text()).toContain('Configured in pbgui.ini');
    expect(toasts.toasts.value.some((toast) => toast.message.includes('saved'))).toBe(true);
  });
});
