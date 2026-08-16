import { formatUsageBytes } from './tradfiFormat';

/*
 * Tiingo usage model — the numeric slice of legacy renderTiingoUsage
 * (market_data_main.html:5676-5723): Number(x || 0) counter coercion,
 * ratio clamping (:5693-5695) and the 429-wait flag (:5696-5700).
 * Rendering (cards, callout) lives in UsagePanel.vue.
 */

/** GET /settings/{hyperliquid} settings.tiingo_usage shape (all optional). */
export interface TiingoUsage {
  hour_requests?: unknown;
  hour_limit?: unknown;
  hour_remaining?: unknown;
  day_requests?: unknown;
  day_limit?: unknown;
  day_remaining?: unknown;
  month_bytes?: unknown;
  month_bytes_limit?: unknown;
  month_bytes_remaining?: unknown;
  server_429_wait_remaining_s?: unknown;
}

/** One requests-counted slot (hour / day). */
export interface UsageCounterSlot {
  used: number;
  limit: number;
  remaining: number;
  ratio: number;
}

/** The month bandwidth slot — counters plus formatted byte strings. */
export interface UsageByteSlot extends UsageCounterSlot {
  usedText: string;
  limitText: string;
  remainingText: string;
}

export interface TiingoUsageModel {
  hour: UsageCounterSlot;
  day: UsageCounterSlot;
  month: UsageByteSlot;
  /** Server-side 429 cooldown in seconds (:5692). */
  waitRemainingSeconds: number;
  /** True while the wait is active — drives the warning callout (:5696). */
  isExceeded: boolean;
}

/** Legacy Number(usage.x || 0) (:5683-5692). */
function counter(value: unknown): number {
  return Number(value || 0);
}

/** Legacy ratio clamp (:5693-5695). */
function ratioOf(used: number, limit: number): number {
  return limit > 0 ? Math.max(0, Math.min(1, used / limit)) : 0;
}

/** renderTiingoUsage numeric model (:5683-5700). */
export function toTiingoUsageModel(usage: TiingoUsage | null | undefined): TiingoUsageModel {
  const source: TiingoUsage = usage ?? {};
  const hourUsed = counter(source.hour_requests);
  const hourLimit = counter(source.hour_limit);
  const dayUsed = counter(source.day_requests);
  const dayLimit = counter(source.day_limit);
  const monthUsed = counter(source.month_bytes);
  const monthLimit = counter(source.month_bytes_limit);
  const waitRemainingSeconds = counter(source.server_429_wait_remaining_s);
  return {
    hour: {
      used: hourUsed,
      limit: hourLimit,
      remaining: counter(source.hour_remaining),
      ratio: ratioOf(hourUsed, hourLimit),
    },
    day: {
      used: dayUsed,
      limit: dayLimit,
      remaining: counter(source.day_remaining),
      ratio: ratioOf(dayUsed, dayLimit),
    },
    month: {
      used: monthUsed,
      limit: monthLimit,
      remaining: counter(source.month_bytes_remaining),
      ratio: ratioOf(monthUsed, monthLimit),
      usedText: formatUsageBytes(monthUsed),
      limitText: formatUsageBytes(monthLimit),
      remainingText: formatUsageBytes(counter(source.month_bytes_remaining)),
    },
    waitRemainingSeconds,
    isExceeded: waitRemainingSeconds > 0,
  };
}
