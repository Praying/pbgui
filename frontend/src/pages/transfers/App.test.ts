import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '@/shared/i18n';
import { openSelect, pickSelectOption, selectOptionTexts } from '@/shared/testing/select';
import App from './App.vue';

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ origin: 'http://pbgui.test:8000', base_prefix: '', authenticated: true, version: '1.0.0', serial: 'S1' })),
  apiPath: (path: string) => path,
  wsOrigin: () => 'ws://pbgui.test:8000',
  pageOrigin: () => 'http://pbgui.test:8000',
}));

const apiFetchMock = vi.fn();
vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api')>('@/shared/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const PENDING_KEY = 'pbgui:transfers:pending-top-up:v1';
const TRIGGER = '[data-slot="select-trigger"]';

const users = { users: [{ name: 'alice', exchange: 'binance', account_type: 'standard' }] };
function makePreview(routes: Array<Record<string, unknown>> | null = null) {
  return {
    account_type: 'standard',
    exchange: 'binance',
    route_note: null,
    blocked_reason: null,
    positions: [],
    position_count: 0,
    positions_truncated: false,
    routes: routes ?? [
      { id: 'spot_to_perp', asset: 'USDC', source: 'Main Spot', destination: 'Main Perps', minimum_amount: '1', source_balance: '100', max_transferable: '80', destination_balance: '10' },
      { id: 'perp_to_spot', asset: 'USDC', source: 'Main Perps', destination: 'Main Spot', minimum_amount: '1', source_balance: '50', max_transferable: '40', destination_balance: '5' },
    ],
  };
}
const operations = { operations: [] };

function mountApp(): VueWrapper {
  return mount(App, { global: { plugins: [createI18n('en')] } });
}

/** The page polls on visibilitychange and on a 5s interval; this drives one poll without fake timers. */
function triggerAutoRefresh(): void {
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/app/transfers');
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string) => {
    if (url.endsWith('/transfers/users')) return Promise.resolve(users);
    if (url.includes('/transfers/preview/')) return Promise.resolve(makePreview());
    if (url.includes('/transfers/operations/')) return Promise.resolve(operations);
    throw new Error(`Unexpected request ${url}`);
  });
});

describe('Transfers Vue page direction select', () => {
  it('shows the chosen direction in the closed trigger and keeps it across automatic refreshes', async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.get(TRIGGER).text()).toContain('Spot -> Perps');
    await pickSelectOption(wrapper, TRIGGER, 'Perps -> Spot');
    expect(wrapper.get(TRIGGER).text()).toContain('Perps -> Spot');

    triggerAutoRefresh();
    await flushPromises();

    expect(wrapper.get(TRIGGER).text()).toContain('Perps -> Spot');
    expect(wrapper.text()).toContain('Main Perps');
    wrapper.unmount();
  });

  it('keeps route options and an enabled control while a background refresh is in flight', async () => {
    const wrapper = mountApp();
    await flushPromises();

    let resolvePreview: (value: unknown) => void = () => {};
    apiFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/transfers/users')) return Promise.resolve(users);
      if (url.includes('/transfers/preview/')) return new Promise((resolve) => { resolvePreview = resolve; });
      if (url.includes('/transfers/operations/')) return Promise.resolve(operations);
      throw new Error(`Unexpected request ${url}`);
    });

    await openSelect(wrapper, TRIGGER);
    expect(selectOptionTexts()).toEqual(['Spot -> Perps', 'Perps -> Spot']);

    triggerAutoRefresh();
    await Promise.resolve();
    await Promise.resolve();

    expect(selectOptionTexts()).toEqual(['Spot -> Perps', 'Perps -> Spot']);
    expect(wrapper.get(TRIGGER).attributes('disabled')).toBeUndefined();

    resolvePreview(makePreview());
    await flushPromises();
    expect(wrapper.get(TRIGGER).text()).toContain('Spot -> Perps');
    wrapper.unmount();
  });

  it('restores a retained pending transfer direction and amount after reload and refresh', async () => {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      user: 'alice',
      route: 'perp_to_spot',
      amount: '7',
      operation_id: '123e4567-e89b-42d3-a456-426614174000',
      created_at: Date.now(),
    }));
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.get(TRIGGER).text()).toContain('Perps -> Spot');
    expect((wrapper.get('input[type="number"]').element as HTMLInputElement).value).toBe('7');

    triggerAutoRefresh();
    await flushPromises();

    expect(wrapper.get(TRIGGER).text()).toContain('Perps -> Spot');
    expect((wrapper.get('input[type="number"]').element as HTMLInputElement).value).toBe('7');
    wrapper.unmount();
  });

  it('renders the placeholder and disables the direction control when the account exposes no routes', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/transfers/users')) return Promise.resolve(users);
      if (url.includes('/transfers/preview/')) return Promise.resolve(makePreview([]));
      if (url.includes('/transfers/operations/')) return Promise.resolve(operations);
      throw new Error(`Unexpected request ${url}`);
    });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.get(TRIGGER).text()).toContain('Select a route');
    expect(wrapper.get(TRIGGER).attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('keeps a deliberately chosen direction even while a retained pending transfer pins another route', async () => {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      user: 'alice',
      route: 'spot_to_perp',
      amount: '5',
      operation_id: '123e4567-e89b-42d3-a456-426614174000',
      created_at: Date.now(),
    }));
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.get(TRIGGER).text()).toContain('Spot -> Perps');
    expect(wrapper.text()).toContain("A previous transfer's response was lost");

    await pickSelectOption(wrapper, TRIGGER, 'Perps -> Spot');
    expect(wrapper.get(TRIGGER).text()).toContain('Perps -> Spot');

    triggerAutoRefresh();
    await flushPromises();

    expect(wrapper.get(TRIGGER).text()).toContain('Perps -> Spot');
    // The retained operation stays available for an idempotent same-route retry.
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
    wrapper.unmount();
  });

  it('releases the retained pending transfer once its operation is confirmed in history', async () => {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      user: 'alice',
      route: 'perp_to_spot',
      amount: '7',
      operation_id: '123e4567-e89b-42d3-a456-426614174000',
      created_at: Date.now(),
    }));
    apiFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/transfers/users')) return Promise.resolve(users);
      if (url.includes('/transfers/preview/')) return Promise.resolve(makePreview());
      if (url.includes('/transfers/operations/')) return Promise.resolve({
        operations: [{ operation_id: '123e4567-e89b-42d3-a456-426614174000', route: 'perp_to_spot', status: 'confirmed' }],
      });
      throw new Error(`Unexpected request ${url}`);
    });
    const wrapper = mountApp();
    await flushPromises();

    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expect(wrapper.text()).not.toContain("A previous transfer's response was lost");
    // The direction is no longer pinned to the retained route; the first route applies.
    expect(wrapper.get(TRIGGER).text()).toContain('Spot -> Perps');
    wrapper.unmount();
  });

  it('keeps the retention while the retained operation is still unknown', async () => {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      user: 'alice',
      route: 'perp_to_spot',
      amount: '7',
      operation_id: '123e4567-e89b-42d3-a456-426614174000',
      created_at: Date.now(),
    }));
    apiFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/transfers/users')) return Promise.resolve(users);
      if (url.includes('/transfers/preview/')) return Promise.resolve(makePreview());
      if (url.includes('/transfers/operations/')) return Promise.resolve({
        operations: [{ operation_id: '123e4567-e89b-42d3-a456-426614174000', route: 'perp_to_spot', status: 'unknown', can_reconcile: true }],
      });
      throw new Error(`Unexpected request ${url}`);
    });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.get(TRIGGER).text()).toContain('Perps -> Spot');
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull();

    triggerAutoRefresh();
    await flushPromises();

    expect(wrapper.get(TRIGGER).text()).toContain('Perps -> Spot');
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
    wrapper.unmount();
  });
});
