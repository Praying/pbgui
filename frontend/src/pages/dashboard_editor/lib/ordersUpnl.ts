/**
 * ordersUpnl — the live uPnL header state machine of DashRender.buildOrders
 * (dashboard_render.js):
 *
 *  - initial display from the payload's exact exchange value (3686-3693);
 *  - `_posState` {entry, size, side} captured from data.position (3763-3768);
 *  - `_refreshUpnl(closePrice)` recomputing `diff × |size|` on every candle
 *    update (3770-3783, wired by the updateCandle wrap 3786-3792);
 *  - the updatePosition wrap tracking the state and preferring the exchange
 *    uPnL when the payload carries one (3793-3806), clearing on null (3807-3811).
 */
import { ref } from 'vue';
import { signedFmt } from './format';

/** Approximate uPnL from entry/size/side/close — null when any input is missing (render.js:3770-3779). */
export function computeUpnl(
  entry: number,
  size: number,
  side: string,
  close: number
): number | null {
  if (!entry || !size || !close) return null;
  const diff = side === 'short' ? entry - close : close - entry;
  return diff * Math.abs(size);
}

export interface UpnlPosition {
  entry?: number;
  size?: number;
  side?: string;
  upnl?: number;
}

export interface UpnlTracker {
  /** The formatted value ('+12.50'), '' when hidden. */
  text: ReturnType<typeof ref<string>>;
  /** Legacy class: 'dt-pos' / 'dt-neg'. */
  cls: ReturnType<typeof ref<string>>;
  /** Seed from the fetched payload's position (render.js:3686-3693, 3763-3768). */
  initFromPosition(pos: UpnlPosition | null | undefined): void;
  /** The updateCandle wrap (render.js:3786-3792). */
  onCandleUpdate(close: number): void;
  /** The updatePosition wrap (render.js:3793-3812). */
  onPositionUpdate(pos: UpnlPosition | null): void;
}

export function useUpnlTracker(): UpnlTracker {
  const text = ref('');
  const cls = ref('');
  let posEntry = 0;
  let posSize = 0;
  let posSide = 'long';

  function display(upnl: number): void {
    /* both spans set by the same rule (render.js:3691-3692, 3781-3782) */
    cls.value = upnl >= 0 ? 'dt-pos' : 'dt-neg';
    text.value = signedFmt(upnl);
  }

  /** Legacy _refreshUpnl (render.js:3770-3783). */
  function refresh(closePrice: number): void {
    const upnl = computeUpnl(posEntry, posSize, posSide, closePrice);
    if (upnl === null) {
      text.value = '';
      return;
    }
    display(upnl);
  }

  /** Legacy _posState init (render.js:3763-3768): a fresh build resets the
   *  state; the display only shows when the payload carries an upnl. */
  function initFromPosition(pos: UpnlPosition | null | undefined): void {
    posEntry = pos?.entry || 0;
    posSize = pos?.size || 0;
    posSide = pos?.side || 'long';
    if (pos && pos.upnl !== undefined) display(pos.upnl);
    else text.value = '';
  }

  function onCandleUpdate(close: number): void {
    refresh(close);
  }

  function onPositionUpdate(pos: UpnlPosition | null): void {
    if (pos && pos.entry) {
      posEntry = pos.entry;
      posSize = pos.size || 0;
      posSide = pos.side || 'long';
      if (pos.upnl !== undefined) display(pos.upnl);
    } else {
      posEntry = 0;
      posSize = 0;
      text.value = '';
    }
  }

  return { text, cls, initFromPosition, onCandleUpdate, onPositionUpdate };
}
