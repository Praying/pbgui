/**
 * useDashboardWs — the editor's live-update WebSocket orchestration
 * (dashboard_editor.html:2749-2826):
 *
 *  - connects to /ws/dashboard derived from the legacy API_BASE rewrite
 *    (strip /api, http:→ws:, https:→wss:);
 *  - reconnects with exponential back-off 1 s → 30 s, reset on open;
 *  - dispatches server events through the legacy type table:
 *      income_updated    → INCOME, TOP, PNL, ADG, P+L
 *      balance_updated   → BALANCE
 *      positions_updated → POSITIONS
 *  - merges pending types and debounces the rebuild by 300 ms;
 *  - skips the rebuild while any multi-select dropdown is open
 *    (mselRegistry.isMselOpen — the legacy `.msel-drop.open` query);
 *  - defers the rebuild of a cell whose form control is focused
 *    (v1.98.32 deferDashboardCellRefreshWhileInteracting): the pending
 *    types collect on the control and one blur flushes a single rebuild,
 *    so period dropdowns no longer close mid-selection;
 *  - skips POSITIONS cells whose live poll is active (legacy
 *    `_liveState['pos_' + r + '_' + c].timer`; D-editor-5 supplies the check).
 *
 * The rebuild itself is `store.rebuildCell(r, c)` — an epoch bump that makes
 * GridCell remount the cell's widget (the reactive replacement for the
 * legacy build*Inline DOM re-render). D-editor-4..7 widgets fetch their data
 * on mount, so a remount reproduces the legacy refetch.
 *
 * Deviations (documented): disconnect() clears timers and nulls the socket
 * handlers (the legacy IIFE never cleaned up — R4-style leak fix); parse
 * failures are swallowed exactly like the legacy try/catch.
 */
import { onScopeDispose } from 'vue';
import { isMselOpen } from '../lib/mselRegistry';
import type { RenderableWidgetType } from '../lib/grid';
import { wsDashboardUrl } from '../config';

/* editor:2757, 2819-2820, 2810 — verbatim constants */
export const WS_RECONNECT_INITIAL_MS = 1000;
export const WS_RECONNECT_MAX_MS = 30000;
export const WS_REBUILD_DEBOUNCE_MS = 300;

/** Controls whose focus defers an in-cell rebuild (v1.98.32, editor:2745). */
const INTERACTIVE_TAGS = new Set(['SELECT', 'INPUT', 'TEXTAREA', 'BUTTON']);

/** The legacy dispatch table (editor:2797-2803). */
export function wsTypesForMessage(msg: unknown): RenderableWidgetType[] | null {
  const type = typeof msg === 'object' && msg !== null ? (msg as { type?: unknown }).type : undefined;
  if (type === 'income_updated') return ['INCOME', 'TOP', 'PNL', 'ADG', 'P+L'];
  if (type === 'balance_updated') return ['BALANCE'];
  if (type === 'positions_updated') return ['POSITIONS'];
  return null;
}

/** The subset of WebSocket the composable touches (tests fake this). */
export interface WebSocketLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(): void;
}

/** The grid view the rebuild loop needs (dashboardStore satisfies this). */
export interface WsCellStore {
  readonly rows: number;
  readonly cols: number;
  cellType(row: number, col: number): string;
  rebuildCell(row: number, col: number): void;
}

export interface DashboardWsOptions {
  /** Legacy %%API_BASE%% — derives the ws:// base. */
  apiBase: string;
  /** Grid/cell access + the epoch-bump rebuild. */
  store: WsCellStore;
  /** Injectable WebSocket constructor (tests); defaults to global WebSocket. */
  wsFactory?: (url: string) => WebSocketLike;
  /** Legacy '.msel-drop.open' guard; defaults to mselRegistry.isMselOpen. */
  isBlocked?: () => boolean;
  /** Legacy _liveState pos_R_C.timer check; defaults to false (D-5 wires it). */
  isPositionsLive?: (pos: string) => boolean;
}

export interface DashboardWsController {
  /** Legacy _connectWs() — clear the timer and (re)connect now. */
  connect(): void;
  /** Close the socket and clear every timer (Vue lifecycle cleanup). */
  disconnect(): void;
  /** Legacy _rebuildCellsOfTypes(types) — guarded, exposed for tests/D-5. */
  rebuildCellsOfTypes(types: readonly RenderableWidgetType[]): void;
}

export function useDashboardWs(options: DashboardWsOptions): DashboardWsController {
  const wsFactory =
    options.wsFactory ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
  const isBlocked = options.isBlocked ?? (() => isMselOpen());
  const isPositionsLive = options.isPositionsLive ?? (() => false);
  const { store } = options;

  let ws: WebSocketLike | null = null;
  let reconnDelay = WS_RECONNECT_INITIAL_MS;
  let reconnTimer: ReturnType<typeof setTimeout> | null = null;
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTypes: RenderableWidgetType[] = [];

  /* ── rebuild dispatch (editor:2760-2784) ── */

  function rebuildCellsOfTypes(types: readonly RenderableWidgetType[]): void {
    if (isBlocked()) return;
    for (let r = 1; r <= store.rows; r++) {
      for (let c = 1; c <= store.cols; c++) {
        const type = store.cellType(r, c);
        if (!(types as readonly string[]).includes(type)) continue;
        if (type === 'POSITIONS' && isPositionsLive(r + '_' + c)) continue;
        if (deferRebuildWhileInteracting(r, c, type)) continue;
        store.rebuildCell(r, c);
      }
    }
  }

  /* ── defer-while-interacting (v1.98.32, editor
     deferDashboardCellRefreshWhileInteracting) — a focused form control
     inside an affected cell must not be remounted out from under the user
     (Income & co. period dropdowns kept closing mid-selection). The
     pending types collect on the control; one blur listener flushes a
     single deferred rebuild after the interaction ends. ── */

  const deferredTypes = new WeakMap<HTMLElement, Set<string>>();
  const armedControls = new WeakSet<HTMLElement>();

  function deferRebuildWhileInteracting(row: number, col: number, type: string): boolean {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    if (!INTERACTIVE_TAGS.has(active.tagName)) return false;
    const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (!(cell instanceof HTMLElement) || !cell.contains(active)) return false;
    let pending = deferredTypes.get(active);
    if (!pending) {
      pending = new Set<string>();
      deferredTypes.set(active, pending);
    }
    pending.add(type);
    if (!armedControls.has(active)) {
      armedControls.add(active);
      active.addEventListener(
        'blur',
        () => {
          const flushed = [...(deferredTypes.get(active) ?? [])] as RenderableWidgetType[];
          deferredTypes.delete(active);
          armedControls.delete(active);
          setTimeout(() => {
            if (flushed.length) rebuildCellsOfTypes(flushed);
          }, 0);
        },
        { once: true }
      );
    }
    return true;
  }

  /* ── debounced pending merge (editor:2804-2814) ── */

  function scheduleRebuild(types: readonly RenderableWidgetType[]): void {
    for (const t of types) {
      if (!pendingTypes.includes(t)) pendingTypes.push(t);
    }
    if (rebuildTimer !== null) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      const toRebuild = pendingTypes.slice();
      pendingTypes = [];
      rebuildCellsOfTypes(toRebuild);
    }, WS_REBUILD_DEBOUNCE_MS);
  }

  /* ── connection (editor:2786-2823) ── */

  function connect(): void {
    if (reconnTimer !== null) {
      clearTimeout(reconnTimer);
      reconnTimer = null;
    }
    ws = wsFactory(wsDashboardUrl(options.apiBase));
    ws.onopen = () => {
      reconnDelay = WS_RECONNECT_INITIAL_MS;
    };
    ws.onmessage = (evt) => {
      try {
        const m: unknown = JSON.parse(String(evt.data));
        const types = wsTypesForMessage(m);
        if (types) scheduleRebuild(types);
      } catch {
        /* legacy swallows parse errors */
      }
    };
    ws.onclose = () => {
      reconnTimer = setTimeout(() => {
        connect();
      }, reconnDelay);
      reconnDelay = Math.min(reconnDelay * 2, WS_RECONNECT_MAX_MS);
    };
    ws.onerror = () => {
      ws?.close();
    };
  }

  function disconnect(): void {
    if (reconnTimer !== null) {
      clearTimeout(reconnTimer);
      reconnTimer = null;
    }
    if (rebuildTimer !== null) {
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
    pendingTypes = [];
    const current = ws;
    ws = null;
    if (current) {
      /* detach handlers first: a close after dispose must not reconnect */
      current.onopen = null;
      current.onmessage = null;
      current.onclose = null;
      current.onerror = null;
      current.close();
    }
  }

  connect(); // legacy IIFE connects at page load
  onScopeDispose(disconnect);

  return { connect, disconnect, rebuildCellsOfTypes };
}
