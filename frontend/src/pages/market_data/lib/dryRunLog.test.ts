import { describe, expect, it } from 'vitest';
import {
  copyDataStatValue,
  formatCopyDataBytes,
  formatCopyDataCount,
  mergeCopyDataDryRunStats,
  parseCopyDataByteValue,
  parseCopyDataCount,
  parseCopyDataDryRunLog,
  copyDataDryRunStatsFromJob,
  computeDryRunSummaryView,
} from './dryRunLog';

/* M-data-7 — the dry-run rsync log parsers/formatters, pure ports of legacy
   market_data_main.html :5269-5523:
     copyDataStatValue      :5269-5273
     parseCopyDataCount     :5275-5281  (comma = decimal separator, dots
                                         stripped — legacy semantics verbatim)
     parseCopyDataByteValue :5283-5300
     formatCopyDataCount    :5302-5304
     formatCopyDataBytes    :5306-5316
     statsFromJob           :5318-5340
     merge                  :5342-5356
     parseDryRunLog         :5358-5429
     summary rows           :5431-5475 (renderCopyDataDryRunSummary's data
                                         model, component-free) */

const t = (key: string, params?: Record<string, unknown>): string =>
  key === 'market.exchangeStatLine'
    ? `${params?.label}: ${params?.files} files, ${params?.size} → ${params?.remote}`
    : key;

describe('copyDataStatValue (:5269-5273)', () => {
  it('slices the value after the label colon', () => {
    expect(copyDataStatValue('Number of files: 12,345 (reg: 11,000)', 'Number of files')).toBe(
      '12,345 (reg: 11,000)'
    );
  });

  it('returns empty when the label is absent', () => {
    expect(copyDataStatValue('Total bytes sent: 5', 'Number of files')).toBe('');
  });
});

describe('parseCopyDataCount (:5275-5281 — comma is the decimal separator)', () => {
  it('drops the parenthetical and parses a plain count', () => {
    expect(parseCopyDataCount('123 (reg: 45)')).toBe(123);
  });

  it('reads a comma as a decimal point (legacy semantics)', () => {
    expect(parseCopyDataCount('1,234')).toBe(1.234);
  });

  it('strips dot thousand separators', () => {
    expect(parseCopyDataCount('1.234')).toBe(1234);
  });

  it('returns null for empty or non-numeric text', () => {
    expect(parseCopyDataCount('')).toBeNull();
    expect(parseCopyDataCount(null)).toBeNull();
    expect(parseCopyDataCount('abc')).toBeNull();
  });
});

describe('parseCopyDataByteValue (:5283-5300)', () => {
  it('parses a bare byte count', () => {
    expect(parseCopyDataByteValue('17894354')).toBe(17894354);
    expect(parseCopyDataByteValue('6216000 bytes')).toBe(6216000);
  });

  it('applies binary unit powers (KiB/MB/GB case-insensitive)', () => {
    expect(parseCopyDataByteValue('2 KB')).toBe(2048);
    expect(parseCopyDataByteValue('1.5 MB')).toBe(1.5 * 1024 * 1024);
    expect(parseCopyDataByteValue('3GiB')).toBe(3 * 1024 ** 3);
  });

  it('reads a single comma as the decimal separator', () => {
    expect(parseCopyDataByteValue('17,5 MB')).toBe(17.5 * 1024 * 1024);
  });

  it('returns null for multi-group comma thousands (legacy)', () => {
    expect(parseCopyDataByteValue('17,894,354')).toBeNull();
  });

  it('strips multi-dot thousand separators', () => {
    expect(parseCopyDataByteValue('17.894.354')).toBe(17894354);
  });

  it('returns null for empty or non-matching text', () => {
    expect(parseCopyDataByteValue('')).toBeNull();
    expect(parseCopyDataByteValue('n/a')).toBeNull();
  });
});

describe('formatCopyDataCount (:5302-5304)', () => {
  it('groups thousands with commas after rounding', () => {
    expect(formatCopyDataCount(1234)).toBe('1,234');
    expect(formatCopyDataCount(1234567)).toBe('1,234,567');
    expect(formatCopyDataCount(1.6)).toBe('2');
  });

  it('returns empty for non-finite input', () => {
    expect(formatCopyDataCount(Number.NaN)).toBe('');
  });
});

describe('formatCopyDataBytes (:5306-5316)', () => {
  it('renders plain bytes below the first unit', () => {
    expect(formatCopyDataBytes(0)).toBe('0 bytes');
    expect(formatCopyDataBytes(512)).toBe('512 bytes');
  });

  it('scales through KB/MB/GB with two decimals', () => {
    expect(formatCopyDataBytes(2048)).toBe('2.00 KB');
    expect(formatCopyDataBytes(17894354)).toBe('17.07 MB');
    expect(formatCopyDataBytes(3 * 1024 ** 3)).toBe('3.00 GB');
  });

  it('returns empty for non-finite input and clamps negatives to 0', () => {
    expect(formatCopyDataBytes(Number.NaN)).toBe('');
    expect(formatCopyDataBytes(-5)).toBe('0 bytes');
  });
});

describe('parseCopyDataDryRunLog (:5358-5429)', () => {
  const LINES = [
    '2026-08-15 10:00:00 [dry-run] remote=/srv/pbgui/data/ohlcv/binanceusdm',
    '2026-08-15 10:00:01 [dry-run] remote=/srv/pbgui/data/ohlcv/bybit',
    '2026-08-15 10:00:01 [dry-run] remote=/srv/pbgui/data/ohlcv/binanceusdm',
    '2026-08-15 10:00:02 Number of files: 6215 (reg: 5900)',
    '2026-08-15 10:00:02 Number of regular files transferred: 1234',
    '2026-08-15 10:00:02 Total file size: 17.894.354',
    '2026-08-15 10:00:02 Total transferred file size: 6215340',
    '2026-08-15 10:00:02 Total bytes sent: 6216000',
    '2026-08-15 10:00:02 Total bytes received: 4096',
    '2026-08-15 10:00:03 ssh done duration=12s wall clock',
    '2026-08-15 10:00:03 unrelated noise line',
  ];

  it('collects unique remote paths, the duration and the stripped stat lines', () => {
    const stats = parseCopyDataDryRunLog(LINES);
    expect(stats.remote_paths).toEqual([
      '/srv/pbgui/data/ohlcv/binanceusdm',
      '/srv/pbgui/data/ohlcv/bybit',
    ]);
    expect(stats.duration).toBe('12s');
    expect(stats.stats_lines).toEqual([
      'Number of files: 6215 (reg: 5900)',
      'Number of regular files transferred: 1234',
      'Total file size: 17.894.354',
      'Total transferred file size: 6215340',
      'Total bytes sent: 6216000',
      'Total bytes received: 4096',
    ]);
  });

  it('sums and formats the parsed totals', () => {
    const stats = parseCopyDataDryRunLog(LINES);
    expect(stats.files_total).toBe('6,215');
    expect(stats.files_transferred).toBe('1,234');
    expect(stats.total_size).toBe('17.07 MB');
    expect(stats.transfer_size).toBe('5.93 MB');
    expect(stats.bytes_sent).toBe('5.93 MB');
    expect(stats.bytes_received).toBe('4.00 KB');
  });

  it('accumulates totals across repeated exchange sections', () => {
    const stats = parseCopyDataDryRunLog([
      'Number of regular files transferred: 100',
      'Number of regular files transferred: 23',
    ]);
    expect(stats.files_transferred).toBe('123');
  });

  it('leaves unseen stats empty rather than zero (:5420-5425 seen flags)', () => {
    const stats = parseCopyDataDryRunLog(['Total bytes received: 4096']);
    expect(stats.files_total).toBe('');
    expect(stats.bytes_received).toBe('4.00 KB');
    expect(stats.remote_paths).toEqual([]);
    expect(stats.duration).toBe('');
    expect(stats.stats_lines).toEqual(['Total bytes received: 4096']);
  });

  it('treats a non-array input as an empty log', () => {
    expect(parseCopyDataDryRunLog(undefined)).toEqual({
      remote_paths: [],
      files_total: '',
      files_transferred: '',
      total_size: '',
      transfer_size: '',
      bytes_sent: '',
      bytes_received: '',
      duration: '',
      stats_lines: [],
    });
  });
});

describe('copyDataDryRunStatsFromJob (:5318-5340)', () => {
  it('returns empty stats when progress.last_result is not a dry run', () => {
    expect(
      copyDataDryRunStatsFromJob({ progress: { last_result: { dry_run: false } } }, t)
    ).toEqual({});
  });

  it('formats the structured progress fields', () => {
    const stats = copyDataDryRunStatsFromJob(
      {
        progress: {
          last_result: {
            dry_run: true,
            remote_paths: ['/srv/ohlcv/binanceusdm'],
            files_total: 6215,
            files_transferred: 1234,
            total_size_bytes: 17894354,
            transfer_size_bytes: 6215340,
            bytes_sent: 6216000,
            bytes_received: 4096,
            duration_s: 12,
            exchange_stats: [
              {
                label: 'Binance USDM',
                files_transferred: 1000,
                transfer_size_bytes: 2048,
                remote_path: '/srv/binanceusdm',
              },
            ],
          },
        },
      },
      t
    );
    expect(stats).toEqual({
      remote_paths: ['/srv/ohlcv/binanceusdm'],
      files_total: '6,215',
      files_transferred: '1,234',
      total_size: '17.07 MB',
      transfer_size: '5.93 MB',
      bytes_sent: '5.93 MB',
      bytes_received: '4.00 KB',
      duration: '12s',
      stats_lines: ['Binance USDM: 1,000 files, 2.00 KB → /srv/binanceusdm'],
    });
  });

  it('falls back to the exchange label then the generic exchange key', () => {
    const stats = copyDataDryRunStatsFromJob(
      {
        progress: {
          last_result: {
            dry_run: true,
            exchange_stats: [
              { exchange: 'bybit', files_transferred: 1, transfer_size_bytes: 1024, remote_path: '' },
              { files_transferred: 2, transfer_size_bytes: 2048, remote_path: '' },
            ],
          },
        },
      },
      t
    );
    expect(stats.stats_lines).toEqual([
      'bybit: 1 files, 1.00 KB → ',
      'market.exchange: 2 files, 2.00 KB → ',
    ]);
  });
});

describe('mergeCopyDataDryRunStats (:5342-5356)', () => {
  it('prefers the primary value and falls back per-field', () => {
    expect(
      mergeCopyDataDryRunStats(
        { files_total: '10', stats_lines: ['a'] },
        { files_total: '20', transfer_size: '1.00 KB', stats_lines: ['b'], remote_paths: ['/r'] }
      )
    ).toEqual({
      remote_paths: ['/r'],
      files_total: '10',
      files_transferred: '',
      total_size: '',
      transfer_size: '1.00 KB',
      bytes_sent: '',
      bytes_received: '',
      duration: '',
      stats_lines: ['a'],
    });
  });

  it('treats missing sides as empty', () => {
    expect(mergeCopyDataDryRunStats(null, { duration: '9s' })).toMatchObject({ duration: '9s' });
    expect(mergeCopyDataDryRunStats({ duration: '9s' }, null)).toMatchObject({ duration: '9s' });
  });
});

describe('computeDryRunSummaryView — renderCopyDataDryRunSummary rows (:5431-5475)', () => {
  it('derives labels, target root and grid rows from the poll payload', () => {
    const view = computeDryRunSummaryView(
      {
        result: {
          job_id: 'job-7',
          target: 'user@host',
          destination_root: '/srv/data/ohlcv',
          exchanges: ['binance', 'bybit'],
        },
        job: { status: 'done', payload: {} },
        status: 'done',
        stats: parseCopyDataDryRunLog(['Number of files: 10', 'duration=3s']),
      },
      {
        status: 'market.status',
        remoteRoot: 'market.remoteRoot',
        exchanges: 'market.exchanges',
        filesToTransfer: 'market.filesToTransfer',
        transferSize: 'market.transferSize',
        totalSourceSize: 'market.totalSourceSize',
        sentReceived: 'market.sentReceived',
        duration: 'market.duration',
        waitingDryRunStats: 'market.waitingDryRunStats',
        jobPrefix: 'market.jobPrefix',
      }
    );
    expect(view.jobLabel).toBe('market.jobPrefix');
    expect(view.jobId).toBe('job-7');
    expect(view.rows).toEqual([
      ['market.status', 'done'],
      ['market.remoteRoot', 'user@host:/srv/data/ohlcv'],
      ['market.exchanges', 'binance, bybit'],
      ['market.filesToTransfer', '-'],
      ['market.transferSize', '-'],
      ['market.totalSourceSize', '-'],
      ['market.sentReceived', '- / -'],
      ['market.duration', '3s'],
    ]);
  });

  it('falls back through result → job.payload and the root/target join (:5440-5444)', () => {
    const view = computeDryRunSummaryView(
      {
        job: { status: 'queued', payload: { target: 't2', destination_root: '/root2', exchanges: ['okx'] } },
        status: 'queued',
        stats: {},
      },
      {
        status: 'S',
        remoteRoot: 'R',
        exchanges: 'E',
        filesToTransfer: 'F',
        transferSize: 'T',
        totalSourceSize: 'U',
        sentReceived: 'SR',
        duration: 'D',
        waitingDryRunStats: 'waiting…',
        jobPrefix: 'J',
      }
    );
    expect(view.rows[1]).toEqual(['R', 't2:/root2']);
    expect(view.rows[2]).toEqual(['E', 'okx']);
  });

  it('joins remote paths and stat lines with blank lines for the log detail (:5455-5458)', () => {
    const view = computeDryRunSummaryView(
      {
        result: { job_id: 'j' },
        stats: parseCopyDataDryRunLog([
          'remote=/srv/a',
          'Number of files: 1',
          'duration=1s',
        ]),
      },
      {
        status: 'S',
        remoteRoot: 'R',
        exchanges: 'E',
        filesToTransfer: 'F',
        transferSize: 'T',
        totalSourceSize: 'U',
        sentReceived: 'SR',
        duration: 'D',
        waitingDryRunStats: 'waiting…',
        jobPrefix: 'J',
      }
    );
    expect(view.detail).toBe('/srv/a\n\nNumber of files: 1');
    expect(view.error).toBe('');
  });

  it('surfaces the error and the waiting placeholder (:5457)', () => {
    const labels = {
      status: 'S',
      remoteRoot: 'R',
      exchanges: 'E',
      filesToTransfer: 'F',
      transferSize: 'T',
      totalSourceSize: 'U',
      sentReceived: 'SR',
      duration: 'D',
      waitingDryRunStats: 'waiting…',
      jobPrefix: 'J',
    };
    expect(
      computeDryRunSummaryView({ result: { job_id: 'j' }, status: 'failed', error: 'boom' }, labels)
        .detail
    ).toBe('boom');
    expect(
      computeDryRunSummaryView({ result: { job_id: 'j' }, status: 'queued', stats: {} }, labels).detail
    ).toBe('waiting…');
  });
});
