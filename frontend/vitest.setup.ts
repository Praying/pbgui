// Node >= 25 exposes an experimental global `localStorage` getter that
// returns undefined unless --localstorage-file is passed. Vitest's jsdom
// populateGlobal skips copying keys that already exist on globalThis and
// are not in its KEYS list, so Node's broken getter shadows the DOM's
// localStorage for every test ("Cannot read properties of undefined
// (reading 'clear')").
//
// Setup files run after the jsdom environment is installed but Node's
// getter still owns the key. Replace it with an in-memory Storage so
// tests get a working, isolated implementation.

type StorageShim = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
};

function createMemoryStorage(): StorageShim {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() { return data.size; },
  };
}

const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
/* Node 25.5+ can also hand back a half-initialized Storage object (methods
   missing) when --localstorage-file is passed without a valid path — probe
   the API surface, not just undefined. */
const probe = desc?.get ? (desc.get as () => unknown)() : undefined;
const broken =
  probe === undefined ||
  probe === null ||
  typeof (probe as Partial<Storage>).clear !== 'function';
if (desc?.get && broken) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    writable: true,
    configurable: true,
  });
}

// Reka UI primitives (shared/components/forms) rely on browser APIs jsdom
// does not implement. Every stub is guarded so real browsers and newer
// jsdom versions keep their own implementation.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = (): boolean => false;
    Element.prototype.setPointerCapture = (): void => {};
    Element.prototype.releasePointerCapture = (): void => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = (): void => {};
  }
}
