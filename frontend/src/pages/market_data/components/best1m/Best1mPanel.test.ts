import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import Best1mPanel from './Best1mPanel.vue';
import { useBest1m, type Best1mApi, type UseBest1m } from '../../composables/useBest1m';

/* M-data-7 — the best-1m panel mount: the generic shell vs the hyperliquid
   iframe variant (market_data_main.html:3346-3410, refreshBest1mPanel
   :7662-7685) over a real useBest1m store with a mocked api. */

const t = (key: string, params?: Record<string, unknown>): string => key;

const INFO_BYBIT = {
  exchange: 'bybit',
  coins: ['BTC', 'ETH', 'SOL'],
  hint: 'hint text',
  refetch_label: '',
  distributed_hosts: [{ hostname: 'vps-1', target: 'vps-1.example' }],
};

const INFO_BITGET = {
  exchange: 'bitget',
  coins: ['BTC'],
  distributed_hosts: [{ hostname: 'vps-1', target: 'vps-1.example' }, { hostname: 'vps-2' }],
};

let fetchJson: ReturnType<typeof vi.fn>;
let showToast: ReturnType<typeof vi.fn>;
let openBest1mPanel: ReturnType<typeof vi.fn>;

function makeStore(overrides: { exchange?: () => string } = {}): UseBest1m {
  return useBest1m({
    api: { fetchJson } as unknown as Best1mApi,
    t,
    showToast,
    getExchange: overrides.exchange ?? (() => 'bybit'),
    getBest1mSection: () => 'build',
    openBest1mPanel,
    serial: () => 'S1',
    dataActionsUrl: (path: string) => `http://h:8/api/market-data${path}`,
  });
}

function mountPanel(store: UseBest1m) {
  return mount(Best1mPanel, {
    props: { store },
    global: { plugins: [createI18n('en')] },
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  fetchJson = vi.fn(async () => ({ ...INFO_BYBIT }));
  showToast = vi.fn();
  openBest1mPanel = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the generic variant (:3347-3405)', () => {
  it('renders the picker, fields, refetch toggle and queue action after load', async () => {
    const store = makeStore();
    store.refreshPanel(false);
    const panel = mountPanel(store);
    await flush();
    expect(panel.find('#best1m-generic-panel').attributes('hidden')).toBeUndefined();
    expect(panel.find('#best1m-hyperliquid-wrap').attributes('hidden')).toBeDefined();
    expect(panel.findAll('[data-best1m-coin-row]').map((r) => r.text())).toEqual([
      'BTC',
      'ETH',
      'SOL',
    ]);
    expect(panel.find('#best1m-start-date').exists()).toBe(true);
    expect(panel.find('#best1m-end-date').exists()).toBe(true);
    expect(panel.find('#best1m-refetch').exists()).toBe(true);
    expect(panel.find('#btn-best1m-queue').attributes('disabled')).toBeUndefined();
    expect(panel.find('#best1m-hint').text()).toBe('hint text');
  });

  it('shows the loading placeholder and disables the queue button while loading', async () => {
    let release: (value: unknown) => void = () => undefined;
    fetchJson.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    const store = makeStore();
    store.refreshPanel(false);
    const panel = mountPanel(store);
    await flush();
    expect(panel.find('.coin-picker-empty').text()).toBe('Loading available coins...');
    expect(panel.find('#btn-best1m-queue').attributes('disabled')).toBeDefined();
    release({ ...INFO_BYBIT });
    await flush();
    expect(panel.find('#btn-best1m-queue').attributes('disabled')).toBeUndefined();
  });

  it('mounts the job monitor iframe with the exchange matrix URL (:3403, :4185)', async () => {
    const store = makeStore();
    store.refreshPanel(false);
    const panel = mountPanel(store);
    await flush();
    const frame = panel.find('#best1m-job-monitor-frame');
    expect(frame.exists()).toBe(true);
    expect(frame.attributes('src')).toBe(
      '/app/jobs_monitor.html?v=S1&embed=1&exchange=bybit&job_type=bybit_best_1m'
    );
  });

  it('renders the empty-coin warning through the feedback callout (:7628)', async () => {
    fetchJson.mockResolvedValue({
      exchange: 'bybit',
      coins: [],
      empty_message: 'No coins, refresh CoinData first.',
    });
    const store = makeStore();
    store.refreshPanel(false);
    const panel = mountPanel(store);
    await flush();
    expect(panel.find('#best1m-feedback').classes()).toContain('warning');
    expect(panel.find('#best1m-feedback').text()).toContain('No coins, refresh CoinData first.');
    expect(panel.find('#btn-best1m-queue').attributes('disabled')).toBeDefined();
  });

  it('filters the picker and updates the visible/selected notes (:7150-7183)', async () => {
    const store = makeStore();
    store.refreshPanel(false);
    const panel = mountPanel(store);
    await flush();
    await panel.find('#best1m-coin-filter').setValue('et');
    expect(panel.findAll('[data-best1m-coin-row]').map((r) => r.text())).toEqual(['ETH']);
    expect(panel.find('#best1m-filtered-count').text()).toBe('1 visible');
    expect(panel.find('#best1m-selected-count').text()).toBe('0 selected / 3 total');
    // no filter → queue scope note counts all available coins
    await panel.find('#best1m-coin-filter').setValue('');
    expect(panel.find('#best1m-coin-count').text()).toBe('All 3 available coins');
  });

  it('toggles selection through click and select-visible/clear-all (:9314-9322)', async () => {
    const store = makeStore();
    store.refreshPanel(false);
    const panel = mountPanel(store);
    await flush();
    await panel.find('[data-best1m-coin-row="BTC"]').trigger('mousedown');
    document.dispatchEvent(new MouseEvent('mouseup')); // document handler (:9487)
    await panel.vm.$nextTick();
    expect(panel.find('#best1m-coin-count').text()).toBe('1 selected coin');
    await panel.find('#btn-best1m-select-visible').trigger('click');
    expect(panel.find('#best1m-selected-count').text()).toBe('3 selected / 3 total');
    await panel.find('#btn-best1m-clear-selection').trigger('click');
    expect(panel.find('#best1m-selected-count').text()).toBe('0 selected / 3 total');
  });

  it('shows the distributed hosts card only for bitget (:7230-7231)', async () => {
    const store = makeStore({ exchange: () => 'bybit' });
    fetchJson.mockResolvedValue({ ...INFO_BYBIT });
    store.refreshPanel(false);
    const panel = mountPanel(store);
    await flush();
    expect(panel.find('#best1m-distributed-card').attributes('hidden')).toBeDefined();

    const bitgetStore = makeStore({ exchange: () => 'bitget' });
    fetchJson.mockResolvedValue({ ...INFO_BITGET });
    bitgetStore.refreshPanel(false);
    const bitgetPanel = mountPanel(bitgetStore);
    await flush();
    expect(bitgetPanel.find('#best1m-distributed-card').attributes('hidden')).toBeUndefined();
    expect(bitgetPanel.findAll('[data-best1m-host]').map((r) => r.text())).toEqual([
      'vps-1vps-1.example',
      'vps-2',
    ]);
    await bitgetPanel.find('[data-best1m-host="vps-2"]').trigger('click');
    expect(bitgetPanel.find('[data-best1m-host="vps-2"]').classes()).toContain('selected');
  });

  it('collects the queue payload through the form fields (:7701-7726)', async () => {
    const store = makeStore();
    store.refreshPanel(false);
    const panel = mountPanel(store);
    await flush();
    await panel.find('#best1m-start-date').setValue('2026-08-01');
    await panel.find('#best1m-end-date').setValue('2026-08-15');
    await panel.find('#best1m-refetch').setValue(true);
    fetchJson.mockResolvedValueOnce({ success: true, job_id: 'job-1' });
    await panel.find('#btn-best1m-queue').trigger('click');
    await flush();
    const post = fetchJson.mock.calls
      .filter((call) => String(call[0]).includes('/best-1m/queue/bybit'))
      .at(-1)!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      coins: [],
      start_day: '20260801',
      end_day: '20260815',
      refetch: true,
      distributed: false,
      distributed_hosts: [],
    });
  });
});

describe('the hyperliquid variant (:3407-3409, :7670-7677)', () => {
  it('hides the generic shell and mounts the data-actions iframe', () => {
    const store = makeStore({ exchange: () => 'hyperliquid' });
    store.refreshPanel(false);
    const panel = mountPanel(store);
    expect(panel.find('#best1m-generic-panel').attributes('hidden')).toBeDefined();
    expect(panel.find('#best1m-hyperliquid-wrap').attributes('hidden')).toBeUndefined();
    const frame = panel.find('#best1m-hyperliquid-frame');
    expect(frame.exists()).toBe(true);
    expect(frame.attributes('src')).toBe(
      'http://h:8/api/market-data/data-actions/hyperliquid?section=build'
    );
    expect(panel.find('#best1m-job-monitor-frame').exists()).toBe(false);
  });

  it('switches the iframe section with the l2books shortcut mode (:7580)', () => {
    const store = makeStore({ exchange: () => 'hyperliquid' });
    store.refreshPanel(false);
    const panel = mountPanel(store);
    expect(panel.find('#best1m-hyperliquid-frame').attributes('src')).toContain('section=build');
  });
});
