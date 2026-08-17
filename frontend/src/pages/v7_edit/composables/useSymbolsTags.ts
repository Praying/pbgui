import { ref, type Ref } from 'vue';

/**
 * Symbols/tags/coin-status loading — ports of loadSymbolsAndTags
 * (v7_edit.html:2071-2131: seed → fetch pair → sequence guard → rebuild),
 * getCoinsForLoad (:2155-2163), getTagsForLoad (:2177-2184),
 * refreshCoinStatuses (:3727-3775) and queueSymbolsAndTagsLoad (:2133-2138).
 * The multiselect DOM rebuilds become reactive option/selected refs.
 */

type FetchFn = typeof fetch;

export interface CoinTagSelections {
  readonly approvedLong: readonly string[];
  readonly approvedShort: readonly string[];
  readonly ignoredLong: readonly string[];
  readonly ignoredShort: readonly string[];
  readonly tags: readonly string[];
}

export interface LoadSelectionsOptions {
  readonly preferConfigValues?: boolean;
}

/** pb8MarketLabels from the symbols catalog (:2112-2115). */
export function applyCatalogLabels(
  catalog: { config_id?: string; display?: string; coin?: string }[] | undefined
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const entry of catalog ?? []) {
    if (entry && entry.config_id) labels[entry.config_id] = entry.display || entry.coin || entry.config_id;
  }
  return labels;
}

/** rebuildMultiselect option lists (:2089-2093) — approved lists gain 'all'. */
export function coinOptions(symbols: readonly string[], allowAll: boolean): string[] {
  return allowAll ? ['all', ...symbols.slice()] : symbols.slice();
}

/** refreshCoinStatuses fetch half (:3750-3767). */
export async function fetchCoinStatuses(
  apiBase: string,
  exchange: string,
  coins: readonly string[],
  fetchFn: FetchFn = fetch
): Promise<Record<string, { status?: string; display?: string; raw?: string; normalized?: string }>> {
  const resp = await fetchFn(apiBase + '/coins/status', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exchanges: [exchange], coins: coins.slice() }),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    statuses?: Record<string, { status?: string; display?: string; raw?: string; normalized?: string }>;
    detail?: unknown;
  };
  if (!resp.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : resp.statusText;
    throw new Error(detail || 'Failed to resolve coin statuses');
  }
  return data.statuses ?? {};
}

export interface UseSymbolsTags {
  readonly symbols: Ref<string[]>;
  readonly tags: Ref<string[]>;
  readonly marketLabels: Ref<Record<string, string>>;
  readonly options: {
    approvedLong: Ref<string[]>;
    approvedShort: Ref<string[]>;
    ignoredLong: Ref<string[]>;
    ignoredShort: Ref<string[]>;
    tags: Ref<string[]>;
  };
  readonly selected: {
    approvedLong: Ref<string[]>;
    approvedShort: Ref<string[]>;
    ignoredLong: Ref<string[]>;
    ignoredShort: Ref<string[]>;
    tags: Ref<string[]>;
  };
  /** Queue the next load; later calls win (:2133-2138 promise chaining). */
  queue(exchange: string, selections: CoinTagSelections, opts?: LoadSelectionsOptions): Promise<void>;
  load(exchange: string, selections: CoinTagSelections, opts?: LoadSelectionsOptions): Promise<void>;
  /** saveConfig awaited this before collecting (:2913). */
  whenSettled(): Promise<void>;
}

function uniqSorted(values: readonly string[]): string[] {
  return [...values].filter((v, i, a) => v && v !== 'all' && a.indexOf(v) === i).sort();
}

/** getCoinsForLoad (:2155-2163) — config values, current selection, fallback. */
function mergeSelection(configValues: readonly string[], current: readonly string[]): string[] {
  if (configValues.length) return configValues.slice();
  return current.slice();
}

export function useSymbolsTags(apiBase: string, fetchFn: FetchFn = fetch): UseSymbolsTags {
  const symbols = ref<string[]>([]);
  const tags = ref<string[]>([]);
  const marketLabels = ref<Record<string, string>>({});
  const options = {
    approvedLong: ref<string[]>([]),
    approvedShort: ref<string[]>([]),
    ignoredLong: ref<string[]>([]),
    ignoredShort: ref<string[]>([]),
    tags: ref<string[]>([]),
  };
  const selected = {
    approvedLong: ref<string[]>([]),
    approvedShort: ref<string[]>([]),
    ignoredLong: ref<string[]>([]),
    ignoredShort: ref<string[]>([]),
    tags: ref<string[]>([]),
  };
  let loadSeq = 0;
  let loadPromise: Promise<void> = Promise.resolve();

  /** Seed every multiselect from the merged selection (:2089-2093). */
  function seedRebuild(seededCoins: string[], current: CoinTagSelections, cfg: CoinTagSelections): void {
    const approvedLong = mergeSelection(cfg.approvedLong, current.approvedLong);
    const approvedShort = mergeSelection(cfg.approvedShort, current.approvedShort);
    const ignoredLong = mergeSelection(cfg.ignoredLong, current.ignoredLong);
    const ignoredShort = mergeSelection(cfg.ignoredShort, current.ignoredShort);
    const tagValues = cfg.tags.length ? cfg.tags.slice() : current.tags.slice();
    options.approvedLong.value = ['all', ...seededCoins];
    options.approvedShort.value = ['all', ...seededCoins];
    options.ignoredLong.value = seededCoins.slice();
    options.ignoredShort.value = seededCoins.slice();
    options.tags.value = tagValues.slice();
    selected.approvedLong.value = approvedLong;
    selected.approvedShort.value = approvedShort;
    selected.ignoredLong.value = ignoredLong;
    selected.ignoredShort.value = ignoredShort;
    selected.tags.value = tagValues;
  }

  async function refreshCoinStatuses(exchange: string, seq: number): Promise<void> {
    const wrapIds = [selected.approvedLong, selected.approvedShort, selected.ignoredLong, selected.ignoredShort];
    if (!exchange) return;
    const coins: string[] = [];
    for (const sel of wrapIds) {
      for (const value of sel.value) {
        if (!value || value === 'all' || coins.includes(value)) continue;
        coins.push(value);
      }
    }
    if (!coins.length) return;
    try {
      const statuses = await fetchCoinStatuses(apiBase, exchange, coins, fetchFn);
      if (seq !== loadSeq) return;
      for (const [identifier, status] of Object.entries(statuses)) {
        if (status && status.display) marketLabels.value[identifier] = status.display;
      }
    } catch {
      // legacy cleared coin meta and moved on (:3768-3774)
    }
  }

  async function load(exchange: string, selections: CoinTagSelections, opts: LoadSelectionsOptions = {}): Promise<void> {
    const requestSeq = ++loadSeq;
    const current: CoinTagSelections = {
      approvedLong: selected.approvedLong.value,
      approvedShort: selected.approvedShort.value,
      ignoredLong: selected.ignoredLong.value,
      ignoredShort: selected.ignoredShort.value,
      tags: selected.tags.value,
    };
    const cfgValues: CoinTagSelections = opts.preferConfigValues
      ? selections
      : {
          approvedLong: selections.approvedLong.length ? selections.approvedLong : current.approvedLong,
          approvedShort: selections.approvedShort.length ? selections.approvedShort : current.approvedShort,
          ignoredLong: selections.ignoredLong.length ? selections.ignoredLong : current.ignoredLong,
          ignoredShort: selections.ignoredShort.length ? selections.ignoredShort : current.ignoredShort,
          tags: selections.tags.length ? selections.tags : current.tags,
        };
    const seededCoins = uniqSorted([
      ...cfgValues.approvedLong,
      ...cfgValues.approvedShort,
      ...cfgValues.ignoredLong,
      ...cfgValues.ignoredShort,
    ]);
    seedRebuild(seededCoins, current, cfgValues);

    if (!exchange) {
      symbols.value = seededCoins.slice();
      tags.value = cfgValues.tags.slice();
      await refreshCoinStatuses('', requestSeq);
      return;
    }

    try {
      const [symbolsResp, tagsResp] = await Promise.all([
        fetchFn(`${apiBase}/symbols?exchange=${encodeURIComponent(exchange)}`, {
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
        }).then((r) => r.json() as Promise<{ symbols?: string[]; catalog?: unknown }>),
        fetchFn(`${apiBase}/tags?exchange=${encodeURIComponent(exchange)}`, {
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
        }).then((r) => r.json() as Promise<{ tags?: string[] }>),
      ]);
      if (requestSeq !== loadSeq) return; // superseded (:2109)

      symbols.value = symbolsResp.symbols ?? [];
      marketLabels.value = applyCatalogLabels(symbolsResp.catalog as { config_id?: string; display?: string; coin?: string }[]);
      tags.value = tagsResp.tags ?? [];
      options.approvedLong.value = coinOptions(symbols.value, true);
      options.approvedShort.value = coinOptions(symbols.value, true);
      options.ignoredLong.value = coinOptions(symbols.value, false);
      options.ignoredShort.value = coinOptions(symbols.value, false);
      options.tags.value = tags.value.slice();
      await refreshCoinStatuses(exchange, requestSeq);
    } catch {
      if (requestSeq !== loadSeq) return;
      // legacy kept the seeded state and cleared coin meta (:2126-2130)
      symbols.value = seededCoins.slice();
      await refreshCoinStatuses('', requestSeq);
    }
  }

  return {
    symbols,
    tags,
    marketLabels,
    options,
    selected,
    load(exchange, selections, opts) {
      return load(exchange, selections, opts);
    },
    queue(exchange, selections, opts) {
      loadPromise = load(exchange, selections, opts).catch(() => {
        // legacy logged and continued (:2134-2136)
      });
      return loadPromise;
    },
    whenSettled() {
      return loadPromise;
    },
  };
}
