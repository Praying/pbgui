import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { apiUrl, coinDataApiBase } from './config';

/* Legacy URL plumbing (coin_data.html): %%API_BASE%% was origin +
   /api/coin-data (api/coin_data.py:695-699); the Vue page rebuilds it from
   /api/boot.js at runtime (market_data config.ts convention). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const getBootMock = vi.mocked(getBoot);

beforeEach(() => {
  getBootMock.mockReturnValue({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' });
});

describe('coin-data URL bases', () => {
  it('derives the coin-data base from the boot origin', () => {
    expect(coinDataApiBase()).toBe('http://pbgui.test:8000/api/coin-data');
  });

  it('concatenates paths onto the base (apiUrl, legacy :2134/:2233)', () => {
    expect(apiUrl('/state?market_cap=0')).toBe('http://pbgui.test:8000/api/coin-data/state?market_cap=0');
    expect(apiUrl('/refresh/exchange')).toBe('http://pbgui.test:8000/api/coin-data/refresh/exchange');
    expect(apiUrl('/refresh/jobs/abc')).toBe('http://pbgui.test:8000/api/coin-data/refresh/jobs/abc');
  });
});
