import { describe, expect, it } from 'vitest';
import {
  COPY_DATA_EXCHANGES,
  buildCopyDataRequest,
  buildScheduleSaveRequest,
  computeScheduleRowView,
  copyDataScheduleTime,
  isInvalidScheduleInterval,
  validateCopyDataRequest,
} from './copySchedules';

/* M-data-7 — copy-data request/schedule pure logic (legacy
   market_data_main.html :5038-5254):
     exchange checkbox registry  DOM :3443-3447 (checked defaults)
     collectCopyDataRequest      :5046-5053
     validateCopyDataRequest     :5055-5060
     copyDataScheduleTime        :5089-5093
     schedule row model          :5103-5123
     interval guard              :5189-5191
     save request assembly       :5197-5201 */

const t = (key: string, params?: Record<string, unknown>): string => {
  const entries = Object.entries(params ?? {});
  if (!entries.length) return key;
  return `${key} {${entries.map(([k, v]) => `${k}:${String(v)}`).join(', ')}}`;
};

describe('COPY_DATA_EXCHANGES (:3443-3447)', () => {
  it('keeps the legacy registry order and checked defaults', () => {
    expect(COPY_DATA_EXCHANGES).toEqual([
      { key: 'binance', label: 'Binance USDM', checked: true },
      { key: 'bybit', label: 'Bybit', checked: true },
      { key: 'bitget', label: 'Bitget', checked: true },
      { key: 'okx', label: 'OKX', checked: false },
      { key: 'hyperliquid', label: 'Hyperliquid', checked: false },
    ]);
  });
});

describe('buildCopyDataRequest (:5046-5053)', () => {
  it('collects target, ssh command (default ssh), root and selected exchanges', () => {
    expect(
      buildCopyDataRequest({
        target: 'user@host',
        sshCommand: 'ssh',
        destinationRoot: '/srv/ohlcv',
        selectedExchanges: ['binance', 'bybit', 'okx'],
      })
    ).toEqual({
      target: 'user@host',
      ssh_command: 'ssh',
      destination_root: '/srv/ohlcv',
      exchanges: ['binance', 'bybit', 'okx'],
    });
  });

  it('falls back to the literal ssh command when the field is blank (:5049)', () => {
    expect(
      buildCopyDataRequest({
        target: 'host',
        sshCommand: '',
        destinationRoot: '',
        selectedExchanges: [],
      })
    ).toEqual({ target: 'host', ssh_command: 'ssh', destination_root: '', exchanges: [] });
  });
});

describe('validateCopyDataRequest (:5055-5060)', () => {
  it('requires the remote target', () => {
    expect(
      validateCopyDataRequest(
        { target: '', ssh_command: 'ssh', destination_root: '', exchanges: ['okx'] },
        { t }
      )
    ).toBe('market.remoteTargetRequired');
  });

  it('requires at least one exchange by default', () => {
    expect(
      validateCopyDataRequest(
        { target: 'host', ssh_command: 'ssh', destination_root: '', exchanges: [] },
        { t }
      )
    ).toBe('market.selectExchangeToCopy');
  });

  it('skips the exchange check for the connection test (:5184-5187)', () => {
    expect(
      validateCopyDataRequest(
        { target: 'host', ssh_command: 'ssh', destination_root: '', exchanges: [] },
        { t, requireExchanges: false }
      )
    ).toBe('');
  });

  it('accepts a valid request', () => {
    expect(
      validateCopyDataRequest(
        { target: 'host', ssh_command: 'ssh', destination_root: '', exchanges: ['bitget'] },
        { t }
      )
    ).toBe('');
  });
});

describe('copyDataScheduleTime (:5089-5093)', () => {
  it('returns the notScheduled key for empty values', () => {
    expect(copyDataScheduleTime('', { t })).toBe('market.notScheduled');
    expect(copyDataScheduleTime(null, { t })).toBe('market.notScheduled');
  });

  it('returns the notScheduled key for unparseable timestamps', () => {
    expect(copyDataScheduleTime('not a date', { t })).toBe('market.notScheduled');
  });

  it('formats parseable timestamps through the injected formatter', () => {
    expect(
      copyDataScheduleTime('2026-08-15T10:00:00Z', { t, formatTime: (d) => d.toISOString() })
    ).toBe('2026-08-15T10:00:00.000Z');
  });
});

describe('isInvalidScheduleInterval (:5189-5191)', () => {
  it('accepts integers between 1 and 168', () => {
    expect(isInvalidScheduleInterval(1)).toBe(false);
    expect(isInvalidScheduleInterval(24)).toBe(false);
    expect(isInvalidScheduleInterval(168)).toBe(false);
  });

  it('rejects non-integers and out-of-range values', () => {
    expect(isInvalidScheduleInterval(0)).toBe(true);
    expect(isInvalidScheduleInterval(169)).toBe(true);
    expect(isInvalidScheduleInterval(2.5)).toBe(true);
    expect(isInvalidScheduleInterval(Number.NaN)).toBe(true);
  });
});

describe('buildScheduleSaveRequest (:5197-5201)', () => {
  it('merges the form request with the editor fields', () => {
    expect(
      buildScheduleSaveRequest(
        { target: 'host', ssh_command: 'ssh -p 22', destination_root: '/r', exchanges: ['okx'] },
        {
          id: 'sch-1',
          expectedUpdatedAt: '2026-08-15T00:00:00Z',
          name: 'Optimizer refresh',
          intervalHours: 12,
          enabled: false,
        }
      )
    ).toEqual({
      target: 'host',
      ssh_command: 'ssh -p 22',
      destination_root: '/r',
      exchanges: ['okx'],
      id: 'sch-1',
      expected_updated_at: '2026-08-15T00:00:00Z',
      name: 'Optimizer refresh',
      interval_hours: 12,
      enabled: false,
    });
  });

  it('creates with an empty id for a new schedule (:5197 default)', () => {
    expect(
      buildScheduleSaveRequest(
        { target: 'h', ssh_command: 'ssh', destination_root: '', exchanges: ['bitget'] },
        { id: '', expectedUpdatedAt: '', name: '', intervalHours: 24, enabled: true }
      ).id
    ).toBe('');
  });
});

describe('computeScheduleRowView (:5103-5123)', () => {
  const view = (schedule: Record<string, unknown>, formatTime = (d: Date) => d.toISOString()) =>
    computeScheduleRowView(schedule, { t, formatTime });

  it('renders the enabled timing line with interval and next run', () => {
    expect(
      view({
        id: 's1',
        name: 'Nightly',
        enabled: true,
        interval_hours: 24,
        exchanges: ['binance', 'bybit'],
        target: 'user@host',
        destination_root: '/srv/ohlcv',
        next_run: '2026-08-16T02:00:00Z',
        updated_at: 'u',
      })
    ).toEqual({
      id: 's1',
      name: 'Nightly',
      enabled: true,
      timing: 'market.everyIntervalNext {hours:24, next:2026-08-16T02:00:00.000Z}',
      last: 'market.notRunYet',
      error: '',
      targetRoot: 'user@host:/srv/ohlcv',
      exchanges: 'binance, bybit',
    });
  });

  it('renders the disabled timing and the last-run/job suffix (:5108-5111)', () => {
    expect(
      view({
        id: 's2',
        name: 'Paused',
        enabled: false,
        interval_hours: 6,
        exchanges: [],
        target: 't',
        destination_root: '',
        last_run: '2026-08-14T01:00:00Z',
        last_job_id: 'job-9',
      })
    ).toMatchObject({
      timing: 'common.disabled',
      last: 'market.lastQueued {time:2026-08-14T01:00:00.000Z}market.jobSuffix {id:job-9}',
    });
  });

  it('drops the job suffix when last_job_id is absent (:5110)', () => {
    expect(
      view({ id: 's3', name: '', enabled: true, interval_hours: 1, exchanges: [], target: '', destination_root: '', last_run: '2026-08-14T01:00:00Z' })
    ).toMatchObject({ last: 'market.lastQueued {time:2026-08-14T01:00:00.000Z}' });
  });

  it('surfaces last_error as its own detail line (:5112)', () => {
    expect(
      view({
        id: 's4',
        name: 'Broken',
        enabled: true,
        interval_hours: 2,
        exchanges: ['okx'],
        target: 't',
        destination_root: 'r',
        last_error: 'ssh refused',
      })
    ).toMatchObject({ error: `${t('market.errorColon')}ssh refused` }); // the real en value carries the trailing space
  });

  it('shows notScheduled when next_run is unparseable (:5092)', () => {
    expect(
      view({ id: 's5', name: 'n', enabled: true, interval_hours: 3, exchanges: [], target: '', destination_root: '', next_run: 'zzz' })
    ).toMatchObject({ timing: 'market.everyIntervalNext {hours:3, next:market.notScheduled}' });
  });
});
