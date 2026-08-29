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
  /** Cell renderer kind; default renders the raw field value. */
  render?: 'cpt' | 'rank' | 'price' | 'compact' | 'ratio' | 'tags' | 'notice';
  mono?: boolean;
  numeric?: boolean;
  centered?: boolean;
}

export const MAIN_COLUMNS: ColumnDef[] = [
  { key: 'coin', labelKey: 'market.coin', width: '6%' },
  { key: 'ccxt_symbol', labelKey: 'market.ccxtSymbol', width: '12%', mono: true },
  { key: 'base', labelKey: 'market.base', width: '6%' },
  { key: 'quote', labelKey: 'market.quote', width: '6%' },
  { key: 'copy_trading', labelKey: 'market.cpt', width: '5%', render: 'cpt', centered: true },
  { key: 'cmc_rank', labelKey: 'market.rank', width: '5%', render: 'rank', numeric: true },
  { key: 'price', labelKey: 'market.price', width: '8%', render: 'price', numeric: true },
  { key: 'market_cap', labelKey: 'market.marketCapLabel', width: '9%', render: 'compact', numeric: true },
  { key: 'volume_24h', labelKey: 'market.volume24h', width: '9%', render: 'compact', numeric: true },
  { key: 'vol_mcap', labelKey: '', width: '8%', render: 'ratio', numeric: true },
  { key: 'tags', labelKey: 'market.tags', width: '18%', render: 'tags' },
  { key: 'notice', labelKey: 'market.notice', width: '8%', render: 'notice' },
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
