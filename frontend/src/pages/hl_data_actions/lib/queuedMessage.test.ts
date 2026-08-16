import { describe, expect, it } from 'vitest';
import { buildQueuedMessageParts } from './queuedMessage';

/* The showQueuedMsg contract (:1595-1611) — migrated from the pytest that
   extracted the function to verify strong/br/small without innerHTML. The
   Vue port returns structured parts rendered via interpolation; the test
   locks the composition rules and that no markup can ride along. */

const t = (key: string, params?: Record<string, unknown>) =>
  key + (params ? ':' + JSON.stringify(params) : '');

describe('buildQueuedMessageParts', () => {
  it('dl replies carry the fixed range suffix and the missing-coins line', () => {
    const parts = buildQueuedMessageParts(
      'dl',
      { job_id: 'job-7', coins_count: 3, start_day: '20240101', end_day: '20240201', missing_coins: ['FOO', 'BAR'] },
      t
    );
    expect(parts.prefix).toBe('market.queuedJobPrefix');
    expect(parts.jobId).toBe('job-7');
    expect(parts.suffix).toContain('3');
    expect(parts.suffix).toContain('2024-01-01 → 2024-02-01');
    expect(parts.missingCoins).toEqual(['FOO', 'BAR']);
  });

  it('build replies with a start day carry the range', () => {
    const parts = buildQueuedMessageParts('build', { job_id: 'j', coins_count: 1, start_day: '20240101', end_day: '20240201' }, t);
    expect(parts.suffix).toContain('2024-01-01 → 2024-02-01');
    expect(parts.missingCoins).toEqual([]);
  });

  it('build replies without a start day use the end-day suffix', () => {
    const parts = buildQueuedMessageParts('build', { job_id: 'j', coins_count: 1, end_day: '20240201' }, t);
    expect(parts.suffix).toContain('market.endDaySuffix');
    expect(parts.suffix).not.toContain(' → ');
  });

  it('appends the refetch suffix only for refetch runs', () => {
    const withRefetch = buildQueuedMessageParts('build', { job_id: 'j', coins_count: 1, end_day: '20240201', refetch: true }, t);
    expect(withRefetch.suffix).toContain('market.refetchSuffix');
    const without = buildQueuedMessageParts('build', { job_id: 'j', coins_count: 1, end_day: '20240201' }, t);
    expect(without.suffix).not.toContain('market.refetchSuffix');
  });

  it('cannot smuggle markup — every field is plain text data', () => {
    const attack = '<img src=x onerror=alert(1)>';
    const parts = buildQueuedMessageParts('dl', { job_id: attack, coins_count: 1, start_day: '20240101', end_day: '20240201' }, t);
    expect(parts.jobId).toBe(attack); // rendered as text by the template
    expect(JSON.stringify(parts)).not.toContain('<strong>'); // no markup assembled
  });
});
