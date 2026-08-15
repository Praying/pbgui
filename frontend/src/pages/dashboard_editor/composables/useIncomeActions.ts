/**
 * useIncomeActions — the income table's destructive API layer, the port of
 * the legacy closure-local fetches in `_buildIncomeTable`
 * (dashboard_render.js:1281 delete_ids, 1308 delete_older, 1384-1401 apiPost,
 * 1406 loadBackups GET, 1434-1451 the inline restore POST) — minus the DOM
 * side effects (status line / confirm overlay / onReload stay in the
 * IncomeTable component).
 *
 * Legacy parity quirks locked by the tests:
 *  - apiPost NEVER inspects resp.ok — any response whose body parses as JSON
 *    takes the success path (`d.deleted || 0`);
 *  - failures surface the Error.message (the catch branch of every flow);
 *  - listBackups failures carry no message — legacy rendered the fixed
 *    dash.errorLoadingBackups label (render.js:1463-1468).
 */
import type {
  IncomeActionResult,
  IncomeBackup,
  IncomeBackupsResult,
  IncomeRestoreResult,
} from '../lib/incomeLogic';

/** Structural subset of fetch's Response (tests supply plain objects). */
export type IncomeFetch = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface IncomeActionsOptions {
  /** Legacy %%API_BASE%% (origin + /api). */
  apiBase: string;
  /** Injectable fetch (tests); defaults to the global fetch. */
  fetchFn?: IncomeFetch;
}

export interface IncomeActionsController {
  /** POST /dashboard/income/delete_ids {ids} (render.js:1281). */
  deleteIds(ids: number[]): Promise<IncomeActionResult>;
  /** POST /dashboard/income/delete_older {users, cutoff_ms} (render.js:1308). */
  deleteOlder(users: string[], cutoffMs: number): Promise<IncomeActionResult>;
  /** GET /dashboard/income/backups (render.js:1406). */
  listBackups(): Promise<IncomeBackupsResult>;
  /** POST /dashboard/income/restore {path} (render.js:1434). */
  restore(path: string): Promise<IncomeRestoreResult>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useIncomeActions(options: IncomeActionsOptions): IncomeActionsController {
  /* default mirrors legacy call shapes: `fetch(url)` without init for GETs */
  const fetchFn: IncomeFetch =
    options.fetchFn ??
    ((url, init) => (init === undefined ? fetch(url) : fetch(url, init)) as unknown as ReturnType<IncomeFetch>);

  /** Legacy apiPost (render.js:1384-1391): POST JSON, parse the body. */
  async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
    const resp = await fetchFn(options.apiBase + '/dashboard' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await resp.json()) as Record<string, unknown>;
  }

  async function deleteIds(ids: number[]): Promise<IncomeActionResult> {
    try {
      const d = await postJson('/income/delete_ids', { ids });
      return { ok: true, deleted: Number(d.deleted) || 0 };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }

  async function deleteOlder(users: string[], cutoffMs: number): Promise<IncomeActionResult> {
    try {
      const d = await postJson('/income/delete_older', { users, cutoff_ms: cutoffMs });
      return { ok: true, deleted: Number(d.deleted) || 0 };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }

  async function listBackups(): Promise<IncomeBackupsResult> {
    try {
      const resp = await fetchFn(options.apiBase + '/dashboard/income/backups');
      const d = (await resp.json()) as { backups?: unknown };
      const list = Array.isArray(d.backups) ? d.backups : [];
      return {
        ok: true,
        backups: list.map((b) => {
          const rec = b as Record<string, unknown>;
          return {
            name: String(rec.name ?? ''),
            path: String(rec.path ?? ''),
            date: String(rec.date ?? ''),
          };
        }),
      };
    } catch {
      return { ok: false }; /* legacy renders the fixed error label */
    }
  }

  async function restore(path: string): Promise<IncomeRestoreResult> {
    try {
      const d = await postJson('/income/restore', { path });
      return { ok: true, restored: !!d.ok };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }

  return { deleteIds, deleteOlder, listBackups, restore };
}
