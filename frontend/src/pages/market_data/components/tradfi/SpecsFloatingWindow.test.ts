import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import SpecsFloatingWindow from './SpecsFloatingWindow.vue';
import { useTradfiMap, type TradfiMapPayload } from '../../composables/useTradfiMap';
import type { TradfiRow } from '../../lib/tradfiFilters';

/* SpecsFloatingWindow — legacy #tradfi-specs-window (market_data_main.html
   :3149-3166) with initTradfiSpecsWindow drag/resize (:5963-6110), the
   Escape close (:5973-5977), the search content (:5812-5902) and the specs
   table (:5904-5940). */

const T = (key: string): string => key;

function payloadFixture(rows: TradfiRow[]): TradfiMapPayload {
  return { rows, type_values: [], status_values: [], canonical_types: [], statuses: [] };
}

function makeWindow(rows: TradfiRow[] = [{ xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok' }]) {
  const fetchJson = vi.fn(async () => ({ success: true, payload: payloadFixture(rows) })) as never;
  const toasts: { message: string; level: string }[] = [];
  const map = useTradfiMap({
    api: { fetchJson },
    t: T,
    showToast: (message, level = 'info') => toasts.push({ message: String(message), level }),
    isTiingoConfigured: () => true,
  });
  const wrapper = mount(SpecsFloatingWindow, {
    props: { map },
    global: { plugins: [createI18n('en')] },
  });
  return { map, wrapper, toasts };
}

/** jsdom rects are all-zero — give the window a deterministic start rect. */
function mockRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ ...rect, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
}

function mouse(el: Element | Document, type: string, x: number, y: number): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('window visibility + close (:5948-5961, :5973-5977)', () => {
  it('mounts hidden until a mode opens it (:5948-5953)', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    expect(wrapper.find('#tradfi-specs-window').exists()).toBe(false);
    map.selectCoin('TSLA');
    map.searchTicker();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#tradfi-specs-window').classes()).toContain('visible');
    expect(wrapper.find('#tradfi-specs-window').attributes('aria-hidden')).toBe('false');
  });

  it('closes through the ✕ button and clears the mode (:5969-5971)', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    await wrapper.vm.$nextTick();
    await wrapper.find('#btn-tradfi-specs-close').trigger('click');
    expect(map.windowMode.value).toBe('');
    expect(wrapper.find('#tradfi-specs-window').exists()).toBe(false);
  });

  it('closes on Escape while visible (:5973-5977)', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    await wrapper.vm.$nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(map.windowMode.value).toBe('');
  });
});

describe('drag (:5979-6015)', () => {
  it('moves the window with clamping while dragging the header', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    await wrapper.vm.$nextTick();
    const el = wrapper.find('#tradfi-specs-window').element as HTMLElement;
    mockRect(el, { left: 100, top: 100, width: 600, height: 400 });
    const header = wrapper.find('#tradfi-specs-window-header');
    mouse(header.element, 'mousedown', 150, 120);
    mouse(document, 'mousemove', 450, 220); // +300/+100
    mouse(document, 'mouseup', 450, 220);
    await wrapper.vm.$nextTick();
    expect(el.style.left).toBe('400px');
    expect(el.style.top).toBe('200px');
    expect(el.style.width).toBe('600px'); // rect frozen at drag start
  });

  it('clamps the drag into the margins (:6000-6005)', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    await wrapper.vm.$nextTick();
    const el = wrapper.find('#tradfi-specs-window').element as HTMLElement;
    mockRect(el, { left: 100, top: 100, width: 600, height: 400 });
    const header = wrapper.find('#tradfi-specs-window-header');
    mouse(header.element, 'mousedown', 150, 120);
    mouse(document, 'mousemove', -5000, -5000);
    mouse(document, 'mouseup', -5000, -5000);
    await wrapper.vm.$nextTick();
    expect(el.style.left).toBe('8px');
    expect(el.style.top).toBe('56px');
  });

  it('ignores drags started on the close button (:5982)', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    await wrapper.vm.$nextTick();
    const el = wrapper.find('#tradfi-specs-window').element as HTMLElement;
    mockRect(el, { left: 100, top: 100, width: 600, height: 400 });
    const close = wrapper.find('#btn-tradfi-specs-close');
    mouse(close.element, 'mousedown', 150, 120);
    mouse(document, 'mousemove', 450, 220);
    mouse(document, 'mouseup', 450, 220);
    await wrapper.vm.$nextTick();
    expect(el.style.left).toBe(''); // untouched — CSS default position
  });
});

describe('resize (:6017-6091)', () => {
  it('grows the window from the se handle (:6042-6081)', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    await wrapper.vm.$nextTick();
    const el = wrapper.find('#tradfi-specs-window').element as HTMLElement;
    mockRect(el, { left: 200, top: 200, width: 800, height: 500 });
    const handle = wrapper.find('.tradfi-specs-resize-se');
    mouse(handle.element, 'mousedown', 1000, 700);
    mouse(document, 'mousemove', 1100, 760); // +100/+60
    mouse(document, 'mouseup', 1100, 760);
    await wrapper.vm.$nextTick();
    // jsdom viewport is 1024×768 → the east/south clamps cap the growth
    expect(el.style.width).toBe(`${1024 - 200 - 8}px`);
    expect(el.style.height).toBe(`${768 - 200 - 8}px`);
    expect(el.style.left).toBe('200px');
    expect(el.style.top).toBe('200px');
  });

  it('shrinks with the minimum enforced from the nw handle', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    await wrapper.vm.$nextTick();
    const el = wrapper.find('#tradfi-specs-window').element as HTMLElement;
    mockRect(el, { left: 200, top: 200, width: 800, height: 500 });
    const handle = wrapper.find('.tradfi-specs-resize-nw');
    mouse(handle.element, 'mousedown', 200, 200);
    mouse(document, 'mousemove', 1000, 1000); // massive shrink
    mouse(document, 'mouseup', 1000, 1000);
    await wrapper.vm.$nextTick();
    expect(el.style.width).toBe('520px');
    expect(el.style.height).toBe('320px');
    expect(el.style.left).toBe('480px'); // 200 + 800 - 520
    expect(el.style.top).toBe('380px'); // 200 + 500 - 320
  });
});

describe('viewport resize (:6093-6109)', () => {
  it('pulls the window back into the viewport', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    await wrapper.vm.$nextTick();
    const el = wrapper.find('#tradfi-specs-window').element as HTMLElement;
    mockRect(el, { left: 100, top: 100, width: 600, height: 400 });
    const header = wrapper.find('#tradfi-specs-window-header');
    mouse(header.element, 'mousedown', 150, 120);
    mouse(document, 'mousemove', 450, 220); // to 400/200
    mouse(document, 'mouseup', 450, 220);
    await wrapper.vm.$nextTick();
    expect(el.style.left).toBe('400px');
    // shrink the viewport (staying above the 700px mobile breakpoint so the
    // clamp branch, not the CSS reset, runs)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(720);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    mockRect(el, { left: 400, top: 200, width: 600, height: 400 });
    window.dispatchEvent(new Event('resize'));
    await wrapper.vm.$nextTick();
    expect(el.style.left).toBe(`${Math.max(8, 720 - 600 - 8)}px`); // 112
    expect(el.style.top).toBe('192px'); // 600-400-8
  });
});

describe('search content (:5812-5902)', () => {
  it('shows the select-a-row empty state without a selection (:5823-5829)', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.windowMode.value = 'search';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tradfi-search-window-empty').text()).toBe('Select a TradFi mapping row first.');
  });

  it('renders the query controls, statuses and results with Apply (:5849-5889)', async () => {
    const { map, wrapper } = makeWindow([
      { xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok', hl_price: 250.5 },
    ]);
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#tradfi-specs-window-title').text()).toBe('Search Tiingo Ticker');
    expect(wrapper.find('.tradfi-search-window-caption').text()).toContain('Tiingo Search API');
    const input = wrapper.find('#tradfi-search-window-query');
    expect((input.element as HTMLInputElement).value).toBe('TSLA'); // rowCoin fallback
    const run = wrapper.find('#btn-tradfi-search-window-run');
    expect(run.text()).toBe('Search');

    map.searchCoin.value = 'TSLA';
    map.searchQuery.value = 'tesla';
    map.searchResults.value = [
      {
        ticker: 'TSLA',
        name: 'Tesla, Inc.',
        asset_type: 'Equity',
        is_active: true,
        tiingo_price: 249.25,
        tiingo_price_timestamp: '2026-08-15T10:20:30Z',
        tiingo_price_source: 'iex_search',
      },
      { ticker: 'TSLA2', name: 'Other', asset_type: 'Equity', is_active: false },
    ];
    map.searchMessage.value = 'found';
    map.searchMessageLevel.value = 'success';
    await wrapper.vm.$nextTick();
    expect((input.element as HTMLInputElement).value).toBe('tesla');
    expect(wrapper.find('.tradfi-search-window-status.success').text()).toBe('found');
    const items = wrapper.findAll('.tradfi-search-item');
    expect(items).toHaveLength(2);
    expect(items[0]!.find('.tradfi-search-item-main .tradfi-search-title').text()).toBe(
      'TSLA · Tesla, Inc.'
    );
    const metas = items[0]!.findAll('.tradfi-search-meta').map((m) => m.text());
    expect(metas[0]).toBe('Equity · active');
    expect(metas[1]).toBe('Tiingo price: 249.2500 · 2026-08-15 10:20:30 UTC');
    expect(metas[2]).toBe('Hyperliquid price: 250.5000');
    expect(items[1]!.findAll('.tradfi-search-meta')[0]!.text()).toBe('Equity · inactive');
    expect(items[1]!.find('.tradfi-search-meta').exists()).toBe(true);
  });

  it('shows the cached-price label for non-iex sources (:5872)', async () => {
    const { map, wrapper } = makeWindow([
      { xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok', hl_price: null },
    ]);
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchCoin.value = 'TSLA';
    map.searchResults.value = [{ ticker: 'TSLA', name: 'Tesla', tiingo_price: 1, tiingo_price_source: 'cache' }];
    map.windowMode.value = 'search';
    await wrapper.vm.$nextTick();
    const metas = wrapper.findAll('.tradfi-search-item')[0]!.findAll('.tradfi-search-meta');
    expect(metas[1]!.text()).toBe('Tiingo cached price: 1.0000');
    expect(metas[2]!.text()).toBe('Hyperliquid price: unavailable'); // null hl_price
  });

  it('runs the search on Enter and the run button (:9654-9671)', async () => {
    const { map, wrapper } = makeWindow([
      { xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok' },
    ]);
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    const run = vi.fn();
    map.runSearch = run;
    await wrapper.vm.$nextTick();
    await wrapper.find('#tradfi-search-window-query').setValue('  ev  ');
    await wrapper.find('#tradfi-search-window-query').trigger('keydown', { key: 'Enter' });
    expect(run).toHaveBeenCalledWith('  ev  '); // live input text, trimmed in the controller
    await wrapper.find('#btn-tradfi-search-window-run').trigger('click');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('applies a result through its Apply button (:9660-9664)', async () => {
    const { map, wrapper } = makeWindow([
      { xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok' },
    ]);
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchCoin.value = 'TSLA';
    map.searchResults.value = [{ ticker: 'TSLA', name: 'Tesla' }];
    map.windowMode.value = 'search';
    const apply = vi.fn();
    map.applySearchResult = apply;
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-tradfi-search-index="0"]').trigger('click');
    expect(apply).toHaveBeenCalledWith(0);
  });

  it('disables the run button while searching (:5860)', async () => {
    const { map, wrapper } = makeWindow([
      { xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok' },
    ]);
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchCoin.value = 'TSLA';
    map.searchLoading.value = true;
    map.windowMode.value = 'search';
    await wrapper.vm.$nextTick();
    const run = wrapper.find('#btn-tradfi-search-window-run');
    expect(run.attributes('disabled')).toBeDefined();
    expect(run.text()).toBe('Searching...');
  });
});

describe('specs content (:5904-5946)', () => {
  it('shows the loading message while fetching (:5942-5946)', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.specsLoadingMessage.value = 'Loading XYZ specs cache...';
    map.windowMode.value = 'specs';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tradfi-specs-window-empty').text()).toBe('Loading XYZ specs cache...');
  });

  it('renders the specs table with links and meta (:5914-5939)', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.specsPayload.value = {
      fetched_at: '2026-08-16T01:02:03',
      rows: [
        {
          xyz_coin: 'TSLA',
          canonical_type: 'equity_us',
          description: 'Tesla',
          pyth_link: 'https://pyth.link/tsla',
          hl_link: 'https://hl.link/tsla',
        },
        { xyz_coin: 'XAU', instrument_label: 'Gold' },
      ],
    };
    map.windowMode.value = 'specs';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#tradfi-specs-window-title').text()).toBe('XYZ Specs');
    expect(wrapper.find('.tradfi-specs-window-subtitle').text()).toBe('Floating cache viewer');
    const metas = wrapper.findAll('.tradfi-specs-window-meta .tradfi-search-meta');
    expect(metas[0]!.text()).toBe('2026-08-16 01:02:03 UTC');
    expect(metas[1]!.text()).toBe('2 rows');
    const headers = wrapper.findAll('.tradfi-specs-table th').map((th) => th.text());
    expect(headers).toEqual(['XYZ', 'Type', 'Description', 'Pyth', 'HL']);
    const first = wrapper.findAll('.tradfi-specs-table tbody tr')[0]!;
    expect(first.find('td strong').text()).toBe('TSLA');
    expect(first.findAll('a')[0]!.attributes('href')).toBe('https://pyth.link/tsla');
    expect(first.findAll('a')[0]!.text()).toBe('Open Pyth');
    const second = wrapper.findAll('.tradfi-specs-table tbody tr')[1]!;
    expect(second.findAll('td')[2]!.text()).toBe('Gold'); // description || instrument_label
  });

  it('shows the no-specs empty state (:5910-5912)', async () => {
    const { map, wrapper } = makeWindow();
    await map.loadMappings();
    map.specsPayload.value = { rows: [] };
    map.windowMode.value = 'specs';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tradfi-specs-window-empty').text()).toBe('No XYZ specs cache loaded.');
  });
});
