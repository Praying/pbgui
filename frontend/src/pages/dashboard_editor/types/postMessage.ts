/**
 * The editor iframe's postMessage contract with dashboard_main
 * (dashboard_editor.html:612-626, 2707-2742, 2453-2460, 2464-2479).
 *
 * R9: the shapes are LOCKED by the already-merged dashboard_main Vue tests
 * (frontend/src/pages/dashboard_main/App.test.ts:445-575) — the parent page
 * dispatches `pbgui_trigger_*` into the editor and consumes the `pbgui_editor_*`
 * / `pbgui_view_*` / `pbgui_resize_*` replies. This module mirrors the shared
 * EditorMessage shape in dashboard_main/types.ts — do not rename fields.
 *
 * Editor → parent:
 *   {type:'pbgui_editor_saved',    name}          doSave success (editor:2721)
 *   {type:'pbgui_editor_cancelled',original_name} doCancel (editor:2729)
 *   {type:'pbgui_view_dirty'}                     markViewDirty (editor:614)
 *   {type:'pbgui_view_saved'}                     saveViewLayout (editor:624)
 *   {type:'pbgui_resize_start'}                   resize drag begin (editor:2461)
 *   {type:'pbgui_resize_end'}                     resize drag end (editor:2476)
 * Parent → editor:
 *   {type:'pbgui_trigger_save'}                   → doSave (editor:2737)
 *   {type:'pbgui_trigger_cancel'}                 → doCancel (editor:2735)
 *   {type:'pbgui_trigger_view_save'}              → saveViewLayout (editor:2739)
 */

/** Outbound payload (editor → dashboard_main). */
export interface EditorOutboundMessage {
  type: string;
  name?: string;
  original_name?: string;
}

/** Inbound message types the shell answers (editor:2733-2742). */
export type EditorInboundType = 'pbgui_trigger_save' | 'pbgui_trigger_cancel' | 'pbgui_trigger_view_save';

/** Narrow untrusted MessageEvent.data the way the legacy listener did:
 *  object check, then a string `type` (editor:2734). */
export function inboundMessageType(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const t = (data as { type?: unknown }).type;
  return typeof t === 'string' ? t : null;
}
