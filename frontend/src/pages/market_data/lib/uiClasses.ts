/**
 * Shared Tailwind class sets for the market_data page — the former
 * panels-*.css rules (deleted at the Tailwind migration). Centralized so
 * the dozens of call sites stay in sync; v7_backtest's uiClasses pattern.
 *
 * Every helper that takes a state returns the COMPLETE colour set per
 * branch: the legacy state rules (.btn.primary, .sb-btn.active,
 * .callout.warning, …) replaced the base tone wholesale, so a variant must
 * never be combined with the default tone on the same element (Tailwind
 * emits same-property utilities in its own fixed order). The legacy class
 * names ride along as inert anchors — the test suite selects them
 * (.callout.warning, .toast.success, 'save-needed', 'is-selected', …).
 */

/* ── panels-shell.css ─────────────────────────────────────────── */

/** The former .panel-card rule (gradient card used by every panel body). */
export const panelCardClass =
  'panel-card rounded-[14px] border border-border-default bg-[linear-gradient(180deg,rgb(var(--bg-panel-rgb)_/_0.98),rgb(var(--bg-page-rgb)_/_0.98))] p-5 shadow-[0_18px_40px_rgba(5,8,14,0.28)]';

/** The former .sb-btn rule (in-panel segmented controls — NOT the shared
 *  .page-toolbar .sb-btn chrome of components.css, which stays untouched). */
export function sbBtnClass(active = false): string {
  return active
    ? 'sb-btn active inline-flex cursor-pointer items-center rounded-md border border-success bg-success/13 px-[0.65rem] py-[0.38rem] text-base text-success no-underline transition-[background-color,border-color,color] duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50'
    : 'sb-btn inline-flex cursor-pointer items-center rounded-md border border-border-default bg-card px-[0.65rem] py-[0.38rem] text-base text-secondary no-underline transition-[background-color,border-color,color] duration-[120ms] hover:border-secondary hover:bg-elevated hover:text-primary disabled:cursor-not-allowed disabled:opacity-50';
}

/** The former .sb-sep rule (sidebar-block divider). */
export const sbSepClass = 'sb-sep my-0.5 border-t border-border-subtle';

/** The former input[type=…], select rule (unscoped on the legacy page).
 *  focus:border-accent re-asserts the shared base-layer input focus ring,
 *  which a border-color utility would otherwise outrank. */
export const inputClass =
  'w-full h-8 rounded-lg border border-border-default bg-[rgb(var(--bg-page-rgb)/0.92)] py-0 px-2 text-base text-primary focus:border-accent';

/** inputClass minus the right padding — the former .pw-wrap input rule
 *  (36px eye gutter; pl/pr instead of px so the gutter wins the cascade). */
export const inputPwClass =
  'w-full h-8 rounded-lg border border-border-default bg-[rgb(var(--bg-page-rgb)/0.92)] py-0 pl-2 pr-9 text-base text-primary focus:border-accent';

/* ── panels-status.css ─────────────────────────────────────────── */

/** The former .callout / .callout.warning rules. */
export function calloutClass(warning = false): string {
  return warning
    ? 'callout warning grid gap-2 rounded-[10px] border border-warning/30 bg-warning/8 p-3'
    : 'callout grid gap-2 rounded-[10px] border border-accent/22 bg-accent/8 p-3';
}

/* ── panels-settings.css ───────────────────────────────────────── */

/** The former .btn / .btn.primary / .btn.secondary family. The shared
 *  components.css .btn chrome stays on the element via the pbgui anchors;
 *  these utilities reproduce the page-local geometry that used to outrank
 *  it (gap 8, radius 8, fs-base, weight 600, transparent border). */
export type BtnVariant = 'primary' | 'secondary';

const btnGeometry =
  'inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-base font-semibold no-underline transition-[background-color,border-color,color] duration-[150ms] disabled:cursor-not-allowed disabled:opacity-50';

export function btnClass(variant: BtnVariant): string {
  const tone =
    variant === 'primary'
      ? 'btn pbgui-btn btn-primary primary bg-accent border-accent text-page enabled:hover:bg-accent-soft'
      : 'btn pbgui-btn btn-secondary secondary bg-accent/8 border-accent/25 text-primary enabled:hover:border-accent enabled:hover:bg-accent/16';
  return `${btnGeometry} ${tone}`;
}

/** The former .btn.secondary on pages without the shared pbgui-btn
 *  classes (tradfi actions, search window, delete-date overlay). */
export const btnSecondaryClass = `${btnGeometry} btn secondary bg-accent/8 border-accent/25 text-primary enabled:hover:border-accent enabled:hover:bg-accent/16`;

/** The former .btn.primary on pages without the shared pbgui-btn classes. */
export const btnPrimaryClass = `${btnGeometry} btn primary bg-accent border-accent text-page enabled:hover:bg-accent-soft`;

/** The .btn-danger buttons (integrity removals, schedule deletion): the
 *  page-local .btn rule never themed them — the fill/text came from the
 *  shared components.css .btn-danger (kept via the anchors) while the
 *  page's border shorthand forced the border transparent. */
export const btnDangerClass = `${btnGeometry} btn pbgui-btn btn-danger danger border-transparent`;

/** The former .note rule. */
export const noteClass = 'note text-sm text-secondary';

/** The former .panel-head rule (legacy :758-765). */
export const panelHeadClass =
  'panel-head mb-3 flex flex-wrap items-start justify-between gap-3';

/** The former .settings-toggle rule. */
export const settingsToggleClass =
  'settings-toggle flex min-h-8 items-center gap-2 text-base text-primary';

/** The former .hero-copy / .stack / .slice-card / .info-card rule. */
export const stackClass = 'stack grid gap-2';

/** The former .field-label rule. */
export const fieldLabelClass = 'field-label text-sm text-secondary';

/** The former .settings-field rule. */
export const settingsFieldClass = 'settings-field grid gap-1';

/** The former .settings-grid rule (auto-fit card grid). */
export const settingsGridClass =
  'settings-grid grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]';

/** The former .settings-grid-wide rule. */
export const settingsGridWideClass =
  'settings-grid settings-grid-wide grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]';

/** The former #btn-save-settings / .save-needed rules (sb-btn + dirty state). */
export function saveSettingsBtnClass(dirty: boolean): string {
  return dirty
    ? 'sb-btn save-settings-btn save-needed inline-flex flex-none cursor-pointer items-center rounded-md border border-warning-deep bg-warning-deep/40 px-[0.65rem] py-[0.38rem] text-base font-bold text-warning-soft no-underline transition-[background-color,border-color,color] duration-[120ms] hover:border-warning-deep hover:bg-warning-deep hover:text-warning-soft disabled:cursor-not-allowed disabled:opacity-50'
    : `save-settings-btn flex-none ${sbBtnClass(false)}`;
}

/** The former .settings-subsection-btn.active rule on top of .sb-btn. */
export function settingsSubsectionBtnClass(active: boolean): string {
  return active
    ? 'sb-btn settings-subsection-btn active inline-flex cursor-pointer items-center rounded-md border border-accent/70 bg-accent/22 px-[0.65rem] py-[0.38rem] text-base text-primary no-underline shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.18)] transition-[background-color,border-color,color] duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50'
    : `settings-subsection-btn ${sbBtnClass(false)}`;
}

/** The former .coin-picker-row family (settings + best-1m pickers). */
export function coinPickerRowClass(selected: boolean, disabled: boolean, button = true): string {
  const anchors = button ? 'coin-picker-row coin-picker-button' : 'coin-picker-row';
  const layout = button
    ? 'w-full justify-start text-left select-none [font:inherit] focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent/42 focus-visible:outline-offset-1'
    : '';
  const cursor = disabled ? 'cursor-default' : 'cursor-pointer';
  const state = disabled
    ? selected
      ? 'disabled selected border-accent/24 bg-accent/12 opacity-[0.72]'
      : 'disabled border-transparent bg-transparent opacity-[0.72]'
    : selected
      ? 'selected border-accent/24 bg-accent/12'
      : 'border-transparent bg-transparent hover:bg-accent/8';
  return `${anchors} ${layout} flex min-h-[30px] min-w-0 items-center gap-2 rounded-lg border px-2 text-primary ${cursor} ${state}`.replace(/\s+/g, ' ').trim();
}

/* ── panels-inventory.css ──────────────────────────────────────── */

/** The former .inventory-subsection-btn rules on top of .sb-btn. */
export function inventorySubsectionBtnClass(active: boolean): string {
  return active
    ? 'sb-btn inventory-subsection-btn active inline-flex cursor-pointer items-center rounded-md border border-success/75 bg-success/14 px-[0.65rem] py-[0.38rem] text-sm text-success-soft no-underline shadow-[inset_0_0_0_1px_rgb(var(--success-rgb)/0.16)] transition-[background-color,border-color,color] duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50'
    : 'sb-btn inventory-subsection-btn inline-flex cursor-pointer items-center rounded-md border border-accent/22 bg-accent/8 px-[0.65rem] py-[0.38rem] text-sm text-accent-soft no-underline transition-[background-color,border-color,color] duration-[120ms] enabled:hover:border-accent/45 enabled:hover:bg-accent/16 enabled:hover:text-[#f2f5fb] disabled:cursor-not-allowed disabled:opacity-50';
}

/** The former .inventory-table-toolbar .act-btn rules (active also covers
 *  the legacy [aria-pressed="true"] selector — callers pass the same state
 *  that drives aria-pressed). */
export function actBtnClass(active = false): string {
  return active
    ? 'act-btn active cursor-pointer rounded-sm border border-accent bg-accent/10 py-[3px] px-2 text-xs text-primary transition-all duration-[150ms] disabled:cursor-not-allowed disabled:opacity-50'
    : 'act-btn cursor-pointer rounded-sm border border-border-default bg-transparent py-[3px] px-2 text-xs text-secondary transition-all duration-[150ms] enabled:hover:border-accent enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50';
}

/** The former .inventory-sort-btn rules. */
export function inventorySortBtnClass(active = false): string {
  const state = active ? 'is-active text-success-soft' : 'text-inherit hover:text-primary';
  return `inventory-sort-btn inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 [font:inherit] ${state}`;
}

/* ── panels-integrity.css ──────────────────────────────────────── */

/** The former .integrity-gap-cell family ("" | leading | internal |
 *  trailing | missing-day). Callers add the size: h-[9px] for chart cells,
 *  w-3 h-3 for the legend swatches (the legacy .integrity-gap-swatch
 *  width lost the cascade race to .integrity-gap-cell's height/radius). */
export function gapCellClass(cls: string): string {
  const bg =
    cls === 'leading'
      ? 'bg-warning-soft/82'
      : cls === 'internal'
        ? 'bg-danger/90'
        : cls === 'trailing'
          ? 'bg-warning/88'
          : cls === 'missing-day'
            ? 'bg-danger-deep/92'
            : 'bg-success/72';
  return `integrity-gap-cell ${cls} rounded-[1px] ${bg}`.replace(/\s+/g, ' ').trim();
}

/** The former .integrity-context-hour family ("" | partial | missing). */
export function contextHourClass(cls: string): string {
  const bg =
    cls === 'partial' ? 'bg-warning/88' : cls === 'missing' ? 'bg-danger-deep/75' : 'bg-success/72';
  return `integrity-context-hour ${cls} h-3 rounded-[2px] ${bg}`.replace(/\s+/g, ' ').trim();
}

/** The former .integrity-context-day rules (hover/selected/disabled). */
export function contextDayClass(selected: boolean): string {
  const state = selected
    ? 'selected border-accent bg-accent/12'
    : 'border-transparent bg-transparent enabled:hover:bg-accent/8';
  return `integrity-context-day grid w-full cursor-pointer grid-cols-[96px_minmax(320px,1fr)_72px_150px] items-center gap-2 rounded-[5px] border px-[7px] py-1 text-left text-primary disabled:cursor-default disabled:opacity-[0.58] ${state}`;
}

/* ── panels-best1m-copy.css ────────────────────────────────────── */

/** The former .best1m-job-monitor-frame rule — shared by the best-1m and
 *  copy-data panels' AutoResizeFrame (passed via its frame-class prop). */
export const jobMonitorFrameClass =
  'best1m-job-monitor-frame h-[min(72vh,820px)] w-full min-h-[520px] rounded-none border-0 bg-transparent';

/** The former .best1m-frame rule (hyperliquid flat iframe). */
export const best1mFrameClass = 'best1m-frame w-full min-h-0 border-0 bg-transparent';

/** The former .best1m-host-row rules (hover/selected). */
export function best1mHostRowClass(selected: boolean): string {
  return selected
    ? 'best1m-host-row selected grid w-full cursor-pointer gap-[2px] rounded-lg border border-accent/56 bg-accent/14 px-2.5 py-2 text-left text-primary [font:inherit]'
    : 'best1m-host-row grid w-full cursor-pointer gap-[2px] rounded-lg border border-secondary/18 bg-panel/82 px-2.5 py-2 text-left text-primary hover:border-accent/38 hover:bg-accent/8 [font:inherit]';
}
