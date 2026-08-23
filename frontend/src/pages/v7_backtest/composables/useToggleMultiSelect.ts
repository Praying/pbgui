/**
 * useToggleMultiSelect — single-click toggling for native multi-selects
 * (legacy v7_backtest.html enableToggleMultiSelect, v1.98.31):
 *
 *  - a plain <select multiple> clears every other choice unless the user
 *    holds Ctrl/Cmd; the legacy page intercepts mousedown on an OPTION so
 *    one click toggles exactly that exchange and keeps the rest;
 *  - the toggle flips option.selected, restores the scroll position the
 *    browser would have reset through focus(), and re-dispatches a
 *    bubbling change event so Vue's v-model picks the new selection up;
 *  - wired through a template @mousedown handler (no element lifecycle
 *    hook needed — v-if remounts stay covered and the handler is
 *    stateless, so no ready-flag is required).
 */

/** mousedown handler for a multi-select: bind as @mousedown on the <select>. */
export function onToggleMultiSelectMousedown(event: MouseEvent): void {
  if (event.button !== 0 || !(event.target instanceof HTMLOptionElement)) return;
  event.preventDefault();
  const select = event.currentTarget;
  if (!(select instanceof HTMLSelectElement)) return;
  const scrollTop = select.scrollTop;
  event.target.selected = !event.target.selected;
  try {
    select.focus({ preventScroll: true });
  } catch {
    select.focus();
  }
  select.scrollTop = scrollTop;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
