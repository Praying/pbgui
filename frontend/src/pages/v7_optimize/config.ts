/** Route-aware configuration for the shared PBv7/PBv8 Optimize page. */
import { getBoot } from '@/shared/boot';

export type OptimizeVersion = 'v7' | 'v8';
export type OptimizePanel = 'configs' | 'queue' | 'results' | 'paretos';

export interface OptimizeAdapter {
  version: OptimizeVersion;
  isV8: boolean;
  label: 'PBv7' | 'PBv8';
  apiBase: string;
  archiveApiBase: string;
  backtestApiBase: string;
  metadataApiBase: string;
  paretoExplorerBase: string;
  queueLogPrefix: string;
  websocketPath: string;
  navCurrent: 'v7_optimize' | 'v8_optimize';
  navSubtitle: string;
}

export function detectOptimizeVersion(pathname: string = window.location.pathname): OptimizeVersion {
  return /\/api\/optimize-v8(?:\/|$)/.test(pathname) ? 'v8' : 'v7';
}

export function optimizeApiBase(
  origin: string = getBoot().origin,
  version: OptimizeVersion = detectOptimizeVersion(),
): string {
  return `${origin}/api/optimize-${version}`;
}

export function optimizeWsUrl(
  origin: string = getBoot().origin,
  version: OptimizeVersion = detectOptimizeVersion(),
): string {
  const wsOrigin = origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${wsOrigin}/api/optimize-${version}/ws/opt${version === 'v8' ? '8' : '7'}`;
}

export function currentOptimizeAdapter(
  pathname: string = window.location.pathname,
  origin: string = getBoot().origin,
): OptimizeAdapter {
  const version = detectOptimizeVersion(pathname);
  const isV8 = version === 'v8';
  return {
    version,
    isV8,
    label: isV8 ? 'PBv8' : 'PBv7',
    apiBase: optimizeApiBase(origin, version),
    archiveApiBase: `${origin}/api/backtest-v7`,
    backtestApiBase: `${origin}/api/backtest-${version}`,
    metadataApiBase: `${origin}/api/${version}`,
    paretoExplorerBase: `${origin}/api/pareto-explorer`,
    queueLogPrefix: isV8 ? 'optimizes_v8/' : 'optimizes/',
    websocketPath: `/api/optimize-${version}/ws/opt${isV8 ? '8' : '7'}`,
    navCurrent: isV8 ? 'v8_optimize' : 'v7_optimize',
    navSubtitle: `${isV8 ? 'PBv8' : 'PBv7'} OPTIMIZE`,
  };
}

export function readOpenConfig(search: string = window.location.search): string {
  return new URLSearchParams(search).get('open_config') || '';
}

export function readIncomingDraft(search: string = window.location.search): { id: string; name: string; kind?: 'optimize' | 'migration' } | null {
  const params = new URLSearchParams(search);
  const migrationId = String(params.get('migration_draft_id') || '').trim();
  const optimizeId = String(params.get('opt_draft_id') || '').trim();
  const id = migrationId || optimizeId;
  if (!id) return null;
  return migrationId
    ? { id, name: String(params.get('draft_name') || '').trim(), kind: 'migration' }
    : { id, name: String(params.get('draft_name') || '').trim() };
}

export function readInitialPanel(search: string = window.location.search): OptimizePanel {
  const value = new URLSearchParams(search).get('panel');
  return value === 'queue' || value === 'results' || value === 'paretos' ? value : 'configs';
}
