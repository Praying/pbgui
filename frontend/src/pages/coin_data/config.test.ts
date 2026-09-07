import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { apiUrl, coinDataApiBase } from './config';

/* Legacy URL plumbing (coin_data.html): %%API_BASE%% was origin +
   /api/coin-data (api/coin_data.py:695-699); the Vue page rebuilds it from
   /api/boot.js at runtime (market_data config.ts convention). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ origin: 'http://pbgui.test:8000', base_prefix: '', authenticated: true, version: '1.0.0', serial: 'S1' })),
  apiPath: (path: string) => path,
  wsOrigin: () => 'ws://pbgui.test:8000',
  pageOrigin: () => 'http://pbgui.test:8000',
}));

const getBootMock = vi.mocked(getBoot);

beforeEach(() => {
  getBootMock.mockReturnValue({ origin: 'http://pbgui.test:8000', base_prefix: '', authenticated: true, version: '1.0.0', serial: 'S1' });
});

describe('coin-data URL bases', () => {
  it('derives the coin-data base from the boot origin', () => {
    expect(coinDataApiBase()).toBe('/api/coin-data');
  });

  it('concatenates paths onto the base (apiUrl, legacy :2134/:2233)', () => {
    expect(apiUrl('/state?market_cap=0')).toBe('/api/coin-data/state?market_cap=0');
    expect(apiUrl('/refresh/exchange')).toBe('/api/coin-data/refresh/exchange');
    expect(apiUrl('/refresh/jobs/abc')).toBe('/api/coin-data/refresh/jobs/abc');
  });
});
