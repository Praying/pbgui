import { describe, expect, it } from 'vitest';
import { formatNextRun, formatTimestamp, resultClass } from './format';

describe('formatTimestamp (legacy formatTimestamp, de-DE locale)', () => {
  it('returns empty string for empty input', () => {
    expect(formatTimestamp('')).toBe('');
  });

  it('formats an ISO timestamp with German locale and 2-digit fields', () => {
    // Legacy: new Date(ts).toLocaleString('de-DE', {...2-digit options})
    expect(formatTimestamp('2024-01-02T03:04:05')).toBe('02.01.2024, 03:04:05');
  });

  it('returns the Invalid Date rendering for garbage input (legacy try/catch never fires)', () => {
    // Documenting legacy behavior: toLocaleString does not throw on Invalid
    // Date, so the catch branch is unreachable for unparseable strings.
    expect(formatTimestamp('garbage')).toBe('Invalid Date');
  });
});

describe('formatNextRun (legacy formatNextRun)', () => {
  it('returns empty string for empty, null and undefined', () => {
    expect(formatNextRun('', 'Ready')).toBe('');
    expect(formatNextRun(null, 'Ready')).toBe('');
    expect(formatNextRun(undefined, 'Ready')).toBe('');
  });

  it('returns the ready label for zero, negative and NaN values', () => {
    expect(formatNextRun(0, 'Ready')).toBe('Ready');
    expect(formatNextRun(-3, 'Ready')).toBe('Ready');
    expect(formatNextRun('abc', 'Ready')).toBe('Ready');
  });

  it('renders sub-minute values as seconds (parseInt truncates)', () => {
    expect(formatNextRun(45, 'Ready')).toBe('45s');
    expect(formatNextRun('45.9', 'Ready')).toBe('45s');
    expect(formatNextRun(59, 'Ready')).toBe('59s');
  });

  it('renders minute values as minutes plus remaining seconds', () => {
    expect(formatNextRun(60, 'Ready')).toBe('1m 0s');
    expect(formatNextRun(125, 'Ready')).toBe('2m 5s');
    expect(formatNextRun(3600, 'Ready')).toBe('60m 0s');
  });
});

describe('resultClass (legacy updateCoinTable result coloring)', () => {
  it('maps success and error to their accent classes', () => {
    expect(resultClass('success')).toBe('mds-result-success');
    expect(resultClass('error')).toBe('mds-result-error');
  });

  it('returns an empty class for anything else', () => {
    expect(resultClass('')).toBe('');
    expect(resultClass('partial')).toBe('');
  });
});
