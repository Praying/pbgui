/**
 * Shared Tailwind class sets for the page's modal chrome — the former
 * #modal-root / .modal-box / .modal-btn rules of backtest-shell.css
 * (deleted at the Tailwind migration). Centralized here so the 20+ modal
 * call sites stay in sync.
 *
 * modalBtnClass returns the COMPLETE colour set per variant: the legacy
 * .modal-btn-primary / .modal-btn-danger overrides replaced the base
 * tone wholesale, so a variant must never be combined with the default
 * tone on the same element (Tailwind emits same-property utilities in
 * its own fixed order). The legacy `modal-btn` class name rides along as
 * an inert anchor — the test suite selects `.modal-btn` buttons.
 */

/** The former #modal-root overlay (fixed flex layer over the backdrop). */
export const modalBackdropClass = 'fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop';

/** The former .modal-box dialog frame (no shadow — the legacy rule had
 * none; only the boxes that also carried the shared .pbgui-modal class
 * got one, so those call sites append `shadow-modal`). */
export const modalBoxClass =
  'flex min-w-[160px] max-w-[760px] max-h-[85vh] flex-col resize overflow-hidden rounded-lg border border-border-default bg-panel p-5';

export type ModalBtnVariant = 'default' | 'primary' | 'danger';

/** The former .modal-btn / .modal-btn-primary / .modal-btn-danger rules. */
export function modalBtnClass(variant: ModalBtnVariant = 'default'): string {
  const tone =
    variant === 'primary'
      ? 'border-accent bg-accent text-[#f2f5fb] hover:bg-accent-deep'
      : variant === 'danger'
        ? 'border-danger bg-danger text-[#f2f5fb] hover:bg-white/8'
        : 'border-border-default bg-elevated text-primary hover:bg-white/8';
  return `modal-btn h-8 cursor-pointer rounded-sm border px-4 text-base disabled:cursor-not-allowed disabled:opacity-45 ${tone}`;
}
