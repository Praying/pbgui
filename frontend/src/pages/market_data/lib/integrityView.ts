import type { TranslateFn } from '../composables/useSettings';

/*
 * Pure render-model builders for the integrity panel — the computing half
 * of legacy renderIntegrityPanel / renderIntegrityGapDetails
 * (market_data_main.html:4294-4519, :4666-4752). No DOM, no state: the
 * composables/tests feed payloads in and the components template the rows.
 */

/** One damaged-day row from GET /integrity/issues (:4544). */
export interface IntegrityIssueRow {
  exchange?: unknown;
  coin?: unknown;
  day?: unknown;
  missing_minutes?: unknown;
  error?: unknown;
  market_status?: unknown;
  [key: string]: unknown;
}

/** One grouped repair-queue row (:4417-4427). */
export interface IssueGroup {
  exchange: string;
  coin: string;
  days: number;
  oldest: string;
  latest: string;
  missing: number;
  reasons: Record<string, number>;
}

/** One reference-difference row (:4509-4515). */
export interface DifferenceRow {
  kind: string;
  exchange: string;
  coin: string;
  day: string;
}

/** A .summary-card view model (:4278-4292). Optional note — the inventory
 *  metrics (:7859-7865) render label/value cards without one. */
export interface SummaryCard {
  label: string;
  value: string | number;
  note?: string;
}

/** GET /integrity/day-details body (:4666-4753). */
export interface GapDayDetailsPayload {
  day?: unknown;
  actual_candles?: unknown;
  missing_minutes?: unknown;
  damaged_missing_minutes?: unknown;
  first?: unknown;
  last?: unknown;
  error?: unknown;
  status?: unknown;
  earliest_local_day?: unknown;
  day_context?: unknown;
  coverage?: unknown;
  ranges?: unknown;
  [key: string]: unknown;
}

/** One surrounding-day button row (:4677-4703). */
export interface GapContextDay {
  day: string;
  selected: boolean;
  disabled: boolean;
  title: string;
  hours: readonly { cls: string; title: string }[];
  candles: string;
  status: string;
}

/** One chart hour row (:4711-4726). */
export interface GapChartRow {
  label: string;
  cells: readonly { cls: string; title: string }[];
}

/** One missing-range row (:4741-4751). */
export interface GapRangeRow {
  kind: string;
  start: string;
  end: string;
  minutes: string | number;
  assessment: string;
  empty?: boolean;
}

function numberOf(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Group damaged days per exchange+coin (:4412-4437). */
export function groupIntegrityIssues(rows: readonly IntegrityIssueRow[]): IssueGroup[] {
  const groups: IssueGroup[] = [];
  const byKey = new Map<string, IssueGroup>();
  for (const row of rows) {
    // :4415 — escaped NUL separator (source form '\u0000', never a raw
    // byte): coin names contain spaces, NUL is collision-proof
    const key = String(row.exchange ?? '') + '\u0000' + String(row.coin ?? '');
    let group = byKey.get(key);
    if (!group) {
      group = {
        exchange: String(row.exchange ?? ''),
        coin: String(row.coin ?? ''),
        days: 0,
        oldest: String(row.day ?? ''),
        latest: String(row.day ?? ''),
        missing: 0,
        reasons: Object.create(null) as Record<string, number>,
      };
      byKey.set(key, group);
      groups.push(group);
    }
    const day = String(row.day ?? '');
    group.days += 1;
    group.missing += numberOf(row.missing_minutes);
    if (day && (!group.oldest || day < group.oldest)) group.oldest = day;
    if (day && (!group.latest || day > group.latest)) group.latest = day;
    const reason = String(row.error ?? 'unknown integrity error'); // :4435
    group.reasons[reason] = numberOf(group.reasons[reason]) + 1;
  }
  return groups;
}

export interface IntegritySummaryInputs {
  meta: { statusKey: string; label: string };
  counts: Record<string, unknown> | null | undefined;
  scanComplete: boolean;
  comparisonCounts: Record<string, unknown> | null | undefined;
  referenceMeta: { selected_repository?: unknown; matches_selected?: unknown };
}

/** The five header summary cards (:4331-4351). canRepair is hardcoded true
 *  in legacy (:4298) — the read-only branches are dead and stay unported. */
export function buildIntegritySummaryCards(
  inputs: IntegritySummaryInputs,
  t: TranslateFn
): SummaryCard[] {
  const counts = inputs.counts ?? {};
  const comparison = inputs.comparisonCounts ?? null;
  const noteSuffix =
    inputs.meta.statusKey === 'hyperliquid' ? t('market.cryptoOnlySuffix') : ''; // :4337
  return [
    {
      label: t('market.scan'),
      value: inputs.scanComplete ? t('market.complete') : t('market.pending'),
      note: t('market.dailyCatalog', { exchange: inputs.meta.label }) + noteSuffix,
    },
    {
      label: t('market.validDays'),
      value: numberOf(counts.valid) + numberOf(counts.inception_partial), // :4339
      note: t('market.canonicalChecksums'),
    },
    {
      label: t('market.sourceGaps'),
      value: numberOf(counts.source_gap),
      note: t('market.verifiedUnavailableMinutes'),
    },
    {
      label: t('market.damagedDays'),
      value: numberOf(counts.invalid),
      note: t('market.repairableRows'), // canRepair (:4341)
    },
    {
      label: t('market.reference'),
      value: comparison
        ? numberOf(comparison.mismatch) + numberOf(comparison.reference_only) // :4347
        : t('market.notCompared'),
      note: comparison
        ? t('market.mismatchesOrMissing')
        : inputs.referenceMeta.selected_repository && !inputs.referenceMeta.matches_selected
          ? t('market.refreshRequiredArchive') // :4350
          : t('market.choosePublicArchive'),
    },
  ];
}

/** The five gap-modal summary cards (:4669-4673). */
export function buildGapSummaryCards(payload: GapDayDetailsPayload, t: TranslateFn): SummaryCard[] {
  return [
    {
      label: t('market.candles'),
      value: numberOf(payload.actual_candles),
      note: t('market.of1440Expected'),
    },
    {
      label: t('market.absent'),
      value: numberOf(payload.missing_minutes),
      note: t('market.allEmptyMinutes'),
    },
    {
      label: t('market.damaged'),
      value: numberOf(payload.damaged_missing_minutes),
      note: t('market.excludingInception'),
    },
    {
      label: t('market.coverage'),
      value: `${String(payload.first ?? 'none')} to ${String(payload.last ?? 'none')}`,
      note: t('market.firstToLastCandle'),
    },
    {
      label: t('market.reason'),
      value: String(payload.error ?? payload.status ?? ''),
      note: payload.earliest_local_day
        ? t('market.earliestLocalDay')
        : t('market.establishedHistory'),
    },
  ];
}

/** The surrounding-days strip (:4675-4704). */
export function buildGapDayContext(payload: GapDayDetailsPayload, t: TranslateFn): GapContextDay[] {
  const context = Array.isArray(payload.day_context) ? payload.day_context : [];
  return context.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const hourlyCoverage = String(item.hourly_coverage ?? '');
    const hours = Array.from({ length: 24 }, (_unused, hour) => {
      const marker = hourlyCoverage.charAt(hour) || 'm'; // :4690
      const cls = marker === 'x' ? 'partial' : marker === 'm' ? 'missing' : '';
      const label =
        marker === 'p'
          ? t('market.completeMarker')
          : marker === 'x'
            ? t('market.partial')
            : t('market.missingLower');
      return { cls, title: `${pad2(hour)}:00 UTC - ${label}` };
    });
    return {
      day: String(item.day ?? ''),
      selected: Boolean(item.selected),
      disabled: String(item.status ?? '') === 'missing', // :4681
      title: String(item.error ?? item.status ?? ''), // :4683
      hours,
      candles: t('market.candlesCount', { count: String(numberOf(item.candles)) }), // :4698
      status: String(item.error ?? item.status ?? ''), // :4701
    };
  });
}

/** The 24×60 minute-coverage grid (:4706-4727). */
export function buildGapChart(coverage: unknown, t: TranslateFn): GapChartRow[] {
  const markers = String(coverage ?? '');
  const classByMarker: Record<string, string> = {
    l: 'leading',
    i: 'internal',
    t: 'trailing',
    m: 'missing-day',
  }; // :4709
  const labelByMarker: Record<string, string> = {
    p: t('market.present'),
    l: t('market.leadingGap'),
    i: t('market.internalGap'),
    t: t('market.trailingGap'),
    m: t('market.missingDay'),
  }; // :4710
  return Array.from({ length: 24 }, (_unused, hour) => ({
    label: `${pad2(hour)}:00`,
    cells: Array.from({ length: 60 }, (_unused2, minute) => {
      const marker = markers.charAt(hour * 60 + minute) || 'm'; // :4720
      const cls = classByMarker[marker] ?? '';
      const label = labelByMarker[marker] ?? t('common.unknown'); // :4723
      return { cls, title: `${pad2(hour)}:${pad2(minute)} UTC - ${label}` };
    }),
  }));
}

/** The missing-ranges table (:4729-4752). */
export function buildGapRanges(payload: GapDayDetailsPayload, t: TranslateFn): GapRangeRow[] {
  const ranges = Array.isArray(payload.ranges) ? payload.ranges : [];
  if (!ranges.length) {
    return [{ kind: '', start: '', end: '', minutes: '', assessment: t('market.noMissingRanges'), empty: true }];
  }
  return ranges.map((raw) => {
    const range = (raw ?? {}) as Record<string, unknown>;
    const assessment = range.possible_inception
      ? t('market.possibleInception')
      : range.kind === 'internal'
        ? t('market.realInterruption')
        : t('market.missingBoundary'); // :4743-4745
    return {
      kind: String(range.kind ?? ''),
      start: `${String(range.start ?? '')} UTC`,
      end: `${String(range.end ?? '')} UTC`,
      minutes: (range.minutes ?? '') as string | number,
      assessment,
    };
  });
}
