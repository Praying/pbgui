import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { EXCHANGES, apiUrl, balanceCalcApiBase, readInitParams } from './config';

/* Legacy plumbing: %%API_BASE%% was origin + /api/balance-calc
   (api/balance_calc.py:474-475); the pre-selection values came from the
   route's query params (:461-464). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const getBootMock = vi.mocked(getBoot);

beforeEach(() => {
  getBootMock.mockReturnValue({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' });
});

describe('balance-calc URL config', () => {
  it('derives the base from the boot origin', () => {
    expect(balanceCalcApiBase()).toBe('http://pbgui.test:8000/api/balance-calc');
    expect(apiUrl('/calculate')).toBe('http://pbgui.test:8000/api/balance-calc/calculate');
    expect(apiUrl('/draft/abc')).toBe('http://pbgui.test:8000/api/balance-calc/draft/abc');
  });

  it('mirrors the API exchange list (api/balance_calc.py :52)', () => {
    expect([...EXCHANGES]).toEqual(['binance', 'bybit', 'bitget', 'gateio', 'hyperliquid', 'kucoin', 'okx']);
  });

  it('reads the pre-selection query params (:478-481)', () => {
    expect(readInitParams('?instance=main&instance_version=v7&draft_id=d1&exchange=bybit')).toEqual({
      instance: 'main',
      instanceVersion: 'v7',
      draftId: 'd1',
      exchange: 'bybit',
    });
    expect(readInitParams('')).toEqual({ instance: '', instanceVersion: '', draftId: '', exchange: '' });
  });
});
