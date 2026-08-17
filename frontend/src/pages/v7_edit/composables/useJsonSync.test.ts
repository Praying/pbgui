import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useJsonSync } from './useJsonSync';
import { validateJsonText } from '@/shared/jsonValidation';

/*
 * The bidirectional raw↔structured JSON sync — ports of
 * editor_shared.js createJsonSyncController (:2453-2594) as driven by
 * v7_edit.html:2619-2693: applyRaw (:2506-2529), applyStructured
 * (:2530-2564), the debounced schedulers (:2584-2591) and the delegated
 * structured-sync binding with its ignore rules (:2675-2693).
 */

const MESSAGES = { cannotBeEmpty: 'Config cannot be empty', topLevelObject: 'Top-level value must be an object' };

function validateRaw(raw: string): ReturnType<typeof validateJsonText> {
  return validateJsonText(raw, { expectObject: true, emptyMessage: MESSAGES.cannotBeEmpty, messages: MESSAGES });
}

interface Harness {
  raw: ReturnType<typeof ref<string>>;
  errors: ReturnType<typeof ref<string | null>>;
  applied: unknown[];
  collected: Record<string, unknown>[];
  sync: ReturnType<typeof useJsonSync>;
  setNextConfig(cfg: Record<string, unknown>): void;
}

function createHarness(initialRaw = '{}'): Harness {
  const raw = ref(initialRaw);
  const errors = ref<string | null>(null);
  const applied: unknown[] = [];
  const collected: Record<string, unknown>[] = [];
  let nextConfig: Record<string, unknown> = { live: { user: 'u' } };
  const sync = useJsonSync({
    rawId: 'cfg-raw-json',
    getRaw: () => raw.value,
    setRaw: (value) => {
      raw.value = value;
    },
    validateRaw,
    onError: (error) => {
      errors.value = error ? error.message : null;
    },
    applyParsed: async (parsed) => {
      applied.push(parsed);
    },
    collectConfig: () => {
      collected.push(nextConfig);
      return nextConfig;
    },
  });
  return {
    raw,
    errors,
    applied,
    collected,
    sync,
    setNextConfig(cfg: Record<string, unknown>) {
      nextConfig = cfg;
    },
  } as Harness;
}

function rawTextarea(): HTMLTextAreaElement {
  let el = document.getElementById('cfg-raw-json') as HTMLTextAreaElement | null;
  if (!el) {
    el = document.createElement('textarea');
    el.id = 'cfg-raw-json';
    document.body.appendChild(el);
  }
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('applyRaw (:2506-2529)', () => {
  it('validates, applies and records the last-applied text', async () => {
    const h = createHarness();
    h.raw.value = '{"live":{"user":"alice"}}';
    await h.sync.applyRaw();
    expect(h.applied).toEqual([{ live: { user: 'alice' } }]);
    expect(h.errors.value).toBeNull();
    // applying the same text again is a no-op
    h.raw.value = '{"live":{"user":"alice"}}';
    await h.sync.applyRaw();
    expect(h.applied).toHaveLength(1);
  });

  it('reports the error and skips apply for invalid JSON', async () => {
    const h = createHarness();
    h.raw.value = '{oops';
    await h.sync.applyRaw();
    expect(h.applied).toHaveLength(0);
    expect(h.errors.value).toBeTruthy();
    // recovering clears the error
    h.raw.value = '{"a":1}';
    await h.sync.applyRaw();
    expect(h.errors.value).toBeNull();
  });

  it('reports the empty-config message for blank text', async () => {
    const h = createHarness();
    h.raw.value = '   ';
    await h.sync.applyRaw();
    expect(h.errors.value).toBe(MESSAGES.cannotBeEmpty);
  });
});

describe('applyStructured (:2530-2564)', () => {
  it('serializes the collected config into the raw text', async () => {
    const h = createHarness();
    h.sync.applyStructured();
    await vi.runAllTimersAsync();
    await nextTick();
    expect(h.raw.value).toBe(JSON.stringify({ live: { user: 'u' } }, null, 2));
    expect(h.errors.value).toBeNull();
  });

  it('skips while the raw textarea is focused (no clobbering the editor)', async () => {
    const h = createHarness();
    const el = rawTextarea();
    el.focus();
    h.setNextConfig({ changed: true });
    h.sync.applyStructured();
    await vi.runAllTimersAsync();
    await nextTick();
    expect(h.raw.value).toBe('{}');
    el.blur();
  });

  it('keeps the raw error when the current raw text is invalid', async () => {
    const h = createHarness('{bad');
    h.sync.applyStructured();
    await vi.runAllTimersAsync();
    await nextTick();
    expect(h.errors.value).toBeTruthy();
    expect(h.collected).toHaveLength(0);
  });

  it('re-entry guard: a no-op collect does not flip state', async () => {
    const h = createHarness();
    h.setNextConfig(JSON.parse('{}') as Record<string, unknown>);
    h.raw.value = '{}';
    h.sync.applyStructured();
    await vi.runAllTimersAsync();
    await nextTick();
    expect(h.collected).toHaveLength(1);
  });
});

describe('schedulers (:2584-2591)', () => {
  it('debounces raw edits with the 250 ms delay', async () => {
    const h = createHarness();
    h.raw.value = '{"a":1}';
    h.sync.scheduleRaw();
    h.sync.scheduleRaw();
    expect(h.applied).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(249);
    expect(h.applied).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(h.applied).toHaveLength(1);
  });

  it('debounces structured edits with the 150 ms delay', async () => {
    const h = createHarness();
    h.sync.scheduleStructured();
    await vi.advanceTimersByTimeAsync(149);
    expect(h.collected).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(h.collected).toHaveLength(1);
  });

  it('cancel() drops pending timers', async () => {
    const h = createHarness();
    h.raw.value = '{"a":1}';
    h.sync.scheduleRaw();
    h.sync.dispose();
    await vi.runAllTimersAsync();
    expect(h.applied).toHaveLength(0);
  });
});

describe('structured sync root binding (:2675-2693)', () => {
  it('schedules structured sync from form fields but ignores raw/ms/JSON inputs', async () => {
    const h = createHarness();
    const root = document.createElement('div');
    root.id = 'main-content';
    document.body.appendChild(root);
    const plain = document.createElement('input');
    plain.id = 'f-user';
    const msInput = document.createElement('input');
    msInput.className = 'ms-input';
    const botJson = document.createElement('textarea');
    botJson.id = 'f-long-json';
    const rawEl = rawTextarea();
    root.append(plain, msInput, botJson, rawEl);

    const off = h.sync.bindStructuredSyncRoot('main-content');
    plain.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.collected).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(151);
    expect(h.collected).toHaveLength(1);

    msInput.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.runAllTimersAsync();
    expect(h.collected).toHaveLength(1);

    botJson.dispatchEvent(new Event('input', { bubbles: true }));
    rawEl.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.runAllTimersAsync();
    expect(h.collected).toHaveLength(1);

    // a change event on a JSON textarea is NOT ignored (legacy phase rule)
    botJson.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.runAllTimersAsync();
    expect(h.collected).toHaveLength(2);

    off();
    plain.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.runAllTimersAsync();
    expect(h.collected).toHaveLength(2);
  });
});
