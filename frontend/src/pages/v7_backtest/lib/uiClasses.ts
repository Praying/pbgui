/**
 * Shared Tailwind class sets for the page's modal chrome — the former
 * #modal-root / .modal-box rules of backtest-shell.css (deleted at the
 * Tailwind migration). Centralized here so the 20+ modal call sites stay
 * in sync.
 *
 * The modal BUTTONS migrated to the shared ui/ Button (the former
 * .modal-btn / .modal-btn-primary / .modal-btn-danger tones are the
 * default/primary/danger variants); the `modal-btn` class name survives
 * on those Buttons as an inert anchor — the test suite selects
 * `.modal-btn` buttons.
 */

/** The former #modal-root overlay (fixed flex layer over the backdrop). */
export const modalBackdropClass = 'fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop';

/** The former .modal-box dialog frame (no shadow — the legacy rule had
 * none; only the boxes that also carried the shared .pbgui-modal class
 * got one, so those call sites append `shadow-modal`). */
export const modalBoxClass =
  'flex min-w-[160px] max-w-[760px] max-h-[85vh] flex-col resize overflow-hidden rounded-lg border border-border-default bg-panel p-5';
