/*
 * Pure cell formatters ported 1:1 from frontend/market_data_status.html
 * (formatTimestamp / formatNextRun / updateCoinTable result classes).
 */

/** Legacy formatTimestamp: de-DE 2-digit rendering, '' for empty input. */
export function formatTimestamp(value: string): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return value;
  }
}

/**
 * Legacy formatNextRun: '' for empty, readyLabel for 0/negative/NaN,
 * '<s>s' under a minute, '<m>m <r>s' above.
 */
export function formatNextRun(seconds: number | string | null | undefined, readyLabel: string): string {
  if (seconds === '' || seconds === null || seconds === undefined) return '';
  const s = parseInt(String(seconds), 10);
  if (Number.isNaN(s) || s <= 0) return readyLabel;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remaining = s % 60;
  return `${m}m ${remaining}s`;
}

/** Legacy result coloring: success/error accents, '' otherwise. */
export function resultClass(result: string): string {
  if (result === 'success') return 'mds-result-success';
  if (result === 'error') return 'mds-result-error';
  return '';
}
