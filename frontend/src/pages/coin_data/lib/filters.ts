/**
 * Number-filter helpers ported from coin_data.html:
 *
 *   normalizeFilterNumberText :2402-2404   parseFilterNumber :2406-2411
 *   isIncompleteFilterNumber  :2413-2416   commitFilterNumberDraft :2432-2443
 *   formatStepperValue        :2472-2479   getDynamicVolMcapStepValue :2481-2500
 */

export function normalizeFilterNumberText(rawValue: unknown): string {
  return rawValue == null ? '' : String(rawValue).trim().replace(/,/g, '.');
}

export function parseFilterNumber(rawValue: unknown, fallback: number): number {
  const normalized = normalizeFilterNumberText(rawValue);
  if (normalized === '') return 0;
  const parsed = Number(normalized);
  return isFinite(parsed) ? parsed : fallback;
}

export function isIncompleteFilterNumber(rawValue: unknown): boolean {
  const normalized = normalizeFilterNumberText(rawValue);
  return (
    normalized === '+' ||
    normalized === '-' ||
    normalized === '.' ||
    normalized === '+.' ||
    normalized === '-.' ||
    /\.$/.test(normalized)
  );
}

/**
 * commitFilterNumberDraft (:2432-2443) — stores the raw draft and, when it
 * parses, commits it. Returns false while the draft is incomplete (the caller
 * keeps the draft visible and does not schedule a reload); the parsed value is
 * written through the commit callback.
 */
export function commitFilterNumberDraft(
  rawValue: unknown,
  current: number,
  commit: (value: number) => void
): boolean {
  if (rawValue == null || rawValue === '') {
    commit(0);
    return true;
  }
  if (isIncompleteFilterNumber(rawValue)) {
    return false;
  }
  commit(parseFilterNumber(rawValue, current));
  return true;
}

export function formatStepperValue(value: number): string {
  if (!isFinite(value)) return '0';
  const rounded = Number(value.toFixed(12));
  if (Math.abs(rounded - Math.round(rounded)) < 1e-12) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * getDynamicVolMcapStepValue (:2481-2500) — the vol/mcap stepper snaps to the
 * server-provided significant-value ladder instead of a fixed step. Returns
 * null when no ladder exists, or `current` when it already sits at the end.
 */
export function getDynamicVolMcapStepValue(
  current: number,
  direction: number,
  values: unknown
): number | null {
  const ladder = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => isFinite(value) && value > 0);
  const epsilon = 1e-12;
  if (!ladder.length) return null;
  if (direction > 0) {
    for (const value of ladder) {
      if (value > current + epsilon) return value;
    }
    return current;
  }
  for (let index = ladder.length - 1; index >= 0; index -= 1) {
    if (ladder[index]! < current - epsilon) return ladder[index]!;
  }
  return current;
}

/**
 * stepFilterField (:2502-2525) — the fixed-step branch (market_cap): clamp to
 * the input's min/max and round to the step's decimals.
 */
export function stepFixedValue(
  currentRaw: unknown,
  step: number,
  min: number,
  max: number,
  direction: number
): number {
  const stepSafe = parseFloat(String(step)) || 1;
  const current = parseFilterNumber(currentRaw, 0);
  const decimals = (String(stepSafe).split('.')[1] || '').length;
  const next = current + direction * stepSafe;
  const clamped = Math.min(max, Math.max(min, parseFloat(next.toFixed(decimals))));
  return decimals > 0 ? parseFloat(clamped.toFixed(decimals)) : clamped;
}
