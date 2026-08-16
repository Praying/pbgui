import type { ExchangeOption } from '../types';

/** Legacy exchange registry verbatim (:3667-3673). */
export const exchangeOptions: readonly ExchangeOption[] = [
  { key: 'hyperliquid', statusKey: 'hyperliquid', label: 'Hyperliquid' },
  { key: 'binance', statusKey: 'binanceusdm', label: 'Binance USDM' },
  { key: 'bybit', statusKey: 'bybit', label: 'Bybit' },
  { key: 'bitget', statusKey: 'bitget', label: 'Bitget' },
  { key: 'okx', statusKey: 'okx', label: 'OKX' },
];

/** Legacy fallback entry (:4099 — exchangeOptions[0], hyperliquid). */
export const defaultExchangeOption: ExchangeOption = {
  key: 'hyperliquid',
  statusKey: 'hyperliquid',
  label: 'Hyperliquid',
};

/**
 * Legacy getExchangeMeta (:4092-4100): trim + lowercase, remap the
 * binance-usdm spellings, match by key or statusKey, fall back to
 * hyperliquid for anything unknown.
 */
export function getExchangeMeta(value: unknown): ExchangeOption {
  let key = String(value ?? '')
    .trim()
    .toLowerCase();
  if (key === 'binanceusdm' || key === 'binance-usdm') key = 'binance';
  return (
    exchangeOptions.find((item) => item.key === key || item.statusKey === key) ??
    defaultExchangeOption
  );
}
