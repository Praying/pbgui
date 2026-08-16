import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from '@/shared/i18n';
import TradfiMapTable from './TradfiMapTable.vue';
import {
  useTradfiMap,
  type TradfiActionResponse,
  type TradfiMapPayload,
} from '../../composables/useTradfiMap';
import type { TradfiRow } from '../../lib/tradfiFilters';

/* TradfiMapTable — the filter grid + count + table slice of
   #settings-hyperliquid-tradfi-map (market_data_main.html:3111-3130 and the
   renderTradfiMap table :6553-6595, click-select :9648-9652). */

const T = (key: string): string => key;

// the controller interpolates visibleTotal with its injected t — use the
// real dictionary so rendered numbers are asserted, not the raw key
const i18n = createI18n('en');
const REAL_T = i18n.global.t.bind(i18n.global);

function rowsFixture(): TradfiRow[] {
  return [
    {
      xyz_coin: 'TSLA',
      canonical_type: 'equity_us',
      status: 'ok',
      tiingo_ticker: 'TSLA',
      hl_price: 250.5,
      tiingo_price: 249.25,
      description: 'Tesla',
      note: 'watch',
      hl_link: 'https://hl.link/tsla',
      pyth_link: 'https://pyth.link/tsla',
      tiingo_start_date: '2010-06-29',
      tiingo_fetch_start: '2010-06-30',
      last_verified: '2026-08-15T10:20:30Z',
      _in_map: true,
    },
    { xyz_coin: 'XAU', canonical_type: 'fx', status: 'alias', tiingo_fx_ticker: 'XAUUSD' },
  ];
}

function payloadFixture(): TradfiMapPayload {
  return {
    rows: rowsFixture(),
    type_values: ['equity_us', 'fx'],
    status_values: ['ok', 'alias'],
    canonical_types: ['equity_us', 'fx'],
    statuses: ['ok', 'alias'],
  };
}

function makeTable(handler: () => TradfiActionResponse = () => ({
  success: true,
  payload: payloadFixture(),
})) {
  const fetchJson = vi.fn(async () => handler()) as never;
  const toasts: { message: string; level: string }[] = [];
  const map = useTradfiMap({
    api: { fetchJson },
    t: REAL_T,
    showToast: (message, level = 'info') => toasts.push({ message: String(message), level }),
    isTiingoConfigured: () => true,
  });
  const wrapper = mount(TradfiMapTable, {
    props: { map },
    global: { plugins: [createI18n('en')] },
  });
  return { map, wrapper, toasts };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the map table (:3111-3130, :6553-6595)', () => {
  it('renders the filter grid with the legacy ids and option lists (:6529-6530)', async () => {
    const { map, wrapper } = makeTable();
    await map.loadMappings();
    const type = wrapper.find('#tradfi-filter-type');
    expect(
      type.findAll('option').map((o) => o.element.value)
    ).toEqual(['all', 'equity_us', 'fx']);
    expect(
      wrapper.find('#tradfi-filter-status').findAll('option').map((o) => o.element.value)
    ).toEqual(['all', 'ok', 'alias']);
    expect(wrapper.find('#tradfi-filter-symbol').exists()).toBe(true);
  });

  it('renders the 12 legacy columns (:6555-6568)', async () => {
    const { map, wrapper } = makeTable();
    await map.loadMappings();
    expect(wrapper.findAll('.tradfi-map-table th').map((th) => th.text())).toEqual([
      'Symbol',
      'HL Price',
      'Tiingo Price',
      'Description',
      'Pyth',
      'Type',
      'Tiingo Symbol',
      'Status',
      'Start Date',
      'Fetch Start',
      'Verified',
      'Note',
    ]);
  });

  it('renders row cells with formatted values and links (:6570-6592)', async () => {
    const { map, wrapper } = makeTable();
    await map.loadMappings();
    const cells = wrapper.findAll('.tradfi-map-table tbody tr')[0]!.findAll('td');
    const symbolLink = cells[0]!.find('a.tradfi-table-link');
    expect(symbolLink.attributes('href')).toBe('https://hl.link/tsla');
    expect(symbolLink.text()).toBe('XYZ:TSLA');
    expect(cells[1]!.text()).toBe('250.5000'); // formatTradfiPrice
    expect(cells[2]!.text()).toBe('249.2500');
    expect(cells[3]!.text()).toBe('Tesla');
    expect(cells[4]!.find('a').attributes('href')).toBe('https://pyth.link/tsla');
    expect(cells[5]!.text()).toBe('equity_us');
    expect(cells[6]!.text()).toBe('IEX:TSLA'); // tiingo_symbol || buildTradfiSymbol
    expect(cells[7]!.find('.tradfi-pill').text()).toBe('ok');
    expect(cells[8]!.text()).toBe('2010-06-29');
    expect(cells[9]!.text()).toBe('2010-06-30');
    expect(cells[10]!.text()).toBe('2026-08-15 10:20:30'); // formatTradfiTimestamp
    expect(cells[11]!.attributes('title')).toBe('watch');
    // fx row: strong symbol, no links
    const fx = wrapper.findAll('.tradfi-map-table tbody tr')[1]!.findAll('td');
    expect(fx[0]!.find('strong').text()).toBe('XAU');
    expect(fx[6]!.text()).toBe('FX:XAUUSD');
  });

  it('selects a row on click and marks it (:9648-9652)', async () => {
    const { map, wrapper } = makeTable();
    await map.loadMappings();
    await wrapper.findAll('.tradfi-map-table tbody tr')[1]!.trigger('click');
    expect(map.selectedCoin.value).toBe('XAU');
    expect(wrapper.findAll('.tradfi-map-table tbody tr')[1]!.classes()).toContain('is-selected');
  });

  it('wires the filter inputs to the controller (:9636-9647)', async () => {
    const { map, wrapper } = makeTable();
    await map.loadMappings();
    await wrapper.find('#tradfi-filter-symbol').setValue('xau');
    expect(map.filters.symbol).toBe('xau');
    expect(map.filteredRows.value.map((r) => r.xyz_coin)).toEqual(['XAU']);
    await wrapper.find('#tradfi-filter-type').setValue('equity_us');
    expect(map.filters.type).toBe('equity_us');
    expect(map.filteredRows.value).toEqual([]);
  });

  it('shows the count note (:6539-6542)', async () => {
    const { map, wrapper } = makeTable();
    await map.loadMappings();
    expect(wrapper.find('#tradfi-map-count').text()).toBe('2 visible / 2 total');
    await wrapper.find('#tradfi-filter-symbol').setValue('xau');
    expect(wrapper.find('#tradfi-map-count').text()).toBe('1 visible / 2 total');
  });

  it('shows the empty state when nothing matches (:6546-6547)', async () => {
    const { map, wrapper } = makeTable();
    await map.loadMappings();
    await wrapper.find('#tradfi-filter-symbol').setValue('zzz');
    expect(wrapper.find('.tradfi-table-wrap .tradfi-empty').text()).toBe(
      'No TradFi symbol mappings match the current filter.'
    );
  });

  it('shows the load error in the table host (:6622-6625)', async () => {
    const { map, wrapper } = makeTable(() => ({ success: false, error: 'map down' }));
    await map.loadMappings();
    expect(wrapper.find('.tradfi-table-wrap .tradfi-empty').text()).toBe('map down');
  });

  it('renders the waiting note before the first load (:3129)', () => {
    const { wrapper } = makeTable();
    expect(wrapper.find('#tradfi-map-count').text()).toBe('Waiting for TradFi symbol map...');
  });
});
