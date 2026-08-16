import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFrameAutoResize, type FrameHost } from './useFrameAutoResize';

/* M-data-7 — the generic iframe height-sync engine, the dedupe of the two
   legacy copies (market_data_main.html :7447-7505 installBest1mFrameAutoResize
   and :7507-7575 installBest1mJobMonitorFrameAutoResize, recon R7). */

interface ObservedCall {
  target: unknown;
  options?: MutationObserverInit;
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  readonly observed: ObservedCall[] = [];
  disconnectCount = 0;
  #callback: () => void;

  constructor(callback: () => void) {
    this.#callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  observe(target: Node, options?: MutationObserverInit): void {
    this.observed.push({ target, options });
  }

  disconnect(): void {
    this.disconnectCount += 1;
  }

  fire(): void {
    this.#callback();
  }
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed: unknown[] = [];
  disconnectCount = 0;
  #callback: () => void;

  constructor(callback: () => void) {
    this.#callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(target: unknown): void {
    this.observed.push(target);
  }

  disconnect(): void {
    this.disconnectCount += 1;
  }

  fire(): void {
    this.#callback();
  }
}

function makeDoc(): Document {
  return document.implementation.createHTMLDocument('frame');
}

function setHeight(el: Element, height: number): void {
  Object.defineProperty(el, 'scrollHeight', { value: height, configurable: true });
}

function makeFrame(doc: Document | null): FrameHost {
  return { contentDocument: doc, contentWindow: null, style: { height: '' } };
}

/** Immediate rAF pump that records callbacks for coalescing assertions. */
function makeRaf(): { fn: (cb: () => void) => number; pump: () => void; count: () => number } {
  const queue: (() => void)[] = [];
  return {
    fn: (cb) => {
      queue.push(cb);
      return queue.length;
    },
    pump: () => {
      const pending = [...queue];
      queue.length = 0;
      pending.forEach((cb) => cb());
    },
    count: () => queue.length,
  };
}

function makeTimers(): { setTimeoutFn: typeof setTimeout; clearTimeoutFn: typeof clearTimeout; fire: () => void; registered: () => number } {
  let handle = 0;
  let fired = false;
  let lastCb: (() => void) | null = null;
  const active = new Set<number>();
  const timers: { setTimeoutFn: typeof setTimeout; clearTimeoutFn: typeof clearTimeout; fire: () => void; registered: () => number } = {
    setTimeoutFn: ((cb: () => void, _ms?: number) => {
      handle += 1;
      active.add(handle);
      lastCb = cb;
      fired = false;
      return handle;
    }) as typeof setTimeout,
    clearTimeoutFn: ((h: unknown) => {
      active.delete(h as number);
    }) as typeof clearTimeout,
    fire: () => {
      const cb = lastCb;
      lastCb = null;
      fired = true;
      active.clear(); // a fired timer is no longer armed
      cb?.();
    },
    registered: () => (fired ? 0 : active.size),
  };
  return timers;
}

beforeEach(() => {
  FakeMutationObserver.instances = [];
  FakeResizeObserver.instances = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('height application (:7452-7479)', () => {
  it('applies the body scroll height when there is no content root', () => {
    const doc = makeDoc();
    setHeight(doc.body, 640);
    setHeight(doc.documentElement, 600);
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
    });
    controller.handleLoad();
    expect(raf.count()).toBe(1);
    raf.pump();
    expect(frame.style.height).toBe('640px');
  });

  it('prefers the rootId content root like the hyperliquid variant (:7453)', () => {
    const doc = makeDoc();
    const root = doc.createElement('div');
    root.id = '__HLDA_ROOT__';
    Object.defineProperty(root, 'offsetHeight', { value: 910, configurable: true });
    doc.body.appendChild(root);
    setHeight(doc.body, 100); // body would be smaller — root wins
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      rootId: '__HLDA_ROOT__',
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
    });
    controller.handleLoad();
    raf.pump();
    expect(frame.style.height).toBe('910px');
  });

  it('falls back to body.firstElementChild for the monitor variant (:7513)', () => {
    const doc = makeDoc();
    const root = doc.createElement('section');
    Object.defineProperty(root, 'scrollHeight', { value: 333, configurable: true });
    doc.body.appendChild(root);
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
    });
    controller.handleLoad();
    raf.pump();
    expect(frame.style.height).toBe('333px');
  });

  it('keeps the current height when the document reports zero (:7475)', () => {
    const doc = makeDoc();
    const frame = makeFrame(doc);
    frame.style.height = '200px';
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
    });
    controller.handleLoad();
    raf.pump();
    expect(frame.style.height).toBe('200px');
  });

  it('swallows a missing document (:7471-7473 guard)', () => {
    const frame = makeFrame(null);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
    });
    expect(() => {
      controller.handleLoad();
      raf.pump();
    }).not.toThrow();
  });
});

describe('observer lifecycle (:7490-7504, :7550-7574 — no observer leak, R7)', () => {
  it('observes the body with the exact legacy mutation options on load', () => {
    const doc = makeDoc();
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
    });
    controller.handleLoad();
    const observer = FakeMutationObserver.instances[0]!;
    expect(observer.observed).toHaveLength(1);
    expect(observer.observed[0]!.target).toBe(doc.body);
    expect(observer.observed[0]!.options).toEqual({
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  });

  it('requeues exactly one height sync for a burst of mutations (rAF coalescing :7481-7488)', () => {
    const doc = makeDoc();
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
    });
    controller.handleLoad();
    raf.pump();
    const observer = FakeMutationObserver.instances[0]!;
    observer.fire();
    observer.fire();
    observer.fire();
    expect(raf.count()).toBe(1);
    setHeight(doc.body, 777);
    raf.pump();
    expect(frame.style.height).toBe('777px');
  });

  it('disconnects the previous observer on every load (remount-safe)', () => {
    const doc = makeDoc();
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
    });
    controller.handleLoad();
    controller.handleLoad();
    controller.handleLoad();
    expect(FakeMutationObserver.instances).toHaveLength(3);
    expect(FakeMutationObserver.instances[0]!.disconnectCount).toBe(1);
    expect(FakeMutationObserver.instances[1]!.disconnectCount).toBe(1);
    expect(FakeMutationObserver.instances[2]!.disconnectCount).toBe(0);
  });

  it('adds a ResizeObserver on the content root only for the monitor variant (:7564-7570)', () => {
    const doc = makeDoc();
    const root = doc.createElement('section');
    doc.body.appendChild(root);
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      useResizeObserver: true,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
      ResizeObserverCtor: FakeResizeObserver as unknown as typeof ResizeObserver,
    });
    controller.handleLoad();
    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0]!.observed).toEqual([root]);
    // the hyperliquid variant installs none
    const plain = useFrameAutoResize({
      frame: () => frame,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
      ResizeObserverCtor: FakeResizeObserver as unknown as typeof ResizeObserver,
    });
    plain.handleLoad();
    expect(FakeResizeObserver.instances).toHaveLength(1);
  });

  it('skips the ResizeObserver when the constructor is unavailable (:7564 guard)', () => {
    const doc = makeDoc();
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      useResizeObserver: true,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
    });
    expect(() => controller.handleLoad()).not.toThrow();
    expect(FakeMutationObserver.instances).toHaveLength(1);
  });

  it('falls back to the global ResizeObserver when no ctor is injected (:7564-7570)', () => {
    // regression class: the composable must resolve the browser global on
    // its own — AutoResizeFrame never passes a ctor, so a missing default
    // silently disabled the monitor variant's second observer
    class StubbedResizeObserver extends FakeResizeObserver {
      static installed: StubbedResizeObserver[] = [];
      constructor(callback: () => void) {
        super(callback);
        StubbedResizeObserver.installed.push(this);
      }
    }
    vi.stubGlobal('ResizeObserver', StubbedResizeObserver);
    const doc = makeDoc();
    const root = doc.createElement('section');
    doc.body.appendChild(root);
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      useResizeObserver: true,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
      // no ResizeObserverCtor — the global is the only source
    });
    controller.handleLoad();
    expect(StubbedResizeObserver.installed).toHaveLength(1);
    expect(StubbedResizeObserver.installed[0]!.observed).toEqual([root]);
  });

  it('teardown disconnects both observers (:7554-7555 equivalent)', () => {
    const doc = makeDoc();
    const root = doc.createElement('section');
    doc.body.appendChild(root);
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const controller = useFrameAutoResize({
      frame: () => frame,
      useResizeObserver: true,
      requestAnimationFrame: raf.fn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
      ResizeObserverCtor: FakeResizeObserver as unknown as typeof ResizeObserver,
    });
    controller.handleLoad();
    const mutation = FakeMutationObserver.instances[0]!;
    const resize = FakeResizeObserver.instances[0]!;
    controller.teardown();
    expect(mutation.disconnectCount).toBe(1);
    expect(resize.disconnectCount).toBe(1);
    // a second teardown is idempotent
    controller.teardown();
    expect(mutation.disconnectCount).toBe(1);
    expect(resize.disconnectCount).toBe(1);
  });
});

describe('settle timer — monitor variant (:7552)', () => {
  it('re-syncs once after the settle delay and teardown cancels it', () => {
    const doc = makeDoc();
    const frame = makeFrame(doc);
    const raf = makeRaf();
    const timers = makeTimers();
    const controller = useFrameAutoResize({
      frame: () => frame,
      settleMs: 120,
      requestAnimationFrame: raf.fn,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
      MutationObserverCtor: FakeMutationObserver as unknown as typeof MutationObserver,
    });
    controller.handleLoad();
    raf.pump();
    expect(timers.registered()).toBe(1);
    setHeight(doc.body, 512);
    timers.fire();
    expect(raf.count()).toBe(1);
    raf.pump();
    expect(frame.style.height).toBe('512px');

    // next load registers a fresh timer; teardown cancels it
    controller.handleLoad();
    expect(timers.registered()).toBe(1);
    controller.teardown();
    expect(timers.registered()).toBe(0);
  });
});
