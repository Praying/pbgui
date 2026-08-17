import type { OptimizeVersion } from '../types';

/**
 * Cross-page URL builders — :1782-1792 parity. Every builder takes the
 * RUNTIME optimize version, never a pathname-derived constant: pareto is the
 * one page whose version can flip mid-session when another result loads
 * (recon §4 / R3). M-v7-7 wires the draft handoffs that POST first; the
 * builders here are the URL halves of those flows.
 */

export function optimizeApiBase(version: OptimizeVersion, origin: string): string {
  return origin + '/api/optimize-' + version;
}

export function backtestApiBase(version: OptimizeVersion, origin: string): string {
  return origin + '/api/backtest-' + version;
}

export function strategyExplorerApiBase(version: OptimizeVersion, origin: string): string {
  return origin + (version === 'v8' ? '/api/strategy-explorer-v8' : '/api/strategy-explorer');
}

/**
 * main_page URL with null/empty params dropped (:1826-1844 shared shape).
 */
export function buildMainPageUrl(base: string, extraParams: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams)) {
    if (value != null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return base + '/main_page' + (query ? '?' + query : '');
}

export function buildBacktestMainPageUrl(
  version: OptimizeVersion,
  origin: string,
  extraParams: Record<string, unknown>
): string {
  return buildMainPageUrl(backtestApiBase(version, origin), extraParams);
}

export function buildOptimizeMainPageUrl(
  version: OptimizeVersion,
  origin: string,
  extraParams: Record<string, unknown>
): string {
  return buildMainPageUrl(optimizeApiBase(version, origin), extraParams);
}

/**
 * "← Back to Optimize" (:4482-4487): the owning optimize workbench results
 * panel with the #results deep link — the only hash this page writes.
 */
export function backToOptimizeResultsUrl(version: OptimizeVersion, origin: string): string {
  return optimizeApiBase(version, origin) + '/main_page?panel=results#results';
}
