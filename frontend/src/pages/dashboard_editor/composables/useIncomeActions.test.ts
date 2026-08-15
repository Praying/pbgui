import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIncomeActions } from './useIncomeActions';

/* useIncomeActions — the income table's destructive API layer
 * (dashboard_render.js:1281, 1308, 1384-1401 apiPost, 1403-1469 loadBackups
 * and the inline restore fetch at 1434-1451).
 *
 * Legacy parity quirks locked here:
 *  - apiPost never inspects resp.ok — a non-ok response with a JSON body
 *    takes the SUCCESS path (deleted count from the body);
 *  - failures surface the Error.message (the catch branch);
 *  - backups failures carry no message (legacy renders a fixed
 *    dash.errorLoadingBackups label).
 */

type MockResp = { ok: boolean; status: number; json: () => Promise<unknown> };

function resp(body: unknown, ok = true, status = 200): MockResp {
  return { ok, status, json: async () => body };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIncomeActions.deleteIds (render.js:1281, 1384-1401)', () => {
  it('POSTs {ids} to /dashboard/income/delete_ids and maps the deleted count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp({ deleted: 3, backup: '/x.db' }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useIncomeActions({ apiBase: '/api', fetchFn: fetchMock as unknown as typeof fetch });

    const result = await actions.deleteIds([7, 8, 9]);

    expect(result).toEqual({ ok: true, deleted: 3 });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/income/delete_ids',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [7, 8, 9] }),
      })
    );
  });

  it('maps a missing deleted count to 0 (legacy `d.deleted || 0`)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp({ detail: 'noop' })));
    const actions = useIncomeActions({ apiBase: '/api' });
    expect(await actions.deleteIds([])).toEqual({ ok: true, deleted: 0 });
  });

  it('takes the success path even for non-ok responses with JSON bodies (legacy never checks resp.ok)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp({ detail: 'validation error' }, false, 422)));
    const actions = useIncomeActions({ apiBase: '/api' });
    expect(await actions.deleteIds([1])).toEqual({ ok: true, deleted: 0 });
  });

  it('maps network/parse failures to the Error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    const actions = useIncomeActions({ apiBase: '/api' });
    expect(await actions.deleteIds([1])).toEqual({ ok: false, message: 'boom' });
  });
});

describe('useIncomeActions.deleteOlder (render.js:1308)', () => {
  it('POSTs {users, cutoff_ms} to /dashboard/income/delete_older', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp({ deleted: 42, backup: '/x.db' }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useIncomeActions({ apiBase: '/api', fetchFn: fetchMock as unknown as typeof fetch });

    const result = await actions.deleteOlder(['ALL'], 1706200000000);

    expect(result).toEqual({ ok: true, deleted: 42 });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/income/delete_older',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: ['ALL'], cutoff_ms: 1706200000000 }),
      })
    );
  });

  it('maps failures to the Error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const actions = useIncomeActions({ apiBase: '/api' });
    expect(await actions.deleteOlder(['a'], 1)).toEqual({ ok: false, message: 'offline' });
  });
});

describe('useIncomeActions.listBackups (render.js:1403-1469)', () => {
  it('GETs /dashboard/income/backups and maps the backups array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      resp({
        backups: [
          { name: 'pbgui-a.db', path: '/data/backup/db/pbgui-a.db', date: '2024-01-01 10:00:00' },
          { name: 'pbgui-b.db', path: '/data/backup/db/pbgui-b.db', date: '2024-01-02 11:00:00' },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const actions = useIncomeActions({ apiBase: '/api', fetchFn: fetchMock as unknown as typeof fetch });

    const result = await actions.listBackups();

    expect(result).toEqual({
      ok: true,
      backups: [
        { name: 'pbgui-a.db', path: '/data/backup/db/pbgui-a.db', date: '2024-01-01 10:00:00' },
        { name: 'pbgui-b.db', path: '/data/backup/db/pbgui-b.db', date: '2024-01-02 11:00:00' },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/income/backups');
  });

  it("maps a missing backups list to [] (legacy `d.backups || []`)", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp({})));
    const actions = useIncomeActions({ apiBase: '/api' });
    expect(await actions.listBackups()).toEqual({ ok: true, backups: [] });
  });

  it('reports failure without a message (legacy renders the fixed error label)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
    const actions = useIncomeActions({ apiBase: '/api' });
    expect(await actions.listBackups()).toEqual({ ok: false });
  });
});

describe('useIncomeActions.restore (render.js:1434-1451)', () => {
  it('POSTs {path} to /dashboard/income/restore and maps d.ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useIncomeActions({ apiBase: '/api', fetchFn: fetchMock as unknown as typeof fetch });

    const result = await actions.restore('/data/backup/db/pbgui-a.db');

    expect(result).toEqual({ ok: true, restored: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/income/restore',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/data/backup/db/pbgui-a.db' }),
      })
    );
  });

  it('keeps the success shape with restored=false when the server reports ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp({ ok: false })));
    const actions = useIncomeActions({ apiBase: '/api' });
    expect(await actions.restore('/x')).toEqual({ ok: true, restored: false });
  });

  it('maps failures to the Error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('nope')));
    const actions = useIncomeActions({ apiBase: '/api' });
    expect(await actions.restore('/x')).toEqual({ ok: false, message: 'nope' });
  });
});
