/**
 * Period-control constants + CUSTOM:from:to helpers — the dedup of the block
 * repeated 6× in the legacy editor's inline builders
 * (dashboard_editor.html:502-510 constants; 1228-1236 parse; 1267-1276 period
 * select; 1283-1328 CUSTOM date/Now handlers — identical copies in the PNL,
 * ADG, P+L and INCOME builders).
 *
 * The legacy code reads the live clock (`new Date()`) and mutates the flat
 * state map in place; here every function is pure — the current time is an
 * optional parameter (defaults to `new Date()`), and the caller (widget)
 * applies the returned value to the store. The returned strings are
 * byte-identical to what legacy persisted, so the on-disk `CUSTOM:from:to`
 * values stay the same format.
 */

/* ── constants (editor:502-510, verbatim) ── */

export const PERIODS = [
  'TODAY', 'YESTERDAY', 'THIS_WEEK', 'LAST_WEEK', 'LAST_WEEK_NOW',
  'THIS_MONTH', 'LAST_MONTH', 'LAST_MONTH_NOW',
  'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'LAST_180_DAYS', 'LAST_365_DAYS',
  'THIS_QUARTER', 'LAST_QUARTER', 'LAST_QUARTER_NOW',
  'THIS_YEAR', 'LAST_YEAR', 'LAST_YEAR_NOW', 'ALL_TIME',
] as const;

export const PERIODS_TOP = [...PERIODS, 'CUSTOM'] as const;
export const MODES = ['bar', 'line'] as const;
export const PPL_SUM = ['DAY', 'WEEK', 'MONTH'] as const;

/* ── CUSTOM:from:to parsing (editor:1228-1232) ── */

export interface CustomPeriod {
  isCustom: boolean;
  from: string;
  to: string;
  /** `to === 'NOW' || to === ''` — the legacy toNow check (editor:1280). */
  toNow: boolean;
  /** 'CUSTOM' for custom values — the period-select value (editor:1232). */
  displayPeriod: string;
}

export function parseCustomPeriod(period: string): CustomPeriod {
  const isCustom = period.indexOf('CUSTOM:') === 0;
  let from = '';
  let to = '';
  if (isCustom) {
    const parts = period.split(':');
    from = parts[1] || '';
    to = parts[2] || '';
  }
  return {
    isCustom,
    from,
    to,
    /* legacy only evaluates toNow inside the isCustom branch (editor:1280) —
       a non-custom period never shows the custom controls */
    toNow: isCustom && (to === 'NOW' || to === ''),
    displayPeriod: isCustom ? 'CUSTOM' : period,
  };
}

/* ── date helpers (editor:1268-1271, 1288, 1300, 1320-1323) ── */

const MS_PER_DAY = 24 * 3600 * 1000;

/** `new Date().toISOString().slice(0, 10)` — UTC date, legacy quirk kept. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The period-select CUSTOM branch: 30 days back → today (editor:1268-1271). */
export function defaultCustomPeriod(now: Date = new Date()): string {
  const from = new Date(now.getTime() - 30 * MS_PER_DAY).toISOString().slice(0, 10);
  return 'CUSTOM:' + from + ':' + todayIso(now);
}

/* ── control handlers as pure value transforms ── */

/** Period-select change (editor:1267-1276): CUSTOM builds the default range. */
export function periodFromSelect(value: string, now: Date = new Date()): string {
  if (value === 'CUSTOM') return defaultCustomPeriod(now);
  return value;
}

/** From-date change (editor:1283-1288): replace part 1, keep part 2. */
export function periodWithFrom(currentPeriod: string, from: string): string {
  const parts = (currentPeriod || '').split(':');
  return 'CUSTOM:' + from + ':' + (parts[2] || '');
}

/** To-date change (editor:1293-1299): keep part 1, replace part 2. */
export function periodWithTo(currentPeriod: string, to: string): string {
  const parts = (currentPeriod || '').split(':');
  return 'CUSTOM:' + (parts[1] || '') + ':' + to;
}

/** Now-checkbox change (editor:1304-1325): NOW or today as the to-part. */
export function periodWithNow(currentPeriod: string, checked: boolean, now: Date = new Date()): string {
  const parts = (currentPeriod || '').split(':');
  const from = parts[1] || '';
  if (checked) return 'CUSTOM:' + from + ':NOW';
  return 'CUSTOM:' + from + ':' + todayIso(now);
}
