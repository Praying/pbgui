import { describe, expect, it } from 'vitest';
import {
  MODES,
  PERIODS,
  PERIODS_TOP,
  PPL_SUM,
  defaultCustomPeriod,
  parseCustomPeriod,
  periodFromSelect,
  periodWithFrom,
  periodWithNow,
  periodWithTo,
  todayIso,
} from './usePeriodControls';

/*
 * Port of the editor's period-control constants and CUSTOM:from:to parsing
 * (dashboard_editor.html:502-510, 1228-1236, 1267-1330, 1585-1662,
 * 1688-1735, 1822-1870) — the same block repeated 6× in legacy, deduped here.
 */

describe('period constants (editor:502-510 verbatim)', () => {
  it('PERIODS matches the legacy array in order', () => {
    expect(PERIODS).toEqual([
      'TODAY', 'YESTERDAY', 'THIS_WEEK', 'LAST_WEEK', 'LAST_WEEK_NOW',
      'THIS_MONTH', 'LAST_MONTH', 'LAST_MONTH_NOW',
      'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'LAST_180_DAYS', 'LAST_365_DAYS',
      'THIS_QUARTER', 'LAST_QUARTER', 'LAST_QUARTER_NOW',
      'THIS_YEAR', 'LAST_YEAR', 'LAST_YEAR_NOW', 'ALL_TIME',
    ]);
  });

  it('PERIODS_TOP is PERIODS + CUSTOM (concat, same as legacy)', () => {
    expect(PERIODS_TOP).toEqual([...PERIODS, 'CUSTOM']);
    expect(PERIODS_TOP).toHaveLength(PERIODS.length + 1);
  });

  it('MODES and PPL_SUM match the legacy constants', () => {
    expect(MODES).toEqual(['bar', 'line']);
    expect(PPL_SUM).toEqual(['DAY', 'WEEK', 'MONTH']);
  });
});

describe('parseCustomPeriod (editor:1228-1232)', () => {
  it('treats plain periods as non-custom with empty from/to', () => {
    expect(parseCustomPeriod('TODAY')).toEqual({
      isCustom: false, from: '', to: '', toNow: false, displayPeriod: 'TODAY',
    });
    expect(parseCustomPeriod('THIS_MONTH').displayPeriod).toBe('THIS_MONTH');
  });

  it('parses CUSTOM:from:to', () => {
    expect(parseCustomPeriod('CUSTOM:2025-01-01:2025-01-31')).toEqual({
      isCustom: true, from: '2025-01-01', to: '2025-01-31', toNow: false, displayPeriod: 'CUSTOM',
    });
  });

  it('treats CUSTOM:from:NOW as toNow', () => {
    expect(parseCustomPeriod('CUSTOM:2025-01-01:NOW')).toEqual({
      isCustom: true, from: '2025-01-01', to: 'NOW', toNow: true, displayPeriod: 'CUSTOM',
    });
  });

  it('treats an empty to-part as toNow (legacy toNow === "" quirk)', () => {
    expect(parseCustomPeriod('CUSTOM:2025-01-01:')).toEqual({
      isCustom: true, from: '2025-01-01', to: '', toNow: true, displayPeriod: 'CUSTOM',
    });
  });

  it('keeps empty from/to for malformed CUSTOM values', () => {
    expect(parseCustomPeriod('CUSTOM::2025-02-01').from).toBe('');
    expect(parseCustomPeriod('CUSTOM:').to).toBe('');
  });

  it('does not match a value that merely contains CUSTOM: later', () => {
    expect(parseCustomPeriod('X_CUSTOM:1:2').isCustom).toBe(false);
  });
});

describe('periodFromSelect (editor:1267-1276)', () => {
  const now = new Date('2025-06-15T12:00:00Z');

  it('passes non-CUSTOM values through unchanged', () => {
    expect(periodFromSelect('THIS_WEEK', now)).toBe('THIS_WEEK');
    expect(periodFromSelect('ALL_TIME', now)).toBe('ALL_TIME');
  });

  it('builds the default CUSTOM range: 30 days back → today', () => {
    expect(periodFromSelect('CUSTOM', now)).toBe('CUSTOM:2025-05-16:2025-06-15');
  });
});

describe('periodWithFrom / periodWithTo / periodWithNow (editor:1283-1328)', () => {
  it('replaces the from-part, keeping the existing to-part', () => {
    expect(periodWithFrom('CUSTOM:2025-01-01:2025-02-01', '2025-03-01')).toBe(
      'CUSTOM:2025-03-01:2025-02-01'
    );
  });

  it('falls back to the legacy customTo when the to-part is missing', () => {
    expect(periodWithFrom('CUSTOM:2025-01-01', '2025-03-01')).toBe('CUSTOM:2025-03-01:');
  });

  it('replaces the to-part, keeping the existing from-part', () => {
    expect(periodWithTo('CUSTOM:2025-01-01:2025-02-01', '2025-04-01')).toBe(
      'CUSTOM:2025-01-01:2025-04-01'
    );
  });

  it('falls back to the legacy customFrom when the from-part is missing', () => {
    expect(periodWithTo('CUSTOM::2025-02-01', '2025-04-01')).toBe('CUSTOM::2025-04-01');
  });

  it('sets NOW when the checkbox is checked', () => {
    expect(periodWithNow('CUSTOM:2025-01-01:2025-02-01', true)).toBe(
      'CUSTOM:2025-01-01:NOW'
    );
  });

  it('sets today when the checkbox is unchecked', () => {
    const now = new Date('2025-06-15T12:00:00Z');
    expect(periodWithNow('CUSTOM:2025-01-01:NOW', false, now)).toBe(
      'CUSTOM:2025-01-01:2025-06-15'
    );
  });
});

describe('date helpers', () => {
  it('todayIso uses toISOString().slice(0,10) like legacy', () => {
    expect(todayIso(new Date('2025-06-15T23:59:59Z'))).toBe('2025-06-15');
  });

  it('defaultCustomPeriod is 30 days back → today', () => {
    const now = new Date('2025-06-15T12:00:00Z');
    expect(defaultCustomPeriod(now)).toBe('CUSTOM:2025-05-16:2025-06-15');
  });
});
