/*
 * M-data-7 — copy-data request + schedule pure logic (legacy
 * market_data_main.html :5038-5254):
 *
 *   exchange checkbox registry :3443-3447 (order + checked defaults verbatim)
 *   collectCopyDataRequest     :5046-5053
 *   validateCopyDataRequest    :5055-5060
 *   copyDataScheduleTime       :5089-5093
 *   schedule row model         :5103-5123
 *   interval guard             :5189-5191
 *   save request assembly      :5197-5201
 */

import type { TranslateFn } from '../composables/useSettings';

/** One copy-data exchange checkbox (DOM :3443-3447) — checked default verbatim. */
export const COPY_DATA_EXCHANGES: readonly { key: string; label: string; checked: boolean }[] = [
  { key: 'binance', label: 'Binance USDM', checked: true },
  { key: 'bybit', label: 'Bybit', checked: true },
  { key: 'bitget', label: 'Bitget', checked: true },
  { key: 'okx', label: 'OKX', checked: false },
  { key: 'hyperliquid', label: 'Hyperliquid', checked: false },
];

/** The wire shape of collectCopyDataRequest (:5046-5053). */
export interface CopyDataRequest {
  target: string;
  ssh_command: string;
  destination_root: string;
  exchanges: string[];
}

export interface CopyDataFormState {
  target: string;
  sshCommand: string;
  destinationRoot: string;
  selectedExchanges: readonly string[];
}

/** Legacy collectCopyDataRequest (:5046-5053) — ssh falls back to 'ssh'. */
export function buildCopyDataRequest(form: CopyDataFormState): CopyDataRequest {
  return {
    target: form.target,
    ssh_command: form.sshCommand || 'ssh',
    destination_root: form.destinationRoot,
    exchanges: [...form.selectedExchanges],
  };
}

/** Legacy validateCopyDataRequest (:5055-5060) — '' means valid. */
export function validateCopyDataRequest(
  request: CopyDataRequest,
  options: { t: TranslateFn; requireExchanges?: boolean }
): string {
  const requireExchanges = options.requireExchanges !== false; // :5056
  if (!request.target) return options.t('market.remoteTargetRequired');
  if (requireExchanges && !request.exchanges.length) return options.t('market.selectExchangeToCopy');
  return '';
}

/** Legacy copyDataScheduleTime (:5089-5093) — invalid → notScheduled. */
export function copyDataScheduleTime(
  value: unknown,
  options: { t: TranslateFn; formatTime?: (date: Date) => string }
): string {
  if (!value) return options.t('market.notScheduled');
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? options.t('market.notScheduled')
    : (options.formatTime ?? ((d: Date) => d.toLocaleString()))(date);
}

/** Legacy interval guard (:5189-5191) — integer hours within [1, 168]. */
export function isInvalidScheduleInterval(intervalHours: number): boolean {
  return !Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168;
}

/** One /copy-data/schedules row (server shape). */
export interface CopyScheduleRow {
  id?: unknown;
  name?: unknown;
  enabled?: unknown;
  interval_hours?: unknown;
  exchanges?: unknown;
  target?: unknown;
  destination_root?: unknown;
  ssh_command?: unknown;
  next_run?: unknown;
  last_run?: unknown;
  last_job_id?: unknown;
  last_error?: unknown;
  updated_at?: unknown;
  [key: string]: unknown;
}

/** The rendered schedule row model (:5103-5123). */
export interface ScheduleRowView {
  id: string;
  name: string;
  enabled: boolean;
  timing: string;
  last: string;
  error: string;
  targetRoot: string;
  exchanges: string;
}

export function computeScheduleRowView(
  schedule: CopyScheduleRow,
  options: { t: TranslateFn; formatTime?: (date: Date) => string }
): ScheduleRowView {
  const t = options.t;
  const enabled = Boolean(schedule.enabled);
  const exchanges = Array.isArray(schedule.exchanges) ? schedule.exchanges.join(', ') : '';
  const time = (value: unknown): string => copyDataScheduleTime(value, options);
  const timing = enabled
    ? t('market.everyIntervalNext', {
        hours: String(schedule.interval_hours ?? ''),
        next: time(schedule.next_run),
      })
    : t('common.disabled');
  const last = schedule.last_run
    ? t('market.lastQueued', { time: time(schedule.last_run) }) +
      (schedule.last_job_id ? t('market.jobSuffix', { id: String(schedule.last_job_id) }) : '')
    : t('market.notRunYet');
  return {
    id: String(schedule.id ?? ''),
    name: String(schedule.name ?? ''),
    enabled,
    timing,
    last,
    error: schedule.last_error
      ? `${t('market.errorColon')}${String(schedule.last_error)}`
      : '',
    targetRoot: `${String(schedule.target ?? '')}:${String(schedule.destination_root ?? '')}`,
    exchanges,
  };
}

/** The editor snapshot merged into the save request (:5197-5201). */
export interface ScheduleEditorState {
  id: string;
  expectedUpdatedAt: string;
  name: string;
  intervalHours: number;
  enabled: boolean;
}

/** Legacy save-request assembly (:5197-5201) — form + editor fields. */
export function buildScheduleSaveRequest(
  request: CopyDataRequest,
  editor: ScheduleEditorState
): CopyDataRequest & ScheduleEditorWireFields {
  return {
    ...request,
    id: editor.id,
    expected_updated_at: editor.expectedUpdatedAt,
    name: editor.name,
    interval_hours: editor.intervalHours,
    enabled: editor.enabled,
  };
}

export interface ScheduleEditorWireFields {
  id: string;
  expected_updated_at: string;
  name: string;
  interval_hours: number;
  enabled: boolean;
}
