import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import SettingsPanel from './SettingsPanel.vue';
import { useSettings, type SettingsApi, type SettingsPayload } from '../../composables/useSettings';
import { useTiingo } from '../../composables/useTiingo';
import { useTradfiMap } from '../../composables/useTradfiMap';

/* Settings panel — legacy #settings-panel body (:2979-3085 for the M-data-3
   cards), the tiingo/tradfi cards (:3077-3218, M-data-4), subsection
   visibility (:6157-6173), card positioning (:6121-6144) and the
   subsection scroll reset (:6183-6184). */

const T = (key: string): string => key;

function hyperliquidPayload(): SettingsPayload {
  return {
    exchange: 'hyperliquid',
    auto_enable_new_coins: false,
    enabled_coins: ['BTC'],
    coin_options: ['BTC', 'ETH', 'SOL'],
    missing_saved_coins: [],
    settings: {
      interval_seconds: 2700,
      coin_pause_seconds: 0.5,
      api_timeout_seconds: 30,
      min_lookback_days: 2,
      max_lookback_days: 4,
      aws_profile: 'pbgui-hyperliquid',
      aws_access_key_configured: true,
      aws_secret_access_key_configured: true,
      aws_region: 'us-east-1',
      l2book_scan_timeout_s: 5,
      l2book_scan_workers: 8,
      l2book_archive_enabled: true,
      l2book_archive_dir: '/mnt/nas/ohlcv/l2books',
    },
  } as SettingsPayload;
}

function bybitPayload(): SettingsPayload {
  return {
    exchange: 'bybit',
    auto_enable_new_coins: false,
    enabled_coins: ['BTC'],
    coin_options: ['BTC', 'ADA'],
    missing_saved_coins: [],
    settings: {
      interval_seconds: 900,
      coin_pause_seconds: 1,
      api_timeout_seconds: 20,
      min_lookback_days: 1,
      max_lookback_days: 3,
    },
  } as SettingsPayload;
}

function mkStorage(startsWith: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(startsWith));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: () => null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => map.set(key, value),
  } as Storage;
}

async function mountPanel(payload: SettingsPayload = hyperliquidPayload(), storage = mkStorage()) {
  const fetchJson = vi.fn(async () => payload);
  const fetchApiKeysJson = vi.fn(async () => ({}) as Record<string, unknown>);
  const fullApi = {
    fetchJson: fetchJson as unknown as SettingsApi['fetchJson'],
    fetchApiKeysJson,
  };
  const store = useSettings({ api: { fetchJson: fullApi.fetchJson }, storage, t: T, showToast: () => undefined });
  const tiingo = useTiingo({
    api: fullApi as unknown as Parameters<typeof useTiingo>[0]['api'],
    t: T,
    showToast: () => undefined,
    reloadSettings: async () => {},
  });
  const map = useTradfiMap({
    api: { fetchJson: fullApi.fetchJson },
    t: T,
    showToast: () => undefined,
    isTiingoConfigured: () => tiingo.isTiingoConfigured(),
  });
  await store.loadSettings(payload.exchange ?? 'hyperliquid');
  const wrapper = mount(SettingsPanel, {
    props: { store, tiingo, map },
    global: { plugins: [createI18n('en')] },
    attachTo: (() => {
      // legacy #settings-panel is the scroll container (:6183-6184)
      const section = document.createElement('section');
      section.id = 'settings-panel';
      document.body.appendChild(section);
      return section;
    })(),
  });
  return { store, wrapper, api: fullApi };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('layout (:2979-3085, positionSettingsCards :6121-6144)', () => {
  it('renders the shell with the cards in legacy DOM order', async () => {
    const { wrapper } = await mountPanel();
    const cards = wrapper.findAll('.settings-layout > .panel-card');
    expect(cards.map((c) => c.attributes('id'))).toEqual([
      'settings-primary-card',
      'settings-enabled-coins-card',
      'settings-hyperliquid-aws',
      'settings-hyperliquid-archive',
      'settings-hyperliquid-tiingo',
      'settings-hyperliquid-tradfi-map',
    ]);
  });

  it('drops the hyperliquid-only cards entirely for other exchanges (:7362-7366)', async () => {
    const { wrapper } = await mountPanel(bybitPayload());
    expect(wrapper.find('#settings-hyperliquid-aws').exists()).toBe(false);
    expect(wrapper.find('#settings-hyperliquid-archive').exists()).toBe(false);
    expect(wrapper.find('#settings-hyperliquid-tiingo').exists()).toBe(false);
    expect(wrapper.find('#settings-hyperliquid-tradfi-map').exists()).toBe(false);
    expect(wrapper.find('#settings-primary-card').exists()).toBe(true);
    expect(wrapper.find('#settings-enabled-coins-card').exists()).toBe(true);
  });
});

describe('fields form (:2982-3005)', () => {
  it('renders the five numeric fields with legacy ids and payload values', async () => {
    const { wrapper } = await mountPanel();
    const value = (id: string): string =>
      (wrapper.find(`#${id}`).element as HTMLInputElement).value;
    expect(value('settings-interval-seconds')).toBe('2700');
    expect(value('settings-coin-pause-seconds')).toBe('0.5');
    expect(value('settings-api-timeout-seconds')).toBe('30');
    expect(value('settings-min-lookback-days')).toBe('2');
    expect(value('settings-max-lookback-days')).toBe('4');
    expect(wrapper.find('label.settings-field').find('.field-label').text()).toBe(
      'Cycle interval (s)'
    );
  });

  it('binds edits back into the store fields', async () => {
    const { wrapper, store } = await mountPanel();
    await wrapper.find('#settings-interval-seconds').setValue('3600');
    expect(store.fields.intervalSeconds).toBe('3600');
    expect(store.isDirty.value).toBe(true);
  });
});

describe('AWS card (:3027-3061)', () => {
  it('renders the six AWS fields with payload values', async () => {
    const { wrapper } = await mountPanel();
    const value = (id: string): string => (wrapper.find(`#${id}`).element as HTMLInputElement).value;
    expect(value('settings-aws-profile')).toBe('pbgui-hyperliquid');
    expect(value('settings-aws-access-key-id')).toBe('');
    expect(value('settings-aws-secret-access-key')).toBe('');
    expect(value('settings-aws-region')).toBe('us-east-1');
    expect(value('settings-scan-timeout')).toBe('5');
    expect(value('settings-scan-workers')).toBe('8');
    expect(wrapper.findAll('.aws-credential-status').map((status) => status.text())).toEqual([
      'Configured (saved value is hidden)',
      'Configured (saved value is hidden)',
    ]);
  });

  it('toggles the password visibility with the eye button (:5575-5585)', async () => {
    const { wrapper } = await mountPanel();
    const input = wrapper.find('#settings-aws-access-key-id');
    const eye = wrapper.findAll('.pw-eye-btn')[0]!;
    expect((input.element as HTMLInputElement).type).toBe('password');
    expect(eye.find('svg').exists()).toBe(true);
    expect(eye.attributes('aria-label')).toBe('Show AWS access key');
    await eye.trigger('click');
    expect((input.element as HTMLInputElement).type).toBe('text');
    expect(eye.attributes('aria-label')).toBe('Hide AWS access key');
    expect(eye.find('svg').exists()).toBe(true);
    await eye.trigger('click');
    expect((input.element as HTMLInputElement).type).toBe('password');
    expect(eye.find('svg').exists()).toBe(true);
  });

  it('edits dirty the form through the hyperliquid branch', async () => {
    const { wrapper, store } = await mountPanel();
    await wrapper.find('#settings-aws-region').setValue('ap-south-1');
    expect(store.isDirty.value).toBe(true);
  });
});

describe('archive card (:3063-3075)', () => {
  it('renders and binds the archive toggle + directory', async () => {
    const { wrapper, store } = await mountPanel();
    const toggle = wrapper.find('#settings-archive-enabled');
    expect(store.fields.archiveEnabled).toBe(true);
    expect((wrapper.find('#settings-archive-dir').element as HTMLInputElement).value).toBe(
      '/mnt/nas/ohlcv/l2books'
    );
    await toggle.trigger('click');
    expect(store.fields.archiveEnabled).toBe(false);
    expect(store.isDirty.value).toBe(true);
  });
});

describe('subsection visibility (:6157-6173)', () => {
  it('hides the normal cards while the aws subsection is resolved', async () => {
    const { wrapper } = await mountPanel(hyperliquidPayload(), mkStorage({
      market_data_fastapi_settings_subsection: 'aws',
    }));
    expect(wrapper.find('#settings-primary-card').classes()).toContain('settings-subsection-hidden');
    expect(wrapper.find('#settings-enabled-coins-card').classes()).toContain('settings-subsection-hidden');
    expect(wrapper.find('#settings-hyperliquid-aws').classes()).not.toContain('settings-subsection-hidden');
    expect(wrapper.find('#settings-hyperliquid-archive').classes()).not.toContain('settings-subsection-hidden');
  });

  it('shows only the normal cards by default', async () => {
    const { wrapper } = await mountPanel();
    expect(wrapper.find('#settings-primary-card').classes()).not.toContain('settings-subsection-hidden');
    expect(wrapper.find('#settings-hyperliquid-aws').classes()).toContain('settings-subsection-hidden');
    expect(wrapper.find('#settings-hyperliquid-tiingo').classes()).toContain('settings-subsection-hidden');
  });

  it('falls back to normal when the stored subsection is unavailable (:6152-6155)', async () => {
    const { wrapper } = await mountPanel(bybitPayload(), mkStorage({
      market_data_fastapi_settings_subsection: 'tradfi',
    }));
    expect(wrapper.find('#settings-primary-card').classes()).not.toContain('settings-subsection-hidden');
  });
});

describe('subsection switch scroll reset (:6183-6184)', () => {
  it('scrolls the panel back to the top when the subsection changes', async () => {
    const { wrapper, store } = await mountPanel();
    const panelEl = document.getElementById('settings-panel') as HTMLElement;
    panelEl.scrollTop = 240;
    store.setActiveSubsection('aws');
    await wrapper.vm.$nextTick();
    expect(panelEl.scrollTop).toBe(0);
  });
});
