import { describe, expect, it } from 'vitest';
import { isPositionsLive, resetLivePositionsRegistry, setLivePositionsActive } from './livePositionsRegistry';

/*
 * livePositionsRegistry — the Vue replacement for the WS-orchestration guard
 * `_liveState['pos_' + r + '_' + c].timer` (dashboard_editor.html:2807).
 */

describe('livePositionsRegistry (editor:2807)', () => {
  it('reports only cells with an active live poll', () => {
    resetLivePositionsRegistry();
    expect(isPositionsLive('1_2')).toBe(false);
    setLivePositionsActive('1_2', true);
    expect(isPositionsLive('1_2')).toBe(true);
    expect(isPositionsLive('2_1')).toBe(false);
    setLivePositionsActive('1_2', false);
    expect(isPositionsLive('1_2')).toBe(false);
  });

  it('clears everything on reset', () => {
    resetLivePositionsRegistry();
    setLivePositionsActive('1_1', true);
    resetLivePositionsRegistry();
    expect(isPositionsLive('1_1')).toBe(false);
  });
});
