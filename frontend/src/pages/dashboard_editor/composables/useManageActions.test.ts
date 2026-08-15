import { describe, expect, it, vi } from 'vitest';
import { useManageActions, type ManageFetch } from './useManageActions';
import type { ManageBody } from '../lib/manageLogic';

/*
 * useManageActions — the POST /dashboard/positions/manage flow of legacy
 * requestManageAction (dashboard_render.js:2453-2508): single-flight guard,
 * ok/detail/statusText error mapping, raw payload passthrough on success.
 */

const BASE = '/api';
const URL = BASE + '/dashboard/positions/manage';

function body(overrides: Partial<ManageBody> = {}): ManageBody {
  return { user: 'alice', symbol: 'BTCUSDT', side: 'long', action: 'panic_symbol', ...overrides };
}

function makeFetch(): ReturnType<typeof vi.fn<ManageFetch>> {
  return vi.fn<ManageFetch>();
}

describe('useManageActions (render.js:2453-2508)', () => {
  it('POSTs the JSON body to the manage endpoint', async () => {
    const fetchFn = makeFetch();
    fetchFn.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const actions = useManageActions({ apiBase: BASE, fetchFn });
    await actions.runAction(body());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]![0]).toBe(URL);
    const init = fetchFn.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual(body());
  });

  it('returns the parsed payload on success and clears the in-flight flag', async () => {
    const fetchFn = makeFetch();
    fetchFn.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, dry_run: true, config: {} }) });
    const actions = useManageActions({ apiBase: BASE, fetchFn });
    const p = actions.runAction(body());
    expect(actions.actionInFlight.value).toBe(true); // set before await
    const res = await p;
    expect(res).toEqual({ ok: true, data: { ok: true, dry_run: true, config: {} } });
    expect(actions.actionInFlight.value).toBe(false);
  });

  it('maps a non-ok response with detail to the error message', async () => {
    const fetchFn = makeFetch();
    fetchFn.mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: 'Position not found' }) });
    const actions = useManageActions({ apiBase: BASE, fetchFn });
    const res = await actions.runAction(body());
    expect(res).toEqual({ ok: false, errorMessage: 'Position not found' });
    expect(actions.actionInFlight.value).toBe(false);
  });

  it('falls back to statusText when the error body has no detail', async () => {
    const fetchFn = makeFetch();
    fetchFn.mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => ({}) });
    const actions = useManageActions({ apiBase: BASE, fetchFn });
    const res = await actions.runAction(body());
    expect(res).toEqual({ ok: false, errorMessage: 'Bad Gateway' });
  });

  it('surfaces the raw network error message (legacy _serverMsg passthrough)', async () => {
    const fetchFn = makeFetch();
    fetchFn.mockRejectedValue(new TypeError('Failed to fetch'));
    const actions = useManageActions({ apiBase: BASE, fetchFn });
    const res = await actions.runAction(body());
    expect(res).toEqual({ ok: false, errorMessage: 'Failed to fetch' });
  });

  it('rejects a second action while one is in flight without fetching', async () => {
    const fetchFn = makeFetch();
    let resolveJson: ((v: unknown) => void) | null = null;
    fetchFn.mockReturnValue(
      new Promise((resolve) => {
        resolveJson = (v: unknown) => resolve({ ok: true, status: 200, json: async () => v });
      })
    );
    const actions = useManageActions({ apiBase: BASE, fetchFn });
    const first = actions.runAction(body());
    const blocked = await actions.runAction(body({ action: 'panic_all' }));
    expect(blocked).toEqual({
      ok: false,
      errorMessage: 'Another manage action is still running.',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    (resolveJson as unknown as (v: unknown) => void)({ ok: true });
    expect((await first).ok).toBe(true);
  });
});
