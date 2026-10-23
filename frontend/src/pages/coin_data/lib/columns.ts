/**
 * Column matrices for the three symbol tables — the colgroups and header
 * definitions of the legacy panels (coin_data.html :1537-1543 unmatched,
 * :1570-1583 main, :1623-1632 hip3). Shared by SymbolTable.vue.
 */

import type { TableViewName } from '../types';

export interface ColumnDef {
  key: string;
  /** i18n label key; '' → raw key text (vol/mcap header, legacy :1595). */
  labelKey: string;
  width: string;
  /**
   * Smallest width (px) at which the header, its padding and the sort icon fit
   * without ellipsis. Measured per column in English and Chinese. With a pure
   * percentage `table-fixed` layout every column shrinks together, so below
   * ~1500px the short labels (Coin, Rank, CPT, Quote) were clipped to "Co…",
   * "R..". The colgroup uses max(minWidth, width) instead, and the wrapper
   * scrolls horizontally when the floors no longer fit.
   */
  minWidth?: number;
  /** Cell renderer kind; default renders the raw field value. */
  render?: 'cpt' | 'rank' | 'price' | 'compact' | 'ratio' | 'tags' | 'notice';
  mono?: boolean;
  numeric?: boolean;
  centered?: boolean;
}

export const MAIN_COLUMNS: ColumnDef[] = [
  { key: 'coin', labelKey: 'market.coin', width: '6.34%', minWidth: 86 },
  { key: 'ccxt_symbol', labelKey: 'market.ccxtSymbol', width: '10.47%', minWidth: 142, mono: true },
  { key: 'base', labelKey: 'market.base', width: '7.08%', minWidth: 96 },
  { key: 'quote', labelKey: 'market.quote', width: '7.08%', minWidth: 96 },
  { key: 'copy_trading', labelKey: 'market.cpt', width: '6.12%', minWidth: 83, render: 'cpt', centered: true },
  { key: 'cmc_rank', labelKey: 'market.rank', width: '6.56%', minWidth: 89, render: 'rank', numeric: true },
  { key: 'price', labelKey: 'market.price', width: '6.71%', minWidth: 91, render: 'price', numeric: true },
  { key: 'market_cap', labelKey: 'market.marketCapLabel', width: '9.66%', minWidth: 131, render: 'compact', numeric: true },
  { key: 'volume_24h', labelKey: 'market.volume24h', width: '10.47%', minWidth: 142, render: 'compact', numeric: true },
  { key: 'vol_mcap', labelKey: '', width: '8.85%', minWidth: 120, render: 'ratio', numeric: true },
  { key: 'tags', labelKey: 'market.tags', width: '13.29%', minWidth: 180, render: 'tags' },
  { key: 'notice', labelKey: 'market.notice', width: '7.37%', minWidth: 100, render: 'notice' },
];

export const UNMATCHED_COLUMNS: ColumnDef[] = [
  { key: 'coin', labelKey: 'market.coin', width: '18%' },
  { key: 'symbol', labelKey: 'market.symbol', width: '18%', mono: true },
  { key: 'base', labelKey: 'market.base', width: '16%' },
  { key: 'quote', labelKey: 'market.quote', width: '12%' },
  { key: 'ccxt_symbol', labelKey: 'market.ccxtSymbol', width: '36%', mono: true },
];

export const HIP3_COLUMNS: ColumnDef[] = [
  { key: 'dex', labelKey: 'market.dex', width: '10%' },
  { key: 'coin', labelKey: 'market.coin', width: '12%' },
  { key: 'ccxt_symbol', labelKey: 'market.ccxtSymbol', width: '18%', mono: true },
  { key: 'quote', labelKey: 'market.quote', width: '10%' },
  { key: 'price', labelKey: 'market.price', width: '12%', render: 'price', numeric: true },
  { key: 'volume_24h', labelKey: 'market.volume24h', width: '14%', render: 'compact', numeric: true },
  { key: 'copy_trading', labelKey: 'market.cpt', width: '8%', render: 'cpt', centered: true },
  { key: 'notice', labelKey: 'market.notice', width: '16%', render: 'notice' },
];

export function columnsForTable(table: TableViewName): ColumnDef[] {
  if (table === 'main') return MAIN_COLUMNS;
  if (table === 'unmatched') return UNMATCHED_COLUMNS;
  return HIP3_COLUMNS;
}
