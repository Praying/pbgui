import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { createRunAdapter } from '../config';
import { createToast } from '../lib/toast';
import { FORCED_MODES, useRunInstances } from './useRunInstances';

/* The row-action contracts (v7_run.html:593-609, :899-1077): REST snapshot
   with generation guard, delete/forced-mode/convert/balance flows. The
   toast renders into a real <div>; navigation and PBGuiDialogs are
   observable through the injected navigate and window stubs. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const INSTANCES = { instances: [{ name: 'main', user: 'alice', status: 'synced', exchange: 'Bybit', running_on: [] }] };

let toastEl: HTMLDivElement;
let navigate: ReturnType<typeof vi.fn>;
let store: ReturnType<typeof useRunInstances>;
let fetchMock: ReturnType<typeof vi.fn>;

function makeStore(adapter = createRunAdapter('v7')): ReturnType<typeof useRunInstances> {
  const toast = createToast(() => toastEl, () => undefined);
  return useRunInstances({ t: (key, params) => `${key}${params ? ':' + JSON.stringify(params) : ''}`, adapter, toast, navigate });
}

beforeEach(() => {
  toastEl = document.createElement('div');
  document.body.appendChild(toastEl);
  navigate = vi.fn();
  fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(INSTANCES), { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
  store = makeStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  toastEl.remove();
});

function toastText(): string {
  return toastEl.textContent || '';
}

describe('loadInstances (:593-609)', () => {
  it('loads the REST snapshot and marks the banner ok', async () => {
    await store.loadInstances();

    expect(store.instances.value.map((r) => r.name)).toEqual(['main']);
    expect(store.banner.value).toBe('ok');
    expect(store.countText.value).toBe('1/1');
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://pbgui.test:8000/api/v7/instances');
  });

  it('marks the banner lost on failure', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('nope', { status: 500 })));

    await store.loadInstances();

    expect(store.banner.value).toBe('lost');
    expect(store.instances.value).toEqual([]);
  });

  it('ignores a stale snapshot when a newer load or WS update landed (:601)', async () => {
    let resolveFirst: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveFirst = resolve))
    );

    const first = store.loadInstances();
    store.setInstancesFromWs([{ name: 'ws-row' }]);
    resolveFirst!(new Response(JSON.stringify({ instances: [{ name: 'stale' }] }), { status: 200 }));
    await first;

    expect(store.instances.value.map((r) => r.name)).toEqual(['ws-row']);
  });
});

describe('navigation (:899-908)', () => {
  it('edit and add go to the edit page with the right query', async () => {
    await store.loadInstances();

    store.editInstance('main');
    expect(navigate).toHaveBeenLastCalledWith('http://pbgui.test:8000/api/v7/edit_page?name=main');
    store.addInstance();
    expect(navigate).toHaveBeenLastCalledWith('http://pbgui.test:8000/api/v7/edit_page?new=1');
  });
});

describe('delete flow (:943-1001)', () => {
  it('blocks deleting a running instance with an error toast', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ instances: [{ name: 'main', status: 'synced', running_on: ['vps-a'] }] }), { status: 200 }))
    );
    await store.loadInstances();

    store.requestDelete('main');

    expect(store.pendingDeleteName.value).toBeNull();
    expect(toastText()).toContain('v7run.cannotDeleteRunning');
    expect(toastEl.className).toBe('toast-err');
  });

  it('confirms, deletes, toasts the host summary and removes the row locally', async () => {
    await store.loadInstances();
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ hosts: { 'vps-a': { success: true }, 'vps-b': { success: false } } }), { status: 200 }))
    );

    store.requestDelete('main');
    expect(store.pendingDeleteName.value).toBe('main');
    await store.executeDelete();

    expect(store.pendingDeleteName.value).toBeNull();
    expect(store.instances.value).toEqual([]);
    expect(String(fetchMock.mock.calls.at(-1)![0])).toBe('http://pbgui.test:8000/api/v7/instances/main');
    expect((fetchMock.mock.calls.at(-1)![1] as RequestInit).method).toBe('DELETE');
    expect(toastText()).toContain('v7run.instanceDeleted');
    expect(toastText()).toContain('v7run.vpsHostsOkWithFail');
    expect(toastEl.className).toBe('toast-ok');
  });

  it('a 409 surfaces the server detail as an error toast', async () => {
    await store.loadInstances();
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ detail: 'Instance is running' }), { status: 409 })));

    store.requestDelete('main');
    await store.executeDelete();

    expect(toastText()).toContain('v7run.deleteFailed');
    expect(store.pendingDeleteName.value).toBeNull();
  });
});

describe('forced-mode flow (:1030-1077)', () => {
  it('posts the mode, toasts the synced version and reloads', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ version: 4 }), { status: 200 })));

    store.requestForcedMode('main', 'panic');
    expect(store.pendingForced.value).toEqual({ name: 'main', mode: 'panic' });
    await store.executeForcedMode();

    expect(store.pendingForced.value).toBeNull();
    expect(toastText()).toContain('v7run.forcedModeSynced');
    expect(toastEl.className).toBe('toast-ok');
    /* :1072 reloads the list right after the toast — the legacy
       loadInstances() fires immediately, so the snapshot GET is the call
       after the forced-mode POST ( spying on the store property cannot
       intercept the internal closure call). */
    expect(String(fetchMock.mock.calls.at(-2)![0])).toBe('http://pbgui.test:8000/api/v7/instances/main/forced-mode');
    expect((fetchMock.mock.calls.at(-2)![1] as RequestInit).method).toBe('POST');
    expect(String(fetchMock.mock.calls.at(-1)![0])).toBe('http://pbgui.test:8000/api/v7/instances');
  });

  it('fails with a toast carrying the server detail', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ detail: 'host unreachable' }), { status: 502 })));

    store.requestForcedMode('main', 'tp_only');
    await store.executeForcedMode();

    expect(toastText()).toContain('v7run.forcedModeFailed');
    expect(toastText()).toContain('host unreachable');
    expect(toastEl.className).toBe('toast-err');
  });

  it('FORCED_MODES matches the legacy modal table (:1031-1035)', () => {
    expect(FORCED_MODES.panic!.variant).toBe('danger');
    expect(FORCED_MODES.graceful_stop!.variant).toBe('warning');
    expect(FORCED_MODES.tp_only!.variant).toBe('success');
    expect(FORCED_MODES.panic!.value).toBe('panic');
  });
});

describe('V8 conversion (:910-941)', () => {
  it('navigates to the migrated config', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ name: 'main_v8' }), { status: 200 })));

    await store.convertInstanceToV8('main');

    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://pbgui.test:8000/api/backtest-v8/migrate-v7');
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      source_type: 'run_config',
      source_name: 'main',
      target_name: 'main_v8',
      allow_manual_review_output: true,
    });
    expect(navigate).toHaveBeenLastCalledWith('http://pbgui.test:8000/api/backtest-v8/main_page?config=main_v8');
  });

  it('a 409 alerts and opens the existing config', async () => {
    const alertMock = vi.fn(() => Promise.resolve());
    vi.stubGlobal('PBGuiDialogs', { alert: alertMock });
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ detail: 'exists' }), { status: 409 })));

    await store.convertInstanceToV8('main');

    expect(alertMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'v7run.v8ConfigExists', confirmText: 'v7run.open' }));
    expect(navigate).toHaveBeenLastCalledWith('http://pbgui.test:8000/api/backtest-v8/main_page?config=main_v8');
  });

  it('other failures toast and alert (:933-939)', async () => {
    const alertMock = vi.fn(() => Promise.resolve());
    vi.stubGlobal('PBGuiDialogs', { alert: alertMock });
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ detail: 'boom' }), { status: 500 })));

    await store.convertInstanceToV8('main');

    expect(toastText()).toContain('v7run.v8ConversionFailed');
    expect(alertMock).toHaveBeenCalledWith(expect.objectContaining({ confirmText: 'common.ok' }));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('balance calculator handoff (:1003-1028)', () => {
  it('v7 navigates with the instance params and exchange', async () => {
    await store.loadInstances();

    await store.openBalanceCalculator('main');

    expect(navigate).toHaveBeenLastCalledWith(
      'http://pbgui.test:8000/api/balance-calc/main_page?instance=main&instance_version=v7&exchange=bybit'
    );
  });

  it('v8 drafts the config first and navigates with the draft id', async () => {
    const v8Store = makeStore(createRunAdapter('v8'));
    await v8Store.loadInstances();
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/instances/main/config')) return Promise.resolve(new Response(JSON.stringify({ config: { bot: 1 } }), { status: 200 }));
      if (u.endsWith('/api/balance-calc/draft')) return Promise.resolve(new Response(JSON.stringify({ draft_id: 'd-9' }), { status: 200 }));
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    await v8Store.openBalanceCalculator('main');

    expect(navigate).toHaveBeenLastCalledWith(
      'http://pbgui.test:8000/api/balance-calc/main_page?draft_id=d-9&exchange=bybit'
    );
  });

  it('v8 failures stop with an error toast (:1022)', async () => {
    const v8Store = makeStore(createRunAdapter('v8'));
    await v8Store.loadInstances();
    fetchMock.mockImplementation(() => Promise.resolve(new Response('nope', { status: 500 })));

    await v8Store.openBalanceCalculator('main');

    expect(navigate).not.toHaveBeenCalled();
    expect(toastText()).toContain('v7run.balanceCalculatorFailed');
  });
});
