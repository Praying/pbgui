import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CmcApiError,
  cmcDuration,
  cmcFetch,
  cmcNumber,
  cmcTimestamp,
  createCmcMutationControl,
  newCmcOperationId,
  type CmcMutationCandidate,
} from './cmc';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: 'Err', json: async () => body } as Response;
}

function candidate(overrides: Partial<CmcMutationCandidate> = {}): CmcMutationCandidate {
  return {
    operationId: 'op-1',
    action: 'cmc_create',
    target: '',
    path: '/cmc-pool/keys',
    method: 'POST',
    transport: 'body',
    body: { api_key: 'secret' },
    modal: 'key',
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('cmcFetch (legacy cmcFetch error semantics)', () => {
  it('sends the bearer token and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ keys: [] }));

    await expect(cmcFetch('/cmc-pool')).resolves.toEqual({ keys: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://pbgui.test:8000/api/services/cmc-pool',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    );
  });

  it('throws CmcApiError with the string detail and status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'quota exceeded' }, 429));

    const error = await cmcFetch('/cmc-pool').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CmcApiError);
    expect((error as CmcApiError).message).toBe('quota exceeded');
    expect((error as CmcApiError).status).toBe(429);
    expect((error as CmcApiError).operationId).toBe('');
  });

  it('unwraps object details into message + operation id suffix', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: { message: 'operation in flight', operation_id: 'op-9' } }, 409)
    );

    const error = await cmcFetch('/cmc-pool').catch((e: unknown) => e);
    expect((error as CmcApiError).message).toBe('operation in flight (operation op-9)');
    expect((error as CmcApiError).operationId).toBe('op-9');
  });

  it('falls back to body error then the generic message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));

    await expect(cmcFetch('/x').catch((e: Error) => e.message)).resolves.toBe('boom');
    await expect(cmcFetch('/x').catch((e: Error) => e.message)).resolves.toBe('CMC pool request failed.');
  });

  it('treats falsy-but-present details like missing ones (legacy || chain)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: '' }, 400));
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: '', error: 'secondary' }, 402));

    // '' detail is falsy: legacy falls through to data.error, then the generic.
    await expect(cmcFetch('/x').catch((e: Error) => e.message)).resolves.toBe('CMC pool request failed.');
    await expect(cmcFetch('/x').catch((e: Error) => e.message)).resolves.toBe('secondary');
  });
});

describe('formatting helpers (legacy cmcNumber/cmcDuration/cmcTimestamp)', () => {
  it('formats numbers with locale separators and dashes', () => {
    expect(cmcNumber(null)).toBe('-');
    expect(cmcNumber('')).toBe('-');
    expect(cmcNumber('abc')).toBe('-');
    expect(cmcNumber(1234.5)).toBe((1234.5).toLocaleString());
  });

  it('formats durations as h/m/s', () => {
    expect(cmcDuration(0)).toBe('-');
    expect(cmcDuration(45)).toBe('45s');
    expect(cmcDuration(90)).toBe('2m');
    expect(cmcDuration(7200)).toBe('2.0h');
  });

  it('formats epoch seconds and millisecond timestamps, passing through junk', () => {
    expect(cmcTimestamp(1700000000)).not.toBe('-');
    expect(cmcTimestamp(1700000000000)).not.toBe('-');
    expect(cmcTimestamp('junk')).toBe('junk');
    expect(cmcTimestamp(null)).toBe('-');
  });
});

describe('newCmcOperationId', () => {
  it('produces unique ids', () => {
    expect(newCmcOperationId('cmc')).not.toBe(newCmcOperationId('cmc'));
  });
});

describe('createCmcMutationControl (legacy cmcMutationFetch state machine)', () => {
  function makeControl(hooks: Partial<Parameters<typeof createCmcMutationControl>[0]> = {}) {
    const onBusyChange = vi.fn();
    const clearSecret = vi.fn();
    const onContextCleared = vi.fn();
    const onRefresh = vi.fn();
    const control = createCmcMutationControl({
      onBusyChange,
      clearSecret,
      onContextCleared,
      onRefresh,
      ...hooks,
    });
    return { control, onBusyChange, clearSecret, onContextCleared, onRefresh };
  }

  it('POSTs with operation_id merged into the body and clears the pending context on success', async () => {
    const { control, onBusyChange, clearSecret, onContextCleared } = makeControl();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await control.run(candidate({ secretValue: 'secret' }));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pbgui.test:8000/api/services/cmc-pool/keys');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ api_key: 'secret', operation_id: 'op-1' });
    expect(clearSecret).toHaveBeenCalledOnce(); // legacy clearCmcMutationContext(pending, true)
    expect(onContextCleared).toHaveBeenCalledOnce();
    expect(onBusyChange).toHaveBeenNthCalledWith(1, true);
    expect(onBusyChange).toHaveBeenNthCalledWith(2, false);
  });

  it('appends the identifier to the query string for query transport', async () => {
    const { control } = makeControl();
    fetchMock.mockResolvedValue(jsonResponse({}));

    await control.run(candidate({ path: '/cmc-pool/keys/k1/disable', method: 'POST', transport: 'query', body: {}, modal: '' }));

    expect(fetchMock.mock.calls[0]![0]).toBe(
      'http://pbgui.test:8000/api/services/cmc-pool/keys/k1/disable?operation_id=op-1'
    );
    expect(fetchMock.mock.calls[0]![1].body).toBeUndefined();
  });

  it('uses identifierField (request_id) for authority transfers', async () => {
    const { control } = makeControl();
    fetchMock.mockResolvedValue(jsonResponse({}));

    await control.run(
      candidate({ identifierField: 'request_id', body: { quota_domain_id: 'd' }, modal: 'authority' })
    );

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({
      quota_domain_id: 'd',
      request_id: 'op-1',
    });
  });

  it('rejects a second mutation while one is busy (legacy _cmcMutationBusy guard)', async () => {
    const { control } = makeControl();
    let release!: (v: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const first = control.run(candidate());
    await expect(control.run(candidate({ operationId: 'op-2' }))).rejects.toThrow(
      'Another credential mutation is already in progress.'
    );
    release(jsonResponse({}));
    await first;
  });

  it('replays the same pending operation without re-POSTing when the record is pending', async () => {
    const { control } = makeControl();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'in flight' }, 409)) // first POST 409s, context kept
      .mockResolvedValueOnce(jsonResponse({ status: 'pending' })) // GET operations/op-1
      .mockResolvedValueOnce(jsonResponse({ accepted: true })); // replay POST with pending op id

    await control.run(candidate()).catch(() => {}); // 409 leaves the pending context behind
    await control.run(candidate()); // retry resolves it first

    expect(fetchMock.mock.calls[1]![0]).toBe('http://pbgui.test:8000/api/services/cmc-pool/operations/op-1');
    const [url, init] = fetchMock.mock.calls[2]!;
    expect(url).toBe('http://pbgui.test:8000/api/services/cmc-pool/keys');
    expect(JSON.parse(init.body as string).operation_id).toBe('op-1'); // pending id, not a new one
  });

  it('returns the recorded result for the same candidate without re-POSTing', async () => {
    const { control, clearSecret } = makeControl();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'boom' }, 502)) // first POST fails, context kept
      .mockResolvedValueOnce(jsonResponse({ status: 'complete', result: { operation_id: 'op-done' } }));

    await control.run(candidate()).catch(() => {});
    await expect(control.run(candidate())).resolves.toEqual({ operation_id: 'op-done' });
    expect(fetchMock).toHaveBeenCalledTimes(2); // first POST + only the operations GET
    expect(clearSecret).toHaveBeenCalledOnce(); // recorded completion clears the modal secret
  });

  it('refreshes and refuses a different candidate when the previous operation completed', async () => {
    const { control, onRefresh } = makeControl();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'boom' }, 502)) // op-1 left pending
      .mockResolvedValueOnce(jsonResponse({ status: 'complete', result: { ok: 1 } })); // later completed

    await control.run(candidate()).catch(() => {});
    // sameCmcMutation ignores the operation id - a different action must differ in
    // action/target/path/method/body, like the legacy modal candidates do.
    const different: CmcMutationCandidate = {
      ...candidate(),
      action: 'cmc_patch',
      path: '/cmc-pool/keys/k9',
      method: 'PATCH',
      body: { label: 'renamed' },
    };
    await expect(control.run(different)).rejects.toThrow(
      'Previous CMC operation op-1 completed. Review the refreshed pool, then retry this action.'
    );
    expect(onRefresh).toHaveBeenCalledOnce(); // legacy loadCmcPool() side effect
  });

  it('refuses a different candidate while the previous operation is still pending', async () => {
    const { control } = makeControl();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'boom' }, 502)) // op-1 left pending
      .mockResolvedValueOnce(jsonResponse({ status: 'pending' }));

    await control.run(candidate()).catch(() => {});
    const different: CmcMutationCandidate = {
      ...candidate(),
      action: 'cmc_patch',
      path: '/cmc-pool/keys/k9',
      method: 'PATCH',
      body: { label: 'renamed' },
    };
    await expect(control.run(different)).rejects.toThrow(
      'CMC operation op-1 is still pending. Retry or explicitly cancel that action before starting another mutation.'
    );
  });

  it('adopts the new candidate when the previous operation record is gone (404)', async () => {
    const { control } = makeControl();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'boom' }, 502)) // op-1 left pending
      .mockResolvedValueOnce(jsonResponse({ detail: 'not found' }, 404)) // record gone
      .mockResolvedValueOnce(jsonResponse({})); // adopted candidate POST

    await control.run(candidate()).catch(() => {});
    const different: CmcMutationCandidate = {
      ...candidate(),
      operationId: 'op-2',
      action: 'cmc_patch',
      path: '/cmc-pool/keys/k9',
      method: 'PATCH',
      body: { label: 'renamed' },
    };
    await control.run(different);

    expect(fetchMock.mock.calls[2]![0]).toBe('http://pbgui.test:8000/api/services/cmc-pool/keys/k9');
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body as string)).toMatchObject({
      label: 'renamed',
      operation_id: 'op-2',
    });
  });

  it('keeps the pending context on 409 and drops it on other <500 errors', async () => {
    const dropping = makeControl();
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'conflict' }, 409));
    await expect(dropping.control.run(candidate())).rejects.toBeInstanceOf(CmcApiError);

    const clearing = makeControl();
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'bad input' }, 400));
    await expect(clearing.control.run(candidate())).rejects.toBeInstanceOf(CmcApiError);
    expect(clearing.clearSecret).not.toHaveBeenCalled(); // cleared with clearSecret=false
  });

  it('appends the retry hint to errors while an operation stays pending', async () => {
    const { control } = makeControl();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'in flight' }, 409)) // first POST 409s
      .mockResolvedValueOnce(jsonResponse({ status: 'pending' })) // retry resolves to still-pending
      .mockResolvedValueOnce(jsonResponse({ detail: 'backend exploded' }, 503)); // replay POST fails

    await control.run(candidate()).catch(() => {}); // 409 keeps the pending context
    const error = await control.run(candidate()).catch((e: unknown) => e);
    expect((error as Error).message).toContain('backend exploded');
    expect((error as Error).message).toContain('Retry will check operation op-1 before sending anything.');
  });

  it('cancel drops the pending context and the busy flag is restored afterwards', async () => {
    const { control, onContextCleared } = makeControl();
    fetchMock.mockResolvedValue(jsonResponse({}));

    control.cancel('key');
    expect(onContextCleared).not.toHaveBeenCalled(); // nothing pending yet

    await control.run(candidate());
    expect(onContextCleared).toHaveBeenCalledOnce();
  });
});
