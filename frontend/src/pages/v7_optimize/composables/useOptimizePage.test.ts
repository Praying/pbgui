import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { apiFetch } from '@/shared/api';
import { currentOptimizeAdapter } from '../config';
import { useOptimizePage } from './useOptimizePage';

vi.mock('@/shared/api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public detail: string) { super(detail); }
  },
}));

describe('useOptimizePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('__BOOT__', { origin: 'http://testserver', token: '' });
    vi.stubGlobal('WebSocket', class { close() {} send() {} } as unknown as typeof WebSocket);
  });

  it('loads settings and three primary collections', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ autostart: true, cpu: 2, cpu_max: 8 })
      .mockResolvedValueOnce({ configs: [{ name: 'alpha' }] })
      .mockResolvedValueOnce({ items: [{ filename: 'q1', name: 'alpha' }] })
      .mockResolvedValueOnce({ results: [{ path: '/results/a', name: 'a' }] })
      .mockResolvedValueOnce({ metrics_by_group: { all: ['adg'] }, goal_options: ['min', 'max'] });
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v7/main_page', 'http://testserver'), search: '?panel=results' });

    await page.loadAll();

    expect(page.settings.value.autostart).toBe(true);
    expect(page.configs.value).toHaveLength(1);
    expect(page.queue.value[0]?.filename).toBe('q1');
    expect(page.results.value[0]?.path).toBe('/results/a');
    expect(page.settings.value.limitsMeta).toMatchObject({ metrics_by_group: { all: ['adg'] } });
  });

  it('loads configs without result inspection on the default Configs panel', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ autostart: true })
      .mockResolvedValueOnce({ configs: [{ name: 'alpha' }] })
      .mockResolvedValueOnce({ items: [] });
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v8/main_page', 'http://testserver') });

    await page.loadAll();

    expect(apiFetch).toHaveBeenCalledTimes(4);
    expect(page.configs.value).toEqual([{ name: 'alpha' }]);
  });

  it('keeps configs visible and exposes a PB8 runtime warning when settings metadata is unavailable', async () => {
    const { ApiError } = await import('@/shared/api');
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new ApiError(503, 'PB8 update incomplete'))
      .mockResolvedValueOnce({ configs: [{ name: 'alpha' }] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ results: [] });
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v8/main_page', 'http://testserver') });

    await page.loadAll();

    expect(page.runtimeWarning.value).toBe('PB8 update incomplete');
    expect(page.configs.value).toEqual([{ name: 'alpha' }]);
    expect(page.error.value).toBe('');
  });

  it('opens, validates, saves, and queues a config', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ config: { optimize: { n_cpus: 1 } }, name: 'alpha' })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, filename: 'q1' })
      .mockResolvedValueOnce({ configs: [] })
      .mockResolvedValueOnce({ items: [] });
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v7/main_page', 'http://testserver') });

    await page.openEditor('alpha');
    page.editorJson.value = '{"optimize":{"n_cpus":2}}';
    await page.saveEditor(true);
    await nextTick();

    expect(apiFetch).toHaveBeenCalledWith('http://testserver/api/optimize-v7/configs/alpha', expect.objectContaining({ method: 'PUT' }));
    expect(apiFetch).toHaveBeenCalledWith('http://testserver/api/optimize-v7/queue', expect.objectContaining({ method: 'POST' }));
    expect(page.editorOpen.value).toBe(false);
  });

  it('refreshes an opened queue snapshot only when saved under the same name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({ config: { backtest: { exchanges: ['bybit'] }, optimize: {} }, name: 'alpha' }) }));
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ configs: [] })
      .mockResolvedValueOnce({ items: [] });
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v8/main_page', 'http://testserver') });

    await page.openQueueConfig('queue-1');
    await page.saveEditor(false);

    expect(apiFetch).toHaveBeenCalledWith(
      'http://testserver/api/optimize-v8/queue/queue-1/repair-config',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'alpha' }) }),
    );
  });

  it('does not rebind an opened queue item when saving as a new name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({ config: { backtest: { exchanges: ['bybit'] }, optimize: {} }, name: 'alpha' }) }));
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ configs: [] })
      .mockResolvedValueOnce({ items: [] });
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v8/main_page', 'http://testserver') });

    await page.openQueueConfig('queue-1');
    page.editorDraft.value!.name = 'alpha-copy';
    await page.saveEditor(false);

    expect(apiFetch).not.toHaveBeenCalledWith(
      'http://testserver/api/optimize-v8/queue/queue-1/repair-config',
      expect.anything(),
    );
  });

  it('keeps row selection independent per panel', () => {
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v8/main_page', 'http://testserver') });
    page.toggleSelection('configs', 'alpha');
    page.toggleSelection('queue', 'queue-1');
    expect([...page.selectedConfigs.value]).toEqual(['alpha']);
    expect([...page.selectedQueue.value]).toEqual(['queue-1']);
    page.setSelection('configs', ['alpha', 'beta'], true);
    expect([...page.selectedConfigs.value]).toEqual(['alpha', 'beta']);
    page.setSelection('configs', ['alpha'], false);
    expect([...page.selectedConfigs.value]).toEqual(['beta']);
    page.results.value = [{ path: '/results/a', name: 'run-a' }];
    page.toggleSelection('results', '/results/a');
    expect(page.selectedResultPath.value).toBe('/results/a');
    expect(page.selectedResultName.value).toBe('run-a');
  });
  it('surfaces legacy queue path candidates instead of losing a 409 repair choice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ detail: { code: 'queue_config_missing', queue_filename: 'q1', config_path: '/tmp/a.json', candidates: [{ name: 'alpha', path: '/tmp/alpha.json' }] } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v7/main_page', 'http://testserver') });

    await page.openQueueConfig('q1');

    expect(page.queueConfigChoice.value).toMatchObject({ queueFilename: 'q1', candidates: [{ name: 'alpha' }] });
  });

  it('retains backend bot parameter status for the Vue editor', () => {
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v7/main_page', 'http://testserver') });
    page.openEditorPayload({ config: { backtest: { exchanges: ['bybit'] }, bot: {} }, param_status: { long: { hsl: 'neutralized' } } }, 'alpha');
    expect(page.editorParamStatus.value).toEqual({ long: { hsl: 'neutralized' } });
  });


  it('projects only the selected Pareto metric columns and debounces column reloads', async () => {
    vi.useFakeTimers();
    localStorage.removeItem('pbgui.optimize.v7.pareto_columns');
    vi.mocked(apiFetch).mockReset();
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v7/main_page', 'http://testserver') });
    page.selectedResultPath.value = '/results/a';
    vi.mocked(apiFetch).mockResolvedValueOnce({
      paretos: [{ path: '/p/1', name: 'one', summary: { gain: 0.1 } }],
      meta: {
        available_metrics: ['gain', 'adg', 'sharpe_ratio'],
        default_metrics: ['gain', 'adg'],
        selected_statistic: 'mean',
        available_statistics: ['mean', 'median'],
      },
    });
    await page.loadParetos();
    // 首次加载：无 metrics 参数（列尚未确定），随后取 defaults
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).not.toContain('metrics=');
    expect(page.paretoMetricColumns.value).toEqual(['adg', 'gain']);
    expect(page.paretoAvailableMetrics.value).toEqual(['adg', 'gain', 'sharpe_ratio']);

    // 启用列 → 250ms debounce 后带 metrics 重载并持久化
    vi.mocked(apiFetch).mockResolvedValueOnce({
      paretos: [{ path: '/p/1', name: 'one', summary: { gain: 0.1, sharpe_ratio: 2 } }],
      meta: { available_metrics: ['gain', 'adg', 'sharpe_ratio'], default_metrics: ['gain', 'adg'] },
    });
    page.toggleParetoMetricColumn('sharpe_ratio', true);
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1); // debounce 未到期
    vi.advanceTimersByTime(250);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiFetch).mock.calls[1]?.[0]).toContain('metrics=adg%2Cgain%2Csharpe_ratio');
    expect(JSON.parse(localStorage.getItem('pbgui.optimize.v7.pareto_columns') || '[]'))
      .toEqual(['adg', 'gain', 'sharpe_ratio']);

    // 禁用列 → 仅本地隐藏，不触发重载
    page.toggleParetoMetricColumn('sharpe_ratio', false);
    expect(page.paretoMetricColumns.value).toEqual(['adg', 'gain']);
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(2);

    // 最后一列不可被禁用
    page.toggleParetoMetricColumn('gain', false);
    page.toggleParetoMetricColumn('adg', false);
    expect(page.paretoMetricColumns.value).toEqual(['adg']);
    vi.useRealTimers();
  });

  it('restores persisted Pareto columns on first load', async () => {
    localStorage.setItem('pbgui.optimize.v7.pareto_columns', JSON.stringify(['sharpe_ratio']));
    vi.mocked(apiFetch).mockReset();
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v7/main_page', 'http://testserver') });
    page.selectedResultPath.value = '/results/a';
    vi.mocked(apiFetch).mockResolvedValueOnce({
      paretos: [],
      meta: { available_metrics: ['gain', 'sharpe_ratio'], default_metrics: ['gain'] },
    });
    await page.loadParetos();
    expect(page.paretoMetricColumns.value).toEqual(['sharpe_ratio']);
    localStorage.removeItem('pbgui.optimize.v7.pareto_columns');
  });

});
