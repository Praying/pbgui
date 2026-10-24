import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ origin: 'http://pbgui.test', base_prefix: '', authenticated: true, version: '1.0.0', serial: 'S1' })),
  apiPath: (path: string) => path,
  wsOrigin: () => 'ws://pbgui.test',
  pageOrigin: () => 'http://pbgui.test',
}));

const apiFetchMock = vi.fn();
vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api')>('@/shared/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const HOST = 'vps-frankfurt-hetzner-cx41-prod-01.internal.example-trading-infra.com';
const LONG_USER = 'wallet_main_hyperliquid_vault_rebalancer_account_with_a_really_long_name_0';

function payload() {
  return {
    accounts: [
      {
        users: [LONG_USER, 'second_user'],
        bots: [
          { name: 'bot_a', host: HOST, pb_version: '7' },
          { name: 'bot_b', host: HOST, pb_version: '8' },
          { name: 'bot_c', host: '', pb_version: '7' },
        ],
        used: 1000,
        cap: 10000,
        sampled_at: 1_700_000_000,
        state: 'ok',
        source: 'vps',
      },
      { users: ['idle_user'], bots: [], used: 5, cap: 10000, sampled_at: 1_700_000_000, state: 'idle', source: 'vps' },
    ],
  };
}

async function mountPage() {
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string) => {
    if (url.endsWith('/user-rate-limits')) return Promise.resolve(payload());
    if (url.includes('/user-rate-limits/history/')) return Promise.resolve({ samples: [] });
    throw new Error(`Unexpected request ${url}`);
  });
});

/**
 * With real data the "Running bots" cell used to be one `; `-joined paragraph
 * in a column squeezed by a long account name: a 5-bot row measured 457px tall
 * next to 72px for a 1-bot row. Each bot is now its own row, with the long,
 * secondary host truncating while the name stays whole.
 */
describe('hl_limits running-bots cell', () => {
  it('renders one list item per bot, not a joined string', async () => {
    const wrapper = await mountPage();
    const items = wrapper.findAll('tbody tr').at(0)!.findAll('li');
    expect(items).toHaveLength(3);
    expect(wrapper.text()).not.toContain('; ');
  });

  it('keeps the PB version, name and host as separate spans and drops a missing host', async () => {
    const wrapper = await mountPage();
    const items = wrapper.findAll('tbody tr').at(0)!.findAll('li');
    expect(items[0]!.text()).toContain('PB7');
    expect(items[0]!.text()).toContain('bot_a');
    expect(items[0]!.text()).toContain(HOST);
    expect(items[1]!.text()).toContain('PB8');
    expect(items[2]!.text()).not.toContain('·');
  });

  it('lets the host shrink first: the name does not shrink and is capped', async () => {
    const wrapper = await mountPage();
    const li = wrapper.findAll('tbody tr').at(0)!.findAll('li')[0]!;
    const [name, host] = li.findAll('span').slice(-2);
    expect(name!.classes()).toContain('shrink-0');
    expect(name!.classes()).toContain('max-w-[65%]');
    expect(host!.classes()).toContain('min-w-0');
    expect(host!.classes()).not.toContain('shrink-0');
  });

  it('gives every bot a tooltip with the full text, since the host can be truncated', async () => {
    const wrapper = await mountPage();
    const li = wrapper.findAll('tbody tr').at(0)!.findAll('li')[0]!;
    expect(li.attributes('title')).toBe(`PB7 bot_a · ${HOST}`);
  });

  it('shows a dash for a wallet with no running bot', async () => {
    const wrapper = await mountPage();
    const cell = wrapper.findAll('tbody tr').at(1)!.findAll('td')[1]!;
    expect(cell.findAll('li')).toHaveLength(0);
    expect(cell.text()).toBe('—');
  });
});

describe('hl_limits account column', () => {
  it('bounds a very long unbroken account name and exposes it as a tooltip', async () => {
    const wrapper = await mountPage();
    const cell = wrapper.findAll('tbody tr').at(0)!.findAll('td')[0]!;
    expect(cell.classes()).toContain('max-w-[22rem]');
    expect(cell.classes()).toContain('min-w-[11rem]');
    expect(cell.classes()).toContain('[overflow-wrap:anywhere]');
    expect(cell.get('strong').attributes('title')).toBe(`${LONG_USER}, second_user`);
  });
});
