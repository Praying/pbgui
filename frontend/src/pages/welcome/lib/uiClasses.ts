/**
 * Shared Tailwind class sets for the welcome page — the former
 * styles/welcome.css declarations (deleted at the Tailwind migration)
 * that are reused across call sites or vary per element state.
 *
 * Form controls moved to the shared ui/ component layer (Button / Input /
 * Label / Select) — the legacy btnClass/inputClass/labelClass helpers are
 * gone. What remains here are the page's non-control patterns: banner,
 * status-badge tones, issue tones and the file-browser entry rows. Their
 * legacy class names stay on the elements as inert anchors for the suite.
 */
import type { BannerKind, StatusTone } from '../composables/useWelcome';

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
