/**
 * Shared Tailwind class sets for the market_data page — the former
 * panels-*.css rules (deleted at the Tailwind migration). Centralized so
 * the dozens of call sites stay in sync; v7_backtest's uiClasses pattern.
 *
 * Every helper that takes a state returns the COMPLETE colour set per
 * branch: the legacy state rules (.callout.warning, .toast.success,
 * 'is-selected', …) replaced the base tone wholesale, so a variant must
 * never be combined with the default tone on the same element (Tailwind
 * emits same-property utilities in its own fixed order). The legacy class
 * names ride along as inert anchors — the test suite selects them
 * (.callout.warning, .toast.success, 'is-selected', …).
 *
 * ui-migration: the form-control helpers (btnClass/btn*Class, sbBtnClass,
 * saveSettingsBtnClass, settingsSubsectionBtnClass, inventorySubsectionBtnClass,
 * actBtnClass, inventorySortBtnClass, inputClass, inputPwClass) left with the
 * ui/ control layer migration — buttons/inputs/selects/checkboxes now render
 * through @/shared/components/ui/*; their inert anchors (sb-btn, act-btn,
 * save-needed, …) ride along via the components' class prop.
 */

/* ── panels-shell.css ─────────────────────────────────────────── */

/** The former .panel-card rule (gradient card used by every panel body). */
export const panelCardClass =
  'panel-card rounded-[14px] border border-border-default bg-[linear-gradient(180deg,rgb(var(--bg-panel-rgb)_/_0.98),rgb(var(--bg-page-rgb)_/_0.98))] p-5 shadow-[0_18px_40px_rgba(5,8,14,0.28)]';

/** The former .sb-sep rule (sidebar-block divider). */
export const sbSepClass = 'sb-sep my-0.5 border-t border-border-subtle';

/* ── panels-status.css ─────────────────────────────────────────── */

/** The former .callout / .callout.warning rules. */
export function calloutClass(warning = false): string {
  return warning
    ? 'callout warning grid gap-2 rounded-[10px] border border-warning/30 bg-warning/8 p-3'
    : 'callout grid gap-2 rounded-[10px] border border-accent/22 bg-accent/8 p-3';
}

/* ── panels-settings.css ───────────────────────────────────────── */

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
