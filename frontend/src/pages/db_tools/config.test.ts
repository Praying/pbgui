import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { apiUrl, dbToolsApiBase, wsBase } from './config';

/* Legacy plumbing: %%API_BASE%% was origin + /api/db-tools and %%WS_BASE%%
   the ws(s) transform (api/db_tools.py:2684-2689). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const getBootMock = vi.mocked(getBoot);

beforeEach(() => {
  getBootMock.mockReturnValue({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' });
});

describe('db-tools URL config', () => {
  it('derives the REST base', () => {
    expect(dbToolsApiBase()).toBe('http://pbgui.test:8000/api/db-tools');
    expect(apiUrl('/targets')).toBe('http://pbgui.test:8000/api/db-tools/targets');
  });

  it('maps the origin to ws(s) (legacy :2689)', () => {
    expect(wsBase()).toBe('ws://pbgui.test:8000');
    getBootMock.mockReturnValue({ token: 'tok', origin: 'https://pbgui.test:8443', version: '', serial: '' });
    expect(wsBase()).toBe('wss://pbgui.test:8443');
  });
});
