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
    const page = useOptimizePage({ adapter: currentOptimizeAdapter('/api/optimize-v7/main_page', 'http://testserver') });

    await page.loadAll();

    expect(page.settings.value.autostart).toBe(true);
    expect(page.configs.value).toHaveLength(1);
    expect(page.queue.value[0]?.filename).toBe('q1');
    expect(page.results.value[0]?.path).toBe('/results/a');
    expect(page.settings.value.limitsMeta).toMatchObject({ metrics_by_group: { all: ['adg'] } });
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

});
