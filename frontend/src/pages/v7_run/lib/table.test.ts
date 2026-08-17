import { describe, expect, it } from 'vitest';
import {
  STATUS_FILTERS,
  STATUS_LABEL_KEYS,
  deleteHostsSummary,
  filterAndSortInstances,
  matchesSearch,
  matchesStatus,
  nextSort,
  pb8WarningHosts,
  statusClass,
  type RunInstance,
} from './table';

/* The render() pipeline (:790-891) and its helpers, exercised against the
   same shapes the legacy Node-executed pytests used. */

const rows: RunInstance[] = [
  { name: 'beta', user: 'alice', enabled_on: 'vps-a', status: 'synced', version: 3, twe: '1.5', running_on: ['vps-a'], note: '' },
  { name: 'alpha', user: 'bob', enabled_on: 'vps-b', status: 'disabled', version: 1, running_version: 1, twe: '2.0' },
  { name: 'gamma', user: 'carol', enabled_on: 'vps-c', status: 'outdated', strategy: 'ema_anchor' },
];

describe('statusClass (:697)', () => {
  it('prefixes and strips unsafe characters', () => {
    expect(statusClass('synced')).toBe('st-synced');
    expect(statusClass('activate_needed')).toBe('st-activate_needed');
    expect(statusClass(undefined)).toBe('st-disabled');
    /* :697 strips [^a-z_] only — '!' and '-' go, letters stay ('r' is safe). */
    expect(statusClass('we!rd-stuff')).toBe('st-werdstuff');
  });
});

describe('search filter (:795-803)', () => {
  it('matches name, strategy, note and enabled_on case-insensitively', () => {
    expect(matchesSearch(rows[0]!, 'BETA')).toBe(true);
    expect(matchesSearch(rows[2]!, 'ema_anchor')).toBe(true);
    expect(matchesSearch({ name: 'x', note: 'some note' }, 'NOTE')).toBe(true);
    expect(matchesSearch(rows[0]!, 'vps-A')).toBe(true);
    expect(matchesSearch(rows[0]!, 'nowhere')).toBe(false);
  });

  it('empty search matches everything', () => {
    for (const row of rows) expect(matchesSearch(row, '')).toBe(true);
  });
});

describe('status filter (:806-812)', () => {
  it("'active' means not disabled", () => {
    expect(matchesStatus(rows[0]!, 'active')).toBe(true);
    expect(matchesStatus(rows[1]!, 'active')).toBe(false);
  });

  it('other values match exactly', () => {
    expect(matchesStatus(rows[2]!, 'outdated')).toBe(true);
    expect(matchesStatus(rows[2]!, 'synced')).toBe(false);
    expect(matchesStatus(rows[0]!, 'All')).toBe(true);
  });
});

describe('filterAndSortInstances (:793-829)', () => {
  it('sorts active rows before disabled rows', () => {
    const sorted = filterAndSortInstances(rows, '', 'All', { col: 'name', asc: true });
    /* :815-818 sinks disabled rows before the column compare ever runs:
       actives by name asc (beta < gamma), alpha last regardless of its name. */
    expect(sorted.map((r) => r.name)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it('sorts by the selected column and direction with name tie-break', () => {
    /* Disabled-last still holds for non-name columns (:815-818 runs first),
       so bob (disabled alpha) sinks below carol on both directions. */
    expect(filterAndSortInstances(rows, '', 'All', { col: 'user', asc: true }).map((r) => r.user)).toEqual([
      'alice',
      'carol',
      'bob',
    ]);
    expect(filterAndSortInstances(rows, '', 'All', { col: 'user', asc: false }).map((r) => r.user)).toEqual([
      'carol',
      'alice',
      'bob',
    ]);
  });

  it('joins arrays and treats nulls as empty (:821-825)', () => {
    const withArrays: RunInstance[] = [
      { name: 'a', status: 'synced', running_on: ['vps-b', 'vps-a'] },
      { name: 'b', status: 'synced', running_on: [] },
    ];
    expect(filterAndSortInstances(withArrays, '', 'All', { col: 'running_on', asc: true }).map((r) => r.name)).toEqual([
      'b',
      'a',
    ]);
  });

  it('applies the search and status filters before sorting', () => {
    expect(filterAndSortInstances(rows, 'vps-b', 'All', { col: 'name', asc: true }).map((r) => r.name)).toEqual([
      'alpha',
    ]);
    expect(filterAndSortInstances(rows, '', 'disabled', { col: 'name', asc: true }).map((r) => r.name)).toEqual([
      'alpha',
    ]);
    expect(filterAndSortInstances(rows, 'nope', 'All', { col: 'name', asc: true })).toEqual([]);
  });
});

describe('nextSort (:759-764)', () => {
  it('flips asc on the same column and resets on a new one', () => {
    expect(nextSort({ col: 'name', asc: true }, 'name')).toEqual({ col: 'name', asc: false });
    expect(nextSort({ col: 'name', asc: false }, 'name')).toEqual({ col: 'name', asc: true });
    expect(nextSort({ col: 'name', asc: false }, 'user')).toEqual({ col: 'user', asc: true });
  });
});

describe('pb8WarningHosts (:770-788)', () => {
  it('collects unique sorted hosts from pb8_update_required_on on v8 pages', () => {
    const v8Rows: RunInstance[] = [
      { name: 'a', status: 'blocked', blocked_on: ['cluster-host'] },
      { name: 'b', status: 'synced', pb8_update_required_on: ['vps-b', 'vps-a', 'vps-a'] },
      { name: 'c', status: 'synced', pb8_update_required_on: ['  ', ''] },
    ];
    expect(pb8WarningHosts(v8Rows, true)).toEqual(['vps-a', 'vps-b']);
  });

  it('is always empty on v7 pages', () => {
    expect(pb8WarningHosts([{ name: 'a', pb8_update_required_on: ['vps-a'] }], false)).toEqual([]);
  });
});

describe('deleteHostsSummary (:982-991)', () => {
  it('summarizes ok/failed hosts and picks the with-failed variant', () => {
    expect(deleteHostsSummary({ h1: { success: true }, h2: { success: true } })).toEqual({
      key: 'v7run.vpsHostsOk',
      params: { ok: 2, total: 2, failed: 0 },
    });
    expect(deleteHostsSummary({ h1: { success: true }, h2: { success: false } })).toEqual({
      key: 'v7run.vpsHostsOkWithFail',
      params: { ok: 1, total: 2, failed: 1 },
    });
  });

  it('returns null without host info', () => {
    expect(deleteHostsSummary(undefined)).toBeNull();
    expect(deleteHostsSummary({})).toBeNull();
  });
});

describe('i18n key tables (:680-691, sidebar :524-537)', () => {
  it('covers every status class the CSS knows (:136-145)', () => {
    for (const status of ['synced', 'outdated', 'activate_needed', 'stop_needed', 'blocked', 'disabled', 'collecting', 'conflicted', 'tombstoned', 'config_error']) {
      expect(STATUS_LABEL_KEYS[status]).toBeDefined();
    }
  });

  it('keeps All first in the filter list', () => {
    expect(STATUS_FILTERS[0]!.value).toBe('All');
    expect(STATUS_FILTERS.map((f) => f.value)).toContain('active');
    expect(STATUS_FILTERS).toHaveLength(12);
  });
});
