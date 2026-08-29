import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import PricesOverlay from './PricesOverlay.vue';
import type { PriceRow } from '../types';

const componentRoot = resolve(import.meta.dirname);
const appSource = readFileSync(resolve(componentRoot, '../App.vue'), 'utf8');
const logViewerSource = readFileSync(resolve(componentRoot, 'LogViewer.vue'), 'utf8');
const cmcKeyModalSource = readFileSync(resolve(componentRoot, 'CmcKeyModal.vue'), 'utf8');
const cmcAuthorityModalSource = readFileSync(resolve(componentRoot, 'CmcAuthorityModal.vue'), 'utf8');

/** Extract complete CSS blocks for an exact selector from a Vue SFC source. */
function extractSelectorBlocks(source: string, selector: string): string[] {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selectorPattern = new RegExp(`(?:^|\\n)[ \\t]*${escapedSelector}[ \\t]*\\{`, 'g');
  const blocks: string[] = [];

  for (const match of source.matchAll(selectorPattern)) {
    const matchStart = match.index ?? 0;
    const openingBraceIndex = matchStart + match[0].lastIndexOf('{');
    let braceDepth = 0;

    for (let sourceIndex = openingBraceIndex; sourceIndex < source.length; sourceIndex += 1) {
      if (source[sourceIndex] === '{') braceDepth += 1;
      if (source[sourceIndex] !== '}') continue;
      braceDepth -= 1;
      if (braceDepth === 0) {
        blocks.push(source.slice(matchStart, sourceIndex + 1));
        break;
      }
    }
  }

  return blocks;
}

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: 'Err', json: async () => body } as Response;
}

/** Fixed clock so the Age column assertions stay deterministic across the suite. */
const NOW_MS = 1_790_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

/** Realistic GET /prices-snapshot rows (legacy fmtPrice/fmtAge input). */
const ROWS: PriceRow[] = [
  { symbol: 'BTCUSDT', exchange: 'binance', price: 120000, ts: NOW_S - 30 },
  { symbol: 'ETHUSDT', exchange: 'binance', price: 0.01234, ts: NOW_S - 250 },
  { symbol: 'SOLUSDT', exchange: 'okx', price: 0.0005678, ts: NOW_S - 3600 },
  { symbol: 'XXX', exchange: 'unknown', price: null, ts: null },
];

function mountOverlay() {
  return mount(PricesOverlay, { global: { plugins: [createI18n('en')] } });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({ rows: [] }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PricesOverlay open/close (legacy openPricesOverlay/closePricesOverlay)', () => {
  it('stays hidden until open() is called', async () => {
    const wrapper = mountOverlay();
    await flushPromises();

    expect(wrapper.find('#prices-overlay').classes()).not.toContain('active');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens, clears the search and loads the snapshot', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
    const wrapper = mountOverlay();
    const search = wrapper.find('#po-search');
    await search.setValue('BTC');
    expect((search.element as HTMLInputElement).value).toBe('BTC');

    await wrapper.vm.open();
    await flushPromises();

    expect(wrapper.find('#prices-overlay').classes()).toContain('active');
    expect((wrapper.find('#po-search').element as HTMLInputElement).value).toBe('');
    expect(fetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/prices-snapshot', expect.anything());
    expect(wrapper.findAll('.po-table tbody tr')).toHaveLength(4);
  });

  it('closes and stops the refresh timers', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
      const wrapper = mountOverlay();
      await wrapper.vm.open();
      await flushPromises();
      fetchMock.mockClear();

      await wrapper.vm.close();
      await vi.advanceTimersByTimeAsync(20000);

      expect(wrapper.find('#prices-overlay').classes()).not.toContain('active');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start title dragging from the Phosphor close icon', async () => {
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    await wrapper.find('.po-btn svg').trigger('mousedown', { clientX: 20, clientY: 20 });

    expect((wrapper.find('#prices-overlay').element as HTMLElement).style.left).toBe('');
    await wrapper.find('.po-btn').trigger('click');
    expect(wrapper.find('#prices-overlay').classes()).not.toContain('active');
  });
});

describe('PricesOverlay table rendering (legacy renderTable/fmtPrice/fmtAge/ageCol)', () => {
  it('renders numbered rows with symbol, exchange, formatted price and age', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    const rows = wrapper.findAll('.po-table tbody tr');
    const cells = rows[0]!.findAll('td').map((td) => td.text());
    expect(cells[0]).toBe('1');
    expect(cells[1]).toBe('BTCUSDT');
    expect(cells[2]).toBe('binance');
    expect(cells[3]).toBe('120,000');
    expect(cells[4]).toBe('30s');
    // jsdom normalizes the shared palette's hex colors to rgb().
    expect(rows[0]!.findAll('td')[4]!.attributes('style')).toContain('color: rgb(123, 200, 165)');

    expect(rows[1]!.findAll('td')[3]!.text()).toBe('0.012340');
    expect(rows[1]!.findAll('td')[4]!.text()).toBe('4m');
    expect(rows[1]!.findAll('td')[4]!.attributes('style')).toContain('color: rgb(216, 174, 111)');

    expect(rows[2]!.findAll('td')[3]!.text()).toBe('0.0005678');
    expect(rows[2]!.findAll('td')[4]!.text()).toBe('1h');
    expect(rows[2]!.findAll('td')[4]!.attributes('style')).toContain('color: rgb(217, 128, 128)');

    expect(rows[3]!.findAll('td')[3]!.text()).toBe('—');
    expect(rows[3]!.findAll('td')[4]!.text()).toBe('—');
    expect(rows[3]!.findAll('td')[4]!.attributes('style')).toContain('color: rgb(153, 153, 153)');
  });

  it('renders the header labels from the legacy keys', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    expect(wrapper.find('.po-table thead').text()).toBe('#SymbolExchangePriceAge');
    expect(wrapper.find('#prices-overlay-title svg').exists()).toBe(true);
    expect(wrapper.find('#prices-overlay-title').text()).toContain('Price Snapshot');
  });

  it('shows the no-data note for an empty payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: [] }));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    expect(wrapper.find('#prices-overlay-body').text()).toBe('No price data available yet.');
  });

  it('shows the failed message when the snapshot fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    expect(wrapper.find('#prices-overlay-body').text()).toBe('Failed to load prices.');
  });

  it('shows the loading text while a non-silent load is in flight', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((r) => (release = r)));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    expect(wrapper.find('#prices-overlay-body').text()).toBe('Loading…');

    release(jsonResponse({ rows: ROWS }));
    await flushPromises();
    expect(wrapper.findAll('.po-table tbody tr')).toHaveLength(4);
  });
});

describe('PricesOverlay filtering + auto refresh (legacy filterPricesOverlay/startPricesAutoRefresh)', () => {
  it('filters rows by symbol or exchange from the search input', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    await wrapper.find('#po-search').setValue('okx');
    const rows = wrapper.findAll('.po-table tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.findAll('td')[1]!.text()).toBe('SOLUSDT');

    await wrapper.find('#po-search').setValue('eth');
    expect(wrapper.findAll('.po-table tbody tr')).toHaveLength(1);
    expect(wrapper.find('.po-table tbody tr').findAll('td')[1]!.text()).toBe('ETHUSDT');
  });

  it('shows the no-data note when the filter matches nothing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
    const wrapper = mountOverlay();
    await wrapper.vm.open();
    await flushPromises();

    await wrapper.find('#po-search').setValue('zzz');
    expect(wrapper.find('#prices-overlay-body').text()).toBe('No price data available yet.');
  });

  it('silently reloads every 5s and drops overlapping loads', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(jsonResponse({ rows: ROWS }));
      const wrapper = mountOverlay();
      await wrapper.vm.open();
      await flushPromises();
      fetchMock.mockClear();

      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();
      const snapshotCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/prices-snapshot'));
      expect(snapshotCalls).toHaveLength(1);
      // The silent reload keeps the table (no loading flash).
      expect(wrapper.findAll('.po-table tbody tr')).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Services Monitor precision style contracts', () => {
  it('uses the Danger ramp for CRITICAL log controls and lines', () => {
    const criticalLineBlocks = extractSelectorBlocks(logViewerSource, '.lvp-log-critical');
    const criticalControlBlocks = extractSelectorBlocks(logViewerSource, ".lvp-lvl-btn[data-lvl='CRITICAL'].on");

    expect(criticalLineBlocks).toHaveLength(2);
    expect(criticalLineBlocks[0]).toContain('color: var(--danger-soft);');
    expect(criticalLineBlocks[0]).toContain('font-weight: 600;');
    expect(criticalLineBlocks[1]).toContain('border-left-color: rgb(var(--danger-rgb) / 0.72) !important;');
    expect(criticalLineBlocks[1]).toContain('color: var(--danger-soft);');
    expect(criticalLineBlocks[1]).toContain('font-weight: 700;');

    expect(criticalControlBlocks).toHaveLength(1);
    expect(criticalControlBlocks[0]).toContain('border-color: rgb(var(--danger-rgb) / 0.42);');
    expect(criticalControlBlocks[0]).toContain('background: rgb(var(--danger-rgb) / 0.17);');
    expect(criticalControlBlocks[0]).toContain('color: var(--danger-soft);');
  });

  it('uses shared modal shadow and backdrop declarations', () => {
    const resultModalBlocks = extractSelectorBlocks(appSource, '.result-modal');

    expect(resultModalBlocks).toHaveLength(2);
    expect(resultModalBlocks[0]).toContain('box-shadow: var(--shadow-modal);');
    expect(resultModalBlocks[1]).toContain('box-shadow: var(--shadow-modal);');

    for (const modalSource of [cmcKeyModalSource, cmcAuthorityModalSource]) {
      const modalBackdropBlocks = extractSelectorBlocks(modalSource, '.cmc-modal-backdrop');
      const modalCardBlocks = extractSelectorBlocks(modalSource, '.cmc-modal-card');

      expect(modalBackdropBlocks).toHaveLength(1);
      expect(modalBackdropBlocks[0]).toContain('background: var(--bg-backdrop);');
      expect(modalCardBlocks).toHaveLength(1);
      expect(modalCardBlocks[0]).toContain('box-shadow: var(--shadow-modal);');
    }
  });

  it('uses Accent Contrast for the result-modal button foreground', () => {
    const resultButtonBlocks = extractSelectorBlocks(appSource, '.result-modal-footer button');

    expect(resultButtonBlocks).toHaveLength(2);
    expect(resultButtonBlocks[0]).toContain('background: var(--accent);');
    expect(resultButtonBlocks[0]).toContain('color: var(--accent-contrast);');
    expect(resultButtonBlocks[1]).toContain('background: linear-gradient(135deg, var(--accent), var(--accent-deep));');
  });
});
