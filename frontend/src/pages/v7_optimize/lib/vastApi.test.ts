import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/shared/api';
import { queueVastConfig, resolveVastWorkerCount, validateVastConfig, VastValidationError } from './vastApi';

vi.mock('@/shared/api', () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

describe('Vast config validation API', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('retains structured warnings while filtering pending coin-count hints', async () => {
    apiFetchMock.mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [
        { path: 'optimize.bounds.long', message: 'Review this direction.' },
        { path: 'live.approved_coins', message: 'Waiting for coins.', pending_coin_count: 3 },
      ],
      revision: 'abcdef123',
    });

    const result = await validateVastConfig({});
    expect(result.warnings).toEqual([{ path: 'optimize.bounds.long', message: 'Review this direction.', suggestions: [], pending_coin_count: undefined }]);
    expect(result.revision).toBe('abcdef123');
  });

  it('uses exact workers before n_cpus and the fallback', () => {
    expect(resolveVastWorkerCount({ optimize: { gpu: { exact_workers: 7 }, n_cpus: 5 } })).toBe(7);
    expect(resolveVastWorkerCount({ optimize: { gpu: { exact_workers: null }, n_cpus: 5 } })).toBe(5);
    expect(resolveVastWorkerCount({ optimize: { gpu: { exact_workers: null }, n_cpus: null } })).toBe(4);
  });

  it('throws a structured error before preparing an invalid config', async () => {
    apiFetchMock.mockResolvedValueOnce({ valid: false, errors: [{ path: 'optimize.gpu.exact_workers', message: 'Invalid workers.' }], warnings: [] });

    await expect(queueVastConfig('demo', {})).rejects.toBeInstanceOf(VastValidationError);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});
