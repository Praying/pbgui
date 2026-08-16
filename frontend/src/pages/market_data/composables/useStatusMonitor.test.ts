import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStatusMonitor } from './useStatusMonitor';
import { getExchangeMeta } from '../lib/exchange';

/* The status-monitor iframe mount (M-data-8 fragment retirement).

   Until M-data-8 the panel fetched the same-origin fragment
   /status-monitor/{exchange}, injected it into a host div via innerHTML and
   re-executed its inline scripts (legacy market_data_main.html:4108-4174,
   7406-7413, 7813-7816). That contract requires inline CLASSIC scripts: the
   retired fragment's replacement is the built market_data_status Vue page
   (an ES-module document), whose scripts the browser evaluates only once per
   document — re-injecting it on every exchange switch would leave every
   remount after the first blank. The controller therefore drives an iframe
   src instead: the route injects data-exchange into the served document and
   the embedded page runs its own lifecycle (unloading the frame discards its
   timers/WS — the __mdsDestroy contract now lives inside the frame). */

let frames: HTMLIFrameElement[];
let nowValue: number;

function makeController(exchange = 'hyperliquid') {
  return useStatusMonitor({
    getExchange: () => exchange,
    now: () => nowValue,
  });
}

function attachFrame(controller: ReturnType<typeof useStatusMonitor>): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  frame.id = 'status-monitor-host';
  document.body.appendChild(frame);
  frames.push(frame);
  controller.attachFrame(frame);
  return frame;
}

beforeEach(() => {
  frames = [];
  nowValue = 1_000;
  (globalThis as { __BOOT__?: unknown }).__BOOT__ = {
    origin: 'http://pbgui.test:8000',
    token: 'tok',
    version: 'v',
    serial: 's',
  };
});

afterEach(() => {
  for (const frame of frames) frame.remove();
  vi.unstubAllGlobals();
});

describe('mountStatusMonitor (iframe src swap)', () => {
  it('marks the frame exchange, enters loading and points the src at the route', () => {
    const controller = makeController();
    const frame = attachFrame(controller);
    void controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    expect(frame.dataset.exchange).toBe('bybit');
    expect(controller.phase.value).toBe('loading');
    expect(frame.src).toBe('http://pbgui.test:8000/api/market-data/status-monitor/bybit');
  });

  it('uses each exchange status key in the URL (:4108-4114)', () => {
    const controller = makeController();
    const frame = attachFrame(controller);
    void controller.mountStatusMonitor(getExchangeMeta('binance'), false);
    expect(frame.src).toBe('http://pbgui.test:8000/api/market-data/status-monitor/binanceusdm');
  });

  it('appends a ?_ts= cache-bust on force reload (:4108-4114, corrected)', () => {
    const controller = makeController();
    const frame = attachFrame(controller);
    nowValue = 1_770_000_000_000;
    void controller.mountStatusMonitor(getExchangeMeta('okx'), true);
    expect(frame.src).toBe(
      'http://pbgui.test:8000/api/market-data/status-monitor/okx?_ts=1770000000000'
    );
  });

  it('is a no-op without an attached frame (:7143-7144)', () => {
    const controller = makeController();
    void controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    expect(controller.phase.value).toBe('loading'); // phase bookkeeping only
  });
});

describe('frame load/error events', () => {
  it('flips to ready when the frame document loads', () => {
    const controller = makeController();
    attachFrame(controller);
    void controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    controller.handleFrameLoad();
    expect(controller.phase.value).toBe('ready');
    expect(controller.errorMessage.value).toBe('');
  });

  it('flips to error with an empty detail when the frame fails to load', () => {
    const controller = makeController();
    attachFrame(controller);
    void controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    controller.handleFrameError();
    expect(controller.phase.value).toBe('error');
    // empty message → StatusPanel renders the market.failedStatusMonitor fallback
    expect(controller.errorMessage.value).toBe('');
  });

  it('ignores a late load event once a newer mount already landed (R4 spirit)', () => {
    const controller = makeController();
    attachFrame(controller);
    void controller.mountStatusMonitor(getExchangeMeta('bybit'), false);
    controller.handleFrameLoad();
    void controller.mountStatusMonitor(getExchangeMeta('okx'), false); // new navigation
    controller.handleFrameLoad(); // its own load
    expect(controller.phase.value).toBe('ready');
    expect(frameOf(controller).src).toContain('/status-monitor/okx');
    controller.handleFrameLoad(); // stray re-fire must not error
    expect(controller.phase.value).toBe('ready');
  });
});

function frameOf(controller: ReturnType<typeof useStatusMonitor>): HTMLIFrameElement {
  const frame = frames[frames.length - 1];
  expect(frame).toBeDefined();
  return frame!;
}

describe('destroyStatusMonitor (:4127-4140)', () => {
  it('resets the phase, the exchange bookkeeping and the frame attr', () => {
    const controller = makeController('hyperliquid');
    const frame = attachFrame(controller);
    void controller.mountStatusMonitor(getExchangeMeta('hyperliquid'), false);
    controller.handleFrameLoad();
    controller.destroyStatusMonitor();
    expect(controller.phase.value).toBe('idle');
    expect(frame.hasAttribute('data-exchange')).toBe(false);
    // the next updateStatusPanel remounts (bookkeeping cleared)
    const mountSpy = vi
      .spyOn(controller, 'mountStatusMonitor')
      .mockReturnValue(Promise.resolve() as Promise<void>);
    controller.updateStatusPanel();
    expect(mountSpy).toHaveBeenCalledWith(
      expect.objectContaining({ statusKey: 'hyperliquid' }),
      false
    );
  });

  it('is a no-op without a frame', () => {
    const controller = makeController();
    expect(() => controller.destroyStatusMonitor()).not.toThrow();
  });
});

describe('updateStatusPanel (:7406-7413)', () => {
  it('mounts when nothing is mounted yet', () => {
    const controller = makeController('hyperliquid');
    attachFrame(controller);
    const mountSpy = vi
      .spyOn(controller, 'mountStatusMonitor')
      .mockReturnValue(Promise.resolve() as Promise<void>);
    controller.updateStatusPanel();
    expect(mountSpy).toHaveBeenCalledWith(
      expect.objectContaining({ statusKey: 'hyperliquid' }),
      false
    );
  });

  it('skips the mount when the same exchange is already live', () => {
    const controller = makeController('hyperliquid');
    const frame = attachFrame(controller);
    void controller.mountStatusMonitor(getExchangeMeta('hyperliquid'), false);
    controller.handleFrameLoad();
    const mountSpy = vi.spyOn(controller, 'mountStatusMonitor');
    controller.updateStatusPanel();
    expect(mountSpy).not.toHaveBeenCalled();
    expect(frame.src).toContain('/status-monitor/hyperliquid');
  });

  it('remounts when the exchange changed even though a frame is live', () => {
    const controller = makeController('bybit');
    const frame = attachFrame(controller);
    void controller.mountStatusMonitor(getExchangeMeta('hyperliquid'), false);
    controller.handleFrameLoad();
    const mountSpy = vi
      .spyOn(controller, 'mountStatusMonitor')
      .mockReturnValue(Promise.resolve() as Promise<void>);
    controller.updateStatusPanel();
    expect(mountSpy).toHaveBeenCalledWith(expect.objectContaining({ statusKey: 'bybit' }), false);
  });

  it('is a no-op without a frame (:7408-7409)', () => {
    const controller = makeController();
    const mountSpy = vi.spyOn(controller, 'mountStatusMonitor');
    controller.updateStatusPanel();
    expect(mountSpy).not.toHaveBeenCalled();
  });
});

describe('reloadStatusMonitor (:7813-7816)', () => {
  it('remounts the current exchange with a cache-bust', () => {
    const controller = makeController('bybit');
    attachFrame(controller);
    const mountSpy = vi
      .spyOn(controller, 'mountStatusMonitor')
      .mockReturnValue(Promise.resolve() as Promise<void>);
    controller.reloadStatusMonitor();
    expect(mountSpy).toHaveBeenCalledWith(expect.objectContaining({ statusKey: 'bybit' }), true);
  });
});
