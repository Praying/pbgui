import { describe, expect, it } from 'vitest';
import {
  backupCreatedLabel,
  backupCreatedSort,
  cutoffMs,
  formatBytes,
  shortSyncTime,
} from './format';

/* Verbatim ports of db_tools.html :393-438, :677-681, :872-879. */

describe('formatBytes (:393-399)', () => {
  it('formats byte magnitudes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB');
  });
});

describe('backupCreatedLabel (:429-433)', () => {
  it('parses the db-tools backup name pattern', () => {
    expect(backupCreatedLabel('db-tools-20240102-030405-cleanup', '', '?')).toBe('2024-01-02 03:04:05 UTC');
  });

  it('falls back to the mtime then the unknown label', () => {
    expect(backupCreatedLabel('other.log', '2024-01-02T03:04:05.100+00:00', '?')).toBe('2024-01-02 03:04:05 UTC');
    expect(backupCreatedLabel('other.log', '', 'unknown')).toBe('unknown');
  });
});

describe('backupCreatedSort (:434-438)', () => {
  it('yields the numeric name key or the fallback', () => {
    expect(backupCreatedSort('db-tools-20240102-030405-x', '')).toBe('20240102030405');
    expect(backupCreatedSort('x', '2024-01-02')).toBe('2024-01-02');
    expect(backupCreatedSort('x', '')).toBe('');
  });
});

describe('shortSyncTime (:677-681)', () => {
  it('normalizes ISO timestamps and caps at 22 chars', () => {
    expect(shortSyncTime('')).toBe('-');
    expect(shortSyncTime('2024-01-02T03:04:05.123+00:00')).toBe('2024-01-02 03:04:05 UT'); // 22-char cap truncates
    expect(shortSyncTime('2024-01-02T03:04:05+00:00').length).toBeLessThanOrEqual(22);
  });
});

describe('cutoffMs (:872-879)', () => {
  it('returns end-of-day epoch ms for valid dates', () => {
    expect(cutoffMs('2024-01-02')).toBe(new Date('2024-01-02T23:59:59.999Z').getTime());
  });

  it('rejects empty, malformed and impossible dates', () => {
    expect(cutoffMs('')).toBeNull();
    expect(cutoffMs('2024/01/02')).toBeNull();
    expect(cutoffMs('2024-13-45')).toBeNull();
  });
});
