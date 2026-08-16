/** Legacy fmtBytes verbatim (:4957-4967). */
export function fmtBytes(value: unknown): string {
  const size = Number(value ?? 0);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let scaled = size;
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  const unit = units[index] ?? 'B'; // index is clamped, this satisfies noUncheckedIndexedAccess
  return index === 0 ? `${String(Math.round(scaled))} ${unit}` : `${scaled.toFixed(2)} ${unit}`;
}
