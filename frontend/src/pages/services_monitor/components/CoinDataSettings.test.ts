import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import CoinDataSettings from './CoinDataSettings.vue';
import type { CoinDataSettingsData } from '../types';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: 'Err', json: async () => body } as Response;
}

/** Realistic GET /settings/pbcoindata payload. */
const SETTINGS: CoinDataSettingsData = {
  fetch_interval: 6,
  fetch_limit: 2000,
  metadata_interval: 3,
  mapping_interval: 48,
};

function mountSettings() {
  return mount(CoinDataSettings, { global: { plugins: [createI18n('en')] } });
}

/** mount + load() with a resolved GET payload — the App wiring always loads first. */
async function mountedSettings(data: CoinDataSettingsData = SETTINGS) {
  fetchMock.mockResolvedValue(jsonResponse(data));
  const wrapper = mountSettings();
  await wrapper.vm.load();
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({}));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CoinDataSettings loading (legacy loadSettings/applySettings)', () => {
  it('shows the loading placeholder until load() resolves', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const wrapper = mountSettings();
    const pending = wrapper.vm.load();

    expect(wrapper.find('#coindata-settings-wrap').text()).toBe('Loading settings…');
    expect(wrapper.find('#coindata-fetch-interval').exists()).toBe(false);

    release(jsonResponse(SETTINGS));
    await pending;
    await flushPromises();
    expect(wrapper.find('.form-section-title').text()).toBe('Intervals');
    expect(wrapper.find('#coindata-fetch-interval').exists()).toBe(true);
  });

  it('fetches GET /settings/pbcoindata with auth on load()', async () => {
    await mountedSettings();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pbgui.test:8000/api/services/settings/pbcoindata');
    expect(init.method).toBeUndefined();
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok');
  });

  it('keeps the placeholder when the load fails (legacy silent catch)', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountSettings();
    await wrapper.vm.load();
    await flushPromises();

    expect(wrapper.find('#coindata-settings-wrap').text()).toBe('Loading settings…');
  });
});

describe('CoinDataSettings rendering (legacy static interval markup)', () => {
  it('renders the four interval fields with legacy ids, labels and min/max/step', async () => {
    const wrapper = await mountedSettings();

    const expected: Array<[string, string, string, string, string]> = [
      ['#coindata-fetch-interval', 'Fetch Interval (h)', '1', '24', '1'],
      ['#coindata-fetch-limit', 'Fetch Limit', '200', '5000', '200'],
      ['#coindata-metadata-interval', 'Metadata Interval (d)', '1', '7', '1'],
      ['#coindata-mapping-interval', 'Mapping Interval (h)', '1', '168', '1'],
    ];
    for (const [id, label, min, max, step] of expected) {
      const input = wrapper.find(id);
      expect(input.exists(), id).toBe(true);
      expect(input.attributes('type')).toBe('number');
      expect(input.classes()).toContain('narrow');
      expect(input.attributes('min')).toBe(min);
      expect(input.attributes('max')).toBe(max);
      expect(input.attributes('step')).toBe(step);
      expect(input.element.closest('.form-field')!.querySelector('.form-label')!.textContent).toContain(label);
    }
    expect(wrapper.findAll('.form-row input')).toHaveLength(4);
  });

  it('fills the fields from the payload', async () => {
    const wrapper = await mountedSettings();

    expect((wrapper.find('#coindata-fetch-interval').element as HTMLInputElement).value).toBe('6');
    expect((wrapper.find('#coindata-fetch-limit').element as HTMLInputElement).value).toBe('2000');
    expect((wrapper.find('#coindata-metadata-interval').element as HTMLInputElement).value).toBe('3');
    expect((wrapper.find('#coindata-mapping-interval').element as HTMLInputElement).value).toBe('48');
  });

  it('falls back to 24/5000/1/24 for missing or falsy values (legacy || defaults)', async () => {
    const wrapper = await mountedSettings({
      fetch_interval: 0, // falsy → default, legacy data.x || 24
      fetch_limit: undefined,
      metadata_interval: undefined,
      mapping_interval: 0,
    });

    expect((wrapper.find('#coindata-fetch-interval').element as HTMLInputElement).value).toBe('24');
    expect((wrapper.find('#coindata-fetch-limit').element as HTMLInputElement).value).toBe('5000');
    expect((wrapper.find('#coindata-metadata-interval').element as HTMLInputElement).value).toBe('1');
    expect((wrapper.find('#coindata-mapping-interval').element as HTMLInputElement).value).toBe('24');
  });

  it('renders the save button with the legacy disk icon', async () => {
    const wrapper = await mountedSettings();

    expect(wrapper.find('button.form-btn.save').text()).toBe('💾 Save');
  });
});

describe('CoinDataSettings save (legacy saveCoinDataSettings/_post)', () => {
  async function saveAndGetBody(wrapper: ReturnType<typeof mountSettings>): Promise<Record<string, unknown>> {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe('http://pbgui.test:8000/api/services/settings/pbcoindata');
    expect(init.method).toBe('POST');
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
    return JSON.parse(init.body as string);
  }

  it('POSTs the payload values for untouched form state', async () => {
    const wrapper = await mountedSettings();

    expect(await saveAndGetBody(wrapper)).toEqual({
      fetch_interval: 6,
      fetch_limit: 2000,
      metadata_interval: 3,
      mapping_interval: 48,
    });
  });

  it('sends edited values as integers', async () => {
    const wrapper = await mountedSettings();
    await wrapper.find('#coindata-fetch-interval').setValue('12');
    await wrapper.find('#coindata-fetch-limit').setValue('4800');
    await wrapper.find('#coindata-metadata-interval').setValue('7');
    await wrapper.find('#coindata-mapping-interval').setValue('168');

    expect(await saveAndGetBody(wrapper)).toEqual({
      fetch_interval: 12,
      fetch_limit: 4800,
      metadata_interval: 7,
      mapping_interval: 168,
    });
  });

  it('applies the legacy empty-input fallbacks 24/5000/1/24', async () => {
    const wrapper = await mountedSettings();
    for (const id of ['#coindata-fetch-interval', '#coindata-fetch-limit', '#coindata-metadata-interval', '#coindata-mapping-interval']) {
      await wrapper.find(id).setValue('');
    }

    expect(await saveAndGetBody(wrapper)).toEqual({
      fetch_interval: 24,
      fetch_limit: 5000,
      metadata_interval: 1,
      mapping_interval: 24,
    });
  });

  it('flashes the apply message on success (legacy _post d.ok path)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, apply: { message: 'restart pbcoindata to apply' } }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    const msg = wrapper.find('#coindata-save-msg');
    expect(msg.text()).toBe('restart pbcoindata to apply');
    expect(msg.classes()).toContain('visible');
    expect(msg.classes()).not.toContain('error');
  });

  it('flashes common.saved when the response has no apply message', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#coindata-save-msg').text()).toBe('Saved');
  });

  it('flashes the server detail error when ok is falsy (legacy d.detail branch)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, detail: 'interval out of range' }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    const msg = wrapper.find('#coindata-save-msg');
    expect(msg.text()).toBe('interval out of range');
    expect(msg.classes()).toContain('error');
  });

  it('flashes the generic error when ok is falsy without detail', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ ok: false }));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#coindata-save-msg').text()).toBe('Error');
  });

  it('flashes the error detail for HTTP failures (legacy non-ok JSON body)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'boom' }, 500));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#coindata-save-msg').text()).toBe('boom');
    expect(wrapper.find('#coindata-save-msg').classes()).toContain('error');
  });

  it('flashes the errorPrefix message on network failure (legacy catch)', async () => {
    const wrapper = await mountedSettings();
    fetchMock.mockRejectedValue(new TypeError('network down'));

    await wrapper.find('button.form-btn.save').trigger('click');
    await flushPromises();

    expect(wrapper.find('#coindata-save-msg').text()).toBe('Error: network down');
    expect(wrapper.find('#coindata-save-msg').classes()).toContain('error');
  });

  it('hides the message again after 3s (legacy _flash timer)', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountedSettings();
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await wrapper.find('button.form-btn.save').trigger('click');
      await flushPromises();
      await vi.advanceTimersByTimeAsync(2900);
      expect(wrapper.find('#coindata-save-msg').classes()).toContain('visible');

      await vi.advanceTimersByTimeAsync(150);
      expect(wrapper.find('#coindata-save-msg').classes()).not.toContain('visible');
    } finally {
      vi.useRealTimers();
    }
  });
});
