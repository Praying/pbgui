import { nextTick } from 'vue';
import type { JsonValidationError, JsonValidationResult } from '@/shared/jsonValidation';

/**
 * The bidirectional raw↔structured JSON sync — port of
 * editor_shared.js createJsonSyncController (:2453-2594) with the page glue
 * of v7_edit.html:2619-2693. The legacy controller read/wrote the textarea
 * DOM directly; this port reads state (v-model) and writes both state and
 * the DOM element (id-resolved like the legacy code, so jsdom can test the
 * focus/scroll guards). Debounce delays match the legacy 250/150 ms.
 */

export interface UseJsonSyncOptions {
  /** Textarea id ('cfg-raw-json') — the focus + scroll guard anchor. */
  readonly rawId: string;
  readonly getRaw: () => string;
  readonly setRaw: (value: string) => void;
  readonly validateRaw: (raw: string) => JsonValidationResult;
  /** setRawJsonValidationError equivalent. */
  readonly onError: (error: JsonValidationError | null) => void;
  /** syncEditorFromParsed (:2627-2633). */
  readonly applyParsed: (parsed: Record<string, unknown>) => Promise<void> | void;
  readonly collectConfig: () => Record<string, unknown>;
  readonly rawDelay?: number;
  readonly structuredDelay?: number;
}

export interface UseJsonSync {
  scheduleRaw(): void;
  scheduleStructured(): void;
  applyRaw(): Promise<void>;
  applyStructured(): Promise<Record<string, unknown> | undefined>;
  /** bindStructuredEditorSync (:2687-2693) — returns the unbind fn. */
  bindStructuredSyncRoot(rootId: string): () => void;
  dispose(): void;
}

export function useJsonSync(options: UseJsonSyncOptions): UseJsonSync {
  const rawEl = rawElement;
  let rawLastApplied = '';
  let rawSyncing = false;
  let structuredSyncing = false;
  let rawTimer: ReturnType<typeof setTimeout> | null = null;
  let structuredTimer: ReturnType<typeof setTimeout> | null = null;

  async function applyRaw(): Promise<void> {
    if (rawSyncing) return;
    const raw = options.getRaw();
    const validation = options.validateRaw(raw);
    options.onError(validation.error);
    if (validation.error || raw === rawLastApplied) return;
    if (!validation.parsed) return;
    rawSyncing = true;
    try {
      await options.applyParsed(validation.parsed as Record<string, unknown>);
      rawLastApplied = raw;
      options.onError(null);
    } finally {
      rawSyncing = false;
    }
  }

  function rawElement(): HTMLTextAreaElement | null {
    if (typeof document === 'undefined') return null; // torn-down test env
    return document.getElementById(options.rawId) as HTMLTextAreaElement | null;
  }

  async function applyStructured(): Promise<Record<string, unknown> | undefined> {
    if (rawSyncing || structuredSyncing) return undefined;
    const el = rawEl();
    if (el && document.activeElement === el) return undefined;

    const currentRaw = options.getRaw();
    if (currentRaw.trim()) {
      const structuredValidation = options.validateRaw(currentRaw);
      if (structuredValidation.error) {
        options.onError(structuredValidation.error);
        return undefined;
      }
    }

    structuredSyncing = true;
    try {
      const nextCfg = options.collectConfig();
      const nextRaw = JSON.stringify(nextCfg, null, 2);
      if (currentRaw === nextRaw) {
        rawLastApplied = nextRaw;
        return nextCfg;
      }
      const rawScrollTop = el ? el.scrollTop : 0;
      options.setRaw(nextRaw);
      await nextTick();
      const target = rawEl();
      if (target) target.scrollTop = Math.min(rawScrollTop, target.scrollHeight);
      rawLastApplied = nextRaw;
      options.onError(null);
      return nextCfg;
    } finally {
      structuredSyncing = false;
    }
  }

/** Legacy logged sync failures instead of leaking them (:2550-2556/:2577-2581). */
  function onErrorSafe(error: unknown): void {
    if (typeof console !== 'undefined') console.error('JSON sync failed:', error);
  }

  function scheduleRaw(): void {
    if (rawSyncing) return;
    if (rawTimer !== null) clearTimeout(rawTimer);
    rawTimer = setTimeout(() => {
      rawTimer = null;
      void applyRaw().catch((error: unknown) => onErrorSafe(error));
    }, options.rawDelay ?? 250);
  }

  function scheduleStructured(): void {
    if (rawSyncing || structuredSyncing) return;
    if (structuredTimer !== null) clearTimeout(structuredTimer);
    structuredTimer = setTimeout(() => {
      structuredTimer = null;
      try {
        void applyStructured().catch((error: unknown) => onErrorSafe(error));
      } catch (error) {
        onErrorSafe(error); // legacy console.error'd and moved on (:2578-2581)
      }
    }, options.structuredDelay ?? 150);
  }

  /**
   * shouldIgnoreStructuredSyncTarget (:2675-2685): raw textarea, ms inputs
   * and JSON textareas are ignored during the input phase so typing is never
   * interrupted; change events always sync.
   */
  function shouldIgnoreTarget(target: EventTarget | null, phase: 'input' | 'change'): boolean {
    if (!target) return true;
    const el = target as HTMLElement;
    if (el.id === options.rawId) return true;
    if (el.classList && el.classList.contains('ms-input')) return true;
    if (phase === 'input' && el.tagName === 'TEXTAREA') {
      if (el.id === 'f-long-json' || el.id === 'f-short-json') return true;
      if (el.id === 'cov-cfg-long' || el.id === 'cov-cfg-short') return true;
      if (el.dataset && el.dataset.extraLiveType === 'json') return true;
    }
    return false;
  }

  function bindStructuredSyncRoot(rootId: string): () => void {
    const root = document.getElementById(rootId);
    if (!root) return () => undefined;
    const onInput = (event: Event): void => {
      if (shouldIgnoreTarget(event.target, 'input')) return;
      scheduleStructured();
    };
    const onChange = (event: Event): void => {
      if (shouldIgnoreTarget(event.target, 'change')) return;
      scheduleStructured();
    };
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    return () => {
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
    };
  }

  function dispose(): void {
    if (rawTimer !== null) clearTimeout(rawTimer);
    if (structuredTimer !== null) clearTimeout(structuredTimer);
    rawTimer = null;
    structuredTimer = null;
  }

  return {
    scheduleRaw,
    scheduleStructured,
    applyRaw,
    applyStructured,
    bindStructuredSyncRoot,
    dispose,
  };
}
