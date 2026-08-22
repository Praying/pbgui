import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  clearAppTestGlobals,
  installFetchMock,
  flushPromises,
  mountApp,
  visiblePanelIds,
  BASE,
} from './App.test-support';

/* M-data-3 settings panel integration (:2979-3085, :8881-8948, :7314). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({
    token: 'tok',
    origin: 'http://pbgui.test:8000',
    version: '1.0.0',
    serial: 'S1',
  })),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = installFetchMock();
});

afterEach(() => {
  clearAppTestGlobals();
});

describe('settings panel integration (M-data-3, :2979-3085, :8881-8948, :7314)', () => {
  it('loads the settings payload through the bootstrap fan-out (:9771 → :7314)', async () => {
    mountApp();
    await flushPromises();
    const settingsCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/market-data/settings/') && !url.includes('tradfi-map'));
    expect(settingsCalls).toEqual([`${BASE}/api/market-data/settings/hyperliquid`]);
  });

  it('reloads settings when the exchange changes (:9611-9613 → :7314)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.find('#page-exchange').setValue('bybit');
    await flushPromises();
    const settingsCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/market-data/settings/') && !url.includes('tradfi-map'));
    expect(settingsCalls).toEqual([
      `${BASE}/api/market-data/settings/hyperliquid`,
      `${BASE}/api/market-data/settings/bybit`,
    ]);
  });

  it('renders the settings cards and fields from the payload', async () => {
    const app = mountApp();
    await flushPromises();
    expect(app.find('#settings-primary-card').exists()).toBe(true);
    expect(app.find('#settings-enabled-coins-card').exists()).toBe(true);
    expect(app.find('#settings-hyperliquid-aws').exists()).toBe(true);
    expect(app.find('#settings-hyperliquid-archive').exists()).toBe(true);
    expect(
      (app.find('#settings-interval-seconds').element as HTMLInputElement).value
    ).toBe('2700');
    expect(app.find('[data-settings-coin-row="BTC"]').classes()).toContain('selected');
  });

  it('keeps the save button disabled while clean and enables it on edit (:5528-5533)', async () => {
    const app = mountApp();
    await flushPromises();
    const save = app.find('#btn-save-settings-sidebar');
    expect(save.attributes('disabled')).toBeDefined();
    await app.find('#settings-interval-seconds').setValue('3600');
    expect(save.attributes('disabled')).toBeUndefined();
    expect(save.classes()).toContain('save-needed');
  });

  it('saves the collected request and re-baselines on success (:8930-8947)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.find('#settings-interval-seconds').setValue('3600');
    await app.find('#btn-save-settings-sidebar').trigger('click');
    await flushPromises();
    const post = fetchMock.mock.calls
      .filter((call) => String(call[0]).includes('/api/market-data/settings/'))
      .find((call) => (call[1] as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String((post![1] as RequestInit).body));
    expect(body).toEqual({
      auto_enable_new_coins: false,
      enabled_coins: ['BTC'],
      settings: {
        interval_seconds: 3600,
        coin_pause_seconds: 0.5,
        api_timeout_seconds: 30,
        min_lookback_days: 2,
        max_lookback_days: 4,
        aws_profile: 'pbgui-hyperliquid',
        aws_region: 'us-east-1',
        l2book_scan_timeout_s: 5,
        l2book_scan_workers: 8,
        l2book_archive_enabled: false,
        l2book_archive_dir: '',
      },
    });
    // toast + clean button after the re-baseline
    expect(app.findAll('.toast.success').map((toastEl) => toastEl.text())).toEqual([
      'Hyperliquid settings saved.',
    ]);
    expect(app.find('#btn-save-settings-sidebar').attributes('disabled')).toBeDefined();
  });

  it('switches to the settings panel and subsection on nav click (:9605-9608)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'Status Monitor')!.trigger('click');
    expect(app.find('#sidebar-context-actions').attributes('hidden')).toBeDefined();
    await app.find('#btn-settings-subsection-aws').trigger('click');
    expect(visiblePanelIds(app)).toEqual(['settings-panel']);
    expect(window.localStorage.getItem('market_data_fastapi_settings_subsection')).toBe('aws');
    expect(app.find('#settings-hyperliquid-aws').classes()).not.toContain('settings-subsection-hidden');
    expect(app.find('#sidebar-context-actions').attributes('hidden')).toBeUndefined();
  });
});
