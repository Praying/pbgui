/*
 * M-data-7 — the dry-run rsync log parsers and formatters, pure ports of
 * legacy market_data_main.html :5269-5475:
 *
 *   copyDataStatValue      :5269-5273  value slice after a "label:" needle
 *   parseCopyDataCount     :5275-5281  counts; comma is treated as the
 *                                      decimal separator (legacy semantics
 *                                      kept verbatim — old code is the spec)
 *   parseCopyDataByteValue :5283-5300  byte values with binary unit powers
 *   formatCopyDataCount    :5302-5304  comma-grouped integer rendering
 *   formatCopyDataBytes    :5306-5316  human byte scaling
 *   statsFromJob           :5318-5340  structured job.progress stats
 *   mergeCopyDataDryRunStats :5342-5356 structured-first field merge
 *   parseCopyDataDryRunLog :5358-5429  the rsync log fallback parser
 *   computeDryRunSummaryView :5431-5475 the summary grid's data model
 */

import type { TranslateFn } from '../composables/useSettings';

/** The formatted dry-run stats shape shared by both stat sources. */
export interface DryRunStats {
  remote_paths?: string[];
  files_total?: string;
  files_transferred?: string;
  total_size?: string;
  transfer_size?: string;
  bytes_sent?: string;
  bytes_received?: string;
  duration?: string;
  stats_lines?: string[];
}

/** Legacy copyDataStatValue (:5269-5273). */
export function copyDataStatValue(line: unknown, label: unknown): string {
  const needle = `${String(label ?? '')}:`;
  const text = String(line ?? '');
  const index = text.indexOf(needle);
  return index === -1 ? '' : text.slice(index + needle.length).trim();
}

/** Legacy parseCopyDataCount (:5275-5281). */
export function parseCopyDataCount(value: unknown): number | null {
  let text = String(value ?? '')
    .split('(')[0]!
    .trim();
  if (!text) return null;
  text = text.replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/** Legacy parseCopyDataByteValue (:5283-5300). */
export function parseCopyDataByteValue(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = text.match(/([0-9][0-9.,]*)\s*([KMGTPE]?)(?:i?B|bytes)?/i);
  if (!match || !match[1]) return null;
  let numberText = match[1];
  if (numberText.includes(',')) {
    numberText = numberText.replace(/\./g, '').replace(/,/g, '.'); // :5290
  } else if ((numberText.match(/\./g) ?? []).length > 1) {
    numberText = numberText.replace(/\./g, ''); // :5292 — dot thousands
  }
  const number = Number(numberText);
  if (!Number.isFinite(number)) return null;
  const powers: Record<string, number> = { K: 1, M: 2, G: 3, T: 4, P: 5, E: 6 };
  const power = powers[String(match[2] ?? '').toUpperCase()] ?? 0;
  return number * 1024 ** power;
}

/** Legacy formatCopyDataCount (:5302-5304). */
export function formatCopyDataCount(value: number): string {
  return Number.isFinite(value)
    ? String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : '';
}

/** Legacy formatCopyDataBytes (:5306-5316). */
export function formatCopyDataBytes(value: number): string {
  if (!Number.isFinite(value)) return '';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let size = Math.max(0, value);
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return index === 0 ? `${String(Math.round(size))} bytes` : `${size.toFixed(2)} ${units[index]!}`;
}

interface DryRunLastResult {
  dry_run?: unknown;
  remote_paths?: unknown;
  files_total?: unknown;
  files_transferred?: unknown;
  total_size_bytes?: unknown;
  transfer_size_bytes?: unknown;
  bytes_sent?: unknown;
  bytes_received?: unknown;
  duration_s?: unknown;
  exchange_stats?: unknown;
}

export interface DryRunJobPayload {
  status?: unknown;
  error?: unknown;
  progress?: { last_result?: DryRunLastResult } | null;
  [key: string]: unknown;
}

function numberOrInvalid(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Legacy copyDataDryRunStatsFromJob (:5318-5340) — structured job stats. */
export function copyDataDryRunStatsFromJob(
  job: DryRunJobPayload | null | undefined,
  t: TranslateFn
): DryRunStats {
  const progress =
    job && job.progress && typeof job.progress === 'object' ? job.progress : null;
  const result =
    progress && progress.last_result && typeof progress.last_result === 'object'
      ? progress.last_result
      : null;
  if (!result || !result.dry_run) return {};
  const exchangeStats = Array.isArray(result.exchange_stats) ? result.exchange_stats : [];
  return {
    remote_paths: Array.isArray(result.remote_paths) ? result.remote_paths : [],
    files_total:
      Number.isFinite(numberOrInvalid(result.files_total))
        ? formatCopyDataCount(Number(result.files_total))
        : '',
    files_transferred:
      Number.isFinite(numberOrInvalid(result.files_transferred))
        ? formatCopyDataCount(Number(result.files_transferred))
        : '',
    total_size:
      Number.isFinite(numberOrInvalid(result.total_size_bytes))
        ? formatCopyDataBytes(Number(result.total_size_bytes))
        : '',
    transfer_size:
      Number.isFinite(numberOrInvalid(result.transfer_size_bytes))
        ? formatCopyDataBytes(Number(result.transfer_size_bytes))
        : '',
    bytes_sent:
      Number.isFinite(numberOrInvalid(result.bytes_sent))
        ? formatCopyDataBytes(Number(result.bytes_sent))
        : '',
    bytes_received:
      Number.isFinite(numberOrInvalid(result.bytes_received))
        ? formatCopyDataBytes(Number(result.bytes_received))
        : '',
    duration:
      Number.isFinite(numberOrInvalid(result.duration_s)) ? `${String(Number(result.duration_s))}s` : '',
    stats_lines: exchangeStats.map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      const label = String(
        entry.label || entry.exchange ? (entry.label || entry.exchange) : t('market.exchange')
      );
      const files = Number.isFinite(numberOrInvalid(entry.files_transferred))
        ? formatCopyDataCount(Number(entry.files_transferred))
        : '-';
      const size = Number.isFinite(numberOrInvalid(entry.transfer_size_bytes))
        ? formatCopyDataBytes(Number(entry.transfer_size_bytes))
        : '-';
      const remote = String(entry.remote_path ?? '');
      return t('market.exchangeStatLine', { label, files, size, remote }); // :5337
    }),
  };
}

/** Legacy mergeCopyDataDryRunStats (:5342-5356) — structured values win. */
export function mergeCopyDataDryRunStats(
  primary: DryRunStats | null | undefined,
  fallback: DryRunStats | null | undefined
): Required<Pick<DryRunStats, 'remote_paths' | 'stats_lines'>> &
  Omit<DryRunStats, 'remote_paths' | 'stats_lines'> {
  const a = primary ?? {};
  const b = fallback ?? {};
  const pick = (key: 'files_total' | 'files_transferred' | 'total_size' | 'transfer_size' | 'bytes_sent' | 'bytes_received' | 'duration'): string =>
    a[key] || b[key] || '';
  return {
    remote_paths:
      Array.isArray(a.remote_paths) && a.remote_paths.length ? a.remote_paths : b.remote_paths ?? [],
    stats_lines:
      Array.isArray(a.stats_lines) && a.stats_lines.length ? a.stats_lines : b.stats_lines ?? [],
    files_total: pick('files_total'),
    files_transferred: pick('files_transferred'),
    total_size: pick('total_size'),
    transfer_size: pick('transfer_size'),
    bytes_sent: pick('bytes_sent'),
    bytes_received: pick('bytes_received'),
    duration: pick('duration'),
  };
}

const STAT_LINE_NEEDLES = [
  'Number of files:',
  'Number of regular files transferred:',
  'Total file size:',
  'Total transferred file size:',
  'Total bytes sent:',
  'Total bytes received:',
] as const;

/** Legacy parseCopyDataDryRunLog (:5358-5429) — the rsync log fallback. */
export function parseCopyDataDryRunLog(lines: unknown): {
  remote_paths: string[];
  files_total: string;
  files_transferred: string;
  total_size: string;
  transfer_size: string;
  bytes_sent: string;
  bytes_received: string;
  duration: string;
  stats_lines: string[];
} {
  const input = Array.isArray(lines) ? lines : [];
  const remotePaths: string[] = [];
  let duration = '';
  const statsLines: string[] = [];
  const totals = {
    files_total: 0,
    files_transferred: 0,
    total_size: 0,
    transfer_size: 0,
    bytes_sent: 0,
    bytes_received: 0,
  };
  const seen = {
    files_total: false,
    files_transferred: false,
    total_size: false,
    transfer_size: false,
    bytes_sent: false,
    bytes_received: false,
  };

  input.forEach((lineRaw) => {
    const line = String(lineRaw ?? '').trim();
    const remoteMatch = line.match(/\bremote=([^\s]+)/);
    if (remoteMatch && remoteMatch[1] && !remotePaths.includes(remoteMatch[1])) {
      remotePaths.push(remoteMatch[1]); // :5382-5384
    }
    const durationMatch = line.match(/\bduration=(\d+s)\b/);
    if (durationMatch) duration = durationMatch[1]!; // :5385-5386
    if (STAT_LINE_NEEDLES.some((needle) => line.includes(needle))) {
      statsLines.push(line.replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+/, '').trim()); // :5395
    }
    let parsed: number | null;
    if (line.includes('Number of regular files transferred:')) {
      parsed = parseCopyDataCount(copyDataStatValue(line, 'Number of regular files transferred'));
      if (parsed !== null) {
        totals.files_transferred += parsed;
        seen.files_transferred = true;
      }
    } else if (line.includes('Number of files:')) {
      parsed = parseCopyDataCount(copyDataStatValue(line, 'Number of files'));
      if (parsed !== null) {
        totals.files_total += parsed;
        seen.files_total = true;
      }
    } else if (line.includes('Total transferred file size:')) {
      parsed = parseCopyDataByteValue(copyDataStatValue(line, 'Total transferred file size'));
      if (parsed !== null) {
        totals.transfer_size += parsed;
        seen.transfer_size = true;
      }
    } else if (line.includes('Total file size:')) {
      parsed = parseCopyDataByteValue(copyDataStatValue(line, 'Total file size'));
      if (parsed !== null) {
        totals.total_size += parsed;
        seen.total_size = true;
      }
    } else if (line.includes('Total bytes sent:')) {
      parsed = parseCopyDataByteValue(copyDataStatValue(line, 'Total bytes sent'));
      if (parsed !== null) {
        totals.bytes_sent += parsed;
        seen.bytes_sent = true;
      }
    } else if (line.includes('Total bytes received:')) {
      parsed = parseCopyDataByteValue(copyDataStatValue(line, 'Total bytes received'));
      if (parsed !== null) {
        totals.bytes_received += parsed;
        seen.bytes_received = true;
      }
    }
  });

  return {
    remote_paths: remotePaths,
    files_total: seen.files_total ? formatCopyDataCount(totals.files_total) : '',
    files_transferred: seen.files_transferred ? formatCopyDataCount(totals.files_transferred) : '',
    total_size: seen.total_size ? formatCopyDataBytes(totals.total_size) : '',
    transfer_size: seen.transfer_size ? formatCopyDataBytes(totals.transfer_size) : '',
    bytes_sent: seen.bytes_sent ? formatCopyDataBytes(totals.bytes_sent) : '',
    bytes_received: seen.bytes_received ? formatCopyDataBytes(totals.bytes_received) : '',
    duration,
    stats_lines: statsLines,
  };
}

/** The poll's render payload (legacy renderCopyDataDryRunSummary data :5431). */
export interface DryRunSummaryData {
  result?: { job_id?: unknown; target?: unknown; destination_root?: unknown; exchanges?: unknown } | null;
  job?: DryRunJobPayload | null;
  status?: string;
  stats?: DryRunStats;
  error?: string;
}

export interface DryRunSummaryLabels {
  status: string;
  remoteRoot: string;
  exchanges: string;
  filesToTransfer: string;
  transferSize: string;
  totalSourceSize: string;
  sentReceived: string;
  duration: string;
  waitingDryRunStats: string;
  jobPrefix: string;
}

/** The summary card view model — renderCopyDataDryRunSummary's data layer
 *  (:5431-5475) without the DOM. */
export function computeDryRunSummaryView(data: DryRunSummaryData, labels: DryRunSummaryLabels): {
  jobLabel: string;
  jobId: string;
  rows: [string, string][];
  detail: string;
  error: string;
} {
  const source = data ?? {};
  const result = source.result ?? null;
  const job = source.job ?? ({} as DryRunJobPayload);
  const stats = source.stats ?? {};
  const payload =
    job.payload && typeof job.payload === 'object'
      ? (job.payload as { target?: unknown; destination_root?: unknown; exchanges?: unknown })
      : {};
  const status = String(source.status || job.status || 'queued'); // :5439
  const target = String(result?.target || payload.target || '');
  const root = String(result?.destination_root || payload.destination_root || '');
  const exchangesRaw = result?.exchanges || payload.exchanges || [];
  const exchanges = Array.isArray(exchangesRaw) ? exchangesRaw : [];
  const targetRoot = target && root ? `${target}:${root}` : root || target || '-'; // :5444
  const rows: [string, string][] = [
    [labels.status, status],
    [labels.remoteRoot, targetRoot],
    [labels.exchanges, exchanges.length ? exchanges.join(', ') : '-'],
    [labels.filesToTransfer, stats.files_transferred || '-'],
    [labels.transferSize, stats.transfer_size || '-'],
    [labels.totalSourceSize, stats.total_size || '-'],
    [labels.sentReceived, `${stats.bytes_sent || '-'} / ${stats.bytes_received || '-'}`],
    [labels.duration, stats.duration || '-'],
  ];
  const remotePaths =
    Array.isArray(stats.remote_paths) && stats.remote_paths.length
      ? stats.remote_paths.join('\n')
      : '';
  const statsText =
    Array.isArray(stats.stats_lines) && stats.stats_lines.length
      ? stats.stats_lines.join('\n')
      : '';
  let detail = source.error || remotePaths || statsText || labels.waitingDryRunStats; // :5457
  if (remotePaths && statsText) detail = `${remotePaths}\n\n${statsText}`; // :5458
  return {
    jobLabel: labels.jobPrefix,
    jobId: String(result?.job_id || job.id || ''),
    rows,
    detail,
    error: source.error ?? '',
  };
}
