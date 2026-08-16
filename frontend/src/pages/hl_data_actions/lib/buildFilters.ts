/**
 * Coin-picker filtering — the port of hl_data_actions.html getBuildVisibleCoins
 * (:1193-1202) and getDownloadVisibleCoins (:1102-1107). Pure so the tradfi /
 * no-local-data / text-filter combination is directly testable (the contract
 * tests/ui/test_hl_data_actions_frontend.py extracted from the legacy HTML).
 */

/** A TradFi coin is XYZ:-prefixed, case-insensitive (:1196-1197). */
export function isTradfiCoin(coin: string): boolean {
  const upper = String(coin || '').toUpperCase();
  return upper.indexOf('XYZ:') === 0 || upper.indexOf('XYZ-') === 0;
}

export interface BuildFilterState {
  coins: string[];
  coinsWithDownloadedHistory: ReadonlySet<string>;
  filter: string;
  tradfiOnly: boolean;
  noLocalData: boolean;
}

/**
 * getBuildVisibleCoins (:1193-1202) — tradfi-only keeps XYZ coins,
 * no-local-data drops coins that already have downloaded history, the text
 * filter matches case-insensitively; all three compose.
 */
export function buildVisibleCoins(state: BuildFilterState): string[] {
  const filter = String(state.filter || '').toLowerCase();
  return state.coins.filter((coin) => {
    const isTradfi = isTradfiCoin(coin);
    if (state.tradfiOnly && !isTradfi) return false;
    if (state.noLocalData && state.coinsWithDownloadedHistory.has(coin)) return false;
    return !filter || coin.toLowerCase().indexOf(filter) >= 0;
  });
}

/** getDownloadVisibleCoins (:1102-1107) — text filter only. */
export function downloadVisibleCoins(coins: string[], filter: string): string[] {
  const needle = String(filter || '').toLowerCase();
  return coins.filter((coin) => !needle || coin.toLowerCase().indexOf(needle) >= 0);
}

/** Picker ordering (:1164-1169) — selected first, then locale. */
export function sortPickerCoins(coins: string[], selected: ReadonlySet<string>): string[] {
  return coins.slice().sort((left, right) => {
    const leftRank = selected.has(left) ? 0 : 1;
    const rightRank = selected.has(right) ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });
}

/**
 * Queue payload coins rule (:1562, :1579) — empty or full selection means All.
 */
export function queueCoinsParam(selected: ReadonlySet<string>, allCoins: string[]): string[] {
  return selected.size === 0 || selected.size === allCoins.length ? ['All'] : Array.from(selected);
}
