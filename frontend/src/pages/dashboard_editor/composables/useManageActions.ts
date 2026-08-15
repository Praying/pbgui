/**
 * useManageActions — the POST /dashboard/positions/manage flow of legacy
 * requestManageAction (dashboard_render.js:2453-2508), minus its DOM side
 * effects (status line / preview modal / onReload stay in the modal):
 *
 *  - single flight per widget: manageState.actionInFlight — a second call
 *    while one is pending is rejected with dash.anotherActionRunning and
 *    fires no fetch;
 *  - non-ok responses surface `detail` (the FastAPI error contract), else
 *    statusText, exactly like the legacy resp.json() → throw chain;
 *  - network failures map to dash.actionFailed (legacy catch-all);
 *  - success returns the raw payload — dry_run detection, message mapping
 *    and the 600 ms onReload are the modal's job (lib/manageLogic.ts).
 */
import { ref, type Ref } from 'vue';
import { dashT, dashServerMsg } from '../lib/i18n';
import type { ManageBody } from '../lib/manageLogic';

/** Structural subset of fetch's Response (tests supply plain objects). */
export type ManageFetch = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; statusText?: string; json: () => Promise<unknown> }>;

export type ManageActionOutcome =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; errorMessage: string };

export interface ManageActionsOptions {
  /** Legacy %%API_BASE%% (origin + /api). */
  apiBase: string;
  /** Injectable fetch (tests); defaults to the global fetch. */
  fetchFn?: ManageFetch;
}

export interface ManageActionsController {
  /** True while a manage action is pending (legacy manageState.actionInFlight). */
  actionInFlight: Ref<boolean>;
  /** Run one action (legacy requestManageAction). */
  runAction(body: ManageBody): Promise<ManageActionOutcome>;
}

export function useManageActions(options: ManageActionsOptions): ManageActionsController {
  const fetchFn: ManageFetch =
    options.fetchFn ?? ((url, init) => fetch(url, init) as unknown as ReturnType<ManageFetch>);
  const actionInFlight = ref(false);

  async function runAction(body: ManageBody): Promise<ManageActionOutcome> {
    if (actionInFlight.value) {
      return {
        ok: false,
        errorMessage: dashT('dash.anotherActionRunning', 'Another manage action is still running.'),
      };
    }
    actionInFlight.value = true;
    try {
      const resp = await fetchFn(options.apiBase + '/dashboard/positions/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await resp.json()) as Record<string, unknown>;
      if (!resp.ok) {
        throw new Error(
          typeof data?.detail === 'string' && data.detail ? data.detail : String(resp.statusText ?? '')
        );
      }
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errorMessage: dashServerMsg(message) || dashT('dash.actionFailed', 'Action failed.') };
    } finally {
      actionInFlight.value = false;
    }
  }

  return { actionInFlight, runAction };
}
