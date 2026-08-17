import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import {
  apiUrl,
  backtestV8PageUrl,
  balanceCalcPageUrl,
  convertTargetName,
  createRunAdapter,
  currentRunAdapter,
  detectRunVersion,
  editPageUrl,
  migrateV7Url,
  runApiBase,
  wsUrl,
} from './config';

/* Legacy plumbing: API_BASE was origin + /api/v7|v8 (api/v7_instances.py
   :2462, api/v8_instances.py :1797), WS_BASE the ws-scheme origin, and
   RUN_VERSION the one bit distinguishing the two routes (:2467 / :1816).
   run_list_adapter.js (frontend/js/run_list_adapter.js) supplied the rest. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const getBootMock = vi.mocked(getBoot);

beforeEach(() => {
  getBootMock.mockReturnValue({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' });
});

describe('run version detection (the %%RUN_VERSION%% successor)', () => {
  it('derives v7/v8 from the serving route path', () => {
    expect(detectRunVersion('/api/v7/main_page')).toBe('v7');
    expect(detectRunVersion('/api/v8/main_page')).toBe('v8');
  });

  it('does not mistake other v8 routes for the PB8 run list', () => {
    expect(detectRunVersion('/api/backtest-v8/main_page')).toBe('v7');
    expect(detectRunVersion('/api/v8-edit-anything/main_page')).toBe('v7');
  });

  it('builds the adapter for the current path', () => {
    expect(currentRunAdapter('/api/v8/main_page').navCurrent).toBe('v8_run');
    expect(currentRunAdapter('/api/v7/main_page').navCurrent).toBe('v7_run');
  });
});

describe('run adapter (run_list_adapter.js create())', () => {
  it('v7 adapter matches the legacy table', () => {
    const adapter = createRunAdapter('v7');
    expect(adapter.version).toBe('v7');
    expect(adapter.isV8).toBe(false);
    expect(adapter.label).toBe('PB7');
    expect(adapter.navCurrent).toBe('v7_run');
    expect(adapter.websocketPath).toBe('/api/v7/ws/v7');
    expect(adapter.supportsBackups).toBe(true);
    expect(adapter.supportsForcedModes).toBe(true);
    expect(adapter.supportsConversion).toBe(true);
    expect(adapter.titleKey).toBe('v7run.title');
    expect(adapter.addInstanceKey).toBe('v7run.addInstance');
    expect(adapter.navSubtitleParams).toEqual({ version: '7' });
  });

  it('v8 adapter matches the legacy table', () => {
    const adapter = createRunAdapter('v8');
    expect(adapter.version).toBe('v8');
    expect(adapter.isV8).toBe(true);
    expect(adapter.label).toBe('PB8');
    expect(adapter.navCurrent).toBe('v8_run');
    expect(adapter.websocketPath).toBe('/api/v8/ws/v8');
    expect(adapter.supportsBackups).toBe(true);
    expect(adapter.supportsForcedModes).toBe(false);
    expect(adapter.supportsConversion).toBe(false);
    expect(adapter.titleKey).toBe('v7run.titleV8');
    expect(adapter.addInstanceKey).toBe('v7run.addPb8Instance');
  });
});

describe('URL derivation', () => {
  it('derives the REST base per version (legacy :2462/:1797)', () => {
    expect(runApiBase(createRunAdapter('v7'))).toBe('http://pbgui.test:8000/api/v7');
    expect(runApiBase(createRunAdapter('v8'))).toBe('http://pbgui.test:8000/api/v8');
    expect(apiUrl(createRunAdapter('v7'), '/instances')).toBe('http://pbgui.test:8000/api/v7/instances');
    expect(apiUrl(createRunAdapter('v8'), '/backups')).toBe('http://pbgui.test:8000/api/v8/backups');
  });

  it('rewrites the scheme for the WS URL (:2463/:619)', () => {
    expect(wsUrl(createRunAdapter('v7'))).toBe('ws://pbgui.test:8000/api/v7/ws/v7');
    expect(wsUrl(createRunAdapter('v8'))).toBe('ws://pbgui.test:8000/api/v8/ws/v8');
    getBootMock.mockReturnValue({ token: 'tok', origin: 'https://pbgui.test', version: '1.0.0', serial: 'S1' });
    expect(wsUrl(createRunAdapter('v8'))).toBe('wss://pbgui.test/api/v8/ws/v8');
  });

  it('builds the edit-page URLs (:900/:906)', () => {
    const adapter = createRunAdapter('v7');
    expect(editPageUrl(adapter, 'bybit_SOLUSDT')).toBe('http://pbgui.test:8000/api/v7/edit_page?name=bybit_SOLUSDT');
    expect(editPageUrl(adapter, 'name with spaces')).toBe(
      'http://pbgui.test:8000/api/v7/edit_page?name=name%20with%20spaces'
    );
    expect(editPageUrl(adapter, null)).toBe('http://pbgui.test:8000/api/v7/edit_page?new=1');
  });

  it('builds the cross-router URLs the legacy page reached via location.origin', () => {
    expect(balanceCalcPageUrl({ instance: 'main', instance_version: 'v7', exchange: 'bybit' })).toBe(
      'http://pbgui.test:8000/api/balance-calc/main_page?instance=main&instance_version=v7&exchange=bybit'
    );
    expect(balanceCalcPageUrl({ draft_id: 'd1', exchange: '' })).toBe(
      'http://pbgui.test:8000/api/balance-calc/main_page?draft_id=d1&exchange='
    );
    expect(backtestV8PageUrl('cfg_v8')).toBe(
      'http://pbgui.test:8000/api/backtest-v8/main_page?config=cfg_v8'
    );
    expect(migrateV7Url()).toBe('http://pbgui.test:8000/api/backtest-v8/migrate-v7');
  });

  it('sanitizes the convert target name (:911)', () => {
    expect(convertTargetName('bybit_SOLUSDT')).toBe('bybit_SOLUSDT_v8');
    expect(convertTargetName('a/b\\c')).toBe('a_b_c_v8');
    expect(convertTargetName('x'.repeat(200)).length).toBe(123); // 120 + '_v8'
    expect(convertTargetName('x'.repeat(200))).not.toContain('/');
  });
});
