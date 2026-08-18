import { describe, expect, it, vi } from 'vitest';
import { currentOptimizeAdapter } from '../config';
import { useOptimizeActions } from './useOptimizeActions';

const adapter = currentOptimizeAdapter('/api/optimize-v8/main_page', 'http://testserver');

describe('useOptimizeActions', () => {
  it('prepares local imports and loads archive configs through the shared archive service', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ config: { backtest: { exchanges: ['bybit'] } }, override_configs: { 'BTC.json': {} } })
      .mockResolvedValueOnce({ archives: [{ name: 'mine', optimize_configs: 1 }] })
      .mockResolvedValueOnce({ configs: [{ name: 'archived', path: 'optimize/archived.json' }] })
      .mockResolvedValueOnce({ path: '/data/ohlcv' })
      .mockResolvedValueOnce({ symbols: ['BTCUSDT'], catalog: [{ config_id: 'BTCUSDT', display: 'BTC/USDT' }] });
    const actions = useOptimizeActions({ adapter, request });

    const prepared = await actions.prepareImport({ backtest: {} }, 'imported');
    await actions.loadArchives();
    await actions.loadArchiveConfigs('mine');
    const dataPath = await actions.pbguiDataPath();
    const symbols = await actions.loadSymbols('bybit');

    expect(prepared.name).toBe('imported');
    expect(request).toHaveBeenCalledWith('http://testserver/api/backtest-v7/archives');
    expect(request).toHaveBeenCalledWith('http://testserver/api/backtest-v7/archives/mine/optimize-configs?version=v8');
    expect(actions.archiveConfigs.value[0]?.name).toBe('archived');
    expect(dataPath).toBe('/data/ohlcv');
    expect(symbols.symbols).toEqual(['BTCUSDT']);
    expect(request).toHaveBeenCalledWith('http://testserver/api/v8/symbols?exchange=bybit');
  });

  it('archives configs and launches result visualizations', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ my_archive: 'mine' })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ html: '<html>plot</html>', message: 'opened' })
      .mockResolvedValueOnce({ url: '/dash/session', session_id: 'session-1' });
    const actions = useOptimizeActions({ adapter, request });

    await actions.archiveSelected(['alpha']);
    await actions.launch3d({ path: '/results/a', name: 'a' });
    await actions.launchParetoDash({ path: '/results/a', name: 'a' });

    expect(request).toHaveBeenCalledWith(
      'http://testserver/api/backtest-v7/archives/mine/add-optimize-config',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(actions.plot.value).toMatchObject({ open: true, kind: 'url', url: '/dash/session', sessionId: 'session-1' });
  });

  it('builds a Pareto seed bundle and returns a prepared seeded draft', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ path: '/results/a/_seed_bundles/one', count: 2 })
      .mockResolvedValueOnce({ config: { backtest: { exchanges: ['bybit'] }, optimize: {}, pbgui: {} } });
    const actions = useOptimizeActions({ adapter, request });

    const draft = await actions.seedParetos('/results/a', ['/results/a/pareto/1.json', '/results/a/pareto/2.json'], 'seeded');

    expect(draft.name).toBe('seeded');
    expect(draft.pbgui).toMatchObject({ optimize_seed_mode: 'path', optimize_seed_path: '/results/a/_seed_bundles/one' });
  });
  it('hands one or many paretos to the matching backtest draft route', async () => {
    const singleRequest = vi.fn()
      .mockResolvedValueOnce({ config: { backtest: { exchanges: ['bybit'] }, bot: {}, ignored: true }, override_configs: { 'BTC.json': {} } })
      .mockResolvedValueOnce({ draft_id: 'draft-1' });
    const single = useOptimizeActions({ adapter, request: singleRequest });

    const singleUrl = await single.backtestParetos([{ path: '/results/a/pareto/one.json', name: 'one' }]);

    expect(singleRequest).toHaveBeenNthCalledWith(2,
      'http://testserver/api/backtest-v8/optimize-draft',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('"override_configs":{"BTC.json":{}}') }),
    );
    expect(singleUrl).toBe('http://testserver/api/backtest-v8/main_page?opt_draft_id=draft-1&draft_name=one');

    const multiRequest = vi.fn()
      .mockResolvedValueOnce({ config: { backtest: {}, bot: {} }, override_configs: {} })
      .mockResolvedValueOnce({ config: { backtest: {}, bot: {} }, override_configs: {} })
      .mockResolvedValueOnce({ draft_id: 'queue-1' });
    const multi = useOptimizeActions({ adapter, request: multiRequest });

    const multiUrl = await multi.backtestParetos([
      { path: '/results/a/pareto/one.json', name: 'one' },
      { path: '/results/a/pareto/two.json', name: 'two' },
    ]);

    expect(multiRequest).toHaveBeenNthCalledWith(3,
      'http://testserver/api/backtest-v8/queue-draft',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('"items"') }),
    );
    expect(multiUrl).toBe('http://testserver/api/backtest-v8/main_page?queue_draft_id=queue-1');
  });

  it('loads an incoming backtest optimize draft and preserves overrides', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        config: { backtest: { exchanges: ['bybit'], base_dir: 'backtests/pbgui/from_backtest' }, pbgui: {} },
        override_configs: { 'BTC.json': { long: { n_positions: 2 } } },
      })
      .mockResolvedValueOnce({
        config: { backtest: { exchanges: ['bybit'], base_dir: 'backtests/pbgui/from_backtest' }, pbgui: {} },
      });
    const actions = useOptimizeActions({ adapter, request });

    const payload = await actions.loadIncomingDraft('draft-7', 'from_backtest');

    expect(request).toHaveBeenNthCalledWith(1, 'http://testserver/api/backtest-v8/optimize-draft/draft-7');
    expect(request).toHaveBeenNthCalledWith(2, 'http://testserver/api/optimize-v8/configs/prepare', expect.objectContaining({ method: 'POST' }));
    expect(payload.name).toBe('from_backtest');
    expect(payload.override_configs).toEqual({ 'BTC.json': { long: { n_positions: 2 } } });
  });

  it('starts, polls, and stops an OHLCV preload job', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ job_id: 'job-1', status: 'queued' })
      .mockResolvedValueOnce({ job_id: 'job-1', status: 'running', log_tail: ['downloading'] })
      .mockResolvedValueOnce({ job_id: 'job-1', status: 'stopped' });
    const actions = useOptimizeActions({ adapter, request });

    await actions.startOhlcvPreload({ backtest: {} });
    await actions.loadOhlcvPreload('job-1');
    await actions.stopOhlcvPreload('job-1');

    expect(request).toHaveBeenNthCalledWith(1, 'http://testserver/api/optimize-v8/ohlcv-preload', expect.objectContaining({ method: 'POST' }));
    expect(request).toHaveBeenNthCalledWith(2, 'http://testserver/api/optimize-v8/ohlcv-preload/job-1');
    expect(request).toHaveBeenNthCalledWith(3, 'http://testserver/api/optimize-v8/ohlcv-preload/job-1', { method: 'DELETE' });
  });

});
