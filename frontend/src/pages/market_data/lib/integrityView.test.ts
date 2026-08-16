import { describe, expect, it } from 'vitest';
import {
  buildGapChart,
  buildGapDayContext,
  buildGapRanges,
  buildGapSummaryCards,
  buildIntegritySummaryCards,
  groupIntegrityIssues,
} from './integrityView';
import type { TranslateFn } from '../composables/useSettings';

/* Pure render-model builders — the renderIntegrityPanel /
   renderIntegrityGapDetails slices (market_data_main.html:4329-4351,
   :4409-4437, :4666-4752) as functions so the component templates stay
   declarative. */

const t: TranslateFn = (key, params) => {
  const table: Record<string, string> = {
    'market.scan': 'Scan',
    'market.complete': 'Complete',
    'market.pending': 'Pending',
    'market.validDays': 'Valid days',
    'market.sourceGaps': 'Source gaps',
    'market.damagedDays': 'Damaged days',
    'market.reference': 'Reference',
    'market.notCompared': 'not compared',
    'market.candles': 'Candles',
    'market.absent': 'Absent',
    'market.damaged': 'Damaged',
    'market.coverage': 'Coverage',
    'market.reason': 'Reason',
    'market.possibleInception': 'Possible inception',
    'market.realInterruption': 'Real interruption',
    'market.missingBoundary': 'Missing boundary',
    'market.noMissingRanges': 'No missing ranges',
    'common.unknown': 'Unknown',
    'market.present': 'Present',
    'market.leadingGap': 'Leading gap',
    'market.internalGap': 'Internal gap',
    'market.trailingGap': 'Trailing gap',
    'market.missingDay': 'Missing day',
    'market.completeMarker': 'complete',
    'market.partial': 'partial',
    'market.missingLower': 'missing',
  };
  if (params && key === 'market.candlesCount') return `${String(params.count)} candles`;
  return table[key] ?? key;
};

describe('groupIntegrityIssues (:4412-4437)', () => {
  it('groups rows by exchange+coin and aggregates days, missing, range and reasons', () => {
    const groups = groupIntegrityIssues([
      { exchange: 'bybit', coin: 'BTC', day: '2026-01-05', missing_minutes: 10, error: 'checksum mismatch' },
      { exchange: 'bybit', coin: 'BTC', day: '2026-01-02', missing_minutes: 30, error: 'checksum mismatch' },
      { exchange: 'bybit', coin: 'BTC', day: '2026-01-03', missing_minutes: 0, error: 'candle count' },
      { exchange: 'okx', coin: 'ETH', day: '2026-02-01', missing_minutes: 5 },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      exchange: 'bybit',
      coin: 'BTC',
      days: 3,
      oldest: '2026-01-02',
      latest: '2026-01-05',
      missing: 40,
      reasons: { 'checksum mismatch': 2, 'candle count': 1 },
    });
    expect(groups[1]).toMatchObject({
      exchange: 'okx',
      coin: 'ETH',
      days: 1,
      oldest: '2026-02-01',
      latest: '2026-02-01',
      missing: 5,
      reasons: { 'unknown integrity error': 1 }, // missing error (:4435)
    });
  });

  it('keeps first-seen order and tolerates an empty list', () => {
    expect(groupIntegrityIssues([])).toEqual([]);
    expect(groupIntegrityIssues([{ coin: 'X' }])).toMatchObject([{ coin: 'X', days: 1 }]);
  });
});

describe('buildIntegritySummaryCards (:4331-4351)', () => {
  const base = {
    meta: { statusKey: 'bybit', label: 'Bybit' },
    counts: { valid: 10, inception_partial: 2, source_gap: 3, invalid: 4 },
    scanComplete: true,
    comparisonCounts: { mismatch: 1, reference_only: 2, local_only: 5 },
    referenceMeta: { selected_repository: 'org/public', matches_selected: true },
  };

  it('renders the five cards with the legacy math', () => {
    const cards = buildIntegritySummaryCards(base, t);
    expect(cards).toHaveLength(5);
    expect(cards[0]).toMatchObject({ label: 'Scan', value: 'Complete' });
    expect(cards[1]).toMatchObject({ label: 'Valid days', value: 12 }); // valid + inception_partial
    expect(cards[2]).toMatchObject({ label: 'Source gaps', value: 3 });
    expect(cards[3]).toMatchObject({ label: 'Damaged days', value: 4 });
    expect(cards[4]).toMatchObject({ label: 'Reference', value: 3 }); // mismatch + reference_only
  });

  it('marks pending scans and not-compared references', () => {
    const cards = buildIntegritySummaryCards(
      { ...base, scanComplete: false, comparisonCounts: null, referenceMeta: {} },
      t
    );
    expect(cards[0]?.value).toBe('Pending');
    expect(cards[4]?.value).toBe('not compared');
  });

  it('switches the reference note when the selected repo does not match (:4350)', () => {
    const cards = buildIntegritySummaryCards(
      { ...base, comparisonCounts: null, referenceMeta: { selected_repository: 'org/public', matches_selected: false } },
      t
    );
    expect(cards[4]?.note).toBe('market.refreshRequiredArchive');
    const cardsNoRepo = buildIntegritySummaryCards(
      { ...base, comparisonCounts: null, referenceMeta: {} },
      t
    );
    expect(cardsNoRepo[4]?.note).toBe('market.choosePublicArchive');
  });

  it('appends the crypto-only suffix for hyperliquid (:4337)', () => {
    const cards = buildIntegritySummaryCards(
      { ...base, meta: { statusKey: 'hyperliquid', label: 'Hyperliquid' } },
      t
    );
    expect(cards[0]?.note).toContain('market.cryptoOnlySuffix');
  });
});

describe('buildGapSummaryCards (:4669-4673)', () => {
  it('maps the payload to the five cards', () => {
    const cards = buildGapSummaryCards(
      {
        actual_candles: 1400,
        missing_minutes: 30,
        damaged_missing_minutes: 12,
        first: '2026-01-02T00:05:00',
        last: '2026-01-02T23:59:00',
        error: 'checksum mismatch',
        earliest_local_day: '2024-01-01',
      },
      t
    );
    expect(cards.map((c) => c.value)).toEqual([
      1400,
      30,
      12,
      '2026-01-02T00:05:00 to 2026-01-02T23:59:00',
      'checksum mismatch',
    ]);
    expect(cards[4]?.note).toBe('market.earliestLocalDay');
  });

  it('falls back to none markers, status and established history (:4672-4673)', () => {
    const cards = buildGapSummaryCards({ status: 'partial' }, t);
    expect(cards[3]?.value).toBe('none to none');
    expect(cards[4]?.value).toBe('partial');
    expect(cards[4]?.note).toBe('market.establishedHistory');
  });
});

describe('buildGapDayContext (:4675-4704)', () => {
  it('builds 24 hourly markers per day with classes and titles (:4689-4694)', () => {
    const rows = buildGapDayContext(
      {
        day_context: [
          { day: '2026-01-01', hourly_coverage: 'pppppppppppppppppppppppp', candles: 1440, status: 'ok' },
          { day: '2026-01-02', hourly_coverage: 'xxxxxxxxxxxxxxxxxxxxxxxx', selected: true, status: 'missing', error: 'gap' },
          { day: '2026-01-03', hourly_coverage: '', candles: 0, status: 'missing' },
        ],
      },
      t
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]?.hours).toHaveLength(24);
    expect(rows[0]?.hours[0]).toMatchObject({ cls: '', title: '00:00 UTC - complete' });
    expect(rows[1]?.hours[0]).toMatchObject({ cls: 'partial', title: '00:00 UTC - partial' });
    expect(rows[2]?.hours[23]).toMatchObject({ cls: 'missing', title: '23:00 UTC - missing' }); // charAt fallback 'm' (:4690)
    expect(rows[1]?.selected).toBe(true);
    expect(rows[1]?.disabled).toBe(true); // status missing (:4681)
    expect(rows[1]?.title).toBe('gap'); // error wins over status (:4683)
    expect(rows[0]?.candles).toBe('1440 candles');
    expect(rows[0]?.status).toBe('ok');
  });
});

describe('buildGapChart (:4706-4727)', () => {
  it('renders 24 rows × 60 cells with marker classes and titles (:4709-4723)', () => {
    const coverage =
      'p'.repeat(60) + 'l'.repeat(60) + 'i'.repeat(60) + 't'.repeat(60) + 'm'.repeat(60) + 'x'.repeat(60) +
      'p'.repeat(1380);
    const rows = buildGapChart(coverage, t);
    expect(rows).toHaveLength(24);
    expect(rows[0]?.cells).toHaveLength(60);
    expect(rows[0]?.label).toBe('00:00');
    expect(rows[0]?.cells[0]).toEqual({ cls: '', title: '00:00 UTC - Present' });
    expect(rows[1]?.cells[0]).toEqual({ cls: 'leading', title: '01:00 UTC - Leading gap' });
    expect(rows[2]?.cells[0]).toEqual({ cls: 'internal', title: '02:00 UTC - Internal gap' });
    expect(rows[3]?.cells[0]).toEqual({ cls: 'trailing', title: '03:00 UTC - Trailing gap' });
    expect(rows[4]?.cells[0]).toEqual({ cls: 'missing-day', title: '04:00 UTC - Missing day' });
    expect(rows[5]?.cells[0]).toEqual({ cls: '', title: '05:00 UTC - Unknown' }); // unknown marker → common.unknown (:4723)
    // out-of-string markers default to missing (:4720)
    expect(buildGapChart('', t)[0]?.cells[0]).toEqual({ cls: 'missing-day', title: '00:00 UTC - Missing day' });
    expect(rows[23]?.cells[59]?.title).toBe('23:59 UTC - Present');
  });
});

describe('buildGapRanges (:4729-4752)', () => {
  it('assesses ranges and appends UTC markers (:4741-4751)', () => {
    const rows = buildGapRanges(
      {
        ranges: [
          { kind: 'leading', start: '2026-01-02T00:00:00', end: '2026-01-02T00:05:00', minutes: 5, possible_inception: true },
          { kind: 'internal', start: '2026-01-02T01:00:00', end: '2026-01-02T01:10:00', minutes: 10 },
          { kind: 'trailing', start: '2026-01-02T23:00:00', end: '2026-01-02T23:30:00', minutes: 30 },
        ],
      },
      t
    );
    expect(rows).toEqual([
      { kind: 'leading', start: '2026-01-02T00:00:00 UTC', end: '2026-01-02T00:05:00 UTC', minutes: 5, assessment: 'Possible inception' },
      { kind: 'internal', start: '2026-01-02T01:00:00 UTC', end: '2026-01-02T01:10:00 UTC', minutes: 10, assessment: 'Real interruption' },
      { kind: 'trailing', start: '2026-01-02T23:00:00 UTC', end: '2026-01-02T23:30:00 UTC', minutes: 30, assessment: 'Missing boundary' },
    ]);
  });

  it('returns an empty list marker for no ranges (:4732-4739)', () => {
    expect(buildGapRanges({}, t)).toEqual([
      { kind: '', start: '', end: '', minutes: '', assessment: 'No missing ranges', empty: true },
    ]);
  });
});
