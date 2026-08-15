/**
 * livePositionsRegistry — the page-global view of "which POSITIONS cells have
 * an active live poll", replacing the legacy WS-orchestration guard
 * `_liveState['pos_' + r + '_' + c].timer` (dashboard_editor.html:2807):
 * positions_updated events skip cells whose live poll owns the refresh.
 *
 * WidgetPositions marks its cell while its useLivePositions connection holds
 * a timer; App.vue passes `isPositionsLive` into useDashboardWs (the D-editor-3
 * injection point).
 */
const active = new Set<string>();

export function setLivePositionsActive(pos: string, isActive: boolean): void {
  if (isActive) active.add(pos);
  else active.delete(pos);
}

/** Legacy `_liveState['pos_' + pos] && _liveState['pos_' + pos].timer`. */
export function isPositionsLive(pos: string): boolean {
  return active.has(pos);
}

/** Tests only: clear the registry. */
export function resetLivePositionsRegistry(): void {
  active.clear();
}
