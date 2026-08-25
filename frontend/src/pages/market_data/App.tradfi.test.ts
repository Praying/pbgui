import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  clearAppTestGlobals,
  installFetchMock,
  flushPromises,
  mountApp,
  BASE,
  SETTINGS_PAYLOAD,
  TRADFI_MAP_PAYLOAD,
} from './App.test-support';
import { pickSelectOption } from '@/shared/testing/select';

/* M-data-4 tiingo + tradfi integration (:7379-7401, :4924, :9734). */

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

describe('tiingo + tradfi integration (M-data-4, :7379-7401, :4924, :9734)', () => {
  it('loads the tradfi map after the settings payload renders (:7397)', async () => {
    mountApp();
    await flushPromises();
    const mapCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.endsWith('/settings/hyperliquid/tradfi-map'));
    expect(mapCalls).toEqual([`${BASE}/api/market-data/settings/hyperliquid/tradfi-map`]);
  });

  it('renders the map rows and the tiingo usage from the payload', async () => {
    const app = mountApp();
    await flushPromises();
    expect(app.find('#settings-hyperliquid-tradfi-map .tradfi-map-table').exists()).toBe(true);
    expect(app.find('[data-tradfi-xyz="TSLA"]').exists()).toBe(true);
    expect(app.find('#tradfi-cache-note').text()).toBe('meta · quote · spec');
    // settings.tiingo_usage rendered (:7396) with the configured callout
    expect(app.find('#settings-tiingo-credential-status').text()).toContain(
      'An active Tiingo vault profile is available'
    );
    expect(app.find('#settings-tiingo-usage .usage-card').exists()).toBe(true);
  });

  it('drops the cards and skips the map for other exchanges (:7362-7366, :7399-7401)', async () => {
    const app = mountApp();
    await flushPromises();
    await pickSelectOption(app, '#page-exchange', 'Bybit');
    await flushPromises();
    expect(app.find('#settings-hyperliquid-tiingo').exists()).toBe(false);
    expect(app.find('#settings-hyperliquid-tradfi-map').exists()).toBe(false);
    const mapCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.endsWith('/settings/hyperliquid/tradfi-map'));
    expect(mapCalls).toHaveLength(1); // only the initial hyperliquid load
  });

  it('reveals the stored token through the eye and clears it on a vault 401 (:5620-5636, :4924)', async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/api-keys/tradfi/reveal')) {
        // first reveal succeeds, then the session expires
        return new Response(JSON.stringify({ value: 'vault-secret' }), { status: 200 });
      }
      if (u.includes('/api/market-data/settings/')) return new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 });
      if (u.includes('/tradfi-map')) return new Response(JSON.stringify(TRADFI_MAP_PAYLOAD), { status: 200 });
      return new Response('{"running":false}', { status: 200 });
    });
    const app = mountApp();
    await flushPromises();
    const input = app.find('#settings-tiingo-token');
    await app.find('#settings-hyperliquid-tiingo .pw-eye-btn').trigger('click');
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe('vault-secret');
    expect((input.element as HTMLInputElement).type).toBe('text');
    // second reveal: vault answers 401 → onUnauthorized wipes the revealed token
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/api-keys/tradfi/reveal')) {
        return new Response(JSON.stringify({ detail: 'expired' }), { status: 401 });
      }
      if (u.includes('/api/market-data/settings/')) return new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 });
      if (u.includes('/tradfi-map')) return new Response(JSON.stringify(TRADFI_MAP_PAYLOAD), { status: 200 });
      return new Response('{"running":false}', { status: 200 });
    });
    // hide (clears), then reveal again — the 401 fires the clear hook and the
    // stale generation drops the failure silently (:5635)
    await app.find('#settings-hyperliquid-tiingo .pw-eye-btn').trigger('click'); // hide+clear
    await flushPromises();
    await app.find('#settings-hyperliquid-tiingo .pw-eye-btn').trigger('click'); // reveal → 401
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe('');
    expect((input.element as HTMLInputElement).type).toBe('password');
  });

  it('clears a revealed token on pagehide (:9734)', async () => {
    const app = mountApp();
    await flushPromises();
    const input = app.find('#settings-tiingo-token');
    await input.setValue('typed-token');
    await app.find('#settings-hyperliquid-tiingo .pw-eye-btn').trigger('click'); // unmask typed
    expect((input.element as HTMLInputElement).type).toBe('text');
    window.dispatchEvent(new Event('pagehide'));
    await flushPromises();
    expect((input.element as HTMLInputElement).type).toBe('password'); // remasked
  });

  it('removes the pagehide listener on unmount', async () => {
    const app = mountApp();
    await flushPromises();
    app.unmount();
    // the cleared state no longer flips — the listener is gone
    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow();
  });
});
