/**
 * useLivePositions / useLiveBalance — the per-widget live poll of the legacy
 * editor (dashboard_editor.html:1029-1159, `_connectLivePos`/`_connectLiveBal`).
 *
 * Legacy machine, preserved 1:1:
 * - 1 s interval; every tick re-applies the aging status line and tries a
 *   refresh; minimum 5 s between fetches; no overlapping fetches;
 * - refreshes are skipped while any multi-select dropdown is open
 *   (document.querySelector('.msel-drop.open')) — the global editor guard;
 * - the poll dies when the host detaches (legacy container.isConnected →
 *   Vue onScopeDispose / isConnected option);
 * - caps: ≤ 10 users, no ALL/empty selection, ≤ 10 initial rows (positions);
 * - fetch errors clear only the status COLOR (legacy _clearBadge) — the text
 *   is preserved; balance only rebuilds + updates status for live/mixed
 *   sources (legacy gate), positions always;
 * - re-connecting with the same users reuses the connection; new users
 *   restart it; invalid users drop it.
 *
 * Legacy deviations (documented):
 * - DOM side effects (`container._dpUpdate`, `.dt-status` textContent) are
 *   replaced by reactive refs + an onData callback that the widget binds.
 * - Legacy kept the 1 s interval alive forever when the container detached
 *   mid-poll; here the timer is cleared (leak fix, R4).
 * - A fetch that settles after the connection was superseded/replaced is
 *   discarded; legacy fed it into the detached container (no-op visually).
 * - Legacy stored the raw server source string; only 'live'/'mixed' branch
 *   anywhere, so other values are normalized to 'db' (observably identical).
 */
import { onScopeDispose, ref, type Ref } from 'vue';
import { liveBalanceUrl, livePositionsUrl } from '../lib/endpoints';
import { liveStatusColor, liveStatusText } from '../lib/format';
import type { LiveSource } from '../types/widgets';
import type { FetchLike } from './useDashboardFetch';

export type { LiveSource };

/** Legacy editor constants: MAX_LIVE=10, MAX_LIVE_POSITIONS=10, 1 s / 5 s. */
export const MAX_LIVE_USERS = 10;
export const MAX_LIVE_POSITIONS = 10;
export const LIVE_TICK_MS = 1000;
export const LIVE_MIN_FETCH_GAP_MS = 5000;

export interface LivePollOptions {
  /** Legacy %%API_BASE%% (origin + /api). */
  apiBase: string;
  /** Injectable fetch (tests); defaults to the global fetch. */
  fetchFn?: FetchLike;
  /** Injectable clock (tests); defaults to Date.now. */
  now?: () => number;
  /** Legacy document.querySelector('.msel-drop.open') guard. */
  isBlocked?: () => boolean;
  /** Legacy container.isConnected guard. */
  isConnected?: () => boolean;
  /**
   * Legacy container._dpUpdate / DashRender.buildBalance — positions receives
   * (rows, source); balance receives the whole payload for live/mixed only.
   */
  onData: (data: unknown, source: LiveSource) => void;
}

export interface LivePollController {
  /** Legacy _setSourceStatus text ("Live: 3s ago"). Empty until first success. */
  statusText: Ref<string>;
  /** Legacy status color rule: green only while source is live. */
  statusColor: Ref<string>;
  /**
   * Legacy _connectLivePos/_connectLiveBal(pos, users, initialRows): reuse the
   * existing connection when users are unchanged, otherwise reconnect.
   */
  connect: (pos: string, users: string[] | null | undefined, initialRows?: unknown[]) => void;
  /** Legacy _disconnectLive: clear the interval and drop the state. */
  disconnect: () => void;
  /** Run the guarded refresh immediately (what the 1 s tick invokes). */
  refresh: () => void;
}

interface LiveState {
  timer: ReturnType<typeof setInterval> | null;
  loading: boolean;
  users: string[];
  source: LiveSource;
  lastTs: number;
  lastFetch: number;
}

function normalizeSource(value: unknown): LiveSource {
  return value === 'live' || value === 'mixed' ? value : 'db';
}

interface LivePollerKind {
  buildUrl: (apiBase: string, users: string[]) => string;
  /** Legacy MAX_LIVE_POSITIONS row cap — positions only. */
  maxPositions?: number;
  /** Legacy per-kind success handling after source/lastTs are recorded. */
  onSuccess: (
    payload: Record<string, unknown>,
    state: LiveState,
    onData: LivePollOptions['onData'],
    applyStatus: () => void
  ) => void;
}

function createLivePoller(kind: LivePollerKind, options: LivePollOptions): LivePollController {
  const now = options.now ?? (() => Date.now());
  const isBlocked = options.isBlocked ?? (() => !!document.querySelector('.msel-drop.open'));
  const isConnected = options.isConnected ?? (() => true);
  const fetchFn: FetchLike = options.fetchFn ?? ((url: string) => fetch(url));

  const statusText = ref('');
  const statusColor = ref('');
  let current: LiveState | null = null;

  function applyStatus(): void {
    const state = current;
    if (!state) return;
    statusText.value = liveStatusText(state.source, state.lastTs, now());
    statusColor.value = liveStatusColor(state.source);
  }

  function disconnect(): void {
    const state = current;
    if (!state) return;
    if (state.timer !== null) clearInterval(state.timer);
    state.timer = null;
    current = null;
  }

  function refresh(): void {
    const state = current;
    if (!state) return;
    if (!isConnected()) {
      disconnect();
      return;
    }
    if (isBlocked()) return;
    if (state.loading) return;
    if (state.lastFetch !== 0 && now() - state.lastFetch < LIVE_MIN_FETCH_GAP_MS) return;
    state.lastFetch = now();
    state.loading = true;
    const url = kind.buildUrl(options.apiBase, state.users);
    fetchFn(url)
      .then((resp) => {
        if (!resp.ok) throw new Error(String(resp.status));
        return resp.json();
      })
      .then((payload) => {
        if (state !== current) return; // superseded by reconnect/disconnect
        state.loading = false;
        state.source = normalizeSource((payload as { source?: unknown }).source);
        state.lastTs = now();
        kind.onSuccess(payload as Record<string, unknown>, state, options.onData, applyStatus);
      })
      .catch(() => {
        if (state !== current) return;
        state.loading = false;
        statusColor.value = ''; // legacy _clearBadge: color only, text preserved
      });
  }

  function connect(pos: string, users: string[] | null | undefined, initialRows: unknown[] = []): void {
    /* Legacy keyed the connection `pos_R_C`/`bal_R_C` in the page-global
       _liveState map; with per-widget instances the pos only documents which
       cell this poll belongs to. */
    /* Legacy reuse check: keep the connection when users are unchanged. */
    const existing = current;
    if (existing && existing.timer !== null && existing.users.join(',') === (users ?? []).join(',')) {
      return;
    }
    disconnect();
    if (!users || users.includes('ALL') || users.length === 0 || users.length > MAX_LIVE_USERS) {
      return;
    }
    if (kind.maxPositions !== undefined && initialRows.length > kind.maxPositions) return;
    const state: LiveState = {
      timer: null,
      loading: false,
      users: users.slice(),
      source: 'db',
      lastTs: 0,
      lastFetch: 0,
    };
    current = state;
    refresh();
    /* Legacy created the interval even after the immediate refresh
       disconnected (leak); we skip it — no timer for a detached widget. */
    if (current !== state) return;
    state.timer = setInterval(() => {
      applyStatus();
      refresh();
    }, LIVE_TICK_MS);
  }

  onScopeDispose(disconnect);

  return { statusText, statusColor, connect, disconnect, refresh };
}

/** editor _connectLivePos (1084-1119): positions live poll. */
export function useLivePositions(options: LivePollOptions): LivePollController {
  return createLivePoller(
    {
      buildUrl: livePositionsUrl,
      maxPositions: MAX_LIVE_POSITIONS,
      onSuccess(payload, state, onData, applyStatus) {
        const rows = (payload.positions ?? []) as unknown[];
        onData(rows, state.source);
        applyStatus();
      },
    },
    options
  );
}

/** editor _connectLiveBal (1121-1159): balance live poll. */
export function useLiveBalance(options: LivePollOptions): LivePollController {
  return createLivePoller(
    {
      buildUrl: liveBalanceUrl,
      onSuccess(payload, state, onData, applyStatus) {
        if (state.source === 'live' || state.source === 'mixed') {
          onData(payload, state.source);
          applyStatus();
        }
      },
    },
    options
  );
}
