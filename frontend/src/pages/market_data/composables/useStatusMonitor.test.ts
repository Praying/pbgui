import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStatusMonitor } from './useStatusMonitor';
import { getExchangeMeta } from '../lib/exchange';

/* The status-monitor fragment mount protocol (market_data_main.html:4108-4174,
   7406-7413, 7813-7816): fetch the same-origin fragment, innerHTML it into
   the host, re-execute its inline scripts, destroy via __mdsDestroy before
   remount, and drop stale fetches via the requestId generation counter
   (uiState.statusMonitorRequestId, recon R4). */

const FRAGMENT = '<div class="mds-root" id="__MDS_ROOT_ID__"><p>ok</p></div>'
  + '<script>window.__MDS_RAN__ = (window.__MDS_RAN__ || 0) + 1;<\/script>';

interface Deferred {
  resolve: (body: string, init?: ResponseInit) => void;
  reject: (error: Error) => void;
}

/** The fragment's destroy contract root (:4130-4137). */
type MdsRoot = HTMLElement & { __mdsDestroy?: () => void };

function mdsRoot(host: HTMLElement): MdsRoot {
  return host.querySelector('.mds-root') as MdsRoot | null ?? fail('no .mds-root in host');
}

function fail(message: string): never {
  throw new Error(message);
}

let deferrals: Deferred[];
let fetchMock: ReturnType<typeof vi.fn>;
let hosts: HTMLElement[];
let nowValue: number;

function nextMountDefer(): Deferred {
  const deferred = {} as Deferred;
  deferrals.push(deferred);
  return deferred;
}

function makeController(exchange = 'hyperliquid') {
  return useStatusMonitor({
    getExchange: () => exchange,
    now: () => nowValue,
  });
}

function attachHost(controller: ReturnType<typeof useStatusMonitor>): HTMLElement {
  const host = document.createElement('div');
  host.id = 'status-monitor-host';
  document.body.appendChild(host);
  hosts.push(host);
  controller.attachHost(host);
  return host;
}

beforeEach(() => {
  deferrals = [];
  hosts = [];
  nowValue = 1_000;
  fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve, reject) => {
        deferrals.push({
          resolve: (body, init) => resolve(new Response(body, init)),
          reject,
        });
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  (globalThis as { __BOOT__?: unknown }).__BOOT__ = {
    origin: 'http://pbgui.test:8000',
    token: 'tok',
    version: 'v',
    serial: 's',
  };
});

afterEach(() => {
  for (const host of hosts) host.remove();
  vi.unstubAllGlobals();
});

describe('mountStatusMonitor (:4142-4174)', () => {
  it('marks the host exchange and enters loading before the fetch resolves', async () => {
    const controller = makeController();
    const host = attachHost(controller);
    const pending = controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    expect(host.dataset.exchange).toBe('bybit');
    expect(controller.phase.value).toBe('loading');
    deferrals[0]!.resolve(FRAGMENT);
    await pending;
    expect(controller.phase.value).toBe('ready');
  });

  it('fetches the status-monitor URL with cache: no-store (:4157)', async () => {
    const controller = makeController();
    attachHost(controller);
    const pending = controller.mountStatusMonitor(getExchangeMeta('binance'), false);
    deferrals[0]!.resolve(FRAGMENT);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://pbgui.test:8000/api/market-data/status-monitor/binanceusdm');
    expect(init?.cache).toBe('no-store');
  });

  it('writes the fragment into the host and re-executes its scripts (:4163-4165)', async () => {
    const controller = makeController();
    const host = attachHost(controller);
    const replaceSpy = vi.spyOn(host, 'replaceChild');
    const pending = controller.mountStatusMonitor(getExchangeMeta('hyperliquid'), false);
    deferrals[0]!.resolve(FRAGMENT);
    await pending;
    expect(host.querySelector('.mds-root')).not.toBeNull();
    // executeInlineScripts (:4116-4125) replaced the parsed (never-executed)
    // script node with a fresh element so the browser runs it.
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    const [replacement, original] = replaceSpy.mock.calls[0] as unknown as [
      HTMLScriptElement,
      HTMLScriptElement,
    ];
    expect(replacement).not.toBe(original);
    expect(replacement.tagName).toBe('SCRIPT');
    expect(replacement.textContent).toContain('__MDS_RAN__');
    expect(host.dataset.exchange).toBe('hyperliquid');
  });

  it('copies attributes onto re-executed scripts (:4118-4121)', async () => {
    const controller = makeController();
    const host = attachHost(controller);
    const pending = controller.mountStatusMonitor(getExchangeMeta('hyperliquid'), false);
    deferrals[0]!.resolve(
      '<div class="mds-root"></div><script src="/app/js/pbgui_dialogs.js?v=6"><\/script>'
    );
    await pending;
    expect(host.querySelector('script')?.getAttribute('src')).toBe(
      '/app/js/pbgui_dialogs.js?v=6'
    );
  });

  it('destroys any previous fragment before remounting (:4148, R2)', async () => {
    const controller = makeController();
    const host = attachHost(controller);
    const first = controller.mountStatusMonitor(getExchangeMeta('hyperliquid'), false);
    deferrals[0]!.resolve(
      '<div class="mds-root" id="r1"><span>old</span></div><script>void 0;<\/script>'
    );
    await first;
    const destroy = vi.fn();
    mdsRoot(host).__mdsDestroy = destroy;

    const second = controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    expect(destroy).toHaveBeenCalledTimes(1);
    deferrals[1]!.resolve(FRAGMENT);
    await second;
    expect(host.querySelector('#r1')).toBeNull();
    expect(host.dataset.exchange).toBe('bybit');
  });

  it('appends a ?_ts= cache-bust on force reload (:4108-4114, corrected)', async () => {
    const controller = makeController();
    attachHost(controller);
    nowValue = 1_770_000_000_000;
    const pending = controller.mountStatusMonitor(getExchangeMeta('okx'), true);
    deferrals[0]!.resolve(FRAGMENT);
    await pending;
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      'http://pbgui.test:8000/api/market-data/status-monitor/okx?_ts=1770000000000'
    );
  });

  it('renders the error state with the HTTP message when the fetch fails (:4166-4173)', async () => {
    const controller = makeController();
    const host = attachHost(controller);
    const pending = controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    deferrals[0]!.resolve('nope', { status: 500 });
    await pending;
    expect(controller.phase.value).toBe('error');
    expect(controller.errorMessage.value).toBe('HTTP 500');
    expect(host.querySelector('.mds-root')).toBeNull();
  });

  it('keeps the attempted exchange on the host after a failed mount (:4149)', async () => {
    const controller = makeController();
    const host = attachHost(controller);
    const pending = controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    deferrals[0]!.resolve('nope', { status: 500 });
    await pending;
    expect(host.dataset.exchange).toBe('bybit');
  });

  it('is a no-op without an attached host (:7143-7144)', async () => {
    const controller = makeController();
    await controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('stale-request guard (uiState.statusMonitorRequestId, R4)', () => {
  it('drops a slow earlier response so it cannot overwrite a newer mount', async () => {
    const controller = makeController();
    const host = attachHost(controller);
    const slow = controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    const fast = controller.mountStatusMonitor(getExchangeMeta('okx'), false);
    deferrals[1]!.resolve(FRAGMENT); // okx lands first
    await fast;
    expect(host.querySelector('.mds-root')).not.toBeNull();
    expect(host.dataset.exchange).toBe('okx');
    deferrals[0]!.resolve('<div class="mds-root">STALE</div>'); // bybit lands late
    await slow;
    expect(host.querySelector('.mds-root')?.textContent).toBe('ok');
    expect(host.dataset.exchange).toBe('okx');
  });

  it('drops a late error from an earlier mount', async () => {
    const controller = makeController();
    const host = attachHost(controller);
    const slow = controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    const fast = controller.mountStatusMonitor(getExchangeMeta('okx'), false);
    deferrals[1]!.resolve(FRAGMENT);
    await fast;
    deferrals[0]!.resolve('nope', { status: 500 });
    await slow;
    expect(controller.phase.value).toBe('ready');
    expect(controller.errorMessage.value).toBe('');
  });
});

describe('destroyStatusMonitor (:4127-4140)', () => {
  it('calls __mdsDestroy on the fragment root, clears the host and the exchange attr', () => {
    const controller = makeController();
    const host = attachHost(controller);
    host.innerHTML = '<div class="mds-root"><span>x</span></div>';
    host.dataset.exchange = 'hyperliquid';
    const destroy = vi.fn();
    mdsRoot(host).__mdsDestroy = destroy;
    controller.destroyStatusMonitor();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(host.innerHTML).toBe('');
    expect(host.hasAttribute('data-exchange')).toBe(false);
  });

  it('swallows __mdsDestroy exceptions (:4132-4136)', () => {
    const controller = makeController();
    const host = attachHost(controller);
    host.innerHTML = '<div class="mds-root"></div>';
    mdsRoot(host).__mdsDestroy = () => {
      throw new Error('boom');
    };
    expect(() => controller.destroyStatusMonitor()).not.toThrow();
    expect(host.innerHTML).toBe('');
  });

  it('is a no-op without a host or without a fragment root', () => {
    const controller = makeController();
    expect(() => controller.destroyStatusMonitor()).not.toThrow();
    const host = attachHost(controller);
    expect(() => controller.destroyStatusMonitor()).not.toThrow();
  });
});

describe('updateStatusPanel (:7406-7413)', () => {
  it('mounts when the host has no fragment yet', async () => {
    const controller = makeController('hyperliquid');
    attachHost(controller);
    const pending = Promise.resolve();
    const mountSpy = vi
      .spyOn(controller, 'mountStatusMonitor')
      .mockReturnValue(pending as Promise<void>);
    controller.updateStatusPanel();
    expect(mountSpy).toHaveBeenCalledWith(
      expect.objectContaining({ statusKey: 'hyperliquid' }),
      false
    );
  });

  it('skips the mount when the same exchange fragment is already live', async () => {
    const controller = makeController('hyperliquid');
    const host = attachHost(controller);
    host.dataset.exchange = 'hyperliquid';
    host.innerHTML = '<div class="mds-root"></div>';
    const mountSpy = vi.spyOn(controller, 'mountStatusMonitor');
    controller.updateStatusPanel();
    expect(mountSpy).not.toHaveBeenCalled();
  });

  it('remounts when the exchange changed even though a fragment is live', async () => {
    const controller = makeController('bybit');
    const host = attachHost(controller);
    host.dataset.exchange = 'hyperliquid';
    host.innerHTML = '<div class="mds-root"></div>';
    const mountSpy = vi
      .spyOn(controller, 'mountStatusMonitor')
      .mockReturnValue(Promise.resolve() as Promise<void>);
    controller.updateStatusPanel();
    expect(mountSpy).toHaveBeenCalledWith(expect.objectContaining({ statusKey: 'bybit' }), false);
  });

  it('is a no-op without a host (:7408-7409)', () => {
    const controller = makeController();
    const mountSpy = vi.spyOn(controller, 'mountStatusMonitor');
    controller.updateStatusPanel();
    expect(mountSpy).not.toHaveBeenCalled();
  });
});

describe('reloadStatusMonitor (:7813-7816)', () => {
  it('remounts the current exchange with a cache-bust', async () => {
    const controller = makeController('bybit');
    attachHost(controller);
    const mountSpy = vi
      .spyOn(controller, 'mountStatusMonitor')
      .mockReturnValue(Promise.resolve() as Promise<void>);
    controller.reloadStatusMonitor();
    expect(mountSpy).toHaveBeenCalledWith(expect.objectContaining({ statusKey: 'bybit' }), true);
  });
});
