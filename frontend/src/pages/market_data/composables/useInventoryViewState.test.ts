import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import {
  computeMissingToggleSupport,
  createInventoryViewState,
  getAvailableInventoryViews,
  getInventoryAvailableTimeframes,
  isTimeframeFilterSupported,
  normalizeInventoryKindFilter,
  normalizeInventoryTimeframeFilter,
  useInventoryViewState,
} from './useInventoryViewState';

/* M-data-6 — legacy view-state layer (market_data_main.html):
   getAvailableInventoryViews :6187-6191, getResolvedInventoryView
   :6193-6199, createInventoryViewState :6201-6229, getInventoryViewState
   :6222-6228, syncInventoryKindFilterOptions :6268-6288,
   getInventoryAvailableTimeframes :6290-6304, syncInventoryTimeframeFilter
   :6306-6324, syncInventoryMissingToggle :6331-6348,
   setActiveInventoryView :6376-6386. */

describe('createInventoryViewState (:6201-6229)', () => {
  it('creates the legacy default state', () => {
    expect(createInventoryViewState()).toEqual({
      payload: null,
      rows: [],
      availableCoins: [],
      includeMissingRows: false,
      coinFilter: '',
      kindFilter: 'all',
      timeframeFilter: 'all',
      sortKey: 'coin',
      sortDirection: 'asc',
      selectedRowIds: [],
      olderCutoffDay: '',
      olderPreview: null,
      selectedMonth: '',
      heatmapInfo: null,
      showHoliday: true,
      showOos: true,
    });
  });

  it('creates independent copies per call', () => {
    const a = createInventoryViewState();
    const b = createInventoryViewState();
    a.coinFilter = 'x';
    expect(b.coinFilter).toBe('');
  });
});

describe('getAvailableInventoryViews (:6187-6191)', () => {
  it('offers all four views on hyperliquid', () => {
    expect(getAvailableInventoryViews('hyperliquid')).toEqual(['1m', '1m_api', 'l2Book', 'pb7_cache']);
  });

  it('offers 1m + pb7_cache elsewhere', () => {
    expect(getAvailableInventoryViews('bybit')).toEqual(['1m', 'pb7_cache']);
    expect(getAvailableInventoryViews('okx')).toEqual(['1m', 'pb7_cache']);
  });
});

describe('useInventoryViewState', () => {
  it('keys states by exchange::view and creates on demand (:6222-6228)', () => {
    const { getState } = useInventoryViewState({ storage: stubStorage() });
    const a = getState('hyperliquid', '1m');
    const same = getState('hyperliquid', '1m');
    const other = getState('bybit', '1m');
    expect(a).toBe(same);
    expect(a).not.toBe(other);
    a.coinFilter = 'BTC';
    expect(other.coinFilter).toBe('');
  });

  it('resolves an unavailable active view to 1m (:6193-6199)', () => {
    const { activeView, getResolvedView } = useInventoryViewState({
      storage: stubStorageWith('market_data_fastapi_inventory_subsection', 'l2Book'),
    });
    expect(activeView.value).toBe('l2Book');
    expect(getResolvedView('bybit')).toBe('1m');
    expect(getResolvedView('hyperliquid')).toBe('l2Book');
  });

  it('falls back to 1m for an unknown persisted value (:3825 R3)', () => {
    const { activeView } = useInventoryViewState({
      storage: stubStorageWith('market_data_fastapi_inventory_subsection', 'bogus'),
    });
    expect(activeView.value).toBe('1m');
  });

  it('persists the active view on set (:6379)', () => {
    const storage = stubStorage();
    const { setActiveView, activeView } = useInventoryViewState({ storage });
    setActiveView('pb7_cache');
    expect(activeView.value).toBe('pb7_cache');
    expect(storage.getItem('market_data_fastapi_inventory_subsection')).toBe('pb7_cache');
  });

  it('keeps the state reactive', () => {
    const { getState } = useInventoryViewState({ storage: stubStorage() });
    const state = getState('bybit', '1m');
    expect(reactive(state)).toBe(state); // factory already wraps in reactive
  });
});

describe('normalizeInventoryKindFilter (:6279-6286)', () => {
  it('keeps xyz filters on hyperliquid', () => {
    for (const value of ['stocks (xyz)', 'xyz mapped', 'xyz not mapped', 'crypto', 'all']) {
      expect(normalizeInventoryKindFilter(value, 'hyperliquid')).toBe(value);
    }
  });

  it('resets xyz filters to all on other exchanges (:6284-6286)', () => {
    for (const value of ['stocks (xyz)', 'xyz mapped', 'xyz not mapped']) {
      expect(normalizeInventoryKindFilter(value, 'bybit')).toBe('all');
    }
    expect(normalizeInventoryKindFilter('crypto', 'bybit')).toBe('crypto');
  });
});

describe('getInventoryAvailableTimeframes (:6290-6304)', () => {
  it('collects unique lowercase timeframes, numerically sorted', () => {
    const rows = [{ timeframe: '1H' }, { timeframe: '1m' }, { timeframe: '1m' }, { timeframe: '' }, { timeframe: ' 15M ' }];
    expect(getInventoryAvailableTimeframes(rows)).toEqual(['1h', '1m', '15m']); // legacy numeric collator order
  });
});

describe('timeframe filter support (:6313, :8706-8710)', () => {
  it('is supported only for pb7_cache with more than one timeframe', () => {
    expect(isTimeframeFilterSupported('pb7_cache', ['1m', '1h'])).toBe(true);
    expect(isTimeframeFilterSupported('pb7_cache', ['1m'])).toBe(false);
    expect(isTimeframeFilterSupported('1m', ['1m', '1h'])).toBe(false);
  });

  it('resets to all for non-pb7 views (:8706-8707)', () => {
    expect(normalizeInventoryTimeframeFilter('1m', '1h', ['1m', '1h'])).toBe('all');
  });

  it('keeps an available filter on pb7_cache (:8708)', () => {
    expect(normalizeInventoryTimeframeFilter('pb7_cache', '1h', ['1m', '1h'])).toBe('1h');
  });

  it('resets a vanished timeframe on pb7_cache (:8708-8710)', () => {
    expect(normalizeInventoryTimeframeFilter('pb7_cache', '4h', ['1m', '1h'])).toBe('all');
  });
});

describe('computeMissingToggleSupport (:6338-6341)', () => {
  it('requires panel active + hyperliquid + l2Book + payload support', () => {
    const base = { isPanelActive: true, exchange: 'hyperliquid', view: 'l2Book' as const, payload: { include_missing_supported: true } };
    expect(computeMissingToggleSupport(base)).toBe(true);
    expect(computeMissingToggleSupport({ ...base, isPanelActive: false })).toBe(false);
    expect(computeMissingToggleSupport({ ...base, exchange: 'bybit' })).toBe(false);
    expect(computeMissingToggleSupport({ ...base, view: '1m' as const })).toBe(false);
    expect(computeMissingToggleSupport({ ...base, payload: null })).toBe(false);
    expect(computeMissingToggleSupport({ ...base, payload: {} })).toBe(false);
  });
});

function stubStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

function stubStorageWith(key: string, value: string): Storage {
  const storage = stubStorage();
  storage.setItem(key, value);
  return storage;
}
