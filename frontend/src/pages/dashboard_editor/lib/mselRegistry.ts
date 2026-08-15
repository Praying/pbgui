/**
 * Open-dropdown registry — the Vue replacement for the legacy document-wide
 * sweep over `.msel-drop.open` elements (dashboard_editor.html:659-669).
 *
 * Legacy: closeUsersDropdown(drop) / closeAllUsersDropdowns(exceptDrop)
 * queried the live document for every open dropdown. In Vue the dropdowns
 * portal to the body too, but the component instances own their state — a
 * tiny module registry reproduces the "only one open at a time" contract
 * without DOM crawling.
 *
 * NOTE: this MUST be a real module — `<script setup>` top-level variables
 * compile into the per-instance setup() closure and would NOT be shared.
 */

export interface MselRegistryEntry {
  close(): void;
}

let activeDropdown: MselRegistryEntry | null = null;

/** Close every other open dropdown and register `close` as the open one. */
export function openMselDropdown(close: () => void): void {
  closeAllMselDropdowns();
  activeDropdown = { close };
}

/** Unregister when this instance closes (no-op if another instance is open). */
export function closeMselDropdown(close: () => void): void {
  if (activeDropdown?.close === close) activeDropdown = null;
}

/** Legacy closeAllUsersDropdowns(): close whatever is open. */
export function closeAllMselDropdowns(): void {
  if (activeDropdown) {
    activeDropdown.close();
    activeDropdown = null;
  }
}

/** Tests only. */
export function resetMselRegistry(): void {
  activeDropdown = null;
}
