/*
 * Pure table helpers for the PBv7/PBv8 Run list — the ports of the legacy
 * inline functions (v7_run.html): the search/status filters and the sort
 * comparator from render() :793-829, the status classes/labels from
 * buildCells() :696-726, the PB8 warning host aggregation from
 * renderPb8UpdateWarning() :770-788, and the delete host summary from
 * executeDelete() :982-991.
 */

/** One REST/WS instance row (GET /instances, WS {"type":"instances"}). */
export interface RunInstance {
  name: string;
  user?: string | null;
  strategy?: string | null;
  enabled_on?: string | null;
  status?: string | null;
  version?: number | null;
  running_version?: number | null;
  twe?: string | number | null;
  running_on?: string[];
  blocked_on?: string[];
  desired_state?: string | null;
  note?: string | null;
  blocked_reason?: string | null;
  exchange?: string | null;
  pb8_update_required_on?: string[];
}

/** The status filter select values (sidebar :524-537). */
export const STATUS_FILTERS = [
  { value: 'All', key: 'common.all' },
  { value: 'active', key: 'v7run.statusFilterActive' },
  { value: 'synced', key: 'v7run.statusFilterSynced' },
  { value: 'outdated', key: 'v7run.statusFilterOutdated' },
  { value: 'activate_needed', key: 'v7run.statusFilterNeedsSync' },
  { value: 'stop_needed', key: 'v7run.statusFilterStopNeeded' },
  { value: 'blocked', key: 'v7run.statusFilterBlocked' },
  { value: 'conflicted', key: 'v7run.statusFilterConflicted' },
  { value: 'tombstoned', key: 'v7run.statusFilterTombstoned' },
  { value: 'config_error', key: 'v7run.statusFilterConfigError' },
  { value: 'disabled', key: 'common.disabled' },
  { value: 'collecting', key: 'v7run.statusFilterCollecting' },
] as const;

/** STATUS_LABELS (:680-691) — status → i18n key. */
export const STATUS_LABEL_KEYS: Record<string, string> = {
  synced: 'v7run.statusSynced',
  outdated: 'v7run.statusOutdated',
  activate_needed: 'v7run.statusActivateNeeded',
  stop_needed: 'v7run.statusStopNeeded',
  blocked: 'v7run.statusBlocked',
  disabled: 'v7run.statusDisabled',
  collecting: 'v7run.statusCollecting',
  conflicted: 'v7run.statusConflicted',
  tombstoned: 'v7run.statusTombstoned',
  config_error: 'v7run.statusConfigError',
};

/** Legacy sort state (sort = { col, asc }, :578). */
export interface SortState {
  col: string;
  asc: boolean;
}

/** 'st-' + status with non [a-z_] stripped (:697). */
export function statusClass(status: unknown): string {
  return 'st-' + String(status || 'disabled').replace(/[^a-z_]/g, '');
}

/** Search filter (:795-803): name, strategy, note, enabled_on substring. */
export function matchesSearch(row: RunInstance, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return (
    row.name.toLowerCase().includes(q) ||
    (row.strategy || '').toLowerCase().includes(q) ||
    (row.note || '').toLowerCase().includes(q) ||
    (row.enabled_on || '').toLowerCase().includes(q)
  );
}

/** Status filter (:806-812): 'active' = not disabled, else exact match. */
export function matchesStatus(row: RunInstance, filter: string): boolean {
  if (filter === 'All') return true;
  if (filter === 'active') return row.status !== 'disabled';
  return row.status === filter;
}

/**
 * The render() pipeline (:793-829): search filter, status filter, then the
 * comparator — disabled rows last, column value (arrays joined, nulls empty,
 * strings lowercased), name as tie-break.
 */
export function filterAndSortInstances(
  rows: readonly RunInstance[],
  search: string,
  statusFilter: string,
  sort: SortState
): RunInstance[] {
  const filtered = rows.filter((r) => matchesSearch(r, search) && matchesStatus(r, statusFilter));
  return filtered.slice().sort((a, b) => {
    const actA = a.status === 'disabled' ? 1 : 0;
    const actB = b.status === 'disabled' ? 1 : 0;
    if (actA !== actB) return actA - actB;

    /* Column values are string/number/string[] (the table never shows
       anything else), so after the array/null normalization below the
       comparison is string|number — same coercion ladder as :820-826. */
    let va = a[sort.col as keyof RunInstance] as string | number;
    let vb = b[sort.col as keyof RunInstance] as string | number;
    if (Array.isArray(va)) va = va.join(',');
    if (Array.isArray(vb)) vb = vb.join(',');
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (typeof va === 'string') {
      va = va.toLowerCase();
      vb = ('' + vb).toLowerCase();
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    if (cmp !== 0) return sort.asc ? cmp : -cmp;
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
  });
}

/**
 * renderPb8UpdateWarning (:770-788): unique sorted hosts from
 * pb8_update_required_on — v8 pages only, so callers gate on isV8.
 */
export function pb8WarningHosts(rows: readonly RunInstance[], isV8: boolean): string[] {
  const hosts: string[] = [];
  if (!isV8) return hosts;
  for (const row of rows) {
    for (const raw of row.pb8_update_required_on || []) {
      const host = String(raw || '').trim();
      if (host && !hosts.includes(host)) hosts.push(host);
    }
  }
  hosts.sort();
  return hosts;
}

/** Hosts shape of the DELETE /instances/{name} response (:980-991). */
export type DeleteHosts = Record<string, { success?: boolean }>;

/**
 * The delete toast suffix (:982-991): ' (VPS: ok/total hosts OK)' or the
 * with-failed variant; '' when the response carries no host info.
 */
export function deleteHostsSummary(hosts: DeleteHosts | undefined): { key: string; params: Record<string, number> } | null {
  if (!hosts) return null;
  let ok = 0;
  let fail = 0;
  for (const h of Object.keys(hosts)) {
    if (hosts[h]!.success) ok++;
    else fail++;
  }
  if (ok === 0 && fail === 0) return null;
  return {
    key: fail > 0 ? 'v7run.vpsHostsOkWithFail' : 'v7run.vpsHostsOk',
    params: { ok, total: ok + fail, failed: fail },
  };
}

/**
 * Header toggle (:759-764): same column flips asc, a new column starts asc.
 */
export function nextSort(current: SortState, col: string): SortState {
  if (current.col === col) return { col, asc: !current.asc };
  return { col, asc: true };
}
