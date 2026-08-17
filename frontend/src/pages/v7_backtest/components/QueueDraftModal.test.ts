import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import QueueDraftModal from './QueueDraftModal.vue';

/*
 * QueueDraftModal — the port of showInitialBacktestQueueDraftModal
 * (:2062-2145): defaults seeded from the first draft item, one queue POST
 * per item × exchange, the PBGui-market-data toggle and its
 * /pbgui_data_path pre-fetch (:2112).
 */

const i18n = createI18n('en');

function item(overrides: Record<string, unknown> = {}) {
  return {
    name: 'draft_1',
    config: { backtest: { exchanges: ['bybit'], start_date: '2023-01-01', starting_balance: 2500 } },
    override_configs: {},
    ...overrides,
  };
}

interface DraftItem {
  name?: string;
  config?: Record<string, unknown>;
  override_configs?: Record<string, unknown>;
}

function mountModal(items: DraftItem[], overrides: { postQueue?: ReturnType<typeof vi.fn>; getPbguiDataPath?: () => Promise<string> } = {}) {
  const postQueue = overrides.postQueue ?? vi.fn(() => Promise.resolve({}));
  const getPbguiDataPath = overrides.getPbguiDataPath ?? (() => Promise.resolve('/data/pbgui'));
  const wrapper = mount(QueueDraftModal, {
    global: { plugins: [i18n] },
    props: { open: true, items, usePbguiMarketData: false, postQueue, getPbguiDataPath },
    attachTo: document.body,
  });
  return { wrapper, postQueue };
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-08-18T10:00:00Z'));
  window.history.replaceState({}, '', '/api/backtest-v7/main_page');
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('defaults from the first item (:2068-2077)', () => {
  it('seeds exchanges, start date and balance', async () => {
    const { wrapper } = mountModal([item(), item({ name: 'draft_2', config: {} })]);
    await nextTick();
    expect((wrapper.find('[data-test="rbt-start"]').element as HTMLInputElement).value).toBe('2023-01-01');
    expect((wrapper.find('[data-test="rbt-balance"]').element as HTMLInputElement).value).toBe('2500');
    const selected = wrapper
      .findAll('[data-test="rbt-exchanges"] option')
      .filter((o) => (o.element as HTMLOptionElement).selected)
      .map((o) => (o.element as HTMLOptionElement).value);
    expect(selected).toEqual(['bybit']);
  });

  it('falls back to bybit / 2020-01-01 / 1000 for empty items', async () => {
    const { wrapper } = mountModal([item({ config: {} })]);
    await nextTick();
    expect((wrapper.find('[data-test="rbt-start"]').element as HTMLInputElement).value).toBe('2020-01-01');
    expect((wrapper.find('[data-test="rbt-balance"]').element as HTMLInputElement).value).toBe('1000');
  });

  it('defaults end date to today (:2069)', async () => {
    const { wrapper } = mountModal([item()]);
    await nextTick();
    expect((wrapper.find('[data-test="rbt-end"]').element as HTMLInputElement).value).toBe('2026-08-18');
  });
});

describe('queue submit (:2099-2142)', () => {
  it('preserves the draft ohlcv_source_dir when PBGui data is unchecked (:2122)', async () => {
    const item = { name: 'draft_1', config: { backtest: { exchanges: ['bybit'], ohlcv_source_dir: '/custom/data' } } };
    const { wrapper, postQueue } = mountModal([item]);
    await nextTick();
    await wrapper.find('[data-test="rbt-ok"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const body = postQueue.mock.calls[0]![0] as { config: { backtest: { ohlcv_source_dir: string } } };
    expect(body.config.backtest.ohlcv_source_dir).toBe('/custom/data');
  });

  it('posts one job per item × exchange and closes', async () => {
    const { wrapper, postQueue } = mountModal([item(), item({ name: 'draft_2' })]);
    await nextTick();
    await wrapper.find('[data-test="rbt-ok"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(postQueue).toHaveBeenCalledTimes(2);
    const bodies = postQueue.mock.calls.map((call) => call[0]);
    expect(bodies[0]).toMatchObject({ name: 'draft_1' });
    expect(bodies[0].config.backtest).toMatchObject({ start_date: '2023-01-01', end_date: '2026-08-18', starting_balance: 2500, exchanges: ['bybit'] });
    expect(bodies[1]).toMatchObject({ name: 'draft_2' });
    expect(wrapper.emitted('queued')![0]).toEqual([2]);
  });

  it('expands every selected exchange into its own job (:2115-2131)', async () => {
    const { wrapper, postQueue } = mountModal([item()]);
    await nextTick();
    const select = wrapper.find('[data-test="rbt-exchanges"]');
    (select.element as HTMLSelectElement).selectedOptions[0]!.selected = false;
    for (const option of (select.element as HTMLSelectElement).options) {
      if (option.value === 'binance' || option.value === 'bybit') option.selected = true;
    }
    await select.trigger('change');
    await wrapper.find('[data-test="rbt-ok"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(postQueue).toHaveBeenCalledTimes(2);
    const exchanges = postQueue.mock.calls.map((call) => (call[0] as { config: { backtest: { exchanges: string[] } } }).config.backtest.exchanges);
    expect(exchanges).toEqual([['binance'], ['bybit']]);
  });

  it('requires at least one exchange (:2110)', async () => {
    const { wrapper, postQueue } = mountModal([item()]);
    await nextTick();
    const select = wrapper.find('[data-test="rbt-exchanges"]');
    for (const option of (select.element as HTMLSelectElement).options) option.selected = false;
    await select.trigger('change');
    await wrapper.find('[data-test="rbt-ok"]').trigger('click');
    await nextTick();
    expect(postQueue).not.toHaveBeenCalled();
    expect(wrapper.emitted('error')![0]).toBeDefined();
    expect(wrapper.find('[data-test="queue-draft-modal"]').exists()).toBe(true);
  });

  it('fetches the PBGui data path and sets ohlcv_source_dir when toggled (:2112, :2122)', async () => {
    const { wrapper, postQueue } = mountModal([item()]);
    await nextTick();
    await wrapper.find('[data-test="rbt-pbgui-data"]').setValue(true);
    await wrapper.find('[data-test="rbt-ok"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(postQueue).toHaveBeenCalledTimes(1); // one queue POST after the path fetch
    const body = postQueue.mock.calls[0]![0] as { config: { backtest: { ohlcv_source_dir: string } } };
    expect(body.config.backtest.ohlcv_source_dir).toBe('/data/pbgui');
  });

  it('falls back to the base_dir last segment before rebacktest (:2127, :1985-1992)', async () => {
    const unnamed = { config: { backtest: { exchanges: ['bybit'], base_dir: 'backtests/pbgui/from_base_dir' } } } as never;
    const { wrapper, postQueue } = mountModal([unnamed, { config: { backtest: { exchanges: ['bybit'] } } }]);
    await nextTick();
    await wrapper.find('[data-test="rbt-ok"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const names = postQueue.mock.calls.map((call) => (call[0] as { name: string }).name);
    expect(names).toEqual(['from_base_dir', 'rebacktest']);
  });

  it('keeps override_configs from the draft items (:2129)', async () => {
    const { wrapper, postQueue } = mountModal([item({ override_configs: { 'BTC.json': { a: 1 } } })]);
    await nextTick();
    await wrapper.find('[data-test="rbt-ok"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const body = postQueue.mock.calls[0]![0];
    expect(body.override_configs).toEqual({ 'BTC.json': { a: 1 } });
  });
});
