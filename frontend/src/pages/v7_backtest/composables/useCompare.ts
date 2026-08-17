import { chartLayout, compareTraces } from '../lib/resultCharts';
import { parseIsoMillis } from '../lib/resultsModel';
import type { BacktestResultItem, QueueItem } from '../types';
import type { ResultsStore } from './useResults';
import type { I18nT } from '../types.i18n';

/**
 * The compare flows — compareSelected (:7778-7791) and
 * compareSelectedQueue (:7744-7776) over _resolveQueueComparePaths
 * (:7646-7742): queue entries map onto result groups per config name,
 * preferring the first result group modified at/after the queue item's
 * created stamp, falling back to the closest in time; used groups are
 * never assigned twice.
 */

interface QueueGroupCandidate {
  result_name: string;
  modifiedTs: number;
  paths: string[];
}

export interface QueueCompareMatch {
  paths: string[];
  unmatched: QueueItem[];
}

/** _resolveQueueComparePaths (:7646-7742). */
export function resolveQueueComparePaths(selectedQueueItems: readonly QueueItem[], results: readonly BacktestResultItem[]): QueueCompareMatch {
  const queueByConfig: Record<string, QueueItem[]> = {};
  for (const item of selectedQueueItems) {
    const name = item.name ?? '';
    (queueByConfig[name] ??= []).push(item);
  }

  const resultGroupsByConfig: Record<string, Record<string, QueueGroupCandidate>> = {};
  for (const result of results) {
    if (!result || !result.config_name || !result.result_name || !result.path) continue;
    const configGroups = (resultGroupsByConfig[result.config_name] ??= {});
    const group = (configGroups[result.result_name] ??= { result_name: result.result_name, modifiedTs: Number.NaN, paths: [] });
    group.paths.push(result.path);
    const modifiedTs = parseIsoMillis(result.modified);
    if (Number.isNaN(group.modifiedTs) || (!Number.isNaN(modifiedTs) && modifiedTs > group.modifiedTs)) {
      group.modifiedTs = modifiedTs;
    }
  }

  const assignedByFilename: Record<string, string[]> = {};
  const unmatched: QueueItem[] = [];

  for (const configName of Object.keys(queueByConfig)) {
    const queueGroup = queueByConfig[configName]!.slice().sort((a, b) => {
      const ta = parseIsoMillis(a.created);
      const tb = parseIsoMillis(b.created);
      if (Number.isNaN(ta) && Number.isNaN(tb)) return String(a.filename ?? '').localeCompare(String(b.filename ?? ''));
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return String(a.filename ?? '').localeCompare(String(b.filename ?? ''));
    });

    const groupedResults = Object.keys(resultGroupsByConfig[configName] ?? {})
      .map((key) => resultGroupsByConfig[configName]![key]!)
      .sort((a, b) => {
        if (Number.isNaN(a.modifiedTs) && Number.isNaN(b.modifiedTs)) return a.result_name.localeCompare(b.result_name);
        if (Number.isNaN(a.modifiedTs)) return 1;
        if (Number.isNaN(b.modifiedTs)) return -1;
        if (a.modifiedTs < b.modifiedTs) return -1;
        if (a.modifiedTs > b.modifiedTs) return 1;
        return a.result_name.localeCompare(b.result_name);
      });

    const usedGroupNames: Record<string, true> = {};
    for (const item of queueGroup) {
      const createdTs = parseIsoMillis(item.created);
      let futureIdx = -1;
      let fallbackIdx = -1;
      let fallbackDelta = Number.POSITIVE_INFINITY;

      groupedResults.forEach((group, idx) => {
        if (usedGroupNames[group.result_name]) return;
        if (futureIdx === -1 && !Number.isNaN(createdTs) && !Number.isNaN(group.modifiedTs) && group.modifiedTs >= createdTs) {
          futureIdx = idx;
        }
        if (fallbackIdx === -1) {
          fallbackIdx = idx;
        }
        if (!Number.isNaN(createdTs) && !Number.isNaN(group.modifiedTs)) {
          const delta = Math.abs(group.modifiedTs - createdTs);
          if (delta < fallbackDelta) {
            fallbackDelta = delta;
            fallbackIdx = idx;
          }
        }
      });

      const chosenIdx = futureIdx >= 0 ? futureIdx : fallbackIdx;
      if (chosenIdx < 0) {
        unmatched.push(item);
        continue;
      }
      const chosen = groupedResults[chosenIdx]!;
      usedGroupNames[chosen.result_name] = true;
      assignedByFilename[item.filename] = chosen.paths.slice().sort();
    }
  }

  const paths: string[] = [];
  const seenPaths: Record<string, true> = {};
  for (const item of selectedQueueItems) {
    for (const path of assignedByFilename[item.filename] ?? []) {
      if (seenPaths[path]) continue;
      seenPaths[path] = true;
      paths.push(path);
    }
  }

  return { paths, unmatched };
}

export interface CompareFlowOptions {
  results: ResultsStore;
  t: I18nT;
  notify(message: string, kind: 'ok' | 'err' | 'info' | 'warn'): void;
  selectPanel(): void;
  fetchFn?: typeof fetch;
}

/**
 * compareSelectedQueue (:7744-7776): gate on ≥2 selected and ≥2 complete,
 * reload results, resolve paths, clear filters, select the rows, plot and
 * warn about skipped items.
 */
export function compareSelectedQueue(options: CompareFlowOptions): (selectedFilenames: readonly string[], queueItems: readonly QueueItem[]) => Promise<void> {
  return async (selectedFilenames, queueItems) => {
    if (selectedFilenames.length < 2) {
      options.notify(options.t('v7backtest.selectAtLeast2Queue'), 'err');
      return;
    }
    const selectedItems = selectedFilenames
      .map((filename) => queueItems.find((item) => item.filename === filename) ?? null)
      .filter((item): item is QueueItem => item !== null);
    const completedItems = selectedItems.filter((item) => item.status === 'complete');
    const skippedIncomplete = selectedItems.length - completedItems.length;

    if (completedItems.length < 2) {
      options.notify(options.t('v7backtest.selectAtLeast2CompletedQueue'), 'err');
      return;
    }

    try {
      await options.results.loadResults('');
    } catch {
      return; // loadResults already toasted (:5414)
    }

    const matched = resolveQueueComparePaths(completedItems, options.results.results.value);
    if (matched.paths.length < 2) {
      options.notify(options.t('v7backtest.couldNotMatchResults'), 'err');
      return;
    }

    // _clearResultsFilters (:7601-7606) + selectPanel + row selection
    options.results.configFilter.value = '';
    options.results.textFilter.value = '';
    options.selectPanel();
    options.results.setSelected(matched.paths);

    await renderCompare(options.results, matched.paths);

    const skippedCount = skippedIncomplete + matched.unmatched.length;
    if (skippedCount > 0) {
      options.notify(options.t('v7backtest.comparedSkipped', { n: skippedCount }), 'warn');
    }
  };
}

/** compareSelected (:7778-7791) — toggle-hide, ≥2 gate, then plot. */
export function compareSelected(options: CompareFlowOptions): () => Promise<void> {
  return async () => {
    const results = options.results;
    if (results.compareOpen.value && results.compareTraces.value.length > 0) {
      results.compareOpen.value = false;
      results.compareTraces.value = [];
      return;
    }
    const selected = results.getSelected();
    if (selected.length < 2) {
      options.notify(options.t('v7backtest.selectAtLeast2Results'), 'err');
      return;
    }
    await renderCompare(results, selected);
  };
}

async function renderCompare(results: ResultsStore, paths: readonly string[]): Promise<void> {
  // _compareResultPaths (:7608-7643) — cached per version:path, failed
  // fetches degrade to empty series (the row drops out of the plot)
  const items = await Promise.all(
    paths.map((path) => {
      const result = results.results.value.find((entry) => entry.path === path) ?? {
        path,
        config_name: '',
        result_name: '',
        backtest_version: results.version,
      };
      return results.dataApi.beForCompare(path, result);
    })
  );
  const traces = compareTraces(items);
  if (traces.length === 0) {
    results.compareOpen.value = false;
    results.compareTraces.value = [];
    return;
  }
  results.compareTraces.value = traces;
  results.compareLayout.value = chartLayout('', 'Balance');
  results.compareOpen.value = true;
}
