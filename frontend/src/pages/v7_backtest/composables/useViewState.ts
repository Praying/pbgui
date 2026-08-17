import { reactive } from 'vue';
import { BACKTEST_SORT_COLUMNS, viewStateKeyFor } from '../config';
import { archiveModeFromValue, buildPersistedState, currentBacktestViewHash } from '../lib/viewState';
import type { ArchiveMode, BacktestPanel, BacktestSortTable, BacktestSorts, BacktestVersion, SortSpec } from '../types';

/**
 * Reactive backtest view state (v7_backtest.html:1331-1462): panel
 * switching + sort toggles persist BOTH the schema-frozen localStorage
 * key and the URL hash (:1420-1431). Panel lazy-loads live in App
 * (they need the data composables).
 */

export interface ViewStateOptions {
  version: BacktestVersion;
  storage?: Storage;
  history?: { replaceState(url: string): void };
  locationHref?: string;
  initial: { panel: BacktestPanel; archive?: string; archiveMode?: ArchiveMode; sorts: BacktestSorts };
}

export interface ViewStateStore {
  state: {
    panel: BacktestPanel;
    archive: string;
    archiveMode: ArchiveMode;
    sorts: BacktestSorts;
  };
  selectPanel(panel: BacktestPanel, options?: { persist?: boolean }): void;
  /** Enter an archive's results view (:1414-1416 hash form). */
  openArchive(name: string, mode?: ArchiveMode): void;
  /** setSort (:1719-1723): toggle in place, new column starts ascending. */
  setSort(table: BacktestSortTable, col: string): void;
  /** setResSort semantics (:5452-5457): write an explicit spec (results tables start DESC). */
  setSortSpec(table: BacktestSortTable, spec: SortSpec): void;
  /** Seed panel + archive selection from the boot-resolved state (:10019-10023). */
  applyViewState(state: { panel: BacktestPanel; archive?: string; archiveMode?: ArchiveMode; sorts?: BacktestSorts }): void;
  dispose(): void;
}

export function useViewState(options: ViewStateOptions): ViewStateStore {
  const storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined) ?? ({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  } as unknown as Storage);
  const history = options.history ?? {
    replaceState: (url: string) => window.history.replaceState(null, '', url),
  };
  const locationHref = () => options.locationHref ?? window.location.href;

  const key = viewStateKeyFor(options.version);
  const state = reactive({
    panel: options.initial.panel,
    archive: options.initial.archive ?? '',
    archiveMode: archiveModeFromValue(options.initial.archiveMode),
    sorts: { ...options.initial.sorts },
  });

  function persist(): void {
    try {
      storage.setItem(key, JSON.stringify(buildPersistedState(state.panel, state.archive, state.archiveMode, state.sorts)));
    } catch {
      /* legacy ignored storage failures (:1427) */
    }
    history.replaceState(locationHref().split('#')[0] + '#' + currentBacktestViewHash(state.panel, state.archive, state.archiveMode));
  }

  return {
    state,
    selectPanel(panel, selectOptions): void {
      state.panel = panel;
      if (selectOptions?.persist !== false) persist();
    },
    openArchive(name, mode): void {
      state.panel = 'archive';
      state.archive = name;
      state.archiveMode = archiveModeFromValue(mode);
      persist();
    },
    setSort(table, col): void {
      if (!(BACKTEST_SORT_COLUMNS[table] as readonly string[]).includes(col)) return;
      const current = state.sorts[table];
      state.sorts = {
        ...state.sorts,
        [table]: current.col === col ? { col, asc: !current.asc } : { col, asc: true },
      };
      persist();
    },
    setSortSpec(table, spec): void {
      if (!(BACKTEST_SORT_COLUMNS[table] as readonly string[]).includes(spec.col)) return;
      state.sorts = { ...state.sorts, [table]: { col: spec.col, asc: spec.asc } };
      persist();
    },
    applyViewState(next): void {
      state.panel = next.panel;
      state.archive = next.archive ?? '';
      state.archiveMode = archiveModeFromValue(next.archiveMode);
      if (next.sorts) state.sorts = { ...next.sorts };
    },
    dispose(): void {
      /* nothing held beyond reactive state */
    },
  };
}
