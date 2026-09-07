import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { apiUrl, dbToolsApiBase, wsBase } from './config';

/* Legacy plumbing: %%API_BASE%% was origin + /api/db-tools and %%WS_BASE%%
   the ws(s) transform (api/db_tools.py:2684-2689). */

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

describe('db-tools URL config', () => {
  it('derives the REST base', () => {
    expect(dbToolsApiBase()).toBe('/api/db-tools');
    expect(apiUrl('/targets')).toBe('/api/db-tools/targets');
  });

  it('maps the origin to ws(s) (legacy :2689)', () => {
    expect(wsBase()).toBe('ws://pbgui.test:8000');
  });
});
