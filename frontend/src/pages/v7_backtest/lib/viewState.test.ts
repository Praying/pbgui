import { describe, expect, it } from 'vitest';
import {
  archiveModeFromValue,
  buildPersistedState,
  currentBacktestViewHash,
  defaultSorts,
  loadStoredBacktestViewState,
  normalizeBacktestSortState,
  parseBacktestViewHash,
} from './viewState';

/*
 * Backtest persisted view state — the schema-frozen localStorage +
 * URL-hash contract (v7_backtest.html:1339-1431, risk R2). These
 * functions must keep reading values written by the legacy page and
 * vice versa: never rename keys or widen the vocabularies.
 */

describe('archiveModeFromValue (:1339-1341)', () => {
  it('accepts only the three archive modes', () => {
    expect(archiveModeFromValue('optimize')).toBe('optimize');
    expect(archiveModeFromValue('schedules')).toBe('schedules');
    expect(archiveModeFromValue('backtests')).toBe('backtests');
  });

  it('unknown values fall back to backtests', () => {
    expect(archiveModeFromValue('junk')).toBe('backtests');
    expect(archiveModeFromValue('')).toBe('backtests');
    expect(archiveModeFromValue(undefined)).toBe('backtests');
  });
});

describe('parseBacktestViewHash (:1343-1358)', () => {
  it('parses plain panel hashes', () => {
    expect(parseBacktestViewHash('#configs')).toEqual({ panel: 'configs' });
    expect(parseBacktestViewHash('#legacy')).toEqual({ panel: 'legacy' });
  });

  it('parses archive deep links with name + mode', () => {
    expect(parseBacktestViewHash('#archive:My%20Archive:optimize')).toEqual({
      panel: 'archive',
      archive: 'My Archive',
      archiveMode: 'optimize',
    });
    expect(parseBacktestViewHash('#archive:repo:schedules')).toEqual({
      panel: 'archive',
      archive: 'repo',
      archiveMode: 'schedules',
    });
  });

  it('normalizes an unknown archive mode to backtests (:1349)', () => {
    expect(parseBacktestViewHash('#archive:repo')).toEqual({
      panel: 'archive',
      archive: 'repo',
      archiveMode: 'backtests',
    });
  });

  it('rejects empty, unknown and malformed hashes', () => {
    expect(parseBacktestViewHash('')).toBeNull();
    expect(parseBacktestViewHash('#')).toBeNull();
    expect(parseBacktestViewHash('#unknown-panel')).toBeNull();
    expect(parseBacktestViewHash('#archive:')).toBeNull();
    // decodeURIComponent throws on a bare % → legacy catch → null (:1350-1352)
    expect(parseBacktestViewHash('#archive:%')).toBeNull();
  });
});

describe('normalizeBacktestSortState (:1360-1372)', () => {
  it('keeps valid column + boolean asc pairs', () => {
    const sorts = normalizeBacktestSortState({
      configs: { col: 'name', asc: true },
      results: { col: 'adg', asc: false },
      archive: { col: 'gain', asc: true },
      legacy: { col: 'modified', asc: true },
    });
    expect(sorts.configs).toEqual({ col: 'name', asc: true });
    expect(sorts.results).toEqual({ col: 'adg', asc: false });
    expect(sorts.archive).toEqual({ col: 'gain', asc: true });
    expect(sorts.legacy).toEqual({ col: 'modified', asc: true });
  });

  it('unknown columns fall back to the default column for every table', () => {
    const sorts = normalizeBacktestSortState({
      configs: { col: 'not-a-column', asc: true },
      results: { col: '<script>', asc: true },
      archive: { col: '', asc: true },
      legacy: { col: 42, asc: true },
    });
    expect(sorts.configs.col).toBe('modified');
    expect(sorts.results.col).toBe('modified');
    expect(sorts.archive.col).toBe('adg');
    expect(sorts.legacy.col).toBe('adg');
    // asc is only honored when the column was valid (:1368)
    expect(sorts.configs.asc).toBe(false);
    expect(sorts.results.asc).toBe(false);
    expect(sorts.archive.asc).toBe(false);
    expect(sorts.legacy.asc).toBe(false);
  });

  it('non-boolean asc falls back even with a valid column', () => {
    const sorts = normalizeBacktestSortState({ configs: { col: 'name', asc: 'yes' as unknown as boolean } });
    expect(sorts.configs).toEqual({ col: 'name', asc: false });
  });

  it('junk / missing input yields the full default set (:1361)', () => {
    expect(normalizeBacktestSortState(null)).toEqual(defaultSorts());
    expect(normalizeBacktestSortState('junk')).toEqual(defaultSorts());
    expect(normalizeBacktestSortState({})).toEqual(defaultSorts());
    // unknown extra tables are dropped, missing tables defaulted
    const withBogus = normalizeBacktestSortState({ configs: { col: 'name', asc: true }, bogus: { col: 'x', asc: true } });
    expect((withBogus as unknown as Record<string, unknown>).bogus).toBeUndefined();
  });
});

describe('loadStoredBacktestViewState (:1395-1411)', () => {
  it('returns the default when hash and storage are empty', () => {
    const state = loadStoredBacktestViewState('', null);
    expect(state.panel).toBe('configs');
    expect(state.sorts).toEqual(defaultSorts());
    expect(state.archive).toBeUndefined();
  });

  it('hash wins over storage, storage sorts still applied (:1402-1405)', () => {
    const stored = JSON.stringify({ panel: 'results', sorts: { configs: { col: 'name', asc: true } } });
    const state = loadStoredBacktestViewState('#queue', stored);
    expect(state.panel).toBe('queue');
    expect(state.sorts.configs).toEqual({ col: 'name', asc: true });
    expect(state.sorts.results).toEqual({ col: 'modified', asc: false });
  });

  it('archive hash restores archive + mode and normalizes sorts', () => {
    const stored = JSON.stringify({ panel: 'configs', archive: 'old', archiveMode: 'junk' });
    const state = loadStoredBacktestViewState('#archive:New%20Repo:optimize', stored);
    expect(state.panel).toBe('archive');
    expect(state.archive).toBe('New Repo');
    expect(state.archiveMode).toBe('optimize');
    expect(state.sorts.archive.col).toBe('adg');
  });

  it('falls back to the stored panel when there is no hash (:1406-1409)', () => {
    const stored = JSON.stringify({ panel: 'archive', archive: 'repo', archiveMode: 'schedules', sorts: {} });
    const state = loadStoredBacktestViewState('', stored);
    expect(state.panel).toBe('archive');
    expect(state.archive).toBe('repo');
    expect(state.archiveMode).toBe('schedules');
  });

  it('a stored panel outside the vocabulary is ignored (:1406)', () => {
    const state = loadStoredBacktestViewState('', JSON.stringify({ panel: 'bogus' }));
    expect(state.panel).toBe('configs');
  });

  it('corrupt JSON in storage degrades to the default (:1398-1400)', () => {
    const state = loadStoredBacktestViewState('', '{not json');
    expect(state.panel).toBe('configs');
  });
});

describe('currentBacktestViewHash (:1413-1418)', () => {
  it('archive panel with a selected archive encodes name + mode', () => {
    expect(currentBacktestViewHash('archive', 'My Repo', 'optimize')).toBe('archive:My%20Repo:optimize');
    expect(currentBacktestViewHash('archive', '', 'backtests')).toBe('archive');
  });

  it('other panels use the bare panel name', () => {
    expect(currentBacktestViewHash('queue', 'ignored', 'backtests')).toBe('queue');
    expect(currentBacktestViewHash('configs', '', 'backtests')).toBe('configs');
  });
});

describe('buildPersistedState (:1420-1427)', () => {
  it('writes the exact frozen shape', () => {
    const sorts = defaultSorts();
    const state = buildPersistedState('results', '', 'backtests', sorts);
    expect(state).toEqual({
      panel: 'results',
      archive: '',
      archiveMode: 'backtests',
      sorts,
    });
    expect(Object.keys(state).sort()).toEqual(['archive', 'archiveMode', 'panel', 'sorts']);
  });
});
