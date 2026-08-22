import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ApiServerSettings from './ApiServerSettings.vue';
import type { ApiServerSettingsData, AlertRoutingId } from '../types';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: 'Err', json: async () => body } as Response;
}

/** The exact 18 monitor fields legacy collectMonitorConfigFromForm walks. */
const MONITOR_FIELDS = [
  'mem_warning_server', 'mem_error_server', 'swap_warning_server', 'swap_error_server',
  'disk_warning_server', 'disk_error_server', 'cpu_warning_server', 'cpu_error_server',
  'mem_warning_v7', 'mem_error_v7', 'swap_warning_v7', 'swap_error_v7',
  'cpu_warning_v7', 'cpu_error_v7', 'error_warning_v7', 'error_error_v7',
  'traceback_warning_v7', 'traceback_error_v7',
];

const ROUTING_IDS: AlertRoutingId[] = [
  'offline_gui', 'service_gui', 'system_gui', 'instance_gui',
  'ssh_lost_telegram', 'ssh_recovered_telegram',
  'service_down_telegram', 'service_restart_started_telegram', 'service_recovered_telegram',
  'system_problem_telegram', 'system_recovered_telegram',
  'instance_problem_telegram', 'instance_recovered_telegram',
];

/** Realistic GET /settings/api-server payload exercising every branch. */
const SETTINGS: ApiServerSettingsData = {
  host: '10.0.0.5',
  port: 8123,
  auto_restart: false,
  available_hosts: ['vps1.example.com', 'vps2.example.com', 'vps3.example.com'],
  enabled_hosts: ['vps1.example.com', 'vps3.example.com'],
  monitor_config: {
    mem_warning_server: 80, mem_error_server: 92,
    swap_warning_server: 50, swap_error_server: 70,
    disk_warning_server: 85, disk_error_server: 95,
    cpu_warning_server: 75, cpu_error_server: 90,
    mem_warning_v7: 60, mem_error_v7: 80,
    swap_warning_v7: 40, swap_error_v7: 60,
    cpu_warning_v7: 70, cpu_error_v7: 85,
    error_warning_v7: 5, error_error_v7: 10,
    traceback_warning_v7: 1, traceback_error_v7: 3,
  },
  telegram_token: 'tok-secret',
  telegram_chat_id: '-1001234567',
  offline_gui: true,
  service_gui: false,
  ssh_lost_telegram: false,
};

/** Untouched-form save payload — legacy saveApiServerSettings shape (contract). */
const SAVED_PAYLOAD = {
  host: '10.0.0.5',
  port: 8123,
  auto_restart: false,
  enabled_hosts: ['vps1.example.com', 'vps3.example.com'],
  monitor_config: SETTINGS.monitor_config,
  telegram_token: 'tok-secret',
  telegram_chat_id: '-1001234567',
  offline_gui: true,
  service_gui: false,
  system_gui: true,
  instance_gui: true,
  ssh_lost_telegram: false,
  ssh_recovered_telegram: true,
  service_down_telegram: true,
  service_restart_started_telegram: true,
  service_recovered_telegram: true,
  system_problem_telegram: true,
  system_recovered_telegram: true,
  instance_problem_telegram: true,
  instance_recovered_telegram: true,
};

function mountSettings() {
  return mount(ApiServerSettings, { global: { plugins: [createI18n('en')] } });
}

/** mount + load() with a resolved GET payload — the App wiring always loads first. */
async function mountedSettings(data: ApiServerSettingsData = SETTINGS) {
  fetchMock.mockResolvedValue(jsonResponse(data));
  const wrapper = mountSettings();
  await wrapper.vm.load();
  await flushPromises();
  return wrapper;
}

function tagByValue(wrapper: ReturnType<typeof mountSettings>, value: string) {
  const tag = wrapper.find('#vps-hosts-select').findAll('.tag').find((el) => el.attributes('data-value') === value);
  expect(tag, `host tag ${value}`).toBeDefined();
  return tag!;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({}));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiServerSettings loading (legacy loadSettings/applySettings)', () => {
  it('shows the loading placeholder until load() resolves', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const wrapper = mountSettings();
    const pending = wrapper.vm.load();

    expect(wrapper.find('#apiserver-settings-wrap').text()).toBe('Loading settings…');
    expect(wrapper.find('.form-section-title').exists()).toBe(false);

    release(jsonResponse(SETTINGS));
    await pending;
    await flushPromises();
    expect(wrapper.findAll('.form-section-title').map((s) => s.text())).toEqual([
      'Connection',
      'VPS Monitoring',
      'Alerts / Telegram',
    ]);
  });

  it('fetches GET /settings/api-server with auth on load()', async () => {
    await mountedSettings();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pbgui.test:8000/api/services/settings/api-server');
    expect(init.method).toBeUndefined();
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok');
  });

  it('keeps the placeholder when the load fails (legacy silent catch)', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountSettings();
    await wrapper.vm.load();
    await flushPromises();

    expect(wrapper.find('#apiserver-settings-wrap').text()).toBe('Loading settings…');
    expect(wrapper.find('#apiserver-host').exists()).toBe(false);
  });
});

describe('ApiServerSettings Connection section (legacy static markup)', () => {
  it('renders host/port with legacy ids, the literal 0.0.0.0 placeholder and hints', async () => {
    const wrapper = await mountedSettings();

    const host = wrapper.find('#apiserver-host');
    expect(host.attributes('type')).toBe('text');
    expect(host.attributes('placeholder')).toBe('0.0.0.0'); // literal, never i18n'd in legacy
    expect(host.element.closest('.form-field')!.querySelector('.form-hint')!.textContent).toBe(
      'Requires restart to take effect'
    );
    expect((host.element as HTMLInputElement).value).toBe('10.0.0.5');

    const port = wrapper.find('#apiserver-port');
    expect(port.attributes('type')).toBe('number');
    expect(port.attributes('min')).toBe('1024');
    expect(port.attributes('max')).toBe('65535');
    expect(port.attributes('step')).toBe('1');
    expect((port.element as HTMLInputElement).value).toBe('8123');
    expect(port.element.closest('.form-field')!.querySelector('.form-hint')!.textContent).toBe('Default: 8000');
  });

  it('falls back to 0.0.0.0 / 8000 when the payload omits host/port (legacy || fallbacks)', async () => {
    const wrapper = await mountedSettings({});

    expect((wrapper.find('#apiserver-host').element as HTMLInputElement).value).toBe('0.0.0.0');
    expect((wrapper.find('#apiserver-port').element as HTMLInputElement).value).toBe('8000');
  });
});

describe('ApiServerSettings VPS Monitoring section (legacy renderVpsHosts + monitor grid)', () => {
  it('renders the auto-restart checkbox checked unless auto_restart === false', async () => {
    const wrapper = await mountedSettings();

    expect((wrapper.find('#apiserver-auto-restart').element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.find('label[for="apiserver-auto-restart"]').text()).toBe('Auto-restart services');

    const on = await mountedSettings({ ...SETTINGS, auto_restart: true });
    expect((on.find('#apiserver-auto-restart').element as HTMLInputElement).checked).toBe(true);

    const missing = await mountedSettings({ ...SETTINGS, auto_restart: undefined });
    expect((missing.find('#apiserver-auto-restart').element as HTMLInputElement).checked).toBe(true);
  });

  it('renders monitored host tags with active/inactive per enabled_hosts, no filter input', async () => {
    const wrapper = await mountedSettings();

    expect(wrapper.find('#vps-hosts-select').exists()).toBe(true);
    expect(wrapper.find('#vps-hosts-select').element.querySelector('input')).toBeNull(); // filterable=false
    expect(tagByValue(wrapper, 'vps1.example.com').classes()).not.toContain('inactive');
    expect(tagByValue(wrapper, 'vps2.example.com').classes()).toContain('inactive');
    expect(tagByValue(wrapper, 'vps3.example.com').classes()).not.toContain('inactive');
    const hostsLabel = wrapper.find('.hosts-field .form-label');
    expect(hostsLabel.text()).toContain('Monitored VPS Hosts');
    expect(hostsLabel.text()).toContain('(click to toggle)');
  });

  it('shows the no-VPS-hosts empty state when available_hosts is empty', async () => {
    const wrapper = await mountedSettings({ ...SETTINGS, available_hosts: [], enabled_hosts: [] });

    expect(wrapper.find('#vps-hosts-select .multiselect-empty').text()).toBe('No VPS hosts configured');
    expect(wrapper.findAll('#vps-hosts-select .tag')).toHaveLength(0);
  });

  it('renders the 18 monitor threshold inputs seeded from monitor_config', async () => {
    const wrapper = await mountedSettings();

    for (const field of MONITOR_FIELDS) {
      const input = wrapper.find(`#mc-${field}`);
      expect(input.exists(), field).toBe(true);
      expect((input.element as HTMLInputElement).value).toBe(String(SETTINGS.monitor_config![field]));
    }
  });

  it('renders monitor inputs as 0 when monitor_config is missing keys', async () => {
    const wrapper = await mountedSettings({ ...SETTINGS, monitor_config: { mem_warning_server: 80 } });

    for (const field of MONITOR_FIELDS.filter((f) => f !== 'mem_warning_server')) {
      expect((wrapper.find(`#mc-${field}`).element as HTMLInputElement).value, field).toBe('0');
    }
  });
});

describe('ApiServerSettings Alerts/Telegram section (legacy markup + togglePw)', () => {
  it('renders the bot token as a password input with the paste-token placeholder', async () => {
    const wrapper = await mountedSettings();

    const token = wrapper.find('#apiserver-telegram-token');
    expect(token.attributes('type')).toBe('password');
    expect(token.attributes('placeholder')).toBe('Paste token…');
    expect(token.attributes('autocomplete')).toBe('off');
    expect((token.element as HTMLInputElement).value).toBe('tok-secret');

    const eye = wrapper.find('.pw-eye');
    expect(eye.find('svg').exists()).toBe(true);
    expect(eye.attributes('title')).toBe('Show/hide');
  });

  it('toggles the token input to text and lights the eye button (legacy togglePw)', async () => {
    const wrapper = await mountedSettings();
    const eye = wrapper.find('.pw-eye');

    await eye.trigger('click');
    expect(wrapper.find('#apiserver-telegram-token').attributes('type')).toBe('text');
    expect((eye.element as HTMLElement).style.color).toBe('rgb(147, 197, 253)'); // #93c5fd

    await eye.trigger('click');
    expect(wrapper.find('#apiserver-telegram-token').attributes('type')).toBe('password');
    expect((eye.element as HTMLElement).style.color).toBe('');
  });

  it('renders the chat id input with the legacy placeholder and value', async () => {
    const wrapper = await mountedSettings();

    const chat = wrapper.find('#apiserver-telegram-chat-id');
    expect(chat.attributes('type')).toBe('text');
    expect(chat.attributes('placeholder')).toBe('e.g. -1001234567');
    expect((chat.element as HTMLInputElement).value).toBe('-1001234567');
  });

  it('renders the alert routing checkboxes with false flags unchecked', async () => {
    const wrapper = await mountedSettings();

    expect((wrapper.find('#service_gui').element as HTMLInputElement).checked).toBe(false);
    expect((wrapper.find('#ssh_lost_telegram').element as HTMLInputElement).checked).toBe(false);
    expect((wrapper.find('#offline_gui').element as HTMLInputElement).checked).toBe(true);
    expect((wrapper.find('#ssh_recovered_telegram').element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.findAll('.alert-routing-group')).toHaveLength(4);
  });

  it('renders the save button with the legacy disk icon', async () => {
    const wrapper = await mountedSettings();

    expect(wrapper.find('button.form-btn.save').text()).toBe('Save');
    expect(wrapper.find('button.form-btn.save svg').exists()).toBe(true);
  });
});

describe('ApiServerSettings save (legacy saveApiServerSettings/_post)', () => {
  async function saveAndGetBody(wrapper: ReturnType<typeof mountSettings>): Promise<Record<string, unknown>> {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe('http://pbgui.test:8000/api/services/settings/api-server');
    expect(init.method).toBe('POST');
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
    return JSON.parse(init.body as string);
  }

  it('POSTs the exact legacy payload for untouched form state', async () => {
    const wrapper = await mountedSettings();

    expect(await saveAndGetBody(wrapper)).toEqual(SAVED_PAYLOAD);
  });

  it('sends only the enabled host tags in options order after toggling', async () => {
    const wrapper = await mountedSettings();
    await tagByValue(wrapper, 'vps1.example.com').trigger('click'); // off
    await tagByValue(wrapper, 'vps2.example.com').trigger('click'); // on

    const body = await saveAndGetBody(wrapper);
    expect(body.enabled_hosts).toEqual(['vps2.example.com', 'vps3.example.com']);
  });

  it('reflects edited connection fields, auto-restart and telegram inputs', async () => {
    const wrapper = await mountedSettings();
    await wrapper.find('#apiserver-host').setValue('127.0.0.1');
    await wrapper.find('#apiserver-port').setValue('9999');
    await wrapper.find('#apiserver-auto-restart').setValue(true);
    await wrapper.find('#apiserver-telegram-token').setValue('new-token');
    await wrapper.find('#apiserver-telegram-chat-id').setValue('-42');

    const body = await saveAndGetBody(wrapper);
    expect(body).toMatchObject({
      host: '127.0.0.1',
      port: 9999,
      auto_restart: true,
      telegram_token: 'new-token',
      telegram_chat_id: '-42',
    });
  });

  it('applies the empty host/port fallbacks (legacy || 0.0.0.0 / 8000)', async () => {
    const wrapper = await mountedSettings();
    await wrapper.find('#apiserver-host').setValue('');
    await wrapper.find('#apiserver-port').setValue('');

    const body = await saveAndGetBody(wrapper);
    expect(body.host).toBe('0.0.0.0');
    expect(body.port).toBe(8000);
  });

  it('collects edited monitor thresholds and turns cleared inputs into 0 (parseFloat||0)', async () => {
    const wrapper = await mountedSettings();
    await wrapper.find('#mc-mem_warning_server').setValue('90.5');
    await wrapper.find('#mc-traceback_error_v7').setValue('');

    const body = await saveAndGetBody(wrapper);
    expect((body.monitor_config as Record<string, number>).mem_warning_server).toBe(90.5);
    expect((body.monitor_config as Record<string, number>).traceback_error_v7).toBe(0);
    // untouched fields still collected
    expect((body.monitor_config as Record<string, number>).cpu_error_server).toBe(90);
  });

  it('collects missing monitor keys as 0', async () => {
    const wrapper = await mountedSettings({ ...SETTINGS, monitor_config: {} });

    const body = await saveAndGetBody(wrapper);
    expect(body.monitor_config).toEqual(Object.fromEntries(MONITOR_FIELDS.map((f) => [f, 0])));
  });

  it('collects toggled alert routing flags', async () => {
    const wrapper = await mountedSettings();
    await wrapper.find('#system_gui').setValue(false);
    await wrapper.find('#ssh_lost_telegram').setValue(true);

    const body = await saveAndGetBody(wrapper);
    expect(body.system_gui).toBe(false);
    expect(body.ssh_lost_telegram).toBe(true);
    expect(body.service_gui).toBe(false); // untouched payload flag survives
  });

  it('always sends all 13 routing ids', async () => {
    const wrapper = await mountedSettings();

    const body = await saveAndGetBody(wrapper);
    for (const id of ROUTING_IDS) expect(body, id).toHaveProperty(id);
    expect(Object.keys(body).filter((k) => ROUTING_IDS.includes(k as AlertRoutingId))).toHaveLength(13);
  });

  it('flashes the apply message on success (legacy _post d.ok path)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, apply: { message: 'restart api-server to apply' } }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    const msg = wrapper.find('#apiserver-save-msg');
    expect(msg.text()).toBe('restart api-server to apply');
    expect(msg.classes()).toContain('visible');
    expect(msg.classes()).not.toContain('error');
  });

  it('flashes common.saved when the response has no apply message', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#apiserver-save-msg').text()).toBe('Saved');
  });

  it('flashes the server detail error when ok is falsy (legacy d.detail branch)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, detail: 'invalid host' }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    const msg = wrapper.find('#apiserver-save-msg');
    expect(msg.text()).toBe('invalid host');
    expect(msg.classes()).toContain('error');
  });

  it('flashes the error detail for HTTP failures (legacy non-ok JSON body)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'boom' }, 500));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#apiserver-save-msg').text()).toBe('boom');
    expect(wrapper.find('#apiserver-save-msg').classes()).toContain('error');
  });

  it('flashes the errorPrefix message on network failure (legacy catch)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockRejectedValue(new TypeError('network down'));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#apiserver-save-msg').text()).toBe('Error: network down');
    expect(wrapper.find('#apiserver-save-msg').classes()).toContain('error');
  });

  it('hides the message again after 3s (legacy _flash timer)', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountedSettings();
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await wrapper.find('button.form-btn.save').trigger('click');
      await flushPromises();
      await vi.advanceTimersByTimeAsync(2900);
      expect(wrapper.find('#apiserver-save-msg').classes()).toContain('visible');

      await vi.advanceTimersByTimeAsync(150);
      expect(wrapper.find('#apiserver-save-msg').classes()).not.toContain('visible');
    } finally {
      vi.useRealTimers();
    }
  });
});
