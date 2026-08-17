/**
 * /coins/filter query — the shared request of the dynamic-ignore preview
 * (v7_edit.html:3393-3415) and the apply-filters action (:3449-3480):
 * exchange comes from the selected user, the filter values from the form.
 */
import type { EditFormState } from './formModel';
import { intVal, numVal } from './formModel';

export interface CoinsFilterPayload {
  readonly approved: string[];
  readonly ignored: string[];
  readonly unresolved?: string[];
  readonly detail?: unknown;
}

/** The query string after /coins/filter (:3402-3407 / :3459-3464). */
export function coinsFilterQuery(state: EditFormState, exchange: string, tags: readonly string[]): string {
  return (
    '?exchange=' + encodeURIComponent(exchange) +
    '&market_cap=' + intVal(state.marketCap) +
    '&vol_mcap=' + numVal(state.volMcap) +
    '&only_cpt=' + state.onlyCpt +
    '&notices_ignore=' + state.noticesIgnore +
    '&tags=' + encodeURIComponent(tags.join(','))
  );
}

export async function fetchCoinsFilter(
  apiBase: string,
  state: EditFormState,
  exchange: string,
  tags: readonly string[],
  fetchFn: typeof fetch = fetch
): Promise<CoinsFilterPayload> {
  const resp = await fetchFn(apiBase + '/coins/filter' + coinsFilterQuery(state, exchange, tags), {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = (await resp.json().catch(() => ({}))) as CoinsFilterPayload;
  if (!resp.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : resp.statusText;
    throw new Error(detail || 'Filter request failed');
  }
  return data;
}
