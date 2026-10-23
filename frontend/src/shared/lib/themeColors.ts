/**
 * Theme-aware colours for consumers that cannot take `var(--token)`:
 * canvas charts (lightweight-charts), Plotly layouts and inline SVG.
 *
 * `PRECISION_PALETTE` mirrors the *dark* tokens as literals. That was right
 * while dark was the only theme; under `[data-theme='light']` those literals
 * are pale tints on a white surface (success text 1.8:1). This module reads
 * the live computed value of the same CSS variables, so a chart drawn after
 * a theme switch picks up the right ink.
 *
 * Resolution order per role: the live CSS variable → the dark palette literal.
 * The fallback keeps jsdom, SSR-less tests and a not-yet-styled first paint
 * returning exactly what they returned before.
 */
import { PRECISION_PALETTE } from './precisionPalette';

export type ThemeName = 'dark' | 'light';

export interface ThemeColors {
  /** Plot / canvas background and the surface chart chrome sits on. */
  surface: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Grid lines and axis rules: a neutral ink tint, not a fixed white. */
  grid: string;
  zeroline: string;
  success: string;
  warning: string;
  danger: string;
  accent: string;
}

/** Current theme, from the attribute the theme switch maintains on <html>. */
export function currentTheme(): ThemeName {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function cssVar(name: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * The overlay ink at `alpha`, as `rgba(r,g,b,a)`.
 *
 * The legacy comma form is deliberate. Plotly's colour parser accepts the
 * modern `rgb(r g b / a)` syntax but silently DROPS the alpha (it renders
 * `stroke-opacity: 1`), which turned light-theme gridlines into solid black.
 * `rgba(r,g,b,a)` is honoured by Plotly, lightweight-charts and plain canvas.
 */
function overlay(alpha: number): string {
  const channels = (cssVar('--overlay-rgb') || '255 255 255').split(/[\s,]+/).filter(Boolean).slice(0, 3);
  return `rgba(${channels.join(',')},${alpha})`;
}

export function themeColors(): ThemeColors {
  return {
    surface: cssVar('--color-page') || PRECISION_PALETTE.surface.page,
    text: cssVar('--color-primary') || PRECISION_PALETTE.text.primary,
    textSecondary: cssVar('--color-secondary') || PRECISION_PALETTE.text.secondary,
    textMuted: cssVar('--color-muted') || PRECISION_PALETTE.text.muted,
    grid: overlay(0.12),
    zeroline: overlay(0.18),
    success: cssVar('--color-success') || PRECISION_PALETTE.success.base,
    warning: cssVar('--color-warning') || PRECISION_PALETTE.warning.base,
    danger: cssVar('--color-danger') || PRECISION_PALETTE.danger.base,
    accent: cssVar('--color-accent') || PRECISION_PALETTE.accent.base,
  };
}
