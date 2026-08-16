/**
 * Price formatting ported verbatim from balance_calc.html fmtPrice (:499-503)
 * — a plain (non-currency) number formatter for the coin-info table.
 */

export function fmtPrice(p: unknown): string {
  const num = Number(p);
  if (!isFinite(num)) return String(p);
  if (num >= 1) return num.toFixed(2);
  if (num >= 0.01) return num.toFixed(4);
  return num.toFixed(8);
}

/** Instance option label (:303) — '[PB8] name' / '[PB7] name'. */
export function instanceLabel(inst: { name: string; version: string }): string {
  return `[${inst.version === 'v8' ? 'PB8' : 'PB7'}] ${inst.name}`;
}
