import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import PbDataSettings from './PbDataSettings.vue';
import type { PbDataSettingsData } from '../types';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: 'Err', json: async () => body } as Response;
}

/** Realistic GET /settings/pbdata payload (api/services.py get_pbdata_settings). */
const SETTINGS: PbDataSettingsData = {
  all_users: ['alice', 'bob', 'carol'],
  fetch_users: ['alice', 'carol'],
  trades_users: [],
  log_level: 'WARNING',
  ws_max: 12,
  pollers_delay_seconds: 30,
  poll_interval_combined_seconds: 120,
  poll_interval_balance_seconds: 240,
  poll_interval_positions_seconds: 300,
  poll_interval_orders_seconds: 45,
  poll_interval_history_seconds: 600,
  poll_interval_executions_seconds: 3600,
  shared_rest_user_pause_seconds: 0.75,
  shared_rest_pause_by_exchange: { hyperliquid: 3, bybit: 0.5 },
  latest_1m_coin_pause_seconds: 2.5,
};

/** Save payload with untouched form state — legacy savePBDataSettings shape. */
const SAVED_PAYLOAD = {
  fetch_users: ['alice', 'carol'],
  trades_users: [],
  log_level: 'WARNING',
  ws_max: 12,
  pollers_delay_seconds: 30,
  poll_interval_combined_seconds: 120,
  poll_interval_balance_seconds: 240,
  poll_interval_positions_seconds: 300,
  poll_interval_orders_seconds: 45,
  poll_interval_history_seconds: 600,
  poll_interval_executions_seconds: 3600,
  shared_rest_user_pause_seconds: 0.75,
  shared_rest_pause_by_exchange: {
    binance: 0.75,
    bitget: 0.75,
    bybit: 0.5,
    gateio: 0.75,
    hyperliquid: 3,
    kucoin: 0.75,
    okx: 0.75,
  },
  latest_1m_coin_pause_seconds: 2.5,
};

function mountSettings() {
  return mount(PbDataSettings, { global: { plugins: [createI18n('en')] } });
}

/** mount + load() with a resolved GET payload — the App wiring always loads first. */
async function mountedSettings(data: PbDataSettingsData = SETTINGS) {
  fetchMock.mockResolvedValue(jsonResponse(data));
  const wrapper = mountSettings();
  await wrapper.vm.load();
  await flushPromises();
  return wrapper;
}

function tagByValue(wrapper: ReturnType<typeof mountSettings>, wrapId: string, value: string) {
  const tag = wrapper.find(`#${wrapId}`).findAll('.tag').find((el) => el.attributes('data-value') === value);
  expect(tag, `${wrapId} tag ${value}`).toBeDefined();
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

describe('PbDataSettings loading (legacy loadSettings/applySettings)', () => {
  it('shows the legacy loading placeholder until load() resolves', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const wrapper = mountSettings();
    const pending = wrapper.vm.load();

    expect(wrapper.find('#pbdata-settings-wrap').text()).toBe('Loading settings…');
    expect(wrapper.find('.form-section-title').exists()).toBe(false);

    release(jsonResponse(SETTINGS));
    await pending;
    await flushPromises();
    expect(wrapper.findAll('.form-section-title').map((s) => s.text())).toEqual(['Users', 'Log Level', 'Timers']);
  });

  it('fetches GET /settings/pbdata with auth on load()', async () => {
    await mountedSettings();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pbgui.test:8000/api/services/settings/pbdata');
    expect(init.method).toBeUndefined();
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok');
  });

  it('keeps the placeholder when the load fails (legacy silent catch)', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountSettings();
    await wrapper.vm.load();
    await flushPromises();

    expect(wrapper.find('#pbdata-settings-wrap').text()).toBe('Loading settings…');
    expect(wrapper.find('.form-section-title').exists()).toBe(false);
  });
});

describe('PbDataSettings rendering (legacy renderPBDataSettings)', () => {
  it('renders the Users section with both tag multiselects and label hints', async () => {
    const wrapper = await mountedSettings();

    const labels = wrapper.findAll('.form-label').map((l) => l.text());
    expect(labels).toContain('Fetch Users (click to toggle)');
    expect(labels).toContain('Executions Download (opt-in)');

    // fetch_users tags track the payload; trades_users starts empty.
    expect(tagByValue(wrapper, 'pbdata-fetch-users', 'alice').classes()).not.toContain('inactive');
    expect(tagByValue(wrapper, 'pbdata-fetch-users', 'bob').classes()).toContain('inactive');
    expect(tagByValue(wrapper, 'pbdata-fetch-users', 'carol').classes()).not.toContain('inactive');
    for (const u of ['alice', 'bob', 'carol']) {
      expect(tagByValue(wrapper, 'pbdata-trades-users', u).classes()).toContain('inactive');
    }
  });

  it('shows the no-users empty state when all_users is empty', async () => {
    const wrapper = await mountedSettings({ ...SETTINGS, all_users: [], fetch_users: [] });

    expect(wrapper.find('#pbdata-fetch-users .multiselect-empty').text()).toBe('No users found');
    expect(wrapper.find('#pbdata-trades-users .multiselect-empty').text()).toBe('No users found');
  });

  it('renders the log level select with the six legacy options and the payload value', async () => {
    const wrapper = await mountedSettings();

    const select = wrapper.find('#pbdata-log-level');
    expect(select.findAll('option').map((o) => o.text())).toEqual([
      'DEBUG',
      'INFO',
      'WARNING',
      'ERROR',
      'CRITICAL',
      'NONE',
    ]);
    expect((select.element as HTMLSelectElement).value).toBe('WARNING');
  });

  it('defaults the log level to INFO when the payload omits it', async () => {
    const wrapper = await mountedSettings({ ...SETTINGS, log_level: '' });

    expect((wrapper.find('#pbdata-log-level').element as HTMLSelectElement).value).toBe('INFO');
  });

  it('renders the ten timer fields with legacy ids, labels and min/max/step', async () => {
    const wrapper = await mountedSettings();

    const expected: Array<[string, string, string, string, string]> = [
      ['#pbdata-ws-max', 'Max private WS', '0', '999', '1'],
      ['#pbdata-pollers-delay', 'Startup delay (s)', '0', '3600', '5'],
      ['#pbdata-combined', 'Combined interval (s)', '10', '3600', '10'],
      ['#pbdata-balance', 'Balance interval (s)', '10', '3600', '10'],
      ['#pbdata-positions', 'Positions interval (s)', '10', '3600', '10'],
      ['#pbdata-orders', 'Orders interval (s)', '10', '3600', '10'],
      ['#pbdata-history', 'History interval (s)', '10', '3600', '10'],
      ['#pbdata-executions', 'Executions interval (s)', '60', '86400', '60'],
      ['#pbdata-rest-pause', 'REST pause/user (s)', '0', '10', '0.05'],
      ['#pbdata-1m-coin-pause', 'Market data coin pause (s)', '0', '30', '0.5'],
    ];
    for (const [id, label, min, max, step] of expected) {
      const input = wrapper.find(id);
      expect(input.exists(), id).toBe(true);
      expect(input.attributes('type')).toBe('number');
      expect(input.attributes('min')).toBe(min);
      expect(input.attributes('max')).toBe(max);
      expect(input.attributes('step')).toBe(step);
      expect(input.element.closest('.form-field')!.querySelector('.form-label')!.textContent).toContain(label);
    }
  });

  it('fills integer fields via parseInt and float fields via toFixed(2) (legacy _numFld)', async () => {
    const wrapper = await mountedSettings();

    expect((wrapper.find('#pbdata-ws-max').element as HTMLInputElement).value).toBe('12');
    expect((wrapper.find('#pbdata-executions').element as HTMLInputElement).value).toBe('3600');
    expect((wrapper.find('#pbdata-rest-pause').element as HTMLInputElement).value).toBe('0.75');
    expect((wrapper.find('#pbdata-1m-coin-pause').element as HTMLInputElement).value).toBe('2.50');
  });

  it('renders the per-exchange collapsible with overrides falling back to the global pause', async () => {
    const wrapper = await mountedSettings();

    const details = wrapper.find('details#pbdata-ex-pauses');
    expect(details.attributes('open')).toBeDefined();
    expect(details.find('summary').text()).toBe('Shared REST pause per exchange');
    expect(details.find('summary svg').exists()).toBe(true);
    expect(details.find('.ex-pauses-hint').text()).toContain('Per-exchange pause between users');

    for (const [ex, value] of [
      ['binance', '0.75'], // no override -> global pause
      ['bybit', '0.50'], // override
      ['hyperliquid', '3.00'], // override
      ['kucoin', '0.75'],
    ] as const) {
      const input = wrapper.find(`#pbdata-ex-${ex}`);
      expect(input.exists(), ex).toBe(true);
      expect(input.attributes('min')).toBe('0');
      expect(input.attributes('max')).toBe('30');
      expect(input.attributes('step')).toBe('0.25');
      expect((input.element as HTMLInputElement).value).toBe(value);
      expect(input.element.closest('.form-field')!.querySelector('.form-label')!.textContent).toBe(`${ex} (s)`);
    }
    expect(wrapper.findAll('#pbdata-ex-pauses input[type="number"]')).toHaveLength(7);
  });

  it('normalizes an exchange pause to two decimals on blur (legacy onblur)', async () => {
    const wrapper = await mountedSettings();

    await wrapper.find('#pbdata-ex-okx').setValue('5');
    await wrapper.find('#pbdata-ex-okx').trigger('blur');
    expect((wrapper.find('#pbdata-ex-okx').element as HTMLInputElement).value).toBe('5.00');

    await wrapper.find('#pbdata-ex-gateio').setValue('');
    await wrapper.find('#pbdata-ex-gateio').trigger('blur');
    expect((wrapper.find('#pbdata-ex-gateio').element as HTMLInputElement).value).toBe('0.00');
  });

  it('renders the save button with the legacy disk icon', async () => {
    const wrapper = await mountedSettings();

    expect(wrapper.find('button.form-btn.save').text()).toBe('Save');
    expect(wrapper.find('button.form-btn.save svg').exists()).toBe(true);
  });
});

describe('PbDataSettings save (legacy savePBDataSettings/_post/_flash)', () => {
  async function saveAndGetBody(wrapper: ReturnType<typeof mountSettings>): Promise<Record<string, unknown>> {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe('http://pbgui.test:8000/api/services/settings/pbdata');
    expect(init.method).toBe('POST');
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
    return JSON.parse(init.body as string);
  }

  it('POSTs the exact legacy payload for untouched form state', async () => {
    const wrapper = await mountedSettings();

    expect(await saveAndGetBody(wrapper)).toEqual(SAVED_PAYLOAD);
  });

  it('collects only rendered active tags in options order and drops unknown users', async () => {
    const wrapper = await mountedSettings({ ...SETTINGS, fetch_users: ['carol', 'ghost'] });

    expect((await saveAndGetBody(wrapper)).fetch_users).toEqual(['carol']);
  });

  it('sends the toggled tag selections', async () => {
    const wrapper = await mountedSettings();
    await tagByValue(wrapper, 'pbdata-fetch-users', 'bob').trigger('click');
    await tagByValue(wrapper, 'pbdata-trades-users', 'alice').trigger('click');
    await tagByValue(wrapper, 'pbdata-fetch-users', 'alice').trigger('click');

    const body = await saveAndGetBody(wrapper);
    expect(body.fetch_users).toEqual(['bob', 'carol']);
    expect(body.trades_users).toEqual(['alice']);
  });

  it('applies the legacy empty-input fallbacks for every timer field', async () => {
    const wrapper = await mountedSettings();
    for (const id of [
      '#pbdata-ws-max',
      '#pbdata-pollers-delay',
      '#pbdata-combined',
      '#pbdata-balance',
      '#pbdata-positions',
      '#pbdata-orders',
      '#pbdata-history',
      '#pbdata-executions',
      '#pbdata-rest-pause',
      '#pbdata-1m-coin-pause',
    ]) {
      await wrapper.find(id).setValue('');
    }

    const body = await saveAndGetBody(wrapper);
    expect(body).toMatchObject({
      ws_max: 10,
      pollers_delay_seconds: 60,
      poll_interval_combined_seconds: 90,
      poll_interval_balance_seconds: 300,
      poll_interval_positions_seconds: 300,
      poll_interval_orders_seconds: 60,
      poll_interval_history_seconds: 300,
      poll_interval_executions_seconds: 1800,
      shared_rest_user_pause_seconds: 0.75,
      latest_1m_coin_pause_seconds: 2,
    });
  });

  it('omits per-exchange pauses whose input is empty (legacy isNaN skip)', async () => {
    const wrapper = await mountedSettings();
    await wrapper.find('#pbdata-ex-binance').setValue(''); // no blur: stays empty

    const body = await saveAndGetBody(wrapper);
    expect(body.shared_rest_pause_by_exchange).toEqual({
      bitget: 0.75,
      bybit: 0.5,
      gateio: 0.75,
      hyperliquid: 3,
      kucoin: 0.75,
      okx: 0.75,
    });
  });

  it('parses edited values with parseInt for ints and parseFloat for floats', async () => {
    const wrapper = await mountedSettings();
    await wrapper.find('#pbdata-ws-max').setValue('7');
    await wrapper.find('#pbdata-combined').setValue('45');
    await wrapper.find('#pbdata-rest-pause').setValue('1.25');
    await wrapper.find('#pbdata-1m-coin-pause').setValue('3');
    await wrapper.find('#pbdata-log-level').setValue('NONE');

    const body = await saveAndGetBody(wrapper);
    expect(body).toMatchObject({
      ws_max: 7,
      poll_interval_combined_seconds: 45,
      shared_rest_user_pause_seconds: 1.25,
      latest_1m_coin_pause_seconds: 3,
      log_level: 'NONE',
    });
  });

  it('flashes the apply message on success (legacy _post d.ok path)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, apply: { message: 'restart pbdata to apply' } }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    const msg = wrapper.find('#pbdata-save-msg');
    expect(msg.text()).toBe('restart pbdata to apply');
    expect(msg.classes()).toContain('visible');
    expect(msg.classes()).not.toContain('error');
  });

  it('flashes common.saved when the response has no apply message', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#pbdata-save-msg').text()).toBe('Saved');
  });

  it('flashes the server detail error when ok is falsy (legacy d.detail branch)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, detail: 'bad value' }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    const msg = wrapper.find('#pbdata-save-msg');
    expect(msg.text()).toBe('bad value');
    expect(msg.classes()).toContain('error');
    expect(msg.classes()).toContain('visible');
  });

  it('flashes the generic error when ok is falsy without detail', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: false }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#pbdata-save-msg').text()).toBe('Error');
  });

  it('flashes the error detail for HTTP failures (legacy non-ok JSON body)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'boom' }, 500));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#pbdata-save-msg').text()).toBe('boom');
    expect(wrapper.find('#pbdata-save-msg').classes()).toContain('error');
  });

  it('flashes the errorPrefix message on network failure (legacy catch)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockRejectedValue(new TypeError('network down'));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#pbdata-save-msg').text()).toBe('Error: network down');
    expect(wrapper.find('#pbdata-save-msg').classes()).toContain('error');
  });

  it('keeps the last message and hides it again after 3s (legacy _flash timer)', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountedSettings();
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await wrapper.find('button.form-btn.save').trigger('click');
      await flushPromises();
      await vi.advanceTimersByTimeAsync(2900);
      expect(wrapper.find('#pbdata-save-msg').classes()).toContain('visible');

      await vi.advanceTimersByTimeAsync(150);
      expect(wrapper.find('#pbdata-save-msg').classes()).not.toContain('visible');
      expect(wrapper.find('#pbdata-save-msg').text()).toBe('Saved'); // text survives
    } finally {
      vi.useRealTimers();
    }
  });

  it('replaces a previous flash with the latest result', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, detail: 'nope' }));
    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    const msg = wrapper.find('#pbdata-save-msg');
    expect(msg.text()).toBe('nope');
    expect(msg.classes()).toContain('error');
  });
});
