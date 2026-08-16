import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBest1m, type Best1mApi } from './useBest1m';

/* M-data-7 — the best-1m store: legacy best1mState + the panel action core
   (market_data_main.html :3739-3750, :7577-7740):
     mountHyperliquidDataActions :7577-7586 (src change/force semantics)
     renderBest1mGeneric         :7588-7632 (selection pruning, exchange
                                           change reset, host pruning)
     loadBest1mInfo              :7634-7660 (loading UI, requestId staleness)
     refreshBest1mPanel          :7662-7685 (hyperliquid iframe vs generic)
     queueBest1mGeneric          :7693-7740 (hyperliquid redirect, bitget
                                           distributed validation, payload) */

let fetchJson: ReturnType<typeof vi.fn>;
let showToast: ReturnType<typeof vi.fn>;
let openBest1mPanel: ReturnType<typeof vi.fn>;

const t = (key: string, params?: Record<string, unknown>): string => {
  const entries = Object.entries(params ?? {});
  if (!entries.length) return key;
  return `${key} {${entries.map(([k, v]) => `${k}:${String(v)}`).join(', ')}}`;
};

const INFO = {
  exchange: 'bybit',
  coins: ['BTC', 'ETH', 'SOL'],
  hint: 'bybit hint text',
  refetch_label: 'Refetch everything',
  distributed_hosts: [{ hostname: 'vps-1', target: 'vps-1.example' }, { hostname: 'vps-2' }],
};

function makeStore(overrides: { exchange?: () => string; section?: () => string } = {}) {
  return useBest1m({
    api: { fetchJson } as unknown as Best1mApi,
    t,
    showToast,
    getExchange: overrides.exchange ?? (() => 'bybit'),
    getBest1mSection: overrides.section ?? (() => 'build'),
    openBest1mPanel,
    serial: () => 'S7',
    dataActionsUrl: (path: string) => `http://h:8/api/market-data${path}`,
  });
}

beforeEach(() => {
  fetchJson = vi.fn(async () => ({ ...INFO }));
  showToast = vi.fn();
  openBest1mPanel = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('refreshBest1mPanel — the dual-path (:7662-7685)', () => {
  it('mounts the hyperliquid iframe for hyperliquid and hides the generic shell', async () => {
    const store = makeStore({ exchange: () => 'hyperliquid', section: () => 'download' });
    store.refreshPanel(false);
    expect(store.isHyperliquid.value).toBe(true);
    expect(store.hyperliquidSrc.value).toBe(
      'http://h:8/api/market-data/data-actions/hyperliquid?section=download'
    );
    expect(store.jobMonitorSrc.value).toBe('');
    expect(fetchJson).not.toHaveBeenCalled();
    expect(store.feedback.value).toBeNull(); // clearBest1mFeedback (:7675)
  });

  it('reuses the iframe src unless forced (:7582-7585)', () => {
    const store = makeStore({ exchange: () => 'hyperliquid' });
    store.refreshPanel(false);
    const first = store.hyperliquidSrc.value;
    expect(store.hyperliquidFrameKey.value).toBe(0);
    store.refreshPanel(false);
    expect(store.hyperliquidSrc.value).toBe(first); // unchanged src — no remount
    expect(store.hyperliquidFrameKey.value).toBe(0);
    store.refreshPanel(true);
    // legacy reassigned frame.src (a same-URL reload); Vue remounts via :key
    expect(store.hyperliquidSrc.value).toBe(first);
    expect(store.hyperliquidFrameKey.value).toBe(1);
  });

  it('mounts the job monitor and loads the info for generic exchanges', async () => {
    const store = makeStore();
    store.refreshPanel(false);
    expect(store.isHyperliquid.value).toBe(false);
    expect(store.jobMonitorSrc.value).toBe(
      '/app/jobs_monitor.html?v=S7&embed=1&exchange=bybit&job_type=bybit_best_1m'
    );
    expect(fetchJson).toHaveBeenCalledWith('/best-1m/info/bybit');
  });

  it('normalizes the section to build (:7671)', () => {
    const store = makeStore({ exchange: () => 'hyperliquid', section: () => 'bogus' });
    store.refreshPanel(false);
    expect(store.hyperliquidSrc.value).toContain('section=build');
  });
});

describe('loadBest1mInfo (:7634-7660)', () => {
  it('renders the payload: coins, hint, refetch label, hosts', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value).toEqual(['BTC', 'ETH', 'SOL']));
    expect(store.exchange.value).toBe('bybit');
    expect(store.hint.value).toBe('bybit hint text');
    expect(store.refetchLabel.value).toBe('Refetch everything');
    expect(store.distributedHosts.value).toHaveLength(2);
    expect(store.feedback.value).toBeNull();
  });

  it('prunes the selection to the enabled coins and preserves it across reloads (:7596-7600)', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value.length).toBe(3));
    store.setCoinSelected('BTC', true);
    store.setCoinSelected('GONE', true); // not enabled — must not stick
    fetchJson.mockResolvedValue({ ...INFO, coins: ['ETH', 'SOL', 'BTC'] });
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.selectedCoins.value.has('BTC')).toBe(true));
    expect([...store.selectedCoins.value]).toEqual(['BTC']);
  });

  it('clears filter, selection and distributed state when the exchange changes (:7608-7613)', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value.length).toBe(3));
    store.setCoinSelected('BTC', true);
    store.setCoinFilter('bt');
    store.setDistributedEnabled(true);
    store.toggleDistributedHost('vps-1');
    fetchJson.mockResolvedValue({ exchange: 'okx', coins: ['BTC', 'ETH'] });
    store.loadInfo('okx');
    await vi.waitFor(() => expect(store.exchange.value).toBe('okx'));
    expect(store.coinFilter.value).toBe('');
    expect(store.selectedCoins.value.size).toBe(0);
    expect(store.distributedEnabled.value).toBe(false);
    expect(store.selectedDistributedHosts.value.size).toBe(0);
  });

  it('prunes selected hosts that disappear from the payload (:7614-7619)', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.distributedHosts.value.length).toBe(2));
    store.toggleDistributedHost('vps-1');
    store.toggleDistributedHost('ghost');
    fetchJson.mockResolvedValue({ ...INFO, distributed_hosts: [{ hostname: 'vps-2' }] });
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.distributedHosts.value).toHaveLength(1));
    expect([...store.selectedDistributedHosts.value]).toEqual([]);
  });

  it('shows the empty warning when no coins are available (:7627-7631)', async () => {
    const store = makeStore();
    fetchJson.mockResolvedValue({ exchange: 'bybit', coins: [], empty_message: 'nothing here' });
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.feedback.value).not.toBeNull());
    expect(store.feedback.value).toEqual({ message: 'nothing here', level: 'warning' });
  });

  it('falls back to the noAvailableCoins key for an empty payload message', async () => {
    const store = makeStore();
    fetchJson.mockResolvedValue({ exchange: 'bybit', coins: [] });
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.feedback.value).not.toBeNull());
    expect(store.feedback.value).toEqual({ message: 'market.noAvailableCoins', level: 'warning' });
  });

  it('surfaces load failures and marks the coin count unavailable (:7654-7659)', async () => {
    const store = makeStore();
    fetchJson.mockRejectedValue(new Error('HTTP 503'));
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.feedback.value).not.toBeNull());
    expect(store.feedback.value).toEqual({ message: 'HTTP 503', level: 'error' });
    expect(store.loadFailed.value).toBe(true);
  });

  it('drops a stale response superseded by a newer load (:7649, R4)', async () => {
    const store = makeStore();
    let release: (value: unknown) => void = () => undefined;
    fetchJson.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    const slow = store.loadInfo('bybit');
    fetchJson.mockResolvedValue({ exchange: 'bybit', coins: ['ETH'] });
    await store.loadInfo('bybit');
    release({ exchange: 'bybit', coins: ['BTC'] });
    await slow;
    await vi.waitFor(() => expect(store.enabledCoins.value).toEqual(['ETH']));
    expect(store.feedback.value).toBeNull();
  });

  it('rejects success:false payloads with the server error (:7650-7651)', async () => {
    const store = makeStore();
    fetchJson.mockResolvedValue({ success: false, error: 'nope' });
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.feedback.value).not.toBeNull());
    expect(store.feedback.value).toEqual({ message: 'nope', level: 'error' });
  });

  it('resets the host list and disables queueing while loading (:7643-7645)', async () => {
    const store = makeStore();
    let release: (value: unknown) => void = () => undefined;
    fetchJson.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    const loading = store.loadInfo('bybit');
    expect(store.isLoading.value).toBe(true);
    expect(store.distributedHosts.value).toEqual([]);
    expect(store.isQueueDisabled.value).toBe(true);
    release({ ...INFO });
    await loading;
    expect(store.isLoading.value).toBe(false);
  });
});

describe('coin picker view model (:7135-7213)', () => {
  it('filters case-insensitively and sorts selected coins first (:7150-7198)', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value.length).toBe(3));
    store.setCoinSelected('SOL', true);
    store.setCoinFilter('t'); // BTC, ETH
    expect(store.visibleCoins.value).toEqual(['BTC', 'ETH']);
    expect(store.renderedCoins.value).toEqual(['BTC', 'ETH']); // locale order
    store.setCoinFilter('');
    expect(store.renderedCoins.value).toEqual(['SOL', 'BTC', 'ETH']); // selected first
  });

  it('selectVisible unions the visible coins (:9314-9319)', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value.length).toBe(3));
    store.setCoinSelected('BTC', true);
    store.setCoinFilter('eth');
    store.selectVisibleCoins();
    expect([...store.selectedCoins.value].sort()).toEqual(['BTC', 'ETH']);
  });

  it('clearAll empties the selection (:9321-9322)', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value.length).toBe(3));
    store.setCoinSelected('BTC', true);
    store.clearAllCoins();
    expect(store.selectedCoins.value.size).toBe(0);
  });

  it('setSelectedCoins filters to the enabled set (:7142-7146)', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value.length).toBe(3));
    store.setSelectedCoins(['BTC', 'NOPE']);
    expect([...store.selectedCoins.value]).toEqual(['BTC']);
  });
});

describe('distributed hosts view model (:7215-7256)', () => {
  it('renders host rows with the target/label fallback and selection flags', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.distributedHosts.value.length).toBe(2));
    store.toggleDistributedHost('vps-1');
    expect(store.hostRows.value).toEqual([
      { hostname: 'vps-1', target: 'vps-1.example', selected: true },
      { hostname: 'vps-2', target: '', selected: false },
    ]);
  });

  it('toggles hosts off on a second click (:9331-9336)', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.distributedHosts.value.length).toBe(2));
    store.toggleDistributedHost('vps-1');
    store.toggleDistributedHost('vps-1');
    expect(store.selectedDistributedHosts.value.size).toBe(0);
  });

  it('exposes the selected host objects in payload order (:7215-7220)', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.distributedHosts.value.length).toBe(2));
    store.toggleDistributedHost('vps-2');
    expect(store.selectedDistributedHostList.value).toEqual([{ hostname: 'vps-2' }]);
  });
});

describe('queueBest1m (:7693-7740)', () => {
  it('redirects hyperliquid to the iframe panel (:7695-7697)', async () => {
    const store = makeStore({ exchange: () => 'hyperliquid' });
    await store.queueBest1m();
    expect(openBest1mPanel).toHaveBeenCalledWith('build');
    expect(fetchJson).not.toHaveBeenCalledWith(expect.stringContaining('/best-1m/queue'));
  });

  it('rejects an enabled distributed run without hosts (:7706-7711)', async () => {
    // the guard only exists on bitget (:7704) — bybit ignores the toggle
    const store = makeStore({ exchange: () => 'bitget' });
    fetchJson.mockResolvedValueOnce({ ...INFO, exchange: 'bitget', coins: ['BTC'] });
    store.loadInfo('bitget');
    await vi.waitFor(() => expect(store.distributedHosts.value.length).toBe(2));
    store.setDistributedEnabled(true);
    await store.queueBest1m();
    expect(store.feedback.value).toEqual({ message: 'market.selectDownloader', level: 'error' });
    expect(showToast).toHaveBeenCalledWith('market.selectDownloader', 'error');
    expect(fetchJson).not.toHaveBeenCalledWith(expect.stringContaining('/best-1m/queue'));
  });

  it('posts the collected form payload (:7716-7726)', async () => {
    const store = makeStore();
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value.length).toBe(3));
    store.setCoinSelected('BTC', true);
    store.setStartDate('2026-08-01');
    store.setEndDate('2026-08-15');
    store.setRefetch(true);
    fetchJson.mockResolvedValue({ success: true, job_id: 'job-9' });
    await store.queueBest1m();
    expect(fetchJson).toHaveBeenCalledWith('/best-1m/queue/bybit', {
      method: 'POST',
      body: JSON.stringify({
        coins: ['BTC'],
        start_day: '20260801',
        end_day: '20260815',
        refetch: true,
        distributed: false,
        distributed_hosts: [],
      }),
    });
    expect(store.feedback.value).toEqual({ message: 'market.queuedBest1m {id:job-9}', level: 'info' });
    expect(showToast).toHaveBeenCalledWith('market.queuedBest1m {id:job-9}', 'success');
    expect(store.isQueueDisabled.value).toBe(false); // re-enabled in finally
  });

  it('keeps distributed off outside bitget even when the toggle was on (:7704)', async () => {
    const store = makeStore({ exchange: () => 'okx' });
    fetchJson.mockResolvedValue({ exchange: 'okx', coins: ['BTC'] });
    store.loadInfo('okx');
    await vi.waitFor(() => expect(store.exchange.value).toBe('okx'));
    store.setDistributedEnabled(true);
    fetchJson.mockResolvedValue({ success: true, job_id: 'j' });
    await store.queueBest1m();
    const body = JSON.parse(String(fetchJson.mock.calls.at(-1)![1]!.body));
    expect(body.distributed).toBe(false);
    expect(body.distributed_hosts).toEqual([]);
  });

  it('sends the selected hostnames for a bitget distributed run (:7724)', async () => {
    const store = makeStore({ exchange: () => 'bitget' });
    fetchJson.mockResolvedValue({
      exchange: 'bitget',
      coins: ['BTC'],
      distributed_hosts: [{ hostname: 'vps-1' }, { hostname: 'vps-2' }],
    });
    store.loadInfo('bitget');
    await vi.waitFor(() => expect(store.distributedHosts.value.length).toBe(2));
    store.setDistributedEnabled(true);
    store.toggleDistributedHost('vps-2');
    fetchJson.mockResolvedValue({ success: true, job_id: 'j2' });
    await store.queueBest1m();
    const body = JSON.parse(String(fetchJson.mock.calls.at(-1)![1]!.body));
    expect(body.distributed).toBe(true);
    expect(body.distributed_hosts).toEqual(['vps-2']);
  });

  it('prefers the server message and errors on failure (:7727-7736)', async () => {
    const store = makeStore();
    fetchJson.mockResolvedValueOnce({ ...INFO });
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value.length).toBe(3));
    fetchJson.mockResolvedValueOnce({ success: false, error: 'queue full' });
    await store.queueBest1m();
    expect(store.feedback.value).toEqual({ message: 'queue full', level: 'error' });
    expect(showToast).toHaveBeenCalledWith('queue full', 'error');
    expect(store.isQueueDisabled.value).toBe(false);
  });

  it('falls back to the failedQueueBest1m key on transport errors', async () => {
    const store = makeStore();
    fetchJson.mockResolvedValueOnce({ ...INFO });
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value.length).toBe(3));
    fetchJson.mockRejectedValueOnce(new Error('HTTP 500'));
    await store.queueBest1m();
    expect(store.feedback.value).toEqual({ message: 'HTTP 500', level: 'error' });
  });

  it('prefers the success message from the response (:7730)', async () => {
    const store = makeStore();
    fetchJson.mockResolvedValueOnce({ ...INFO });
    store.loadInfo('bybit');
    await vi.waitFor(() => expect(store.enabledCoins.value.length).toBe(3));
    fetchJson.mockResolvedValueOnce({ success: true, message: 'Queued 3 jobs.', job_id: 'x' });
    await store.queueBest1m();
    expect(store.feedback.value).toEqual({ message: 'Queued 3 jobs.', level: 'info' });
  });
});

describe('job monitor mounting (:4197-4213)', () => {
  it('only switches the src on change or force', () => {
    const store = makeStore();
    store.mountJobMonitor('bybit', false);
    expect(store.jobMonitorSrc.value).toContain('job_type=bybit_best_1m');
    const first = store.jobMonitorSrc.value;
    store.mountJobMonitor('bybit', false);
    expect(store.jobMonitorSrc.value).toBe(first);
    store.mountJobMonitor('bybit', true);
    expect(store.jobMonitorSrc.value).not.toBe(first);
  });

  it('clears the src and hides the card for hyperliquid', () => {
    const store = makeStore();
    store.mountJobMonitor('bybit', false);
    expect(store.jobMonitorVisible.value).toBe(true);
    store.mountJobMonitor('hyperliquid', false);
    expect(store.jobMonitorSrc.value).toBe('');
    expect(store.jobMonitorVisible.value).toBe(false);
  });
});
