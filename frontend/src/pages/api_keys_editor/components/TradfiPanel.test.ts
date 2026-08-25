import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { pickSelectOption } from '@/shared/testing/select';
import TradfiPanel from './TradfiPanel.vue';
import { TOASTS_KEY, useToasts } from '../composables/useToasts';
import { useTradfi } from '../composables/useTradfi';

/* Provenance: TradFi section api_keys_editor.html:2499-3089 — profile table
   selection (:2803-2850), provider change (:2742-2788), reveal (:2697-2740),
   save intent (:2568-2610, :2959-3023), yfinance (:2852-2921). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();
const i18n = createI18n('en');

const PROFILES = {
  providers: ['alpaca', 'polygon'],
  provider_notes: { alpaca: 'Alpaca: free 5y history', polygon: 'Polygon: 2y free' },
  provider_links: { alpaca: { url: 'https://app.alpaca.markets/x', label: 'Get free Alpaca API key' } },
  needs_secret: ['alpaca'],
  profiles: [
    {
      id: 'p1', provider: 'alpaca', label: 'main', active: true, shared: true, generation: 2,
      has_api_key: true, has_api_secret: true, origin: 'local', pending: false, pending_delete: false,
      pending_stage: '', pending_operation_id: '', last_operation_id: 'op-old', replicated_active: true,
      activation_generation: 2, updated_at: '2026-08-01T10:00:00',
    },
    {
      id: 'p2', provider: 'polygon', label: 'backup', active: false, shared: false, generation: 1,
      has_api_key: false, has_api_secret: false, origin: 'replica', pending: false, pending_delete: false,
      pending_stage: '', pending_operation_id: '', last_operation_id: '', replicated_active: false,
      activation_generation: 0, updated_at: '2026-07-01T10:00:00',
    },
  ],
  replicated_active_profiles: { alpaca: { profile_id: 'p1' } },
  projection: { status: 'current', desired_generation: 2, applied_generation: 2, attempts: 1 },
};

function mountPanel() {
  const toasts = useToasts((key, params) => i18n.global.t(key, params ?? {}));
  const store = useTradfi((key, params) => i18n.global.t(key, params ?? {}), toasts);
  const wrapper = mount(TradfiPanel, {
    global: { plugins: [i18n], provide: { [TOASTS_KEY as symbol]: toasts } },
    props: { store },
    attachTo: document.body,
  });
  return { wrapper, toasts, store };
}

beforeEach(() => {
  (window as unknown as { PBGuiDialogs?: unknown }).PBGuiDialogs = { confirm: vi.fn(async () => true) };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url).replace('http://pbgui.test:8000/api/api-keys', '');
    const method = (init?.method as string) || 'GET';
    if (u === '/tradfi/profiles') return Promise.resolve(new Response(JSON.stringify(PROFILES), { status: 200 }));
    if (u === '/tradfi/yfinance/status') return Promise.resolve(new Response(JSON.stringify({ installed: true, version: '0.2.40' }), { status: 200 }));
    if (u === '/tradfi/reveal') return Promise.resolve(new Response(JSON.stringify({ value: 'VAULT-KEY' }), { status: 200 }));
    if (u === '/tradfi/config' && method === 'PUT')
      return Promise.resolve(new Response(JSON.stringify({ status: 'saved', profile: PROFILES.profiles![0] }), { status: 200 }));
    if (u === '/tradfi/test') return Promise.resolve(new Response(JSON.stringify({ success: true, message: 'OK - 12 candles' }), { status: 200 }));
    if (String(url) === '/api/notify_log') return Promise.resolve(new Response('{}', { status: 200 }));
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TradfiPanel', () => {
  it('renders profiles and selects the explicit-active one on load (:2649-2653)', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    const rows = wrapper.findAll('#tradfiProfilesBody tr[data-profile-id]');
    expect(rows).toHaveLength(2);
    // p1 is the explicitly active profile → selected
    expect(rows[0]!.classes()).toContain('selected');
    expect(rows[0]!.text()).toContain('Active');
    expect(rows[0]!.text()).toContain('Selected (gen 2)');
    expect((wrapper.find('#tradfiProfileId').element as HTMLInputElement).value).toBe('p1');
    expect(wrapper.find('#tradfiProfileStatus').text()).toContain('Selected vault profile p1');
    expect(wrapper.find('#tradfiProjectionStatus').text()).toContain('current');
  });

  it('populates the form when a row is selected and swaps provider UI (:2742-2888)', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    await wrapper.findAll('#tradfiProfilesBody tr[data-profile-id]')[1]!.trigger('click');
    await flushPromises();
    expect((wrapper.find('#tradfiProfileId').element as HTMLInputElement).value).toBe('p2');
    // reka listbox: the closed-state trigger renders the model value as text
    expect(wrapper.find('#tradfiProvider').text()).toBe('polygon');
    expect((wrapper.find('#tradfiLabel').element as HTMLInputElement).value).toBe('backup');
    expect(wrapper.find('#tradfiProviderNote').text()).toContain('Polygon: 2y free');
    // provider link hidden for polygon (no link registered)
    expect(wrapper.find('#tradfiProviderLink').isVisible()).toBe(false);

    await pickSelectOption(wrapper, '#tradfiProvider', 'alpaca');
    expect(wrapper.find('#tradfiProviderLink').attributes('href')).toBe('https://app.alpaca.markets/x');
    expect((wrapper.find('#tradfiApiSecret').element as HTMLInputElement).disabled).toBe(false);

    await pickSelectOption(wrapper, '#tradfiProvider', 'polygon');
    expect((wrapper.find('#tradfiApiSecret').element as HTMLInputElement).disabled).toBe(true);
    expect((wrapper.find('#tradfiApiSecret').element as HTMLInputElement).placeholder).toBe('not required');
  });

  it('reveals the stored vault key through the eye toggle and clears it on reselect (:2697-2740)', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    await wrapper.find('#tradfiApiKey').trigger('click'); // focus-safe: use the eye button
    const eye = wrapper.find('#tradfiPanel .pw-eye-btn');
    expect(eye.exists()).toBe(true);
    await eye.trigger('click');
    await flushPromises();

    const reveal = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/tradfi/reveal') && i?.method === 'POST');
    expect(JSON.parse(String(reveal![1]!.body))).toEqual({ profile_id: 'p1' });
    expect((wrapper.find('#tradfiApiKey').element as HTMLInputElement).value).toBe('VAULT-KEY');
    expect((wrapper.find('#tradfiApiKey').element as HTMLInputElement).type).toBe('text');

    // selecting another profile clears the revealed value (:2828-2845)
    await wrapper.findAll('#tradfiProfilesBody tr[data-profile-id]')[1]!.trigger('click');
    expect((wrapper.find('#tradfiApiKey').element as HTMLInputElement).value).toBe('');
    expect((wrapper.find('#tradfiApiKey').element as HTMLInputElement).type).toBe('password');
  });

  it('saves with an operation id and the exact legacy payload (:2959-3023)', async () => {
    const { wrapper, toasts } = mountPanel();
    await flushPromises();

    await wrapper.find('#tradfiApiKey').setValue('NEWKEY');
    await wrapper.find('#btnTradfiRotate').trigger('click'); // rotate requires a key
    await flushPromises();

    const put = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/tradfi/config') && i?.method === 'PUT');
    expect(put).toBeTruthy();
    const body = JSON.parse(String(put![1]!.body)) as Record<string, unknown>;
    expect(body.profile_id).toBe('p1');
    expect(body.provider).toBe('alpaca');
    expect(body.label).toBe('main');
    expect(body.active).toBe(true);
    expect(body.shared).toBe(true);
    expect(body.api_key).toBe('NEWKEY');
    expect(body.api_secret).toBeNull();
    expect(typeof body.operation_id).toBe('string');
    expect(body.operation_id).not.toBe('');
    expect(body.create_new).toBe(false);
    expect(toasts.toasts.value.some((toast) => toast.message.includes('saved'))).toBe(true);
  });

  it('blocks save when no key is entered and none is stored (:2973-2975)', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    await wrapper.findAll('#tradfiProfilesBody tr[data-profile-id]')[1]!.trigger('click'); // p2 has no key
    const save = wrapper.find('#btnTradfiSave');
    await save.trigger('click');
    await flushPromises();

    const put = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/tradfi/config') && i?.method === 'PUT');
    expect(put).toBeUndefined();
  });

  it('shows the yfinance status with version (:2852-2877)', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();

    expect(wrapper.find('#yfStatus').text()).toContain('yfinance 0.2.40 installed');
    expect(wrapper.find('#btnYfInstall').text()).toBe('Uninstall');
    expect(wrapper.find('#btnYfTest').isVisible()).toBe(true);
  });
});
