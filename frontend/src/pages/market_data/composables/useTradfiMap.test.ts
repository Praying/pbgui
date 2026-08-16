import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useTradfiMap, type TradfiApi, type TradfiMapPayload } from './useTradfiMap';
import type { TradfiRow } from '../lib/tradfiFilters';

/* The TradFi map controller — legacy market_data_main.html:
   state :3764-3783, updateTradfiActionButtons :6388-6410, resetTradfiEditor
   :6412-6431, syncTradfiEditor :6441-6466, renderTradfiMap :6508-6604,
   loadTradfiMappings :6606-6627, applyTradfiPayload :6629-6635,
   searchTradfiTicker/runTradfiTickerSearch/applyTradfiSearchResult
   :6637-6736, edit/cancel :6738-6752, the seven action endpoints
   :6754-6975, saveTradfiMapping :6977-7013, renderTradfiActionResult
   :5747-5803, renderTradfiCacheNote :6112-6119 and the non-hyperliquid
   reset :7399-7401. */

const T = (key: string): string => key;

function rowsFixture(): TradfiRow[] {
  return [
    {
      xyz_coin: 'TSLA',
      canonical_type: 'equity_us',
      status: 'ok',
      tiingo_ticker: 'TSLA',
      hl_price: 250.5,
      description: 'Tesla',
      note: 'n1',
      _in_map: true,
    },
    {
      xyz_coin: 'XAU',
      canonical_type: 'fx',
      status: 'alias',
      tiingo_ticker: '',
      tiingo_fx_ticker: 'XAUUSD',
      tiingo_price: 2400,
      _in_map: false,
    },
    { xyz_coin: 'KRW', canonical_type: 'equity_kr', status: 'pending', _in_map: true },
  ];
}

function payloadFixture(overrides: Partial<TradfiMapPayload> = {}): TradfiMapPayload {
  return {
    rows: rowsFixture(),
    type_values: ['equity_us', 'equity_kr', 'fx'],
    status_values: ['ok', 'alias', 'pending', 'no_provider'],
    canonical_types: ['equity_us', 'equity_kr', 'equity_jp', 'fx'],
    statuses: ['ok', 'alias', 'pending', 'no_provider', 'delisted'],
    meta_cache_info: { summary: 'meta 1h' },
    quote_cache_info: { summary: 'quote 5m' },
    spec_cache_info: { summary: 'spec 1d' },
    ...overrides,
  };
}

interface ToastCapture {
  messages: { message: string; level: string }[];
  showToast: (message: unknown, level?: string) => void;
}

function toastCapture(): ToastCapture {
  const messages: { message: string; level: string }[] = [];
  return {
    messages,
    showToast: (message, level = 'info') => messages.push({ message: String(message), level }),
  };
}

function makeMap(
  handler: (path: string, init?: RequestInit) => unknown = () => ({
    success: true,
    payload: payloadFixture(),
  }),
  isTiingoConfigured = () => true
) {
  const fetchJson = vi.fn(async (path: string, init?: RequestInit) =>
    handler(path, init)
  ) as TradfiApi['fetchJson'];
  const toasts = toastCapture();
  const map = useTradfiMap({
    api: { fetchJson },
    t: T,
    showToast: toasts.showToast,
    isTiingoConfigured,
  });
  return { map, fetchJson, toasts };
}

describe('loadTradfiMappings (:6606-6627)', () => {
  it('fetches the map and applies rows + options + cache note', async () => {
    const { map, fetchJson } = makeMap();
    await map.loadMappings();
    expect(fetchJson).toHaveBeenCalledWith('/settings/hyperliquid/tradfi-map');
    expect(map.rows.value.map((row) => row.xyz_coin)).toEqual(['TSLA', 'XAU', 'KRW']);
    expect(map.optionLists.value.typeValues).toEqual(['equity_us', 'equity_kr', 'fx']);
    expect(map.cacheNote.value).toBe('meta 1h · quote 5m · spec 1d');
    expect(map.loadError.value).toBe('');
  });

  it('adopts the payload selected coin (:6616-6618)', async () => {
    const { map } = makeMap(() => ({
      success: true,
      payload: payloadFixture({ selected_xyz_coin: 'XAU' }),
    }));
    await map.loadMappings();
    expect(map.selectedCoin.value).toBe('XAU');
    expect(map.selectedRow.value?.xyz_coin).toBe('XAU');
  });

  it('drops a selected coin that the filters hide (:6535-6537)', async () => {
    const { map } = makeMap(() => ({
      success: true,
      payload: payloadFixture({ selected_xyz_coin: 'XAU' }),
    }));
    await map.loadMappings();
    map.setFilterType('equity_us');
    expect(map.selectedCoin.value).toBe('');
  });

  it('shows the server error in the table host (:6613-6615, :6620-6625)', async () => {
    const { map } = makeMap(() => ({ success: false, error: 'map exploded' }));
    await map.loadMappings();
    expect(map.loadError.value).toBe('map exploded');
  });

  it('falls back to the generic load error (:6614)', async () => {
    const { map } = makeMap(() => ({ success: false }));
    await map.loadMappings();
    expect(map.loadError.value).toBe('market.failedLoadTradfiMap');
  });

  it('rejects a stale response when a newer load started (:6608-6612, R4)', async () => {
    const releases: ((value: unknown) => void)[] = [];
    const { map } = makeMap(
      () => new Promise((resolve) => releases.push(resolve))
    );
    const first = map.loadMappings();
    const second = map.loadMappings();
    for (const release of releases) {
      release({ success: true, payload: payloadFixture({ selected_xyz_coin: 'KRW' }) });
    }
    await Promise.all([first, second]);
    expect(map.selectedCoin.value).toBe('KRW'); // only the second (current) request applies
  });
});

describe('filters (:9636-9647 → renderTradfiMap re-render)', () => {
  it('filters by symbol/type/status through the reactive pipeline', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.setFilterSymbol('xau');
    expect(map.filteredRows.value.map((row) => row.xyz_coin)).toEqual(['XAU']);
    map.setFilterSymbol('');
    map.setFilterType('equity_kr');
    expect(map.filteredRows.value.map((row) => row.xyz_coin)).toEqual(['KRW']);
    map.setFilterType('all');
    map.setFilterStatus('alias');
    expect(map.filteredRows.value.map((row) => row.xyz_coin)).toEqual(['XAU']);
    map.setFilterStatus('all');
    expect(map.filteredRows.value).toHaveLength(3);
  });

  it('normalizes filter option lists through the select sync (:6529-6532)', async () => {
    const { map } = makeMap(() => ({
      success: true,
      payload: payloadFixture({ type_values: ['fx'] }),
    }));
    await map.loadMappings();
    expect(map.optionLists.value.typeValues).toEqual(['fx']);
  });
});

describe('row selection (:9648-9652)', () => {
  it('selects a row on click', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.selectCoin('KRW');
    expect(map.selectedCoin.value).toBe('KRW');
    expect(map.selectedRow.value?.canonical_type).toBe('equity_kr');
  });

  it('re-syncs an open editor onto the newly selected row (:6600)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.editSelected();
    expect(map.editor.xyzCoin).toBe('TSLA');
    map.selectCoin('XAU');
    expect(map.editor.xyzCoin).toBe('XAU'); // open editor follows the selection
  });
});

describe('the editor (:6412-6466, :6738-6752)', () => {
  it('resets to the legacy defaults (:6415-6423)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.resetEditor({});
    expect(map.editor).toEqual({
      xyzCoin: '',
      canonicalType: 'equity_us',
      status: 'pending',
      description: '',
      tiingoTicker: '',
      tiingoFxTicker: '',
      tiingoStartDate: '',
      note: '',
      fxInvert: false,
    });
    expect(map.selectedCoin.value).toBe('');
    expect(map.editorOpen.value).toBe(false);
    expect(map.xyzReadOnly.value).toBe(false);
  });

  it('syncs a row into the editor read-only with defaults (:6447-6458)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.selectCoin('KRW'); // canonical_type equity_kr, status pending, no tickers
    map.syncEditor(map.selectedRow.value);
    expect(map.editor.xyzCoin).toBe('KRW');
    expect(map.editor.canonicalType).toBe('equity_kr');
    expect(map.editor.status).toBe('pending');
    expect(map.xyzReadOnly.value).toBe(true);
    expect(map.editorOpen.value).toBe(false); // sync alone does not open
    expect(map.editorMode.value).toEqual({ kind: 'saved', coin: 'KRW' }); // _in_map true
  });

  it('marks rows outside the saved map as from-json (:6461-6463)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.selectCoin('XAU'); // _in_map false
    map.syncEditor(map.selectedRow.value);
    expect(map.editorMode.value).toEqual({ kind: 'json', coin: 'XAU' });
  });

  it('defaults missing canonical type/status when syncing (:6449-6450)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.syncEditor({ xyz_coin: 'NEW' } as TradfiRow);
    expect(map.editor.canonicalType).toBe('equity_us');
    expect(map.editor.status).toBe('pending');
    expect(map.editorMode.value).toEqual({ kind: 'json', coin: 'NEW' });
  });

  it('editSelected opens the editor for the selection (:6738-6746)', async () => {
    const { map, toasts } = makeMap();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.editSelected();
    expect(map.editorOpen.value).toBe(true);
    expect(map.editor.tiingoTicker).toBe('TSLA');
    map.editSelected();
    expect(toasts.messages).toEqual([]); // selection existed both times
  });

  it('editSelected without a selection toasts (:6740-6742)', async () => {
    const { map, toasts } = makeMap();
    await map.loadMappings();
    map.editSelected();
    expect(toasts.messages).toEqual([
      { message: 'market.selectTradfiRow', level: 'error' },
    ]);
    expect(map.editorOpen.value).toBe(false);
  });

  it('cancel closes the editor but keeps a live selection (:6748-6752)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.editSelected();
    map.editor.description = 'dirty';
    map.cancelEditor();
    expect(map.editorOpen.value).toBe(false);
    expect(map.selectedCoin.value).toBe('TSLA'); // preserveSelection
    expect(map.editor.description).toBe(''); // reset fields
  });
});

describe('updateTradfiActionButtons (:6388-6410)', () => {
  it('disables per selection + tiingo key + equity ticker', async () => {
    // a ref, so the computed re-evaluates when the vault state flips
    const configured = ref(false);
    const { map } = makeMap(
      () => ({ success: true, payload: payloadFixture() }),
      () => configured.value
    );
    await map.loadMappings();
    expect(map.actionButtons.value).toEqual({
      searchTicker: true,
      editSelected: true,
      testResolve: true,
      fetchStartDate: true,
      specRefresh: false,
      autoMap: true,
      fetchAllStartDates: true,
      refreshMetadata: true,
      refreshPrices: true,
      viewSpecs: false,
    });
    configured.value = true;
    expect(map.actionButtons.value.autoMap).toBe(false);    map.selectCoin('XAU'); // fx row — no equity ticker
    expect(map.actionButtons.value.searchTicker).toBe(false);
    expect(map.actionButtons.value.editSelected).toBe(false);
    expect(map.actionButtons.value.fetchStartDate).toBe(true); // no equity ticker
    map.selectCoin('TSLA'); // equity row
    expect(map.actionButtons.value.fetchStartDate).toBe(false);
  });
});

describe('saveTradfiMapping (:6977-7013)', () => {
  it('uppercases the typed fields while collecting (:6978-6995)', async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const { map } = makeMap((path, init) => {
      calls.push({ path, init });
      return { success: true, payload: payloadFixture({ selected_xyz_coin: 'MYCOIN' }), message: 'saved!' };
    });
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.editSelected();
    map.editor.xyzCoin = 'mycoin';
    map.editor.description = 'My Coin';
    map.editor.tiingoTicker = 'myc';
    map.editor.tiingoFxTicker = 'eurusd';
    map.editor.tiingoStartDate = '2020-01-02';
    map.editor.note = 'note';
    map.editor.fxInvert = true;
    map.editor.canonicalType = 'fx';
    map.editor.status = 'alias';
    expect(await map.saveMapping()).toBe(true);
    const save = calls.find(
      (call) => call.path === '/settings/hyperliquid/tradfi-map' && call.init?.method === 'POST'
    );
    expect(JSON.parse(String(save?.init?.body))).toEqual({
      entry: {
        xyz_coin: 'MYCOIN',
        canonical_type: 'fx',
        description: 'My Coin',
        tiingo_ticker: 'MYC',
        tiingo_fx_ticker: 'EURUSD',
        tiingo_fx_invert: true,
        tiingo_start_date: '2020-01-02',
        status: 'alias',
        note: 'note',
        spec_source: 'manual',
      },
    });
  });

  it('sends the collected entry to the map endpoint', async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const { map } = makeMap((path, init) => {
      calls.push({ path, init });
      return { success: true, payload: payloadFixture({ selected_xyz_coin: 'MYCOIN' }), message: 'saved!' };
    });
    await map.loadMappings();
    map.editor.xyzCoin = 'mycoin';
    map.editor.description = 'D';
    await map.saveMapping();
    const save = calls.find((call) => call.path === '/settings/hyperliquid/tradfi-map' && call.init?.method === 'POST');
    expect(save).toBeDefined();
    expect(JSON.parse(String(save?.init?.body))).toEqual({
      entry: {
        xyz_coin: 'MYCOIN',
        canonical_type: 'equity_us',
        description: 'D',
        tiingo_ticker: '',
        tiingo_fx_ticker: '',
        tiingo_fx_invert: false,
        tiingo_start_date: '',
        status: 'pending',
        note: '',
        spec_source: 'manual',
      },
    });
  });

  it('rejects an empty xyz coin (:6978-6981)', async () => {
    const { map, toasts } = makeMap();
    await map.loadMappings();
    const saved = await map.saveMapping();
    expect(saved).toBe(false);
    expect(toasts.messages).toEqual([{ message: 'market.xyzCoinEmpty', level: 'error' }]);
  });

  it('adopts the returned selection and toasts (:7005-7008)', async () => {
    const rows = [...rowsFixture(), { xyz_coin: 'MYCOIN', canonical_type: 'equity_us', status: 'ok' }];
    const { map, toasts } = makeMap(() => ({
      success: true,
      message: 'TradFi symbol mapping saved.',
      payload: payloadFixture({ rows, selected_xyz_coin: 'MYCOIN' }),
    }));
    await map.loadMappings();
    map.editor.xyzCoin = 'mycoin';
    await map.saveMapping();
    expect(map.selectedCoin.value).toBe('MYCOIN');
    expect(toasts.messages).toEqual([
      { message: 'TradFi symbol mapping saved.', level: 'success' },
    ]);
  });

  it('falls back to the typed coin but prunes it when the payload lacks it (:7005 + :6535)', async () => {
    const { map } = makeMap(() => ({ success: true, payload: payloadFixture() }));
    await map.loadMappings();
    map.editor.xyzCoin = 'fresh';
    await map.saveMapping();
    // The legacy render prunes a selection the rows do not contain; the real
    // server always echoes the upserted row so this only bites odd fixtures.
    expect(map.selectedCoin.value).toBe('');
  });

  it('toasts the failure and returns false (:7009-7012)', async () => {
    const { map, toasts } = makeMap(() => ({ success: false, error: 'nope' }));
    await map.loadMappings();
    map.editor.xyzCoin = 'mycoin';
    const saved = await map.saveMapping();
    expect(saved).toBe(false);
    expect(toasts.messages).toEqual([{ message: 'nope', level: 'error' }]);
  });
});

describe('searchTradfiTicker (:6637-6650)', () => {
  it('opens the search window for the selected row and resets per-coin state', async () => {
    const { map, toasts } = makeMap();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchResults.value = [{ ticker: 'OLD' } as never];
    map.searchMessage.value = 'stale';
    map.searchTicker();
    expect(map.windowMode.value).toBe('search');
    expect(map.searchCoin.value).toBe(''); // :6643 — only runSearch sets the coin
    expect(map.searchResults.value).toEqual([{ ticker: 'OLD' }]); // :6645-6648 — results survive
    expect(map.searchMessage.value).toBe('');
    expect(map.searchLoading.value).toBe(false);
    expect(toasts.messages).toEqual([]);
  });

  it('toasts when nothing is selected (:6639-6641)', async () => {
    const { map, toasts } = makeMap();
    await map.loadMappings();
    map.searchTicker();
    expect(toasts.messages).toEqual([{ message: 'market.selectTradfiRow', level: 'error' }]);
    expect(map.windowMode.value).toBe('');
  });

  it('keeps the previous coin search state when re-opening the same coin (:6644)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchCoin.value = 'TSLA'; // simulate an earlier search on this coin
    map.searchResults.value = [{ ticker: 'TSLA' } as never];
    map.searchMessage.value = 'found';
    map.searchTicker();
    expect(map.searchResults.value).toEqual([{ ticker: 'TSLA' }]);
    expect(map.searchMessage.value).toBe('found'); // same coin → untouched
  });
});

describe('runTradfiTickerSearch (:6652-6708)', () => {
  it('errors without a tiingo key (:6667-6673)', async () => {
    const { map, toasts } = makeMap(() => ({ success: true, payload: payloadFixture() }), () => false);
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.runSearch('tsla');
    expect(map.searchMessage.value).toBe('market.noTiingoKey');
    expect(map.searchMessageLevel.value).toBe('error');
    expect(toasts.messages).toEqual([{ message: 'market.tiingoKeyEmpty', level: 'error' }]);
  });

  it('errors on an empty query (:6675-6680)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.runSearch('   ');
    expect(map.searchMessage.value).toBe('market.searchQueryEmpty');
    expect(map.searchMessageLevel.value).toBe('error');
  });

  it('searches and records the result state (:6682-6698)', async () => {
    const results = [{ ticker: 'TSLA', name: 'Tesla, Inc.' }];
    const { map, fetchJson } = makeMap((path) => {
      if (path === '/settings/hyperliquid/tradfi-map/search-ticker') {
        return {
          success: true,
          message: 'Found 1 Tiingo ticker matches.',
          results,
          xyz_coin: 'TSLA',
          query: 'tesla',
        };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    map.selectCoin('TSLA');
    const pending = map.runSearch('tesla');
    expect(map.searchLoading.value).toBe(true);
    await pending;
    expect(fetchJson).toHaveBeenCalledWith('/settings/hyperliquid/tradfi-map/search-ticker', {
      method: 'POST',
      body: JSON.stringify({ xyz_coin: 'TSLA', query: 'tesla' }),
    });
    expect(map.searchResults.value).toEqual(results);
    expect(map.searchCoin.value).toBe('TSLA');
    expect(map.searchQuery.value).toBe('tesla');
    expect(map.searchMessage.value).toBe('Found 1 Tiingo ticker matches.');
    expect(map.searchMessageLevel.value).toBe('success');
    expect(map.searchLoading.value).toBe(false);
  });

  it('uses the no-match message and info level for empty results (:6697-6698)', async () => {
    const { map } = makeMap((path) => {
      if (path.endsWith('search-ticker')) {
        return { success: true, results: [], xyz_coin: 'TSLA', query: 'zzz' };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    map.selectCoin('TSLA');
    await map.runSearch('zzz');
    expect(map.searchMessage.value).toBe('market.noTiingoMatches');
    expect(map.searchMessageLevel.value).toBe('info');
  });

  it('toasts the server failure (:6699-6703)', async () => {
    const { map, toasts } = makeMap((path) => {
      if (path.endsWith('search-ticker')) {
        return { success: false, error: 'Tiingo search failed hard.' };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    map.selectCoin('TSLA');
    await map.runSearch('x');
    expect(map.searchResults.value).toEqual([]);
    expect(map.searchMessage.value).toBe('Tiingo search failed hard.');
    expect(map.searchMessageLevel.value).toBe('error');
    expect(toasts.messages).toEqual([{ message: 'Tiingo search failed hard.', level: 'error' }]);
  });
});

describe('applyTradfiSearchResult (:6710-6736)', () => {
  it('fills the editor and saves with the note suffix appended (:6718-6729)', async () => {
    const calls: { path: string; body?: unknown }[] = [];
    const { map } = makeMap((path, init) => {
      if (init?.method === 'POST' && path === '/settings/hyperliquid/tradfi-map') {
        calls.push({ path, body: JSON.parse(String(init.body)) });
        return { success: true, payload: payloadFixture({ selected_xyz_coin: 'TSLA' }) };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    map.selectCoin('KRW');
    map.searchResults.value = [
      { ticker: 'KOREA', name: 'Korea Electric Power' } as never,
    ];
    map.searchCoin.value = 'KRW';
    await map.applySearchResult(0);
    expect(map.editor.tiingoTicker).toBe('KOREA');
    expect(map.editor.description).toBe('Korea Electric Power'); // row.description || result.name
    expect(map.editor.status).toBe('alias');
    expect(map.editor.tiingoFxTicker).toBe('');
    expect(map.editor.fxInvert).toBe(false);
    expect(calls.at(-1)?.body).toMatchObject({
      entry: { xyz_coin: 'KRW', tiingo_ticker: 'KOREA', status: 'alias' },
    });
    expect(map.searchMessage.value).toBe('market.tickerSaved');
    expect(map.searchMessageLevel.value).toBe('success');
  });

  it('appends the search suffix to the row note exactly once (:6719, :6724-6728)', async () => {
    const { map } = makeMap(() => ({ success: true, payload: payloadFixture() }));
    await map.loadMappings();
    map.selectCoin('TSLA'); // row note 'n1' — syncEditor re-reads it first
    map.searchResults.value = [{ ticker: 'TSLA', name: 'Tesla' } as never];
    map.searchCoin.value = 'TSLA';
    map.editor.note = 'prior';
    map.applySearchResult(0);
    await Promise.resolve();
    expect(map.editor.note).toBe('n1 [Tiingo search: Tesla]'); // row.note wins over the dirty field
    map.applySearchResult(0);
    await Promise.resolve();
    expect(map.editor.note).toBe('n1 [Tiingo search: Tesla]'); // idempotent
  });

  it('is a no-op for an out-of-range index (:6711-6712)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    await map.applySearchResult(5);
    expect(map.editor.tiingoTicker).toBe('');
  });

  it('toasts when the selection vanished (:6713-6716)', async () => {
    const { map, toasts } = makeMap();
    await map.loadMappings();
    map.searchResults.value = [{ ticker: 'X' } as never];
    await map.applySearchResult(0);
    expect(toasts.messages).toEqual([{ message: 'market.selectTradfiRow', level: 'error' }]);
  });
});

describe('action result rendering (:5747-5803)', () => {
  it('normalizes level, details and groups (:5757-5767)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.setActionResult(
      '',
      'T',
      ['a', '', 'b', null],
      [
        { label: 'L1', count: 2, items: ['x', '', 'y'] },
        { label: '', count: 9, items: [] },
        { nope: true },
      ] as never
    );
    expect(map.actionResult.value).toEqual({
      level: 'success',
      title: 'T',
      details: ['a', 'b'],
      groups: [{ label: 'L1', count: 2, items: ['x', 'y'] }],
    });
  });

  it('clears when everything is empty (:5768-5771)', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.setActionResult('success', 'T', ['a']);
    expect(map.actionResult.value).not.toBeNull();
    map.setActionResult('success', '', ['', null], []);
    expect(map.actionResult.value).toBeNull();
    map.clearActionResult();
    expect(map.actionResult.value).toBeNull();
  });
});

describe('testTradfiResolve (:6754-6781)', () => {
  it('builds the details lines from the resolve payload', async () => {
    const { map } = makeMap((path) => {
      if (path.endsWith('test-resolve')) {
        return {
          success: true,
          result: {
            tiingo_ticker: 'TSLA',
            tiingo_fx_ticker: 'XAUUSD',
            tiingo_fx_invert: true,
            tiingo_start_date: '2010-06-29',
          },
        };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    map.selectCoin('TSLA');
    await map.testResolve();
    expect(map.actionResult.value).toEqual({
      level: 'success',
      title: 'market.resolveResultFor',
      details: [
        'market.tiingoIex',
        'market.tiingoFx' + 'market.invertedSuffix', // :6771 — one concatenated line
        'market.startDateDetail',
      ],
      groups: [],
    });
  });

  it('falls back to the skipped-status detail (:6773-6775)', async () => {
    const { map } = makeMap((path) => {
      if (path.endsWith('test-resolve')) {
        return { success: true, result: { entry_status: 'delisted' } };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    map.selectCoin('KRW');
    await map.testResolve();
    expect(map.actionResult.value?.details).toEqual(['market.entryStatusSkipped']);
  });

  it('renders the error box + toast on failure (:6777-6780)', async () => {
    const { map, toasts } = makeMap((path) => {
      if (path.endsWith('test-resolve')) return { success: false, error: 'resolve boom' };
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    map.selectCoin('TSLA');
    await map.testResolve();
    expect(map.actionResult.value).toEqual({
      level: 'error',
      title: 'resolve boom',
      details: [],
      groups: [],
    });
    expect(toasts.messages).toEqual([{ message: 'resolve boom', level: 'error' }]);
  });

  it('toasts without a selection (:6756-6758)', async () => {
    const { map, toasts } = makeMap();
    await map.loadMappings();
    await map.testResolve();
    expect(toasts.messages).toEqual([{ message: 'market.selectTradfiRow', level: 'error' }]);
  });
});

describe('start-date + refresh actions (:6783-6953)', () => {
  it('fetchTradfiStartDate renders updated + payload (:6793-6809)', async () => {
    const { map } = makeMap((path) => {
      if (path.endsWith('fetch-start-date')) {
        return {
          success: true,
          result: { updated: 1, ticker: 'TSLA', start_date: '2010-06-29' },
          payload: payloadFixture({ selected_xyz_coin: 'TSLA' }),
        };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    map.selectCoin('TSLA');
    await map.fetchStartDate();
    expect(map.actionResult.value).toEqual({
      level: 'success',
      title: 'market.startDateUpdated',
      details: ['TSLA', '2010-06-29'],
      groups: [],
    });
  });

  it('fetchTradfiStartDate renders skipped with the reason (:6803-6809)', async () => {
    const { map } = makeMap((path) => {
      if (path.endsWith('fetch-start-date')) {
        return {
          success: true,
          result: { updated: 0, reason: 'no equity ticker' },
          payload: payloadFixture(),
        };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    map.selectCoin('XAU');
    await map.fetchStartDate();
    expect(map.actionResult.value).toEqual({
      level: 'warn',
      title: 'market.startDateSkipped',
      details: ['no equity ticker'],
      groups: [],
    });
  });

  it('guards every bulk action on the tiingo key (:6789-6791, :6817-6819, :6909-6911, :6930-6932)', async () => {
    const { map, toasts, fetchJson } = makeMap(() => ({ success: true, payload: payloadFixture() }), () => false);
    await map.loadMappings();
    map.selectCoin('TSLA');
    await map.fetchStartDate();
    await map.fetchAllStartDates();
    await map.refreshMetadata();
    await map.refreshPrices();
    expect(toasts.messages).toEqual([
      { message: 'market.tiingoKeyEmpty', level: 'error' },
      { message: 'market.tiingoKeyEmpty', level: 'error' },
      { message: 'market.tiingoKeyEmpty', level: 'error' },
      { message: 'market.tiingoKeyEmpty', level: 'error' },
    ]);
    expect(fetchJson).toHaveBeenCalledTimes(1); // only the initial map load
  });

  it('fetchAllStartDates renders the count summary (:6831-6835)', async () => {
    const { map } = makeMap((path) => {
      if (path.endsWith('fetch-all-start-dates')) {
        return {
          success: true,
          result: { updated: 3, skipped: 2, errors: 1 },
          payload: payloadFixture(),
        };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    await map.fetchAllStartDates();
    expect(map.actionResult.value).toEqual({
      level: 'success',
      title: 'market.bulkStartDateFinished',
      details: ['market.updatedCount', 'market.skippedCount', 'market.errorsCount'],
      groups: [],
    });
  });

  it('autoMap renders the five legacy groups (:6875-6901)', async () => {
    const { map } = makeMap((path) => {
      if (path.endsWith('auto-map')) {
        return {
          success: true,
          message: 'TradFi Auto-Map completed.',
          result: {
            mapped_equity: 2,
            mapped_fx: 1,
            no_provider: 1,
            not_found: 0,
            skipped: 3,
            details: {
              mapped_equity: ['TSLA', 'AAPL'],
              mapped_fx: ['XAU'],
              no_provider: ['KRW'],
              skipped: ['A', 'B', 'C'],
            },
          },
          payload: payloadFixture(),
        };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    await map.autoMap();
    expect(map.actionResult.value).toEqual({
      level: 'success',
      title: 'TradFi Auto-Map completed.',
      details: [],
      groups: [
        { label: 'market.equities', count: 2, items: ['TSLA', 'AAPL'] },
        { label: 'market.fxCommodities', count: 1, items: ['XAU'] },
        { label: 'market.noProvider', count: 1, items: ['KRW'] },
        { label: 'market.notFound', count: 0, items: [] },
        { label: 'market.skipped', count: 3, items: ['A', 'B', 'C'] },
      ],
    });
  });

  it('refreshMetadata/refreshPrices/refreshSpecs render their summaries (:6852, :6922, :6944-6948)', async () => {
    const { map } = makeMap((path) => {
      if (path.endsWith('refresh-metadata')) {
        return { success: true, message: 'meta done', payload: payloadFixture() };
      }
      if (path.endsWith('refresh-prices')) {
        return {
          success: true,
          result: { quotes_saved: 9, iex_rows: 5, fx_rows: 4 },
          payload: payloadFixture(),
        };
      }
      if (path.endsWith('spec-refresh')) {
        return { success: true, message: 'spec done', payload: payloadFixture() };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    await map.refreshSpecs();
    expect(map.actionResult.value?.title).toBe('spec done');
    await map.refreshMetadata();
    expect(map.actionResult.value?.title).toBe('meta done');
    await map.refreshPrices();
    expect(map.actionResult.value).toEqual({
      level: 'success',
      title: 'market.priceCacheRefreshed',
      details: ['market.quotesSaved', 'market.iexRows', 'market.fxRows'],
      groups: [],
    });
  });

  it('re-renders the map from the action payloads (:6829/:6851 applyTradfiPayload)', async () => {
    const { map } = makeMap((path) => {
      if (path.endsWith('refresh-metadata')) {
        return {
          success: true,
          payload: payloadFixture({
            rows: [{ xyz_coin: 'ONLY', canonical_type: 'fx', status: 'ok' }],
          }),
        };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    expect(map.rows.value).toHaveLength(3);
    await map.refreshMetadata();
    expect(map.rows.value.map((row) => row.xyz_coin)).toEqual(['ONLY']);
  });
});

describe('loadTradfiSpecsView (:6955-6975)', () => {
  it('opens the window, loads specs and renders the row count', async () => {
    const { map } = makeMap((path) => {
      if (path.endsWith('/specs')) {
        return {
          success: true,
          payload: {
            fetched_at: '2026-08-16T01:02:03',
            rows: [{ xyz_coin: 'TSLA' }, { xyz_coin: 'XAU' }],
          },
        };
      }
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    const pending = map.loadSpecsView();
    expect(map.windowMode.value).toBe('specs');
    expect(map.specsLoadingMessage.value).toBe('market.loadingXyzSpecs');
    await pending;
    expect(map.specsPayload.value).toEqual({
      fetched_at: '2026-08-16T01:02:03',
      rows: [{ xyz_coin: 'TSLA' }, { xyz_coin: 'XAU' }],
    });
    expect(map.specsLoadingMessage.value).toBe('');
    expect(map.actionResult.value).toEqual({
      level: 'success',
      title: 'market.loadedXyzSpecs',
      details: ['market.rowsCount'],
      groups: [],
    });
  });

  it('keeps the failure message inside the window (:6970-6973)', async () => {
    const { map, toasts } = makeMap((path) => {
      if (path.endsWith('/specs')) return { success: false, error: 'spec boom' };
      return { success: true, payload: payloadFixture() };
    });
    await map.loadMappings();
    await map.loadSpecsView();
    expect(map.specsLoadingMessage.value).toBe('spec boom');
    expect(map.actionResult.value?.level).toBe('error');
    expect(toasts.messages).toEqual([{ message: 'spec boom', level: 'error' }]);
  });
});

describe('window close + exchange reset (:5955-5961, :7399-7401)', () => {
  it('closing clears the window mode', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.searchTicker();
    map.closeWindow();
    expect(map.windowMode.value).toBe('');
  });

  it('resetForOtherExchange clears rows and the editor', async () => {
    const { map } = makeMap();
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.editSelected();
    map.resetForOtherExchange();
    expect(map.rows.value).toEqual([]);
    expect(map.selectedCoin.value).toBe('');
    expect(map.editorOpen.value).toBe(false);
    expect(map.editor.xyzCoin).toBe('');
    expect(map.cacheNote.value).toBe('');
  });
});
