import { describe, expect, it } from 'vitest';
import {
  backendSummary,
  cpuTooltip,
  formatBytesCompact,
  formatDurationCompact,
  formatMetricPairs,
  formatRangePairs,
  formatRelativeDuration,
  phaseLabelKey,
  progressLabel,
} from './optimizeLogStatus';

describe('formatBytesCompact', () => {
  it('formats byte units with the legacy thresholds', () => {
    expect(formatBytesCompact(0)).toBe('-');
    expect(formatBytesCompact(-5)).toBe('-');
    expect(formatBytesCompact(512)).toBe('512 B');
    expect(formatBytesCompact(2048)).toBe('2.0 KB');
    expect(formatBytesCompact(15 * 1024 * 1024)).toBe('15 MB');
    expect(formatBytesCompact(2 * 1024 ** 4)).toBe('2.0 TB');
  });
});

describe('formatDurationCompact', () => {
  it('compacts durations to h/m/s pairs', () => {
    expect(formatDurationCompact(null)).toBe('-');
    expect(formatDurationCompact(0)).toBe('-');
    expect(formatDurationCompact(5)).toBe('5s');
    expect(formatDurationCompact(65)).toBe('1m 5s');
    expect(formatDurationCompact(3661)).toBe('1h 1m');
  });
});

describe('formatRelativeDuration', () => {
  it('returns empty for unusable timestamps', () => {
    expect(formatRelativeDuration('')).toBe('');
    expect(formatRelativeDuration('not-a-date')).toBe('');
  });

  it('returns the age of fresh timestamps', () => {
    const iso = new Date(Date.now() - 90_000).toISOString();
    expect(formatRelativeDuration(iso)).toBe('1m 30s');
  });
});

describe('formatMetricPairs / formatRangePairs', () => {
  it('formats up to four pairs at 4 significant digits', () => {
    expect(formatMetricPairs({})).toBe('-');
    expect(formatMetricPairs({ sharpe: 1.23456 })).toBe('sharpe=1.235');
    expect(formatMetricPairs({ a: 'x', b: 2 })).toBe('a=n/a | b=2.000');
    expect(formatRangePairs({ roi: { min: 0.1, max: 2.5 } })).toBe('roi 0.1000..2.500');
    expect(formatRangePairs({ roi: { min: null } })).toBe('roi n/a..n/a');
  });
});

describe('phaseLabelKey', () => {
  it('maps legacy phase names onto v7optimize.phase* keys', () => {
    expect(phaseLabelKey('running')).toBe('v7optimize.phaseRunning');
    expect(phaseLabelKey('Evaluating_Starts')).toBe('v7optimize.phaseEvaluatingStarts');
    expect(phaseLabelKey('complete')).toBe('v7optimize.phaseComplete');
    expect(phaseLabelKey('mystery')).toBe('');
    expect(phaseLabelKey(null)).toBe('');
  });
});

describe('progressLabel', () => {
  it('waits without a status', () => {
    expect(progressLabel(null)).toBe('v7optimize.logWaitingStatus');
  });

  it('counts plain and estimated evals', () => {
    expect(progressLabel({ progress: { eval: 42 } })).toBe('42 evals');
    expect(progressLabel({ progress: { eval: 42, estimated: true } })).toBe('≥ 42 evals');
    expect(progressLabel({ progress: {} })).toBe('Waiting for evaluations...');
  });

  it('adds target, percent and history-scan suffixes', () => {
    expect(progressLabel({ progress: { eval: 1200, target_iters: 5000, percent: 24.04 } })).toBe('1,200 / 5,000 evals (24.0%)');
    expect(progressLabel({ progress: { eval: 120, evaluation_scan: { complete: false, percent: 33.333 } } })).toBe('120 evals · counting history 33.3%');
  });

  it('switches to the gpu exact/proxy wording', () => {
    expect(
      progressLabel({
        progress: { eval: 900, exact_evaluations: 120, target_exact_evaluations: 500, generation: 12, proxy_evaluations: 780, exact_inflight: 4, percent: 24.04 },
        runtime: { backend: 'gpu' },
      }),
    ).toBe('120 / 500 exact · gen 12 · 780 proxy · 4 inflight (24.0%)');
  });
});

describe('backendSummary', () => {
  it('joins backend, algorithm, objectives and cpu config', () => {
    expect(backendSummary(null)).toBe('-');
    expect(backendSummary({ runtime: {} })).toBe('-');
    expect(backendSummary({ runtime: { backend: 'cpu', algorithm: 'nsga2', objective_count: 2, config_n_cpus: 8 } })).toBe('cpu / nsga2 / 2 obj / n_cpus 8');
  });
});

describe('cpuTooltip', () => {
  it('builds per-core meters and memory lines like the legacy tooltip', () => {
    const tip = cpuTooltip({
      system: {
        cpu_per_core: [10.25, 20.5, 30.75, 40.0],
        memory_percent: 61.2,
        memory_used_bytes: 1024,
        memory_total_bytes: 2048,
        load_avg: [0.5, 0.75, 1.0],
      },
      runtime: { config_n_cpus: 8 },
    });
    const lines = tip.split('\n');
    expect(lines[0]).toContain('CPU0');
    expect(lines[0]).toContain('CPU1');
    expect(lines[1]).toContain('CPU2');
    expect(lines[2]).toContain('Mem');
    expect(lines[3]).toBe('Load avg: 0.5 0.75 1');
    expect(lines[4]).toBe('Optimizer: 8 configured');
  });

  it('is empty without a status', () => {
    expect(cpuTooltip(null)).toBe('');
  });
});
