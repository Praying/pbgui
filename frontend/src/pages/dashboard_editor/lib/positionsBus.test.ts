import { describe, expect, it, vi } from 'vitest';
import {
  emitPositionSelected,
  onPositionSelected,
  rememberedPosition,
  resetPositionsBus,
} from './positionsBus';

/*
 * positionsBus — the Vue replacement for the legacy positions→orders linkage
 * (render.js:3245-3251): the window['_dashPosSelected_'+pos] late-bind memory
 * plus the document 'dash-pos-selected' CustomEvent.
 */

describe('positionsBus (render.js:3245-3251)', () => {
  it('delivers selection events to subscribers with pos + row data', () => {
    resetPositionsBus();
    const seen: Array<{ pos: string; data: unknown }> = [];
    const off = onPositionSelected((e) => seen.push(e));
    const row = { user: 'alice', symbol: 'BTCUSDT', side: 'long' };
    emitPositionSelected('1_2', row as never);
    expect(seen).toEqual([{ pos: '1_2', data: row }]);
    off();
  });

  it('stops delivery after unsubscribe', () => {
    resetPositionsBus();
    const fn = vi.fn();
    const off = onPositionSelected(fn);
    off();
    emitPositionSelected('1_2', { user: 'a' } as never);
    expect(fn).not.toHaveBeenCalled();
  });

  it('keeps the late-bind memory per cell for widgets mounted later', () => {
    resetPositionsBus();
    const row = { user: 'alice', symbol: 'BTCUSDT', side: 'long' };
    expect(rememberedPosition('2_1')).toBeNull();
    emitPositionSelected('2_1', row as never);
    expect(rememberedPosition('2_1')).toBe(row);
    expect(rememberedPosition('1_1')).toBeNull();
  });

  it('dispatches the legacy document CustomEvent alongside the bus', () => {
    resetPositionsBus();
    const handler = vi.fn();
    document.addEventListener('dash-pos-selected', handler);
    const row = { user: 'alice' };
    emitPositionSelected('1_1', row as never);
    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail).toEqual({ pos: '1_1', data: row });
    document.removeEventListener('dash-pos-selected', handler);
  });
});
