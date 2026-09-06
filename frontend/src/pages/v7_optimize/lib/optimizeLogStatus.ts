/**
 * Pure formatters for the queue log dialog's optimize status dashboard.
 *
 * Ported 1:1 from the legacy optimize page (frontend/v7_optimize.html on
 * main, renderOptimizeLogDashboard + its helpers at :5349-5470) so the Vue
 * dialog shows the same numbers the floating legacy panel did. The status
 * payload comes from GET /queue/{filename}/status (api/optimize_v7.py:3098,
 * api/optimize_v8.py:4484); v7 and v8 share the shape.
 *
 * Technical progress tokens ("evals", "exact", "proxy", "·", "/") stay in
 * English on purpose — the queue table's progressLabel() renders the same
 * vocabulary, so switching these to i18n would fork the two surfaces.
 */

/** Loose view of GET /queue/{filename}/status — fields read defensively. */
export interface OptimizeLogStatus {
  name?: string | null;
  phase?: string | null;
  status?: string | null;
  [key: string]: unknown;
}

type Dict = Record<string, unknown>;

function dict(value: unknown): Dict {
  return value && typeof value === 'object' ? (value as Dict) : {};
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toLocale(value: number): string {
  return value.toLocaleString();
}

/** Legacy formatBytesCompact — 'B', 'KB', 'MB', …; '-' when unusable. */
export function formatBytesCompact(value: unknown): string {
  let bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index += 1;
  }
  const digits = bytes >= 10 || index === 0 ? 0 : 1;
  return `${bytes.toFixed(digits)} ${units[index]}`;
}

/** Legacy formatDurationCompact — '1h 2m' / '3m 4s' / '5s'; '-' when unusable. */
export function formatDurationCompact(seconds: unknown): string {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return '-';
  const whole = Math.floor(total);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

/** Legacy formatRelativeTime minus the ' ago' suffix — the caller i18n-izes it. */
export function formatRelativeDuration(isoText: unknown): string {
  const text = String(isoText || '');
  if (!text) return '';
  const ts = new Date(text);
  if (Number.isNaN(ts.getTime())) return '';
  const delta = Math.max(0, Math.floor((Date.now() - ts.getTime()) / 1000));
  return formatDurationCompact(delta);
}

/** Legacy formatMetricPairs — 'key=1.234 | key2=5.678' (4 pairs, 4 sig digits). */
export function formatMetricPairs(metricMap: unknown): string {
  const map = dict(metricMap);
  const keys = Object.keys(map);
  if (!keys.length) return '-';
  return keys
    .slice(0, 4)
    .map((key) => {
      const value = num(map[key]);
      return `${key}=${value === null ? 'n/a' : value.toPrecision(4)}`;
    })
    .join(' | ');
}

/** Legacy formatRangePairs — 'key 1.234..5.678' (4 pairs, 4 sig digits). */
export function formatRangePairs(rangeMap: unknown): string {
  const map = dict(rangeMap);
  const keys = Object.keys(map);
  if (!keys.length) return '-';
  return keys
    .slice(0, 4)
    .map((key) => {
      const entry = dict(map[key]);
      const min = num(entry.min);
      const max = num(entry.max);
      return `${key} ${min === null ? 'n/a' : min.toPrecision(4)}..${max === null ? 'n/a' : max.toPrecision(4)}`;
    })
    .join(' | ');
}

/** Phase → v7optimize.phase* i18n key (legacy optimizePhaseLabel label map). */
export function phaseLabelKey(phase: unknown): string {
  const normalized = String(phase || '').trim().toLowerCase();
  const keys: Record<string, string> = {
    queued: 'v7optimize.phaseQueued',
    initializing: 'v7optimize.phaseInitializing',
    evaluating_starts: 'v7optimize.phaseEvaluatingStarts',
    running: 'v7optimize.phaseRunning',
    optimizing: 'v7optimize.phaseOptimizing',
    complete: 'v7optimize.phaseComplete',
    error: 'v7optimize.phaseError',
  };
  return keys[normalized] || '';
}

/** Progress bar fill 0-100 (null → 0%), same clamp as the legacy panel. */
export function progressPercent(status: OptimizeLogStatus | null): number {
  const percent = num(dict(dict(status).progress).percent);
  return percent === null ? 0 : Math.max(0, Math.min(100, percent));
}

/** Legacy progress meta text: evals (cpu) or exact/proxy/inflight (gpu), with
 *  target, percent and history-counting suffixes. */
export function progressLabel(status: OptimizeLogStatus | null): string {
  if (!status) return 'v7optimize.logWaitingStatus';
  const progress = dict(status.progress);
  const runtime = dict(status.runtime);
  const percent = num(progress.percent);
  const scan = dict(progress.evaluation_scan);
  let text =
    progress.eval == null
      ? 'Waiting for evaluations...'
      : `${progress.estimated ? '≥ ' : ''}${toLocale(Number(progress.eval))} evals`;
  if (runtime.backend === 'gpu' && progress.exact_evaluations != null) {
    const bits = [
      `${toLocale(Number(progress.exact_evaluations))}${
        progress.target_exact_evaluations != null ? ` / ${toLocale(Number(progress.target_exact_evaluations))}` : ''
      } exact`,
    ];
    if (progress.generation != null) bits.push(`gen ${toLocale(Number(progress.generation))}`);
    if (progress.proxy_evaluations != null) bits.push(`${toLocale(Number(progress.proxy_evaluations))} proxy`);
    if (progress.exact_inflight != null) bits.push(`${toLocale(Number(progress.exact_inflight))} inflight`);
    text = bits.join(' · ');
    if (percent !== null) text += ` (${percent.toFixed(1)}%)`;
  } else if (progress.target_iters != null && progress.eval != null) {
    text = `${progress.estimated ? '≥ ' : ''}${toLocale(Number(progress.eval))} / ${toLocale(
      Number(progress.target_iters),
    )} evals`;
    if (percent !== null) text += ` (${percent.toFixed(1)}%)`;
  }
  if (scan.complete === false) text += ` · counting history ${Number(scan.percent || 0).toFixed(1)}%`;
  return text;
}

/** Pareto card value: front size plus (+added/-removed) when reported. */
export function paretoSummary(status: OptimizeLogStatus | null): string {
  if (!status) return '-';
  const progress = dict(status.progress);
  if (progress.front == null) return '-';
  let value = String(progress.front);
  if (progress.pareto_added != null || progress.pareto_removed != null) {
    value += ` (${progress.pareto_added == null ? '?' : `+${progress.pareto_added}`}/${
      progress.pareto_removed == null ? '?' : `-${progress.pareto_removed}`
    })`;
  }
  return value;
}

/** Backend card value: backend / algorithm / N obj / n_cpus N. */
export function backendSummary(status: OptimizeLogStatus | null): string {
  if (!status) return '-';
  const runtime = dict(status.runtime);
  const bits: string[] = [];
  if (runtime.backend) bits.push(String(runtime.backend));
  if (runtime.algorithm) bits.push(String(runtime.algorithm));
  const objectives = num(runtime.objective_count);
  if (objectives !== null) bits.push(`${toLocale(objectives)} obj`);
  const cpus = num(runtime.config_n_cpus);
  if (cpus !== null) bits.push(`n_cpus ${toLocale(cpus)}`);
  return bits.join(' / ') || '-';
}

/** Elapsed since process.started_at, recomputed each render (legacy did the same). */
export function elapsedSeconds(status: OptimizeLogStatus | null): number | null {
  if (!status) return null;
  const startedAt = String(dict(status.process).started_at || '');
  if (!startedAt) return null;
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000));
}

/** CPU card value: configured core count wins, system average as fallback. */
export function cpuSummary(status: OptimizeLogStatus | null): string {
  if (!status) return '-';
  const runtime = dict(status.runtime);
  const system = dict(status.system);
  const bits: string[] = [];
  const cpus = num(runtime.config_n_cpus);
  if (cpus !== null) bits.push(`${toLocale(cpus)} configured`);
  if (!bits.length) {
    const percent = num(system.cpu_percent);
    if (percent !== null) bits.push(`${percent.toFixed(1)}% system`);
  }
  return bits.join(' · ') || '-';
}

/** Memory card value: percent plus used/total bytes. */
export function memorySummary(status: OptimizeLogStatus | null): string {
  if (!status) return '-';
  const system = dict(status.system);
  const bits: string[] = [];
  const percent = num(system.memory_percent);
  if (percent !== null) bits.push(`${percent.toFixed(1)}%`);
  const used = num(system.memory_used_bytes);
  const total = num(system.memory_total_bytes);
  if (used !== null && total !== null) bits.push(`${formatBytesCompact(used)} / ${formatBytesCompact(total)}`);
  return bits.join(' · ') || '-';
}

/** Queue card values ({running} run · {queued} queued · {error} err) — the
 *  caller assembles them through the v7optimize.logQueueSummary i18n key. */
export function queueTotals(status: OptimizeLogStatus | null): { running: number; queued: number; error: number } {
  const queue = dict(dict(status).queue);
  return { running: Number(queue.running || 0), queued: Number(queue.queued || 0), error: Number(queue.error || 0) };
}

/** Legacy buildUsageBar — '#'/'.' meter used inside the CPU tooltip. */
function usageBar(percent: number | null, width: number): string {
  const size = Math.max(1, width);
  const value = percent === null ? null : Math.max(0, Math.min(100, percent));
  const filled = value === null ? 0 : Math.round((value / 100) * size);
  return `[${'#'.repeat(filled)}${'.'.repeat(Math.max(0, size - filled))}]`;
}

function pad(text: string, width: number): string {
  const raw = String(text || '');
  return raw.length >= width ? raw : raw + ' '.repeat(width - raw.length);
}

function cpuTooltipCell(index: number, percent: unknown): string {
  const value = num(percent);
  const pctText = value === null ? '--.-%' : pad(`${value.toFixed(1)}%`, 6);
  return `${pad(`CPU${index}`, 5)} ${usageBar(value, 10)} ${pctText}`;
}

function usageTooltipLine(label: string, percent: unknown, usedBytes: unknown, totalBytes: unknown): string {
  const value = num(percent);
  const pieces = [pad(label, 5), usageBar(value, 10)];
  const used = num(usedBytes);
  const total = num(totalBytes);
  if (used !== null && total !== null && total > 0) pieces.push(`${formatBytesCompact(used)} / ${formatBytesCompact(total)}`);
  if (value !== null) pieces.push(`(${value.toFixed(1)}%)`);
  return pieces.join(' ');
}

/** Legacy buildOptimizeCpuTooltip — per-core meters + memory/swap/load lines
 *  for the CPU card's title attribute. Empty string → no tooltip. */
export function cpuTooltip(status: OptimizeLogStatus | null): string {
  if (!status) return '';
  const system = dict(status.system);
  const runtime = dict(status.runtime);
  const lines: string[] = [];
  const perCore = Array.isArray(system.cpu_per_core) ? system.cpu_per_core : [];
  if (perCore.length) {
    for (let index = 0; index < perCore.length; index += 2) {
      const row = [cpuTooltipCell(index, perCore[index])];
      if (index + 1 < perCore.length) row.push(cpuTooltipCell(index + 1, perCore[index + 1]));
      lines.push(row.join('  '));
    }
  } else if (system.cpu_percent != null) {
    lines.push(usageTooltipLine('CPU', system.cpu_percent, null, null));
  }
  const memUsed = num(system.memory_used_bytes);
  const memTotal = num(system.memory_total_bytes);
  if (memUsed !== null && memTotal !== null && memTotal > 0) {
    lines.push(usageTooltipLine('Mem', system.memory_percent, memUsed, memTotal));
  }
  const swapTotal = num(system.swap_total_bytes);
  if (swapTotal !== null && swapTotal > 0) {
    const swapUsed = num(system.swap_used_bytes);
    const swapPercent = swapUsed !== null && swapTotal > 0 ? (swapUsed / swapTotal) * 100 : null;
    lines.push(usageTooltipLine('Swp', swapPercent, system.swap_used_bytes, system.swap_total_bytes));
  }
  if (Array.isArray(system.load_avg) && system.load_avg.length) lines.push(`Load avg: ${system.load_avg.join(' ')}`);
  const cpus = num(runtime.config_n_cpus);
  if (cpus !== null) lines.push(`Optimizer: ${toLocale(cpus)} configured`);
  return lines.join('\n');
}

/** Which log freshness timestamp to show (log.updated_at wins, runtime fallback). */
export function logUpdatedAt(status: OptimizeLogStatus | null): string {
  if (!status) return '';
  const log = dict(status.log);
  return String(log.updated_at || dict(status.runtime).last_log_at || '');
}

/** Last log line / last error strings ('-' when absent), for the detail rows. */
export function logActivity(status: OptimizeLogStatus | null): string {
  if (!status) return '-';
  return String(dict(status.log).last_line || '-');
}

export function logError(status: OptimizeLogStatus | null): string {
  if (!status) return '-';
  return String(dict(status.log).last_error || '-');
}
