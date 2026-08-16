/**
 * The queued-job success message — the port of showQueuedMsg
 * (hl_data_actions.html :1595-1611) as structured parts. The legacy function
 * built DOM nodes (strong/br/small, no innerHTML — the test_v7_config_sync
 * XSS contract); the Vue page renders these parts through interpolation, so
 * no markup string is ever assembled.
 */

import type { QueueReply, SectionNs } from '../types';
import { fmtDay } from './jobsFormat';

export interface QueuedMessageParts {
  /** market.queuedJobPrefix, e.g. "Queued job ". */
  prefix: string;
  /** The job id — rendered bold. */
  jobId: string;
  /** coins count + optional range/refetch suffix. */
  suffix: string;
  /** Optional dl warning line about coins skipped from the archive. */
  missingCoins: string[];
}

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

export function buildQueuedMessageParts(ns: SectionNs, data: QueueReply, t: TranslateFn): QueuedMessageParts {
  let suffix = t('market.coinsCountSuffix', { count: String(data.coins_count || 0) });
  if (ns === 'dl') {
    suffix += ', ' + fmtDay(data.start_day) + ' → ' + fmtDay(data.end_day); // :1600
  } else if (data.start_day) {
    suffix += ', ' + fmtDay(data.start_day) + ' → ' + fmtDay(data.end_day); // :1601
  } else {
    suffix += t('market.endDaySuffix', { date: fmtDay(data.end_day) }); // :1602
  }
  if (data.refetch) suffix += t('market.refetchSuffix'); // :1603
  return {
    prefix: t('market.queuedJobPrefix'),
    jobId: String(data.job_id || ''),
    suffix,
    missingCoins: ns === 'dl' && data.missing_coins?.length ? data.missing_coins : [], // :1605-1609
  };
}
