import type { BacktestVersion } from '../types';
import { getSideValue } from './sideValues';

/**
 * Backtest editor form model — the field seeding of showConfigEditor
 * (:2599-2893) and cfgSyncEditorFromParsed (:3345-3427). Values are kept
 * as display strings exactly like the legacy inputs so collect
 * (lib/backtestCollect.ts) can run the same parseFloat ladders.
 */

export interface ExtraBtField {
  readonly key: string;
  readonly kind: 'boolean' | 'number' | 'json' | 'null' | 'string';
  /** Input text; booleans use `checked` instead. */
  text: string;
  checked: boolean;
}

export interface BacktestFormState {
  name: string;
  exchanges: string[];
  startDate: string;
  endDate: string;
  /** dataset.semanticValue === 'now' (:2919) — collected back as 'now'. */
  endDateIsNow: boolean;
  startingBalance: string;
  balanceSampleDivider: string;
  btcCollateralCap: string;
  btcCollateralLtvCap: string;
  minimumCoinAgeDays: string;
  liquidationThreshold: string;
  dynamicWelByTradability: boolean;
  makerFeeEnabled: boolean;
  makerFeeVal: string;
  takerFeeEnabled: boolean;
  takerFeeVal: string;
  marketOrderSlippagePct: string;
  filterByMinEffectiveCost: boolean;
  hslSignalMode: string;
  loggingLevel: string;
  ohlcvSourceDir: string;
  candleIntervalMinutes: string;
  gapToleranceOhlcvsMinutes: string;
  compressCache: boolean;
  volumeNormalization: boolean;
  coinSources: Record<string, string>;
  marketSettingsSources: Record<string, string>;
  marketCap: string;
  volMcap: string;
  tags: string[];
  onlyCpt: boolean;
  noticesIgnore: boolean;
  approvedLong: string[];
  approvedShort: string[];
  ignoredLong: string[];
  ignoredShort: string[];
  botLongJson: string;
  botShortJson: string;
  longTwe: string;
  longNpos: string;
  shortTwe: string;
  shortNpos: string;
  extraBt: ExtraBtField[];
  rawJson: string;
}

export interface BacktestFormOptions {
  readonly isV8: boolean;
  /** settings.hsl_signal_modes (:4475). */
  readonly hslModes: readonly string[];
  /** settings.exchange_options — v8 exchange whitelist (:4495). */
  readonly exchangeOptions: readonly string[];
}

/** Keys explicitly handled by the GUI editor (:1092-1101). */
export const KNOWN_BT_PARAMS: readonly string[] = [
  'base_dir',
  'start_date',
  'end_date',
  'starting_balance',
  'balance_sample_divider',
  'exchanges',
  'btc_collateral_cap',
  'btc_collateral_ltv_cap',
  'maker_fee_override',
  'taker_fee_override',
  'market_order_slippage_pct',
  'filter_by_min_effective_cost',
  'liquidation_threshold',
  'dynamic_wel_by_tradability',
  'ohlcv_source_dir',
  'candle_interval_minutes',
  'gap_tolerance_ohlcvs_minutes',
  'compress_cache',
  'volume_normalization',
  'coin_sources',
  'market_settings_sources',
  'suite_enabled',
  'scenarios',
  'aggregate',
];

/** v8-only structured fields (rendered by the advanced panel, :1103-1105). */
export const PB8_ADVANCED_BT_PARAMS: readonly string[] = ['market_settings', 'visible_metrics'];

/** Per-key hints for the Additional Parameters expander (:1110-1120). */
export const EXTRA_BT_META: Record<string, { tip: string; fmt: string; options?: string[] }> = {
  hlcvs_data_dir: {
    /** i18n key — resolved by the editor label's data-tip. */
    tip: 'v7backtest.tip.hlcvsDataDir',
    fmt: 'Expert option: requires an existing PB8 dataset directory with a valid manifest.json.',
  },
  hlcvs_data_override_mode: {
    /** i18n key — resolved by the editor label's data-tip. */
    tip: 'v7backtest.tip.hlcvsDataOverrideMode',
    fmt: 'intersection | dataset',
    options: ['intersection', 'dataset'],
  },
};

const KNOWN_BT = new Set(KNOWN_BT_PARAMS);
const PB8_ADVANCED = new Set(PB8_ADVANCED_BT_PARAMS);

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/** A per-side coin list — arrays map, the 'all' string stays 'all' (:3721-3727). */
function coinList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value) return [value];
  return [];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** formatFeeInputValue (:2255-2259). */
export function formatFeeInputValue(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return str(value);
  return String(Number(number.toPrecision(12)));
}

/** normalizeLogLevelValue (:4466-4472). */
export function normalizeLogLevelValue(value: unknown, fallback: number): string {
  let parsed = parseInt(String(value), 10);
  if (Number.isNaN(parsed)) parsed = fallback;
  if (parsed < 0) parsed = 0;
  if (parsed > 3) parsed = 3;
  return String(parsed);
}

/** normalizeBacktestHslSignalModeValue (:4486-4491). */
export function normalizeBacktestHslSignalModeValue(value: unknown, modes: readonly string[]): string {
  const selected = str(value).trim();
  if (selected) return selected;
  return modes.length > 0 ? String(modes[0]) : '';
}

/** backtestExchangeOptions (:4493-4504) — settings list ∪ selected, v7 static fallback. */
export function backtestExchangeOptions(
  selected: readonly string[],
  options: { isV8: boolean; exchangeOptions: readonly string[] }
): string[] {
  const fallback = ['binance', 'bybit', 'bitget', 'okx', 'hyperliquid', 'kucoin', 'combined'];
  const source = options.isV8 && options.exchangeOptions.length > 0 ? options.exchangeOptions : fallback;
  const result: string[] = [];
  for (const value of [...source, ...(Array.isArray(selected) ? selected : [])]) {
    const entry = String(value ?? '').trim();
    if (entry && !result.includes(entry)) result.push(entry);
  }
  return result;
}

/** The extra-key classification ladder of buildExtraBtExpanderHtml (:2186-2245). */
export function buildExtraBtKeys(bt: Record<string, unknown>, isV8: boolean): ExtraBtField[] {
  const keys = Object.keys(bt)
    .filter((key) => !KNOWN_BT.has(key))
    .filter((key) => !(isV8 && PB8_ADVANCED.has(key)))
    .sort();
  return keys.map((key) => {
    const value = bt[key];
    const type = typeof value;
    if (value === null) return { key, kind: 'null' as const, text: '', checked: false };
    if (type === 'boolean') return { key, kind: 'boolean' as const, text: '', checked: !!value };
    if (type === 'number') return { key, kind: 'number' as const, text: String(value), checked: false };
    if (type === 'object' || Array.isArray(value)) return { key, kind: 'json' as const, text: JSON.stringify(value, null, 2), checked: false };
    return { key, kind: 'string' as const, text: String(value), checked: false };
  });
}

/**
 * populateBacktestForm — seeds every structured field the legacy editor
 * rendered (:2599-2893) with the same defaults ladder.
 */
export function populateBacktestForm(name: string, cfg: Record<string, unknown>, options: BacktestFormOptions): BacktestFormState {
  const bt = object(cfg.backtest);
  const bot = object(cfg.bot);
  const live = object(cfg.live);
  const pbgui = object(cfg.pbgui);
  const logging = object(cfg.logging);
  const version: BacktestVersion = options.isV8 ? 'v8' : 'v7';

  const makerFeeEnabled = bt.maker_fee_override !== null && bt.maker_fee_override !== undefined;
  const takerFeeEnabled = bt.taker_fee_override !== null && bt.taker_fee_override !== undefined;

  return {
    name,
    exchanges: Array.isArray(bt.exchanges) ? (bt.exchanges as string[]).map(String) : [],
    startDate: str(bt.start_date) || '2020-01-01',
    endDate: bt.end_date && bt.end_date !== 'now' ? String(bt.end_date) : today(),
    endDateIsNow: bt.end_date === 'now',
    startingBalance: str(bt.starting_balance || 1000),
    balanceSampleDivider: str(bt.balance_sample_divider || 60),
    btcCollateralCap: str(bt.btc_collateral_cap || 0),
    btcCollateralLtvCap: str(bt.btc_collateral_ltv_cap || 0),
    minimumCoinAgeDays: live.minimum_coin_age_days !== undefined ? String(live.minimum_coin_age_days) : '30',
    liquidationThreshold: bt.liquidation_threshold !== undefined ? String(bt.liquidation_threshold) : '0.05',
    dynamicWelByTradability: bt.dynamic_wel_by_tradability !== undefined ? !!bt.dynamic_wel_by_tradability : true,
    makerFeeEnabled,
    makerFeeVal: makerFeeEnabled ? formatFeeInputValue(bt.maker_fee_override) : '0',
    takerFeeEnabled,
    takerFeeVal: takerFeeEnabled ? formatFeeInputValue(bt.taker_fee_override) : '0',
    marketOrderSlippagePct: bt.market_order_slippage_pct !== undefined ? String(bt.market_order_slippage_pct) : '0.0005',
    filterByMinEffectiveCost:
      bt.filter_by_min_effective_cost !== undefined ? !!bt.filter_by_min_effective_cost : live.filter_by_min_effective_cost !== false,
    hslSignalMode: normalizeBacktestHslSignalModeValue(live.hsl_signal_mode, options.hslModes),
    loggingLevel: normalizeLogLevelValue(logging.level, 1),
    ohlcvSourceDir: str(bt.ohlcv_source_dir),
    candleIntervalMinutes: str(bt.candle_interval_minutes || 1),
    gapToleranceOhlcvsMinutes: str(bt.gap_tolerance_ohlcvs_minutes || 5),
    compressCache: !!bt.compress_cache,
    volumeNormalization: !!bt.volume_normalization,
    coinSources: { ...object(bt.coin_sources) } as Record<string, string>,
    marketSettingsSources: { ...object(bt.market_settings_sources) } as Record<string, string>,
    marketCap: pbgui.market_cap !== undefined ? String(pbgui.market_cap) : '0',
    volMcap: pbgui.vol_mcap !== undefined ? String(pbgui.vol_mcap) : '10',
    tags: Array.isArray(pbgui.tags) ? (pbgui.tags as unknown[]).map(String) : [],
    onlyCpt: !!pbgui.only_cpt,
    noticesIgnore: !!pbgui.notices_ignore,
    approvedLong: coinList(object(live.approved_coins).long),
    approvedShort: coinList(object(live.approved_coins).short),
    ignoredLong: coinList(object(live.ignored_coins).long),
    ignoredShort: coinList(object(live.ignored_coins).short),
    botLongJson: JSON.stringify(object(bot.long), null, 2),
    botShortJson: JSON.stringify(object(bot.short), null, 2),
    longTwe: String(getSideValue(version, bot.long, 'total_wallet_exposure_limit', 1)),
    longNpos: String(getSideValue(version, bot.long, 'n_positions', 1)),
    shortTwe: String(getSideValue(version, bot.short, 'total_wallet_exposure_limit', 0)),
    shortNpos: String(getSideValue(version, bot.short, 'n_positions', 0)),
    extraBt: buildExtraBtKeys(bt, options.isV8),
    rawJson: JSON.stringify(cfg, null, 2),
  };
}
