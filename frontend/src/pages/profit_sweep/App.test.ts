import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { openSelect, pickSelectOption, selectOptionTexts } from '@/shared/testing/select';
import App from './App.vue';

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const SCHEMA_FIXTURE = {
  feature_status: 'live',
  live_available: true,
  defaults: {
    operating_mode: 'disabled',
    baseline_mode: 'from_enable',
    trigger_mode: 'hybrid',
    reference_capital: 1000,
    trigger_percent: 0,
    sweep_percent: 100,
    minimum_transfer_amount: 10,
    safety_reserve_mode: 'fixed',
    safety_reserve_amount: 0,
    safety_reserve_percent: 0,
    daily_transfer_limit_enabled: false,
    daily_transfer_limit: 0,
    single_transfer_limit_enabled: false,
    single_transfer_limit: 0,
    periodic_interval: 3600,
    settlement_debounce: 30,
    quiet_period: 60,
    stabilization_interval: 60,
    successful_transfer_cooldown: 300,
    vault_transfer_cooldown: 300,
    schedule_jitter_percent: 5,
    maximum_history_age: 86400,
    maximum_preflight_age: 15,
    vault_withdraw_mode: 'flat_only',
    vault_destination: 'main_perps',
    vault_minimum_transfer_amount: 50,
    retained_leader_equity: 100,
    share_safety_buffer: 0.01,
    vault_safety_reserve_mode: 'fixed',
    vault_safety_reserve_amount: 100,
    vault_safety_reserve_percent: 0,
    main_destination_activity_policy: 'warn',
  },
  options: {
    operating_mode: ['disabled', 'dry', 'live', 'paused_unknown'],
    baseline_mode: ['from_enable', 'lifetime'],
    trigger_mode: ['hybrid', 'interval'],
    safety_reserve_mode: ['fixed', 'percent', 'max_of_both'],
    vault_withdraw_mode: ['flat_only', 'margin_buffered'],
    vault_destination: ['main_perps', 'main_spot'],
    vault_safety_reserve_mode: ['fixed', 'percent', 'max_of_both'],
    main_destination_activity_policy: ['warn', 'pause_future_sweeps'],
  },
};

const USERS_FIXTURE = {
  users: [
    { name: 'alice_vault', exchange: 'hyperliquid', is_vault: true, operating_mode: 'dry' },
    { name: 'bob_perp', exchange: 'binance', is_vault: false, operating_mode: 'disabled' },
  ],
};

const POLICY_FIXTURE = {
  policy: {
    ...SCHEMA_FIXTURE.defaults,
    vault_withdraw_mode: 'flat_only',
  },
  generation: 1,
  policy_fingerprint: 'fp123',
};

const fetchMock = vi.fn();

async function mountApp() {
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  await new Promise((resolve) => setTimeout(resolve, 10));
  return wrapper;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/api/profit-sweep/schema')) {
      return Promise.resolve(new Response(JSON.stringify(SCHEMA_FIXTURE), { status: 200 }));
    }
    if (u.endsWith('/api/profit-sweep/users')) {
      return Promise.resolve(new Response(JSON.stringify(USERS_FIXTURE), { status: 200 }));
    }
    if (u.includes('/api/profit-sweep/policies/')) {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init?.body || '{}'));
        return Promise.resolve(new Response(JSON.stringify({ ...POLICY_FIXTURE, policy: body.policy }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(POLICY_FIXTURE), { status: 200 }));
    }
    if (u.includes('/api/profit-sweep/journal/')) {
      return Promise.resolve(new Response(JSON.stringify({ journal: [] }), { status: 200 }));
    }
    if (u.includes('/api/profit-sweep/intents/')) {
      return Promise.resolve(new Response(JSON.stringify({ intents: [] }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Profit Sweep page dropdowns and forms', () => {
  it('renders accounts list and loads default account', async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain('alice_vault');
    expect(wrapper.text()).toContain('bob_perp');
  });

  it('renders themed SelectRoot dropdowns in the Vault tab and supports picking options', async () => {
    const wrapper = await mountApp();

    // Switch to Vault tab
    const tabs = wrapper.findAll('nav button');
    const vaultTab = tabs.find((b) => b.text().includes('Vault') || b.text().includes('Exchange'));
    expect(vaultTab).toBeDefined();
    await vaultTab!.trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Open vault_withdraw_mode select
    const triggerSelector = '#profit-sweep-vault_withdraw_mode';
    expect(wrapper.find(triggerSelector).exists()).toBe(true);
    expect(wrapper.find(triggerSelector).text()).toContain('Flat Only');

    await openSelect(wrapper, triggerSelector);
    expect(selectOptionTexts()).toEqual(['Flat Only', 'Margin Buffered']);

    // Pick Margin Buffered option
    await pickSelectOption(wrapper, triggerSelector, 'Margin Buffered');
    expect(wrapper.find(triggerSelector).text()).toContain('Margin Buffered');
  });

  it('renders themed SelectRoot dropdowns in the Policy tab', async () => {
    const wrapper = await mountApp();

    // Switch to Policy tab
    const tabs = wrapper.findAll('nav button');
    const policyTab = tabs.find((b) => b.text().includes('Policy'));
    expect(policyTab).toBeDefined();
    await policyTab!.trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Baseline mode select
    const baselineTrigger = '#profit-sweep-baseline_mode';
    expect(wrapper.find(baselineTrigger).exists()).toBe(true);

    await openSelect(wrapper, baselineTrigger);
    expect(selectOptionTexts()).toEqual(['From Enable', 'Lifetime']);
    await pickSelectOption(wrapper, baselineTrigger, 'Lifetime');
    expect(wrapper.find(baselineTrigger).text()).toContain('Lifetime');
  });
});
