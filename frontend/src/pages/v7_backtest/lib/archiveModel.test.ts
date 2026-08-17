import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveConfigUsesPbguiMarketData,
  archiveResultByPath,
  archiveRetestDefaultDays,
  archiveStatusLine,
  buildRetestPayload,
  filterArchiveResults,
  filterLegacyResults,
  filterOptimizeConfigs,
  filterSchedules,
  legacyConfigOptions,
  legacySuggestedName,
  archiveCoinOptions,
  archiveConfigOptions,
  normalizeArchiveMarketDataPath,
  plainLegacyHtml,
  resultsCountLabel,
  scheduleCadenceLabel,
  scheduleModeLabel,
  scheduleStatusLabel,
} from './archiveModel';
import type { ArchiveRetestFields, ArchiveRetestScheduleItem, BacktestResultItem } from '../types';

/*
 * Pure archive/legacy helpers — the ports of updateArchiveStatusLine
 * (:8959-8967), renderArchiveResults' filter dropdowns + haystack
 * (:9072-9108), renderArchiveRetestSchedules' labels (:9163-9187),
 * renderArchiveOptimizeConfigs' filter (:9232-9238), renderLegacyResults
 * (:9427-9460), archiveRetestDefaultDays (:8044-8052),
 * collectArchiveRetestPayload (:8060-8081), archiveResultByPath
 * (:1168-1173), _legacySuggestedName (:8163-8167) and the archive
 * market-data default check (:7960-7968).
 */

/** Mirrors the en templates for the keys the helpers format (:8868, :8964-8966, :9170-9173). */
const templates: Record<string, string> = {
  'v7backtest.optimizeSettingsCount': ' · Optimize settings: {n}',
  'v7backtest.retestSchedulesCount': ' · Retest schedules: {n}',
  'v7backtest.weeklyCadence': 'Weekly {weekday} {time}',
  'v7backtest.dailyCadence': 'Daily {time}',
  'v7backtest.lastXDays': 'Last {n} days',
  'v7backtest.sameLengthYesterday': 'Same length → yesterday',
  'common.enabled': 'Enabled',
  'common.disabled': 'Disabled',
  'v7backtest.resultsCount': '{n} results',
  'v7backtest.showingResultsOf': 'Showing {shown} of {total}',
};

const t = (key: string, params?: Record<string, unknown>): string =>
  (templates[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''));

function row(overrides: Partial<BacktestResultItem>): BacktestResultItem {
  return { path: 'p', config_name: 'c', result_name: 'r', backtest_version: 'v7', ...overrides };
}

describe('archiveStatusLine (:8959-8967)', () => {
  it('concatenates the migration label with both counters', () => {
    expect(archiveStatusLine('layout-v2', 2, 1, t)).toBe('layout-v2 · Optimize settings: 2 · Retest schedules: 1');
  });

  it('drops the leading separator when there is no label', () => {
    expect(archiveStatusLine('', 3, 0, t)).toBe('Optimize settings: 3');
    expect(archiveStatusLine('', 0, 2, t)).toBe('Retest schedules: 2');
    expect(archiveStatusLine('', 0, 0, t)).toBe('');
    expect(archiveStatusLine(null as unknown as string, 1, 1, t)).toBe('Optimize settings: 1 · Retest schedules: 1');
  });
});

describe('resultsCountLabel (:5493-5503)', () => {
  it('shown === total renders the single form', () => {
    expect(resultsCountLabel(4, 4, t)).toBe('4 4 results'); // legacy concatenates the count twice (:5499)
  });

  it('shown !== total renders showing-of + the total (legacy double-count quirk)', () => {
    expect(resultsCountLabel(2, 5, t)).toBe('Showing 2 of 5 5 results');
  });
});

describe('filterArchiveResults (:9097-9108)', () => {
  const rows = [
    row({ path: 'a', config_name: 'alpha', coins: ['BTC', 'ETH'], coins_text: 'BTC,ETH', backtest_version: 'v7' }),
    row({ path: 'b', config_name: 'beta', coins: ['SOL'], strategy: 'neat', backtest_version: 'v8' }),
    row({ path: 'c', config_name: 'alpha', result_name: 'zz', backtest_version: 'v8' }),
  ];

  it('filters by config name', () => {
    expect(filterArchiveResults(rows, 'alpha', '', '').map((r) => r.path)).toEqual(['a', 'c']);
  });

  it('filters by coin membership (array only)', () => {
    expect(filterArchiveResults(rows, '', 'SOL', '').map((r) => r.path)).toEqual(['b']); // raw comparison, legacy :9103
    expect(filterArchiveResults(rows, '', 'BTC', '').map((r) => r.path)).toEqual(['a']);
  });

  it('matches the legacy haystack across version/config/strategy/name/display/coins_text', () => {
    expect(filterArchiveResults(rows, '', '', 'v8').map((r) => r.path)).toEqual(['b', 'c']);
    expect(filterArchiveResults(rows, '', '', 'neat').map((r) => r.path)).toEqual(['b']);
    expect(filterArchiveResults(rows, '', '', 'zz').map((r) => r.path)).toEqual(['c']);
    expect(filterArchiveResults(rows, '', '', 'btc,eth').map((r) => r.path)).toEqual(['a']);
  });

  it('empty text keeps every row', () => {
    expect(filterArchiveResults(rows, '', '', '')).toHaveLength(3);
  });
});

describe('archive dropdown options (:9072-9095)', () => {
  it('collects unique sorted config names', () => {
    expect(archiveConfigOptions([row({ config_name: 'b' }), row({ config_name: 'a' }), row({ config_name: 'b' })])).toEqual(['a', 'b']);
  });

  it('collects unique sorted coin names from arrays only', () => {
    const rows = [row({ coins: ['ETH', 'BTC'] }), row({ coins: ['BTC'] }), row({ coins: undefined, coins_text: 'SOL' })];
    expect(archiveCoinOptions(rows)).toEqual(['BTC', 'ETH']);
  });
});

describe('schedules helpers (:9153-9187)', () => {
  const schedule = (overrides: Partial<ArchiveRetestScheduleItem>): ArchiveRetestScheduleItem => ({
    id: 's1',
    cadence: 'daily',
    time: '02:00',
    ...overrides,
  });

  it('filters by the id/cadence/status/message haystack', () => {
    const rows = [
      schedule({ id: 'abc', cadence: 'daily', last_status: 'ok', last_message: 'ran 3' }),
      schedule({ id: 'def', cadence: 'weekly', last_status: 'error', last_message: '' }),
    ];
    expect(filterSchedules(rows, 'abc')).toHaveLength(1);
    expect(filterSchedules(rows, 'weekly')).toHaveLength(1);
    expect(filterSchedules(rows, 'ran 3')).toHaveLength(1);
    expect(filterSchedules(rows, '')).toHaveLength(2);
  });

  it('labels weekly with the weekday name and time', () => {
    expect(scheduleCadenceLabel(schedule({ cadence: 'weekly', weekday: 3, time: '05:30' }), t)).toBe('Weekly Thu 05:30');
    expect(scheduleCadenceLabel(schedule({ cadence: 'weekly', weekday: undefined, time: '' }), t)).toBe('Weekly Mon ');
  });

  it('labels daily with the time only', () => {
    expect(scheduleCadenceLabel(schedule({ cadence: 'daily', time: '02:00' }), t)).toBe('Daily 02:00');
  });

  it('labels the date mode (:9172)', () => {
    expect(scheduleModeLabel(schedule({ options: { date_mode: 'last_x_days', last_days: 30 } }), t)).toBe('Last 30 days');
    expect(scheduleModeLabel(schedule({ options: { date_mode: 'until_yesterday', last_days: 30 } }), t)).toBe('Same length → yesterday');
    expect(scheduleModeLabel(schedule({ options: {} }), t)).toBe('Same length → yesterday');
  });

  it('labels enabled/disabled (:9173)', () => {
    expect(scheduleStatusLabel(schedule({ enabled: true }), t)).toBe('Enabled');
    expect(scheduleStatusLabel(schedule({ enabled: false }), t)).toBe('Disabled');
    expect(scheduleStatusLabel(schedule({ enabled: undefined }), t)).toBe('Enabled');
  });
});

describe('filterOptimizeConfigs (:9232-9238)', () => {
  it('matches name/version/config_version/relative_path', () => {
    const rows = [
      { path: 'p1', name: 'fast', optimize_version: 'v7', relative_path: 'x/y.json' },
      { path: 'p2', name: 'slow', optimize_version: 'v8', config_version: '0.9', relative_path: 'z.json' },
    ];
    expect(filterOptimizeConfigs(rows, 'fast')).toHaveLength(1);
    expect(filterOptimizeConfigs(rows, 'v8')).toHaveLength(1);
    expect(filterOptimizeConfigs(rows, '0.9')).toHaveLength(1);
    expect(filterOptimizeConfigs(rows, 'x/y')).toHaveLength(1);
    expect(filterOptimizeConfigs(rows, '')).toHaveLength(2);
  });
});

describe('legacy helpers (:9427-9460, :8163-8167)', () => {
  const rows: BacktestResultItem[] = [
    { path: 'l1', config_name: 'old1', result_name: 'r1', backtest_version: 'v7', display_name: 'pb7/old1/x/r1' },
    { path: 'l2', config_name: 'old2', result_name: 'r2', backtest_version: 'v7', suggested_name: 'renamed' },
  ];

  it('filters by config + the display/config/result haystack', () => {
    expect(filterLegacyResults(rows, 'old1', '').map((r) => r.path)).toEqual(['l1']);
    expect(filterLegacyResults(rows, '', 'pb7/old1').map((r) => r.path)).toEqual(['l1']);
    expect(filterLegacyResults(rows, '', 'r2').map((r) => r.path)).toEqual(['l2']);
    expect(filterLegacyResults(rows, '', '')).toHaveLength(2);
  });

  it('collects unique sorted config names', () => {
    expect(legacyConfigOptions(rows)).toEqual(['old1', 'old2']);
  });

  it('suggested name prefers suggested_name, then config, then result', () => {
    expect(legacySuggestedName(rows, 'l2')).toBe('renamed');
    expect(legacySuggestedName(rows, 'l1')).toBe('old1');
    expect(legacySuggestedName(rows, 'gone')).toBe('legacy_rebacktest');
  });
});

describe('archiveRetestDefaultDays (:8044-8052)', () => {
  it('computes inclusive day counts from the config dates', () => {
    expect(archiveRetestDefaultDays({ backtest: { start_date: '2024-01-01', end_date: '2024-01-10' } })).toBe(10);
    expect(archiveRetestDefaultDays({ backtest: { start_date: '2024-01-10', end_date: '2024-01-10' } })).toBe(1);
  });

  it('falls back to 365 for missing/inverted/invalid dates', () => {
    expect(archiveRetestDefaultDays({})).toBe(365);
    expect(archiveRetestDefaultDays({ backtest: { start_date: '2024-02-01', end_date: '2024-01-01' } })).toBe(365);
    expect(archiveRetestDefaultDays({ backtest: { start_date: 'nope', end_date: '2024-01-01' } })).toBe(365);
  });
});

describe('archive market-data default (:7960-7968)', () => {
  it('normalizes trailing slashes on both sides', () => {
    expect(normalizeArchiveMarketDataPath('/data/ohlcv/')).toBe('/data/ohlcv');
    expect(normalizeArchiveMarketDataPath(' /data/ohlcv/ //')).toBe('/data/ohlcv/ '); // trim-then-strip order, legacy :7961
    expect(normalizeArchiveMarketDataPath('\\data\\x\\')).toBe('\\data\\x');
  });

  it('matches only when both dirs resolve and are equal', () => {
    expect(archiveConfigUsesPbguiMarketData({ backtest: { ohlcv_source_dir: '/data/ohlcv/' } }, '/data/ohlcv')).toBe(true);
    expect(archiveConfigUsesPbguiMarketData({ backtest: { ohlcv_source_dir: '/other' } }, '/data/ohlcv')).toBe(false);
    expect(archiveConfigUsesPbguiMarketData({}, '/data/ohlcv')).toBe(false);
    expect(archiveConfigUsesPbguiMarketData({ backtest: { ohlcv_source_dir: '/data/ohlcv' } }, '')).toBe(false);
  });
});

describe('buildRetestPayload (:8060-8081)', () => {
  const fields = (overrides: Partial<ArchiveRetestFields>): ArchiveRetestFields => ({
    dateMode: 'until_yesterday',
    lastDays: 365,
    balance: 1000,
    exchanges: ['bybit'],
    usePbguiMarketData: false,
    skipLiquidated: true,
    ...overrides,
  });

  it('builds the queue-now payload shape', () => {
    expect(buildRetestPayload(fields({}), ['a', 'b'])).toEqual({
      paths: ['a', 'b'],
      date_mode: 'until_yesterday',
      last_days: 365,
      starting_balance: 1000,
      exchanges: ['bybit'],
      use_pbgui_market_data: false,
      skip_liquidated: true,
    });
  });

  it('normalizes the date mode and clamps last_days to 1..3650', () => {
    expect(buildRetestPayload(fields({ dateMode: 'last_x_days', lastDays: 9999 }), ['a'])?.last_days).toBe(3650);
    expect(buildRetestPayload(fields({ dateMode: 'weird', lastDays: 0 }), ['a'])?.date_mode).toBe('until_yesterday');
    expect(buildRetestPayload(fields({ lastDays: 0 }), ['a'])?.last_days).toBe(365);
  });

  it('returns null when no exchange is selected (:8071)', () => {
    expect(buildRetestPayload(fields({ exchanges: [] }), ['a'])).toBeNull();
  });
});

describe('archiveResultByPath (:1168-1173)', () => {
  it('finds the loaded row', () => {
    const rows = [row({ path: 'x' })];
    expect(archiveResultByPath(rows, 'x')).toBe(rows[0]);
  });

  it("falls back to a synthetic v7 row so fetches still route to the v7 base", () => {
    expect(archiveResultByPath([], 'gone')).toEqual({ path: 'gone', config_name: '', result_name: '', backtest_version: 'v7' });
  });
});

describe('plainLegacyHtml (:8868 empty-archives key)', () => {
  it('flattens the frozen key html to plain text (NO v-html)', () => {
    expect(plainLegacyHtml('No archives yet.<br>Click <b>+ Add Archive</b> to clone one.')).toBe('No archives yet.\nClick + Add Archive to clone one.');
  });
});
