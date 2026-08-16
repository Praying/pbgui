import { describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useInventoryActions, type InventoryActionsController } from './useInventoryActions';
import { createInventoryViewState } from './useInventoryViewState';
import { getInventoryQueueActionConfig } from '../lib/inventoryQueueConfig';
import type { ShowToastFn, TranslateFn } from './useSettings';
import type { InventorySubsection } from '../types';

/* M-data-6 — legacy destructive + queue actions (market_data_main.html):
   getInventoryQueueActionConfig :8234-8251, renderInventoryOlderPreview
   consumers, loadInventoryOlderPreview :8313-8337, open dialog :8217-8232,
   runInventoryBuildBest1m :8388-8472, runInventoryDeleteSelected
   :8735-8776, runInventoryDeleteOlder :8778-8823, runInventoryClearDataset
   :8825-8854. */

const t: TranslateFn = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

function makeHarness(overrides: Partial<{
  exchange: string;
  viewKey: string;
  coins: string[];
  coinLabels: string[];
  confirmResult: boolean;
  fetchJson: ReturnType<typeof vi.fn>;
  fetchHeatmapJson: ReturnType<typeof vi.fn>;
}> = {}): {
  controller: InventoryActionsController;
  viewState: ReturnType<typeof createInventoryViewState>;
  toasts: { message: unknown; level: string }[];
  confirmSpy: ReturnType<typeof vi.fn>;
  fetchJson: ReturnType<typeof vi.fn>;
  fetchHeatmapJson: ReturnType<typeof vi.fn>;
  reloads: number[];
} {
  const viewState = reactive(createInventoryViewState());
  const toasts: { message: unknown; level: string }[] = [];
  const showToast: ShowToastFn = (message, level = 'info') => void toasts.push({ message, level });
  const confirmSpy = vi.fn(async () => overrides.confirmResult ?? true);
  const fetchJson =
    overrides.fetchJson ??
    vi.fn(async () => ({ success: true, message: 'done', job_id: 'j1', coins_count: 2 }));
  const fetchHeatmapJson =
    overrides.fetchHeatmapJson ??
    vi.fn(async () => ({
      success: true,
      message: 'queued',
      job_id: 'j9',
      coins_count: 2,
      start_day: '2024-01-01',
      end_day: '2024-02-01',
    }));
  const reloads: number[] = [];
  const controller = useInventoryActions({
    api: { fetchJson, fetchHeatmapJson },
    t,
    showToast,
    confirm: confirmSpy,
    getExchange: () => overrides.exchange ?? 'bybit',
    getViewState: () => viewState,
    getViewKey: () => (overrides.viewKey ?? '1m') as InventorySubsection,
    getSelectedCoins: () => overrides.coins ?? ['BTC', 'ETH'],
    getCoinLabels: () => overrides.coinLabels ?? ['BTC', 'ETH'],
    reloadPanel: (force) => void reloads.push(force ? 1 : 0),
  });
  return { controller, viewState, toasts, confirmSpy, fetchJson, fetchHeatmapJson, reloads };
}

describe('getInventoryQueueActionConfig (:8234-8251, best1mQueueMeta :3757-3763)', () => {
  it('routes hyperliquid l2Book to the heatmap l2book bulk queue (:8236-8242)', () => {
    expect(getInventoryQueueActionConfig('hyperliquid', 'l2Book')).toEqual({
      kind: 'l2book',
      api: 'heatmap',
      path: '/queue-l2book-download-bulk',
    });
  });

  it('routes hyperliquid candles through the heatmap build queue (:3758)', () => {
    expect(getInventoryQueueActionConfig('hyperliquid', '1m')).toEqual({
      kind: 'best1m',
      api: 'heatmap',
      path: '/queue-build-ohlcv',
    });
  });

  it('routes the cex exchanges through the market-data queue (:3759-3762)', () => {
    expect(getInventoryQueueActionConfig('binance', '1m')).toEqual({
      kind: 'best1m',
      api: 'market-data',
      path: '/best-1m/queue/binance',
    });
    expect(getInventoryQueueActionConfig('bybit', 'pb7_cache')).toEqual({
      kind: 'best1m',
      api: 'market-data',
      path: '/best-1m/queue/bybit',
    });
    expect(getInventoryQueueActionConfig('bitget', '1m')?.path).toBe('/best-1m/queue/bitget');
    expect(getInventoryQueueActionConfig('okx', '1m')?.path).toBe('/best-1m/queue/okx');
  });
});

describe('runBuildBest1m (:8388-8472)', () => {
  it('toasts selectCoinFirst and skips the queue when nothing is selected (:8399-8406)', async () => {
    const h = makeHarness({ coins: [], coinLabels: [] });
    await h.controller.runBuildBest1m();
    expect(h.toasts).toEqual([{ message: 'market.selectCoinFirst', level: 'error' }]);
    expect(h.fetchJson).not.toHaveBeenCalled();
    expect(h.fetchHeatmapJson).not.toHaveBeenCalled();
  });

  it('queues the market-data best-1m payload for a cex (:8441-8452)', async () => {
    const h = makeHarness();
    await h.controller.runBuildBest1m();
    expect(h.fetchJson).toHaveBeenCalledWith(
      '/best-1m/queue/bybit',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(String(h.fetchJson.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ coins: ['BTC', 'ETH'], selected_only: true, start_day: '', end_day: '', refetch: false });
    expect(h.toasts.at(-1)).toEqual({ message: 'done', level: 'success' }); // result.message wins (:8457)
  });

  it('queues through the heatmap router for hyperliquid candles (:8450-8452)', async () => {
    const h = makeHarness({ exchange: 'hyperliquid', viewKey: '1m' });
    await h.controller.runBuildBest1m();
    expect(h.fetchHeatmapJson).toHaveBeenCalledWith(
      '/queue-build-ohlcv',
      expect.objectContaining({ method: 'POST' })
    );
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

  it('guards the l2book download on AWS creds (:8427-8429)', async () => {
    const h = makeHarness({
      exchange: 'hyperliquid',
      viewKey: 'l2Book',
      fetchHeatmapJson: vi.fn(async (path: string) => {
        if (path === '/l2book-download-info') return { has_aws_creds: false, archive_range: null };
        throw new Error('unexpected ' + path);
      }),
    });
    await h.controller.runBuildBest1m();
    expect(h.toasts.at(-1)).toEqual({ message: 'market.awsCredsRequired', level: 'error' });
    expect(h.fetchHeatmapJson).toHaveBeenCalledTimes(1);
  });

  it('guards the l2book download on a missing archive range (:8430-8432)', async () => {
    const h = makeHarness({
      exchange: 'hyperliquid',
      viewKey: 'l2Book',
      fetchHeatmapJson: vi.fn(async (path: string) => {
        if (path === '/l2book-download-info') return { has_aws_creds: true, archive_range: {} };
        throw new Error('unexpected ' + path);
      }),
    });
    await h.controller.runBuildBest1m();
    expect(h.toasts.at(-1)).toEqual({ message: 'market.noArchiveRange', level: 'error' });
  });

  it('posts the l2book bulk payload with the archive bounds (:8433-8439)', async () => {
    const h = makeHarness({
      exchange: 'hyperliquid',
      viewKey: 'l2Book',
      fetchHeatmapJson: vi.fn(async (path: string) => {
        if (path === '/l2book-download-info') {
          return { has_aws_creds: true, archive_range: { oldest_day: '2024-01-01', newest_day: '2024-03-01' } };
        }
        return { success: true, job_id: 'j2', coins_count: 2, start_day: 'a', end_day: 'b' };
      }),
    });
    await h.controller.runBuildBest1m();
    const queueCall = h.fetchHeatmapJson.mock.calls.find((c) => String(c[0]) === '/queue-l2book-download-bulk');
    expect(queueCall).toBeTruthy();
    expect(JSON.parse(String(queueCall?.[1]?.body))).toEqual({
      coins: ['BTC', 'ETH'],
      start_day: '2024-01-01',
      end_day: '2024-03-01',
      only_missing_1m_src_hours: true,
      skip_archive_preflight: true,
    });
  });

  it('surfaces queue failures as error toasts (:8453-8468)', async () => {
    const h = makeHarness({
      fetchJson: vi.fn(async () => {
        throw new Error('queue down');
      }),
    });
    await h.controller.runBuildBest1m();
    expect(h.toasts.at(-1)).toEqual({ message: 'queue down', level: 'error' });
  });
});

describe('runDeleteSelected (:8735-8776)', () => {
  it('gates the POST behind the confirm dialog with the coin list (:8744-8753)', async () => {
    const h = makeHarness({ confirmResult: false });
    await h.controller.runDeleteSelected();
    expect(h.confirmSpy).toHaveBeenCalledWith({
      title: 'market.deleteSelectedCoins',
      message: 'market.deleteSelectedCoinsMsg',
      detail: 'Bybit • 1m',
      items: ['BTC', 'ETH'],
      listLabel: 'market.selectedCoins',
      confirmText: 'market.deleteCoins',
    });
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

  it('singles out one coin (:8745-8752)', async () => {
    const h = makeHarness({ coins: ['BTC'], coinLabels: ['BTC'] });
    await h.controller.runDeleteSelected();
    expect(h.confirmSpy.mock.calls[0]?.[0]).toMatchObject({
      title: 'market.deleteSelectedCoin',
      listLabel: 'market.selectedCoin',
      confirmText: 'market.deleteCoin',
    });
  });

  it('posts the view + coins and reloads after success (:8757-8770)', async () => {
    const h = makeHarness();
    h.viewState.selectedRowIds = ['a', 'b'];
    h.viewState.olderPreview = { success: true, would_delete_files: 1 };
    await h.controller.runDeleteSelected();
    expect(h.fetchJson).toHaveBeenCalledWith(
      '/inventory/bybit/delete-selected',
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.parse(String(h.fetchJson.mock.calls[0]?.[1]?.body))).toEqual({
      view: '1m',
      coins: ['BTC', 'ETH'],
    });
    expect(h.reloads).toEqual([1]);
    expect(h.viewState.selectedRowIds).toEqual([]);
    expect(h.viewState.olderPreview).toBeNull();
    expect(h.toasts.at(-1)?.level).toBe('success');
  });

  it('toasts the server error without reloading (:8771-8775)', async () => {
    const h = makeHarness({
      fetchJson: vi.fn(async () => {
        throw new Error('denied');
      }),
    });
    await h.controller.runDeleteSelected();
    expect(h.toasts.at(-1)).toEqual({ message: 'denied', level: 'error' });
    expect(h.reloads).toEqual([]);
  });
});

describe('delete-older flow (:8217-8232, :8313-8337, :8778-8823)', () => {
  it('refuses to open the dialog without selected coins (:8222-8225)', async () => {
    const h = makeHarness({ coins: [], coinLabels: [] });
    h.controller.openOlderDialog();
    expect(h.toasts).toEqual([{ message: 'market.selectRowOrCoins', level: 'error' }]);
    expect(h.controller.olderDialogVisible.value).toBe(false);
  });

  it('opens the dialog and renders the initial preview (:8226-8231)', () => {
    const h = makeHarness();
    h.viewState.olderCutoffDay = '2024-01-15';
    h.controller.openOlderDialog();
    expect(h.controller.olderDialogVisible.value).toBe(true);
  });

  it('previews the cutoff digits through the API (:8321-8328)', async () => {
    const h = makeHarness({
      fetchJson: vi.fn(async () => ({ success: true, would_delete_files: 3, would_delete_size_label: '9 B' })),
    });
    h.viewState.olderCutoffDay = '2024-01-15';
    await h.controller.loadOlderPreview();
    expect(h.fetchJson).toHaveBeenCalledWith(
      '/inventory/bybit/preview-delete-older',
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.parse(String(h.fetchJson.mock.calls[0]?.[1]?.body))).toEqual({
      view: '1m',
      coins: ['BTC', 'ETH'],
      cutoff_day: '20240115',
    });
    expect(h.viewState.olderPreview).toEqual({ success: true, would_delete_files: 3, would_delete_size_label: '9 B' });
  });

  it('skips the preview without a cutoff or coins (:8318)', async () => {
    const h = makeHarness();
    await h.controller.loadOlderPreview();
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

  it('marks a failed preview (:8332-8336)', async () => {
    const h = makeHarness({
      fetchJson: vi.fn(async () => {
        throw new Error('nope');
      }),
    });
    h.viewState.olderCutoffDay = '2024-01-15';
    await h.controller.loadOlderPreview();
    expect(h.viewState.olderPreview).toEqual({ success: false, error: 'nope' });
  });

  it('drops a stale preview when a newer one started (:8329)', async () => {
    let release: ((v: unknown) => void) | undefined;
    const slow = new Promise((resolve) => {
      release = resolve;
    });
    let call = 0;
    const h = makeHarness({
      fetchJson: vi.fn(async () => {
        call += 1;
        return call === 1 ? slow : Promise.resolve({ would_delete_files: 1 });
      }),
    });
    h.viewState.olderCutoffDay = '2024-01-15';
    const first = h.controller.loadOlderPreview();
    const second = h.controller.loadOlderPreview();
    release?.({ would_delete_files: 9 }); // stale response lands last
    await Promise.all([first, second]);
    expect(h.viewState.olderPreview).toEqual({ would_delete_files: 1 });
  });

  it('demands a cutoff before deleting (:8784-8787)', async () => {
    const h = makeHarness();
    await h.controller.runDeleteOlder();
    expect(h.toasts).toEqual([{ message: 'market.selectCutoffDate', level: 'error' }]);
    expect(h.confirmSpy).not.toHaveBeenCalled();
  });

  it('gates the delete behind the confirm dialog (:8792-8799)', async () => {
    const h = makeHarness({ confirmResult: false });
    h.viewState.olderCutoffDay = '2024-01-15';
    await h.controller.runDeleteOlder();
    expect(h.confirmSpy).toHaveBeenCalledWith({
      title: 'market.deleteFilesByDate',
      message: 'market.deleteOlderMsg:{"date":"2024-01-15"}',
      detail: 'Bybit • 1m',
      items: ['BTC', 'ETH'],
      listLabel: 'market.selectedCoins',
      confirmText: 'market.deleteFiles',
    });
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

  it('posts the cutoff digits, closes the dialog and reloads (:8803-8817)', async () => {
    const h = makeHarness();
    h.viewState.olderCutoffDay = '2024-01-15';
    h.controller.olderDialogVisible.value = true;
    h.viewState.selectedRowIds = ['a'];
    await h.controller.runDeleteOlder();
    expect(JSON.parse(String(h.fetchJson.mock.calls[0]?.[1]?.body))).toEqual({
      view: '1m',
      coins: ['BTC', 'ETH'],
      cutoff_day: '20240115',
    });
    expect(h.controller.olderDialogVisible.value).toBe(false);
    expect(h.reloads).toEqual([1]);
    expect(h.viewState.selectedRowIds).toEqual([]);
    expect(h.viewState.olderPreview).toBeNull();
  });
});

describe('runClearDataset (:8825-8854)', () => {
  it('gates behind the confirm dialog (:8829-8834)', async () => {
    const h = makeHarness({ confirmResult: false });
    await h.controller.runClearDataset();
    expect(h.confirmSpy).toHaveBeenCalledWith({
      title: 'market.clearDataset',
      message: 'market.clearDatasetMsg:{"label":"1m"}',
      detail: 'Bybit • market.clearDatasetDetail',
      confirmText: 'market.clearDataset',
    });
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

  it('posts the view and reloads (:8838-8848)', async () => {
    const h = makeHarness();
    h.viewState.selectedRowIds = ['a'];
    await h.controller.runClearDataset();
    expect(h.fetchJson).toHaveBeenCalledWith(
      '/inventory/bybit/clear-dataset',
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.parse(String(h.fetchJson.mock.calls[0]?.[1]?.body))).toEqual({ view: '1m' });
    expect(h.reloads).toEqual([1]);
    expect(h.viewState.selectedRowIds).toEqual([]);
  });

  it('toasts failures (:8849-8853)', async () => {
    const h = makeHarness({
      fetchJson: vi.fn(async () => {
        throw new Error('locked');
      }),
    });
    await h.controller.runClearDataset();
    expect(h.toasts.at(-1)).toEqual({ message: 'locked', level: 'error' });
  });
});
