import type { VastCounterSample, VastHostProfile, VastOffer, VastPerformanceRun } from './vastTypes';

export interface VastChartPoint {
  minutes: number;
  rate: number;
  seconds: number;
}

export function isOfferCompatible(offer: VastOffer, rentalHours: number): boolean {
  if (offer.cuda_max_good !== undefined && Number(offer.cuda_max_good) < 13) return false;
  if (offer.duration_seconds !== undefined && Number(offer.duration_seconds) < rentalHours * 3600) return false;
  return true;
}

export function hostStatusParts(profile: VastHostProfile): string[] {
  return [
    profile.used ? 'Previously used' : 'No recorded use',
    profile.working ? 'Working' : '',
    profile.preferred ? 'Preferred' : '',
  ].filter(Boolean);
}

export function canComparePerformanceRuns(runs: VastPerformanceRun[]): boolean {
  if (runs.length < 2 || runs.length > 4) return false;
  if (new Set(runs.map((run) => run.id)).size !== runs.length) return false;
  const fingerprints = new Set(runs.map((run) => run.fingerprint).filter(Boolean));
  return fingerprints.size === 1 && runs.every((run) => Boolean(run.fingerprint));
}

export function buildChartSeries(
  samples: VastCounterSample[],
  key: 'proxy_total' | 'exact_total',
): Array<VastChartPoint | null> {
  const firstStamp = samples[0]?.sampled_at;
  if (firstStamp === undefined) return [];
  return samples.slice(1).map((sample, index) => {
    const previous = samples[index]!;
    const seconds = sample.sampled_at - previous.sampled_at;
    const delta = sample[key] - previous[key];
    if (seconds < 10 || delta < 0) return null;
    return {
      minutes: (sample.sampled_at - firstStamp) / 60,
      rate: 60 * delta / seconds,
      seconds,
    };
  });
}

export function progressPercent(completed: unknown, total: unknown): number | null {
  const completedValue = Number(completed);
  const totalValue = Number(total);
  if (!Number.isFinite(completedValue) || !Number.isFinite(totalValue) || totalValue <= 0) return null;
  return Math.max(0, Math.min(100, 100 * completedValue / totalValue));
}

function formatPosition(value: unknown, exposure: unknown): string {
  const position = Number(value);
  const walletExposure = Number(exposure);
  if (position === 0 || walletExposure === 0) return '-';
  return Number.isFinite(position) ? position.toFixed(0) : '-';
}

export function formatPositionPair(
  longPositions: unknown,
  shortPositions: unknown,
  longExposure: unknown,
  shortExposure: unknown,
): string {
  return `${formatPosition(longPositions, longExposure)} / ${formatPosition(shortPositions, shortExposure)}`;
}

export function formatMetric(value: unknown, digits = 1): string {
  const metric = Number(value);
  return Number.isFinite(metric) ? metric.toLocaleString('en-US', { maximumFractionDigits: digits }) : '-';
}

export function formatMoney(value: unknown, digits = 3): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(digits)}` : '-';
}
