import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import CoinPicker from './CoinPicker.vue';
import { useSettings, type SettingsApi, type SettingsPayload } from '../../composables/useSettings';

/* Coin picker card — legacy #settings-enabled-coins-card
   (market_data_main.html:3007-3025) with the picker body (:7015-7133) and
   its drag/keyboard bindings (:9297-9305, :9387-9402, :9424-9440, :9475-9486). */

const T = (key: string, params?: Record<string, unknown>): string => key;

function hyperliquidPayload(): SettingsPayload {
  return {
    exchange: 'hyperliquid',
    auto_enable_new_coins: false,
    enabled_coins: ['BTC', 'ETH'],
    coin_options: ['BTC', 'ETH', 'SOL'],
    missing_saved_coins: ['GONE1', 'GONE2'],
    settings: {
      interval_seconds: 1800,
      aws_region: 'us-east-1',
    },
  } as SettingsPayload;
}

async function mountPicker(payload: SettingsPayload = hyperliquidPayload()) {
  const api = { fetchJson: vi.fn(async () => payload) };
  const store = useSettings({
    api: api as unknown as SettingsApi,
    storage: mkStorage(),
    t: T,
    showToast: () => undefined,
  });
  await store.loadSettings('hyperliquid');
  const wrapper = mount(CoinPicker, {
    props: { store },
    global: { plugins: [createI18n('en')] },
    attachTo: document.body,
  });
  return { store, wrapper };
}

function mkStorage(): Storage {
  const map = new Map<string, string>();
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

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('[data-settings-coin-row]');
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('card structure (:3007-3025)', () => {
  it('renders the card, eyebrow, auto-enable toggle and toolbar', async () => {
    const { wrapper } = await mountPicker();
    expect(wrapper.find('#settings-enabled-coins-card.coin-picker-card').exists()).toBe(true);
    expect(wrapper.find('.eyebrow').text()).toBe('Enabled Coins');
    expect(wrapper.find('#settings-auto-enable-new-coins').exists()).toBe(true);
    expect(wrapper.find('#settings-coin-filter').exists()).toBe(true);
    expect(wrapper.find('#btn-select-all-coins').exists()).toBe(true);
    expect(wrapper.find('#btn-clear-all-coins').exists()).toBe(true);
  });

  it('renders one row per rendered coin with selection state (:7053-7059)', async () => {
    const { wrapper, store } = await mountPicker();
    const rowButtons = rows(wrapper);
    expect(rowButtons.map((r) => r.attributes('data-settings-coin-row'))).toEqual([
      'BTC',
      'ETH',
      'SOL',
    ]);
    expect(rowButtons[0]?.classes()).toContain('selected');
    expect(rowButtons[0]?.attributes('aria-pressed')).toBe('true');
    expect(rowButtons[2]?.classes()).not.toContain('selected');
    expect(rowButtons[2]?.attributes('aria-pressed')).toBe('false');
    expect(store.renderedCoins.value).toEqual(['BTC', 'ETH', 'SOL']);
  });

  it('shows the empty state when the filter matches nothing (:7050-7051)', async () => {
    const { wrapper, store } = await mountPicker();
    store.setCoinFilter('zzz');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.coin-picker-empty').text()).toBe('No coins match the current filter.');
    expect(rows(wrapper)).toHaveLength(0);
  });

  it('shows the selection summaries (:7081-7084)', async () => {
    const { wrapper } = await mountPicker();
    expect(wrapper.find('#settings-enabled-count').text()).toBe('2 selected / 3 total');
    expect(wrapper.find('#settings-filtered-count').text()).toBe('3 visible');
  });

  it('shows the ignored-missing-coins note (:7352-7360)', async () => {
    const { wrapper } = await mountPicker();
    const note = wrapper.find('#settings-missing-coins');
    expect(note.attributes('hidden')).toBeUndefined();
    expect(note.text()).toBe('Ignored missing saved coins: GONE1, GONE2');
  });
});

describe('auto-enable mode (:7033, :7069-7079)', () => {
  it('disables the rows and toolbar buttons and shows the note', async () => {
    const { wrapper, store } = await mountPicker();
    store.setAutoEnableNewCoins(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#settings-auto-enable-note').attributes('hidden')).toBeUndefined();
    expect(wrapper.find('#settings-auto-enable-note').text()).toContain(
      'All current and newly added coins'
    );
    for (const row of rows(wrapper)) {
      expect(row.attributes('disabled')).toBeDefined();
      expect(row.classes()).toContain('disabled');
    }
    expect(wrapper.find('#btn-select-all-coins').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#btn-clear-all-coins').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#settings-enabled-count').text()).toBe('3 selected / 3 total');
  });

  it('hides the note when off (:7070-7073)', async () => {
    const { wrapper } = await mountPicker();
    expect(wrapper.find('#settings-auto-enable-note').attributes('hidden')).toBeDefined();
  });
});

describe('interactions', () => {
  it('toggles a row on click (mousedown → document mouseup, :9480-9483)', async () => {
    const { wrapper, store } = await mountPicker();
    await rows(wrapper)[2]!.trigger('mousedown'); // SOL
    document.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.vm.$nextTick();
    expect(store.isCoinSelected('SOL')).toBe(true);
  });

  it('toggles a row on Enter and Space (:9297-9305)', async () => {
    const { wrapper, store } = await mountPicker();
    const list = wrapper.find('#settings-enabled-coins');
    await rows(wrapper)[2]!.trigger('keydown', { key: 'Enter' });
    expect(store.isCoinSelected('SOL')).toBe(true);
    await list.trigger('keydown', { key: ' ' });
    expect(store.isCoinSelected('SOL')).toBe(true); // no row targeted → no-op
  });

  it('sweeps a selection across rows on drag (:9424-9437)', async () => {
    const { wrapper, store } = await mountPicker();
    const rowEls = rows(wrapper).map((r) => r.element as HTMLElement);
    // stub hit-testing: y-bands of 20px map onto the rendered rows
    document.elementFromPoint = vi.fn((x: number, y: number): Element | null => {
      if (x < 0 || x >= 100) return null;
      const index = Math.floor(y / 20);
      return rowEls[index] ?? null;
    }) as typeof document.elementFromPoint;
    const first = rowEls[2]!.getBoundingClientRect();
    await rows(wrapper)[2]!.trigger('mousedown', { clientX: 10, clientY: first.top });
    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 10, clientY: first.top + 30 })
    );
    document.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.vm.$nextTick();
    expect(store.isCoinSelected('SOL')).toBe(true);
    expect(store.isDirty.value).toBe(true); // selection change dirties the form
  });

  it('does not toggle in auto-enable mode (disabled rows, :9299, :9390)', async () => {
    const { wrapper, store } = await mountPicker();
    store.setAutoEnableNewCoins(true);
    await wrapper.vm.$nextTick();
    const sol = rows(wrapper).find((r) => r.attributes('data-settings-coin-row') === 'SOL');
    await sol!.trigger('keydown', { key: 'Enter' });
    expect(store.selectedCoins.value.size).toBe(3); // unchanged (all selected)
  });

  it('filters through the filter input (:9627-9630)', async () => {
    const { wrapper, store } = await mountPicker();
    await wrapper.find('#settings-coin-filter').setValue('btc');
    expect(store.coinFilter.value).toBe('btc');
    expect(rows(wrapper).map((r) => r.attributes('data-settings-coin-row'))).toEqual(['BTC']);
    expect(wrapper.find('#settings-filtered-count').text()).toBe('1 visible');
  });

  it('select-visible adds the visible coins (:9672-9679)', async () => {
    const { wrapper, store } = await mountPicker();
    await wrapper.find('#settings-coin-filter').setValue('sol');
    await wrapper.find('#btn-select-all-coins').trigger('click');
    expect(store.isCoinSelected('SOL')).toBe(true);
    expect(store.isCoinSelected('BTC')).toBe(true);
  });

  it('clear-all empties the selection (:9680-9685)', async () => {
    const { wrapper, store } = await mountPicker();
    await wrapper.find('#btn-clear-all-coins').trigger('click');
    expect(store.selectedCoins.value.size).toBe(0);
    expect(wrapper.find('#settings-enabled-count').text()).toBe('0 selected / 3 total');
  });

  it('auto-enable checkbox change drives the store (:9631-9635)', async () => {
    const { wrapper, store } = await mountPicker();
    await wrapper.find('#settings-auto-enable-new-coins').trigger('click');
    expect(store.autoEnableNewCoins.value).toBe(true);
    expect(store.selectedCoins.value.size).toBe(3);
  });

  it('keeps the rendered order stable across a click toggle (no mid-session re-sort)', async () => {
    const { wrapper, store } = await mountPicker();
    await rows(wrapper)[0]!.trigger('mousedown'); // BTC
    document.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.vm.$nextTick();
    expect(store.isCoinSelected('BTC')).toBe(false);
    expect(rows(wrapper).map((r) => r.attributes('data-settings-coin-row'))).toEqual([
      'BTC',
      'ETH',
      'SOL',
    ]);
  });
});

describe('listener lifecycle', () => {
  it('unwires the document drag listeners on unmount', async () => {
    const { wrapper, store } = await mountPicker();
    const row = rows(wrapper)[2]!;
    await row.trigger('mousedown');
    wrapper.unmount();
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(store.isCoinSelected('SOL')).toBe(false); // nothing toggled after unmount
  });
});
