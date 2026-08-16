import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import {
  buildGapChart,
  buildGapDayContext,
  buildGapRanges,
  buildGapSummaryCards,
  type GapChartRow,
  type GapContextDay,
  type GapDayDetailsPayload,
  type GapRangeRow,
  type IntegrityIssueRow,
  type SummaryCard,
} from '../lib/integrityView';
import type { IntegrityApi, IntegrityFeedback } from './useIntegrityShared';
import type { TranslateFn } from './useSettings';

/*
 * The OHLCV gap-details modal controller — legacy integrityDetailState
 * (market_data_main.html:3733-3738) with its action core:
 *
 *   openIntegrityGapDetails  :4781-4804  days from the issues rows, sorted,
 *                              latest preselected, modal opens, first load
 *   loadIntegrityGapDay      :4755-4779  day payload + appended context-day
 *                              option (:4765-4771), stale guards (requestId
 *                              + modal still open :4764)
 *   closeIntegrityGapDetails :4653-4656  requestId bump + hide
 *
 * Render models (summary cards, surrounding days, 24×60 grid, ranges) come
 * from lib/integrityView. Split out of useIntegrity.ts to keep both under
 * the 800-line cap (the useTradfiActions precedent).
 */

export interface ArchiveOptionLike {
  value: string;
  label: string;
}

export interface IntegrityGapDetailsController {
  gapOpen: Ref<boolean>;
  gapSubtitle: Ref<string>;
  gapDayOptions: ComputedRef<readonly ArchiveOptionLike[]>;
  gapSelectedDay: Ref<string>;
  gapFeedback: Ref<IntegrityFeedback>;
  gapSummaryCards: ComputedRef<readonly SummaryCard[]>;
  gapDayContext: ComputedRef<readonly GapContextDay[]>;
  gapChart: ComputedRef<readonly GapChartRow[]>;
  gapRanges: ComputedRef<readonly GapRangeRow[]>;
  openGapDetails(exchange: string, coin: string): void;
  loadGapDay(day: string): Promise<void>;
  closeGapDetails(): void;
}

export interface UseIntegrityGapDetailsOptions {
  api: IntegrityApi;
  t: TranslateFn;
  /** The loaded issues rows — the modal's day list source (:4782-4786). */
  issues: Ref<readonly IntegrityIssueRow[]>;
}

export function useIntegrityGapDetails(
  options: UseIntegrityGapDetailsOptions
): IntegrityGapDetailsController {
  const { api, t, issues } = options;

  /* integrityDetailState (:3733-3738) */
  const gapOpen = ref(false);
  const gapSubtitle = ref('');
  const gapDays = ref<readonly string[]>([]);
  const gapContextDays = ref<readonly string[]>([]);
  const gapSelectedDay = ref('');
  const gapPayload = ref<GapDayDetailsPayload | null>(null);
  const gapFeedback = ref<IntegrityFeedback>({ message: '', level: 'info' });
  let gapRequestId = 0;
  let gapExchange = '';
  let gapCoin = '';

  function messageOr(error: unknown, fallback: string): string {
    const message = error instanceof Error && error.message ? serverMsg(error.message) : '';
    return message || fallback;
  }

  const gapDayOptions = computed<readonly ArchiveOptionLike[]>(() => {
    const days = new Set(gapDays.value);
    const all = [...gapDays.value, ...gapContextDays.value.filter((day) => !days.has(day))];
    return all.map((day) => ({
      value: day,
      label: days.has(day) ? day : `${day}${t('market.contextSuffix')}`, // :4769
    }));
  });

  const gapSummaryCards = computed<readonly SummaryCard[]>(() =>
    gapPayload.value ? buildGapSummaryCards(gapPayload.value, t) : []
  );
  const gapDayContext = computed<readonly GapContextDay[]>(() =>
    gapPayload.value ? buildGapDayContext(gapPayload.value, t) : []
  );
  const gapChart = computed<readonly GapChartRow[]>(() =>
    gapPayload.value ? buildGapChart(gapPayload.value.coverage, t) : []
  );
  const gapRanges = computed<readonly GapRangeRow[]>(() =>
    gapPayload.value ? buildGapRanges(gapPayload.value, t) : []
  );

  /** openIntegrityGapDetails (:4781-4804). */
  function openGapDetails(exchangeName: string, coin: string): void {
    const days = issues.value
      .filter(
        (row) => String(row.exchange ?? '') === exchangeName && String(row.coin ?? '') === coin
      )
      .map((row) => String(row.day ?? ''))
      .filter(Boolean)
      .sort(); // :4782-4786
    if (!days.length) return; // :4787
    gapExchange = exchangeName;
    gapCoin = coin;
    gapDays.value = days;
    gapContextDays.value = [];
    gapSubtitle.value = `${exchangeName} / ${coin}`; // :4791
    gapSelectedDay.value = days[days.length - 1] ?? ''; // :4800
    gapPayload.value = null;
    gapFeedback.value = { message: '', level: 'info' };
    gapOpen.value = true; // :4801
    void loadGapDay(gapSelectedDay.value); // :4803
  }

  /** loadIntegrityGapDay (:4755-4779). */
  async function loadGapDay(day: string): Promise<void> {
    gapRequestId += 1;
    const id = gapRequestId;
    gapFeedback.value = { message: t('market.loadingMinuteCoverage'), level: 'info' }; // :4757
    try {
      const payload = await api.fetchJson<GapDayDetailsPayload>(
        `/integrity/day-details?exchange=${encodeURIComponent(gapExchange)}` +
          `&coin=${encodeURIComponent(gapCoin)}&day=${encodeURIComponent(day)}`
      ); // :4759-4763
      if (id !== gapRequestId || !gapOpen.value) return; // :4764
      const payloadDay = String(payload.day ?? '');
      if (payloadDay && !gapDayOptions.value.some((option) => option.value === payloadDay)) {
        gapContextDays.value = [...gapContextDays.value, payloadDay]; // :4766-4771
      }
      gapSelectedDay.value = payloadDay; // :4772
      gapPayload.value = payload; // :4773
      gapFeedback.value = { message: '', level: 'info' }; // :4774
    } catch (error) {
      if (id !== gapRequestId) return;
      gapFeedback.value = { message: messageOr(error, t('market.unableMinuteCoverage')), level: 'error' }; // :4777
    }
  }

  /** closeIntegrityGapDetails (:4653-4656). */
  function closeGapDetails(): void {
    gapRequestId += 1;
    gapOpen.value = false;
  }

  return {
    gapOpen,
    gapSubtitle,
    gapDayOptions,
    gapSelectedDay,
    gapFeedback,
    gapSummaryCards,
    gapDayContext,
    gapChart,
    gapRanges,
    openGapDetails,
    loadGapDay,
    closeGapDetails,
  };
}
