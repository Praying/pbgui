/**
 * Shared Tailwind class sets for the welcome page — the former
 * styles/welcome.css declarations (deleted at the Tailwind migration)
 * that are reused across call sites or vary per element state. Mirrors
 * v7_backtest's lib/uiClasses.ts.
 *
 * Every state helper returns the COMPLETE colour set for its branch: the
 * legacy tone rules replaced colours wholesale, and Tailwind emits
 * same-property utilities in its own fixed order, so a branch must never
 * be combined with a competing colour utility on the same element. The
 * legacy class names (btn, btn-primary, browser-entry, status-badge--*,
 * banner kinds …) stay on the elements as inert anchors — the shared
 * components.css chrome (button, .btn, .btn-*) keeps supplying the
 * declarations welcome.css never overrode, and the test suite selects
 * them.
 */
import type { BannerKind, StatusTone } from '../composables/useWelcome';

/** The former bare `button` element rule plus `.btn`'s flex/gap layout. */
const BTN_CHROME =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border font-bold ' +
  'transition-[background,border-color,transform,color] duration-[0.14s] ease-[ease] ' +
  'enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-55';

export type BtnVariant = 'primary' | 'secondary' | 'danger' | 'summary-action' | 'browse' | 'save-setup';

/**
 * The former .btn-primary / .btn-secondary / .btn-danger / .summary-action /
 * .browse-btn / #save-setup-btn rules. Each branch carries the complete
 * sizing + colour set (height, padding, font-size and tone together) so no
 * two branches can fight over one property.
 */
export function btnClass(variant: BtnVariant = 'secondary'): string {
  if (variant === 'primary') {
    return `${BTN_CHROME} h-[var(--btn-h)] px-3.5 text-base border-accent bg-accent text-accent-contrast enabled:hover:bg-accent-soft`;
  }
  if (variant === 'danger') {
    return `${BTN_CHROME} h-[var(--btn-h)] px-3.5 text-base border-danger/35 bg-danger-deep/42 text-danger-soft enabled:hover:border-danger/60 enabled:hover:bg-danger-deep/58`;
  }
  if (variant === 'summary-action') {
    return `${BTN_CHROME} mt-auto h-7 px-2.5 text-sm border-border-default bg-card text-primary enabled:hover:border-secondary enabled:hover:bg-elevated`;
  }
  if (variant === 'browse') {
    return `${BTN_CHROME} h-[var(--btn-h)] min-w-[62px] px-2 text-[12px] border-accent/20 bg-accent-deep/8 text-accent-soft enabled:hover:border-accent/48 enabled:hover:bg-accent-deep/18`;
  }
  if (variant === 'save-setup') {
    return `${BTN_CHROME} min-w-24 h-9 px-3.5 text-base border-accent bg-accent text-accent-contrast enabled:hover:bg-accent-soft shadow-[0_8px_18px_rgb(var(--accent-deep-rgb)/0.2)]`;
  }
  return `${BTN_CHROME} h-[var(--btn-h)] px-3.5 text-base border-border-default bg-card text-primary enabled:hover:border-secondary enabled:hover:bg-elevated`;
}

/**
 * The former bare `input, select` element rule — minus the declarations
 * the shared base layer already provides (border, colour, font-size,
 * outline: none and the :focus border tint).
 */
export const inputClass =
  'w-full h-[var(--input-h)] rounded-lg bg-page px-3 ' +
  'hover:border-accent/42 focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.16)] ' +
  'disabled:cursor-not-allowed disabled:opacity-55';

/** The former #section-setup input/select refinement (36px, muted fill). */
export const setupInputClass =
  'w-full h-9 rounded-lg border-secondary/15 bg-page/72 px-3 ' +
  'shadow-[inset_0_1px_rgba(255,255,255,0.025)] placeholder:text-muted ' +
  'hover:border-accent/34 hover:bg-page/84 disabled:cursor-not-allowed disabled:opacity-55';

/** The former bare `label` element rule. */
export const labelClass = 'text-secondary text-sm font-bold tracking-[0.02em]';

/** The former #section-setup label refinement (12px, wider tracking). */
export const setupLabelClass = 'text-secondary text-[12px] font-bold tracking-[0.025em]';

/** The former .status-badge--<tone> colour rules (border width included). */
export function statusBadgeToneClass(tone: StatusTone): string {
  if (tone === 'success') return 'border border-success/25 bg-success/10 text-success-soft';
  if (tone === 'warning') return 'border border-warning/25 bg-warning/10 text-warning-soft';
  if (tone === 'danger') return 'border border-danger/25 bg-danger/10 text-danger-soft';
  if (tone === 'info') return 'border border-accent/25 bg-accent/10 text-accent-soft';
  return 'border border-secondary/22 bg-secondary/8 text-primary';
}

/** The former .issue.error / .issue.warning tone rules. */
export function issueToneClass(kind: 'error' | 'warning'): string {
  if (kind === 'error') return 'border border-danger/22 bg-danger-deep/45 text-danger-soft';
  return 'border border-warning/22 bg-warning-deep/38 text-warning-soft';
}

/**
 * The former .banner / .banner.show / .banner.<kind> rules. The legacy
 * `show` + kind class names ride along as inert anchors — the suite
 * asserts the kind class on #banner.
 */
export function bannerClass(message: string, kind: BannerKind): string {
  if (!message) return 'hidden';
  const tone =
    kind === 'error'
      ? 'border border-danger/28 bg-danger-deep/45 text-danger-soft'
      : kind === 'success'
        ? 'border border-success/24 bg-success-deep/34 text-success-soft'
        : 'border border-accent/24 bg-accent-deep/25 text-accent-soft';
  return `show ${kind} block ${tone}`;
}

/**
 * The former .browser-entry / :hover / .selected rules — each branch a
 * complete set including the chrome the legacy bare `button` element rule
 * supplied (the entry buttons carry no .btn class). The legacy `selected`
 * class name rides along as an inert anchor.
 */
export function browserEntryClass(selected: boolean): string {
  const chrome =
    'flex h-[var(--btn-h)] min-h-[var(--btn-h)] w-full cursor-pointer items-center justify-start gap-2 ' +
    'rounded-lg border px-3 py-0 text-left text-base font-bold ' +
    'transition-[background,border-color,transform,color] duration-[0.14s] ease-[ease] ' +
    'enabled:hover:-translate-y-px enabled:hover:border-border-default enabled:hover:bg-elevated ' +
    'disabled:cursor-not-allowed disabled:opacity-55';
  return selected
    ? `${chrome} selected border-success bg-success/15 text-success-soft`
    : `${chrome} border-border-default bg-card text-primary`;
}
