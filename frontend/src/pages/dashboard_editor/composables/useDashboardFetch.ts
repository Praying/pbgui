/**
 * useDashboardFetch — the shared skeleton of the 8 legacy inline widget
 * builders (dashboard_editor.html:1161-2152): per-key generation counter
 * (`_buildGen`) + fetch + staleness guard, exposed as Vue refs.
 *
 * Legacy skeleton (buildXxxInline):
 *   gen = ++_buildGen[key]; fetch(url).then(d => { if (_buildGen[key] !== gen)
 *   return; …build… }).catch(e => { if (_buildGen[key] !== gen || hasChildren)
 *   return; …show error… });
 *
 * Semantics preserved:
 * - every run bumps the SHARED per-key counter (module-level like the legacy
 *   `_buildGen` global — instances with the same key invalidate each other);
 * - a success or failure that is no longer the newest run is discarded;
 * - an error only surfaces when no successful data exists yet (the legacy
 *   `container.children.length > 0` guard keeps existing content on error);
 * - loading tracks the in-flight state of the current run.
 *
 * Display rules for consumers (legacy behavior): show the loading indicator
 * only when data is null; show the error state only when `error` is true
 * (which implies data is null).
 */
import { ref, shallowRef, type Ref } from 'vue';

/** Structural subset of fetch's Response so tests can supply plain objects. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Shared per-key generation counter (legacy `_buildGen` editor:1027). */
const buildGen = new Map<string, number>();

/** Current generation for a key (0 when never built). */
export function currentGeneration(key: string): number {
  return buildGen.get(key) ?? 0;
}

/** Bump the shared counter for a key and return the new generation. */
export function bumpGeneration(key: string): number {
  const next = (buildGen.get(key) ?? 0) + 1;
  buildGen.set(key, next);
  return next;
}

export interface DashboardFetch<T> {
  /** Latest successful payload, null until the first success. */
  data: Ref<T | null>;
  /** True while the current run is in flight. */
  loading: Ref<boolean>;
  /** True only when the newest run failed and no successful data exists. */
  error: Ref<boolean>;
  /** The generation this instance last ran with. */
  generation: Ref<number>;
  /** Bump the generation and fetch `url` (legacy builder skeleton). */
  run: (url: string) => Promise<void>;
  /** Bump the key's generation so any in-flight run for it is discarded. */
  invalidate: () => void;
}

export interface DashboardFetchOptions {
  /** Injectable fetch (tests); defaults to the global fetch. */
  fetchFn?: FetchLike;
}

export function useDashboardFetch<T>(key: string, options: DashboardFetchOptions = {}): DashboardFetch<T> {
  /* shallowRef: payloads are replaced wholesale, never deep-mutated
     (fast-path updates re-fetch); avoids the UnwrapRef<T> typing. */
  const data = shallowRef<T | null>(null);
  const loading = ref(false);
  const error = ref(false);
  const generation = ref(currentGeneration(key));
  const fetchFn: FetchLike = options.fetchFn ?? ((url: string) => fetch(url));

  async function run(url: string): Promise<void> {
    const gen = bumpGeneration(key);
    generation.value = gen;
    loading.value = true;
    try {
      const resp = await fetchFn(url);
      if (!resp.ok) throw new Error(String(resp.status));
      const payload = (await resp.json()) as T;
      if (currentGeneration(key) !== gen) return; // stale success — discard
      data.value = payload;
      error.value = false;
    } catch {
      if (currentGeneration(key) !== gen) return; // stale failure — discard
      if (data.value === null) error.value = true; // legacy children.length > 0 guard
    } finally {
      if (currentGeneration(key) === gen) loading.value = false;
    }
  }

  function invalidate(): void {
    generation.value = bumpGeneration(key);
  }

  return { data, loading, error, generation, run, invalidate };
}
