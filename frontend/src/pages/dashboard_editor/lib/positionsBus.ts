/**
 * positionsBus — the POSITIONS→ORDERS selection contract of legacy
 * dashboard_render.js:3245-3251:
 *
 *   window['_dashPosSelected_' + pos] = rowData;          // late-bind memory
 *   document.dispatchEvent(new CustomEvent('dash-pos-selected', {
 *     detail: { pos, data: rowData }                       // live linkage
 *   }));
 *
 * D-editor-6 (ORDERS) consumes this instead of the document listener; the
 * legacy CustomEvent is still dispatched for byte-parity with anything else
 * listening (and for cross-checking in tests).
 */
import type { PositionRow } from '../types/widgets';

export interface PositionSelectedEvent {
  pos: string;
  data: PositionRow;
}

type Listener = (event: PositionSelectedEvent) => void;

const listeners = new Set<Listener>();
const memory = new Map<string, PositionRow>();

/** Legacy row-click dispatch (render.js:3246-3250). */
export function emitPositionSelected(pos: string, data: PositionRow): void {
  memory.set(pos, data); // window['_dashPosSelected_' + pos]
  const event: PositionSelectedEvent = { pos, data };
  for (const fn of listeners) fn(event);
  document.dispatchEvent(new CustomEvent('dash-pos-selected', { detail: event }));
}

/** Subscribe to selection events; returns the unsubscribe function. */
export function onPositionSelected(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Legacy late-bind memory read (editor:1984-1992, for ORDERS mounted after
 *  the selection happened). */
export function rememberedPosition(pos: string): PositionRow | null {
  return memory.get(pos) ?? null;
}

/** Tests only: detach every listener and clear the memory. */
export function resetPositionsBus(): void {
  listeners.clear();
  memory.clear();
}
