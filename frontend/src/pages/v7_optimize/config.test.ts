import { describe, expect, it } from 'vitest';
import {
  currentOptimizeAdapter,
  detectOptimizeVersion,
  optimizeApiBase,
  optimizeWsUrl,
  readIncomingDraft,
  readInitialPanel,
  readOpenConfig,
} from './config';

describe('v7_optimize config', () => {
  it('derives the version only from the serving optimize route', () => {
    expect(detectOptimizeVersion('/api/optimize-v8/main_page')).toBe('v8');
    expect(detectOptimizeVersion('/api/v7/main_page')).toBe('v7');
    expect(detectOptimizeVersion('/api/strategy-explorer-v8/main_page')).toBe('v7');
  });

  it('builds REST and websocket bases without leaking a token', () => {
    expect(optimizeApiBase('https://example.test', 'v7')).toBe('https://example.test/api/optimize-v7');
    expect(optimizeWsUrl('https://example.test', 'v8')).toBe('wss://example.test/api/optimize-v8/ws/opt8');
  });

  it('creates the adapter for both flavours', () => {
    const adapter = currentOptimizeAdapter('/api/optimize-v8/main_page', 'http://localhost:8000');
    expect(adapter).toMatchObject({
      version: 'v8',
      isV8: true,
      label: 'PBv8',
      navCurrent: 'v8_optimize',
      apiBase: 'http://localhost:8000/api/optimize-v8',
      archiveApiBase: 'http://localhost:8000/api/backtest-v7',
      backtestApiBase: 'http://localhost:8000/api/backtest-v8',
      paretoExplorerBase: 'http://localhost:8000/api/pareto-explorer',
    });
  });

  it('reads deep links conservatively', () => {
    expect(readOpenConfig('?open_config=foo.json&panel=queue')).toBe('foo.json');
    expect(readInitialPanel('?open_config=foo.json&panel=queue')).toBe('queue');
    expect(readInitialPanel('?panel=unknown')).toBe('configs');
  });
  it('reads incoming backtest optimize drafts without accepting empty ids', () => {
    expect(readIncomingDraft('?opt_draft_id=draft-1&draft_name=from-backtest')).toEqual({ id: 'draft-1', name: 'from-backtest' });
    expect(readIncomingDraft('?opt_draft_id=')).toBeNull();
  });
});
