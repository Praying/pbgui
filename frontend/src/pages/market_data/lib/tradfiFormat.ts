/*
 * TradFi display formatters — legacy market_data_main.html:
 *
 *   formatUsageBytes       :5643-5653  usage-card byte formatter (the
 *                                      toFixed(≥10||0 : 1) variant — NOT
 *                                      fmtBytes :4957 used elsewhere)
 *   formatTradfiPrice      :5655-5658  4-decimal price or '-'
 *   formatTradfiTimestamp  :5660-5664  ISO → 'YYYY-MM-DD hh:mm:ss'
 *   formatDurationCompact  :5666-5674  429-wait '25h 1m' style
 */

/** Legacy formatBytes (:5643) — usage-card variant. */
export function formatUsageBytes(bytes: unknown): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let scaled = value;
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  const unit = units[index] ?? 'B';
  return `${scaled.toFixed(scaled >= 10 || index === 0 ? 0 : 1)} ${unit}`;
}

/** Legacy formatTradfiPrice (:5655). */
export function formatTradfiPrice(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(4) : '-';
}

/** Legacy formatTradfiTimestamp (:5660). */
export function formatTradfiTimestamp(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length >= 19 ? text.replace('T', ' ').slice(0, 19) : text;
}

/** Legacy formatDurationCompact (:5666). */
export function formatDurationCompact(totalSeconds: unknown): string {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0)); // :5667 || catches NaN
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
