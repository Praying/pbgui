import { describe, expect, it } from 'vitest';
import {
  buildOhlcvFrameUrl,
  heatmapInfoPath,
  heatmapMinutesPath,
  heatmapOverviewPath,
  inventoryPath,
  ohlcvFramePath,
  previewDeleteOlderPath,
  deleteSelectedPath,
  deleteOlderPath,
  clearDatasetPath,
} from './inventoryUrls';

/* M-data-6 — legacy URL builders: syncInventoryOhlcvFrame :8573-8575,
   loadInventoryHeatmap :8651-8653/:8659-8661, loadInventoryMinuteHeatmap
   :8607-8612, loadInventoryPanel :8690-8692, preview :8321,
   runInventoryDelete* :8757/:8803/:8838. */

describe('inventoryPath (:8690-8692)', () => {
  it('builds the view + include_missing query (:8691-8692)', () => {
    expect(inventoryPath('hyperliquid', '1m', false)).toBe('/inventory/hyperliquid?view=1m&include_missing=false');
    expect(inventoryPath('bybit', 'pb7_cache', true)).toBe(
      '/inventory/bybit?view=pb7_cache&include_missing=true'
    );
  });

  it('encodes the exchange key (:8690)', () => {
    expect(inventoryPath('binance usdm', '1m', false)).toBe(
      '/inventory/binance%20usdm?view=1m&include_missing=false'
    );
  });
});

describe('destructive paths (:8757, :8803, :8838)', () => {
  it('builds delete-selected/:8757', () => {
    expect(deleteSelectedPath('bybit')).toBe('/inventory/bybit/delete-selected');
  });
  it('builds delete-older/:8803', () => {
    expect(deleteOlderPath('okx')).toBe('/inventory/okx/delete-older');
  });
  it('builds clear-dataset/:8838', () => {
    expect(clearDatasetPath('bitget')).toBe('/inventory/bitget/clear-dataset');
  });
  it('builds preview-delete-older/:8321', () => {
    expect(previewDeleteOlderPath('hyperliquid')).toBe('/inventory/hyperliquid/preview-delete-older');
  });
});

describe('heatmap paths (:8607-8612, :8651-8653, :8659-8661)', () => {
  it('builds the info path (:8651-8653)', () => {
    expect(heatmapInfoPath('hyperliquid', '1m', 'BTC')).toBe('/info?exchange=hyperliquid&dataset=1m&coin=BTC');
  });

  it('builds the overview path (:8659-8661)', () => {
    expect(heatmapOverviewPath('bybit', 'pb7_cache', 'ETH_USDT')).toBe(
      '/overview?exchange=bybit&dataset=pb7_cache&coin=ETH_USDT'
    );
  });

  it('builds the minutes path with month + toggles (:8607-8612)', () => {
    expect(heatmapMinutesPath('hyperliquid', '1m', 'XYZ:TSLA', '2024-06', true, false)).toBe(
      '/minutes?exchange=hyperliquid&dataset=1m&coin=XYZ%3ATSLA&month=2024-06&show_holiday=true&show_oos=false'
    );
  });

  it('encodes query params (:8608-8610)', () => {
    expect(heatmapInfoPath('ex 1', 'ds 2', 'c&d')).toBe('/info?exchange=ex%201&dataset=ds%202&coin=c%26d');
  });
});

describe('ohlcv frame URL (:8573-8575)', () => {
  it('builds the path on the market-data router (:8573-8575)', () => {
    expect(ohlcvFramePath('hyperliquid', '1m', 'BTC')).toBe(
      '/inventory/chart/ohlcv?exchange=hyperliquid&dataset=1m&coin=BTC'
    );
  });

  it('encodes dataset and coin (:8574-8575)', () => {
    expect(ohlcvFramePath('bybit', 'pb7 cache', 'A&B')).toBe(
      '/inventory/chart/ohlcv?exchange=bybit&dataset=pb7%20cache&coin=A%26B'
    );
  });

  it('builds the absolute frame URL from the api base (:8573)', () => {
    expect(buildOhlcvFrameUrl('http://h:8000/api/market-data', 'okx', '1m', 'SOL')).toBe(
      'http://h:8000/api/market-data/inventory/chart/ohlcv?exchange=okx&dataset=1m&coin=SOL'
    );
  });
});
