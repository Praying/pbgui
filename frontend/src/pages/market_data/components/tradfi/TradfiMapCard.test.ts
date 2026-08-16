import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import TradfiMapCard from './TradfiMapCard.vue';
import { useTradfiMap, type TradfiMapPayload } from '../../composables/useTradfiMap';
import type { TradfiRow } from '../../lib/tradfiFilters';

/* TradfiMapCard — legacy #settings-hyperliquid-tradfi-map
   (market_data_main.html:3105-3218): the ten action buttons (:3131-3145,
   enabled states :6388-6410), the cache note (:3146), the action-result
   host (:3147) and the editor (:3168). */

const T = (key: string): string => key;

function payloadFixture(rows: TradfiRow[]): TradfiMapPayload {
  return {
    rows,
    type_values: ['equity_us'],
    status_values: ['ok'],
    canonical_types: ['equity_us'],
    statuses: ['ok'],
    meta_cache_info: { summary: 'meta' },
    quote_cache_info: { summary: 'quote' },
    spec_cache_info: { summary: 'spec' },
  };
}

function makeCard(rows: TradfiRow[] = [{ xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok', tiingo_ticker: 'TSLA' }]) {
  const fetchJson = vi.fn(async () => ({ success: true, payload: payloadFixture(rows) })) as never;
  const toasts: { message: string; level: string }[] = [];
  const map = useTradfiMap({
    api: { fetchJson },
    t: T,
    showToast: (message, level = 'info') => toasts.push({ message: String(message), level }),
    isTiingoConfigured: () => true,
  });
  const wrapper = mount(TradfiMapCard, {
    props: { map },
    global: { plugins: [createI18n('en')] },
  });
  return { map, wrapper, toasts };
}

const BUTTON_IDS = [
  'btn-tradfi-search-ticker',
  'btn-tradfi-edit-selected',
  'btn-tradfi-test-resolve',
  'btn-tradfi-fetch-start-date',
  'btn-tradfi-spec-refresh',
  'btn-tradfi-auto-map',
  'btn-tradfi-fetch-all-start-dates',
  'btn-tradfi-refresh-metadata',
  'btn-tradfi-refresh-prices',
  'btn-tradfi-view-specs',
] as const;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the tradfi map card (:3105-3218)', () => {
  it('renders the card with the ten legacy buttons (:3131-3145)', async () => {
    const { map, wrapper } = makeCard();
    await map.loadMappings();
    expect(wrapper.find('#settings-hyperliquid-tradfi-map').exists()).toBe(true);
    for (const id of BUTTON_IDS) {
      expect(wrapper.find(`#${id}`).exists(), id).toBe(true);
    }
  });

  it('disables the selection buttons until a row is picked (:6394-6397)', async () => {
    const { map, wrapper } = makeCard();
    await map.loadMappings();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#btn-tradfi-edit-selected').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#btn-tradfi-spec-refresh').attributes('disabled')).toBeUndefined();
    map.selectCoin('TSLA');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#btn-tradfi-edit-selected').attributes('disabled')).toBeUndefined();
  });

  it('disables the key-gated buttons without a tiingo key (:6399-6402)', async () => {
    const fetchJson = vi.fn(async () => ({ success: true, payload: payloadFixture([]) })) as never;
    const map = useTradfiMap({
      api: { fetchJson },
      t: T,
      showToast: () => undefined,
      isTiingoConfigured: () => false,
    });
    const wrapper = mount(TradfiMapCard, {
      props: { map },
      global: { plugins: [createI18n('en')] },
    });
    await map.loadMappings();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#btn-tradfi-auto-map').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#btn-tradfi-search-ticker').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#btn-tradfi-view-specs').attributes('disabled')).toBeUndefined();
  });

  it('shows the cache note from the payload (:3146, :6112-6119)', async () => {
    const { map, wrapper } = makeCard();
    await map.loadMappings();
    expect(wrapper.find('#tradfi-cache-note').text()).toBe('meta · quote · spec');
  });

  it('renders the action result box and closes it (:3147, :5801-5802)', async () => {
    const { map, wrapper } = makeCard();
    await map.loadMappings();
    map.setActionResult('success', 'Done.', ['line']);
    await wrapper.vm.$nextTick();
    const box = wrapper.find('#tradfi-action-result .tradfi-feedback');
    expect(box.classes()).toContain('success');
    expect(box.text()).toContain('Done.');
    await wrapper.find('.tradfi-feedback-close').trigger('click');
    expect(map.actionResult.value).toBeNull();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#tradfi-action-result .tradfi-feedback').exists()).toBe(false);
  });

  it('wires the ten buttons to their controller actions (:9695-9724)', async () => {
    const { map, wrapper } = makeCard();
    await map.loadMappings();
    const spies = {
      searchTicker: vi.fn(),
      editSelected: vi.fn(),
      testResolve: vi.fn(),
      fetchStartDate: vi.fn(),
      refreshSpecs: vi.fn(),
      autoMap: vi.fn(),
      fetchAllStartDates: vi.fn(),
      refreshMetadata: vi.fn(),
      refreshPrices: vi.fn(),
      loadSpecsView: vi.fn(),
    };
    Object.assign(map, spies);
    map.selectCoin('TSLA');
    await wrapper.vm.$nextTick();
    for (const id of BUTTON_IDS) {
      await wrapper.find(`#${id}`).trigger('click');
    }
    expect(spies.searchTicker).toHaveBeenCalledTimes(1);
    expect(spies.editSelected).toHaveBeenCalledTimes(1);
    expect(spies.testResolve).toHaveBeenCalledTimes(1);
    expect(spies.fetchStartDate).toHaveBeenCalledTimes(1);
    expect(spies.refreshSpecs).toHaveBeenCalledTimes(1);
    expect(spies.autoMap).toHaveBeenCalledTimes(1);
    expect(spies.fetchAllStartDates).toHaveBeenCalledTimes(1);
    expect(spies.refreshMetadata).toHaveBeenCalledTimes(1);
    expect(spies.refreshPrices).toHaveBeenCalledTimes(1);
    expect(spies.loadSpecsView).toHaveBeenCalledTimes(1);
  });
});
